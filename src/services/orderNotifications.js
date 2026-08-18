const orderRepository = require('../repositories/orderRepository');
const { shouldNotifyForStatus, canonicalOrderStatus } = require('./email/emailStatusRegistry');
const {
  sendOrderStatusUpdatedEmail,
  sendOrderConfirmationEmail,
} = require('./emailService');
const { decryptGuestTrackingToken } = require('../utils/guestTrackingToken');
const { isEmailNotificationsEnabled } = require('../repositories/appSettingsRepository');

/**
 * Registered buyers only exist on the joined admin query; the plain `orders` row has no
 * email column, so callers must pass an order loaded via findOrderByIdAdmin.
 */
function resolveRecipient(order = {}) {
  const email =
    order.user_email ||
    order.userEmail ||
    order.guest_checkout?.email ||
    order.guestCheckout?.email ||
    null;
  return email ? String(email).trim().toLowerCase() : null;
}

/**
 * Raw tracking token for a guest order, needed by the "view your order" link.
 * Checkout can hand the plain token in directly; every other trigger (Stripe webhook,
 * admin status change, FedEx shipment) runs long after it left memory, so it is recovered
 * from the encrypted column. Returns null for registered buyers and for guest orders
 * placed before the cipher column existed.
 */
function resolveGuestToken(order = {}, guestToken = null) {
  const explicit = String(guestToken || '').trim();
  if (explicit) return explicit;
  return decryptGuestTrackingToken(order.guest_tracking_token_cipher);
}

function roundMoney2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

/**
 * In-memory order for a per-item refund email. Totals are the refunded line + tax on
 * that line only (no shipping). original_total_amount keeps "Partial refund" correct.
 */
function buildItemRefundEmailOrder(
  fullOrder,
  { itemId = null, refundAmount, refundedAt = null, refundReason = null } = {}
) {
  const items = Array.isArray(fullOrder.items) ? fullOrder.items : [];
  const targetId = Number(itemId);
  const refundedItems =
    Number.isFinite(targetId) && targetId > 0
      ? items.filter((row) => Number(row && row.id) === targetId)
      : items.slice(0, 1);
  if (!refundedItems.length) return null;

  const line = roundMoney2(refundedItems[0].total_price);
  const refunded = roundMoney2(refundAmount != null ? refundAmount : line);
  const tax = roundMoney2(Math.max(0, refunded - line));

  return {
    ...fullOrder,
    items: refundedItems,
    refund_amount: refunded,
    refunded_at: refundedAt || new Date().toISOString(),
    refund_reason: refundReason || fullOrder.refund_reason || 'requested_by_customer',
    subtotal_amount: line,
    tax_amount: tax,
    shipping_charge: 0,
    original_total_amount: fullOrder.original_total_amount ?? fullOrder.total_amount,
    total_amount: refunded,
    emailHideShipping: true,
  };
}

async function loadFullOrder(orderId) {
  try {
    return await orderRepository.findOrderForNotification(orderId);
  } catch (e) {
    console.warn('[email] could not load order', orderId, e && e.message ? e.message : e);
    return null;
  }
}

/**
 * Best-effort customer notification for an order status change.
 * Re-reads the order so the recipient comes from the users join rather than the bare
 * update result, and skips statuses that are internal-only.
 *
 * Pass `previousStatus` to suppress mail when a save does not actually move the status;
 * re-saving an order that is already shipped must not email the customer again. Callers
 * that cannot know the prior value omit it and no transition check is applied.
 * @returns {Promise<{ sent: boolean, skipped?: string, error?: string }>}
 */
async function notifyOrderStatusChange(orderId, { nextStatus, previousStatus = null, guestToken = null, order = null } = {}) {
  try {
    if (!(await isEmailNotificationsEnabled())) {
      return { sent: false, skipped: 'email notifications disabled' };
    }
    const status = canonicalOrderStatus(nextStatus);
    if (!shouldNotifyForStatus(status)) {
      return { sent: false, skipped: 'status not in notify list' };
    }
    if (previousStatus != null && canonicalOrderStatus(previousStatus) === status) {
      return { sent: false, skipped: 'status unchanged' };
    }
    const fullOrder = order && resolveRecipient(order) ? order : await loadFullOrder(orderId);
    if (!fullOrder) return { sent: false, skipped: 'order not found' };
    const recipient = resolveRecipient(fullOrder);
    if (!recipient) return { sent: false, skipped: 'no recipient on order' };
    return await sendOrderStatusUpdatedEmail(fullOrder, recipient, status, {
      guestToken: resolveGuestToken(fullOrder, guestToken),
    });
  } catch (e) {
    console.warn('[email] order status notification failed', e && e.message ? e.message : e);
    return { sent: false, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * Best-effort customer email after an admin Stripe refund of a single line.
 * Reuses the existing refunded-order template. Does not change order.status and does
 * not go through notifyOrderStatusChange, because item refunds are independent of that.
 *
 * The in-memory clone lists only the refunded line, uses this refund's amount/date, and
 * rebuilds subtotal/tax/total to that line (no shipping) so the email totals match.
 * @returns {Promise<{ sent: boolean, skipped?: string, error?: string }>}
 */
async function notifyOrderItemRefunded(
  orderId,
  { itemId, refundAmount, refundedAt = null, refundReason = null, guestToken = null } = {}
) {
  try {
    if (!(await isEmailNotificationsEnabled())) {
      return { sent: false, skipped: 'email notifications disabled' };
    }
    const fullOrder = await loadFullOrder(orderId);
    if (!fullOrder) return { sent: false, skipped: 'order not found' };
    const recipient = resolveRecipient(fullOrder);
    if (!recipient) return { sent: false, skipped: 'no recipient on order' };

    const clonedOrder = buildItemRefundEmailOrder(fullOrder, {
      itemId,
      refundAmount,
      refundedAt,
      refundReason,
    });
    if (!clonedOrder) return { sent: false, skipped: 'item not found' };

    return await sendOrderStatusUpdatedEmail(clonedOrder, recipient, 'refunded', {
      guestToken: resolveGuestToken(fullOrder, guestToken),
    });
  } catch (e) {
    console.warn('[email] item refund notification failed', e && e.message ? e.message : e);
    return { sent: false, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * Best-effort order confirmation. Fires once an order exists and is payable/paid; the
 * Stripe paths call this after the paid transition, so every order gets exactly one.
 */
async function notifyOrderConfirmation(orderId, { guestToken = null, fallbackEmail = null } = {}) {
  try {
    if (!(await isEmailNotificationsEnabled())) {
      return { sent: false, skipped: 'email notifications disabled' };
    }
    const fullOrder = await loadFullOrder(orderId);
    if (!fullOrder) return { sent: false, skipped: 'order not found' };
    const recipient = resolveRecipient(fullOrder) || (fallbackEmail ? String(fallbackEmail).trim().toLowerCase() : null);
    if (!recipient) return { sent: false, skipped: 'no recipient on order' };
    return await sendOrderConfirmationEmail(fullOrder, recipient, {
      guestToken: resolveGuestToken(fullOrder, guestToken),
    });
  } catch (e) {
    console.warn('[email] order confirmation notification failed', e && e.message ? e.message : e);
    return { sent: false, error: String(e && e.message ? e.message : e) };
  }
}

module.exports = {
  notifyOrderStatusChange,
  notifyOrderItemRefunded,
  notifyOrderConfirmation,
  buildItemRefundEmailOrder,
};
