const express = require('express');
const router = express.Router();

const { getAdminDashboard } = require('../controllers/reportsController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.get('/admin/dashboard', authenticateToken, requireAdmin, getAdminDashboard);

module.exports = router;
