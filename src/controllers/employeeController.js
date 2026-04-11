const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');
const { uploadFromBuffer, isConfigured: spacesConfigured } = require('../utils/spaces');

const FIELDS = 'id, email, full_name, telephone, role, is_active, is_approved, profile_image, hire_date, created_at, updated_at';
const FIELDS_MINIMAL = 'id, email, full_name, telephone, role, is_active, is_approved, created_at, updated_at';

function normalizeRows(rows) {
  return rows.map((r) => ({
    ...r,
    profile_image: r.profile_image ?? null,
    hire_date: r.hire_date ?? null,
  }));
}

// List all staff (role = 'employee' or 'admin')
const getAll = async (req, res) => {
  try {
    let result;
    try {
      result = await pool.query(
        `SELECT ${FIELDS}
         FROM users
         WHERE role IN ('employee', 'admin')
         ORDER BY hire_date DESC NULLS LAST, created_at DESC`
      );
    } catch (queryErr) {
      if (queryErr.message && queryErr.message.includes('does not exist')) {
        result = await pool.query(
          `SELECT ${FIELDS_MINIMAL}
           FROM users
           WHERE role IN ('employee', 'admin')
           ORDER BY created_at DESC`
        );
        result.rows = normalizeRows(result.rows);
      } else {
        throw queryErr;
      }
    }
    res.json({ employees: result.rows });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({
      message: 'Failed to fetch employees. ' + (error.message || ''),
      error: error.message,
    });
  }
};

// Get single employee/admin by id
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    let result;
    try {
      result = await pool.query(
        `SELECT ${FIELDS}
         FROM users
         WHERE id = $1 AND role IN ('employee', 'admin')`,
        [id]
      );
    } catch (queryErr) {
      if (queryErr.message && queryErr.message.includes('does not exist')) {
        result = await pool.query(
          `SELECT ${FIELDS_MINIMAL}
           FROM users
           WHERE id = $1 AND role IN ('employee', 'admin')`,
          [id]
        );
        if (result.rows.length > 0) {
          result.rows[0] = { ...result.rows[0], profile_image: null, hire_date: null };
        }
      } else {
        throw queryErr;
      }
    }
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    res.json({ employee: result.rows[0] });
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({ message: 'Failed to fetch employee', error: error.message });
  }
};

// Create employee/staff (admin only). role = 'admin' | 'employee'
const create = async (req, res) => {
  try {
    const { email, password, full_name, telephone, role, profile_image, hire_date } = req.body;

    if (!email || !password || !full_name) {
      return res.status(400).json({ message: 'Email, password and full name are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const safeRole = role === 'admin' ? 'admin' : 'employee';

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    let row;

    try {
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, full_name, telephone, role, is_active, is_approved, profile_image, hire_date)
         VALUES ($1, $2, $3, $4, $5, true, true, $6, $7)
         RETURNING ${FIELDS}`,
        [email, passwordHash, full_name, telephone || null, safeRole, profile_image || null, hire_date || null]
      );
      row = result.rows[0];
    } catch (insertErr) {
      if (insertErr.message && insertErr.message.includes('does not exist')) {
        const result = await pool.query(
          `INSERT INTO users (email, password_hash, full_name, telephone, role, is_active, is_approved)
           VALUES ($1, $2, $3, $4, $5, true, true)
           RETURNING ${FIELDS_MINIMAL}`,
          [email, passwordHash, full_name, telephone || null, safeRole]
        );
        row = { ...result.rows[0], profile_image: null, hire_date: null };
      } else {
        throw insertErr;
      }
    }

    res.status(201).json({ employee: row });
  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({ message: 'Failed to create employee. ' + (error.message || ''), error: error.message });
  }
};

// Update employee/staff (admin only). role = 'admin' | 'employee'
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, telephone, is_active, is_approved, password, role, profile_image, hire_date } = req.body;

    const existing = await pool.query(
      'SELECT id, email FROM users WHERE id = $1 AND role IN (\'admin\', \'employee\')',
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    if (email) {
      const duplicate = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id]);
      if (duplicate.rows.length > 0) {
        return res.status(400).json({ message: 'Another user already has this email' });
      }
    }

    let query = `UPDATE users SET updated_at = CURRENT_TIMESTAMP`;
    const params = [];
    let idx = 1;

    if (full_name !== undefined) {
      query += `, full_name = $${idx}`;
      params.push(full_name);
      idx++;
    }
    if (email !== undefined) {
      query += `, email = $${idx}`;
      params.push(email);
      idx++;
    }
    if (telephone !== undefined) {
      query += `, telephone = $${idx}`;
      params.push(telephone);
      idx++;
    }
    if (is_active !== undefined) {
      query += `, is_active = $${idx}`;
      params.push(!!is_active);
      idx++;
    }
    if (is_approved !== undefined) {
      query += `, is_approved = $${idx}`;
      params.push(!!is_approved);
      idx++;
    }
    if (role === 'admin' || role === 'employee') {
      query += `, role = $${idx}`;
      params.push(role);
      idx++;
    }
    if (profile_image !== undefined) {
      query += `, profile_image = $${idx}`;
      params.push(profile_image || null);
      idx++;
    }
    if (hire_date !== undefined) {
      query += `, hire_date = $${idx}`;
      params.push(hire_date || null);
      idx++;
    }
    if (password && password.length >= 6) {
      const passwordHash = await bcrypt.hash(password, 10);
      query += `, password_hash = $${idx}`;
      params.push(passwordHash);
      idx++;
    }

    query += ` WHERE id = $${idx} AND role IN ('admin', 'employee') RETURNING ${FIELDS}`;
    params.push(id);

    let row;
    try {
      const result = await pool.query(query, params);
      row = result.rows[0];
    } catch (updateErr) {
      if (updateErr.message && updateErr.message.includes('does not exist')) {
        let minimalQuery = `UPDATE users SET updated_at = CURRENT_TIMESTAMP`;
        const minParams = [];
        let i = 1;
        if (full_name !== undefined) { minimalQuery += `, full_name = $${i}`; minParams.push(full_name); i++; }
        if (email !== undefined) { minimalQuery += `, email = $${i}`; minParams.push(email); i++; }
        if (telephone !== undefined) { minimalQuery += `, telephone = $${i}`; minParams.push(telephone); i++; }
        if (is_active !== undefined) { minimalQuery += `, is_active = $${i}`; minParams.push(!!is_active); i++; }
        if (is_approved !== undefined) { minimalQuery += `, is_approved = $${i}`; minParams.push(!!is_approved); i++; }
        if (role === 'admin' || role === 'employee') { minimalQuery += `, role = $${i}`; minParams.push(role); i++; }
        if (password && password.length >= 6) {
          const passwordHash = await bcrypt.hash(password, 10);
          minimalQuery += `, password_hash = $${i}`;
          minParams.push(passwordHash);
          i++;
        }
        minimalQuery += ` WHERE id = $${i} AND role IN ('admin', 'employee') RETURNING ${FIELDS_MINIMAL}`;
        minParams.push(id);
        const result = await pool.query(minimalQuery, minParams);
        row = result.rows[0] ? { ...result.rows[0], profile_image: null, hire_date: null } : null;
      } else {
        throw updateErr;
      }
    }

    if (!row) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    res.json({ employee: row });
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ message: 'Failed to update employee. ' + (error.message || ''), error: error.message });
  }
};

// Delete employee (admin only) - hard delete from users
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 AND role IN (\'admin\', \'employee\') RETURNING id, email, full_name',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({ message: 'Employee deleted successfully', employee: result.rows[0] });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ message: 'Failed to delete employee', error: error.message });
  }
};

function writeBufferToUploadDir(buffer, dirName) {
  const uploadDir = path.join(__dirname, '../../uploads', dirName);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.jpg`;
  const fullPath = path.join(uploadDir, filename);
  fs.writeFileSync(fullPath, buffer);
  return `/uploads/${dirName}/${filename}`;
}

// Upload profile image; Spaces (live) or disk. Returns { url }
const uploadProfileImage = async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: 'No image file uploaded' });
  }
  try {
    if (spacesConfigured()) {
      const url = await uploadFromBuffer(req.file.buffer, 'elmer/employees', {
        contentType: req.file.mimetype,
      });
      return res.json({ url });
    }
    const url = writeBufferToUploadDir(req.file.buffer, 'employees');
    res.json({ url });
  } catch (err) {
    console.error('Upload profile image error:', err);
    res.status(500).json({ message: err.message || 'Image upload failed' });
  }
};

module.exports = { getAll, getById, create, update, remove, uploadProfileImage };
