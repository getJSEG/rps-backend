const express = require('express');
const router = express.Router();
const { addToCart, getCart, removeFromCart, updateCartItem, clearCart } = require('../controllers/cartController');
const { authenticateTokenOrGuestSession } = require('../middleware/auth');

router.post('/', authenticateTokenOrGuestSession, addToCart);
router.get('/', authenticateTokenOrGuestSession, getCart);
// Static paths must be registered before /:id or "clear" is parsed as an integer id
router.delete('/clear', authenticateTokenOrGuestSession, clearCart);
router.put('/:id', authenticateTokenOrGuestSession, updateCartItem);
router.delete('/:id', authenticateTokenOrGuestSession, removeFromCart);

module.exports = router;
