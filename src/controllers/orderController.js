const orderRepository = require('../repositories/orderRepository');
const cartRepository = require('../repositories/cartRepository');
const storePickupAddressRepository = require('../repositories/storePickupAddressRepository');
const { computeShippingFromCartItems, computeTaxAndTotal } = require('../services/orderTotalsService');
const crypto = require('crypto');
const Stripe = require('stripe');
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

/**
 * Parsed STRIPE_PAYMENT_ENABLED: true | false | null (null = unset / unknown).
 * Values are trimmed so Windows CRLF after `false` still disables Stripe.
 */
function readStripePaymentEnabledEnv() {
  const v = process.env.STRIPE_PAYMENT_ENABLED;
  if (v === undefined || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  return null;
}

/** Whether to create a PaymentIntent. False = complete order without charging (same as webhook would). */
function shouldUseStripePaymentIntent() {
  const flag = readStripePaymentEnabledEnv();
  if (flag === false) return false;
  if (flag === true) return !!stripe;
  // Unset: use Stripe only if a secret key exists (otherwise skip so checkout still works locally).
  return !!stripe;
}

const VALID_ORDER_STATUSES = [
  'pending_payment',
  'awaiting_artwork',
  'cancellation_requested',
  'on_hold',
  'awaiting_customer_approval',
  'printing',
  'trimming',
  'shipped',
  'completed',
  'reprint',
  'awaiting_refund',
  'refunded',
  'cancelled',
];

/** Terminal job status: cannot be changed via admin API. */
function isOrderStatusLocked(currentStatus) {
  const s = String(currentStatus || '').toLowerCase();
  return s === 'completed' || s === 'complete' || s === 'delivered' || s === 'refunded';
}

function generateOrderNumber() {
  return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

/** Money for DECIMAL(14,2): finite, 2 decimal places (avoids float dust and overflow). */
function roundMoney2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

const MAX_ORDER_MONEY = 999_999_999_999.99;
const MAX_LINE_QTY = 1_000_000;
const GUEST_TRACKING_TOKEN_BYTES = 32;

function guestTrackingPepper() {
  return String(process.env.GUEST_TRACKING_TOKEN_PEPPER || process.env.JWT_SECRET || 'rps-guest-tracking-pepper');
}

function createGuestTrackingTokenPlain() {
  return crypto.randomBytes(GUEST_TRACKING_TOKEN_BYTES).toString('base64url');
}

function hashGuestTrackingToken(token) {
  return crypto
    .createHash('sha256')
    .update(`${String(token || '')}:${guestTrackingPepper()}`)
    .digest('hex');
}

function buildGuestTrackingUrl(req, orderId, token) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const origin = host ? `${proto}://${host}` : '';
  const path = `/guest-orders/${encodeURIComponent(String(orderId))}?token=${encodeURIComponent(token)}`;
  return origin ? `${origin}${path}` : path;
}

function itemImageUrlFromCartItem(item) {
  return item.image_url || item.product_image || item.productImage || null;
}

/** W×H in inches from cart JSON (shared across jobs on one configuration). */
function dimensionsFromCartItem(item) {
  const rawW = item.width ?? item.width_inches ?? item.widthInches;
  const rawH = item.height ?? item.height_inches ?? item.heightInches;
  const w = rawW != null && rawW !== '' ? Number(rawW) : NaN;
  const h = rawH != null && rawH !== '' ? Number(rawH) : NaN;
  return {
    width_inches: Number.isFinite(w) && w > 0 ? w : null,
    height_inches: Number.isFinite(h) && h > 0 ? h : null,
  };
}

/** One cart row → one or more order lines when `jobs[]` is present (web-to-print). */
function expandCartItemToOrderLines(item) {
  const product_id = item.productId || item.product_id || null;
  const product_name = String(item.productName || item.product_name || 'Cart Item').slice(0, 255);
  const image_url = itemImageUrlFromCartItem(item);
  const baseUnit = roundMoney2(item.unitPrice || item.unit_price || 0);
  const { width_inches, height_inches } = dimensionsFromCartItem(item);

  const jobs = item.jobs;
  if (Array.isArray(jobs) && jobs.length > 0) {
    return jobs.map((j) => {
      let qty = Math.max(1, parseInt(j.quantity, 10) || 1);
      if (qty > MAX_LINE_QTY) qty = MAX_LINE_QTY;
      const unit = roundMoney2(j.unitPrice ?? j.unit_price ?? baseUnit);
      let lineTotal =
        j.lineSubtotal != null
          ? roundMoney2(j.lineSubtotal)
          : j.line_subtotal != null
            ? roundMoney2(j.line_subtotal)
            : roundMoney2(unit * qty);
      if (lineTotal > MAX_ORDER_MONEY) lineTotal = MAX_ORDER_MONEY;
      return {
        product_id,
        product_name,
        job_name: String(j.jobName || j.job_name || '').slice(0, 255),
        quantity: qty,
        unit_price: unit,
        total_price: lineTotal,
        image_url,
        width_inches,
        height_inches,
      };
    });
  }

  let qty = Math.max(1, parseInt(item.quantity, 10) || 1);
  if (qty > MAX_LINE_QTY) qty = MAX_LINE_QTY;
  const unitPrice = roundMoney2(item.unitPrice || item.unit_price || 0);
  let lineTotal =
    item.subtotal != null ? roundMoney2(item.subtotal) : roundMoney2(unitPrice * qty);
  if (lineTotal > MAX_ORDER_MONEY) lineTotal = MAX_ORDER_MONEY;
  return [
    {
      product_id,
      product_name,
      job_name: String(item.jobName || item.job_name || item.productName || '').slice(0, 255),
      quantity: qty,
      unit_price: unitPrice,
      total_price: lineTotal,
      image_url,
      width_inches,
      height_inches,
    },
  ];
}

function readGuestSessionIdFromReq(req) {
  const raw = req.headers['x-guest-session-id'] || req.headers['X-Guest-Session-Id'] || '';
  const sid = String(raw).trim();
  if (sid.length >= 8 && sid.length <= 128) return sid;
  return null;
}

/** Clear server cart for whoever placed the order (logged-in user or guest session header). */
async function clearBuyerCartAfterCheckout(req, userId) {
  try {
    if (userId) {
      await cartRepository.clearCartByUserId(userId);
      return;
    }
    const sid = readGuestSessionIdFromReq(req);
    if (sid) await cartRepository.clearCartByGuestSession(sid);
  } catch (e) {
    console.warn('clearBuyerCartAfterCheckout:', e.message);
  }
}

async function loadServerCartForCheckout(req, userId) {
  if (userId) return cartRepository.findCartItemsByUserId(userId);
  const sid = readGuestSessionIdFromReq(req);
  if (!sid) return [];
  return cartRepository.findCartItemsByGuestSession(sid);
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
      const guestSid = readGuestSessionIdFromReq(req);
      if (guestSid) {
        guestCheckout = { ...guestCheckout, guestSessionId: guestSid };
      }
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

    const existing = await orderRepository.findOrderByIdAdmin(id);
    if (!existing) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (isOrderStatusLocked(existing.status)) {
      return res.status(400).json({
        message: 'This order is completed and its status cannot be changed.',
      });
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

const updateOrderTrackingId = async (req, res) => {
  try {
    const { id } = req.params;
    const raw = req.body?.orderTrackingId;
    if (raw === undefined) {
      return res.status(400).json({
        message: 'orderTrackingId is required (use null or empty string to clear)',
      });
    }
    let value = null;
    if (raw !== null && raw !== '') {
      const s = String(raw).trim();
      if (s.length > 255) {
        return res.status(400).json({ message: 'orderTrackingId must be 255 characters or fewer' });
      }
      value = s || null;
    }
    const updated = await orderRepository.updateOrderTrackingIdById(id, value);
    if (!updated) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json({ order: updated });
  } catch (error) {
    console.error('Update order tracking id error:', error);
    res.status(500).json({ message: 'Failed to update order tracking id', error: error.message });
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
        : 'awaiting_artwork';

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

    const jobsRaw = Array.isArray(cartItem.jobs) ? cartItem.jobs : [];
    const { width_inches: cartW, height_inches: cartH } = dimensionsFromCartItem(cartItem);
    let order;
    if (jobsRaw.length > 0) {
      const lines = jobsRaw.map((j) => {
        const q = Math.max(1, parseInt(j.quantity, 10) || 1);
        const unitPriceLine = roundMoney2(
          j.unitPrice ?? j.unit_price ?? cartItem.unitPrice ?? cartItem.unit_price ?? 0
        );
        let totalPriceLine =
          j.lineSubtotal != null
            ? roundMoney2(j.lineSubtotal)
            : j.line_subtotal != null
              ? roundMoney2(j.line_subtotal)
              : roundMoney2(unitPriceLine * q);
        return {
          jobName: String(j.jobName || j.job_name || productName).slice(0, 255),
          quantity: q,
          unitPrice: unitPriceLine,
          totalPrice: totalPriceLine,
          width_inches: cartW,
          height_inches: cartH,
        };
      });
      const totalAmountMulti =
        parseFloat(cartItem.total || cartItem.subtotal || cartItem.totalPrice) ||
        lines.reduce((s, l) => s + l.totalPrice, 0);
      order = await orderRepository.createOrderFromCartItemAdminMultiJob({
        userId,
        totalAmount: Number(totalAmountMulti) || 0,
        orderStatus,
        productId,
        productName,
        itemImageUrl,
        lines,
      });
    } else {
      order = await orderRepository.createOrderFromCartItemAdmin({
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
        width_inches: cartW,
        height_inches: cartH,
      });
    }

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
    const userId = req.user?.id ?? null;
    let guestCheckout = null;
    let guestTrackingToken = null;
    let guestTrackingTokenHash = null;
    if (!userId) {
      const parsed = parseGuestCheckout(req.body);
      if (parsed.error) {
        return res.status(400).json({ message: parsed.error });
      }
      guestCheckout = parsed.snapshot;
      const guestSid = readGuestSessionIdFromReq(req);
      if (guestSid) {
        guestCheckout = { ...guestCheckout, guestSessionId: guestSid };
      }
      guestTrackingToken = createGuestTrackingTokenPlain();
      guestTrackingTokenHash = hashGuestTrackingToken(guestTrackingToken);
    }

    const cartItems = await loadServerCartForCheckout(req, userId);
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ message: 'No cart items found for checkout.' });
    }

    const orderItems = cartItems.flatMap((item) => expandCartItemToOrderLines(item));
    const subtotalSum = roundMoney2(orderItems.reduce((s, o) => s + o.total_price, 0));
    const shippingComputed = await computeShippingFromCartItems(cartItems);
    const shippingMode = shippingComputed.shippingMode;
    let shippingSum = shippingComputed.shippingSum;
    let shippingMethod = shippingComputed.shippingMethod;
    let shippingCharge = shippingComputed.shippingCharge;
    let storePickupAddressId = null;
    let storePickupAddress = null;
    if (shippingMode === 'store_pickup') {
      const parsedPickup = shippingComputed.storePickupAddressId;
      if (Number.isNaN(parsedPickup)) {
        return res.status(400).json({ message: 'Store pickup requires a pickup address selection.' });
      }
      const exists = await orderRepository.verifyStorePickupAddressExists(parsedPickup);
      if (!exists) {
        return res.status(400).json({ message: 'Selected store pickup address is not available.' });
      }
      storePickupAddressId = parsedPickup;
      storePickupAddress = await storePickupAddressRepository.findById(parsedPickup);
      shippingMethod = 'Store Pickup';
      shippingSum = 0;
      shippingCharge = 0;
    } else {
      const freeShippingResult = shippingComputed.applyFreeShipping(subtotalSum);
      shippingSum = freeShippingResult.shippingSum;
      shippingCharge = freeShippingResult.shippingCharge;
    }
    const totals = await computeTaxAndTotal(subtotalSum, shippingSum);
    let totalAmount = totals.total;
    if (totalAmount > MAX_ORDER_MONEY) {
      return res.status(400).json({ message: 'Order total exceeds the maximum allowed amount.' });
    }
    const amountCents = Math.round(totalAmount * 100);
    if (amountCents < 50) return res.status(400).json({ message: 'Order total must be at least $0.50' });

    let shippingAddressId = null;
    let billingAddressId = null;
    if (userId && shippingMode !== 'store_pickup') {
      const rawShip = req.body.shippingAddressId ?? req.body.shipping_address_id;
      const rawBill = req.body.billingAddressId ?? req.body.billing_address_id;
      const shipParsed = rawShip != null && rawShip !== '' ? parseInt(String(rawShip), 10) : NaN;
      const billParsed = rawBill != null && rawBill !== '' ? parseInt(String(rawBill), 10) : NaN;
      let ship = Number.isNaN(shipParsed) ? null : shipParsed;
      let bill = Number.isNaN(billParsed) ? null : billParsed;
      if (ship != null && !(await orderRepository.verifyAddressBelongsToUser(userId, ship))) {
        ship = null;
      }
      if (bill != null && !(await orderRepository.verifyAddressBelongsToUser(userId, bill))) {
        bill = null;
      }
      if (ship != null && bill == null) bill = ship;
      if (bill != null && ship == null) ship = bill;
      shippingAddressId = ship;
      billingAddressId = bill;
    }

    if (shippingMode === 'store_pickup') {
      shippingAddressId = null;
      billingAddressId = null;
      if (storePickupAddress) {
        const pickupSnapshot = {
          shippingAddress: {
            street_address: storePickupAddress.street_address,
            address_line2: storePickupAddress.address_line2,
            city: storePickupAddress.city,
            state: storePickupAddress.state,
            postcode: storePickupAddress.postcode,
            country: storePickupAddress.country,
            label: storePickupAddress.label,
          },
          billingAddress: {
            street_address: storePickupAddress.street_address,
            address_line2: storePickupAddress.address_line2,
            city: storePickupAddress.city,
            state: storePickupAddress.state,
            postcode: storePickupAddress.postcode,
            country: storePickupAddress.country,
            label: storePickupAddress.label,
          },
        };
        guestCheckout = { ...(guestCheckout || {}), ...pickupSnapshot };
      }
    }

    const orderNumber = generateOrderNumber();
    const { orderId, orderNumber: savedOrderNumber } = await orderRepository.createPendingStripeOrderWithItems({
      userId,
      orderNumber,
      totalAmount,
      guestCheckout,
      guestTrackingTokenHash,
      orderItems,
      shippingAddressId,
      billingAddressId,
      shippingMethod,
      shippingCharge,
      shippingMode,
      storePickupAddressId,
      subtotalAmount: totals.subtotal,
      tax: totals.tax,
    });

    if (!shouldUseStripePaymentIntent()) {
      if (readStripePaymentEnabledEnv() === true && !stripe) {
        return res.status(503).json({ message: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env' });
      }
      await orderRepository.markOrderPaidWithoutStripe(orderId);
      await clearBuyerCartAfterCheckout(req, userId);
      return res.status(201).json({
        orderId,
        orderNumber: savedOrderNumber,
        clientSecret: null,
        guestTrackingToken: guestTrackingToken || undefined,
        guestTrackingUrl:
          guestTrackingToken && !userId ? buildGuestTrackingUrl(req, orderId, guestTrackingToken) : undefined,
        stripePaymentSkipped: true,
        subtotal: totals.subtotal,
        shipping: totals.shipping,
        taxAmount: totals.tax.amount,
        taxName: totals.tax.name,
        taxPercentage: totals.tax.percentage,
        total: totals.total,
      });
    }

    const metadata = {
      orderId: String(orderId),
      orderNumber: savedOrderNumber,
    };
    const guestSidForStripe = userId ? null : readGuestSessionIdFromReq(req);
    if (guestSidForStripe) {
      metadata.guestSessionId = guestSidForStripe;
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata,
    });
    await orderRepository.setOrderStripePaymentIntent(orderId, paymentIntent.id);

    res.status(201).json({
      orderId,
      orderNumber: savedOrderNumber,
      clientSecret: paymentIntent.client_secret,
      guestTrackingToken: guestTrackingToken || undefined,
      guestTrackingUrl:
        guestTrackingToken && !userId ? buildGuestTrackingUrl(req, orderId, guestTrackingToken) : undefined,
      stripePaymentSkipped: false,
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      taxAmount: totals.tax.amount,
      taxName: totals.tax.name,
      taxPercentage: totals.tax.percentage,
      total: totals.total,
    });
  } catch (error) {
    console.error('Create order with payment intent error:', error);
    res.status(500).json({
      message: error.message || 'Failed to create payment intent',
      error: error.message,
    });
  }
};

const getGuestOrderByIdWithToken = async (req, res) => {
  try {
    const { id } = req.params;
    const token = String(req.query?.token || '').trim();
    if (!token) return res.status(400).json({ message: 'token is required' });
    const tokenHash = hashGuestTrackingToken(token);
    const order = await orderRepository.findGuestOrderByIdAndTokenHash(id, tokenHash);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    return res.json({ order });
  } catch (error) {
    console.error('Get guest order by token error:', error);
    return res.status(500).json({ message: 'Failed to fetch guest order', error: error.message });
  }
};

/**
 * Fallback for local/dev when webhook is delayed/missed:
 * verify PaymentIntent with Stripe and mark order paid.
 */
const confirmStripePayment = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ message: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env' });
    }
    const orderIdNum = Number(req.body?.orderId);
    const paymentIntentId = String(req.body?.paymentIntentId || '').trim();
    if (!Number.isFinite(orderIdNum) || orderIdNum <= 0) {
      return res.status(400).json({ message: 'Valid orderId is required' });
    }
    if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) {
      return res.status(400).json({ message: 'Valid paymentIntentId is required' });
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (!pi || pi.status !== 'succeeded') {
      return res.status(409).json({ message: 'Payment is not completed yet' });
    }

    const metadataOrderId = Number(pi.metadata?.orderId);
    if (!Number.isFinite(metadataOrderId) || metadataOrderId !== orderIdNum) {
      return res.status(400).json({ message: 'PaymentIntent does not match this order' });
    }

    await orderRepository.markOrderPaidFromStripe(orderIdNum, new Date().toISOString(), pi.id);
    return res.status(200).json({ ok: true, orderId: orderIdNum, paymentStatus: 'paid' });
  } catch (error) {
    console.error('Confirm Stripe payment error:', error);
    return res.status(500).json({ message: error.message || 'Failed to confirm payment', error: error.message });
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
        await orderRepository.markOrderPaidFromStripe(orderId, new Date().toISOString(), pi.id);
        const buyerId = await orderRepository.getOrderUserId(orderId);
        if (buyerId) {
          await cartRepository.clearCartByUserId(buyerId);
        } else {
          const gs = pi.metadata?.guestSessionId;
          const sid = gs != null ? String(gs).trim() : '';
          if (sid.length >= 8 && sid.length <= 128) {
            await cartRepository.clearCartByGuestSession(sid);
          }
        }
      } catch (e) {
        console.error('Failed to update order after payment:', e);
      }
    }
  }
  res.status(200).send('ok');
};

const requestOrderCancellation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const order = await orderRepository.findOrderByIdAndUserId(id, userId);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const current = String(order.status || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_');

    if (current === 'cancellation_requested') {
      return res.status(409).json({ message: 'Cancellation already requested for this order.' });
    }
    if (
      current === 'cancelled' ||
      current === 'refunded' ||
      current === 'awaiting_refund' ||
      current === 'shipped' ||
      current === 'completed'
    ) {
      return res.status(400).json({ message: 'This order cannot be cancelled at its current stage.' });
    }

    const updated = await orderRepository.updateOrderStatusById(id, 'cancellation_requested');
    if (!updated) return res.status(404).json({ message: 'Order not found' });
    return res.json({ order: updated });
  } catch (error) {
    console.error('Request order cancellation error:', error);
    return res.status(500).json({ message: 'Failed to request cancellation', error: error.message });
  }
};

const requestGuestOrderCancellation = async (req, res) => {
  try {
    const { id } = req.params;
    const token = String(req.query?.token || '').trim();
    if (!token) return res.status(400).json({ message: 'token is required' });
    const tokenHash = hashGuestTrackingToken(token);
    const order = await orderRepository.findGuestOrderByIdAndTokenHash(id, tokenHash);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const current = String(order.status || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_');

    if (current === 'cancellation_requested') {
      return res.status(409).json({ message: 'Cancellation already requested for this order.' });
    }
    if (
      current === 'cancelled' ||
      current === 'refunded' ||
      current === 'awaiting_refund' ||
      current === 'shipped' ||
      current === 'completed'
    ) {
      return res.status(400).json({ message: 'This order cannot be cancelled at its current stage.' });
    }

    const updated = await orderRepository.updateOrderStatusById(id, 'cancellation_requested');
    if (!updated) return res.status(404).json({ message: 'Order not found' });
    return res.json({ order: updated });
  } catch (error) {
    console.error('Request guest order cancellation error:', error);
    return res.status(500).json({ message: 'Failed to request cancellation', error: error.message });
  }
};

const refundOrderAdmin = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ message: 'Stripe is not configured. Set STRIPE_SECRET_KEY in .env' });
    }
    const { id } = req.params;
    const order = await orderRepository.findOrderByIdAdmin(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const status = String(order.status || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_');
    const allowedStatuses = new Set(['awaiting_refund', 'cancellation_requested']);
    if (!allowedStatuses.has(status)) {
      return res.status(400).json({
        message: 'Refund is allowed only when order status is Awaiting refund or Cancellation requested.',
      });
    }
    if (isOrderStatusLocked(status)) {
      return res.status(400).json({ message: 'This order is locked and cannot be changed.' });
    }

    let paymentIntentId = String(order.stripe_payment_intent_id || '').trim();
    if (!paymentIntentId) {
      // Backfill older orders by searching Stripe metadata.
      try {
        const byOrderId = await stripe.paymentIntents.search({
          query: `metadata['orderId']:'${String(order.id)}' AND status:'succeeded'`,
          limit: 1,
        });
        if (Array.isArray(byOrderId?.data) && byOrderId.data.length > 0) {
          paymentIntentId = String(byOrderId.data[0].id || '').trim();
        }
      } catch (e) {
        console.warn('Stripe payment intent search by orderId failed:', e.message);
      }
      if (!paymentIntentId) {
        try {
          const byOrderNumber = await stripe.paymentIntents.search({
            query: `metadata['orderNumber']:'${String(order.order_number || '')}' AND status:'succeeded'`,
            limit: 1,
          });
          if (Array.isArray(byOrderNumber?.data) && byOrderNumber.data.length > 0) {
            paymentIntentId = String(byOrderNumber.data[0].id || '').trim();
          }
        } catch (e) {
          console.warn('Stripe payment intent search by orderNumber failed:', e.message);
        }
      }
      if (paymentIntentId) {
        await orderRepository.setOrderStripePaymentIntent(id, paymentIntentId);
      }
    }
    if (!paymentIntentId) {
      return res.status(400).json({
        message:
          'Stripe payment intent ID is missing for this order and could not be auto-resolved from Stripe metadata.',
      });
    }

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer',
      metadata: {
        orderId: String(order.id),
        orderNumber: String(order.order_number || ''),
      },
    });

    const refundedAtIso = new Date(Number(refund.created || 0) * 1000 || Date.now()).toISOString();
    const updated = await orderRepository.markOrderRefunded({
      orderId: id,
      refundId: refund.id,
      refundAmount: Number(refund.amount || 0) / 100,
      refundedAtIso,
      refundCurrency: String(refund.currency || 'usd').toLowerCase(),
      refundReason: refund.reason || 'requested_by_customer',
    });

    return res.json({
      order: updated || { ...order, status: 'refunded' },
      refund: {
        id: refund.id,
        amount: Number(refund.amount || 0) / 100,
        currency: String(refund.currency || 'usd').toLowerCase(),
        date: refundedAtIso,
      },
    });
  } catch (error) {
    console.error('Refund order admin error:', error);
    return res.status(500).json({ message: 'Failed to process refund', error: error.message });
  }
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  getAllOrders,
  getOrderByIdAdmin,
  updateOrderStatus,
  updateOrderTrackingId,
  deleteOrderAdmin,
  createOrderFromCartItem,
  createOrderWithPaymentIntent,
  getGuestOrderByIdWithToken,
  confirmStripePayment,
  handleStripeWebhook,
  requestOrderCancellation,
  requestGuestOrderCancellation,
  refundOrderAdmin,
};
