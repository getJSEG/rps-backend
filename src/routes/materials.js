const express = require('express');
const router = express.Router();
const { getMaterials, getMaterialById } = require('../controllers/materialController');
const { optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, getMaterials);
router.get('/:id', optionalAuth, getMaterialById);

module.exports = router;

