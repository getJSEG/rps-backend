const express = require('express');
const router = express.Router();
const { getCards, createCard, updateCard, deleteCard } = require('../controllers/cardController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, getCards);
router.post('/', authenticateToken, createCard);
router.put('/:id', authenticateToken, updateCard);
router.delete('/:id', authenticateToken, deleteCard);

module.exports = router;

