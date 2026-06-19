const express = require('express');
const router = express.Router();
const {
  getAllProducts,
  getProductById,
  previewProductPrice,
  getCategories,
  getRelatedProducts,
  createCategory,
  updateCategory,
  deleteCategory,
  createProduct,
  updateProduct,
  getAllProductsAdmin,
  deleteProductAdmin,
  uploadProductImage,
  uploadCategoryImage,
  uploadProductTemplateFile,
  deleteUploadedProductTemplateFile,
  getProductModifierConfigAdmin,
  updateProductModifierConfigAdmin,
  getModifierCatalogAdmin,
  updateModifierCatalogAdmin,
  deleteModifierCatalogGroupAdmin,
  getModifierTaxonomyAdmin,
  createModifierCategoryAdmin,
  updateModifierCategoryAdmin,
  deleteModifierCategoryAdmin,
  createModifierSubcategoryAdmin,
  updateModifierSubcategoryAdmin,
  deleteModifierSubcategoryAdmin,
  getModifierPresetsAdmin,
  createModifierPresetAdmin,
  updateModifierPresetAdmin,
  deleteModifierPresetAdmin,
  getProductPurchaseOptionsAdmin,
  updateProductPurchaseOptionsAdmin,
  getProductShippingBoxRulesAdmin,
  updateProductShippingBoxRulesAdmin,
  getHardwareTemplatesAdmin,
  upsertHardwareTemplateAdmin,
  deleteHardwareTemplateAdmin,
} = require('../controllers/productController');
const { optionalAuth } = require('../middleware/auth');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  uploadProductImage: uploadProductImageMw,
  uploadCategoryImage: uploadCategoryImageMw,
  uploadProductTemplateFile: uploadProductTemplateFileMw,
} = require('../middleware/upload');

router.get('/', optionalAuth, getAllProducts);
router.get('/categories', getCategories);
router.get('/related', optionalAuth, getRelatedProducts);
router.post('/:id/price-preview', optionalAuth, previewProductPrice);

// Admin: products and categories (must be before /:id)
router.get('/admin/products', authenticateToken, requireAdmin, getAllProductsAdmin);
router.post('/admin/products', authenticateToken, requireAdmin, createProduct);
router.post('/admin/upload-image', authenticateToken, requireAdmin, (req, res, next) => {
  uploadProductImageMw.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ message: 'File upload failed' });
    next();
  });
}, uploadProductImage);
router.post('/admin/upload-category-image', authenticateToken, requireAdmin, (req, res, next) => {
  uploadCategoryImageMw.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ message: 'File upload failed' });
    next();
  });
}, uploadCategoryImage);
router.post('/admin/upload-template-file', authenticateToken, requireAdmin, (req, res, next) => {
  uploadProductTemplateFileMw.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
    next();
  });
}, uploadProductTemplateFile);
router.delete('/admin/upload-template-file', authenticateToken, requireAdmin, deleteUploadedProductTemplateFile);
router.put('/admin/products/:id', authenticateToken, requireAdmin, updateProduct);
router.get('/admin/products/:id/modifiers', authenticateToken, requireAdmin, getProductModifierConfigAdmin);
router.put('/admin/products/:id/modifiers', authenticateToken, requireAdmin, updateProductModifierConfigAdmin);
router.get('/admin/products/:id/purchase-options', authenticateToken, requireAdmin, getProductPurchaseOptionsAdmin);
router.put('/admin/products/:id/purchase-options', authenticateToken, requireAdmin, updateProductPurchaseOptionsAdmin);
router.get('/admin/products/:id/shipping-box-rules', authenticateToken, requireAdmin, getProductShippingBoxRulesAdmin);
router.put('/admin/products/:id/shipping-box-rules', authenticateToken, requireAdmin, updateProductShippingBoxRulesAdmin);
router.get('/admin/hardware-templates', authenticateToken, requireAdmin, getHardwareTemplatesAdmin);
router.post('/admin/hardware-templates', authenticateToken, requireAdmin, upsertHardwareTemplateAdmin);
router.put('/admin/hardware-templates/:id', authenticateToken, requireAdmin, upsertHardwareTemplateAdmin);
router.delete('/admin/hardware-templates/:id', authenticateToken, requireAdmin, deleteHardwareTemplateAdmin);
router.delete('/admin/products/:id', authenticateToken, requireAdmin, deleteProductAdmin);
router.get('/admin/modifier-catalog', authenticateToken, requireAdmin, getModifierCatalogAdmin);
router.put('/admin/modifier-catalog', authenticateToken, requireAdmin, updateModifierCatalogAdmin);
router.delete('/admin/modifier-catalog/:key', authenticateToken, requireAdmin, deleteModifierCatalogGroupAdmin);
router.get('/admin/modifier-taxonomy', authenticateToken, requireAdmin, getModifierTaxonomyAdmin);
router.post('/admin/modifier-categories', authenticateToken, requireAdmin, createModifierCategoryAdmin);
router.put('/admin/modifier-categories/:id', authenticateToken, requireAdmin, updateModifierCategoryAdmin);
router.delete('/admin/modifier-categories/:id', authenticateToken, requireAdmin, deleteModifierCategoryAdmin);
router.post('/admin/modifier-subcategories', authenticateToken, requireAdmin, createModifierSubcategoryAdmin);
router.put('/admin/modifier-subcategories/:id', authenticateToken, requireAdmin, updateModifierSubcategoryAdmin);
router.delete('/admin/modifier-subcategories/:id', authenticateToken, requireAdmin, deleteModifierSubcategoryAdmin);
router.get('/admin/modifier-presets', authenticateToken, requireAdmin, getModifierPresetsAdmin);
router.post('/admin/modifier-presets', authenticateToken, requireAdmin, createModifierPresetAdmin);
router.put('/admin/modifier-presets/:id', authenticateToken, requireAdmin, updateModifierPresetAdmin);
router.delete('/admin/modifier-presets/:id', authenticateToken, requireAdmin, deleteModifierPresetAdmin);
router.post('/admin/categories', authenticateToken, requireAdmin, createCategory);
router.put('/admin/categories/:id', authenticateToken, requireAdmin, updateCategory);
router.delete('/admin/categories/:id', authenticateToken, requireAdmin, deleteCategory);

router.get('/:id', optionalAuth, getProductById);

module.exports = router;

