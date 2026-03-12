/**
 * Send email via SMTP (e.g. Gmail).
 * Set in .env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * For Gmail: use App Password (not normal password). https://support.google.com/accounts/answer/185833
 */
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 587;
  const user = process.env.SMTP_USER;
  const pass = (process.env.SMTP_PASS || '').trim();
  const from = process.env.SMTP_FROM || user;
  if (!host || !user || !pass || pass === 'PASTE_YOUR_16_CHAR_APP_PASSWORD_HERE') {
    return null;
  }
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: port === '465',
      auth: { user, pass },
    });
    return transporter;
  } catch (err) {
    console.error('Email transporter error:', err.message);
    return null;
  }
}

/**
 * Send password reset code to email.
 * @param {string} to - Recipient email
 * @param {string} code - 6-digit code
 * @returns {Promise<{ sent: boolean, error?: string }>}
 */
async function sendPasswordResetCode(to, code) {
  const trans = getTransporter();
  if (!trans) {
    console.log(`[Email not configured] Password reset code for ${to}: ${code}`);
    return { sent: false, error: 'SMTP_PASS missing in .env. Add Gmail App Password and restart server. See: https://myaccount.google.com/apppasswords' };
  }
  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    await trans.sendMail({
      from: from || 'noreply@example.com',
      to,
      subject: 'Your password reset code',
      text: `Your password reset code is: ${code}\n\nIt expires in 15 minutes.\n\nIf you did not request this, please ignore this email.`,
      html: `
        <p>Your password reset code is: <strong>${code}</strong></p>
        <p>It expires in 15 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
      `,
    });
    return { sent: true };
  } catch (err) {
    console.error('Send email error:', err);
    return { sent: false, error: err.message };
  }
}

module.exports = { sendPasswordResetCode, getTransporter };
