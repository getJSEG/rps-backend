const orderRepository = require('../repositories/orderRepository');
const Stripe = require('stripe');
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const VALID_ORDER_STATUSES = [
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'complete',
  'refund',
  'approval_needed',
];

function generateOrderNumber() {
  return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

/** @returns {{ snapshot: object } | { error: string }} */
function parseGuestCheckout(body) {
  const gc = body.guestCheckout;
  if (!gc || typeof gc !== 'object') {
    return { error: 'Guest orders require guestCheckout (email, shippingAddress).' };
  }
  const email = String(gc.email || '').trim();
  if (!email) return { error: 'guestCheckout.email is required.' };
  const sa = gc.shippingAddress || gc.shipping_address;
  if (!sa || typeof sa !== 'object') {
    return { error: 'guestCheckout.shippingAddress is required.' };
  }
  const street = sa.street_address ?? sa.streetAddress;
  const city = sa.city;
  const state = sa.state;
  const postcode = sa.postcode ?? sa.zip ?? sa.postalCode;
  if (!street || !city || !state || !postcode) {
    return {
      error: 'shippingAddress must include street (street_address), city, state, and postcode.',
    };
  }
  const ba = gc.billingAddress || gc.billing_address || sa;
  const line = (x) => ({
    street_address: String(x.street_address ?? x.streetAddress ?? ''),
    address_line2: x.address_line2 ?? x.addressLine2 ?? null,
    city: String(x.city ?? ''),
    state: String(x.state ?? ''),
    postcode: String(x.postcode ?? x.zip ?? x.postalCode ?? ''),
    country: x.country || 'United States',
  });
  const snapshot = {
    email,
    fullName: String(gc.fullName || gc.full_name || '').trim() || null,
    phone: String(gc.phone || gc.telephone || '').trim() || null,
    shippingAddress: line({ ...sa, street_address: street }),
    billingAddress: line(ba),
  };
  return { snapshot };
}

const createOrder = async (req, res) => {
  try {
    const { items, shippingAddressId, billingAddressId, paymentMethod, notes } = req.body;
    const userId = req.user?.id ?? null;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Order items are required' });
    }

    let guestCheckout = null;
    let shipId = shippingAddressId ?? null;
    let billId = billingAddressId ?? shipId;
    if (!userId) {
      const parsed = parseGuestCheckout(req.body);
      if (parsed.error) {
        return res.status(400).json({ message: parsed.error });
      }
      guestCheckout = parsed.snapshot;
      shipId = null;
      billId = null;
    }

    let totalAmount = 0;
    for (const item of items) {
      totalAmount += parseFloat(item.unit_price) * parseInt(item.quantity);
    }

    const orderNumber = generateOrderNumber();

    const completeOrder = await orderRepository.createOrderWithItems({
      userId,
      orderNumber,
      totalAmount,
      shippingAddressId: shipId,
      billingAddressId: billId,
      paymentMethod,
      notes,
      guestCheckout,
      items,
    });

    res.status(201).json({ order: completeOrder });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: 'Failed to create order', error: error.message });
  }
};

const getOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const orders = await orderRepository.findOrdersForUser(userId, { status, page, limit });
    res.json({ orders });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Failed to fetch orders', error: error.message });
  }
};

const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const order = await orderRepository.findOrderByIdAndUserId(id, userId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json({ order });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Failed to fetch order', error: error.message });
  }
};

const getAllOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 1000 } = req.query;
    const orders = await orderRepository.findAllOrdersAdmin({ status, page, limit });
    res.json({ orders });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({ message: 'Failed to fetch orders', error: error.message });
  }
};

const getOrderByIdAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await orderRepository.findOrderByIdAdmin(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
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

    if (!VALID_ORDER_STATUSES.includes(status.toLowerCase())) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const updated = await orderRepository.updateOrderStatusById(id, status.toLowerCase());
    if (!updated) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ order: updated });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Failed to update order status', error: error.message });
  }
};

const deleteOrderAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedId = await orderRepository.deleteOrderById(id);
    if (deletedId == null) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json({ message: 'Order deleted', id: deletedId });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ message: 'Failed to delete order', error: error.message });
  }
};

const createOrderFromCartItem = async (req, res) => {
  try {
    const { cartItem, status } = req.body;
    const userId = req.user?.id ?? null;

    if (!cartItem || typeof cartItem !== 'object') {
      return res.status(400).json({ message: 'Cart item is required' });
    }

    const orderStatus =
      status && VALID_ORDER_STATUSES.includes(String(status).toLowerCase())
        ? String(status).toLowerCase()
        : 'pending';

    const quantity = Math.max(1, parseInt(cartItem.quantity, 10) || 1);
    const totalFromCart = parseFloat(cartItem.total || cartItem.subtotal || cartItem.totalPrice) || 0;
    const unitPrice = parseFloat(cartItem.unitPrice || cartItem.unit_price) || (totalFromCart / quantity) || 0;
    const totalPrice = totalFromCart || quantity * unitPrice;
    const totalAmount = Number(totalPrice) || 0;

    let productIdRaw = cartItem.productId ?? cartItem.product_id;
    let productId = productIdRaw != null && productIdRaw !== '' ? parseInt(String(productIdRaw), 10) : null;
    if (productId != null && !isNaN(productId)) {
      const exists = await orderRepository.productExists(productId);
      if (!exists) productId = null;
    } else {
      productId = null;
    }
    const productName = String(cartItem.productName || cartItem.product_name || cartItem.jobName || 'Cart Item').slice(0, 255);
    const jobName = String(cartItem.jobName || cartItem.job_name || productName).slice(0, 255);
    const itemImageUrl = cartItem.productImage || cartItem.product_image || cartItem.image_url || null;

    const order = await orderRepository.createOrderFromCartItemAdmin({
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
    });

    res.status(201).json({ order });
  } catch (error) {
    console.error('Create order from cart error:', error);
    res.status(500).json({
      message: 'Failed to create order from cart',
      error: error.message || String(error),
    });
  }
};

const createOrderWithPaymentIntent = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ message: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env' });
    }
    const userId = req.user?.id ?? null;
    let guestCheckout = null;
    if (!userId) {
      const parsed = parseGuestCheckout(req.body);
      if (parsed.error) {
        return res.status(400).json({ message: parsed.error });
      }
      guestCheckout = parsed.snapshot;
    }

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

    const orderNumber = generateOrderNumber();
    const { orderId, orderNumber: savedOrderNumber } = await orderRepository.createPendingStripeOrderWithItems({
      userId,
      orderNumber,
      totalAmount,
      guestCheckout,
      orderItems,
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: { orderId: String(orderId), orderNumber: savedOrderNumber },
    });

    res.status(201).json({
      orderId,
      orderNumber: savedOrderNumber,
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
        await orderRepository.markOrderPaidFromStripe(orderId, new Date().toISOString());
      } catch (e) {
        console.error('Failed to update order after payment:', e);
      }
    }
  }
  res.status(200).send('ok');
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  getAllOrders,
  getOrderByIdAdmin,
  updateOrderStatus,
  deleteOrderAdmin,
  createOrderFromCartItem,
  createOrderWithPaymentIntent,
  handleStripeWebhook,
};
