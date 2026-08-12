/**
 * Customer-facing copy for each order status.
 * Keep in sync with customerOrderStatusDescription in rps-frontend src/utils/orderStatuses.ts
 * so the email wording matches what the customer sees in the portal.
 */

/** Legacy / alternate DB values mapped onto the current pipeline. */
const LEGACY_STATUS_ALIASES = {
  pending: 'awaiting_artwork',
  complete: 'completed',
  delivered: 'completed',
  approval_needed: 'awaiting_customer_approval',
  refund: 'awaiting_refund',
  canceled: 'cancelled',
};

function canonicalOrderStatus(raw) {
  const s = String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
  return LEGACY_STATUS_ALIASES[s] || s;
}

/**
 * `notify: true` is the whitelist of statuses that email the customer. Everything else is
 * internal-only pipeline movement. Non-notifying statuses keep a `label` so that a status
 * still renders correctly if it ever reaches a template.
 */
const STATUS_REGISTRY = {
  pending_payment: {
    label: 'Pending payment',
    notify: false,
  },
  awaiting_artwork: {
    label: 'Awaiting artwork',
    notify: false,
  },
  cancellation_requested: {
    label: 'Cancellation requested',
    notify: false,
  },
  awaiting_customer_approval: {
    label: 'Awaiting your approval',
    notify: false,
  },
  processing: {
    label: 'Processing',
    notify: false,
  },
  printing: {
    label: 'Printing',
    notify: false,
  },
  trimming: {
    label: 'Trimming',
    notify: false,
  },
  reprint: {
    label: 'Reprint',
    notify: false,
  },
  on_hold: {
    label: 'On hold',
    notify: true,
    subject: (number) => `Order #${number} Is On Hold`,
    // Title is the customer name (set in the template). No visible preheader.
    heading: null,
    preheader: '',
    body: '',
    omitPaymentMethod: true,
    omitAddress: true,
    footerMessage:
      'Your order is temporarily on hold. We will notify you when its ready to be processed.',
  },
  shipped: {
    label: 'Shipped',
    notify: true,
    subject: (number) => `Your Order #${number} Has Shipped`,
    // Same layout as on_hold: customer name as title, message where address was.
    heading: null,
    preheader: '',
    body: '',
    omitPaymentMethod: true,
    omitAddress: true,
    footerMessage:
      'Your order has been shipped and the carrier now has the package.',
  },
  completed: {
    label: 'Completed',
    notify: false,
  },
  awaiting_refund: {
    label: 'Awaiting refund',
    notify: false,
  },
  refunded: {
    label: 'Refunded',
    notify: true,
    subject: (number) => `Refund Processed for Order #${number}`,
    // Same layout as on_hold / shipped: customer name as title, message where address was.
    heading: null,
    preheader: '',
    body: '',
    omitPaymentMethod: true,
    omitAddress: true,
    footerMessage:
      'Your refund has been processed. It may take a few business days for the amount to appear on your original payment method.',
  },
  cancelled: {
    label: 'Cancelled',
    notify: true,
    subject: (number) => `Order #${number} Cancelled`,
    // Same layout as on_hold / shipped: customer name as title, message where address was.
    heading: null,
    preheader: '',
    body: '',
    omitPaymentMethod: true,
    omitPaymentStatus: true,
    omitAddress: true,
    footerMessage:
      'Contact us if you believe this was a mistake.',
  },
};

function humanizeStatus(status) {
  return String(status || '')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * @returns {{ status: string, label: string, notify: boolean, subject?: Function, heading?: string, preheader?: Function, body?: string }}
 */
function getStatusMeta(status) {
  const canonical = canonicalOrderStatus(status);
  const entry = STATUS_REGISTRY[canonical];
  if (!entry) {
    return { status: canonical, label: humanizeStatus(canonical), notify: false };
  }
  return { status: canonical, ...entry };
}

/** Whether a status change should trigger a customer email. */
function shouldNotifyForStatus(status) {
  return getStatusMeta(status).notify === true;
}

module.exports = {
  canonicalOrderStatus,
  getStatusMeta,
  shouldNotifyForStatus,
};
