const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getAppSettings, putAppSettings } = require('../controllers/appSettingsController');

router.get('/', authenticateToken, requireAdmin, getAppSettings);
router.put('/', authenticateToken, requireAdmin, putAppSettings);

module.exports = router;
