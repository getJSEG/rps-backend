const cartRepository = require('../repositories/cartRepository');
const { calculateCartItemFromInput } = require('../services/pricingService');
const { computeShippingFromCartItems, computeTaxAndTotal, roundMoney2 } = require('../services/orderTotalsService');

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

function cartItemLineSubtotal(item) {
  if (item?.subtotal != null) return Number(item.subtotal) || 0;
  const jobs = Array.isArray(item?.jobs) ? item.jobs : [];
  if (jobs.length > 0) {
    const fallbackUnit = Number(item?.unitPrice) || Number(item?.unit_price) || 0;
    return jobs.reduce((sum, line) => {
      if (line?.lineSubtotal != null) return sum + (Number(line.lineSubtotal) || 0);
      const up = Number(line?.unitPrice ?? line?.unit_price) || fallbackUnit;
      return sum + up * (Number(line?.quantity) || 0);
    }, 0);
  }
  const qty = Number(item?.quantity) || 1;
  const unit = Number(item?.unitPrice ?? item?.unit_price) || 0;
  return unit * qty;
}

/** Add item to cart (logged-in user or guest with X-Guest-Session-Id) */
const addToCart = async (req, res) => {
  try {
    const { userId, guestSessionId } = cartContext(req);
    if (!userId && !guestSessionId) {
      return res.status(401).json({ message: 'Authentication or guest session required' });
    }

    const rawItemData = req.body;
    if (!rawItemData || typeof rawItemData !== 'object') {
      return res.status(400).json({ message: 'Cart item data is required' });
    }

    const itemData = await calculateCartItemFromInput(rawItemData);
    const cartItem = await cartRepository.insertCartItem(userId, guestSessionId, itemData);
    res.status(201).json({ cartItem });
  } catch (error) {
    console.error('Add to cart error:', error);
    const code = /required|invalid|must|missing|not found|supported/i.test(String(error.message || '')) ? 400 : 500;
    res.status(code).json({ message: 'Failed to add to cart', error: error.message });
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
    const incoming = req.body;
    if (!userId && !guestSessionId) {
      return res.status(401).json({ message: 'Authentication or guest session required' });
    }

    let existingRow = null;
    if (isAdminUser(req)) {
      existingRow = await cartRepository.findCartRowByIdAdmin(id);
    } else if (userId) {
      existingRow = await cartRepository.findCartRowByIdAndUser(id, userId);
    } else {
      existingRow = await cartRepository.findCartRowByIdAndGuest(id, guestSessionId);
    }
    if (!existingRow) return res.status(404).json({ message: 'Cart item not found' });

    const merged = {
      ...(existingRow.item_data || {}),
      ...(incoming && typeof incoming === 'object' ? incoming : {}),
    };
    const itemData = await calculateCartItemFromInput(merged);

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
    const code = /required|invalid|must|missing|not found|supported/i.test(String(error.message || '')) ? 400 : 500;
    res.status(code).json({ message: 'Failed to update cart', error: error.message });
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

const getCartSummary = async (req, res) => {
  try {
    const { userId, guestSessionId } = cartContext(req);
    if (!userId && !guestSessionId) {
      return res.status(401).json({ message: 'Authentication or guest session required' });
    }
    const cartItems = userId
      ? await cartRepository.findCartItemsByUserId(userId)
      : await cartRepository.findCartItemsByGuestSession(guestSessionId);
    const subtotal = roundMoney2(cartItems.reduce((sum, item) => sum + cartItemLineSubtotal(item), 0));
    const shippingComputed = await computeShippingFromCartItems(cartItems);
    let shipping = shippingComputed.shippingSum;
    if (shippingComputed.applyFreeShipping) {
      const freeShipping = shippingComputed.applyFreeShipping(subtotal);
      shipping = freeShipping.shippingSum;
    }
    const totals = await computeTaxAndTotal(subtotal, shipping);
    res.json({
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      taxAmount: totals.tax.amount,
      taxName: totals.tax.name,
      taxPercentage: totals.tax.percentage,
      total: totals.total,
    });
  } catch (error) {
    console.error('Get cart summary error:', error);
    res.status(500).json({ message: 'Failed to get cart summary', error: error.message });
  }
};

module.exports = { addToCart, getCart, removeFromCart, updateCartItem, clearCart, getCartSummary };
