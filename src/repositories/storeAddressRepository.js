const pool = require('../config/database');

async function listAllAdmin() {
  const r = await pool.query(
    `SELECT *
     FROM store_addresses
     ORDER BY is_default DESC, is_active DESC, label ASC, id ASC`
  );
  return r.rows;
}

async function findById(id) {
  const r = await pool.query('SELECT * FROM store_addresses WHERE id = $1', [id]);
  return r.rows[0] ?? null;
}

async function findDefault() {
  const r = await pool.query(
    `SELECT *
     FROM store_addresses
     WHERE is_default = true AND is_active = true
     ORDER BY updated_at DESC NULLS LAST, id DESC
     LIMIT 1`
  );
  return r.rows[0] ?? null;
}

async function createAddress(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const defaultResult = await client.query('SELECT id FROM store_addresses WHERE is_default = true LIMIT 1');
    const shouldSetDefault = !!data.is_default || defaultResult.rowCount === 0;
    if (shouldSetDefault) {
      await client.query('UPDATE store_addresses SET is_default = false WHERE is_default = true');
    }
    const r = await client.query(
      `INSERT INTO store_addresses
        (label, company, contact_name, phone, street_address, address_line2, city, state, postcode, country, is_default, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        data.label,
        data.company ?? null,
        data.contact_name ?? null,
        data.phone ?? null,
        data.street_address,
        data.address_line2 ?? null,
        data.city,
        data.state,
        data.postcode,
        data.country ?? 'United States',
        shouldSetDefault,
        shouldSetDefault ? true : data.is_active !== false,
      ]
    );
    await client.query('COMMIT');
    return r.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateAddress(id, data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existingResult = await client.query('SELECT * FROM store_addresses WHERE id = $1 FOR UPDATE', [id]);
    const existing = existingResult.rows[0];
    if (!existing) {
      await client.query('ROLLBACK');
      return null;
    }
    const next = {
      label: data.label ?? existing.label,
      company: data.company ?? existing.company,
      contact_name: data.contact_name ?? existing.contact_name,
      phone: data.phone ?? existing.phone,
      street_address: data.street_address ?? existing.street_address,
      address_line2: data.address_line2 ?? existing.address_line2,
      city: data.city ?? existing.city,
      state: data.state ?? existing.state,
      postcode: data.postcode ?? existing.postcode,
      country: data.country ?? existing.country,
      is_default: data.is_default ?? existing.is_default,
      is_active: data.is_active ?? existing.is_active,
    };

    if (next.is_default) {
      next.is_active = true;
      await client.query('UPDATE store_addresses SET is_default = false WHERE id != $1', [id]);
    }

    const r = await client.query(
      `UPDATE store_addresses
       SET label = $1,
           company = $2,
           contact_name = $3,
           phone = $4,
           street_address = $5,
           address_line2 = $6,
           city = $7,
           state = $8,
           postcode = $9,
           country = $10,
           is_default = $11,
           is_active = $12,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $13
       RETURNING *`,
      [
        next.label,
        next.company,
        next.contact_name,
        next.phone,
        next.street_address,
        next.address_line2,
        next.city,
        next.state,
        next.postcode,
        next.country,
        next.is_default,
        next.is_active,
        id,
      ]
    );
    await client.query('COMMIT');
    return r.rows[0] ?? null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function setDefault(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query('SELECT id FROM store_addresses WHERE id = $1', [id]);
    if (!check.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query('UPDATE store_addresses SET is_default = false WHERE is_default = true');
    const r = await client.query(
      `UPDATE store_addresses
       SET is_default = true, is_active = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    await client.query('COMMIT');
    return r.rows[0] ?? null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function archiveAddress(id) {
  const r = await pool.query(
    `UPDATE store_addresses
     SET is_active = false,
         is_default = false,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id`,
    [id]
  );
  return r.rows[0]?.id ?? null;
}

module.exports = {
  listAllAdmin,
  findById,
  findDefault,
  createAddress,
  updateAddress,
  setDefault,
  archiveAddress,
};
