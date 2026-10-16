const sharp = require('sharp');
const pool = require('../config/database');
const { uploadObjectFromBuffer, deleteByKey } = require('../utils/spaces');

const STORAGE_PREFIX = 'elmer/design-templates';

/** Longest side of an SVG template on the editor canvas. Browsers struggle with canvases much larger than ~16MP. */
function templateMaxPx() {
  const n = Number(process.env.DESIGN_TEMPLATE_MAX_PX);
  return Number.isFinite(n) && n >= 500 ? Math.floor(n) : 4000;
}

/**
 * Read the template's pixel size. PNGs keep their own size; an SVG has no pixels, so it is sized so its
 * longest side is `templateMaxPx()` (the editor canvas size; the SVG itself stays vector).
 * @returns {Promise<{ format: 'svg' | 'png', width: number, height: number }>}
 */
async function readTemplateSize(buffer) {
  const meta = await sharp(buffer).metadata();
  if ((meta.format !== 'svg' && meta.format !== 'png') || !meta.width || !meta.height) {
    throw new Error('The file is not a valid SVG (with a width and height or viewBox) or PNG.');
  }
  if (meta.format === 'png') return { format: 'png', width: meta.width, height: meta.height };
  const scale = templateMaxPx() / Math.max(meta.width, meta.height);
  return {
    format: 'svg',
    width: Math.max(1, Math.round(meta.width * scale)),
    height: Math.max(1, Math.round(meta.height * scale)),
  };
}

/**
 * Upload the template exactly as the admin provided it (SVG stays SVG, PNG stays PNG).
 * One file is stored, so the svg_* and image_* fields of the result point to the same object;
 * the editor loads `image_*`.
 */
async function storeDesignTemplateFile(buffer) {
  const size = await readTemplateSize(buffer);
  const stored = await uploadObjectFromBuffer(buffer, STORAGE_PREFIX, {
    contentType: size.format === 'svg' ? 'image/svg+xml' : 'image/png',
    // Name by the detected format so the stored extension always matches the content.
    originalName: `template.${size.format}`,
  });
  return {
    svg_url: stored.url,
    svg_storage_key: stored.key,
    image_url: stored.url,
    image_storage_key: stored.key,
    image_width_px: size.width,
    image_height_px: size.height,
  };
}

async function getProductDesignTemplates(productId) {
  const result = await pool.query(
    `SELECT id, product_id, name, svg_url, svg_storage_key,
            image_url, image_storage_key, image_width_px, image_height_px, sort_order
     FROM product_design_templates
     WHERE product_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [productId]
  );
  return result.rows;
}

function parseDesignTemplatesInput(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => ({
    id: item?.id == null || item.id === '' ? null : Number(item.id),
    name: String(item?.name || '').trim(),
    svg_url: String(item?.svg_url || '').trim(),
    svg_storage_key: String(item?.svg_storage_key || '').trim(),
    image_url: String(item?.image_url || '').trim(),
    image_storage_key: String(item?.image_storage_key || '').trim(),
    image_width_px: parseInt(item?.image_width_px, 10),
    image_height_px: parseInt(item?.image_height_px, 10),
    sort_order: Number.isFinite(Number(item?.sort_order)) ? Number(item.sort_order) : index,
  }));
}

/** @returns {string|null} error message */
function validateDesignTemplates(templates) {
  for (const t of templates) {
    const label = t.name || 'Design template';
    if (!t.name) return 'Each design template needs a name.';
    if (!t.svg_url || !t.image_url || !(t.image_width_px > 0) || !(t.image_height_px > 0)) {
      return `${label}: upload the SVG or PNG file.`;
    }
    if (
      !t.svg_storage_key.startsWith(`${STORAGE_PREFIX}/`) ||
      !t.image_storage_key.startsWith(`${STORAGE_PREFIX}/`)
    ) {
      return `${label}: files must be uploaded through the design template uploader.`;
    }
  }
  return null;
}

function templateStorageKeys(t) {
  return [...new Set([t.svg_storage_key, t.image_storage_key].filter(Boolean))];
}

async function deleteStorageKeys(keys) {
  for (const key of keys) {
    try {
      await deleteByKey(key);
    } catch (error) {
      console.error('Spaces design template delete failed:', key, error);
    }
  }
}

/** Replace a product's design templates; removes files no longer referenced. */
async function replaceProductDesignTemplates(productId, templates) {
  const client = await pool.connect();
  let previous = [];
  try {
    await client.query('BEGIN');
    previous = (
      await client.query(
        'SELECT id, svg_storage_key, image_storage_key FROM product_design_templates WHERE product_id = $1',
        [productId]
      )
    ).rows;
    const keptIds = [];
    for (const t of templates) {
      const values = [
        t.name,
        t.svg_url,
        t.svg_storage_key,
        t.image_url,
        t.image_storage_key,
        t.image_width_px,
        t.image_height_px,
        t.sort_order,
      ];
      if (t.id != null && Number.isFinite(t.id)) {
        const updated = await client.query(
          `UPDATE product_design_templates
           SET name = $1, svg_url = $2, svg_storage_key = $3,
               image_url = $4, image_storage_key = $5, image_width_px = $6, image_height_px = $7,
               sort_order = $8, updated_at = CURRENT_TIMESTAMP
           WHERE id = $9 AND product_id = $10
           RETURNING id`,
          [...values, t.id, productId]
        );
        if (updated.rowCount > 0) {
          keptIds.push(updated.rows[0].id);
          continue;
        }
      }
      const inserted = await client.query(
        `INSERT INTO product_design_templates
          (name, svg_url, svg_storage_key, image_url, image_storage_key,
           image_width_px, image_height_px, sort_order, product_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [...values, productId]
      );
      keptIds.push(inserted.rows[0].id);
    }
    await client.query(
      'DELETE FROM product_design_templates WHERE product_id = $1 AND NOT (id = ANY($2::int[]))',
      [productId, keptIds]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const currentKeys = new Set(templates.flatMap(templateStorageKeys));
  const staleKeys = previous.flatMap(templateStorageKeys).filter((key) => !currentKeys.has(key));
  await deleteStorageKeys(staleKeys);
}

/** For product deletion: call before the product row is removed, then pass the result to deleteStorageKeys. */
async function listProductDesignTemplateKeys(productId) {
  const templates = await getProductDesignTemplates(productId);
  return templates.flatMap(templateStorageKeys);
}

/**
 * Delete an uploaded template that was never saved to a product (admin removed or replaced it before saving).
 * @returns {Promise<boolean>} false when the files are attached to a product and were left alone
 */
async function deleteUnsavedDesignTemplateUpload(svgStorageKey, imageStorageKey) {
  const keys = [...new Set([svgStorageKey, imageStorageKey].map((k) => String(k || '').trim()).filter(Boolean))];
  if (keys.length === 0 || keys.some((k) => !k.startsWith(`${STORAGE_PREFIX}/`))) {
    throw new Error('A valid design template storage key is required.');
  }
  const inUse = await pool.query(
    `SELECT 1 FROM product_design_templates
     WHERE svg_storage_key = ANY($1::text[]) OR image_storage_key = ANY($1::text[])
     LIMIT 1`,
    [keys]
  );
  if (inUse.rowCount > 0) return false;
  await deleteStorageKeys(keys);
  return true;
}

module.exports = {
  STORAGE_PREFIX,
  deleteUnsavedDesignTemplateUpload,
  storeDesignTemplateFile,
  getProductDesignTemplates,
  parseDesignTemplatesInput,
  validateDesignTemplates,
  replaceProductDesignTemplates,
  listProductDesignTemplateKeys,
  deleteStorageKeys,
};
