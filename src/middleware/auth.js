const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const PENDING_DELETION_ALLOWED_PATHS = new Set([
  '/api/users/cancel-deletion',
  '/api/users/deletion-status',
]);

function normalizeApiPath(req) {
  const raw = (req.originalUrl || req.url || '').split('?')[0];
  return raw.replace(/\/+$/, '') || '/';
}

function isPendingDeletionAllowlisted(req) {
  return PENDING_DELETION_ALLOWED_PATHS.has(normalizeApiPath(req));
}

function mapUserRow(row) {
  return {
    ...row,
    pendingDeletion: !!(row && row.deletion_requested_at),
  };
}

async function loadUserById(userId) {
  try {
    return await pool.query(
      `SELECT id, email, full_name, company_name, role, is_active,
              deletion_requested_at, deletion_scheduled_at
       FROM users WHERE id = $1`,
      [userId]
    );
  } catch (err) {
    if (err.message && /does not exist|column/i.test(err.message)) {
      if (/deletion_requested_at|deletion_scheduled_at/i.test(err.message)) {
        try {
          return await pool.query(
            `SELECT id, email, full_name, company_name, role, is_active
             FROM users WHERE id = $1`,
            [userId]
          );
        } catch (err2) {
          if (err2.message && err2.message.includes('does not exist')) {
            return pool.query(
              `SELECT id, email, full_name, role, is_active FROM users WHERE id = $1`,
              [userId]
            );
          }
          throw err2;
        }
      }
      return pool.query(
        `SELECT id, email, full_name, role, is_active FROM users WHERE id = $1`,
        [userId]
      );
    }
    throw err;
  }
}

function rejectIfPendingDeletion(req, res, userRow) {
  if (!userRow || !userRow.deletion_requested_at) return false;
  if (isPendingDeletionAllowlisted(req)) return false;

  res.status(403).json({
    message: 'Your account is scheduled for deletion. Cancel deletion to restore access.',
    code: 'ACCOUNT_PENDING_DELETION',
    deletionRequestedAt: userRow.deletion_requested_at,
    deletionScheduledAt: userRow.deletion_scheduled_at || null,
  });
  return true;
}

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }
    const secret = process.env.JWT_SECRET;
    if (!secret || (typeof secret === 'string' && !secret.trim())) {
      return res.status(500).json({ message: 'Server misconfiguration: JWT_SECRET not set' });
    }
    const decoded = jwt.verify(token, secret);

    const result = await loadUserById(decoded.userId);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Session invalid. Please log in again.' });
    }

    if (!result.rows[0].is_active) {
      return res.status(403).json({ message: 'Account is inactive' });
    }

    if (rejectIfPendingDeletion(req, res, result.rows[0])) {
      return;
    }

    req.user = mapUserRow(result.rows[0]);
    next();
  } catch (error) {
    console.error('authenticateToken error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(500).json({ message: 'Authentication error' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const result = await loadUserById(decoded.userId);
        if (
          result.rows.length > 0 &&
          result.rows[0].is_active &&
          !result.rows[0].deletion_requested_at
        ) {
          req.user = mapUserRow(result.rows[0]);
        }
      } catch (e) {
        // ignore invalid token
      }
    }
    next();
  } catch (error) {
    // If token is invalid, just continue without user
    next();
  }
};

/**
 * Middleware to check if user is admin
 * Must be used after authenticateToken
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  const role = (req.user.role || '').toString().toLowerCase();
  if (role !== 'admin') {
    return res.status(403).json({
      message: 'Access denied. Admin role required.',
      userRole: req.user.role,
    });
  }
  next();
};

/**
 * Middleware to check if user is admin or employee
 * Must be used after authenticateToken
 */
const requireAdminOrEmployee = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const role = (req.user.role || '').toString().toLowerCase();
  if (role !== 'admin' && role !== 'employee') {
    return res.status(403).json({
      message: 'Access denied. Admin or Employee role required.',
      userRole: req.user.role,
    });
  }

  next();
};

/**
 * Cart / pre-checkout: valid JWT (active user) OR X-Guest-Session-Id header (8–128 chars, e.g. UUID).
 * Prefer user when both are sent.
 */
const authenticateTokenOrGuestSession = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const secret = process.env.JWT_SECRET;
      if (secret && String(secret).trim()) {
        try {
          const decoded = jwt.verify(token, secret);
          const result = await loadUserById(decoded.userId);
          if (result.rows.length > 0 && result.rows[0].is_active) {
            if (rejectIfPendingDeletion(req, res, result.rows[0])) {
              return;
            }
            req.user = mapUserRow(result.rows[0]);
            return next();
          }
        } catch (e) {
          if (e.name !== 'JsonWebTokenError' && e.name !== 'TokenExpiredError') {
            throw e;
          }
        }
      }
    }

    const raw =
      req.headers['x-guest-session-id'] ||
      req.headers['X-Guest-Session-Id'] ||
      '';
    const sid = String(raw).trim();
    if (sid.length >= 8 && sid.length <= 128) {
      req.guestSessionId = sid;
      return next();
    }

    return res.status(401).json({
      message:
        'Login or send header X-Guest-Session-Id (e.g. a UUID) for guest cart and checkout.',
    });
  } catch (error) {
    console.error('authenticateTokenOrGuestSession error:', error);
    return res.status(500).json({ message: 'Authentication error' });
  }
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  requireAdminOrEmployee,
  authenticateTokenOrGuestSession,
};
