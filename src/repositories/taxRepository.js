const pool = require('../config/database');

function mapTaxRow(row) {
  return {
    id: Number(row.id),
    name: String(row.name || ''),
    percentage: Number(row.percentage) || 0,
    is_active: !!row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getAllTaxes() {
  const r = await pool.query(
    `SELECT id, name, percentage, is_active, created_at, updated_at
     FROM taxes
     ORDER BY created_at DESC, id DESC`
  );
  return r.rows.map(mapTaxRow);
}

async function getActiveTax() {
  const r = await pool.query(
    `SELECT id, name, percentage, is_active, created_at, updated_at
     FROM taxes
     WHERE is_active = TRUE
     ORDER BY id DESC
     LIMIT 1`
  );
  return r.rows[0] ? mapTaxRow(r.rows[0]) : null;
}

async function createTax({ name, percentage, isActive = false }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (isActive) {
      await client.query('UPDATE taxes SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE is_active = TRUE');
    }
    const r = await client.query(
      `INSERT INTO taxes (name, percentage, is_active)
       VALUES ($1, $2, $3)
       RETURNING id, name, percentage, is_active, created_at, updated_at`,
      [name, percentage, !!isActive]
    );
    await client.query('COMMIT');
    return mapTaxRow(r.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function updateTax(id, { name, percentage, isActive }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (isActive === true) {
      await client.query('UPDATE taxes SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE is_active = TRUE');
    }
    const updates = [];
    const params = [];
    let idx = 1;
    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      params.push(name);
    }
    if (percentage !== undefined) {
      updates.push(`percentage = $${idx++}`);
      params.push(percentage);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${idx++}`);
      params.push(!!isActive);
    }
    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    params.push(Number(id));
    const r = await client.query(
      `UPDATE taxes
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idx}
       RETURNING id, name, percentage, is_active, created_at, updated_at`,
      params
    );
    await client.query('COMMIT');
    return r.rows[0] ? mapTaxRow(r.rows[0]) : null;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function deleteTax(id) {
  const r = await pool.query('DELETE FROM taxes WHERE id = $1 RETURNING id', [id]);
  return r.rowCount > 0;
}

async function activateTax(id) {
  return updateTax(id, { isActive: true });
}

module.exports = {
  getAllTaxes,
  getActiveTax,
  createTax,
  updateTax,
  deleteTax,
  activateTax,
};
