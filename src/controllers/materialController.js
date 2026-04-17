const pool = require('../config/database');

const getMaterials = async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM materials WHERE is_active = true';
    const params = [];
    let paramCount = 1;

    if (category) {
      query += ` AND category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }

    if (search) {
      query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({ materials: result.rows });
  } catch (error) {
    console.error('Get materials error:', error);
    res.status(500).json({ message: 'Failed to fetch materials' });
  }
};

const getMaterialById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM materials WHERE id = $1 AND is_active = true',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Material not found' });
    }

    res.json({ material: result.rows[0] });
  } catch (error) {
    console.error('Get material error:', error);
    res.status(500).json({ message: 'Failed to fetch material' });
  }
};

module.exports = { getMaterials, getMaterialById };

