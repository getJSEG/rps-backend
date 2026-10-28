const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  getHelpCenter,
  getHelpCenterAdmin,
  createCategoryAdmin,
  updateCategoryAdmin,
  deleteCategoryAdmin,
  reorderCategoriesAdmin,
  createFaqAdmin,
  updateFaqAdmin,
  deleteFaqAdmin,
  reorderFaqsAdmin,
} = require('../controllers/helpCenterController');

router.get('/', getHelpCenter);
router.get('/admin', authenticateToken, requireAdmin, getHelpCenterAdmin);
router.post('/admin/categories', authenticateToken, requireAdmin, createCategoryAdmin);
router.put('/admin/categories/reorder', authenticateToken, requireAdmin, reorderCategoriesAdmin);
router.put('/admin/categories/:id', authenticateToken, requireAdmin, updateCategoryAdmin);
router.delete('/admin/categories/:id', authenticateToken, requireAdmin, deleteCategoryAdmin);
router.put('/admin/categories/:id/faqs/reorder', authenticateToken, requireAdmin, reorderFaqsAdmin);
router.post('/admin/faqs', authenticateToken, requireAdmin, createFaqAdmin);
router.put('/admin/faqs/:id', authenticateToken, requireAdmin, updateFaqAdmin);
router.delete('/admin/faqs/:id', authenticateToken, requireAdmin, deleteFaqAdmin);

module.exports = router;
