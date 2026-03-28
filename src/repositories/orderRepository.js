const pool = require('../config/database');

const SQL = {
  INSERT_ORDER_FULL: `INSERT INTO orders (user_id, order_number, total_amount, shipping_address_id, 
         billing_address_id, payment_method, notes, guest_checkout)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
  INSERT_ORDER_ITEM_WITH_JOB: `INSERT INTO order_items (order_id, product_id, product_name, job_name, quantity, unit_price, total_price, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
  SELECT_ORDER_WITH_ITEMS_AGG: `SELECT o.*, 
         json_agg(json_build_object(
           'id', oi.id,
           'product_id', oi.product_id,
           'product_name', oi.product_name,
           'quantity', oi.quantity,
           'unit_price', oi.unit_price,
           'total_price', oi.total_price
         )) as items
         FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE o.id = $1
         GROUP BY o.id`,
  ORDERS_FOR_USER_WITH_STATUS: `SELECT o.*, 
      MAX(sa.street_address) as shipping_street_address,
      MAX(sa.address_line2) as shipping_address_line2,
      MAX(sa.city) as shipping_city,
      MAX(sa.state) as shipping_state,
      MAX(sa.postcode) as shipping_postcode,
      MAX(sa.country) as shipping_country,
      MAX(ba.street_address) as billing_street_address,
      MAX(ba.address_line2) as billing_address_line2,
      MAX(ba.city) as billing_city,
      MAX(ba.state) as billing_state,
      MAX(ba.postcode) as billing_postcode,
      MAX(ba.country) as billing_country,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'job_name', oi.job_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'image_url', COALESCE(oi.image_url, p.image_url)
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'::json
      ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
      LEFT JOIN addresses ba ON o.billing_address_id = ba.id
      WHERE o.user_id = $1 AND o.status = $2
      GROUP BY o.id ORDER BY o.created_at DESC LIMIT $3 OFFSET $4`,
  ORDERS_FOR_USER: `SELECT o.*, 
      MAX(sa.street_address) as shipping_street_address,
      MAX(sa.address_line2) as shipping_address_line2,
      MAX(sa.city) as shipping_city,
      MAX(sa.state) as shipping_state,
      MAX(sa.postcode) as shipping_postcode,
      MAX(sa.country) as shipping_country,
      MAX(ba.street_address) as billing_street_address,
      MAX(ba.address_line2) as billing_address_line2,
      MAX(ba.city) as billing_city,
      MAX(ba.state) as billing_state,
      MAX(ba.postcode) as billing_postcode,
      MAX(ba.country) as billing_country,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'job_name', oi.job_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'image_url', COALESCE(oi.image_url, p.image_url)
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'::json
      ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
      LEFT JOIN addresses ba ON o.billing_address_id = ba.id
      WHERE o.user_id = $1
      GROUP BY o.id ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
  ORDER_BY_ID_AND_USER: `SELECT o.*, 
       MAX(sa.street_address) as shipping_street_address,
       MAX(sa.address_line2) as shipping_address_line2,
       MAX(sa.city) as shipping_city,
       MAX(sa.state) as shipping_state,
       MAX(sa.postcode) as shipping_postcode,
       MAX(sa.country) as shipping_country,
       MAX(ba.street_address) as billing_street_address,
       MAX(ba.address_line2) as billing_address_line2,
       MAX(ba.city) as billing_city,
       MAX(ba.state) as billing_state,
       MAX(ba.postcode) as billing_postcode,
       MAX(ba.country) as billing_country,
       COALESCE(
         json_agg(
           json_build_object(
             'id', oi.id,
             'product_id', oi.product_id,
             'product_name', oi.product_name,
             'job_name', oi.job_name,
             'quantity', oi.quantity,
             'unit_price', oi.unit_price,
             'total_price', oi.total_price,
             'image_url', COALESCE(oi.image_url, p.image_url)
           )
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'::json
       ) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
       LEFT JOIN addresses ba ON o.billing_address_id = ba.id
       WHERE o.id = $1 AND o.user_id = $2
       GROUP BY o.id`,
  ALL_ORDERS_ADMIN_WITH_STATUS: `SELECT o.*, 
      u.email as user_email,
      u.full_name as user_name,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'product_image', COALESCE(oi.image_url, p.image_url)
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'::json
      ) as items
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE 1=1 AND o.status = $1
      GROUP BY o.id, u.email, u.full_name ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
  ALL_ORDERS_ADMIN: `SELECT o.*, 
      u.email as user_email,
      u.full_name as user_name,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'product_image', COALESCE(oi.image_url, p.image_url)
          )
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'::json
      ) as items
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE 1=1
      GROUP BY o.id, u.email, u.full_name ORDER BY o.created_at DESC LIMIT $1 OFFSET $2`,
  ORDER_ADMIN_DETAIL_WITH_JOB: `SELECT o.*, 
       u.email as user_email,
       u.full_name as user_name,
       MAX(sa.street_address) as shipping_street_address,
       MAX(sa.address_line2) as shipping_address_line2,
       MAX(sa.city) as shipping_city,
       MAX(sa.state) as shipping_state,
       MAX(sa.postcode) as shipping_postcode,
       MAX(sa.country) as shipping_country,
       MAX(ba.street_address) as billing_street_address,
       MAX(ba.address_line2) as billing_address_line2,
       MAX(ba.city) as billing_city,
       MAX(ba.state) as billing_state,
       MAX(ba.postcode) as billing_postcode,
       MAX(ba.country) as billing_country,
       COALESCE(
         json_agg(
           json_build_object(
             'id', oi.id,
             'product_id', oi.product_id,
             'product_name', oi.product_name,
             'job_name', oi.job_name,
             'quantity', oi.quantity,
             'unit_price', oi.unit_price,
             'total_price', oi.total_price,
             'product_image', COALESCE(oi.image_url, p.image_url),
             'product_material', p.material,
             'product_description', p.description,
             'product_price_per_sqft', p.price_per_sqft,
             'product_min_charge', p.min_charge,
             'product_category', c.name,
             'product_subcategory', p.subcategory,
             'product_sku', p.sku
           )
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'::json
       ) as items
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
       LEFT JOIN addresses ba ON o.billing_address_id = ba.id
       WHERE o.id = $1
       GROUP BY o.id, u.email, u.full_name`,
  ORDER_ADMIN_DETAIL_NO_JOB: `SELECT o.*, 
       u.email as user_email,
       u.full_name as user_name,
       MAX(sa.street_address) as shipping_street_address,
       MAX(sa.address_line2) as shipping_address_line2,
       MAX(sa.city) as shipping_city,
       MAX(sa.state) as shipping_state,
       MAX(sa.postcode) as shipping_postcode,
       MAX(sa.country) as shipping_country,
       MAX(ba.street_address) as billing_street_address,
       MAX(ba.address_line2) as billing_address_line2,
       MAX(ba.city) as billing_city,
       MAX(ba.state) as billing_state,
       MAX(ba.postcode) as billing_postcode,
       MAX(ba.country) as billing_country,
       COALESCE(
         json_agg(
           json_build_object(
             'id', oi.id,
             'product_id', oi.product_id,
             'product_name', oi.product_name,
             'quantity', oi.quantity,
             'unit_price', oi.unit_price,
             'total_price', oi.total_price,
             'product_image', COALESCE(oi.image_url, p.image_url),
             'product_material', p.material,
             'product_description', p.description,
             'product_price_per_sqft', p.price_per_sqft,
             'product_min_charge', p.min_charge,
             'product_category', c.name,
             'product_subcategory', p.subcategory,
             'product_sku', p.sku
           )
         ) FILTER (WHERE oi.id IS NOT NULL),
         '[]'::json
       ) as items
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
       LEFT JOIN addresses ba ON o.billing_address_id = ba.id
       WHERE o.id = $1
       GROUP BY o.id, u.email, u.full_name`,
  UPDATE_ORDER_STATUS: `UPDATE orders 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
  DELETE_ORDER: 'DELETE FROM orders WHERE id = $1 RETURNING id',
  PRODUCT_EXISTS: 'SELECT id FROM products WHERE id = $1',
  INSERT_ORDER_ADMIN_CART: `INSERT INTO orders (user_id, order_number, total_amount, status, payment_method, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
  INSERT_ORDER_ITEM_ADMIN_WITH_JOB: `INSERT INTO order_items (order_id, product_id, product_name, job_name, quantity, unit_price, total_price, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
  INSERT_ORDER_ITEM_ADMIN_NO_JOB: `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  SELECT_ORDER_BY_ID: `SELECT o.* FROM orders o WHERE o.id = $1`,
  INSERT_ORDER_STRIPE_PENDING: `INSERT INTO orders (user_id, order_number, total_amount, status, payment_method, payment_status, notes, guest_checkout, shipping_address_id, billing_address_id, shipping_method, shipping_charge)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, order_number`,
  UPDATE_ORDER_STRIPE_PAID: `UPDATE orders SET payment_status = $1, status = $2, notes = COALESCE(notes, '') || ' | Paid via Stripe ' || $3 WHERE id = $4`,
  UPDATE_ORDER_PAID_WITHOUT_STRIPE: `UPDATE orders SET payment_status = $1, status = $2, payment_method = $3, notes = COALESCE(notes, '') || $4 WHERE id = $5`,
};

function itemImageUrlFromBody(item) {
  return item.image_url || item.product_image || item.productImage || null;
}

/**
 * @param {object} params
 * @param {number|null} params.userId
 * @param {string} params.orderNumber
 * @param {number} params.totalAmount
 * @param {number|null} params.shippingAddressId
 * @param {number|null} params.billingAddressId
 * @param {string} params.paymentMethod
 * @param {string} [params.notes]
 * @param {object|null} params.guestCheckout
 * @param {Array} params.items - raw body items with product_id, product_name, job_name, quantity, unit_price
 */
async function createOrderWithItems({
  userId,
  orderNumber,
  totalAmount,
  shippingAddressId,
  billingAddressId,
  paymentMethod,
  notes,
  guestCheckout,
  items,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(SQL.INSERT_ORDER_FULL, [
      userId,
      orderNumber,
      totalAmount,
      shippingAddressId,
      billingAddressId,
      paymentMethod,
      notes,
      guestCheckout,
    ]);
    const order = orderResult.rows[0];
    for (const item of items) {
      await client.query(SQL.INSERT_ORDER_ITEM_WITH_JOB, [
        order.id,
        item.product_id,
        item.product_name,
        item.job_name || item.jobName || null,
        item.quantity,
        item.unit_price,
        parseFloat(item.unit_price) * parseInt(item.quantity),
        itemImageUrlFromBody(item),
      ]);
    }
    await client.query('COMMIT');
    const completeOrder = await pool.query(SQL.SELECT_ORDER_WITH_ITEMS_AGG, [order.id]);
    return completeOrder.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * @param {number} userId
 * @param {{ status?: string, page?: number, limit?: number }} opts
 */
function normalizeUserOrderRows(rows) {
  return rows.map((order) => {
    const o = { ...order };
    if (!o.items || !Array.isArray(o.items)) {
      o.items = [];
    } else {
      o.items = o.items.filter((item) => item && item.id !== null);
    }
    return o;
  });
}

async function findOrdersForUser(userId, opts = {}) {
  const page = Number(opts.page) || 1;
  const limit = Number(opts.limit) || 20;
  const offset = (page - 1) * limit;
  if (opts.status) {
    const result = await pool.query(SQL.ORDERS_FOR_USER_WITH_STATUS, [
      userId,
      opts.status,
      limit,
      offset,
    ]);
    return normalizeUserOrderRows(result.rows);
  }
  const result = await pool.query(SQL.ORDERS_FOR_USER, [userId, limit, offset]);
  return normalizeUserOrderRows(result.rows);
}

/**
 * @returns {Promise<object|null>}
 */
async function findOrderByIdAndUserId(orderId, userId) {
  const result = await pool.query(SQL.ORDER_BY_ID_AND_USER, [orderId, userId]);
  const row = result.rows[0];
  if (!row) return null;
  const [normalized] = normalizeUserOrderRows([row]);
  return normalized;
}

function normalizeAdminListOrders(rows) {
  return rows.map((order) => {
    const o = { ...order };
    if (!o.items || !Array.isArray(o.items)) {
      o.items = [];
    } else {
      o.items = o.items.filter((item) => item && item.id !== null);
    }
    return o;
  });
}

/**
 * @param {{ status?: string, page?: number, limit?: number }} opts
 */
async function findAllOrdersAdmin(opts = {}) {
  const page = Number(opts.page) || 1;
  const limit = Number(opts.limit) || 1000;
  const offset = (page - 1) * limit;
  let result;
  if (opts.status) {
    result = await pool.query(SQL.ALL_ORDERS_ADMIN_WITH_STATUS, [opts.status, limit, offset]);
  } else {
    result = await pool.query(SQL.ALL_ORDERS_ADMIN, [limit, offset]);
  }
  return normalizeAdminListOrders(result.rows);
}

/**
 * @returns {Promise<object|null>}
 */
async function findOrderByIdAdmin(orderId) {
  let result;
  try {
    result = await pool.query(SQL.ORDER_ADMIN_DETAIL_WITH_JOB, [orderId]);
  } catch (err) {
    if (err.message && err.message.includes('job_name')) {
      result = await pool.query(SQL.ORDER_ADMIN_DETAIL_NO_JOB, [orderId]);
    } else {
      throw err;
    }
  }
  if (result.rows.length === 0) return null;
  const order = result.rows[0];
  if (!order.items || !Array.isArray(order.items)) {
    order.items = [];
  } else {
    order.items = order.items.filter((item) => item && item.id !== null);
    order.items.forEach((item) => {
      if (item && item.job_name === undefined) item.job_name = item.product_name || null;
    });
  }
  order.id = parseInt(order.id, 10);
  return order;
}

/**
 * @returns {Promise<object|null>}
 */
async function updateOrderStatusById(orderId, statusLower) {
  const result = await pool.query(SQL.UPDATE_ORDER_STATUS, [statusLower, orderId]);
  return result.rows[0] ?? null;
}

/**
 * @returns {Promise<number|null>} deleted id or null
 */
async function deleteOrderById(orderId) {
  const result = await pool.query(SQL.DELETE_ORDER, [orderId]);
  return result.rows.length > 0 ? result.rows[0].id : null;
}

/**
 * @returns {Promise<boolean>}
 */
async function productExists(productId) {
  const r = await pool.query(SQL.PRODUCT_EXISTS, [productId]);
  return r.rows.length > 0;
}

function generateOrderNumber() {
  return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

async function insertAdminCartOrderAndItem(client, useJobName, params) {
  const {
    userId,
    totalAmount,
    orderStatus,
    productId,
    productName,
    jobName,
    quantity,
    unitPrice,
    totalPrice,
    itemImageUrl,
  } = params;
  const ordNum = generateOrderNumber();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(SQL.INSERT_ORDER_ADMIN_CART, [
      userId,
      ordNum,
      totalAmount,
      orderStatus,
      'admin_cart',
      'Created from cart by admin',
    ]);
    const order = orderResult.rows[0];
    if (useJobName) {
      await client.query(SQL.INSERT_ORDER_ITEM_ADMIN_WITH_JOB, [
        order.id,
        productId,
        productName,
        jobName,
        quantity,
        unitPrice,
        totalPrice,
        itemImageUrl,
      ]);
    } else {
      await client.query(SQL.INSERT_ORDER_ITEM_ADMIN_NO_JOB, [
        order.id,
        productId,
        productName,
        quantity,
        unitPrice,
        totalPrice,
        itemImageUrl,
      ]);
    }
    await client.query('COMMIT');
    return order;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  }
}

/**
 * @returns {Promise<object>} order row (minimal)
 */
async function createOrderFromCartItemAdmin(params) {
  const client = await pool.connect();
  try {
    let order;
    try {
      order = await insertAdminCartOrderAndItem(client, true, params);
    } catch (firstErr) {
      const isJobNameError =
        firstErr.message &&
        (firstErr.message.includes('job_name') ||
          firstErr.message.includes('current transaction is aborted'));
      if (isJobNameError) {
        order = await insertAdminCartOrderAndItem(client, false, params);
      } else {
        throw firstErr;
      }
    }
    const fullOrder = await pool.query(SQL.SELECT_ORDER_BY_ID, [order.id]);
    return fullOrder.rows[0];
  } catch (err) {
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {object} params
 * @param {number|null} params.userId
 * @param {string} params.orderNumber
 * @param {number} params.totalAmount
 * @param {object|null} params.guestCheckout
 * @param {Array<{product_id, product_name, job_name, quantity, unit_price, total_price, image_url}>} params.orderItems
 * @returns {Promise<{ orderId: number, orderNumber: string }>}
 */
async function verifyAddressBelongsToUser(userId, addressId) {
  if (userId == null || addressId == null) return false;
  const r = await pool.query('SELECT id FROM addresses WHERE id = $1 AND user_id = $2', [
    addressId,
    userId,
  ]);
  return r.rows.length > 0;
}

async function getOrderUserId(orderId) {
  const r = await pool.query('SELECT user_id FROM orders WHERE id = $1', [orderId]);
  return r.rows[0]?.user_id ?? null;
}

async function createPendingStripeOrderWithItems({
  userId,
  orderNumber,
  totalAmount,
  guestCheckout,
  orderItems,
  shippingAddressId = null,
  billingAddressId = null,
  shippingMethod = null,
  shippingCharge = 0,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(SQL.INSERT_ORDER_STRIPE_PENDING, [
      userId,
      orderNumber,
      totalAmount,
      'pending_payment',
      'stripe',
      'pending',
      'Checkout via Stripe',
      guestCheckout,
      shippingAddressId,
      billingAddressId,
      shippingMethod,
      shippingCharge,
    ]);
    const order = orderResult.rows[0];
    const orderId = order.id;
    for (const oi of orderItems) {
      await client.query(SQL.INSERT_ORDER_ITEM_WITH_JOB, [
        orderId,
        oi.product_id,
        oi.product_name,
        oi.job_name,
        oi.quantity,
        oi.unit_price,
        oi.total_price,
        oi.image_url,
      ]);
    }
    await client.query('COMMIT');
    return { orderId, orderNumber: order.order_number };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function markOrderPaidFromStripe(orderId, paidAtIso) {
  await pool.query(SQL.UPDATE_ORDER_STRIPE_PAID, ['paid', 'processing', paidAtIso, orderId]);
}

async function markOrderPaidWithoutStripe(orderId) {
  const suffix = ` | Completed without Stripe (STRIPE_PAYMENT_ENABLED=false) ${new Date().toISOString()}`;
  await pool.query(SQL.UPDATE_ORDER_PAID_WITHOUT_STRIPE, ['paid', 'processing', 'manual', suffix, orderId]);
}

module.exports = {
  createOrderWithItems,
  findOrdersForUser,
  findOrderByIdAndUserId,
  findAllOrdersAdmin,
  findOrderByIdAdmin,
  updateOrderStatusById,
  deleteOrderById,
  productExists,
  createOrderFromCartItemAdmin,
  createPendingStripeOrderWithItems,
  markOrderPaidFromStripe,
  markOrderPaidWithoutStripe,
  verifyAddressBelongsToUser,
  getOrderUserId,
};
