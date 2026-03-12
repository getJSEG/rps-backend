const express = require('express');
const router = express.Router();
const { getAddresses, createAddress, updateAddress, deleteAddress } = require('../controllers/addressController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, getAddresses);
router.post('/', authenticateToken, createAddress);
router.put('/:id', authenticateToken, updateAddress);
router.delete('/:id', authenticateToken, deleteAddress);

module.exports = router;

