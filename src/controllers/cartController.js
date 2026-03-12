const pool = require('../config/database');

/** True if current user should see all carts (admin) */
function isAdminUser(req) {
  const role = (req.user?.role || '').toString().toLowerCase();
  if (role === 'admin') return true;
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const email = (req.user?.email || '').toString().toLowerCase();
  return adminEmails.length > 0 && email && adminEmails.includes(email);
}

/** Add item to cart (user/employee - own cart) */
const addToCart = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    const itemData = req.body;
    if (!itemData || typeof itemData !== 'object') {
      return res.status(400).json({ message: 'Cart item data is required' });
    }

    const result = await pool.query(
      `INSERT INTO cart_items (user_id, item_data) VALUES ($1, $2::jsonb) RETURNING *`,
      [userId, JSON.stringify(itemData)]
    );
    res.status(201).json({ cartItem: result.rows[0] });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ message: 'Failed to add to cart', error: error.message });
  }
};

/** Get cart: user/employee = own cart, admin = all carts */
const getCart = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    let result;
    if (isAdminUser(req)) {
      const [cartResult, orderPairsResult] = await Promise.all([
        pool.query(
          `SELECT ci.*, u.email as user_email, u.full_name as user_name
           FROM cart_items ci
           LEFT JOIN users u ON ci.user_id = u.id
           ORDER BY ci.created_at DESC`
        ),
        pool.query(
          `SELECT DISTINCT o.user_id, oi.product_id
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.user_id IS NOT NULL AND oi.product_id IS NOT NULL`
        ),
      ]);
      const orderPairSet = new Set(
        orderPairsResult.rows.map((row) => `${row.user_id}_${row.product_id}`)
      );
      const items = cartResult.rows
        .map((r) => ({
          id: String(r.id),
          userId: r.user_id,
          userEmail: r.user_email,
          userName: r.user_name,
          ...r.item_data,
          createdAt: r.created_at,
        }))
        .filter((item) => {
          const productId = item.productId ?? item.product_id;
          const pid = productId != null ? String(productId) : null;
          if (!pid) return true;
          const key = `${item.userId}_${pid}`;
          return !orderPairSet.has(key);
        });
      return res.json({ cartItems: items, isAdminView: true });
    }

    result = await pool.query(
      `SELECT * FROM cart_items WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    const items = result.rows.map((r) => ({
      id: String(r.id),
      ...r.item_data,
      createdAt: r.created_at,
    }));
    res.json({ cartItems: items, isAdminView: false });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ message: 'Failed to get cart', error: error.message });
  }
};

/** Remove item from cart */
const removeFromCart = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    if (isAdminUser(req)) {
      await pool.query('DELETE FROM cart_items WHERE id = $1', [id]);
    } else {
      const r = await pool.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
      if (r.rowCount === 0) return res.status(404).json({ message: 'Cart item not found' });
    }
    res.json({ message: 'Removed from cart' });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ message: 'Failed to remove from cart', error: error.message });
  }
};

/** Update cart item (quantity etc.) */
const updateCartItem = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const itemData = req.body;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    let result;
    if (isAdminUser(req)) {
      result = await pool.query(
        `UPDATE cart_items SET item_data = $1::jsonb WHERE id = $2 RETURNING *`,
        [JSON.stringify(itemData), id]
      );
    } else {
      result = await pool.query(
        `UPDATE cart_items SET item_data = $1::jsonb WHERE id = $2 AND user_id = $3 RETURNING *`,
        [JSON.stringify(itemData), id, userId]
      );
    }
    if (result.rowCount === 0) return res.status(404).json({ message: 'Cart item not found' });
    res.json({ cartItem: result.rows[0] });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ message: 'Failed to update cart', error: error.message });
  }
};

/** Clear user's cart (user/employee only) */
const clearCart = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    if (isAdminUser(req)) {
      return res.status(400).json({ message: 'Admin cannot clear all carts. Use remove for individual items.' });
    }
    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
    res.json({ message: 'Cart cleared' });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ message: 'Failed to clear cart', error: error.message });
  }
};

module.exports = { addToCart, getCart, removeFromCart, updateCartItem, clearCart };
