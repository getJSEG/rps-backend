const express = require('express');
const router = express.Router();
const { addToCart, getCart, removeFromCart, updateCartItem, clearCart } = require('../controllers/cartController');
const { authenticateToken } = require('../middleware/auth');

router.post('/', authenticateToken, addToCart);
router.get('/', authenticateToken, getCart);
router.put('/:id', authenticateToken, updateCartItem);
router.delete('/:id', authenticateToken, removeFromCart);
router.delete('/clear', authenticateToken, clearCart);

module.exports = router;
