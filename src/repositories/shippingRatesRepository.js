const pool = require('../config/database');

const DEFAULTS = {
  ground: 120.07,
  express: 0,
  overnight: 0,
  freeShippingEnabled: false,
  freeShippingThreshold: 0,
};
const DEFAULT_METHODS = [
  { name: 'Ground', price: 120.07 },
  { name: 'Express', price: 0 },
  { name: 'Overnight', price: 0 },
];

async function getRates() {
  const r = await pool.query(
    `SELECT ground, express, overnight,
            COALESCE(free_shipping_enabled, FALSE) AS free_shipping_enabled,
            COALESCE(free_shipping_threshold, 0) AS free_shipping_threshold
     FROM shipping_rates WHERE id = 1`
  );
  if (r.rows.length === 0) return { ...DEFAULTS };
  const row = r.rows[0];
  return {
    ground: Number(row.ground) || 0,
    express: Number(row.express) || 0,
    overnight: Number(row.overnight) || 0,
    freeShippingEnabled: !!row.free_shipping_enabled,
    freeShippingThreshold: Math.max(0, Number(row.free_shipping_threshold) || 0),
  };
}

async function updateRates({ ground, express, overnight, freeShippingEnabled, freeShippingThreshold }) {
  const cur = await getRates();
  const fEnabled = freeShippingEnabled !== undefined ? !!freeShippingEnabled : cur.freeShippingEnabled;
  let fThreshold = freeShippingThreshold !== undefined ? Number(freeShippingThreshold) : cur.freeShippingThreshold;
  if (!Number.isFinite(fThreshold) || fThreshold < 0) fThreshold = 0;

  await pool.query(
    `INSERT INTO shipping_rates (id, ground, express, overnight, free_shipping_enabled, free_shipping_threshold, updated_at)
     VALUES (1, $1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       ground = EXCLUDED.ground,
       express = EXCLUDED.express,
       overnight = EXCLUDED.overnight,
       free_shipping_enabled = EXCLUDED.free_shipping_enabled,
       free_shipping_threshold = EXCLUDED.free_shipping_threshold,
       updated_at = CURRENT_TIMESTAMP`,
    [ground, express, overnight, fEnabled, fThreshold]
  );
  return getRates();
}

async function ensureDefaultMethods() {
  const r = await pool.query('SELECT COUNT(*)::int AS count FROM shipping_rate_options');
  if (Number(r.rows?.[0]?.count || 0) > 0) return;
  for (let i = 0; i < DEFAULT_METHODS.length; i += 1) {
    const m = DEFAULT_METHODS[i];
    await pool.query(
      `INSERT INTO shipping_rate_options (name, price, is_active, sort_order)
       VALUES ($1, $2, TRUE, $3)`,
      [m.name, m.price, i + 1]
    );
  }
}

async function getAllMethods({ includeInactive = false } = {}) {
  await ensureDefaultMethods();
  const sql = includeInactive
    ? `SELECT id, name, price, is_active, sort_order
       FROM shipping_rate_options
       ORDER BY sort_order ASC, id ASC`
    : `SELECT id, name, price, is_active, sort_order
       FROM shipping_rate_options
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, id ASC`;
  const r = await pool.query(sql);
  return r.rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name || ''),
    price: Number(row.price) || 0,
    is_active: !!row.is_active,
    sort_order: Number(row.sort_order) || 0,
  }));
}

async function createMethod({ name, price, isActive = true }) {
  const orderResult = await pool.query(
    'SELECT COALESCE(MAX(sort_order), 0)::int AS max_sort_order FROM shipping_rate_options'
  );
  const sortOrder = Number(orderResult.rows?.[0]?.max_sort_order || 0) + 1;
  const r = await pool.query(
    `INSERT INTO shipping_rate_options (name, price, is_active, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, price, is_active, sort_order`,
    [name, price, isActive, sortOrder]
  );
  const row = r.rows[0];
  return {
    id: Number(row.id),
    name: String(row.name || ''),
    price: Number(row.price) || 0,
    is_active: !!row.is_active,
    sort_order: Number(row.sort_order) || 0,
  };
}

async function updateMethod(id, { name, price, isActive }) {
  const updates = [];
  const params = [];
  let idx = 1;
  if (name !== undefined) {
    updates.push(`name = $${idx++}`);
    params.push(name);
  }
  if (price !== undefined) {
    updates.push(`price = $${idx++}`);
    params.push(price);
  }
  if (isActive !== undefined) {
    updates.push(`is_active = $${idx++}`);
    params.push(!!isActive);
  }
  if (updates.length === 0) return null;
  params.push(Number(id));
  const r = await pool.query(
    `UPDATE shipping_rate_options
     SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${idx}
     RETURNING id, name, price, is_active, sort_order`,
    params
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    id: Number(row.id),
    name: String(row.name || ''),
    price: Number(row.price) || 0,
    is_active: !!row.is_active,
    sort_order: Number(row.sort_order) || 0,
  };
}

async function deleteMethod(id) {
  const r = await pool.query('DELETE FROM shipping_rate_options WHERE id = $1 RETURNING id', [id]);
  return r.rows.length > 0;
}

async function findPriceByServiceName(serviceName) {
  const name = String(serviceName || '').trim();
  if (!name) return 0;
  const r = await pool.query(
    `SELECT price
     FROM shipping_rate_options
     WHERE is_active = TRUE AND LOWER(name) = LOWER($1)
     ORDER BY sort_order ASC, id ASC
     LIMIT 1`,
    [name]
  );
  if (r.rows.length > 0) return Number(r.rows[0].price) || 0;
  const legacy = await getRates();
  const s = name.toLowerCase();
  if (s === 'ground') return Number(legacy.ground) || 0;
  if (s === 'express') return Number(legacy.express) || 0;
  if (s === 'overnight') return Number(legacy.overnight) || 0;
  return 0;
}

module.exports = {
  getRates,
  updateRates,
  DEFAULTS,
  getAllMethods,
  createMethod,
  updateMethod,
  deleteMethod,
  findPriceByServiceName,
};
