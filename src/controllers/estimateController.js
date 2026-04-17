const pool = require('../config/database');

const getEstimates = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT e.*, 
       json_agg(json_build_object(
         'id', ei.id,
         'product_id', ei.product_id,
         'product_name', ei.product_name,
         'quantity', ei.quantity,
         'unit_price', ei.unit_price,
         'total_price', ei.total_price
       )) as items
       FROM estimates e
       LEFT JOIN estimate_items ei ON e.id = ei.estimate_id
       WHERE e.user_id = $1
       GROUP BY e.id
       ORDER BY e.created_at DESC`,
      [userId]
    );
    res.json({ estimates: result.rows });
  } catch (error) {
    console.error('Get estimates error:', error);
    res.status(500).json({ message: 'Failed to fetch estimates' });
  }
};

const createEstimate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { items, description, validUntil } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Estimate items are required' });
    }

    // Calculate total
    let totalAmount = 0;
    for (const item of items) {
      totalAmount += parseFloat(item.unit_price) * parseInt(item.quantity);
    }

    // Generate estimate number
    const estimateNumber = `EST-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create estimate
      const estimateResult = await client.query(
        `INSERT INTO estimates (user_id, estimate_number, description, total_amount, valid_until)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, estimateNumber, description || null, totalAmount, validUntil || null]
      );

      const estimate = estimateResult.rows[0];

      // Create estimate items
      for (const item of items) {
        await client.query(
          `INSERT INTO estimate_items (estimate_id, product_id, product_name, quantity, unit_price, total_price)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            estimate.id,
            item.product_id,
            item.product_name,
            item.quantity,
            item.unit_price,
            parseFloat(item.unit_price) * parseInt(item.quantity)
          ]
        );
      }

      await client.query('COMMIT');

      // Fetch complete estimate with items
      const completeEstimate = await pool.query(
        `SELECT e.*, 
         json_agg(json_build_object(
           'id', ei.id,
           'product_id', ei.product_id,
           'product_name', ei.product_name,
           'quantity', ei.quantity,
           'unit_price', ei.unit_price,
           'total_price', ei.total_price
         )) as items
         FROM estimates e
         LEFT JOIN estimate_items ei ON e.id = ei.estimate_id
         WHERE e.id = $1
         GROUP BY e.id`,
        [estimate.id]
      );

      res.status(201).json({ estimate: completeEstimate.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create estimate error:', error);
    res.status(500).json({ message: 'Failed to create estimate' });
  }
};

const getEstimateById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT e.*, 
       json_agg(json_build_object(
         'id', ei.id,
         'product_id', ei.product_id,
         'product_name', ei.product_name,
         'quantity', ei.quantity,
         'unit_price', ei.unit_price,
         'total_price', ei.total_price
       )) as items
       FROM estimates e
       LEFT JOIN estimate_items ei ON e.id = ei.estimate_id
       WHERE e.id = $1 AND e.user_id = $2
       GROUP BY e.id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Estimate not found' });
    }

    res.json({ estimate: result.rows[0] });
  } catch (error) {
    console.error('Get estimate error:', error);
    res.status(500).json({ message: 'Failed to fetch estimate' });
  }
};

module.exports = { getEstimates, createEstimate, getEstimateById };

