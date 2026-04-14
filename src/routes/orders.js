const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrders,
  getOrderById,
  getAllOrders,
  getOrderByIdAdmin,
  updateOrderStatus,
  updateOrderTrackingId,
  deleteOrderAdmin,
  createOrderFromCartItem,
  createOrderWithPaymentIntent,
  confirmStripePayment,
  requestOrderCancellation,
  refundOrderAdmin,
} = require('../controllers/orderController');
const { authenticateToken, optionalAuth, requireAdmin } = require('../middleware/auth');

router.post('/', optionalAuth, createOrder);
router.post('/create-payment-intent', optionalAuth, createOrderWithPaymentIntent);
router.post('/confirm-stripe-payment', optionalAuth, confirmStripePayment);
router.post('/:id/request-cancellation', authenticateToken, requestOrderCancellation);
router.get('/', authenticateToken, getOrders);
// Admin routes - require admin role
router.get('/admin/all', authenticateToken, requireAdmin, getAllOrders);
router.post('/admin/from-cart', authenticateToken, requireAdmin, createOrderFromCartItem);
router.get('/admin/:id', authenticateToken, requireAdmin, getOrderByIdAdmin);
router.put('/admin/:id/status', authenticateToken, requireAdmin, updateOrderStatus);
router.post('/admin/:id/refund', authenticateToken, requireAdmin, refundOrderAdmin);
router.put('/admin/:id/order-tracking', authenticateToken, requireAdmin, updateOrderTrackingId);
router.delete('/admin/:id', authenticateToken, requireAdmin, deleteOrderAdmin);
// This route should be last to avoid conflicts
router.get('/:id', authenticateToken, getOrderById);

module.exports = router;

