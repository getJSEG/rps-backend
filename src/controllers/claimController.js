const pool = require('../config/database');

const getClaims = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT c.*, o.order_number 
       FROM claims c
       LEFT JOIN orders o ON c.order_id = o.id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );
    res.json({ claims: result.rows });
  } catch (error) {
    console.error('Get claims error:', error);
    res.status(500).json({ message: 'Failed to fetch claims', error: error.message });
  }
};

const createClaim = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, claimType, description } = req.body;

    if (!claimType || !description) {
      return res.status(400).json({ message: 'Claim type and description are required' });
    }

    const result = await pool.query(
      `INSERT INTO claims (user_id, order_id, claim_type, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, orderId || null, claimType, description]
    );

    res.status(201).json({ claim: result.rows[0] });
  } catch (error) {
    console.error('Create claim error:', error);
    res.status(500).json({ message: 'Failed to create claim', error: error.message });
  }
};

const getClaimById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT c.*, o.order_number 
       FROM claims c
       LEFT JOIN orders o ON c.order_id = o.id
       WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Claim not found' });
    }

    res.json({ claim: result.rows[0] });
  } catch (error) {
    console.error('Get claim error:', error);
    res.status(500).json({ message: 'Failed to fetch claim', error: error.message });
  }
};

module.exports = { getClaims, createClaim, getClaimById };

