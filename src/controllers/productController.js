const pool = require('../config/database');
const path = require('path');
const fs = require('fs');
const { uploadFromBuffer, isConfigured: spacesConfigured } = require('../utils/spaces');
const { getProductPricingConfig, validateAndCalculatePricing } = require('../services/pricingService');

/** @param {unknown} value */
function normalizeGalleryArrayInput(value) {
  if (!Array.isArray(value)) return [];
  return value.map((u) => String(u || '').trim()).filter(Boolean);
}

/** @param {{ gallery_images?: unknown; image_url?: string | null }} row */
function galleryFromRow(row) {
  if (!row) return [];
  const g = row.gallery_images;
  if (Array.isArray(g) && g.length) return g.map((u) => String(u || '').trim()).filter(Boolean);
  if (row.image_url) return [String(row.image_url).trim()];
  return [];
}

function asNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeMode(value, fallback) {
  const v = String(value || '').trim().toLowerCase();
  return v || fallback;
}

function parseSizeOptionsInput(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      id: item?.id != null && item?.id !== '' ? parseInt(String(item.id), 10) : null,
      label: String(item?.label || '').trim(),
      width: asNumberOrNull(item?.width),
      height: asNumberOrNull(item?.height),
      unit_price: asNumberOrNull(item?.unit_price ?? item?.unitPrice),
      is_default: item?.is_default === true || item?.isDefault === true,
    }))
    .filter((item) => item.label && item.width != null && item.height != null);
}

async function getProductSizeOptions(productId) {
  const result = await pool.query(
    `SELECT id, product_id, label, width, height, unit_price, is_default
     FROM product_size_options
     WHERE product_id = $1
     ORDER BY is_default DESC, id ASC`,
    [productId]
  );
  return result.rows;
}

async function replaceProductSizeOptions(productId, options) {
  await pool.query('DELETE FROM product_size_options WHERE product_id = $1', [productId]);
  if (!Array.isArray(options) || options.length === 0) return;
  const hasDefault = options.some((o) => o.is_default);
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const isDefault = hasDefault ? !!opt.is_default : i === 0;
    await pool.query(
      `INSERT INTO product_size_options (product_id, label, width, height, unit_price, is_default)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [productId, opt.label, opt.width, opt.height, opt.unit_price, isDefault]
    );
  }
}

const getAllProducts = async (req, res) => {
  try {
    const { category, subcategory, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Show all products on storefront (admin can set is_active=false later to hide)
    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (category) {
      // Include parent category and all its children (subcategories)
      query += ` AND (c.slug = $${paramCount} OR c.parent_id = (SELECT id FROM categories WHERE slug = $${paramCount} LIMIT 1))`;
      params.push(category);
      paramCount++;
    }

    if (subcategory) {
      query += ` AND p.subcategory = $${paramCount}`;
      params.push(subcategory);
      paramCount++;
    }

    if (search) {
      query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount} OR c.name ILIKE $${paramCount} OR p.subcategory ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1';
    const countParams = [];
    let countParamCount = 1;

    if (category) {
      countQuery += ` AND (c.slug = $${countParamCount} OR c.parent_id = (SELECT id FROM categories WHERE slug = $${countParamCount} LIMIT 1))`;
      countParams.push(category);
      countParamCount++;
    }

    if (subcategory) {
      countQuery += ` AND p.subcategory = $${countParamCount}`;
      countParams.push(subcategory);
      countParamCount++;
    }

    if (search) {
      countQuery += ` AND (p.name ILIKE $${countParamCount} OR p.description ILIKE $${countParamCount} OR c.name ILIKE $${countParamCount} OR p.subcategory ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      products: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Failed to fetch products' });
  }
};

const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    const product = result.rows[0];
    product.size_options = await getProductSizeOptions(product.id);
    const sm = product.size_mode != null ? String(product.size_mode).trim() : '';
    if (!sm && Array.isArray(product.size_options) && product.size_options.length > 0) {
      product.size_mode = 'predefined';
    }
    res.json({ product });
  } catch (error) {
    console.error('❌ Get product error:', error);
    res.status(500).json({ message: 'Failed to fetch product' });
  }
};

const previewProductPrice = async (req, res) => {
  try {
    const { id } = req.params;
    const productId = parseInt(String(id), 10);
    if (Number.isNaN(productId)) {
      return res.status(400).json({ message: 'Invalid product id.' });
    }
    const config = await getProductPricingConfig(productId);
    if (!config) {
      return res.status(404).json({ message: 'Product not found' });
    }
    const pricing = validateAndCalculatePricing(config, req.body || {});
    return res.json({ pricing });
  } catch (error) {
    const code = /required|invalid|must|missing|supported|at least|at most|configured/i.test(String(error.message || ''))
      ? 400
      : 500;
    return res.status(code).json({ message: 'Failed to preview price' });
  }
};

const getCategories = async (req, res) => {
  try {
    /**
     * Parent rows (parent_id IS NULL): count active products in that category OR any descendant subcategory.
     * Subcategory rows: count active products with category_id = that row only.
     * Recomputed on every request — updates when products move between categories.
     */
    const result = await pool.query(
      `SELECT c.*,
        CASE
          WHEN c.parent_id IS NULL THEN (
            SELECT COUNT(*)::int
            FROM products p
            WHERE p.is_active = true
              AND p.category_id IN (
                WITH RECURSIVE subtree AS (
                  SELECT id FROM categories WHERE id = c.id
                  UNION ALL
                  SELECT ch.id FROM categories ch
                  INNER JOIN subtree s ON ch.parent_id = s.id
                )
                SELECT id FROM subtree
              )
          )
          ELSE (
            SELECT COUNT(*)::int
            FROM products p
            WHERE p.is_active = true AND p.category_id = c.id
          )
        END AS product_count
       FROM categories c
       ORDER BY c.display_order, c.name`
    );

    const categories = result.rows.map((cat) => ({
      ...cat,
      product_count: parseInt(cat.product_count, 10) || 0,
    }));

    res.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
};

const getRelatedProducts = async (req, res) => {
  try {
    const { productId, limit = 8 } = req.query;

    if (!productId) {
      return res.status(400).json({ message: 'Product ID is required' });
    }

    // First, get the current product's category
    const productResult = await pool.query(
      `SELECT p.category_id, c.slug as category_slug FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [productId]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const currentCategoryId = productResult.rows[0].category_id;
    const currentCategorySlug = productResult.rows[0].category_slug;

    // Get products from different categories (excluding current product)
    // Priority: Different categories first, then same category but different products
    const result = await pool.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id != $1
       ORDER BY 
         (CASE WHEN p.category_id IS DISTINCT FROM $2 THEN 0 ELSE 1 END),
         RANDOM()
       LIMIT $3`,
      [productId, currentCategoryId, limit]
    );

    res.json({ 
      products: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get related products error:', error);
    res.status(500).json({ message: 'Failed to fetch related products' });
  }
};

/** Admin: get all categories including for dropdown (no auth on getCategories is public, so admin uses same) */

const createCategory = async (req, res) => {
  try {
    const { name, slug, parent_id, description, display_order, image_url } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ message: 'Name and slug are required' });
    }
    const result = await pool.query(
      `INSERT INTO categories (name, slug, parent_id, description, display_order, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, slug.trim().toLowerCase().replace(/\s+/g, '-'), parent_id || null, description || null, display_order != null ? parseInt(display_order) : 0, image_url || null]
    );
    res.status(201).json({ category: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ message: 'Category slug already exists' });
    console.error('Create category error:', error);
    res.status(500).json({ message: 'Failed to create category' });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, parent_id, description, display_order, image_url } = req.body;
    const getResult = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
    if (getResult.rows.length === 0) return res.status(404).json({ message: 'Category not found' });
    const row = getResult.rows[0];
    const nameVal = name !== undefined ? name : row.name;
    const slugVal = slug !== undefined ? slug.trim().toLowerCase().replace(/\s+/g, '-') : row.slug;
    const parentIdVal = parent_id !== undefined ? (parent_id === '' || parent_id === null ? null : parent_id) : row.parent_id;
    const descVal = description !== undefined ? description : row.description;
    const orderVal = display_order !== undefined ? parseInt(display_order) : row.display_order;
    const imageUrlVal = image_url !== undefined ? image_url : row.image_url;
    const result = await pool.query(
      `UPDATE categories SET name = $1, slug = $2, parent_id = $3, description = $4, display_order = $5, image_url = $6 WHERE id = $7 RETURNING *`,
      [nameVal, slugVal, parentIdVal, descVal, orderVal, imageUrlVal, id]
    );
    res.json({ category: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ message: 'Category slug already exists' });
    console.error('Update category error:', error);
    res.status(500).json({ message: 'Failed to update category' });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM products WHERE category_id = $1) AS products_count,
        (SELECT COUNT(*) FROM categories WHERE parent_id = $1) AS children_count`,
      [id]
    );
    const { products_count, children_count } = check.rows[0];
    if (parseInt(products_count) > 0) {
      return res.status(400).json({ message: 'Cannot delete category that has products. Remove or reassign products first.' });
    }
    if (parseInt(children_count) > 0) {
      return res.status(400).json({ message: 'Cannot delete category that has subcategories. Delete subcategories first.' });
    }
    const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Category not found' });
    res.json({ message: 'Category deleted', id: result.rows[0].id });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ message: 'Failed to delete category' });
  }
};

const createProduct = async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      spec,
      file_setup,
      installation_guide,
      faq,
      category_id,
      subcategory,
      price,
      price_per_sqft,
      min_charge,
      material,
      image_url,
      is_new,
      is_active,
      sku,
      properties,
      gallery_images,
      pricing_mode,
      size_mode,
      base_unit,
      min_width,
      max_width,
      min_height,
      max_height,
      size_options,
    } = req.body;
    if (!name) return res.status(400).json({ message: 'Product name is required' });
    const slugVal = slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
    const isActiveVal = (is_active === undefined || is_active === null) ? true : (is_active !== false && is_active !== 'false');
    const propsVal = Array.isArray(properties) ? JSON.stringify(properties) : (typeof properties === 'string' ? properties : '[]');
    const faqVal = Array.isArray(faq) ? JSON.stringify(faq) : (typeof faq === 'string' ? faq : '[]');
    const galleryFromBody = normalizeGalleryArrayInput(gallery_images);
    const galleryFinal = galleryFromBody.length ? galleryFromBody : (image_url ? [String(image_url).trim()] : []);
    const imageUrlFinal = galleryFinal[0] || null;
    const galleryJson = JSON.stringify(galleryFinal);
    const pricingModeVal = normalizeMode(pricing_mode, price_per_sqft != null ? 'area' : 'fixed');
    const sizeModeVal = normalizeMode(size_mode, 'custom');
    const baseUnitVal = String(base_unit || 'inch').trim().toLowerCase() || 'inch';
    const minWidthVal = asNumberOrNull(min_width);
    const maxWidthVal = asNumberOrNull(max_width);
    const minHeightVal = asNumberOrNull(min_height);
    const maxHeightVal = asNumberOrNull(max_height);
    const parsedSizeOptions = parseSizeOptionsInput(size_options);
    if (sizeModeVal === 'predefined' && parsedSizeOptions.length === 0) {
      return res.status(400).json({ message: 'size_options are required when size_mode is predefined.' });
    }

    const result = await pool.query(
      `INSERT INTO products (name, slug, description, spec, file_setup, installation_guide, faq, category_id, subcategory, price, price_per_sqft, min_charge, material, image_url, is_new, is_active, sku, properties, gallery_images, pricing_mode, size_mode, base_unit, min_width, max_width, min_height, max_height)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19::jsonb, $20, $21, $22, $23, $24, $25, $26)
       RETURNING *`,
      [
        name,
        slugVal,
        description || null,
        spec || null,
        file_setup || null,
        installation_guide || null,
        faqVal,
        category_id || null,
        subcategory || null,
        price != null ? parseFloat(price) : null,
        price_per_sqft != null ? parseFloat(price_per_sqft) : null,
        min_charge != null ? parseFloat(min_charge) : null,
        material || null,
        imageUrlFinal,
        is_new === true || is_new === 'true',
        isActiveVal,
        sku || null,
        propsVal,
        galleryJson,
        pricingModeVal,
        sizeModeVal,
        baseUnitVal,
        minWidthVal,
        maxWidthVal,
        minHeightVal,
        maxHeightVal,
      ]
    );
    const created = result.rows[0];
    await replaceProductSizeOptions(created.id, parsedSizeOptions);
    created.size_options = await getProductSizeOptions(created.id);
    res.status(201).json({ product: created });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ message: 'Product slug already exists' });
    console.error('Create product error:', error);
    res.status(500).json({ message: 'Failed to create product' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const getResult = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (getResult.rows.length === 0) return res.status(404).json({ message: 'Product not found' });
    const row = getResult.rows[0];
    const nameVal = req.body.name !== undefined ? req.body.name : row.name;
    const slugVal = req.body.slug !== undefined ? req.body.slug : row.slug;
    const descriptionVal = req.body.description !== undefined ? req.body.description : row.description;
    const specVal = req.body.spec !== undefined ? req.body.spec : row.spec;
    const fileSetupVal = req.body.file_setup !== undefined ? req.body.file_setup : row.file_setup;
    const installationGuideVal = req.body.installation_guide !== undefined ? req.body.installation_guide : row.installation_guide;
    const categoryIdVal = req.body.category_id !== undefined ? (req.body.category_id || null) : row.category_id;
    const subcategoryVal = req.body.subcategory !== undefined ? req.body.subcategory : row.subcategory;
    const priceVal = req.body.price !== undefined ? (req.body.price != null ? parseFloat(req.body.price) : null) : row.price;
    const pricePerSqftVal = req.body.price_per_sqft !== undefined ? (req.body.price_per_sqft != null ? parseFloat(req.body.price_per_sqft) : null) : row.price_per_sqft;
    const minChargeVal = req.body.min_charge !== undefined ? (req.body.min_charge != null ? parseFloat(req.body.min_charge) : null) : row.min_charge;
    const pricingModeVal = req.body.pricing_mode !== undefined ? normalizeMode(req.body.pricing_mode, 'fixed') : row.pricing_mode;
    const sizeModeVal = req.body.size_mode !== undefined ? normalizeMode(req.body.size_mode, 'custom') : row.size_mode;
    const baseUnitVal = req.body.base_unit !== undefined ? String(req.body.base_unit || 'inch').trim().toLowerCase() : row.base_unit;
    const minWidthVal = req.body.min_width !== undefined ? asNumberOrNull(req.body.min_width) : row.min_width;
    const maxWidthVal = req.body.max_width !== undefined ? asNumberOrNull(req.body.max_width) : row.max_width;
    const minHeightVal = req.body.min_height !== undefined ? asNumberOrNull(req.body.min_height) : row.min_height;
    const maxHeightVal = req.body.max_height !== undefined ? asNumberOrNull(req.body.max_height) : row.max_height;
    const materialVal = req.body.material !== undefined ? req.body.material : row.material;
    let galleryFinal;
    if (req.body.gallery_images !== undefined) {
      galleryFinal = normalizeGalleryArrayInput(req.body.gallery_images);
    } else if (req.body.image_url !== undefined) {
      galleryFinal = req.body.image_url ? [String(req.body.image_url).trim()] : [];
    } else {
      galleryFinal = galleryFromRow(row);
    }
    const imageUrlVal = galleryFinal[0] || null;
    const galleryJson = JSON.stringify(galleryFinal);
    const isNewVal = req.body.is_new !== undefined ? (req.body.is_new === true || req.body.is_new === 'true') : row.is_new;
    const isActiveVal = req.body.is_active !== undefined ? (req.body.is_active !== false && req.body.is_active !== 'false') : row.is_active;
    const skuVal = req.body.sku !== undefined ? req.body.sku : row.sku;
    const propertiesVal = req.body.properties !== undefined
      ? (Array.isArray(req.body.properties) ? JSON.stringify(req.body.properties) : (typeof req.body.properties === 'string' ? req.body.properties : (row.properties ? JSON.stringify(row.properties) : '[]')))
      : (row.properties ? JSON.stringify(row.properties) : '[]');
    const faqVal = req.body.faq !== undefined
      ? (Array.isArray(req.body.faq) ? JSON.stringify(req.body.faq) : (typeof req.body.faq === 'string' ? req.body.faq : (row.faq ? JSON.stringify(row.faq) : '[]')))
      : (row.faq ? JSON.stringify(row.faq) : '[]');
    const parsedSizeOptions = req.body.size_options !== undefined
      ? parseSizeOptionsInput(req.body.size_options)
      : await getProductSizeOptions(id);
    if (sizeModeVal === 'predefined' && parsedSizeOptions.length === 0) {
      return res.status(400).json({ message: 'size_options are required when size_mode is predefined.' });
    }
    const result = await pool.query(
      `UPDATE products SET name = $1, slug = $2, description = $3, spec = $4, file_setup = $5, installation_guide = $6, faq = $7::jsonb, category_id = $8, subcategory = $9, price = $10, price_per_sqft = $11, min_charge = $12, material = $13, image_url = $14, is_new = $15, is_active = $16, sku = $17, properties = $18::jsonb, gallery_images = $19::jsonb, pricing_mode = $20, size_mode = $21, base_unit = $22, min_width = $23, max_width = $24, min_height = $25, max_height = $26, updated_at = CURRENT_TIMESTAMP WHERE id = $27 RETURNING *`,
      [nameVal, slugVal, descriptionVal, specVal, fileSetupVal, installationGuideVal, faqVal, categoryIdVal, subcategoryVal, priceVal, pricePerSqftVal, minChargeVal, materialVal, imageUrlVal, isNewVal, isActiveVal, skuVal, propertiesVal, galleryJson, pricingModeVal, sizeModeVal, baseUnitVal, minWidthVal, maxWidthVal, minHeightVal, maxHeightVal, id]
    );
    const updated = result.rows[0];
    await replaceProductSizeOptions(id, parsedSizeOptions);
    updated.size_options = await getProductSizeOptions(id);
    res.json({ product: updated });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ message: 'Product slug already exists' });
    console.error('Update product error:', error);
    res.status(500).json({ message: 'Failed to update product' });
  }
};

/** Admin: get all products (including inactive) for admin list */
const getAllProductsAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const countResult = await pool.query('SELECT COUNT(*) FROM products');
    const total = parseInt(countResult.rows[0].count);
    res.json({
      products: result.rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Get all products admin error:', error);
    res.status(500).json({ message: 'Failed to fetch products' });
  }
};

/** Admin: delete a product */
const deleteProductAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json({ message: 'Product deleted', id: result.rows[0].id });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Failed to delete product' });
  }
};

/** Generate safe filename and ensure dir exists; returns full path and relative URL path */
function writeBufferToUploadDir(buffer, dirName) {
  const uploadDir = path.join(__dirname, '../../uploads', dirName);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const ext = '.jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
  const fullPath = path.join(uploadDir, filename);
  fs.writeFileSync(fullPath, buffer);
  return `/uploads/${dirName}/${filename}`;
}

/** Admin: upload product image; DigitalOcean Spaces (live) or disk. Returns { url } */
const uploadProductImage = async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: 'No image file uploaded' });
  }
  try {
    if (spacesConfigured()) {
      const url = await uploadFromBuffer(req.file.buffer, 'elmer/products', {
        contentType: req.file.mimetype,
      });
      return res.json({ url });
    }
    const url = writeBufferToUploadDir(req.file.buffer, 'products');
    res.json({ url });
  } catch (err) {
    console.error('Upload product image error:', err);
    res.status(500).json({ message: 'Image upload failed' });
  }
};

/** Admin: upload category image; Spaces or disk. Returns { url } */
const uploadCategoryImage = async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: 'No image file uploaded' });
  }
  try {
    if (spacesConfigured()) {
      const url = await uploadFromBuffer(req.file.buffer, 'elmer/categories', {
        contentType: req.file.mimetype,
      });
      return res.json({ url });
    }
    const url = writeBufferToUploadDir(req.file.buffer, 'categories');
    res.json({ url });
  } catch (err) {
    console.error('Upload category image error:', err);
    res.status(500).json({ message: 'Image upload failed' });
  }
};

module.exports = { getAllProducts, getProductById, previewProductPrice, getCategories, getRelatedProducts, createCategory, updateCategory, deleteCategory, createProduct, updateProduct, getAllProductsAdmin, deleteProductAdmin, uploadProductImage, uploadCategoryImage };

