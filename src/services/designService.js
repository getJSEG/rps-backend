const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const { deleteManyByUrl } = require('../utils/spaces');

function readGuestSessionId(req) {
  if (req.guestSessionId) return req.guestSessionId;
  const sid = String(req.headers['x-guest-session-id'] || '').trim();
  return sid.length >= 8 && sid.length <= 128 ? sid : null;
}

/**
 * Designs belong to a user or a guest session. A guest who logs in mid-flow still sends the guest header,
 * so either identity grants access. Returns a SQL condition using placeholders from `startIndex`.
 */
function designOwnerFilter(req, startIndex) {
  return {
    sql: `((user_id IS NOT NULL AND user_id = $${startIndex}) OR (guest_session_id IS NOT NULL AND guest_session_id = $${startIndex + 1}))`,
    params: [req.user?.id ?? null, readGuestSessionId(req)],
  };
}

function validationError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/**
 * Cart jobs may reference a design by id. Replace whatever the client sent with the stored design URL, and
 * reject designs that are not the caller's, not approved, or made for another product.
 * Mutates and returns `cartItem`.
 */
async function attachVerifiedDesignsToCartJobs(req, cartItem) {
  const jobs = Array.isArray(cartItem?.jobs) ? cartItem.jobs : [];
  const ids = [...new Set(jobs.map((j) => j.designId).filter((id) => id != null))];
  if (ids.length === 0) return cartItem;

  const owner = designOwnerFilter(req, 3);
  const result = await pool.query(
    `SELECT id, file_url, mime_type FROM designs
     WHERE id = ANY($1::int[]) AND product_id = $2 AND approved_at IS NOT NULL AND ${owner.sql}`,
    [ids, cartItem.productId, ...owner.params]
  );
  const byId = new Map(result.rows.map((row) => [row.id, row]));
  for (const job of jobs) {
    if (job.designId == null) continue;
    const design = byId.get(job.designId);
    if (!design) {
      throw validationError(`The design for "${job.jobName}" was not found or is not approved.`);
    }
    job.designUrl = design.file_url;
    job.designMimeType = design.mime_type;
  }
  return cartItem;
}

function designCleanupDays() {
  const n = Number(process.env.DESIGN_CLEANUP_DAYS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 14;
}

/** Local-disk files (Spaces not configured) are removed directly; deleteManyByUrl only handles Spaces. */
async function deleteDesignFiles(urls) {
  const localUrls = urls.filter((u) => u.startsWith('/uploads/'));
  const remoteUrls = urls.filter((u) => !u.startsWith('/uploads/'));
  for (const url of localUrls) {
    const fullPath = path.join(__dirname, '../..', url);
    try {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (err) {
      console.error('Design file delete failed:', url, err.message);
    }
  }
  if (remoteUrls.length) await deleteManyByUrl(remoteUrls);
}

/**
 * Delete design-tool designs nobody can reach any more: older than DESIGN_CLEANUP_DAYS (default 14),
 * not on any cart job and not used as artwork on any order line. Designs in a cart are protected until the
 * cart itself expires; ordered designs are kept for good. Admin templates and "My Artworks" are untouched.
 * @returns {Promise<number>} number of designs removed
 */
async function deleteAbandonedDesigns() {
  const result = await pool.query(
    `DELETE FROM designs d
     WHERE d.updated_at < NOW() - make_interval(days => $1)
       AND NOT EXISTS (
         SELECT 1 FROM order_items oi WHERE oi.customer_artwork_url = d.file_url
       )
       AND NOT EXISTS (
         SELECT 1
         FROM cart_items ci,
              jsonb_array_elements(
                CASE WHEN jsonb_typeof(ci.item_data->'jobs') = 'array' THEN ci.item_data->'jobs' ELSE '[]'::jsonb END
              ) AS job
         WHERE job->>'designId' = d.id::text
       )
     RETURNING d.file_url, d.original_file_url`,
    [designCleanupDays()]
  );
  const urls = result.rows.flatMap((row) => [row.file_url, row.original_file_url]).filter(Boolean);
  await deleteDesignFiles(urls);
  return result.rowCount;
}

module.exports = {
  readGuestSessionId,
  designOwnerFilter,
  attachVerifiedDesignsToCartJobs,
  deleteAbandonedDesigns,
};
