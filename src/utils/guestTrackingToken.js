/**
 * Guest order tracking tokens.
 *
 * A guest has no account, so the raw token in the tracking link is the only credential
 * for the order. Two derivations of it are stored:
 *   - `guest_tracking_token_hash`  one-way, used to verify an incoming link
 *   - `guest_tracking_token_cipher` reversible, so background senders (Stripe webhook,
 *     admin status change, FedEx shipment) can rebuild the link for a notification email
 *
 * The hash stays the sole basis for authorization; the cipher only ever feeds link
 * building. Both are derived from the same server secret, so rotating that secret
 * invalidates existing guest links either way.
 */
const crypto = require('crypto');

const GUEST_TRACKING_TOKEN_BYTES = 32;
const CIPHER_VERSION = 'v1';
const CIPHER_ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

/** Unchanged from the original inline helper: existing stored hashes must keep verifying. */
function guestTrackingPepper() {
  return String(
    process.env.GUEST_TRACKING_TOKEN_PEPPER || process.env.JWT_SECRET || 'rps-guest-tracking-pepper'
  );
}

/** Separate label keeps the encryption key from being the same value as the hash pepper. */
function encryptionKey() {
  const secret = String(process.env.GUEST_TRACKING_TOKEN_SECRET || '').trim() || guestTrackingPepper();
  return crypto.createHash('sha256').update(`guest-tracking-cipher:${secret}`).digest();
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

/**
 * @returns {string|null} `v1.<iv>.<tag>.<ciphertext>` in base64url, or null for an empty token
 */
function encryptGuestTrackingToken(token) {
  const plain = String(token || '');
  if (!plain) return null;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(CIPHER_ALGO, encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    CIPHER_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    body.toString('base64url'),
  ].join('.');
}

/**
 * Never throws: a missing column, a pre-cipher order, or a rotated secret all mean
 * "no link available", which the email templates already handle by omitting the button.
 * @returns {string|null} the raw token, or null when it cannot be recovered
 */
function decryptGuestTrackingToken(stored) {
  const raw = String(stored || '').trim();
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 4 || parts[0] !== CIPHER_VERSION) return null;
  try {
    const decipher = crypto.createDecipheriv(
      CIPHER_ALGO,
      encryptionKey(),
      Buffer.from(parts[1], 'base64url')
    );
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(parts[3], 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return plain || null;
  } catch (e) {
    console.warn('[guest-token] could not decrypt tracking token');
    return null;
  }
}

module.exports = {
  createGuestTrackingTokenPlain,
  hashGuestTrackingToken,
  encryptGuestTrackingToken,
  decryptGuestTrackingToken,
};
