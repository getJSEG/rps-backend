const express = require('express');
const router = express.Router();
const { updateProfile, changePassword } = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');

router.put('/profile', authenticateToken, updateProfile);
router.put('/password', authenticateToken, changePassword);

module.exports = router;

