/**
 * Seeds one simple product: the customer enters width × height, then adds it to the cart.
 * No hardware, modifiers or design templates, so the design editor opens a blank canvas in the chosen size.
 * Run: npm run seed:simple-product
 *
 * Price is per square foot with a minimum charge. The product image is a generated blank (white) image.
 * Safe to re-run: the category is reused by slug and the product is skipped if its slug already exists.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pool = require('../config/database');
const { isConfigured: spacesConfigured, uploadObjectFromBuffer, deleteByKey } = require('../utils/spaces');

const LOCAL_UPLOAD_DIR = path.join(__dirname, '../../uploads/products');

const CATEGORY = {
  name: 'Custom Prints',
  slug: 'custom-prints',
  description: 'Prints made to the exact size you need.',
  subcategory: { name: 'Custom Size Prints', slug: 'custom-size-prints', description: 'Enter your own width and height.' },
};

const PRODUCT = {
  name: 'Custom Size Print',
  slug: 'custom-size-print',
  sku: 'PRT-CUSTOM-SIZE',
  material: 'Matte Paper',
  pricing_mode: 'area',
  size_mode: 'custom',
  base_unit: 'inch',
  price_per_sqft: 5,
  min_charge: 10,
  min_width: 4,
  max_width: 48,
  min_height: 4,
  max_height: 96,
  shipping_length: 2,
  shipping_weight: 0.3,
  production_time: 2,
  description: '<p>Choose your own width and height, upload or create your design, and add it to the cart.</p>',
};

/** Blank white square used as the product image. */
function blankImage() {
  return sharp({ create: { width: 800, height: 800, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer();
}

/** Same storage as the admin product image uploader: Spaces when configured, else uploads/products. */
async function storeProductImage(buffer) {
  if (spacesConfigured()) {
    const { url, key } = await uploadObjectFromBuffer(buffer, 'elmer/products', {
      contentType: 'image/png',
      originalName: 'blank.png',
    });
    return { url, cleanup: () => deleteByKey(key) };
  }
  if (!fs.existsSync(LOCAL_UPLOAD_DIR)) fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.png`;
  const fullPath = path.join(LOCAL_UPLOAD_DIR, filename);
  fs.writeFileSync(fullPath, buffer);
  return { url: `/uploads/products/${filename}`, cleanup: async () => fs.rmSync(fullPath, { force: true }) };
}

async function getOrCreateCategory(client, { name, slug, description }, parentId) {
  const existing = await client.query('SELECT id FROM categories WHERE slug = $1', [slug]);
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await client.query(
    'INSERT INTO categories (name, slug, parent_id, description) VALUES ($1, $2, $3, $4) RETURNING id',
    [name, slug, parentId, description]
  );
  console.log(`  Created category: ${name}`);
  return inserted.rows[0].id;
}

async function seed() {
  console.log('Seeding simple product...');
  const p = PRODUCT;

  const exists = await pool.query('SELECT id FROM products WHERE slug = $1', [p.slug]);
  if (exists.rows[0]) {
    console.log(`  Skipped "${p.name}": already exists (id ${exists.rows[0].id}).`);
    return;
  }

  const image = await storeProductImage(await blankImage());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const parentId = await getOrCreateCategory(client, CATEGORY, null);
    const subId = await getOrCreateCategory(client, CATEGORY.subcategory, parentId);
    const result = await client.query(
      `INSERT INTO products (
         name, slug, sku, description, category_id, subcategory, price, price_per_sqft, min_charge, material,
         image_url, gallery_images, is_active, pricing_mode, size_mode, base_unit,
         min_width, max_width, min_height, max_height,
         shipping_length, shipping_weight, production_time
       ) VALUES (
         $1, $2, $3, $4, $5, $6, NULL, $7, $8, $9,
         $10, $11::jsonb, true, $12, $13, $14,
         $15, $16, $17, $18,
         $19, $20, $21
       ) RETURNING id`,
      [
        p.name, p.slug, p.sku, p.description, subId, CATEGORY.subcategory.name, p.price_per_sqft, p.min_charge, p.material,
        image.url, JSON.stringify([image.url]), p.pricing_mode, p.size_mode, p.base_unit,
        p.min_width, p.max_width, p.min_height, p.max_height,
        p.shipping_length, p.shipping_weight, p.production_time,
      ]
    );
    await client.query('COMMIT');
    console.log(`  Created "${p.name}" (id ${result.rows[0].id}).`);
  } catch (error) {
    await client.query('ROLLBACK');
    await image.cleanup().catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  console.log('Simple product seeded.');
}

seed()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('Simple product seeding failed:', error);
    await pool.end().catch(() => {});
    process.exit(1);
  });
