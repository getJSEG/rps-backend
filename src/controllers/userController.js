const bcrypt = require('bcryptjs');
const pool = require('../config/database');

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
    res.status(500).json({ message: 'Failed to update profile', error: error.message });
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
    res.status(500).json({ message: 'Failed to get registered users', error: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    // Get current password hash
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, userId]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Failed to change password', error: error.message });
  }
};

module.exports = { updateProfile, changePassword, getAllRegisteredUsers };

