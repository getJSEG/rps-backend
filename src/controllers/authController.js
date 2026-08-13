const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/database');
const { generateToken } = require('../utils/jwt');
const { sendPasswordResetEmail, sendPasswordChangedEmail } = require('../services/emailService');
const STRONG_PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).+$/;

const register = async (req, res) => {
  try {
    const {
      email,
      password,
      fullName,
      hearAboutUs,
      streetAddress,
      addressLine2,
      city,
      state,
      postcode,
      telephone,
      shippingSameAsBilling,
      shippingStreetAddress,
      shippingAddressLine2,
      shippingCity,
      shippingState,
      shippingPostcode,
      shippingCountry,
      newsletter,
      termsAccepted
    } = req.body;

    // Base required fields
    if (!email || !password || !fullName) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Terms acceptance must be explicit
    if (termsAccepted !== true) {
      return res.status(400).json({ message: 'Please accept the terms and conditions' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (!STRONG_PASSWORD_REGEX.test(password)) {
      return res.status(400).json({ message: 'Password must include at least one uppercase letter and one number' });
    }

    // Validate shipping address if not same as billing
    if (shippingSameAsBilling === false) {
      if (!shippingStreetAddress || !shippingCity || !shippingState || !shippingPostcode) {
        return res.status(400).json({ message: 'Shipping address fields are required when shipping address is different from billing' });
      }
    }

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, hear_about_us, telephone, newsletter, role, is_approved)
         VALUES ($1, $2, $3, $4, $5, $6, 'customer', true)
         RETURNING id, email, full_name, role, is_active, is_approved`,
        [email, passwordHash, fullName, hearAboutUs, telephone, newsletter || false]
      );

      const user = userResult.rows[0];

      // Create default billing address
      if (streetAddress && city && state && postcode) {
        await client.query(
          `INSERT INTO addresses (user_id, street_address, address_line2, city, state, postcode, country, is_default, address_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'billing')`,
          [user.id, streetAddress, addressLine2 || null, city, state, postcode, 'United States']
        );
      }

      // Create shipping address
      // If shipping same as billing, use billing address data
      const finalShippingStreetAddress = shippingSameAsBilling ? streetAddress : shippingStreetAddress;
      const finalShippingAddressLine2 = shippingSameAsBilling ? (addressLine2 || null) : (shippingAddressLine2 || null);
      const finalShippingCity = shippingSameAsBilling ? city : shippingCity;
      const finalShippingState = shippingSameAsBilling ? state : shippingState;
      const finalShippingPostcode = shippingSameAsBilling ? postcode : shippingPostcode;
      const finalShippingCountry = shippingCountry || 'United States';

      if (finalShippingStreetAddress && finalShippingCity && finalShippingState && finalShippingPostcode) {
        await client.query(
          `INSERT INTO addresses (user_id, street_address, address_line2, city, state, postcode, country, is_default, address_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'shipping')`,
          [user.id, finalShippingStreetAddress, finalShippingAddressLine2, finalShippingCity, finalShippingState, finalShippingPostcode, finalShippingCountry]
        );
      }

      await client.query('COMMIT');

      // Generate token
      const token = generateToken(user.id);

      res.status(201).json({
        message: 'Registration successful.',
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          isApproved: user.is_approved
        },
        token
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
};

/** Create admin user - requires ADMIN_CREATE_SECRET in body (set in env). Use from Postman only. */
const createAdmin = async (req, res) => {
  try {
    const { email, password, fullName, adminSecret } = req.body;
    const secret = process.env.ADMIN_CREATE_SECRET;
    const secretTrimmed = typeof secret === 'string' ? secret.trim() : '';
    if (!secretTrimmed) {
      return res.status(403).json({
        message: 'Forbidden. ADMIN_CREATE_SECRET is not set on the server. Add it in Railway: Backend service → Variables → ADMIN_CREATE_SECRET = your secret, then Redeploy.',
      });
    }
    const bodySecret = (req.body.adminSecret != null ? String(req.body.adminSecret) : '').trim();
    if (bodySecret !== secretTrimmed) {
      return res.status(403).json({
        message: 'Forbidden. adminSecret in body does not match ADMIN_CREATE_SECRET on server. Check spelling and spaces.',
      });
    }
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (!STRONG_PASSWORD_REGEX.test(password)) {
      return res.status(400).json({ message: 'Password must include at least one uppercase letter and one number' });
    }
    const existing = await pool.query('SELECT id, email, role FROM users WHERE email = $1', [email]);
    const passwordHash = await bcrypt.hash(password, 10);
    const name = fullName || 'Admin';
    if (existing.rows.length > 0) {
      await pool.query(
        'UPDATE users SET role = $1, password_hash = $2, full_name = $3, is_active = $4, is_approved = $5 WHERE id = $6',
        ['admin', passwordHash, name, true, true, existing.rows[0].id]
      );
      const user = { id: existing.rows[0].id, email, full_name: name, role: 'admin', is_approved: true };
      const token = generateToken(user.id);
      return res.status(200).json({ message: 'User updated to admin', user, token });
    }
    let result;
    try {
      result = await pool.query(
        `INSERT INTO users (email, password_hash, full_name, role, is_active, is_approved)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, full_name, role, is_active, is_approved`,
        [email, passwordHash, name, 'admin', true, true]
      );
    } catch (err) {
      if (err.message && err.message.includes('full_name')) {
        result = await pool.query(
          `INSERT INTO users (email, password_hash, role, is_active, is_approved)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, email, role, is_active, is_approved`,
          [email, passwordHash, 'admin', true, true]
        );
      } else throw err;
    }
    const row = result.rows[0];
    const user = { id: row.id, email: row.email, full_name: row.full_name || name, role: 'admin', is_approved: true };
    const token = generateToken(row.id);
    res.status(201).json({ message: 'Admin created', user, token });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ message: 'Create admin failed' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    let result;
    try {
      result = await pool.query(
        `SELECT id, email, password_hash, full_name, role, is_active, is_approved,
                deletion_requested_at, deletion_scheduled_at
         FROM users WHERE email = $1`,
        [email]
      );
    } catch (err) {
      if (err.message && /deletion_requested_at|deletion_scheduled_at/i.test(err.message)) {
        result = await pool.query(
          'SELECT id, email, password_hash, full_name, role, is_active, is_approved FROM users WHERE email = $1',
          [email]
        );
      } else if (err.message && err.message.includes('does not exist')) {
        result = await pool.query(
          'SELECT id, email, password_hash, role, is_active, is_approved FROM users WHERE email = $1',
          [email]
        );
      } else {
        throw err;
      }
    }

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const fullName = user.full_name != null ? user.full_name : user.email;

    // Check if account is active
    if (!user.is_active) {
      return res.status(403).json({ message: 'Account is inactive' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(user.id);
    const pendingDeletion = !!user.deletion_requested_at;

    res.json({
      message: pendingDeletion
        ? 'Login successful. Your account is scheduled for deletion.'
        : 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: fullName,
        role: user.role,
        isApproved: user.is_approved,
        pendingDeletion,
        deletionRequestedAt: user.deletion_requested_at || null,
        deletionScheduledAt: user.deletion_scheduled_at || null,
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
};

const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, full_name, hear_about_us, telephone, newsletter, role, is_active, is_approved
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to get profile' });
  }
};

/** Shared with the reset email so the stored expiry and the wording in the email always agree. */
function resetTokenTtlMinutes() {
  const n = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function buildResetUrl(rawToken) {
  const base = (process.env.FRONTEND_URL || process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

/**
 * The response is identical for unknown, inactive and existing accounts so the endpoint cannot be
 * used to enumerate customers. Delivery problems are logged, never surfaced.
 */
const GENERIC_FORGOT_RESPONSE = 'If an account exists for this email, a password reset link has been sent.';

/** POST /auth/forgot-password - email a single-use reset link. Body: { email } */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }
    const normalizedEmail = email.trim().toLowerCase();

    const userResult = await pool.query(
      'SELECT id, is_active, full_name FROM users WHERE email = $1',
      [normalizedEmail]
    );
    const user = userResult.rows[0];

    if (user && user.is_active !== false) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + resetTokenTtlMinutes() * 60 * 1000);

      await pool.query(
        'UPDATE users SET reset_token_hash = $1, reset_token_expires_at = $2 WHERE id = $3',
        [hashResetToken(rawToken), expiresAt, user.id]
      );

      const { sent, error } = await sendPasswordResetEmail(normalizedEmail, buildResetUrl(rawToken), {
        name: user.full_name || '',
      });
      if (!sent) {
        console.warn('[auth] password reset email not sent for user', user.id, error || 'no error');
      }
    }

    res.json({ message: GENERIC_FORGOT_RESPONSE });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Failed to process password reset request' });
  }
};

/** POST /auth/reset-password - consume a reset link token. Body: { token, newPassword } */
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ message: 'Reset token is required' });
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ message: 'New password is required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    if (!STRONG_PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({ message: 'New password must include at least one uppercase letter and one number' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Clearing the token in the same statement that matches it makes the link single-use even if
    // two requests arrive at once - only one of them can see a non-null hash.
    const result = await pool.query(
      `UPDATE users
         SET password_hash = $1,
             reset_token_hash = NULL,
             reset_token_expires_at = NULL,
             updated_at = CURRENT_TIMESTAMP
       WHERE reset_token_hash = $2 AND reset_token_expires_at > NOW()
       RETURNING id, email`,
      [passwordHash, hashResetToken(token.trim())]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    const { id: userId, email } = result.rows[0];

    // Notify user about password change (best-effort, non-blocking)
    sendPasswordChangedEmail(email).catch((e) => {
      console.warn('[auth] password changed notification not sent for user', userId, e && e.message ? e.message : e);
    });

    res.json({ message: 'Password reset successfully. You can now sign in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
};

module.exports = { register, login, getProfile, forgotPassword, resetPassword, createAdmin };

