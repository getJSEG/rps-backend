const pool = require('../config/database');

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

module.exports = { readGuestSessionId, designOwnerFilter, attachVerifiedDesignsToCartJobs };
