const cartRepository = require('../repositories/cartRepository');

function isAdminUser(req) {
  const role = (req.user?.role || '').toString().toLowerCase();
  if (role === 'admin') return true;
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const email = (req.user?.email || '').toString().toLowerCase();
  return adminEmails.length > 0 && email && adminEmails.includes(email);
}

function cartContext(req) {
  const userId = req.user?.id ?? null;
  const guestSessionId = userId ? null : (req.guestSessionId ?? null);
  return { userId, guestSessionId };
}

/** Add item to cart (logged-in user or guest with X-Guest-Session-Id) */
const addToCart = async (req, res) => {
  try {
    const { userId, guestSessionId } = cartContext(req);
    if (!userId && !guestSessionId) {
      return res.status(401).json({ message: 'Authentication or guest session required' });
    }

    const itemData = req.body;
    if (!itemData || typeof itemData !== 'object') {
      return res.status(400).json({ message: 'Cart item data is required' });
    }

    const cartItem = await cartRepository.insertCartItem(userId, guestSessionId, itemData);
    res.status(201).json({ cartItem });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ message: 'Failed to add to cart', error: error.message });
  }
};

/** Get cart: user/employee = own cart, guest = session cart, admin = all carts */
const getCart = async (req, res) => {
  try {
    const { userId, guestSessionId } = cartContext(req);
    if (!userId && !guestSessionId) {
      return res.status(401).json({ message: 'Authentication or guest session required' });
    }

    if (isAdminUser(req)) {
      const items = await cartRepository.findAdminCartItems();
      return res.json({ cartItems: items, isAdminView: true });
    }

    const items = userId
      ? await cartRepository.findCartItemsByUserId(userId)
      : await cartRepository.findCartItemsByGuestSession(guestSessionId);
    res.json({ cartItems: items, isAdminView: false });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ message: 'Failed to get cart', error: error.message });
  }
};

/** Remove item from cart */
const removeFromCart = async (req, res) => {
  try {
    const { userId, guestSessionId } = cartContext(req);
    const { id } = req.params;
    if (!userId && !guestSessionId) {
      return res.status(401).json({ message: 'Authentication or guest session required' });
    }

    if (isAdminUser(req)) {
      await cartRepository.deleteCartItemById(id);
    } else if (userId) {
      const rowCount = await cartRepository.deleteCartItemByUser(id, userId);
      if (rowCount === 0) return res.status(404).json({ message: 'Cart item not found' });
    } else {
      const rowCount = await cartRepository.deleteCartItemByGuest(id, guestSessionId);
      if (rowCount === 0) return res.status(404).json({ message: 'Cart item not found' });
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
    const { userId, guestSessionId } = cartContext(req);
    const { id } = req.params;
    const itemData = req.body;
    if (!userId && !guestSessionId) {
      return res.status(401).json({ message: 'Authentication or guest session required' });
    }

    let result;
    if (isAdminUser(req)) {
      result = await cartRepository.updateCartItemDataAdmin(id, itemData);
    } else if (userId) {
      result = await cartRepository.updateCartItemDataByUser(id, userId, itemData);
    } else {
      result = await cartRepository.updateCartItemDataByGuest(id, guestSessionId, itemData);
    }
    if (result.rowCount === 0) return res.status(404).json({ message: 'Cart item not found' });
    res.json({ cartItem: result.row });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ message: 'Failed to update cart', error: error.message });
  }
};

/** Clear cart (logged-in user or guest session) */
const clearCart = async (req, res) => {
  try {
    const { userId, guestSessionId } = cartContext(req);
    if (!userId && !guestSessionId) {
      return res.status(401).json({ message: 'Authentication or guest session required' });
    }
    if (userId) {
      await cartRepository.clearCartByUserId(userId);
    } else {
      await cartRepository.clearCartByGuestSession(guestSessionId);
    }
    res.json({ message: 'Cart cleared' });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ message: 'Failed to clear cart', error: error.message });
  }
};

module.exports = { addToCart, getCart, removeFromCart, updateCartItem, clearCart };
