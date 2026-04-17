const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { uploadArtworkFile } = require("../middleware/upload");
const { uploadArtwork, getMyArtworks, deleteArtwork } = require("../controllers/artworkController");

router.post("/upload", authenticateToken, (req, res, next) => {
  uploadArtworkFile.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ message: "File upload failed" });
    next();
  });
}, uploadArtwork);
router.get("/my", authenticateToken, getMyArtworks);
router.delete("/:id", authenticateToken, deleteArtwork);

module.exports = router;
