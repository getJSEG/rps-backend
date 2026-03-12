const express = require('express');
const router = express.Router();
const { getFavorites, addFavorite, removeFavorite } = require('../controllers/favoriteController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, getFavorites);
router.post('/', authenticateToken, addFavorite);
router.delete('/:id', authenticateToken, removeFavorite);

module.exports = router;

