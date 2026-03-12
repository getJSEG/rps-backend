const express = require('express');
const router = express.Router();
const { getEstimates, createEstimate, getEstimateById } = require('../controllers/estimateController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, getEstimates);
router.post('/', authenticateToken, createEstimate);
router.get('/:id', authenticateToken, getEstimateById);

module.exports = router;

