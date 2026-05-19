const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  getShippingBoxesAdmin,
  createShippingBoxAdmin,
  updateShippingBoxAdmin,
  deleteShippingBoxAdmin,
} = require('../controllers/shippingBoxesController');

router.get('/admin', authenticateToken, requireAdmin, getShippingBoxesAdmin);
router.post('/admin', authenticateToken, requireAdmin, createShippingBoxAdmin);
router.put('/admin/:id', authenticateToken, requireAdmin, updateShippingBoxAdmin);
router.delete('/admin/:id', authenticateToken, requireAdmin, deleteShippingBoxAdmin);

module.exports = router;
