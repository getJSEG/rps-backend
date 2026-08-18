const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin, authenticateTokenOrGuestSession } = require('../middleware/auth');
const {
  listCouponsAdmin,
  createCouponAdmin,
  updateCouponAdmin,
  deleteCouponAdmin,
  previewCoupon,
} = require('../controllers/couponController');

router.post('/preview', authenticateTokenOrGuestSession, previewCoupon);
router.get('/admin', authenticateToken, requireAdmin, listCouponsAdmin);
router.post('/admin', authenticateToken, requireAdmin, createCouponAdmin);
router.put('/admin/:id', authenticateToken, requireAdmin, updateCouponAdmin);
router.delete('/admin/:id', authenticateToken, requireAdmin, deleteCouponAdmin);

module.exports = router;
