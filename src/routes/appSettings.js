const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getAppSettings, putAppSettings, getPublicSiteContent } = require('../controllers/appSettingsController');

router.get('/public', getPublicSiteContent);
router.get('/', authenticateToken, requireAdmin, getAppSettings);
router.put('/', authenticateToken, requireAdmin, putAppSettings);

module.exports = router;
