const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");
const pool = require("../config/database");
const { uploadFromBuffer, isConfigured: spacesConfigured } = require("../utils/spaces");

/** Match frontend `artworkProportion.ts` so pass/fail is consistent. */
const RATIO_TOLERANCE = 0.06;

let tableReady = false;

async function ensureArtworkTable() {
  if (tableReady) return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS artworks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      size_bytes INTEGER NOT NULL,
      width_px INTEGER,
      height_px INTEGER,
      pdf_page_count INTEGER,
      url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await pool.query("CREATE INDEX IF NOT EXISTS idx_artworks_user_created ON artworks(user_id, created_at DESC)");
  tableReady = true;
}

function writeBufferToUploadDir(buffer, ext) {
  const uploadDir = path.join(__dirname, "../../uploads/artworks");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
  const fullPath = path.join(uploadDir, filename);
  fs.writeFileSync(fullPath, buffer);
  return `/uploads/artworks/${filename}`;
}

/**
 * Save buffer to Spaces or local uploads/artworks. Does not insert into artworks table.
 * @param {{ widthPx: number, heightPx: number, pdfPageCount: number|null, extension: string }} [precomputedDimensions] from validateArtworkBufferAgainstOrderDimensions to avoid a second decode.
 */
async function saveArtworkBufferToStorage(fileBuffer, mimeType, precomputedDimensions = null) {
  const dimensions = precomputedDimensions ?? (await readArtworkDimensions(fileBuffer, mimeType));
  let url;
  if (spacesConfigured()) {
    url = await uploadFromBuffer(fileBuffer, "elmer/artworks", { contentType: mimeType });
  } else {
    url = writeBufferToUploadDir(fileBuffer, dimensions.extension);
  }
  return { url, dimensions };
}

function aspectMatch(pxW, pxH, reqW, reqH) {
  if (pxW <= 0 || pxH <= 0 || reqW <= 0 || reqH <= 0) return true;
  const rU = pxW / pxH;
  const rR = reqW / reqH;
  const rel = Math.abs(rU - rR) / rR;
  return rel <= RATIO_TOLERANCE;
}

/** Compare to job W×H, or artwork rotated 90° vs job (swap required W/H). */
function assertAspectRatioMatchesPrintSize(pxW, pxH, reqWIn, reqHIn) {
  const rw = reqWIn != null && reqWIn !== "" ? Number(reqWIn) : NaN;
  const rh = reqHIn != null && reqHIn !== "" ? Number(reqHIn) : NaN;
  if (!Number.isFinite(rw) || !Number.isFinite(rh) || rw <= 0 || rh <= 0) {
    return;
  }
  if (!Number.isFinite(pxW) || !Number.isFinite(pxH) || pxW <= 0 || pxH <= 0) {
    throw new Error("Could not read artwork dimensions.");
  }
  const ok = aspectMatch(pxW, pxH, rw, rh) || aspectMatch(pxW, pxH, rh, rw);
  if (!ok) {
    const wf = Number(rw.toFixed(4));
    const hf = Number(rh.toFixed(4));
    throw new Error(
      `Artwork aspect ratio does not match this job's print size (required ${wf}" × ${hf}").`
    );
  }
}

/**
 * Reads dimensions once and checks aspect ratio vs order line inches (when both are set).
 * @returns {Promise<{ widthPx: number, heightPx: number, pdfPageCount: number|null, extension: string }>}
 */
async function validateArtworkBufferAgainstOrderDimensions(fileBuffer, mimeType, widthInches, heightInches) {
  const dimensions = await readArtworkDimensions(fileBuffer, mimeType);
  assertAspectRatioMatchesPrintSize(dimensions.widthPx, dimensions.heightPx, widthInches, heightInches);
  return dimensions;
}

async function readArtworkDimensions(fileBuffer, mimeType) {
  if (mimeType === "application/pdf") {
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const pageCount = pdfDoc.getPageCount();
    if (pageCount !== 1) {
      throw new Error("Only single-page PDF files are accepted.");
    }
    const first = pdfDoc.getPage(0);
    const size = first.getSize();
    return {
      widthPx: Math.round(size.width),
      heightPx: Math.round(size.height),
      pdfPageCount: pageCount,
      extension: ".pdf",
    };
  }

  const metadata = await sharp(fileBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read image dimensions.");
  }
  return {
    widthPx: metadata.width,
    heightPx: metadata.height,
    pdfPageCount: null,
    extension: metadata.format === "png" ? ".png" : ".jpg",
  };
}

const uploadArtwork = async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: "No artwork file uploaded." });
  }

  try {
    await ensureArtworkTable();
    const mimeType = String(req.file.mimetype || "").toLowerCase();
    const fileBuffer = req.file.buffer;
    const { url, dimensions } = await saveArtworkBufferToStorage(fileBuffer, mimeType);

    const saved = await pool.query(
      `INSERT INTO artworks (user_id, file_name, mime_type, size_bytes, width_px, height_px, pdf_page_count, url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, file_name, mime_type, size_bytes, width_px, height_px, pdf_page_count, url, created_at`,
      [
        req.user.id,
        req.file.originalname,
        mimeType,
        req.file.size,
        dimensions.widthPx,
        dimensions.heightPx,
        dimensions.pdfPageCount,
        url,
      ]
    );
    const row = saved.rows[0];
    return res.status(201).json({
      id: row.id,
      fileName: req.file.originalname,
      mimeType,
      sizeBytes: req.file.size,
      widthPx: dimensions.widthPx,
      heightPx: dimensions.heightPx,
      pdfPageCount: dimensions.pdfPageCount,
      unit: "px",
      url,
      createdAt: row.created_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Artwork upload failed.";
    return res.status(400).json({ message });
  }
};

const getMyArtworks = async (req, res) => {
  try {
    await ensureArtworkTable();
    const result = await pool.query(
      `SELECT id, file_name, mime_type, size_bytes, width_px, height_px, pdf_page_count, url, created_at
       FROM artworks
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    return res.json({
      artworks: result.rows.map((r) => ({
        id: r.id,
        fileName: r.file_name,
        mimeType: r.mime_type,
        sizeBytes: r.size_bytes,
        widthPx: r.width_px,
        heightPx: r.height_px,
        pdfPageCount: r.pdf_page_count,
        unit: "px",
        url: r.url,
        createdAt: r.created_at,
      })),
    });
  } catch {
    return res.status(500).json({ message: "Could not load artworks." });
  }
};

const deleteArtwork = async (req, res) => {
  try {
    await ensureArtworkTable();
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid artwork id." });
    }
    const result = await pool.query(
      "DELETE FROM artworks WHERE id = $1 AND user_id = $2 RETURNING id, url",
      [id, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ message: "Artwork not found." });
    }
    const deletedUrl = String(result.rows[0].url || "");
    if (deletedUrl.startsWith("/uploads/artworks/")) {
      const fullPath = path.join(__dirname, "../../", deletedUrl.replace(/^\/+/, ""));
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch {
          // Keep request successful even when file cleanup fails.
        }
      }
    }
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ message: "Could not delete artwork." });
  }
};

module.exports = {
  uploadArtwork,
  getMyArtworks,
  deleteArtwork,
  saveArtworkBufferToStorage,
  validateArtworkBufferAgainstOrderDimensions,
};
