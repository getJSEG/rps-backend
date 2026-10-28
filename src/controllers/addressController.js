const pool = require('../config/database');

function coerceBooleanDefault(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
  return false;
}

function pickCanonicalDefaultRow(rows) {
  const defaults = rows.filter((r) => r.is_default);
  if (defaults.length <= 1) return null;
  return defaults.reduce((best, row) => {
    const bt = best.updated_at ? new Date(best.updated_at).getTime() : 0;
    const rt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
    if (rt > bt) return row;
    if (rt < bt) return best;
    return row.id > best.id ? row : best;
  });
}

const getAddresses = async (req, res) => {
  try {
    const userId = req.user.id;
    const orderSql =
      'SELECT * FROM addresses WHERE user_id = $1 AND deleted_at IS NULL ORDER BY is_default DESC, updated_at DESC NULLS LAST, created_at DESC';
    let result = await pool.query(orderSql, [userId]);
    let rows = result.rows;
    const winner = pickCanonicalDefaultRow(rows);
    if (winner) {
      await pool.query('UPDATE addresses SET is_default = (id = $1) WHERE user_id = $2', [winner.id, userId]);
      result = await pool.query(orderSql, [userId]);
      rows = result.rows;
    }
    res.json({ addresses: rows });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ message: 'Failed to fetch addresses' });
  }
};

const createAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { streetAddress, addressLine2, city, state, postcode, country, addressType } = req.body;
    const wantsDefault = coerceBooleanDefault(req.body.isDefault ?? req.body.is_default);

    if (!streetAddress || !city || !state || !postcode) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (wantsDefault) {
      await pool.query('UPDATE addresses SET is_default = false WHERE user_id = $1', [userId]);
    }

    const result = await pool.query(
      `INSERT INTO addresses (user_id, street_address, address_line2, city, state, postcode, country, is_default, address_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, streetAddress, addressLine2 || null, city, state, postcode, country || 'United States', wantsDefault, addressType || 'billing']
    );

    res.status(201).json({ address: result.rows[0] });
  } catch (error) {
    console.error('Create address error:', error);
    res.status(500).json({ message: 'Failed to create address' });
  }
};

const setAddressDefault = async (req, res) => {
  try {
    const addressId = parseInt(req.params.id, 10);
    if (Number.isNaN(addressId)) {
      return res.status(400).json({ message: 'Invalid address id' });
    }
    const userId = req.user.id;

    const checkResult = await pool.query(
      'SELECT id FROM addresses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [addressId, userId]
    );
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Address not found' });
    }

    await pool.query('UPDATE addresses SET is_default = false WHERE user_id = $1', [userId]);
    const result = await pool.query(
      `UPDATE addresses SET is_default = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [addressId, userId]
    );

    res.json({ address: result.rows[0] });
  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({ message: 'Failed to set default address' });
  }
};

const updateAddress = async (req, res) => {
  try {
    const addressId = parseInt(req.params.id, 10);
    if (Number.isNaN(addressId)) {
      return res.status(400).json({ message: 'Invalid address id' });
    }
    const userId = req.user.id;
    const { streetAddress, addressLine2, city, state, postcode, country, addressType } = req.body;
    const wantsDefault = coerceBooleanDefault(req.body.isDefault ?? req.body.is_default);

    const checkResult = await pool.query(
      'SELECT id FROM addresses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [addressId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Address not found' });
    }

    if (wantsDefault) {
      await pool.query('UPDATE addresses SET is_default = false WHERE user_id = $1 AND id != $2', [userId, addressId]);
    }

    const result = await pool.query(
      `UPDATE addresses 
       SET street_address = $1, address_line2 = $2, city = $3, state = $4, postcode = $5, 
           country = $6, is_default = $7, address_type = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND user_id = $10
       RETURNING *`,
      [
        streetAddress,
        addressLine2 || null,
        city,
        state,
        postcode,
        country || 'United States',
        wantsDefault,
        addressType || 'billing',
        addressId,
        userId,
      ]
    );

    res.json({ address: result.rows[0] });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ message: 'Failed to update address' });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const addressId = parseInt(req.params.id, 10);
    if (Number.isNaN(addressId)) {
      return res.status(400).json({ message: 'Invalid address id' });
    }
    const userId = req.user.id;

    const own = await pool.query(
      'SELECT id, is_default FROM addresses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [addressId, userId]
    );
    if (own.rows.length === 0) {
      return res.status(404).json({ message: 'Address not found' });
    }

    const used = await pool.query(
      `SELECT 1 FROM orders WHERE shipping_address_id = $1 OR billing_address_id = $1 LIMIT 1`,
      [addressId]
    );
    if (used.rows.length > 0) {
      // Orders still read this row for the delivery address and FedEx labels, so keep it but hide it.
      await pool.query(
        `UPDATE addresses SET deleted_at = CURRENT_TIMESTAMP, is_default = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2`,
        [addressId, userId]
      );
    } else {
      await pool.query('DELETE FROM addresses WHERE id = $1 AND user_id = $2', [addressId, userId]);
    }

    if (own.rows[0].is_default) {
      // Keep a default address: promote the most recently updated one that is left.
      await pool.query(
        `UPDATE addresses SET is_default = true
         WHERE id = (
           SELECT id FROM addresses
           WHERE user_id = $1 AND deleted_at IS NULL
           ORDER BY updated_at DESC NULLS LAST, created_at DESC
           LIMIT 1
         )`,
        [userId]
      );
    }

    res.json({ message: 'Address deleted successfully' });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ message: 'Failed to delete address' });
  }
};

module.exports = { getAddresses, createAddress, updateAddress, deleteAddress, setAddressDefault };
