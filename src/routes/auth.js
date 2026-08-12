const express = require('express');
const router = express.Router();
const { register, login, getProfile, forgotPassword, resetPassword, createAdmin } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const forgotPasswordLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyFn: (req) => `${req.ip}|${String(req.body?.email || '').trim().toLowerCase()}`,
  message: 'Too many password reset requests. Please try again in a few minutes.',
});

const resetPasswordLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many password reset attempts. Please try again in a few minutes.',
});

router.post('/register', register);
router.post('/create-admin', createAdmin);
router.post('/', login);
router.get('/profile', authenticateToken, getProfile);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, resetPassword);

module.exports = router;
