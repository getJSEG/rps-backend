const multer = require('multer');
const path = require('path');
const fs = require('fs');

const fileFilter = (req, file, cb) => {
  const allowed = /^image\/(jpeg|jpg|png|gif|webp)$/i;
  if (allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpeg, jpg, png, gif, webp) are allowed'), false);
  }
};

const artworkFileFilter = (req, file, cb) => {
  const mime = String(file.mimetype || "").toLowerCase();
  const allowed = new Set(["image/png", "image/jpeg", "application/pdf"]);
  if (allowed.has(mime)) {
    cb(null, true);
  } else {
    cb(new Error("Only PNG, JPG and single-page PDF files are allowed"), false);
  }
};

const limit = { fileSize: 5 * 1024 * 1024 }; // 5MB

// ---- Employees: disk storage (or memory + Spaces in controller) ----
const uploadDir = path.join(__dirname, '../../uploads/employees');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${safeExt}`);
  },
});
const upload = multer({ storage, fileFilter, limits: limit });

// ---- Product & Category: memory storage for Spaces upload or disk fallback ----
const memoryStorage = multer.memoryStorage();
const uploadProductImage = multer({ storage: memoryStorage, fileFilter, limits: limit });
const uploadCategoryImage = multer({ storage: memoryStorage, fileFilter, limits: limit });

// Employee profile: memory when using Spaces
const uploadEmployeeMemory = multer({ storage: memoryStorage, fileFilter, limits: limit });
const uploadArtworkFile = multer({ storage: memoryStorage, fileFilter: artworkFileFilter, limits: limit });

module.exports = { upload, uploadProductImage, uploadCategoryImage, uploadEmployeeMemory, uploadArtworkFile };
