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
    // Centered status title under the logo; greeting + CTA are built in the template.
    heading: 'Order On Hold',
    titleAlign: 'center',
    preheader: '',
    body: '',
    omitPaymentMethod: true,
    omitAddress: true,
    // One short explanation + thank-you are rendered in the template.
    footerMessage: '',
  },
  shipped: {
    label: 'Shipped',
    notify: true,
    subject: (number) => `Your Order #${number} Has Shipped`,
    // Centered status title under the logo; greeting + CTA are built in the template.
    heading: 'Order Shipped',
    titleAlign: 'center',
    preheader: '',
    body: '',
    omitPaymentMethod: true,
    omitAddress: true,
    // Carrier / delivery are detail rows; one CTA message is rendered in the template.
    footerMessage: '',
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
    // Centered status title under the logo; greeting + CTA are built in the template.
    heading: 'Order Refunded',
    titleAlign: 'center',
    preheader: '',
    body: '',
    omitPaymentMethod: true,
    omitAddress: true,
    footerMessage: '',
  },
  cancelled: {
    label: 'Cancelled',
    notify: true,
    subject: (number) => `Order #${number} Cancelled`,
    // Centered status title under the logo; greeting + CTA are built in the template.
    heading: 'Order Cancelled',
    titleAlign: 'center',
    preheader: '',
    body: '',
    omitPaymentMethod: true,
    // Show payment status so customers can tell whether a refund may apply.
    omitPaymentStatus: false,
    omitAddress: true,
    footerMessage: '',
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
