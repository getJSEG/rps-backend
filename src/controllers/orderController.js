const pool = require('../config/database');
const Stripe = require('stripe');
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const createOrder = async (req, res) => {
  try {
    const { items, shippingAddressId, billingAddressId, paymentMethod, notes } = req.body;
    const userId = req.user.id;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Order items are required' });
    }

    // Calculate total
    let totalAmount = 0;
    for (const item of items) {
      totalAmount += parseFloat(item.unit_price) * parseInt(item.quantity);
    }

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create order
      const orderResult = await client.query(
        `INSERT INTO orders (user_id, order_number, total_amount, shipping_address_id, 
         billing_address_id, payment_method, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [userId, orderNumber, totalAmount, shippingAddressId, billingAddressId || shippingAddressId, paymentMethod, notes]
      );

      const order = orderResult.rows[0];

      // Create order items (image_url = product image at time of order, from cart)
      const itemImageUrl = (item) => item.image_url || item.product_image || item.productImage || null;
      for (const item of items) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, job_name, quantity, unit_price, total_price, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            order.id,
            item.product_id,
            item.product_name,
            item.job_name || item.jobName || null,
            item.quantity,
            item.unit_price,
            parseFloat(item.unit_price) * parseInt(item.quantity),
            itemImageUrl(item)
          ]
        );
      }

      await client.query('COMMIT');

      // Fetch complete order with items
      const completeOrder = await pool.query(
        `SELECT o.*, 
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
        [order.id]
      );

      res.status(201).json({ order: completeOrder.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: 'Failed to create order', error: error.message });
  }
};

const getOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT o.*, 
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
      WHERE o.user_id = $1
    `;
    const params = [userId];

    if (status) {
      query += ' AND o.status = $2';
      params.push(status);
      query += ` GROUP BY o.id ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
    } else {
      query += ` GROUP BY o.id ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
    }

    const result = await pool.query(query, params);

    res.json({ orders: result.rows });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Failed to fetch orders', error: error.message });
  }
};

const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT o.*, 
       json_agg(json_build_object(
         'id', oi.id,
         'product_id', oi.product_id,
         'product_name', oi.product_name,
         'quantity', oi.quantity,
         'unit_price', oi.unit_price,
         'total_price', oi.total_price,
         'product_image', COALESCE(oi.image_url, p.image_url)
       )) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE o.id = $1 AND o.user_id = $2
       GROUP BY o.id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ order: result.rows[0] });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Failed to fetch order', error: error.message });
  }
};

const getAllOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 1000 } = req.query; // Increased limit to show all orders
    const offset = (page - 1) * limit;

    let query = `
      SELECT o.*, 
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
    `;
    const params = [];

    if (status) {
      query += ' AND o.status = $1';
      params.push(status);
      query += ` GROUP BY o.id, u.email, u.full_name ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
    } else {
      query += ` GROUP BY o.id, u.email, u.full_name ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
    }

    const result = await pool.query(query, params);

    // Ensure items is always an array
    const orders = result.rows.map(order => {
      if (!order.items || !Array.isArray(order.items)) {
        order.items = [];
      }
      // Filter out null items
      order.items = order.items.filter(item => item && item.id !== null);
      return order;
    });
    res.json({ orders });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({ message: 'Failed to fetch orders', error: error.message });
  }
};

const getOrderByIdAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const queryWithJobName = `SELECT o.*, 
       u.email as user_email,
       u.full_name as user_name,
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
       WHERE o.id = $1
       GROUP BY o.id, u.email, u.full_name`;

    const queryWithoutJobName = `SELECT o.*, 
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
       WHERE o.id = $1
       GROUP BY o.id, u.email, u.full_name`;

    let result;
    try {
      result = await pool.query(queryWithJobName, [id]);
    } catch (err) {
      if (err.message && err.message.includes('job_name')) {
        result = await pool.query(queryWithoutJobName, [id]);
      } else {
        throw err;
      }
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const order = result.rows[0];
    
    // Ensure items is always an array
    if (!order.items || !Array.isArray(order.items)) {
      order.items = [];
    }
    
    // Filter out null items and ensure all product details are included
    order.items = order.items.filter(item => item && item.id !== null);
    // If we used query without job_name, set job_name from product_name for each item
    order.items.forEach(item => {
      if (item && item.job_name === undefined) item.job_name = item.product_name || null;
    });
    
    // Ensure order.id is a number (PostgreSQL returns it as integer)
    order.id = parseInt(order.id);
    res.json({ order });
  } catch (error) {
    console.error('Get order by id admin error:', error);
    res.status(500).json({ message: 'Failed to fetch order', error: error.message });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'complete', 'refund', 'approval_needed'];
    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const result = await pool.query(
      `UPDATE orders 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [status.toLowerCase(), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ order: result.rows[0] });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Failed to update order status', error: error.message });
  }
};

/** Admin: delete one order (and its items via cascade) */
const deleteOrderAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json({ message: 'Order deleted', id: result.rows[0].id });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ message: 'Failed to delete order', error: error.message });
  }
};

/** Admin: create one order from a cart item with chosen status; order appears in admin list */
const createOrderFromCartItem = async (req, res) => {
  try {
    const { cartItem, status } = req.body;
    const userId = req.user?.id ?? null;

    if (!cartItem || typeof cartItem !== 'object') {
      return res.status(400).json({ message: 'Cart item is required' });
    }

    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'complete', 'refund', 'approval_needed'];
    const orderStatus = (status && validStatuses.includes(String(status).toLowerCase()))
      ? String(status).toLowerCase()
      : 'pending';

    const quantity = Math.max(1, parseInt(cartItem.quantity, 10) || 1);
    const totalFromCart = parseFloat(cartItem.total || cartItem.subtotal || cartItem.totalPrice) || 0;
    const unitPrice = parseFloat(cartItem.unitPrice || cartItem.unit_price) || (totalFromCart / quantity) || 0;
    const totalPrice = totalFromCart || quantity * unitPrice;
    const totalAmount = Number(totalPrice) || 0;

    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    let productIdRaw = cartItem.productId ?? cartItem.product_id;
    let productId = productIdRaw != null && productIdRaw !== '' ? parseInt(String(productIdRaw), 10) : null;
    if (productId != null && !isNaN(productId)) {
      const productExists = await pool.query('SELECT id FROM products WHERE id = $1', [productId]);
      if (productExists.rows.length === 0) productId = null;
    } else {
      productId = null;
    }
    const productName = String(cartItem.productName || cartItem.product_name || cartItem.jobName || 'Cart Item').slice(0, 255);
    const jobName = String(cartItem.jobName || cartItem.job_name || productName).slice(0, 255);
    const itemImageUrl = (cartItem.productImage || cartItem.product_image || cartItem.image_url || null);

    const client = await pool.connect();

    const insertOrderAndItem = async (useJobName) => {
      const ordNum = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      await client.query('BEGIN');
      const orderResult = await client.query(
        `INSERT INTO orders (user_id, order_number, total_amount, status, payment_method, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, ordNum, totalAmount, orderStatus, 'admin_cart', 'Created from cart by admin']
      );
      const order = orderResult.rows[0];
      if (useJobName) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, job_name, quantity, unit_price, total_price, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [order.id, productId, productName, jobName, quantity, unitPrice, totalPrice, itemImageUrl]
        );
      } else {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [order.id, productId, productName, quantity, unitPrice, totalPrice, itemImageUrl]
        );
      }
      await client.query('COMMIT');
      return order;
    };

    try {
      let order;
      try {
        order = await insertOrderAndItem(true);
      } catch (firstErr) {
        const isJobNameError = firstErr.message && (
          firstErr.message.includes('job_name') ||
          firstErr.message.includes('current transaction is aborted')
        );
        if (isJobNameError) {
          await client.query('ROLLBACK').catch(() => {});
          order = await insertOrderAndItem(false);
        } else {
          throw firstErr;
        }
      }

      const fullOrder = await pool.query(
        `SELECT o.* FROM orders o WHERE o.id = $1`,
        [order.id]
      );
      res.status(201).json({ order: fullOrder.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create order from cart error:', error);
    res.status(500).json({
      message: 'Failed to create order from cart',
      error: error.message || String(error),
    });
  }
};

/** Create order from cart and Stripe PaymentIntent; returns { orderId, orderNumber, clientSecret } for Stripe Elements */
const createOrderWithPaymentIntent = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ message: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env' });
    }
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    const { cartItems } = req.body;
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ message: 'Cart items are required' });
    }

    const itemImageUrl = (item) => item.image_url || item.product_image || item.productImage || null;
    const orderItems = cartItems.map((item) => {
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const unitPrice = parseFloat(item.unitPrice || item.unit_price) || 0;
      const subtotal = item.subtotal != null ? parseFloat(item.subtotal) : unitPrice * qty;
      return {
        product_id: item.productId || item.product_id || null,
        product_name: String(item.productName || item.product_name || 'Cart Item').slice(0, 255),
        job_name: String(item.jobName || item.job_name || item.productName || '').slice(0, 255),
        quantity: qty,
        unit_price: unitPrice,
        total_price: subtotal,
        image_url: itemImageUrl(item),
      };
    });
    const subtotalSum = orderItems.reduce((s, o) => s + o.total_price, 0);
    const shippingSum = cartItems.reduce((s, i) => s + (parseFloat(i.shippingCost || i.shipping_cost) || 0), 0);
    const taxSum = cartItems.reduce((s, i) => s + (parseFloat(i.tax) || 0), 0);
    const totalAmount = Math.round((subtotalSum + shippingSum + taxSum) * 100) / 100;
    const amountCents = Math.round(totalAmount * 100);
    if (amountCents < 50) return res.status(400).json({ message: 'Order total must be at least $0.50' });

    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const client = await pool.connect();
    let orderId;
    try {
      await client.query('BEGIN');
      const orderResult = await client.query(
        `INSERT INTO orders (user_id, order_number, total_amount, status, payment_method, payment_status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, order_number`,
        [userId, orderNumber, totalAmount, 'pending_payment', 'stripe', 'pending', 'Checkout via Stripe']
      );
      const order = orderResult.rows[0];
      orderId = order.id;
      for (const oi of orderItems) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, job_name, quantity, unit_price, total_price, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [orderId, oi.product_id, oi.product_name, oi.job_name, oi.quantity, oi.unit_price, oi.total_price, oi.image_url]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: { orderId: String(orderId), orderNumber },
    });

    res.status(201).json({
      orderId,
      orderNumber,
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error('Create order with payment intent error:', error);
    res.status(500).json({
      message: error.message || 'Failed to create payment intent',
      error: error.message,
    });
  }
};

/** Stripe webhook: on payment_intent.succeeded, mark order paid */
const handleStripeWebhook = async (req, res) => {
  if (!stripe) return res.status(503).send('Stripe not configured');
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret) {
    console.warn('STRIPE_WEBHOOK_SECRET not set; webhook skipped');
    return res.status(200).send('ok');
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const orderId = pi.metadata?.orderId;
    if (orderId) {
      try {
        await pool.query(
          `UPDATE orders SET payment_status = $1, status = $2, notes = COALESCE(notes, '') || ' | Paid via Stripe ' || $3 WHERE id = $4`,
          ['paid', 'processing', new Date().toISOString(), orderId]
        );
      } catch (e) {
        console.error('Failed to update order after payment:', e);
      }
    }
  }
  res.status(200).send('ok');
};

module.exports = { createOrder, getOrders, getOrderById, getAllOrders, getOrderByIdAdmin, updateOrderStatus, deleteOrderAdmin, createOrderFromCartItem, createOrderWithPaymentIntent, handleStripeWebhook };

