const pool = require('../config/database');

function dateOnly(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function todayDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isExpired(expiresOn) {
  const day = dateOnly(expiresOn);
  if (!day) return false;
  return day < todayDate();
}

function mapCoupon(row) {
  if (!row) return null;
  const expiresOn = dateOnly(row.expires_on);
  const expired = isExpired(expiresOn);
  return {
    id: Number(row.id),
    code: String(row.code || ''),
    discountType: String(row.discount_type || ''),
    discountValue: Number(row.discount_value),
    isActive: row.is_active !== false && !expired,
    expiresOn,
    expired,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLS = `id, code, discount_type, discount_value, is_active, expires_on, created_at, updated_at`;

async function deactivateExpired() {
  await pool.query(
    `UPDATE coupons
     SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE is_active = TRUE
       AND expires_on IS NOT NULL
       AND expires_on < CURRENT_DATE`
  );
}

async function listAll() {
  await deactivateExpired();
  const r = await pool.query(
    `SELECT ${SELECT_COLS}
     FROM coupons
     ORDER BY created_at DESC, id DESC`
  );
  return r.rows.map(mapCoupon);
}

async function findById(id) {
  await deactivateExpired();
  const r = await pool.query(`SELECT ${SELECT_COLS} FROM coupons WHERE id = $1`, [id]);
  return mapCoupon(r.rows[0]);
}

async function findByCode(code) {
  await deactivateExpired();
  const r = await pool.query(
    `SELECT ${SELECT_COLS}
     FROM coupons WHERE LOWER(code) = LOWER($1)
     LIMIT 1`,
    [code]
  );
  return mapCoupon(r.rows[0]);
}

async function findActiveByCode(code) {
  const coupon = await findByCode(code);
  if (!coupon || !coupon.isActive || coupon.expired) return null;
  return coupon;
}

async function create({ code, discountType, discountValue, isActive = true, expiresOn = null }) {
  const expires = dateOnly(expiresOn);
  const active = isActive !== false && !isExpired(expires);
  const r = await pool.query(
    `INSERT INTO coupons (code, discount_type, discount_value, is_active, expires_on)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${SELECT_COLS}`,
    [code, discountType, discountValue, active, expires]
  );
  return mapCoupon(r.rows[0]);
}

async function update(id, payload) {
  const current = await findById(id);
  if (!current) return null;
  const code = payload.code !== undefined ? payload.code : current.code;
  const discountType = payload.discountType !== undefined ? payload.discountType : current.discountType;
  const discountValue = payload.discountValue !== undefined ? payload.discountValue : current.discountValue;
  const expiresOn =
    payload.expiresOn !== undefined ? dateOnly(payload.expiresOn) : dateOnly(current.expiresOn);
  let isActive = payload.isActive !== undefined ? !!payload.isActive : current.isActive;
  if (isExpired(expiresOn)) isActive = false;
  const r = await pool.query(
    `UPDATE coupons
     SET code = $2,
         discount_type = $3,
         discount_value = $4,
         is_active = $5,
         expires_on = $6,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING ${SELECT_COLS}`,
    [id, code, discountType, discountValue, isActive, expiresOn]
  );
  return mapCoupon(r.rows[0]);
}

async function remove(id) {
  const r = await pool.query(`DELETE FROM coupons WHERE id = $1 RETURNING id`, [id]);
  return r.rowCount > 0;
}

module.exports = {
  dateOnly,
  isExpired,
  listAll,
  findById,
  findByCode,
  findActiveByCode,
  create,
  update,
  remove,
};
