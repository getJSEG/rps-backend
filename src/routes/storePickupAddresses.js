const express = require('express');
const router = express.Router();
const {
  getPublicStorePickupAddresses,
  getStorePickupAddressesAdmin,
  createStorePickupAddressAdmin,
  updateStorePickupAddressAdmin,
  deleteStorePickupAddressAdmin,
} = require('../controllers/storePickupAddressController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/', getPublicStorePickupAddresses);
router.get('/admin', authenticateToken, requireAdmin, getStorePickupAddressesAdmin);
router.post('/admin', authenticateToken, requireAdmin, createStorePickupAddressAdmin);
router.put('/admin/:id', authenticateToken, requireAdmin, updateStorePickupAddressAdmin);
router.delete('/admin/:id', authenticateToken, requireAdmin, deleteStorePickupAddressAdmin);

module.exports = router;
