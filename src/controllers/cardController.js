const pool = require('../config/database');

const getCards = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      'SELECT id, card_number_last4, cardholder_name, expiry_month, expiry_year, card_type, is_default, created_at FROM credit_cards WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
      [userId]
    );
    res.json({ cards: result.rows });
  } catch (error) {
    console.error('Get cards error:', error);
    res.status(500).json({ message: 'Failed to fetch cards', error: error.message });
  }
};

const createCard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { cardNumberLast4, cardholderName, expiryMonth, expiryYear, cardType, isDefault } = req.body;

    if (!cardNumberLast4 || !cardholderName || !expiryMonth || !expiryYear) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      await pool.query(
        'UPDATE credit_cards SET is_default = false WHERE user_id = $1',
        [userId]
      );
    }

    const result = await pool.query(
      `INSERT INTO credit_cards (user_id, card_number_last4, cardholder_name, expiry_month, expiry_year, card_type, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, card_number_last4, cardholder_name, expiry_month, expiry_year, card_type, is_default, created_at`,
      [userId, cardNumberLast4, cardholderName, expiryMonth, expiryYear, cardType || null, isDefault || false]
    );

    res.status(201).json({ card: result.rows[0] });
  } catch (error) {
    console.error('Create card error:', error);
    res.status(500).json({ message: 'Failed to create card', error: error.message });
  }
};

const updateCard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { cardholderName, expiryMonth, expiryYear, cardType, isDefault } = req.body;

    if (isDefault) {
      await pool.query(
        'UPDATE credit_cards SET is_default = false WHERE user_id = $1',
        [userId]
      );
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;
    if (cardholderName !== undefined) { updates.push(`cardholder_name = $${paramIndex++}`); values.push(cardholderName); }
    if (expiryMonth !== undefined) { updates.push(`expiry_month = $${paramIndex++}`); values.push(expiryMonth); }
    if (expiryYear !== undefined) { updates.push(`expiry_year = $${paramIndex++}`); values.push(expiryYear); }
    if (cardType !== undefined) { updates.push(`card_type = $${paramIndex++}`); values.push(cardType); }
    if (isDefault !== undefined) { updates.push(`is_default = $${paramIndex++}`); values.push(!!isDefault); }
    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, userId);

    const result = await pool.query(
      `UPDATE credit_cards SET ${updates.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING id, card_number_last4, cardholder_name, expiry_month, expiry_year, card_type, is_default, created_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }
    res.json({ card: result.rows[0] });
  } catch (error) {
    console.error('Update card error:', error);
    res.status(500).json({ message: 'Failed to update card', error: error.message });
  }
};

const deleteCard = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      'DELETE FROM credit_cards WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }

    res.json({ message: 'Card deleted successfully' });
  } catch (error) {
    console.error('Delete card error:', error);
    res.status(500).json({ message: 'Failed to delete card', error: error.message });
  }
};

module.exports = { getCards, createCard, updateCard, deleteCard };

