const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const STRONG_PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).+$/;

const DELETION_GRACE_DAYS = 30;

function isStaffRole(role) {
  const r = (role || '').toString().toLowerCase();
  return r === 'admin' || r === 'employee';
}

const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fullName, telephone, newsletter } = req.body;

    const result = await pool.query(
      `UPDATE users 
       SET full_name = COALESCE($1, full_name),
           telephone = COALESCE($2, telephone),
           newsletter = COALESCE($3, newsletter),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, email, full_name, telephone, newsletter, role, is_active, is_approved`,
      [fullName, telephone, newsletter, userId]
    );

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

const getAllRegisteredUsers = async (req, res) => {
  try {
    // Hide anonymized accounts (post–account-deletion job). Keep the row for orders; don't show in admin list.
    const result = await pool.query(
      `SELECT id, email, full_name, telephone, newsletter, role, is_active, is_approved, created_at, updated_at
       FROM users
       WHERE LOWER(COALESCE(role, '')) NOT IN ('admin', 'employee')
         AND email NOT LIKE 'deleted+%@deleted.invalid'
       ORDER BY created_at DESC`
    );

    res.json({ users: result.rows });
  } catch (error) {
    console.error('Get registered users error:', error);
    res.status(500).json({ message: 'Failed to get registered users' });
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ message: 'New password is required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    if (!STRONG_PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({
        message: 'New password must include at least one uppercase letter and one number',
      });
    }

    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Account change-password UI: logged-in user sets a new password only (no email code, no current-password check).
    // Email + code flow remains on POST /auth/send-reset-code and POST /auth/reset-password for unauthenticated reset.

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, userId]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Failed to change password' });
  }
};

/** POST /users/delete-account — schedule deletion in 30 days (password required). */
const requestAccountDeletion = async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ message: 'Password is required to delete your account' });
    }

    if (isStaffRole(req.user.role)) {
      return res.status(403).json({ message: 'Staff accounts cannot be deleted this way.' });
    }

    const userResult = await pool.query(
      `SELECT id, password_hash, deletion_requested_at
       FROM users WHERE id = $1`,
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];
    if (user.deletion_requested_at) {
      return res.status(400).json({
        message: 'Account deletion is already scheduled.',
        code: 'ACCOUNT_PENDING_DELETION',
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    const scheduledAt = new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
    const updated = await pool.query(
      `UPDATE users
       SET deletion_requested_at = CURRENT_TIMESTAMP,
           deletion_scheduled_at = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING deletion_requested_at, deletion_scheduled_at`,
      [scheduledAt, userId]
    );

    const row = updated.rows[0];
    res.json({
      message: `Your account and personal data are scheduled for deletion after ${DELETION_GRACE_DAYS} days.`,
      pendingDeletion: true,
      deletionRequestedAt: row.deletion_requested_at,
      deletionScheduledAt: row.deletion_scheduled_at,
      graceDays: DELETION_GRACE_DAYS,
    });
  } catch (error) {
    console.error('Request account deletion error:', error);
    if (error.message && /deletion_requested_at|deletion_scheduled_at|does not exist/i.test(error.message)) {
      return res.status(503).json({
        message: 'Account deletion is not available yet. Please run database migrations.',
      });
    }
    res.status(500).json({ message: 'Failed to schedule account deletion' });
  }
};

/** POST /users/cancel-deletion — restore full access during the 30-day window. */
const cancelAccountDeletion = async (req, res) => {
  try {
    const userId = req.user.id;

    const current = await pool.query(
      `SELECT deletion_requested_at FROM users WHERE id = $1`,
      [userId]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (!current.rows[0].deletion_requested_at) {
      return res.status(400).json({ message: 'No account deletion is currently scheduled.' });
    }

    await pool.query(
      `UPDATE users
       SET deletion_requested_at = NULL,
           deletion_scheduled_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [userId]
    );

    res.json({
      message: 'Account deletion cancelled. Your account is fully active again.',
      pendingDeletion: false,
    });
  } catch (error) {
    console.error('Cancel account deletion error:', error);
    res.status(500).json({ message: 'Failed to cancel account deletion' });
  }
};

/** GET /users/deletion-status — used by pending-deletion page. */
const getDeletionStatus = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT deletion_requested_at, deletion_scheduled_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const row = result.rows[0];
    const pendingDeletion = !!row.deletion_requested_at;
    res.json({
      pendingDeletion,
      deletionRequestedAt: row.deletion_requested_at || null,
      deletionScheduledAt: row.deletion_scheduled_at || null,
    });
  } catch (error) {
    console.error('Get deletion status error:', error);
    if (error.message && /deletion_requested_at|does not exist/i.test(error.message)) {
      return res.json({
        pendingDeletion: false,
        deletionRequestedAt: null,
        deletionScheduledAt: null,
      });
    }
    res.status(500).json({ message: 'Failed to get deletion status' });
  }
};

module.exports = {
  updateProfile,
  changePassword,
  getAllRegisteredUsers,
  requestAccountDeletion,
  cancelAccountDeletion,
  getDeletionStatus,
};

