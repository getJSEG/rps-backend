const pool = require('../config/database');

const DEFAULTS = {
  ground: 120.07,
  express: 0,
  overnight: 0,
  freeShippingEnabled: false,
  freeShippingThreshold: 0,
  tierDiscounts: { economy: 0, standard: 0, express: 0 },
};

/** Clamp a shipping discount to 0–100 %. */
function discountPercent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

async function getRates() {
  const r = await pool.query(
    `SELECT ground, express, overnight,
            COALESCE(free_shipping_enabled, FALSE) AS free_shipping_enabled,
            COALESCE(free_shipping_threshold, 0) AS free_shipping_threshold,
            COALESCE(economy_discount_percent, 0) AS economy_discount_percent,
            COALESCE(standard_discount_percent, 0) AS standard_discount_percent,
            COALESCE(express_discount_percent, 0) AS express_discount_percent
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
    tierDiscounts: {
      economy: discountPercent(row.economy_discount_percent),
      standard: discountPercent(row.standard_discount_percent),
      express: discountPercent(row.express_discount_percent),
    },
  };
}

async function updateRates({ ground, express, overnight, freeShippingEnabled, freeShippingThreshold, tierDiscounts }) {
  const cur = await getRates();
  const discounts = { ...cur.tierDiscounts, ...(tierDiscounts || {}) };
  const fEnabled = freeShippingEnabled !== undefined ? !!freeShippingEnabled : cur.freeShippingEnabled;
  let fThreshold = freeShippingThreshold !== undefined ? Number(freeShippingThreshold) : cur.freeShippingThreshold;
  if (!Number.isFinite(fThreshold) || fThreshold < 0) fThreshold = 0;

  await pool.query(
    `INSERT INTO shipping_rates (id, ground, express, overnight, free_shipping_enabled, free_shipping_threshold,
       economy_discount_percent, standard_discount_percent, express_discount_percent, updated_at)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       ground = EXCLUDED.ground,
       express = EXCLUDED.express,
       overnight = EXCLUDED.overnight,
       free_shipping_enabled = EXCLUDED.free_shipping_enabled,
       free_shipping_threshold = EXCLUDED.free_shipping_threshold,
       economy_discount_percent = EXCLUDED.economy_discount_percent,
       standard_discount_percent = EXCLUDED.standard_discount_percent,
       express_discount_percent = EXCLUDED.express_discount_percent,
       updated_at = CURRENT_TIMESTAMP`,
    [
      ground,
      express,
      overnight,
      fEnabled,
      fThreshold,
      discountPercent(discounts.economy),
      discountPercent(discounts.standard),
      discountPercent(discounts.express),
    ]
  );
  return getRates();
}

module.exports = {
  getRates,
  updateRates,
  DEFAULTS,
};
