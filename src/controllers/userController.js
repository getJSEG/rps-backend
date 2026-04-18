const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const STRONG_PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).+$/;

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
    const result = await pool.query(
      `SELECT id, email, full_name, telephone, newsletter, role, is_active, is_approved, created_at, updated_at
       FROM users
       WHERE LOWER(COALESCE(role, '')) NOT IN ('admin', 'employee')
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

module.exports = { updateProfile, changePassword, getAllRegisteredUsers };

