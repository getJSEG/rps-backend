const { STYLES } = require('./emailStyles');

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatCurrency = (value) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
};

/** Long-form date for customer-facing timestamps; invalid input yields null so callers can omit the row. */
function formatDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function orderNumberOf(order = {}) {
  return String(order.order_number || order.orderNumber || order.id || '');
}

function customerNameOf(order = {}) {
  return (
    order.user_name ||
    order.guest_checkout?.fullName ||
    order.full_name ||
    order.customer_name ||
    'Customer'
  );
}

/**
 * Destination for the "view order" / guest tracking link.
 * Registered buyers land on their order list; guests need the raw tracking token
 * (passed from checkout or decrypted from guest_tracking_token_cipher).
 * @returns {string|null} absolute url, or null when no usable link exists
 */
function buildOrderUrl({ order = {}, appUrl = '', guestToken = null } = {}) {
  const base = String(appUrl || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  const isGuest = !order.user_id && !order.userId;
  if (!isGuest) return `${base}/orders`;
  const token = String(guestToken || '').trim();
  const orderId = String(order.id || '').trim();
  if (!token || !orderId) return null;
  return `${base}/guest-orders/${encodeURIComponent(orderId)}?token=${encodeURIComponent(token)}`;
}

/**
 * Public carrier tracking page for a real tracking number. Returns null for unknown
 * carriers so the template omits the link rather than guessing a URL.
 */
function buildTrackingUrl(order = {}) {
  const tracking = String(order.order_tracking_id || '').trim();
  if (!tracking) return null;
  const carrier = String(order.carrier || '').trim().toLowerCase();
  if (carrier === 'fedex') {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tracking)}`;
  }
  return null;
}

function renderButton(url, label, { centered = false } = {}) {
  if (!url) return '';
  const inner = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${centered ? ' align="center"' : ` style="${STYLES.buttonTable}"`}><tr><td style="${STYLES.buttonCell}"><a href="${escapeHtml(url)}" style="${STYLES.button}">${escapeHtml(label)}</a></td></tr></table>`;
  if (!centered) return inner;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="${STYLES.buttonWrap}"><tr><td align="center" style="text-align:center;width:100%;">${inner}</td></tr></table>`;
}

function renderLink(url, label) {
  if (!url) return '';
  return `<p><a href="${escapeHtml(url)}" style="${STYLES.link}">${escapeHtml(label)}</a></p>`;
}

/**
 * @param {Array<{label: string, value: string}>} rows already-formatted label/value pairs
 */
function renderKeyValue(rows = []) {
  const usable = rows.filter((r) => r && r.value != null && String(r.value).trim() !== '');
  if (!usable.length) return '';
  const body = usable
    .map(
      (r) =>
        `<tr><td style="${STYLES.kvLabel}">${escapeHtml(r.label)}</td><td style="${STYLES.kvValue}">${escapeHtml(r.value)}</td></tr>`
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${STYLES.kvTable}">${body}</table>`;
}

/** Multi-line postal address block from the shipping_* aliases on the notification query. */
function renderAddress(order = {}, title = 'Shipping address') {
  const lines = [
    order.shipping_street_address,
    order.shipping_address_line2,
    [order.shipping_city, order.shipping_state, order.shipping_postcode].filter(Boolean).join(', '),
    order.shipping_country,
  ]
    .map((l) => String(l ?? '').trim())
    .filter(Boolean);
  if (!lines.length) return '';
  return `<p style="${STYLES.sectionTitle}">${escapeHtml(title)}</p>
    <p style="${STYLES.address}">${lines.map((l) => escapeHtml(l)).join('<br>')}</p>`;
}

function buildBaseLayout({ title, preheader, content, logoUrl, uniqueRef = '', titleAlign = 'left' } = {}) {
  const logo = String(logoUrl || '').trim();
  const logoRow = logo
    ? `<tr><td align="center" style="${STYLES.logoRow}"><img src="${escapeHtml(logo)}" alt="RPS Store" width="180" style="${STYLES.logoImg}" /></td></tr>`
    : '';
  const titleText = String(title || '').trim();
  const preheaderText = String(preheader || '').trim();
  const headingCentered = String(titleAlign || '').toLowerCase() === 'center';
  const headingAlign = headingCentered ? 'center' : 'left';
  const headingExtra = headingCentered ? 'text-align:center;' : '';
  // Gmail shows "⋯" and hides the body when several messages look the same (same footer /
  // layout). A unique per-send marker keeps each email distinct so the full body stays open.
  const clipKey =
    String(uniqueRef || '').trim() ||
    `mail-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const clipBuster = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">${escapeHtml(clipKey)}</div>`;
  const headingBlock = titleText
    ? `<tr>
                    <td align="${headingAlign}" style="${STYLES.headingCell}${headingExtra}">
                      <p style="${STYLES.heading}${headingExtra}">${escapeHtml(titleText)}</p>
                      ${preheaderText ? `<p style="${STYLES.preheader}${headingExtra}">${escapeHtml(preheaderText)}</p>` : ''}
                    </td>
                  </tr>`
    : '';
  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(titleText)}</title>
  </head>
  <body style="${STYLES.body}">
    ${clipBuster}
    ${preheaderText ? `<span style="${STYLES.preheaderHidden}">${escapeHtml(preheaderText)}</span>` : ''}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="${STYLES.canvasTable}">
      <tr>
        <td align="center" style="${STYLES.canvasCell}">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="${STYLES.card}">
            <tr>
              <td style="${STYLES.cardInner}">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  ${logoRow}
                  ${headingBlock}
                </table>
                <div style="${STYLES.content}">${content}</div>
                ${clipBuster}
              </td>
            </tr>
          </table>
          <p style="${STYLES.footer}">&copy; ${new Date().getFullYear()} RPS Store</p>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
}

function renderOrderItemsTable(items) {
  if (!Array.isArray(items) || items.length === 0) return '<p>No items</p>';
  const rows = items
    .map((it) => {
      const name = escapeHtml(it.product_name || it.productName || 'Item');
      const job = String(it.job_name || '').trim();
      const nameCell = job ? `${name}<br><span style="${STYLES.itemMeta}">${escapeHtml(job)}</span>` : name;
      const qty = Number(it.quantity || 1);
      const unit = it.unit_price ?? it.unitPrice;
      const unitCell = unit == null || unit === '' ? '' : formatCurrency(unit);
      const total = formatCurrency(it.total_price ?? it.totalPrice ?? 0);
      return `<tr><td style="${STYLES.td}">${nameCell}</td><td style="${STYLES.tdRight}">${qty}</td><td style="${STYLES.tdRight}">${escapeHtml(unitCell)}</td><td style="${STYLES.tdRight}">${escapeHtml(total)}</td></tr>`;
    })
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="${STYLES.table}">
    <thead><tr>
      <th style="${STYLES.th}">Item</th>
      <th style="${STYLES.thRight}">Qty</th>
      <th style="${STYLES.thRight}">Unit</th>
      <th style="${STYLES.thRight}">Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * Money summary. Rows with null/blank values are dropped so orders without tax or
 * shipping do not render empty lines.
 * @param {Array<{label: string, value: any, strong?: boolean}>} rows
 */
function renderTotals(rows = []) {
  const usable = rows.filter((r) => r && r.value != null && String(r.value).trim() !== '');
  if (!usable.length) return '';
  const body = usable
    .map((r) => {
      const labelStyle = r.strong ? STYLES.totalLabelStrong : STYLES.totalLabel;
      const valueStyle = r.strong ? STYLES.totalValueStrong : STYLES.totalValue;
      return `<tr><td style="${labelStyle}">${escapeHtml(r.label)}</td><td style="${valueStyle}">${escapeHtml(r.value)}</td></tr>`;
    })
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" style="${STYLES.totalsTable}">${body}</table>
    <div style="${STYLES.clear}"></div>`;
}

module.exports = {
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
};
