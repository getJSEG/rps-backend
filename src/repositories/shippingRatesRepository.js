const pool = require('../config/database');

const DEFAULTS = { ground: 120.07, express: 0, overnight: 0 };

async function getRates() {
  const r = await pool.query('SELECT ground, express, overnight FROM shipping_rates WHERE id = 1');
  if (r.rows.length === 0) return { ...DEFAULTS };
  const row = r.rows[0];
  return {
    ground: Number(row.ground) || 0,
    express: Number(row.express) || 0,
    overnight: Number(row.overnight) || 0,
  };
}

async function updateRates({ ground, express, overnight }) {
  await pool.query(
    `INSERT INTO shipping_rates (id, ground, express, overnight, updated_at)
     VALUES (1, $1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       ground = EXCLUDED.ground,
       express = EXCLUDED.express,
       overnight = EXCLUDED.overnight,
       updated_at = CURRENT_TIMESTAMP`,
    [ground, express, overnight]
  );
  return getRates();
}

module.exports = { getRates, updateRates, DEFAULTS };
