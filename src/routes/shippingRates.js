const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  getShippingRates,
  putShippingRatesAdmin,
  getShippingMethodsAdmin,
  createShippingMethodAdmin,
  updateShippingMethodAdmin,
  deleteShippingMethodAdmin,
} = require('../controllers/shippingRatesController');

router.get('/', getShippingRates);
router.put('/', authenticateToken, requireAdmin, putShippingRatesAdmin);
router.get('/admin', authenticateToken, requireAdmin, getShippingMethodsAdmin);
router.post('/admin', authenticateToken, requireAdmin, createShippingMethodAdmin);
router.put('/admin/:id', authenticateToken, requireAdmin, updateShippingMethodAdmin);
router.delete('/admin/:id', authenticateToken, requireAdmin, deleteShippingMethodAdmin);

module.exports = router;
