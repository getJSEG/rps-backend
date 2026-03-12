const pool = require('../config/database');
const path = require('path');
const fs = require('fs');
const { uploadFromBuffer, isConfigured: cloudinaryConfigured } = require('../utils/cloudinary');

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
    res.status(500).json({ message: 'Failed to fetch products', error: error.message });
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
    res.json({ product });
  } catch (error) {
    console.error('❌ Get product error:', error);
    res.status(500).json({ message: 'Failed to fetch product', error: error.message });
  }
};

const getCategories = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, 
       (SELECT COUNT(*) FROM products WHERE category_id = c.id AND is_active = true) as product_count
       FROM categories c
       ORDER BY c.display_order, c.name`
    );

    // Organize into parent-child structure
    const categories = result.rows.map(cat => ({
      ...cat,
      product_count: parseInt(cat.product_count)
    }));

    res.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Failed to fetch categories', error: error.message });
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
    res.status(500).json({ message: 'Failed to fetch related products', error: error.message });
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
    res.status(500).json({ message: 'Failed to create category', error: error.message });
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
    res.status(500).json({ message: 'Failed to update category', error: error.message });
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
    res.status(500).json({ message: 'Failed to delete category', error: error.message });
  }
};

const createProduct = async (req, res) => {
  try {
    const { name, slug, description, category_id, subcategory, price, price_per_sqft, min_charge, material, image_url, is_new, is_active, sku, properties } = req.body;
    if (!name) return res.status(400).json({ message: 'Product name is required' });
    const slugVal = slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
    const isActiveVal = (is_active === undefined || is_active === null) ? true : (is_active !== false && is_active !== 'false');
    const propsVal = Array.isArray(properties) ? JSON.stringify(properties) : (typeof properties === 'string' ? properties : '[]');
    const result = await pool.query(
      `INSERT INTO products (name, slug, description, category_id, subcategory, price, price_per_sqft, min_charge, material, image_url, is_new, is_active, sku, properties)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
       RETURNING *`,
      [
        name,
        slugVal,
        description || null,
        category_id || null,
        subcategory || null,
        price != null ? parseFloat(price) : null,
        price_per_sqft != null ? parseFloat(price_per_sqft) : null,
        min_charge != null ? parseFloat(min_charge) : null,
        material || null,
        image_url || null,
        is_new === true || is_new === 'true',
        isActiveVal,
        sku || null,
        propsVal
      ]
    );
    res.status(201).json({ product: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ message: 'Product slug already exists' });
    console.error('Create product error:', error);
    res.status(500).json({ message: 'Failed to create product', error: error.message });
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
    const categoryIdVal = req.body.category_id !== undefined ? (req.body.category_id || null) : row.category_id;
    const subcategoryVal = req.body.subcategory !== undefined ? req.body.subcategory : row.subcategory;
    const priceVal = req.body.price !== undefined ? (req.body.price != null ? parseFloat(req.body.price) : null) : row.price;
    const pricePerSqftVal = req.body.price_per_sqft !== undefined ? (req.body.price_per_sqft != null ? parseFloat(req.body.price_per_sqft) : null) : row.price_per_sqft;
    const minChargeVal = req.body.min_charge !== undefined ? (req.body.min_charge != null ? parseFloat(req.body.min_charge) : null) : row.min_charge;
    const materialVal = req.body.material !== undefined ? req.body.material : row.material;
    const imageUrlVal = req.body.image_url !== undefined ? req.body.image_url : row.image_url;
    const isNewVal = req.body.is_new !== undefined ? (req.body.is_new === true || req.body.is_new === 'true') : row.is_new;
    const isActiveVal = req.body.is_active !== undefined ? (req.body.is_active !== false && req.body.is_active !== 'false') : row.is_active;
    const skuVal = req.body.sku !== undefined ? req.body.sku : row.sku;
    const propertiesVal = req.body.properties !== undefined
      ? (Array.isArray(req.body.properties) ? JSON.stringify(req.body.properties) : (typeof req.body.properties === 'string' ? req.body.properties : (row.properties ? JSON.stringify(row.properties) : '[]')))
      : (row.properties ? JSON.stringify(row.properties) : '[]');
    const result = await pool.query(
      `UPDATE products SET name = $1, slug = $2, description = $3, category_id = $4, subcategory = $5, price = $6, price_per_sqft = $7, min_charge = $8, material = $9, image_url = $10, is_new = $11, is_active = $12, sku = $13, properties = $14::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $15 RETURNING *`,
      [nameVal, slugVal, descriptionVal, categoryIdVal, subcategoryVal, priceVal, pricePerSqftVal, minChargeVal, materialVal, imageUrlVal, isNewVal, isActiveVal, skuVal, propertiesVal, id]
    );
    res.json({ product: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ message: 'Product slug already exists' });
    console.error('Update product error:', error);
    res.status(500).json({ message: 'Failed to update product', error: error.message });
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
    res.status(500).json({ message: 'Failed to fetch products', error: error.message });
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
    res.status(500).json({ message: 'Failed to delete product', error: error.message });
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

/** Admin: upload product image; Cloudinary (live) or disk. Returns { url } (full Cloudinary URL or /uploads/products/...) */
const uploadProductImage = async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: 'No image file uploaded' });
  }
  try {
    if (cloudinaryConfigured()) {
      const url = await uploadFromBuffer(req.file.buffer, 'elmer/products');
      return res.json({ url });
    }
    const url = writeBufferToUploadDir(req.file.buffer, 'products');
    res.json({ url });
  } catch (err) {
    console.error('Upload product image error:', err);
    res.status(500).json({ message: err.message || 'Image upload failed' });
  }
};

/** Admin: upload category image; Cloudinary or disk. Returns { url } */
const uploadCategoryImage = async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: 'No image file uploaded' });
  }
  try {
    if (cloudinaryConfigured()) {
      const url = await uploadFromBuffer(req.file.buffer, 'elmer/categories');
      return res.json({ url });
    }
    const url = writeBufferToUploadDir(req.file.buffer, 'categories');
    res.json({ url });
  } catch (err) {
    console.error('Upload category image error:', err);
    res.status(500).json({ message: err.message || 'Image upload failed' });
  }
};

module.exports = { getAllProducts, getProductById, getCategories, getRelatedProducts, createCategory, updateCategory, deleteCategory, createProduct, updateProduct, getAllProductsAdmin, deleteProductAdmin, uploadProductImage, uploadCategoryImage };

