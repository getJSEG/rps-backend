const express = require('express');
const router = express.Router();
const { authenticateTokenOrGuestSession } = require('../middleware/auth');
const { uploadDesignFile } = require('../middleware/upload');
const { createDesign, updateDesign, approveDesign, getDesign } = require('../controllers/designController');

const acceptDesignFile = (req, res, next) => {
  uploadDesignFile.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'File upload failed' });
    next();
  });
};

router.post('/', authenticateTokenOrGuestSession, acceptDesignFile, createDesign);
router.get('/:id', authenticateTokenOrGuestSession, getDesign);
router.put('/:id', authenticateTokenOrGuestSession, acceptDesignFile, updateDesign);
router.post('/:id/approve', authenticateTokenOrGuestSession, approveDesign);

module.exports = router;
