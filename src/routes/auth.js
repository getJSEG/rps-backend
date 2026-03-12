const express = require('express');
const router = express.Router();
const { register, login, getProfile, sendResetCode, resetPasswordWithCode, createAdmin } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

router.post('/register', register);
router.post('/create-admin', createAdmin);
router.post('/', login);
router.get('/profile', authenticateToken, getProfile);
router.post('/send-reset-code', sendResetCode);
router.post('/reset-password', resetPasswordWithCode);

module.exports = router;

