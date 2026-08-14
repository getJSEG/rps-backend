const { Resend } = require('resend');
const templates = require('./email/emailTemplates');

let cachedClient = null;
let cachedKey = null;

function getClient(apiKey) {
  if (cachedClient && cachedKey === apiKey) return cachedClient;
  cachedClient = new Resend(apiKey);
  cachedKey = apiKey;
  return cachedClient;
}

function readAppUrl() {
  return (process.env.FRONTEND_URL || process.env.APP_BASE_URL || '').trim();
}

function readFrom() {
  return (process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || process.env.SMTP_FROM || '').trim();
}

function logFailure(event, recipient, result) {
  console.warn(
    `[email] ${event} not sent to ${recipient || '(no recipient)'}:`,
    result?.error || 'unknown error',
    result?.body ? JSON.stringify(result.body) : ''
  );
}

/**
 * Single exit point for outbound mail via Resend.
 * Never throws and never logs message bodies, because callers pass reset links through here.
 */
async function sendRaw({ to, subject, html, text, event = 'email' }) {
  const recipient = String(to || '').trim().toLowerCase();
  if (!recipient) {
    const result = { sent: false, error: 'no recipient', event };
    logFailure(event, recipient, result);
    return result;
  }
  const from = readFrom() || `no-reply@localhost`;

  const key = (process.env.RESEND_API_KEY || '').trim();
  if (!key) {
    const result = { sent: false, error: 'RESEND_API_KEY not set', event };
    logFailure(event, recipient, result);
    return result;
  }
  try {
    const { data, error } = await getClient(key).emails.send({
      from,
      to: [recipient],
      subject,
      html,
      text,
      // Helps Gmail keep each send out of a clipped conversation thread.
      headers: {
        'X-Entity-Ref-ID': `${event}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      },
    });
    if (error) {
      const result = { sent: false, error: error.message || 'resend failed', body: error, event };
      logFailure(event, recipient, result);
      return result;
    }
    console.log('[EMAIL]', event, 'sent to', recipient, '| Resend ID:', data?.id || null);
    return {
      sent: true,
      id: data?.id || null,
      event,
    };
  } catch (err) {
    const result = { sent: false, error: String(err.message || err), event };
    logFailure(event, recipient, result);
    return result;
  }
}

function readResetTokenTtlMinutes() {
  const n = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/**
 * Auth/account recovery mail — intentionally NOT gated by admin
 * emailNotificationsEnabled. Order notification toggles must never block these.
 */
async function sendPasswordResetEmail(to, resetUrl, { name = '' } = {}) {
  const appUrl = readAppUrl();
  const tpl = templates.buildPasswordResetEmail({
    resetUrl,
    expiresMinutes: readResetTokenTtlMinutes(),
    appUrl,
    name,
  });
  return sendRaw({ to, subject: tpl.subject, html: tpl.html, text: tpl.text, event: 'password reset' });
}

/** Same as reset: always send; ignore order-email notification setting. */
async function sendPasswordChangedEmail(to) {
  const appUrl = readAppUrl();
  const tpl = templates.buildPasswordChangedEmail({ appUrl });
  return sendRaw({ to, subject: tpl.subject, html: tpl.html, text: tpl.text, event: 'password changed' });
}

async function sendOrderConfirmationEmail(order, to, { guestToken = null } = {}) {
  const appUrl = readAppUrl();
  const tpl = templates.buildOrderConfirmationEmail(order, { appUrl, guestToken });
  return sendRaw({ to, subject: tpl.subject, html: tpl.html, text: tpl.text, event: 'order confirmation' });
}

async function sendOrderStatusUpdatedEmail(order, to, nextStatus, { guestToken = null } = {}) {
  const appUrl = readAppUrl();
  const tpl = templates.buildOrderStatusEmail(order, nextStatus, { appUrl, guestToken });
  return sendRaw({ to, subject: tpl.subject, html: tpl.html, text: tpl.text, event: `order ${nextStatus}` });
}

module.exports = {
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendOrderConfirmationEmail,
  sendOrderStatusUpdatedEmail,
};
