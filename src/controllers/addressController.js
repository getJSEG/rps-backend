const pool = require('../config/database');

const getAddresses = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
      [userId]
    );
    res.json({ addresses: result.rows });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ message: 'Failed to fetch addresses', error: error.message });
  }
};

const createAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { streetAddress, addressLine2, city, state, postcode, country, isDefault, addressType } = req.body;

    if (!streetAddress || !city || !state || !postcode) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      await pool.query(
        'UPDATE addresses SET is_default = false WHERE user_id = $1 AND address_type = $2',
        [userId, addressType || 'billing']
      );
    }

    const result = await pool.query(
      `INSERT INTO addresses (user_id, street_address, address_line2, city, state, postcode, country, is_default, address_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, streetAddress, addressLine2 || null, city, state, postcode, country || 'United States', isDefault || false, addressType || 'billing']
    );

    res.status(201).json({ address: result.rows[0] });
  } catch (error) {
    console.error('Create address error:', error);
    res.status(500).json({ message: 'Failed to create address', error: error.message });
  }
};

const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { streetAddress, addressLine2, city, state, postcode, country, isDefault, addressType } = req.body;

    // Verify ownership
    const checkResult = await pool.query(
      'SELECT id FROM addresses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Address not found' });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await pool.query(
        'UPDATE addresses SET is_default = false WHERE user_id = $1 AND id != $2 AND address_type = $3',
        [userId, id, addressType || 'billing']
      );
    }

    const result = await pool.query(
      `UPDATE addresses 
       SET street_address = $1, address_line2 = $2, city = $3, state = $4, postcode = $5, 
           country = $6, is_default = $7, address_type = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND user_id = $10
       RETURNING *`,
      [streetAddress, addressLine2 || null, city, state, postcode, country || 'United States', isDefault || false, addressType || 'billing', id, userId]
    );

    res.json({ address: result.rows[0] });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ message: 'Failed to update address', error: error.message });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      'DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Address not found' });
    }

    res.json({ message: 'Address deleted successfully' });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ message: 'Failed to delete address', error: error.message });
  }
};

module.exports = { getAddresses, createAddress, updateAddress, deleteAddress };

