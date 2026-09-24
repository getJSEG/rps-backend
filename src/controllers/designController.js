const path = require('path');
const pool = require('../config/database');
const { deleteManyByUrl } = require('../utils/spaces');
const {
  saveArtworkBufferToStorage,
  validateArtworkBufferAgainstOrderDimensions,
} = require('./artworkController');

const { readGuestSessionId, designOwnerFilter: ownerFilter } = require('../services/designService');

const DESIGN_COLUMNS = `id, user_id, guest_session_id, product_id, template_id, source, design_state,
  file_url, original_file_url, mime_type, width_px, height_px, approved_at, created_at, updated_at`;

function toDesignDto(row) {
  return {
    id: row.id,
    productId: row.product_id,
    templateId: row.template_id,
    source: row.source,
    designState: row.design_state,
    fileUrl: row.file_url,
    hasOriginal: Boolean(row.original_file_url),
    mimeType: row.mime_type,
    widthPx: row.width_px,
    heightPx: row.height_px,
    approved: row.approved_at != null,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseId(raw) {
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** PDFs from some browsers arrive as application/x-pdf or octet-stream; normalise like guest artwork upload. */
function normalizeMime(file) {
  const mime = String(file?.mimetype || '').toLowerCase().trim();
  const name = String(file?.originalname || '').toLowerCase();
  if (mime === 'application/pdf' || mime === 'application/x-pdf' || name.endsWith('.pdf')) return 'application/pdf';
  if (mime === 'image/jpg') return 'image/jpeg';
  return mime;
}

function parseDesignState(raw) {
  if (raw == null || raw === '') return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    throw Object.assign(new Error('design_state must be valid JSON.'), { statusCode: 400 });
  }
}

/**
 * Validate the request body/file and store the file.
 * @returns {Promise<{ source, productId, templateId, designState, fileUrl, mimeType, widthPx, heightPx }>}
 */
async function readAndStoreDesignFile(req) {
  const file = req.files?.file?.[0];
  const original = req.files?.original?.[0];
  if (!file || !file.buffer) {
    throw Object.assign(new Error('No design file uploaded.'), { statusCode: 400 });
  }
  const source = String(req.body?.source || '').trim();
  if (source !== 'created' && source !== 'uploaded') {
    throw Object.assign(new Error("source must be 'created' or 'uploaded'."), { statusCode: 400 });
  }
  const productId = parseId(req.body?.product_id);
  if (!productId) {
    throw Object.assign(new Error('product_id is required.'), { statusCode: 400 });
  }
  const product = await pool.query('SELECT id FROM products WHERE id = $1', [productId]);
  if (product.rowCount === 0) {
    throw Object.assign(new Error('Product not found.'), { statusCode: 404 });
  }

  const templateId = parseId(req.body?.template_id);
  if (templateId) {
    const tpl = await pool.query(
      'SELECT id FROM product_design_templates WHERE id = $1 AND product_id = $2',
      [templateId, productId]
    );
    if (tpl.rowCount === 0) {
      throw Object.assign(new Error('Template does not belong to this product.'), { statusCode: 400 });
    }
  }

  const mimeType = normalizeMime(file);
  // Custom-size (blank canvas) designs and uploads must match the job's print size; template shapes are fixed by the admin.
  const enforceSize = !templateId;
  let dimensions;
  try {
    dimensions = await validateArtworkBufferAgainstOrderDimensions(
      file.buffer,
      mimeType,
      enforceSize ? req.body?.width_in : null,
      enforceSize ? req.body?.height_in : null
    );
  } catch (err) {
    throw Object.assign(new Error(err.message || 'Could not read the design file.'), { statusCode: 400 });
  }
  const { url } = await saveArtworkBufferToStorage(file.buffer, mimeType, dimensions);

  // Uploaded image before editing; with design_state it lets the editor reopen the customer's layers.
  let originalUrl = null;
  if (original?.buffer) {
    const originalMime = normalizeMime(original);
    if (originalMime !== 'image/png' && originalMime !== 'image/jpeg') {
      await deleteManyByUrl([url]).catch(() => {});
      throw Object.assign(new Error('The original upload must be a PNG or JPG image.'), { statusCode: 400 });
    }
    ({ url: originalUrl } = await saveArtworkBufferToStorage(original.buffer, originalMime));
  }

  return {
    source,
    productId,
    templateId,
    designState: source === 'created' || originalUrl ? parseDesignState(req.body?.design_state) : null,
    fileUrl: url,
    originalUrl,
    mimeType,
    widthPx: dimensions.widthPx,
    heightPx: dimensions.heightPx,
  };
}

async function deleteStoredFiles(stored) {
  const urls = [stored?.fileUrl, stored?.originalUrl].filter(Boolean);
  if (urls.length) await deleteManyByUrl(urls).catch(() => {});
}

function sendError(res, error, fallback) {
  const status = Number(error?.statusCode) || 500;
  if (status >= 500) console.error(fallback, error);
  return res.status(status).json({ message: status >= 500 ? fallback : error.message });
}

/** POST /api/designs (multipart): file, source, product_id, [template_id], [design_state], [width_in, height_in] */
const createDesign = async (req, res) => {
  let stored;
  try {
    stored = await readAndStoreDesignFile(req);
    const result = await pool.query(
      `INSERT INTO designs
        (user_id, guest_session_id, product_id, template_id, source, design_state, file_url, mime_type, width_px, height_px, original_file_url)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
       RETURNING ${DESIGN_COLUMNS}`,
      [
        req.user?.id ?? null,
        req.user ? null : readGuestSessionId(req),
        stored.productId,
        stored.templateId,
        stored.source,
        stored.designState == null ? null : JSON.stringify(stored.designState),
        stored.fileUrl,
        stored.mimeType,
        stored.widthPx,
        stored.heightPx,
        stored.originalUrl,
      ]
    );
    return res.status(201).json({ design: toDesignDto(result.rows[0]) });
  } catch (error) {
    await deleteStoredFiles(stored);
    return sendError(res, error, 'Could not save design.');
  }
};

/** PUT /api/designs/:id (multipart, same fields as create): replace after "Edit my design". Clears approval. */
const updateDesign = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid design id.' });
  let stored;
  try {
    const owner = ownerFilter(req, 2);
    const existing = await pool.query(
      `SELECT file_url, original_file_url FROM designs WHERE id = $1 AND ${owner.sql}`,
      [id, ...owner.params]
    );
    if (existing.rowCount === 0) return res.status(404).json({ message: 'Design not found.' });

    stored = await readAndStoreDesignFile(req);
    const result = await pool.query(
      `UPDATE designs
       SET product_id = $2, template_id = $3, source = $4, design_state = $5::jsonb, file_url = $6,
           mime_type = $7, width_px = $8, height_px = $9, original_file_url = $10,
           approved_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING ${DESIGN_COLUMNS}`,
      [
        id,
        stored.productId,
        stored.templateId,
        stored.source,
        stored.designState == null ? null : JSON.stringify(stored.designState),
        stored.fileUrl,
        stored.mimeType,
        stored.widthPx,
        stored.heightPx,
        stored.originalUrl,
      ]
    );
    const previous = existing.rows[0];
    const stale = [previous.file_url, previous.original_file_url].filter(
      (u) => u && u !== stored.fileUrl && u !== stored.originalUrl
    );
    if (stale.length) await deleteManyByUrl(stale).catch(() => {});
    return res.json({ design: toDesignDto(result.rows[0]) });
  } catch (error) {
    await deleteStoredFiles(stored);
    return sendError(res, error, 'Could not update design.');
  }
};

/** POST /api/designs/:id/approve: the customer ticked "I have reviewed and approve my design". */
const approveDesign = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid design id.' });
  try {
    const owner = ownerFilter(req, 2);
    const result = await pool.query(
      `UPDATE designs SET approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND ${owner.sql}
       RETURNING ${DESIGN_COLUMNS}`,
      [id, ...owner.params]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Design not found.' });
    return res.json({ design: toDesignDto(result.rows[0]) });
  } catch (error) {
    return sendError(res, error, 'Could not approve design.');
  }
};

/** GET /api/designs/:id: reopen a design in the editor or review step. */
const getDesign = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid design id.' });
  try {
    const owner = ownerFilter(req, 2);
    const result = await pool.query(
      `SELECT ${DESIGN_COLUMNS} FROM designs WHERE id = $1 AND ${owner.sql}`,
      [id, ...owner.params]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Design not found.' });
    return res.json({ design: toDesignDto(result.rows[0]) });
  } catch (error) {
    return sendError(res, error, 'Could not load design.');
  }
};

/**
 * GET /api/designs/:id/original: the customer's uploaded image (or the design itself when there is none), streamed
 * through the API so the editor can load it without storage CORS rules. Owner only.
 */
const getDesignOriginal = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid design id.' });
  try {
    const owner = ownerFilter(req, 2);
    const result = await pool.query(
      `SELECT COALESCE(original_file_url, file_url) AS url FROM designs WHERE id = $1 AND ${owner.sql}`,
      [id, ...owner.params]
    );
    const url = result.rows[0]?.url;
    if (!url) return res.status(404).json({ message: 'Design not found.' });
    res.set('Cache-Control', 'private, no-store');
    if (url.startsWith('/uploads/')) {
      return res.sendFile(path.join(__dirname, '../..', url));
    }
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(502).json({ message: 'Design file unavailable.' });
    res.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    return sendError(res, error, 'Could not load design file.');
  }
};

module.exports = { createDesign, updateDesign, approveDesign, getDesign, getDesignOriginal };
