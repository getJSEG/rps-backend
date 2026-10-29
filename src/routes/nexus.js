const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  listNexusStatesAdmin,
  updateNexusThresholdAdmin,
  updateNexusStatusAdmin,
  getNexusAttentionCountAdmin,
} = require('../controllers/nexusController');

router.get('/admin/states', authenticateToken, requireAdmin, listNexusStatesAdmin);
router.put('/admin/states/:code/threshold', authenticateToken, requireAdmin, updateNexusThresholdAdmin);
router.put('/admin/states/:code/status', authenticateToken, requireAdmin, updateNexusStatusAdmin);
router.get('/admin/attention-count', authenticateToken, requireAdmin, getNexusAttentionCountAdmin);

module.exports = router;
