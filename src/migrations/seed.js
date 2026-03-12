const pool = require('../config/database');
const bcrypt = require('bcryptjs');

async function seed() {
  try {
    console.log('Seeding database...');

    // Categories and subcategories are managed only from Admin Panel (Products > Categories / Subcategories).
    // No categories are seeded here — add them via the app.

    // Seed sample materials
    const materials = [
      {
        name: 'Canvas Roll - Premium',
        slug: 'canvas-roll-premium',
        description: 'High-quality canvas roll for printing',
        category: 'Canvas',
        price_per_unit: 15.99,
        unit_type: 'sqft',
        image_url: '/images/canvas-roll.jpg'
      },
    ];

    for (const material of materials) {
      await pool.query(
        `INSERT INTO materials (name, slug, description, category, price_per_unit, unit_type, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (slug) DO NOTHING`,
        [
          material.name,
          material.slug,
          material.description,
          material.category,
          material.price_per_unit,
          material.unit_type,
          material.image_url
        ]
      );
    }

    console.log('Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seed();

