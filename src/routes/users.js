const express = require('express');
const router = express.Router();
const { updateProfile, changePassword, getAllRegisteredUsers } = require('../controllers/userController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/admin/all', authenticateToken, requireAdmin, getAllRegisteredUsers);
router.put('/profile', authenticateToken, updateProfile);
router.put('/password', authenticateToken, changePassword);

module.exports = router;

