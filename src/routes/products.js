const express = require('express');
const router = express.Router();
const { getAllProducts, getProductById, getCategories, getRelatedProducts, createCategory, updateCategory, deleteCategory, createProduct, updateProduct, getAllProductsAdmin, deleteProductAdmin, uploadProductImage, uploadCategoryImage } = require('../controllers/productController');
const { optionalAuth } = require('../middleware/auth');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { uploadProductImage: uploadProductImageMw, uploadCategoryImage: uploadCategoryImageMw } = require('../middleware/upload');

router.get('/', optionalAuth, getAllProducts);
router.get('/categories', getCategories);
router.get('/related', optionalAuth, getRelatedProducts);

// Admin: products and categories (must be before /:id)
router.get('/admin/products', authenticateToken, requireAdmin, getAllProductsAdmin);
router.post('/admin/products', authenticateToken, requireAdmin, createProduct);
router.post('/admin/upload-image', authenticateToken, requireAdmin, (req, res, next) => {
  uploadProductImageMw.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
    next();
  });
}, uploadProductImage);
router.post('/admin/upload-category-image', authenticateToken, requireAdmin, (req, res, next) => {
  uploadCategoryImageMw.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
    next();
  });
}, uploadCategoryImage);
router.put('/admin/products/:id', authenticateToken, requireAdmin, updateProduct);
router.delete('/admin/products/:id', authenticateToken, requireAdmin, deleteProductAdmin);
router.post('/admin/categories', authenticateToken, requireAdmin, createCategory);
router.put('/admin/categories/:id', authenticateToken, requireAdmin, updateCategory);
router.delete('/admin/categories/:id', authenticateToken, requireAdmin, deleteCategory);

router.get('/:id', optionalAuth, getProductById);

module.exports = router;

