/**
 * Seeds two storefront-ready demo products with their categories, images and pricing.
 * Run: npm run seed:demo-products
 *
 * - Premium Satin Poster: area pricing (price per sq ft with a minimum charge), customer enters width × height,
 *   with Lamination and Hanging modifiers.
 * - Custom Vinyl Sticker: fixed price per sticker with predefined square sizes.
 *
 * Safe to re-run: categories are reused by slug and a product whose slug already exists is skipped,
 * so images are only uploaded for products that are actually inserted.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const { isConfigured: spacesConfigured, uploadObjectFromBuffer, deleteByKey } = require('../utils/spaces');

const ASSETS_DIR = path.join(__dirname, 'seed-assets');
const LOCAL_UPLOAD_DIR = path.join(__dirname, '../../uploads/products');

const CATEGORIES = [
  {
    name: 'Prints & Posters',
    slug: 'prints-posters',
    description: 'Large format prints on photo paper for retail, events and décor.',
    subcategory: { name: 'Posters', slug: 'posters', description: 'Custom size posters printed on satin photo paper.' },
  },
  {
    name: 'Stickers & Labels',
    slug: 'stickers-labels',
    description: 'Durable vinyl stickers and labels for packaging, branding and giveaways.',
    subcategory: {
      name: 'Vinyl Stickers',
      slug: 'vinyl-stickers',
      description: 'Laminated vinyl stickers, cut to shape.',
    },
  },
];

const PRODUCTS = [
  {
    categorySlug: 'posters',
    image: { file: 'poster-sample.jpg', contentType: 'image/jpeg' },
    // Percent adjustments scale with the poster's area price; fixed ones are added per poster.
    modifiers: [
      {
        key: 'poster_lamination',
        name: 'Lamination',
        is_required: true,
        options: [
          { label: 'No Lamination', value: 'none', price_type: 'fixed', price_adjustment: 0, is_default: true },
          // Roughly $1.95/sq ft on top of the $6.50/sq ft print.
          { label: 'Gloss Laminate (+30%)', value: 'gloss', price_type: 'percent', price_adjustment: 30 },
          { label: 'Matte Laminate (+30%)', value: 'matte', price_type: 'percent', price_adjustment: 30 },
        ],
      },
      {
        key: 'poster_hanging',
        name: 'Hanging',
        is_required: true,
        options: [
          { label: 'None', value: 'none', price_type: 'fixed', price_adjustment: 0, is_default: true },
          { label: 'Removable Adhesive Strips (+$2.50)', value: 'adhesive_strips', price_type: 'fixed', price_adjustment: 2.5 },
          { label: 'Wooden Hanger Rails (+$12.00)', value: 'hanger_rails', price_type: 'fixed', price_adjustment: 12 },
        ],
      },
    ],
    row: {
      name: 'Premium Satin Poster',
      slug: 'premium-satin-poster',
      sku: 'PST-SATIN-8MIL',
      is_new: true,
      material: '8 mil Satin Photo Paper',
      pricing_mode: 'area',
      size_mode: 'custom',
      base_unit: 'inch',
      price: null,
      // 18" × 24" = 3 sq ft → $19.50; 24" × 36" = 6 sq ft → $39.00. Small prints are lifted to the minimum.
      price_per_sqft: 6.5,
      min_charge: 15,
      min_width: 8,
      max_width: 54,
      min_height: 8,
      max_height: 120,
      // Packaging thickness (in) and weight per poster (lb) for FedEx rating; width × height come from the order.
      shipping_length: 2,
      shipping_weight: 0.5,
      production_time: 2,
      production_time_rules: [
        { minQty: 1, maxQty: 25, businessDays: 2 },
        { minQty: 26, maxQty: 100, businessDays: 3 },
        { minQty: 101, maxQty: null, businessDays: 5 },
      ],
      product_highlights: [
        'Any size from 8" × 8" up to 54" × 120"',
        'Vivid 1440 dpi photo-quality colour',
        'Satin finish with low glare',
        'Ships rolled in a protective tube',
      ],
      properties: [
        { key: 'Material', value: '8 mil Satin Photo Paper (200 gsm)' },
        { key: 'Finish', value: 'Satin' },
        { key: 'Print', value: 'Full colour, single sided' },
        { key: 'Ink', value: 'Latex, odourless' },
        { key: 'Use', value: 'Indoor' },
      ],
      description:
        '<p>Bring artwork, infographics and promotions to life on our <strong>Premium Satin Poster</strong>. ' +
        'Printed on 8 mil satin photo paper with latex inks, every poster delivers sharp detail and rich colour ' +
        'with a soft sheen that keeps glare down under shop and office lighting.</p>' +
        '<p>Order any size from 8" × 8" up to 54" × 120". Ideal for retail displays, trade shows, classrooms, ' +
        'events and wall décor.</p>',
      spec:
        '<ul>' +
        '<li><strong>Material:</strong> 8 mil satin photo paper, 200 gsm</li>' +
        '<li><strong>Print resolution:</strong> up to 1440 dpi</li>' +
        '<li><strong>Ink:</strong> latex, odourless and instantly dry</li>' +
        '<li><strong>Sizes:</strong> 8"–54" wide, 8"–120" tall</li>' +
        '<li><strong>Pricing:</strong> $6.50 per sq ft, $15.00 minimum per poster</li>' +
        '<li><strong>Recommended use:</strong> indoor</li>' +
        '</ul>',
      file_setup:
        '<ul>' +
        '<li>Upload PDF, PNG or JPG at the final print size.</li>' +
        '<li>Use at least 150 dpi at full size (300 dpi for posters viewed up close).</li>' +
        '<li>Add 0.125" bleed on every side and keep text 0.25" inside the trim.</li>' +
        '<li>CMYK colour mode gives the most accurate print colours.</li>' +
        '<li>Outline or embed all fonts.</li>' +
        '</ul>',
      installation_guide:
        '<ol>' +
        '<li>Unroll the poster face up and let it relax flat for a few hours.</li>' +
        '<li>Clean the wall or frame surface so it is dust free.</li>' +
        '<li>Hang with removable mounting strips, poster hangers or a frame.</li>' +
        '<li>Avoid direct sunlight and moisture to keep colours bright.</li>' +
        '</ol>',
      faq: [
        {
          question: 'Can I order a custom size?',
          answer: 'Yes. Enter any width from 8" to 54" and any height from 8" to 120". The price updates as you type.',
        },
        {
          question: 'How is the price calculated?',
          answer:
            'Posters are $6.50 per square foot (width × height ÷ 144), with a $15.00 minimum per poster. ' +
            'For example, an 18" × 24" poster is 3 sq ft, so it costs $19.50.',
        },
        {
          question: 'Is this poster suitable for outdoor use?',
          answer:
            'It is made for indoor use. For outdoor displays choose a vinyl banner or a laminated print instead.',
        },
        {
          question: 'How is my poster shipped?',
          answer: 'Posters are rolled with the print facing out and shipped in a sturdy cardboard tube.',
        },
      ],
    },
  },
  {
    categorySlug: 'vinyl-stickers',
    image: { file: 'vinyl-sticker-sample.png', contentType: 'image/png' },
    sizeOptions: [
      { label: '2" × 2"', width: 2, height: 2, unit_price: 0.95, is_default: false },
      { label: '3" × 3"', width: 3, height: 3, unit_price: 1.4, is_default: true },
      { label: '4" × 4"', width: 4, height: 4, unit_price: 1.95, is_default: false },
      { label: '5" × 5"', width: 5, height: 5, unit_price: 2.75, is_default: false },
    ],
    row: {
      name: 'Custom Vinyl Sticker',
      slug: 'custom-vinyl-sticker',
      sku: 'STK-VNL-GLOSS',
      is_new: true,
      material: '3.4 mil White Gloss Vinyl, Laminated',
      pricing_mode: 'fixed',
      size_mode: 'predefined',
      base_unit: 'inch',
      // Prices live on the size options; `price` mirrors the default size for listing cards.
      price: 1.4,
      price_per_sqft: null,
      min_charge: null,
      min_width: null,
      max_width: null,
      min_height: null,
      max_height: null,
      // Packaging thickness (in) and weight per sticker (lb) for FedEx rating.
      shipping_length: 1,
      shipping_weight: 0.02,
      production_time: 3,
      production_time_rules: [
        { minQty: 1, maxQty: 250, businessDays: 3 },
        { minQty: 251, maxQty: 1000, businessDays: 4 },
        { minQty: 1001, maxQty: null, businessDays: 6 },
      ],
      product_highlights: [
        'Waterproof and scratch resistant',
        'Gloss laminate protects against UV fading',
        'Square sizes from 2" to 5"',
        'Lasts up to 3 years outdoors',
      ],
      properties: [
        { key: 'Material', value: '3.4 mil white gloss vinyl' },
        { key: 'Laminate', value: 'Gloss, UV protective' },
        { key: 'Adhesive', value: 'Permanent' },
        { key: 'Shape', value: 'Square' },
        { key: 'Use', value: 'Indoor and outdoor' },
      ],
      description:
        '<p>Our <strong>Custom Vinyl Stickers</strong> are printed on 3.4 mil white vinyl and finished with a ' +
        'gloss UV laminate, so they stand up to water, scratches and sunlight. Perfect for laptops, water bottles, ' +
        'packaging, product labels and giveaways.</p>' +
        '<p>Choose a size from 2" × 2" to 5" × 5" and order as many as you need. The more you order, the more you ' +
        'save on your cost per sticker.</p>',
      spec:
        '<ul>' +
        '<li><strong>Material:</strong> 3.4 mil white gloss vinyl</li>' +
        '<li><strong>Laminate:</strong> gloss, UV protective</li>' +
        '<li><strong>Adhesive:</strong> permanent, removes cleanly within the first 24 hours</li>' +
        '<li><strong>Outdoor life:</strong> up to 3 years</li>' +
        '<li><strong>Sizes:</strong> 2" × 2" ($0.95), 3" × 3" ($1.40), 4" × 4" ($1.95), 5" × 5" ($2.75)</li>' +
        '</ul>',
      file_setup:
        '<ul>' +
        '<li>Upload PDF, PNG or JPG at the sticker size you select.</li>' +
        '<li>Use 300 dpi at full size for crisp text and edges.</li>' +
        '<li>Add 0.0625" bleed and keep text 0.125" inside the edge.</li>' +
        '<li>Use CMYK colour mode for accurate colours.</li>' +
        '</ul>',
      installation_guide:
        '<ol>' +
        '<li>Clean the surface with rubbing alcohol and let it dry.</li>' +
        '<li>Peel the sticker from its backing, holding it by the edges.</li>' +
        '<li>Place one edge first, then smooth it down from the centre outward to push out air bubbles.</li>' +
        '<li>Apply above 50°F (10°C) for the best adhesion.</li>' +
        '</ol>',
      faq: [
        {
          question: 'Are these stickers waterproof?',
          answer: 'Yes. The vinyl and gloss laminate are waterproof and dishwasher safe on the top rack.',
        },
        {
          question: 'Can I use them outdoors?',
          answer: 'Yes. The UV laminate keeps colours bright for up to 3 years outdoors.',
        },
        {
          question: 'Can I remove them later?',
          answer:
            'The adhesive is permanent, but stickers can be repositioned in the first 24 hours and usually ' +
            'peel off smooth surfaces cleanly.',
        },
        {
          question: 'Is there a minimum order?',
          answer: 'No minimum. Order a single sticker or thousands.',
        },
      ],
    },
  },
];

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

/** Same storage as the admin product image uploader: Spaces when configured, else uploads/products. */
async function storeProductImage({ file, contentType }) {
  const buffer = fs.readFileSync(path.join(ASSETS_DIR, file));
  if (spacesConfigured()) {
    const { url, key } = await uploadObjectFromBuffer(buffer, 'elmer/products', { contentType, originalName: file });
    return { url, cleanup: () => deleteByKey(key) };
  }
  if (!fs.existsSync(LOCAL_UPLOAD_DIR)) fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${path.extname(file)}`;
  const fullPath = path.join(LOCAL_UPLOAD_DIR, filename);
  fs.writeFileSync(fullPath, buffer);
  return { url: `/uploads/products/${filename}`, cleanup: async () => fs.rmSync(fullPath, { force: true }) };
}

async function insertProduct(client, product, category, imageUrl) {
  const p = product.row;
  const result = await client.query(
    `INSERT INTO products (
       name, slug, sku, description, spec, file_setup, installation_guide, faq,
       category_id, subcategory, price, price_per_sqft, min_charge, material, image_url, gallery_images,
       is_new, is_active, properties, pricing_mode, size_mode, base_unit,
       min_width, max_width, min_height, max_height,
       shipping_length, shipping_weight, production_time, production_time_rules, product_highlights
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8::jsonb,
       $9, $10, $11, $12, $13, $14, $15, $16::jsonb,
       $17, true, $18::jsonb, $19, $20, $21,
       $22, $23, $24, $25,
       $26, $27, $28, $29::jsonb, $30::jsonb
     ) RETURNING id`,
    [
      p.name,
      p.slug,
      p.sku,
      p.description,
      p.spec,
      p.file_setup,
      p.installation_guide,
      JSON.stringify(p.faq),
      category.id,
      category.name,
      p.price,
      p.price_per_sqft,
      p.min_charge,
      p.material,
      imageUrl,
      JSON.stringify([imageUrl]),
      p.is_new,
      JSON.stringify(p.properties),
      p.pricing_mode,
      p.size_mode,
      p.base_unit,
      p.min_width,
      p.max_width,
      p.min_height,
      p.max_height,
      p.shipping_length,
      p.shipping_weight,
      p.production_time,
      JSON.stringify(p.production_time_rules),
      JSON.stringify(p.product_highlights),
    ]
  );
  const productId = result.rows[0].id;
  for (const option of product.sizeOptions || []) {
    await client.query(
      `INSERT INTO product_size_options (product_id, label, width, height, unit_price, is_default)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [productId, option.label, option.width, option.height, option.unit_price, option.is_default]
    );
  }
  return productId;
}

/**
 * Attach modifier groups to a product. Groups are reused by key and options by value, and existing links are
 * kept, so this is safe to run again for a product that was seeded earlier.
 */
async function ensureProductModifiers(client, productId, modifiers) {
  for (let groupIndex = 0; groupIndex < modifiers.length; groupIndex += 1) {
    const group = modifiers[groupIndex];
    const groupResult = await client.query(
      `INSERT INTO modifier_groups (name, key, input_type, sort_order, is_active)
       VALUES ($1, $2, 'dropdown', $3, true)
       ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = NOW()
       RETURNING id`,
      [group.name, group.key, groupIndex]
    );
    const groupId = groupResult.rows[0].id;

    const productModifier = await client.query(
      `INSERT INTO product_modifiers (product_id, modifier_group_id, is_required, sort_order, is_active, mode_scope)
       VALUES ($1, $2, $3, $4, true, 'all')
       ON CONFLICT (product_id, modifier_group_id) DO UPDATE SET is_active = true, updated_at = NOW()
       RETURNING id`,
      [productId, groupId, group.is_required, groupIndex]
    );
    const productModifierId = productModifier.rows[0].id;

    for (let optionIndex = 0; optionIndex < group.options.length; optionIndex += 1) {
      const option = group.options[optionIndex];
      const existing = await client.query(
        'SELECT id FROM modifier_options WHERE modifier_group_id = $1 AND value = $2 LIMIT 1',
        [groupId, option.value]
      );
      const optionId = existing.rows[0]
        ? existing.rows[0].id
        : (
            await client.query(
              `INSERT INTO modifier_options
                 (modifier_group_id, label, value, price_adjustment, price_type, is_default, sort_order, is_active)
               VALUES ($1, $2, $3, $4, $5, $6, $7, true)
               RETURNING id`,
              [
                groupId,
                option.label,
                option.value,
                option.price_adjustment,
                option.price_type,
                option.is_default === true,
                optionIndex,
              ]
            )
          ).rows[0].id;
      await client.query(
        `INSERT INTO product_modifier_options (product_modifier_id, modifier_option_id, is_default, is_active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (product_modifier_id, modifier_option_id) DO NOTHING`,
        [productModifierId, optionId, option.is_default === true]
      );
    }
  }
}

async function seed() {
  console.log('Seeding demo products...');

  const categoryIds = {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const parent of CATEGORIES) {
      const parentId = await getOrCreateCategory(client, parent, null);
      const sub = parent.subcategory;
      categoryIds[sub.slug] = { id: await getOrCreateCategory(client, sub, parentId), name: sub.name };
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  for (const product of PRODUCTS) {
    const { name, slug } = product.row;
    const exists = await pool.query('SELECT id FROM products WHERE slug = $1', [slug]);
    let productId = exists.rows[0]?.id ?? null;
    if (productId) {
      console.log(`  Skipped "${name}": already exists (id ${productId}).`);
    } else {
      const image = await storeProductImage(product.image);
      const productClient = await pool.connect();
      try {
        await productClient.query('BEGIN');
        productId = await insertProduct(productClient, product, categoryIds[product.categorySlug], image.url);
        await productClient.query('COMMIT');
        console.log(`  Created "${name}" (id ${productId}).`);
      } catch (error) {
        await productClient.query('ROLLBACK');
        await image.cleanup().catch(() => {});
        throw error;
      } finally {
        productClient.release();
      }
    }

    if (product.modifiers?.length) {
      const modifierClient = await pool.connect();
      try {
        await modifierClient.query('BEGIN');
        await ensureProductModifiers(modifierClient, productId, product.modifiers);
        await modifierClient.query('COMMIT');
        console.log(`  Modifiers on "${name}": ${product.modifiers.map((m) => m.name).join(', ')}.`);
      } catch (error) {
        await modifierClient.query('ROLLBACK');
        throw error;
      } finally {
        modifierClient.release();
      }
    }
  }

  console.log('Demo products seeded.');
}

seed()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('Demo product seeding failed:', error);
    await pool.end().catch(() => {});
    process.exit(1);
  });
