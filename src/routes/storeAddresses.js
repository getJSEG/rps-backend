const express = require('express');
const router = express.Router();
const {
  getStoreAddressesAdmin,
  createStoreAddressAdmin,
  updateStoreAddressAdmin,
  setDefaultStoreAddressAdmin,
  deleteStoreAddressAdmin,
} = require('../controllers/storeAddressController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/admin', authenticateToken, requireAdmin, getStoreAddressesAdmin);
router.post('/admin', authenticateToken, requireAdmin, createStoreAddressAdmin);
router.put('/admin/:id', authenticateToken, requireAdmin, updateStoreAddressAdmin);
router.patch('/admin/:id/default', authenticateToken, requireAdmin, setDefaultStoreAddressAdmin);
router.delete('/admin/:id', authenticateToken, requireAdmin, deleteStoreAddressAdmin);

module.exports = router;
