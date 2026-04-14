const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  getTaxesAdmin,
  getActiveTax,
  createTaxAdmin,
  updateTaxAdmin,
  deleteTaxAdmin,
  activateTaxAdmin,
} = require('../controllers/taxController');

router.get('/active', getActiveTax);
router.get('/admin', authenticateToken, requireAdmin, getTaxesAdmin);
router.post('/admin', authenticateToken, requireAdmin, createTaxAdmin);
router.put('/admin/:id', authenticateToken, requireAdmin, updateTaxAdmin);
router.put('/admin/:id/activate', authenticateToken, requireAdmin, activateTaxAdmin);
router.delete('/admin/:id', authenticateToken, requireAdmin, deleteTaxAdmin);

module.exports = router;
