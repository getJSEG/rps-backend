const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrders,
  getOrderById,
  approveOrderItemArtwork,
  getAllOrders,
  getOrderByIdAdmin,
  updateOrderStatus,
  updateOrderItemStatus,
  updateOrderTrackingId,
  deleteOrderAdmin,
  createOrderFromCartItem,
  createOrderWithPaymentIntent,
  getGuestOrderByIdWithToken,
  confirmStripePayment,
  requestOrderCancellation,
  requestGuestOrderCancellation,
  requestOrderItemCancellation,
  requestGuestOrderItemCancellation,
  approveGuestOrderItemArtwork,
  refundOrderAdmin,
  refundOrderItemAdmin,
} = require('../controllers/orderController');
const { authenticateToken, optionalAuth, requireAdmin } = require('../middleware/auth');
const { uploadArtworkFile, uploadGuestArtworkFile } = require('../middleware/upload');

router.post('/', optionalAuth, createOrder);
router.post('/create-payment-intent', optionalAuth, createOrderWithPaymentIntent);
router.post('/confirm-stripe-payment', optionalAuth, confirmStripePayment);
router.get('/guest/:id', getGuestOrderByIdWithToken);
router.post('/guest/:id/request-cancellation', requestGuestOrderCancellation);
router.post('/guest/:id/items/:itemId/request-cancellation', requestGuestOrderItemCancellation);
router.post(
  '/guest/:id/items/:itemId/approve-artwork',
  (req, res, next) => {
    uploadGuestArtworkFile.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
      next();
    });
  },
  approveGuestOrderItemArtwork
);
router.post('/:id/request-cancellation', authenticateToken, requestOrderCancellation);
router.post(
  '/:id/items/:itemId/request-cancellation',
  authenticateToken,
  requestOrderItemCancellation
);
router.get('/', authenticateToken, getOrders);
router.post(
  '/:orderId/items/:itemId/approve-artwork',
  authenticateToken,
  (req, res, next) => {
    uploadArtworkFile.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ message: 'File upload failed' });
      next();
    });
  },
  approveOrderItemArtwork
);
// Admin routes - require admin role
router.get('/admin/all', authenticateToken, requireAdmin, getAllOrders);
router.post('/admin/from-cart', authenticateToken, requireAdmin, createOrderFromCartItem);
router.get('/admin/:id', authenticateToken, requireAdmin, getOrderByIdAdmin);
router.put('/admin/:id/status', authenticateToken, requireAdmin, updateOrderStatus);
router.put('/admin/:id/items/:itemId/status', authenticateToken, requireAdmin, updateOrderItemStatus);
router.post('/admin/:id/refund', authenticateToken, requireAdmin, refundOrderAdmin);
router.post(
  '/admin/:id/items/:itemId/refund',
  authenticateToken,
  requireAdmin,
  refundOrderItemAdmin
);
router.put('/admin/:id/order-tracking', authenticateToken, requireAdmin, updateOrderTrackingId);
router.delete('/admin/:id', authenticateToken, requireAdmin, deleteOrderAdmin);
// This route should be last to avoid conflicts
router.get('/:id', authenticateToken, getOrderById);

module.exports = router;

