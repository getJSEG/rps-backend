const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const { estimateTax } = require('../controllers/taxController');

router.post('/estimate', optionalAuth, estimateTax);

module.exports = router;
