const express = require('express');
const router = express.Router();
const {
  updateProfile,
  changePassword,
  getAllRegisteredUsers,
  requestAccountDeletion,
  cancelAccountDeletion,
  getDeletionStatus,
} = require('../controllers/userController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/admin/all', authenticateToken, requireAdmin, getAllRegisteredUsers);
router.put('/profile', authenticateToken, updateProfile);
router.put('/password', authenticateToken, changePassword);
router.post('/delete-account', authenticateToken, requestAccountDeletion);
router.post('/cancel-deletion', authenticateToken, cancelAccountDeletion);
router.get('/deletion-status', authenticateToken, getDeletionStatus);

module.exports = router;
