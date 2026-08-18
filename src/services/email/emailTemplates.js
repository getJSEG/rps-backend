const {
  escapeHtml,
  formatCurrency,
  formatDate,
  orderNumberOf,
  customerNameOf,
  buildOrderUrl,
  renderButton,
  renderLink,
  renderKeyValue,
  buildBaseLayout,
  renderOrderItemsTable,
  renderTotals,
  resolveContactUrl,
} = require('./emailLayout');
const { STYLES } = require('./emailStyles');
const { getStatusMeta } = require('./emailStatusRegistry');
const { couponLineLabel } = require('../couponService');

/** Formats a currency amount, or null when the column is empty so the row can be dropped. */
function money(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return formatCurrency(n);
}

/** As money(), but also drops zero so charges that do not apply render no line at all. */
function moneyIfCharged(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return money(value);
}

/** Smaller muted thank-you line for status emails. */
function renderSubtleThankYou(line) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="${STYLES.thankYouTable}"><tr><td align="center" style="${STYLES.thankYouSubtle}">${escapeHtml(line)}</td></tr></table>`;
}

/**
 * Guest-only access: tracking URL only (no button). Logged-in buyers have an account
 * order list, so they do not get this block.
 */
function renderGuestOrderAccess(orderUrl) {
  const url = String(orderUrl || '').trim();
  if (!url) return '';
  return `
    <p style="${STYLES.sectionMessage}">Since you checked out as a guest, save the link below to securely view your latest order status.</p>
    <p style="${STYLES.urlText}"><a href="${escapeHtml(url)}" style="${STYLES.link}">${escapeHtml(url)}</a></p>
  `;
}

function humanize(value) {
  return String(value || '')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

const PAYMENT_METHOD_LABELS = {
  card: 'Card',
  stripe: 'Card',
  manual: 'Manual',
  cash: 'Cash',
  cod: 'Cash on Delivery',
};

function paymentMethodLabel(order = {}) {
  const raw = String(order.payment_method || '').trim().toLowerCase();
  if (!raw) return null;
  return PAYMENT_METHOD_LABELS[raw] || humanize(raw);
}

function isCashOnDelivery(order = {}) {
  const method = String(order.payment_method || '').trim().toLowerCase();
  return method === 'cod' || method === 'cash';
}

/**
 * Confirmation emails: COD customers need the method label, not a misleading "Paid".
 * Card / prepaid orders benefit from Payment status instead.
 */
function confirmationPaymentVisibility(order = {}) {
  if (isCashOnDelivery(order)) {
    return { omitPaymentMethod: false, omitPaymentStatus: true };
  }
  return { omitPaymentMethod: true, omitPaymentStatus: false };
}

/**
 * Derived from payment_status only, never from the payment method, so cash and
 * pay-later orders are described as due rather than completed.
 */
function paymentStatusLabel(order = {}) {
  const status = String(order.payment_status || '').trim().toLowerCase();
  if (status === 'paid') return 'Paid';
  if (status === 'refunded') return 'Refunded';
  return 'Payment due';
}

function taxLabel() {
  return 'Sales tax';
}

function isStorePickup(order = {}) {
  return String(order.shipping_mode || '').trim().toLowerCase() === 'store_pickup';
}

/** Label + amount for the shipping totals row. Free shipping always shows as "Free". */
function shippingTotalsRow(order = {}) {
  if (isStorePickup(order)) {
    return { label: 'Store pickup', value: 'Free' };
  }
  const service = String(order.shipping_method || '').trim();
  const label = service || 'Shipping';
  const charge = Number(order.shipping_charge);
  const isFree = !Number.isFinite(charge) || charge <= 0;
  return { label, value: isFree ? 'Free' : money(order.shipping_charge) };
}

function couponTotalsRow(order = {}) {
  const discount = Number(order.coupon_discount_amount);
  if (!Number.isFinite(discount) || discount <= 0) return null;
  const amount = money(discount);
  if (!amount) return null;
  return { label: couponLineLabel(order), value: `-${amount}` };
}

function originalSubtotalAmount(order = {}) {
  const discounted = Number(order.subtotal_amount);
  const coupon = Number(order.coupon_discount_amount) || 0;
  if (!Number.isFinite(discounted)) return order.subtotal_amount;
  return Math.round((discounted + (coupon > 0 ? coupon : 0)) * 100) / 100;
}

function buildOrderTotals(order = {}) {
  return renderTotals([
    { label: 'Subtotal', value: money(originalSubtotalAmount(order)) },
    couponTotalsRow(order),
    { label: taxLabel(), value: moneyIfCharged(order.tax_amount) },
    shippingTotalsRow(order),
    {
      label: 'Total',
      value: money(order.total_amount) || formatCurrency(0),
      strong: true,
    },
  ]);
}

/**
 * Public logo URL for email clients. Prefer EMAIL_LOGO_URL.
 * Never fall back to localhost — Gmail cannot load it (broken image + alt text).
 */
function resolveEmailLogoUrl(appUrl = '') {
  const explicit = String(process.env.EMAIL_LOGO_URL || '').trim();
  if (explicit) return explicit;
  const base = String(appUrl || process.env.FRONTEND_URL || process.env.APP_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (!base) return '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(base)) return '';
  return `${base}/logo.png`;
}

/** Per-send id so Gmail does not collapse the body behind "⋯". */
function emailUniqueRef(seed = '') {
  return `${String(seed || 'mail').replace(/\s+/g, '').slice(0, 48)}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/** Shared order block: meta rows, line items, totals. */
function renderOrderSummaryBlock(
  order = {},
  {
    omitPaymentMethod = false,
    omitPaymentStatus = false,
    leadingMetaRows = [],
    extraMetaRows = [],
  } = {}
) {
  const number = orderNumberOf(order);
  const metaRows = [];
  if (Array.isArray(leadingMetaRows) && leadingMetaRows.length) {
    metaRows.push(...leadingMetaRows);
  }
  metaRows.push(
    { label: 'Order number', value: number },
    { label: 'Order date', value: formatDate(order.created_at) }
  );
  if (!omitPaymentMethod) {
    metaRows.push({ label: 'Payment method', value: paymentMethodLabel(order) });
  }
  if (!omitPaymentStatus) {
    metaRows.push({ label: 'Payment status', value: paymentStatusLabel(order) });
  }
  if (Array.isArray(extraMetaRows) && extraMetaRows.length) {
    metaRows.push(...extraMetaRows);
  }
  return `
    ${renderKeyValue(metaRows)}
    ${renderOrderItemsTable(order.items)}
    ${buildOrderTotals(order)}
  `;
}

function buildPasswordResetEmail({ resetUrl = '', expiresMinutes = 30, appUrl = '', name = '' } = {}) {
  const target = String(resetUrl || '').trim() || null;
  const minutes = Number(expiresMinutes);
  const displayName = String(name || '').trim();
  const greeting = displayName ? `Hello ${displayName},` : 'Hello,';
  const content = `
    <p style="${STYLES.contentAuthPara}">${escapeHtml(greeting)}</p>
    <p style="${STYLES.contentAuthPara}">Click the button below to securely create a new password.</p>
    ${renderButton(target, 'Reset your password', { centered: true, auth: true })}
    <p style="${STYLES.contentAuthPara}">For your security, this link will expire in <span style="${STYLES.emphasis}">${minutes} minutes</span> and can only be used once.</p>
    <p style="${STYLES.contentAuthPara}">For your protection, please do not share this password reset link with anyone.</p>
    <p style="${STYLES.contentAuthPara}">Thank you,<br>Resourceful Print Solutions</p>
  `;
  return {
    subject: 'Reset Your Resourceful Print Solutions Password',
    text: [
      greeting,
      '',
      'Click the button below to securely create a new password.',
      target || '(link unavailable)',
      '',
      `For your security, this link will expire in ${minutes} minutes and can only be used once.`,
      '',
      'If you did not request a password reset, no action is required. Your current password will remain unchanged.',
      '',
      'For your protection, please do not share this password reset link with anyone.',
      '',
      'Thank you,',
      'Resourceful Print Solutions',
    ].join('\n'),
    html: buildBaseLayout({
      title: 'Reset Your Password',
      titleAlign: 'center',
      authLayout: true,
      preheader: '',
      content,
      logoUrl: resolveEmailLogoUrl(appUrl),
      appUrl,
      uniqueRef: emailUniqueRef('password-reset'),
    }),
  };
}

function buildPasswordChangedEmail({ appUrl = '' } = {}) {
  const base = String(appUrl || '').trim().replace(/\/+$/, '');
  // Sign-in is the form in the site header, so the home page is the destination.
  const target = base || null;
  const content = `
    <p>Hello,</p>
    <p>The password for your Resourceful Print Solutions account was changed successfully.</p>
    ${renderLink(target, 'Sign in to your account')}
    <p style="${STYLES.note}">If you did not make this change, contact us immediately so we can secure your account.</p>
  `;
  return {
    subject: 'Your Resourceful Print Solutions Password Was Changed',
    text: 'The password for your Resourceful Print Solutions account was changed successfully. If this was not you, contact us immediately.',
    html: buildBaseLayout({
      title: 'Password changed',
      preheader: 'Your account password was updated',
      content,
      logoUrl: resolveEmailLogoUrl(appUrl),
      appUrl,
      uniqueRef: emailUniqueRef('password-changed'),
    }),
  };
}

function buildOrderConfirmationEmail(order = {}, { appUrl = '', guestToken = null } = {}) {
  const number = orderNumberOf(order);
  const name = customerNameOf(order);
  const isGuest = !order.user_id && !order.userId;
  const orderUrl = buildOrderUrl({ order, appUrl, guestToken });
  const paymentVisibility = confirmationPaymentVisibility(order);

  const greeting = `<p style="${STYLES.greeting}">Dear ${escapeHtml(name)},</p>`;
  const shortMessage = `<p style="${STYLES.sectionMessage}">Your order #${escapeHtml(number)} has been received successfully and is now confirmed.</p>`;

  const actionBlock = `
    <div style="${STYLES.ctaSection}">
      ${isGuest ? renderGuestOrderAccess(orderUrl) : ''}
      <p style="${STYLES.sectionMessage}">We&rsquo;ll keep you informed as your order progresses.</p>
      ${renderSubtleThankYou('Thank you for choosing Resourceful Print Solutions.')}
    </div>
  `;

  const content = `
    ${greeting}
    ${shortMessage}
    ${renderOrderSummaryBlock(order, {
      omitPaymentMethod: paymentVisibility.omitPaymentMethod,
      omitPaymentStatus: paymentVisibility.omitPaymentStatus,
    })}
    ${actionBlock}
  `;

  return {
    subject: `Order #${number} Confirmed`,
    text: [
      'Order Confirmed.',
      `Dear ${name},`,
      `Your order #${number} has been received successfully and is now confirmed.`,
      `Total: ${money(order.total_amount) || formatCurrency(0)}`,
      isGuest && orderUrl
        ? [
            'Since you checked out as a guest, save the link below to securely view your latest order status.',
            orderUrl,
          ].join('\n')
        : '',
      "We'll keep you informed as your order progresses.",
      'Thank you for choosing Resourceful Print Solutions.',
    ]
      .filter(Boolean)
      .join('\n'),
    html: buildBaseLayout({
      title: 'Order Confirmed',
      titleAlign: 'center',
      titleAccent: true,
      preheader: '',
      content,
      logoUrl: resolveEmailLogoUrl(appUrl),
      appUrl,
      uniqueRef: emailUniqueRef(`confirm-${number}`),
    }),
  };
}

/** Stripe stores a machine reason; only expose values that are safe to show a customer. */
const CUSTOMER_SAFE_REFUND_REASONS = {
  requested_by_customer: 'Requested by customer',
  duplicate: 'Duplicate payment',
};

function refundReasonLabel(order = {}) {
  const raw = String(order.refund_reason || '').trim().toLowerCase();
  if (!raw) return null;
  return CUSTOMER_SAFE_REFUND_REASONS[raw] || null;
}

/** 'Full refund' vs 'Partial refund', or null when the amounts cannot be compared. */
function refundScopeLabel(order = {}) {
  const refunded = Number(order.refund_amount);
  const total = Number(order.total_amount);
  if (!Number.isFinite(refunded) || refunded <= 0) return null;
  if (!Number.isFinite(total) || total <= 0) return null;
  return refunded + 0.005 >= total ? 'Full refund' : 'Partial refund';
}

function shippedCarrierLabel(order = {}) {
  const raw = String(order.carrier || '').trim();
  if (!raw) return null;
  if (raw.toLowerCase() === 'fedex') return 'FedEx';
  return raw.replace(/_/g, ' ');
}

/**
 * Status-specific facts, pulled only from populated columns. A status reached without the
 * usual side effects (for example an admin setting `shipped` with no FedEx shipment)
 * simply yields fewer rows.
 */
function statusDetailRows(order = {}, status = '') {
  if (status === 'shipped') {
    return [
      { label: 'Carrier', value: shippedCarrierLabel(order) },
      { label: 'Estimated delivery', value: formatDate(order.shipping_estimated_delivery) },
      { label: 'Tracking number', value: String(order.order_tracking_id || '').trim() },
    ];
  }
  if (status === 'refunded') {
    return [
      { label: 'Refund amount', value: money(order.refund_amount) },
      { label: 'Refund date', value: formatDate(order.refunded_at) },
      { label: 'Refund type', value: refundScopeLabel(order) },
      { label: 'Reason', value: refundReasonLabel(order) },
    ];
  }
  if (status === 'cancelled') {
    return [{ label: 'Cancellation date', value: formatDate(order.updated_at) }];
  }
  return [];
}

/**
 * Per-status customer notification driven by the status registry.
 * @param {object} order full order row (must include items for a useful body)
 * @param {string} nextStatus canonical or raw status value
 */
function buildOrderStatusEmail(order = {}, nextStatus = '', { appUrl = '', guestToken = null } = {}) {
  const meta = getStatusMeta(nextStatus);
  const number = orderNumberOf(order);
  const name = customerNameOf(order);
  const isGuest = !order.user_id && !order.userId;
  const isShipped = meta.status === 'shipped';
  const isOnHold = meta.status === 'on_hold';
  const isCancelled = meta.status === 'cancelled';
  const isRefunded = meta.status === 'refunded';
  const isHeadlineStatus = isShipped || isOnHold || isCancelled || isRefunded;
  const orderUrl = buildOrderUrl({ order, appUrl, guestToken });
  const contactUrl = resolveContactUrl(appUrl);
  const refundAmountLabel = money(order.refund_amount);
  const guestAccess = isGuest ? renderGuestOrderAccess(orderUrl) : '';
  const subject = typeof meta.subject === 'function'
    ? meta.subject(number)
    : `Order #${number} status: ${meta.label}`;

  // Explicit empty string means "no preheader"; only fall back when the field is absent.
  const preheader = Object.prototype.hasOwnProperty.call(meta, 'preheader')
    ? (typeof meta.preheader === 'function' ? meta.preheader(number) : String(meta.preheader || ''))
    : `Order ${number} is now ${meta.label}`;

  // Explicit empty string means "no body paragraph".
  const body = Object.prototype.hasOwnProperty.call(meta, 'body')
    ? String(meta.body || '')
    : `Your order status is now ${meta.label}.`;

  const statusRows = statusDetailRows(order, meta.status);
  const details = isHeadlineStatus ? '' : renderKeyValue(statusRows);

  const orderSummary = renderOrderSummaryBlock(order, {
    omitPaymentMethod: meta.omitPaymentMethod === true,
    omitPaymentStatus: meta.omitPaymentStatus === true,
    leadingMetaRows: isCancelled || isRefunded ? statusRows : [],
    extraMetaRows: isShipped ? statusRows : [],
  });

  // Name-as-header layout is unused for notifying statuses that now use a status title.
  const nameAsHeading = meta.heading == null;
  const title = isHeadlineStatus
    ? meta.heading ||
      (isShipped
        ? 'Order Shipped'
        : isOnHold
          ? 'Order On Hold'
          : isCancelled
            ? 'Order Cancelled'
            : 'Order Refunded')
    : nameAsHeading
      ? `Dear ${name},`
      : meta.heading || 'Order update';
  const titleAlign = meta.titleAlign || (isHeadlineStatus ? 'center' : 'left');

  const greeting = isHeadlineStatus
    ? `<p style="${STYLES.greeting}">Dear ${escapeHtml(name)},</p>`
    : nameAsHeading
      ? ''
      : `<p>Hello ${escapeHtml(name)},</p>`;
  const statusLine = isHeadlineStatus
    ? ''
    : `<p>Order #${escapeHtml(number)} is now ${escapeHtml(meta.label)}.</p>`;
  const bodyParagraph = body ? `<p>${escapeHtml(body)}</p>` : '';

  const refundMessageBlock = isRefunded
    ? `
      ${
        refundAmountLabel
          ? `<p style="${STYLES.refundAmount}">A refund of ${escapeHtml(refundAmountLabel)} has been processed.</p>`
          : `<p style="${STYLES.sectionMessage}">Your refund has been processed.</p>`
      }
      <p style="${STYLES.note}">It may take a few business days to appear on your original payment method.</p>
    `
    : '';

  let ctaBlock = '';
  if (isShipped) {
    ctaBlock = `
      <div style="${STYLES.ctaSection}">
        <p style="${STYLES.sectionMessage}">Your package is on its way.</p>
        ${guestAccess}
        ${renderSubtleThankYou('Thank you for choosing Resourceful Print Solutions. We appreciate your business.')}
      </div>
    `;
  } else if (isOnHold) {
    ctaBlock = `
      <div style="${STYLES.ctaSection}">
        <p style="${STYLES.sectionMessage}">Your order is on hold and will continue once it is ready. No action is needed from you right now.</p>
        ${guestAccess}
        ${renderSubtleThankYou('Thank you for your patience and for choosing Resourceful Print Solutions.')}
      </div>
    `;
  } else if (isCancelled) {
    ctaBlock = `
      <div style="${STYLES.ctaSection}">
        <p style="${STYLES.sectionMessage}">If you did not request this or believe it was a mistake, please contact our support team.</p>
        ${renderButton(contactUrl, 'Contact Support')}
        ${guestAccess}
        ${renderSubtleThankYou('Thank you for choosing Resourceful Print Solutions.')}
      </div>
    `;
  } else if (isRefunded) {
    ctaBlock = `
      <div style="${STYLES.ctaSection}">
        ${guestAccess}
        ${renderSubtleThankYou('Thank you for choosing Resourceful Print Solutions.')}
      </div>
    `;
  } else if (guestAccess) {
    ctaBlock = `<div style="${STYLES.ctaSection}">${guestAccess}</div>`;
  }

  const content = `
    ${greeting}
    ${refundMessageBlock}
    ${statusLine}
    ${bodyParagraph}
    ${details}
    ${orderSummary}
    ${ctaBlock}
  `;

  const textRows = statusRows
    .filter((r) => r.value != null && String(r.value).trim() !== '')
    .map((r) => `${r.label}: ${r.value}`)
    .join(' ');
  const textMessage = isShipped
    ? 'Your package is on its way.'
    : isOnHold
      ? 'Your order is on hold and will continue once it is ready. No action is needed from you right now.'
      : isCancelled
        ? 'If you did not request this or believe it was a mistake, please contact our support team.'
        : isRefunded
          ? [
              refundAmountLabel
                ? `A refund of ${refundAmountLabel} has been processed.`
                : 'Your refund has been processed.',
              'It may take a few business days to appear on your original payment method.',
            ].join(' ')
          : body;
  return {
    subject,
    text: [
      isShipped
        ? `Order Shipped. Order ${number}.`
        : isOnHold
          ? `Order On Hold. Order ${number}.`
          : isCancelled
            ? `Order Cancelled. Order ${number}.`
            : isRefunded
              ? `Order Refunded. Order ${number}.`
              : `Order ${number} is now ${meta.label}.${textMessage ? ` ${textMessage}` : ''}`,
      textRows,
      isHeadlineStatus ? textMessage : '',
      isCancelled ? `Contact Support: ${contactUrl}` : '',
      isGuest && orderUrl
        ? [
            'Since you checked out as a guest, save the link below to securely view your latest order status.',
            orderUrl,
          ].join('\n')
        : '',
      isShipped
        ? 'Thank you for choosing Resourceful Print Solutions. We appreciate your business.'
        : isOnHold
          ? 'Thank you for your patience and for choosing Resourceful Print Solutions.'
          : isCancelled || isRefunded
            ? 'Thank you for choosing Resourceful Print Solutions.'
            : '',
    ]
      .filter(Boolean)
      .join('\n'),
    html: buildBaseLayout({
      title,
      titleAlign,
      titleAccent: isHeadlineStatus,
      preheader,
      content,
      logoUrl: resolveEmailLogoUrl(appUrl),
      appUrl,
      uniqueRef: emailUniqueRef(`${meta.status || 'status'}-${number}`),
    }),
  };
}

module.exports = {
  buildPasswordResetEmail,
  buildPasswordChangedEmail,
  buildOrderConfirmationEmail,
  buildOrderStatusEmail,
};
