const pool = require('../config/database');

function mapCategory(row) {
  return {
    id: Number(row.id),
    name: String(row.name || ''),
    sortOrder: Number(row.sort_order) || 0,
    isActive: row.is_active !== false,
  };
}

function mapFaq(row) {
  return {
    id: Number(row.id),
    categoryId: Number(row.category_id),
    question: String(row.question || ''),
    answer: String(row.answer || ''),
    sortOrder: Number(row.sort_order) || 0,
    isActive: row.is_active !== false,
  };
}

/** Categories in display order, each with its FAQs. `activeOnly` hides inactive categories and questions. */
async function listCategoriesWithFaqs({ activeOnly = false } = {}) {
  const activeFilter = activeOnly ? 'WHERE is_active = TRUE' : '';
  const [cats, faqs] = await Promise.all([
    pool.query(`SELECT * FROM help_categories ${activeFilter} ORDER BY sort_order ASC, id ASC`),
    pool.query(`SELECT * FROM help_faqs ${activeFilter} ORDER BY sort_order ASC, id ASC`),
  ]);
  const byCategory = new Map();
  for (const row of faqs.rows) {
    const faq = mapFaq(row);
    if (!byCategory.has(faq.categoryId)) byCategory.set(faq.categoryId, []);
    byCategory.get(faq.categoryId).push(faq);
  }
  return cats.rows.map((row) => {
    const category = mapCategory(row);
    return { ...category, faqs: byCategory.get(category.id) || [] };
  });
}

async function nextSortOrder(table, whereSql = '', params = []) {
  const r = await pool.query(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM ${table} ${whereSql}`, params);
  return Number(r.rows[0].next) || 0;
}

async function createCategory({ name, isActive = true }) {
  const sortOrder = await nextSortOrder('help_categories');
  const r = await pool.query(
    `INSERT INTO help_categories (name, sort_order, is_active) VALUES ($1, $2, $3) RETURNING *`,
    [name, sortOrder, isActive !== false]
  );
  return mapCategory(r.rows[0]);
}

async function updateCategory(id, { name, isActive }) {
  const r = await pool.query(
    `UPDATE help_categories
     SET name = COALESCE($2, name),
         is_active = COALESCE($3, is_active),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, name ?? null, isActive ?? null]
  );
  return r.rows[0] ? mapCategory(r.rows[0]) : null;
}

/** Deleting a category also deletes its FAQs (ON DELETE CASCADE). */
async function deleteCategory(id) {
  const r = await pool.query('DELETE FROM help_categories WHERE id = $1 RETURNING id', [id]);
  return r.rows.length > 0;
}

async function categoryExists(id) {
  const r = await pool.query('SELECT 1 FROM help_categories WHERE id = $1', [id]);
  return r.rows.length > 0;
}

async function createFaq({ categoryId, question, answer, isActive = true }) {
  const sortOrder = await nextSortOrder('help_faqs', 'WHERE category_id = $1', [categoryId]);
  const r = await pool.query(
    `INSERT INTO help_faqs (category_id, question, answer, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [categoryId, question, answer, sortOrder, isActive !== false]
  );
  return mapFaq(r.rows[0]);
}

async function updateFaq(id, { categoryId, question, answer, isActive }) {
  const r = await pool.query(
    `UPDATE help_faqs
     SET category_id = COALESCE($2, category_id),
         question = COALESCE($3, question),
         answer = COALESCE($4, answer),
         is_active = COALESCE($5, is_active),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id, categoryId ?? null, question ?? null, answer ?? null, isActive ?? null]
  );
  return r.rows[0] ? mapFaq(r.rows[0]) : null;
}

async function deleteFaq(id) {
  const r = await pool.query('DELETE FROM help_faqs WHERE id = $1 RETURNING id', [id]);
  return r.rows.length > 0;
}

/** Save a new order: `ids[i]` gets sort_order i. Ids outside the table/category are ignored. */
async function reorder(table, ids, { categoryId = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < ids.length; i += 1) {
      if (categoryId != null) {
        await client.query(`UPDATE ${table} SET sort_order = $2 WHERE id = $1 AND category_id = $3`, [
          ids[i],
          i,
          categoryId,
        ]);
      } else {
        await client.query(`UPDATE ${table} SET sort_order = $2 WHERE id = $1`, [ids[i], i]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listCategoriesWithFaqs,
  createCategory,
  updateCategory,
  deleteCategory,
  categoryExists,
  createFaq,
  updateFaq,
  deleteFaq,
  reorderCategories: (ids) => reorder('help_categories', ids),
  reorderFaqs: (categoryId, ids) => reorder('help_faqs', ids, { categoryId }),
};
