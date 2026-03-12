/**
 * ONE-TIME SCRIPT: Adds 10 products per subcategory.
 * Run: npm run seed-subcategory-products
 * You can DELETE this file after running it once.
 */
const pool = require('../config/database');

const PRODUCTS_PER_SUBCATEGORY = 10;

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

async function run() {
  try {
    console.log('Fetching subcategories...');
    const subcats = await pool.query(
      `SELECT id, name, slug FROM categories WHERE parent_id IS NOT NULL ORDER BY id`
    );
    const rows = subcats.rows || [];
    if (rows.length === 0) {
      console.log('No subcategories found. Add categories/subcategories from Admin Panel first, then run this script.');
      process.exit(0);
      return;
    }
    console.log(`Found ${rows.length} subcategories. Adding ${PRODUCTS_PER_SUBCATEGORY} products each...`);

    let totalInserted = 0;
    for (const sub of rows) {
      const baseSlug = slugify(sub.slug || sub.name);
      for (let i = 1; i <= PRODUCTS_PER_SUBCATEGORY; i++) {
        const name = `${sub.name} Product ${i}`;
        const slug = `${baseSlug}-product-${i}`;
        try {
          const result = await pool.query(
            `INSERT INTO products (name, slug, description, category_id, subcategory, price, price_per_sqft, min_charge, material, image_url, is_new, is_active, sku)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12)
             ON CONFLICT (slug) DO NOTHING`,
            [
              name,
              slug,
              `Sample product for ${sub.name}.`,
              sub.id,
              sub.name,
              29.99 + (i % 5) * 10,
              2.5,
              25,
              null,
              null,
              i <= 2,
              `SKU-${baseSlug}-${i}`,
            ]
          );
          totalInserted += result.rowCount || 0;
        } catch (err) {
          if (err.code === '23505') continue;
          console.error(`Error inserting product for ${sub.name} #${i}:`, err.message);
        }
      }
      console.log(`  ${sub.name}: ${PRODUCTS_PER_SUBCATEGORY} products added.`);
    }

    console.log(`Done. Total products inserted: ${totalInserted}`);
    console.log('You can delete this script (seedSubcategoryProducts.js) if you no longer need it.');
    process.exit(0);
  } catch (err) {
    console.error('Script error:', err);
    process.exit(1);
  }
}

run();
