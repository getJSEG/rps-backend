const express = require('express');
const router = express.Router();
const { getClaims, createClaim, getClaimById } = require('../controllers/claimController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, getClaims);
router.post('/', authenticateToken, createClaim);
router.get('/:id', authenticateToken, getClaimById);

module.exports = router;

