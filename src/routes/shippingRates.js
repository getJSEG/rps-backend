const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getShippingRates, putShippingRatesAdmin } = require('../controllers/shippingRatesController');

router.get('/', getShippingRates);
router.put('/', authenticateToken, requireAdmin, putShippingRatesAdmin);

module.exports = router;
