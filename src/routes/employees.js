const express = require('express');
const router = express.Router();
const { getAll, getById, create, update, remove, uploadProfileImage } = require('../controllers/employeeController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { uploadEmployeeMemory } = require('../middleware/upload');

router.get('/', authenticateToken, requireAdmin, getAll);
router.get('/:id', authenticateToken, requireAdmin, getById);
router.post('/upload', authenticateToken, requireAdmin, (req, res, next) => {
  uploadEmployeeMemory.single('profile_image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'File upload failed' });
    }
    next();
  });
}, uploadProfileImage);
router.post('/', authenticateToken, requireAdmin, create);
router.put('/:id', authenticateToken, requireAdmin, update);
router.delete('/:id', authenticateToken, requireAdmin, remove);

module.exports = router;
