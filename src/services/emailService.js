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

function isTestMode() {
  const v = String(process.env.EMAIL_TEST_MODE || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function testRecipientOverride() {
  return (process.env.EMAIL_TEST_RECIPIENT || '').trim() || null;
}

function logFailure(event, recipient, result) {
  console.warn(
    `[email] ${event} not sent to ${recipient || '(no recipient)'}:`,
    result?.error || 'unknown error',
    result?.body ? JSON.stringify(result.body) : ''
  );
}

/**
 * Banner naming the real recipient, so a redirected developer copy still shows who the
 * customer would have been.
 */
function devRedirectNotice(intendedRecipient) {
  return `<div style="margin:0 0 16px;padding:10px 12px;background:#fff7ed;border:1px solid #fdba74;color:#7c2d12;font:13px Arial,Helvetica,sans-serif;">
    <strong>[DEV]</strong> EMAIL_TEST_MODE is on. In production this would have been sent to <strong>${escapeForNotice(intendedRecipient)}</strong>.
  </div>`;
}

function escapeForNotice(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Single exit point for outbound mail.
 *
 * Test mode has two shapes: with EMAIL_TEST_RECIPIENT set the message is really delivered
 * to that address (subject tagged, real recipient named in the body) so templates can be
 * reviewed in an inbox; without one it degrades to logging so a misconfigured environment
 * can never reach a customer.
 *
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

  const testMode = isTestMode();
  const override = testMode ? testRecipientOverride() : null;

  if (testMode && !override) {
    console.log('[EMAIL] Test mode enabled, no EMAIL_TEST_RECIPIENT set - logging only');
    console.log('[EMAIL]', event, 'would go to', recipient, '| subject:', subject);
    return { sent: true, mode: 'test', event, preview: { to: recipient, subject, html, text } };
  }

  const finalTo = override || recipient;
  const finalSubject = override ? `[DEV] ${subject}` : subject;
  const finalHtml = override ? `${devRedirectNotice(recipient)}${html}` : html;
  const finalText = override ? `[DEV] Intended recipient: ${recipient}\n\n${text || ''}` : text;

  if (override) {
    console.log('[EMAIL] Test mode enabled, redirected to developer recipient', finalTo);
  }

  const key = (process.env.RESEND_API_KEY || '').trim();
  if (!key) {
    const result = { sent: false, error: 'RESEND_API_KEY not set', event };
    logFailure(event, finalTo, result);
    return result;
  }
  try {
    const { data, error } = await getClient(key).emails.send({
      from,
      to: [finalTo],
      subject: finalSubject,
      html: finalHtml,
      text: finalText,
      // Helps Gmail keep each send out of a clipped conversation thread.
      headers: {
        'X-Entity-Ref-ID': `${event}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      },
    });
    if (error) {
      const result = { sent: false, error: error.message || 'resend failed', body: error, event };
      logFailure(event, finalTo, result);
      return result;
    }
    console.log('[EMAIL]', event, 'sent to', finalTo, '| Resend ID:', data?.id || null);
    return {
      sent: true,
      id: data?.id || null,
      event,
      ...(override ? { mode: 'redirected', intendedRecipient: recipient } : {}),
    };
  } catch (err) {
    const result = { sent: false, error: String(err.message || err), event };
    logFailure(event, finalTo, result);
    return result;
  }
}

function readResetTokenTtlMinutes() {
  const n = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

async function sendPasswordResetEmail(to, resetUrl) {
  const appUrl = readAppUrl();
  const tpl = templates.buildPasswordResetEmail({
    resetUrl,
    expiresMinutes: readResetTokenTtlMinutes(),
    appUrl,
  });
  return sendRaw({ to, subject: tpl.subject, html: tpl.html, text: tpl.text, event: 'password reset' });
}

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
