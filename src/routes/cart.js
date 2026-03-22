const express = require('express');
const router = express.Router();
const { addToCart, getCart, removeFromCart, updateCartItem, clearCart } = require('../controllers/cartController');
const { authenticateTokenOrGuestSession } = require('../middleware/auth');

router.post('/', authenticateTokenOrGuestSession, addToCart);
router.get('/', authenticateTokenOrGuestSession, getCart);
router.put('/:id', authenticateTokenOrGuestSession, updateCartItem);
router.delete('/:id', authenticateTokenOrGuestSession, removeFromCart);
router.delete('/clear', authenticateTokenOrGuestSession, clearCart);

module.exports = router;
