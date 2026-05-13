const express = require('express');
const router = express.Router();
const { optionalAuth, authenticateToken, requireAdmin } = require('../middleware/auth');
const { getFedexRates, createShipmentForOrder, getTrackingForOrder } = require('../controllers/fedexController');

router.post('/rates', optionalAuth, getFedexRates);
router.post('/shipments/:orderId/create', authenticateToken, requireAdmin, createShipmentForOrder);
router.get('/shipments/:orderId/track', authenticateToken, requireAdmin, getTrackingForOrder);

module.exports = router;
