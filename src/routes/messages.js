const express = require('express');
const router = express.Router();
const { getMessages, createMessage, markAsRead } = require('../controllers/messageController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, getMessages);
router.post('/', authenticateToken, createMessage);
router.put('/:id/read', authenticateToken, markAsRead);

module.exports = router;

