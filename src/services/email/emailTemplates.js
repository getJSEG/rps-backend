const {
  escapeHtml,
  formatCurrency,
  formatDate,
  orderNumberOf,
  customerNameOf,
  buildOrderUrl,
  buildTrackingUrl,
  renderButton,
  renderLink,
  renderKeyValue,
  renderAddress,
  buildBaseLayout,
  renderOrderItemsTable,
  renderTotals,
} = require('./emailLayout');
const { STYLES } = require('./emailStyles');
const { getStatusMeta } = require('./emailStatusRegistry');

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

/** Footer copy may mark emphasis with **bold**; escape everything else. */
function escapeWithBold(text) {
  return String(text || '')
    .split(/\*\*/)
    .map((part, i) => (i % 2 === 1 ? `<strong>${escapeHtml(part)}</strong>` : escapeHtml(part)))
    .join('');
}

function isSignOffLine(line) {
  return /choosing resourceful print solutions/i.test(String(line || ''));
}

/** Full-width centered sign-off — text-align on <p> is unreliable in Gmail/Outlook. */
function renderSignOff(line) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="${STYLES.signOffTable}"><tr><td align="center" style="${STYLES.signOffCell}">${escapeWithBold(line)}</td></tr></table>`;
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
  cod: 'Cash on delivery',
};

function paymentMethodLabel(order = {}) {
  const raw = String(order.payment_method || '').trim().toLowerCase();
  if (!raw) return null;
  return PAYMENT_METHOD_LABELS[raw] || humanize(raw);
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

function buildOrderTotals(order = {}) {
  return renderTotals([
    { label: 'Subtotal', value: money(order.subtotal_amount) },
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

/** Shared confirmation-style order block: meta, line items, totals, shipping address. */
function renderOrderSummaryBlock(
  order = {},
  { omitPaymentMethod = false, omitPaymentStatus = false, omitAddress = false, footerMessage = '' } = {}
) {
  const number = orderNumberOf(order);
  const metaRows = [
    { label: 'Order number', value: number },
    { label: 'Order date', value: formatDate(order.created_at) },
  ];
  if (!omitPaymentMethod) {
    metaRows.push({ label: 'Payment method', value: paymentMethodLabel(order) });
  }
  if (!omitPaymentStatus) {
    metaRows.push({ label: 'Payment status', value: paymentStatusLabel(order) });
  }
  const details = renderKeyValue(metaRows);
  let bottom = '';
  const resolvedFooter = typeof footerMessage === 'function' ? footerMessage(order) : footerMessage;
  const footerLines = Array.isArray(resolvedFooter)
    ? resolvedFooter.map((line) => String(line || '').trim()).filter(Boolean)
    : String(resolvedFooter || '')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
  if (footerLines.length) {
    bottom = footerLines
      .map((line) =>
        isSignOffLine(line)
          ? renderSignOff(line)
          : `<p style="${STYLES.note}">${escapeWithBold(line)}</p>`
      )
      .join('');
  } else if (!omitAddress) {
    bottom = isStorePickup(order)
      ? `<p style="${STYLES.sectionTitle}">Collection</p><p style="${STYLES.address}">This order is set for store pickup. We will let you know when it is ready to collect.</p>`
      : renderAddress(order);
  }
  return `
    ${details}
    ${renderOrderItemsTable(order.items)}
    ${buildOrderTotals(order)}
    ${bottom}
  `;
}

function buildPasswordResetEmail({ resetUrl = '', expiresMinutes = 30, appUrl = '', name = '' } = {}) {
  const target = String(resetUrl || '').trim() || null;
  const minutes = Number(expiresMinutes);
  const displayName = String(name || '').trim();
  const greeting = displayName ? `Hello ${displayName},` : 'Hello,';
  const content = `
    <p>${escapeHtml(greeting)}</p>
    <p>Click the button below to securely create a new password.</p>
    ${renderButton(target, 'Reset your password', { centered: true })}
    <p>For your security, this link will expire in ${minutes} minutes and can only be used once.</p>
    <p>If you did not request a password reset, no action is required. Your current password will remain unchanged.</p>
    <p>For your protection, please do not share this password reset link with anyone.</p>
    <p>Thank you,<br>Resourceful Print Solutions</p>
  `;
  return {
    subject: 'Reset Your RPS Password',
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
      title: 'Reset your password',
      titleAlign: 'center',
      preheader: '',
      content,
      logoUrl: resolveEmailLogoUrl(appUrl),
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
    <p>The password for your RPS Store account was changed successfully.</p>
    ${renderLink(target, 'Sign in to your account')}
    <p style="${STYLES.note}">If you did not make this change, contact us immediately so we can secure your account.</p>
  `;
  return {
    subject: 'Your RPS Password Was Changed',
    text: 'The password for your RPS Store account was changed successfully. If this was not you, contact us immediately.',
    html: buildBaseLayout({
      title: 'Password changed',
      preheader: 'Your account password was updated',
      content,
      logoUrl: resolveEmailLogoUrl(appUrl),
      uniqueRef: emailUniqueRef('password-changed'),
    }),
  };
}

function buildOrderConfirmationEmail(order = {}, { appUrl = '', guestToken = null } = {}) {
  const number = orderNumberOf(order);
  const name = customerNameOf(order);
  const isGuest = !order.user_id && !order.userId;
  const orderUrl = buildOrderUrl({ order, appUrl, guestToken });

  const guestSaveLink = isGuest
    ? `
      <p>Since you checked out as a guest, please save the tracking link below. You can use it anytime to securely view your latest order status and updates.</p>
      ${orderUrl ? `<p style="${STYLES.urlText}"><a href="${escapeHtml(orderUrl)}" style="${STYLES.link}">${escapeHtml(orderUrl)}</a></p>` : ''}
    `
    : '';

  const closing = `
    <p>Thank you for your order. We&rsquo;ve received it successfully, and your order is now confirmed.</p>
    ${guestSaveLink}
    ${orderUrl ? renderButton(orderUrl, 'Track Your Order') : ''}
    <p>We&rsquo;ll keep you informed as your order progresses. If you have any questions, please contact our support team.</p>
    ${renderSignOff('Thank you for choosing Resourceful Print Solutions.')}
  `;

  const content = `
    ${renderOrderSummaryBlock(order, { omitPaymentMethod: true, omitAddress: true })}
    ${closing}
  `;
  return {
    subject: `Order #${number} Confirmed`,
    text: [
      `Order ${number} confirmed. Total: ${money(order.total_amount) || formatCurrency(0)}`,
      'Thank you for your order. We have received it successfully, and your order is now confirmed.',
      isGuest
        ? 'Since you checked out as a guest, please save the tracking link below. You can use it anytime to securely view your latest order status and updates.'
        : '',
      orderUrl ? `Track Your Order: ${orderUrl}` : '',
      "We'll keep you informed as your order progresses. If you have any questions, please contact our support team.",
      'Thank you for choosing Resourceful Print Solutions.',
    ]
      .filter(Boolean)
      .join('\n'),
    html: buildBaseLayout({
      title: `Dear ${name},`,
      preheader: '',
      content,
      logoUrl: resolveEmailLogoUrl(appUrl),
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

/**
 * Status-specific facts, pulled only from populated columns. A status reached without the
 * usual side effects (for example an admin setting `shipped` with no FedEx shipment)
 * simply yields fewer rows.
 */
function statusDetailRows(order = {}, status = '') {
  if (status === 'shipped') {
    return [
      { label: 'Tracking number', value: String(order.order_tracking_id || '').trim() },
    ];
  }
  if (status === 'refunded') {
    return [
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
  const orderUrl = buildOrderUrl({ order, appUrl, guestToken });
  const trackingUrl = meta.status === 'shipped' ? buildTrackingUrl(order) : null;
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

  const details = renderKeyValue(statusDetailRows(order, meta.status));

  // Only mention a refund on a cancellation when one has actually been recorded.
  let extra = '';
  if (meta.status === 'cancelled') {
    const refundedOn = formatDate(order.refunded_at);
    const refundedAmount = money(order.refund_amount);
    extra = refundedOn && refundedAmount
      ? `<p>A refund of ${escapeHtml(refundedAmount)} was processed on ${escapeHtml(refundedOn)}.</p>`
      : '';
  }

  const orderSummary = renderOrderSummaryBlock(order, {
    omitPaymentMethod: meta.omitPaymentMethod === true,
    omitPaymentStatus: meta.omitPaymentStatus === true,
    omitAddress: meta.omitAddress === true,
    footerMessage: meta.footerMessage || '',
  });
  const trackingButton = trackingUrl ? renderButton(trackingUrl, 'Track your package') : '';

  // Same guest tracking presentation as confirmation — guests have no account order list.
  let guestLinkBlock = '';
  if (isGuest && orderUrl) {
    guestLinkBlock = `
      <p>Since you checked out as a guest, please save the tracking link below. You can use it anytime to securely view your latest order status and updates.</p>
      <p style="${STYLES.urlText}"><a href="${escapeHtml(orderUrl)}" style="${STYLES.link}">${escapeHtml(orderUrl)}</a></p>
      ${renderButton(orderUrl, 'Track Your Order')}
    `;
  }

  // Name-as-header layout (on_hold, shipped, cancelled, refunded): skip the duplicate "Hello …" line.
  const nameAsHeading = meta.heading == null;
  const greeting = nameAsHeading ? '' : `<p>Hello ${escapeHtml(name)},</p>`;
  const bodyParagraph = body ? `<p>${escapeHtml(body)}</p>` : '';

  const content = `
    ${greeting}
    <p>Order #${escapeHtml(number)} is now ${escapeHtml(meta.label)}.</p>
    ${bodyParagraph}
    ${details}
    ${extra}
    ${orderSummary}
    ${guestLinkBlock}
    ${trackingButton}
  `;

  const title = nameAsHeading ? `Dear ${name},` : (meta.heading || 'Order update');

  const textRows = statusDetailRows(order, meta.status)
    .filter((r) => r.value != null && String(r.value).trim() !== '')
    .map((r) => `${r.label}: ${r.value}`)
    .join(' ');
  return {
    subject,
    text: [
      `Order ${number} is now ${meta.label}.${body ? ` ${body}` : ''}${textRows ? ` ${textRows}` : ''}`,
      isGuest && orderUrl
        ? [
            'Since you checked out as a guest, please save the tracking link below. You can use it anytime to securely view your latest order status and updates.',
            `Track Your Order: ${orderUrl}`,
          ].join('\n')
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    html: buildBaseLayout({
      title,
      preheader,
      content,
      logoUrl: resolveEmailLogoUrl(appUrl),
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
