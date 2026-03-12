const { Readable } = require('stream');

/** @returns {import('cloudinary').v2 | null} */
function getCloudinary() {
  if (process.env.CLOUDINARY_URL) {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config(); // uses CLOUDINARY_URL
    return cloudinary;
  }
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    return cloudinary;
  }
  return null;
}

const cloudinary = getCloudinary();

/**
 * Upload image buffer to Cloudinary.
 * @param {Buffer} buffer - Image file buffer
 * @param {string} folder - Cloudinary folder (e.g. 'elmer/products', 'elmer/employees')
 * @returns {Promise<string>} - secure_url
 */
function uploadFromBuffer(buffer, folder = 'elmer') {
  return new Promise((resolve, reject) => {
    if (!cloudinary) return reject(new Error('Cloudinary not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, API_KEY, API_SECRET.'));
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => {
        if (err) return reject(err);
        if (result && result.secure_url) return resolve(result.secure_url);
        reject(new Error('Upload failed: no URL returned'));
      }
    );
    const readStream = Readable.from(buffer);
    readStream.pipe(stream);
  });
}

function isConfigured() {
  return !!cloudinary;
}

module.exports = { uploadFromBuffer, isConfigured, getCloudinary };
