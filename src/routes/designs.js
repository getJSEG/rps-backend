const express = require('express');
const router = express.Router();
const { authenticateTokenOrGuestSession } = require('../middleware/auth');
const { uploadDesignFile } = require('../middleware/upload');
const {
  createDesign,
  updateDesign,
  approveDesign,
  getDesign,
  getDesignOriginal,
} = require('../controllers/designController');

// `file` is the finished design; `original` is the customer's image before editing (uploads only).
const acceptDesignFiles = (req, res, next) => {
  uploadDesignFile.fields([
    { name: 'file', maxCount: 1 },
    { name: 'original', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
    next();
  });
};

router.post('/', authenticateTokenOrGuestSession, acceptDesignFiles, createDesign);
router.get('/:id', authenticateTokenOrGuestSession, getDesign);
router.get('/:id/original', authenticateTokenOrGuestSession, getDesignOriginal);
router.put('/:id', authenticateTokenOrGuestSession, acceptDesignFiles, updateDesign);
router.post('/:id/approve', authenticateTokenOrGuestSession, approveDesign);

module.exports = router;
