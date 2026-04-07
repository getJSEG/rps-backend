const pool = require('../config/database');

async function listActive() {
  const r = await pool.query(
    `SELECT *
     FROM store_pickup_addresses
     WHERE is_active = true
     ORDER BY label ASC, id ASC`
  );
  return r.rows;
}

async function listAllAdmin() {
  const r = await pool.query(
    `SELECT *
     FROM store_pickup_addresses
     ORDER BY is_active DESC, label ASC, id ASC`
  );
  return r.rows;
}

async function findById(id) {
  const r = await pool.query('SELECT * FROM store_pickup_addresses WHERE id = $1', [id]);
  return r.rows[0] ?? null;
}

async function createAddress({
  label,
  street_address,
  address_line2 = null,
  city,
  state,
  postcode,
  country = 'United States',
  is_active = true,
}) {
  const r = await pool.query(
    `INSERT INTO store_pickup_addresses
      (label, street_address, address_line2, city, state, postcode, country, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [label, street_address, address_line2, city, state, postcode, country, is_active]
  );
  return r.rows[0];
}

async function updateAddress(id, data) {
  const existing = await findById(id);
  if (!existing) return null;
  const next = {
    label: data.label ?? existing.label,
    street_address: data.street_address ?? existing.street_address,
    address_line2: data.address_line2 ?? existing.address_line2,
    city: data.city ?? existing.city,
    state: data.state ?? existing.state,
    postcode: data.postcode ?? existing.postcode,
    country: data.country ?? existing.country,
    is_active: data.is_active ?? existing.is_active,
  };
  const r = await pool.query(
    `UPDATE store_pickup_addresses
     SET label = $1,
         street_address = $2,
         address_line2 = $3,
         city = $4,
         state = $5,
         postcode = $6,
         country = $7,
         is_active = $8,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $9
     RETURNING *`,
    [
      next.label,
      next.street_address,
      next.address_line2,
      next.city,
      next.state,
      next.postcode,
      next.country,
      next.is_active,
      id,
    ]
  );
  return r.rows[0] ?? null;
}

async function deleteAddress(id) {
  const r = await pool.query(
    `UPDATE store_pickup_addresses
     SET is_active = false,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id`,
    [id]
  );
  return r.rows[0]?.id ?? null;
}

module.exports = {
  listActive,
  listAllAdmin,
  findById,
  createAddress,
  updateAddress,
  deleteAddress,
};
