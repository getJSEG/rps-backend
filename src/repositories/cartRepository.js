const pool = require('../config/database');

const SQL = {
  INSERT_ITEM: `INSERT INTO cart_items (user_id, guest_session_id, item_data) VALUES ($1, $2, $3::jsonb) RETURNING *`,
  SELECT_ALL_FOR_ADMIN: `SELECT ci.*, u.email as user_email, u.full_name as user_name
           FROM cart_items ci
           LEFT JOIN users u ON ci.user_id = u.id
           ORDER BY ci.created_at DESC`,
  SELECT_ORDER_USER_PRODUCT_PAIRS: `SELECT DISTINCT o.user_id, oi.product_id
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.user_id IS NOT NULL AND oi.product_id IS NOT NULL`,
  SELECT_BY_USER_ID: `SELECT * FROM cart_items WHERE user_id = $1 ORDER BY created_at DESC`,
  SELECT_BY_GUEST_SESSION: `SELECT * FROM cart_items WHERE guest_session_id = $1 ORDER BY created_at DESC`,
  DELETE_BY_ID_ADMIN: 'DELETE FROM cart_items WHERE id = $1',
  DELETE_BY_ID_AND_USER: 'DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id',
  DELETE_BY_ID_AND_GUEST: 'DELETE FROM cart_items WHERE id = $1 AND guest_session_id = $2 RETURNING id',
  UPDATE_BY_ID_ADMIN: `UPDATE cart_items SET item_data = $1::jsonb WHERE id = $2 RETURNING *`,
  UPDATE_BY_ID_AND_USER: `UPDATE cart_items SET item_data = $1::jsonb WHERE id = $2 AND user_id = $3 RETURNING *`,
  UPDATE_BY_ID_AND_GUEST: `UPDATE cart_items SET item_data = $1::jsonb WHERE id = $2 AND guest_session_id = $3 RETURNING *`,
  CLEAR_BY_USER_ID: 'DELETE FROM cart_items WHERE user_id = $1',
  CLEAR_BY_GUEST_SESSION: 'DELETE FROM cart_items WHERE guest_session_id = $1',
};

const ORDER_PAIR_SEP = '_';

function mapRowToCartItem(row) {
  return {
    id: String(row.id),
    ...row.item_data,
    createdAt: row.created_at,
  };
}

function mapRowToAdminCartItem(row) {
  return {
    id: String(row.id),
    userId: row.user_id,
    userEmail: row.user_email,
    userName: row.user_name,
    ...row.item_data,
    createdAt: row.created_at,
  };
}

/**
 * @param {number|null} userId
 * @param {string|null} guestSessionId
 * @param {object} itemData
 */
async function insertCartItem(userId, guestSessionId, itemData) {
  const result = await pool.query(SQL.INSERT_ITEM, [
    userId,
    guestSessionId,
    JSON.stringify(itemData),
  ]);
  return result.rows[0];
}

/** Admin: all cart rows joined with user, filtered by ordered user+product pairs */
async function findAdminCartItems() {
  const [cartResult, orderPairsResult] = await Promise.all([
    pool.query(SQL.SELECT_ALL_FOR_ADMIN),
    pool.query(SQL.SELECT_ORDER_USER_PRODUCT_PAIRS),
  ]);
  const orderPairSet = new Set(
    orderPairsResult.rows.map((row) => `${row.user_id}${ORDER_PAIR_SEP}${row.product_id}`)
  );
  return cartResult.rows
    .map(mapRowToAdminCartItem)
    .filter((item) => {
      const productId = item.productId ?? item.product_id;
      const pid = productId != null ? String(productId) : null;
      if (!pid || item.userId == null) return true;
      const key = `${item.userId}${ORDER_PAIR_SEP}${pid}`;
      return !orderPairSet.has(key);
    });
}

/**
 * @param {number} userId
 */
async function findCartItemsByUserId(userId) {
  const result = await pool.query(SQL.SELECT_BY_USER_ID, [userId]);
  return result.rows.map(mapRowToCartItem);
}

/**
 * @param {string} guestSessionId
 */
async function findCartItemsByGuestSession(guestSessionId) {
  const result = await pool.query(SQL.SELECT_BY_GUEST_SESSION, [guestSessionId]);
  return result.rows.map(mapRowToCartItem);
}

async function deleteCartItemById(cartItemId) {
  await pool.query(SQL.DELETE_BY_ID_ADMIN, [cartItemId]);
}

/**
 * @returns {number} rowCount
 */
async function deleteCartItemByUser(cartItemId, userId) {
  const r = await pool.query(SQL.DELETE_BY_ID_AND_USER, [cartItemId, userId]);
  return r.rowCount;
}

/**
 * @returns {number} rowCount
 */
async function deleteCartItemByGuest(cartItemId, guestSessionId) {
  const r = await pool.query(SQL.DELETE_BY_ID_AND_GUEST, [cartItemId, guestSessionId]);
  return r.rowCount;
}

/**
 * @returns {{ rowCount: number, row?: object }}
 */
async function updateCartItemDataAdmin(cartItemId, itemData) {
  const r = await pool.query(SQL.UPDATE_BY_ID_ADMIN, [JSON.stringify(itemData), cartItemId]);
  return { rowCount: r.rowCount, row: r.rows[0] };
}

/**
 * @returns {{ rowCount: number, row?: object }}
 */
async function updateCartItemDataByUser(cartItemId, userId, itemData) {
  const r = await pool.query(SQL.UPDATE_BY_ID_AND_USER, [
    JSON.stringify(itemData),
    cartItemId,
    userId,
  ]);
  return { rowCount: r.rowCount, row: r.rows[0] };
}

/**
 * @returns {{ rowCount: number, row?: object }}
 */
async function updateCartItemDataByGuest(cartItemId, guestSessionId, itemData) {
  const r = await pool.query(SQL.UPDATE_BY_ID_AND_GUEST, [
    JSON.stringify(itemData),
    cartItemId,
    guestSessionId,
  ]);
  return { rowCount: r.rowCount, row: r.rows[0] };
}

async function clearCartByUserId(userId) {
  await pool.query(SQL.CLEAR_BY_USER_ID, [userId]);
}

async function clearCartByGuestSession(guestSessionId) {
  await pool.query(SQL.CLEAR_BY_GUEST_SESSION, [guestSessionId]);
}

module.exports = {
  insertCartItem,
  findAdminCartItems,
  findCartItemsByUserId,
  findCartItemsByGuestSession,
  deleteCartItemById,
  deleteCartItemByUser,
  deleteCartItemByGuest,
  updateCartItemDataAdmin,
  updateCartItemDataByUser,
  updateCartItemDataByGuest,
  clearCartByUserId,
  clearCartByGuestSession,
};
