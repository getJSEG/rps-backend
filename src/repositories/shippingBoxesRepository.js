const pool = require('../config/database');

function mapBox(row) {
  return {
    id: Number(row.id),
    name: String(row.name || ''),
    length: Number(row.length) || 0,
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getAll({ includeInactive = false } = {}) {
  const sql = includeInactive
    ? `SELECT * FROM shipping_boxes ORDER BY name ASC, id ASC`
    : `SELECT * FROM shipping_boxes WHERE is_active = TRUE ORDER BY name ASC, id ASC`;
  const result = await pool.query(sql);
  return result.rows.map(mapBox);
}

async function create({ name, length, width, height, isActive = true }) {
  const result = await pool.query(
    `INSERT INTO shipping_boxes (name, length, width, height, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, length, width, height, isActive]
  );
  return mapBox(result.rows[0]);
}

async function update(id, { name, length, width, height, isActive }) {
  const updates = [];
  const params = [];
  let idx = 1;
  if (name !== undefined) {
    updates.push(`name = $${idx++}`);
    params.push(name);
  }
  if (length !== undefined) {
    updates.push(`length = $${idx++}`);
    params.push(length);
  }
  if (width !== undefined) {
    updates.push(`width = $${idx++}`);
    params.push(width);
  }
  if (height !== undefined) {
    updates.push(`height = $${idx++}`);
    params.push(height);
  }
  if (isActive !== undefined) {
    updates.push(`is_active = $${idx++}`);
    params.push(!!isActive);
  }
  if (updates.length === 0) return null;
  params.push(Number(id));
  const result = await pool.query(
    `UPDATE shipping_boxes
     SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${idx}
     RETURNING *`,
    params
  );
  return result.rows.length ? mapBox(result.rows[0]) : null;
}

async function remove(id) {
  const result = await pool.query('DELETE FROM shipping_boxes WHERE id = $1 RETURNING id', [id]);
  return result.rows.length > 0;
}

module.exports = {
  getAll,
  create,
  update,
  remove,
};
