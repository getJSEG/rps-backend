const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

async function runAddPricingColumns() {
  try {
    console.log('Running addProductPricingColumns migration...');
    
    const sql = fs.readFileSync(
      path.join(__dirname, 'addProductPricingColumns.sql'),
      'utf8'
    );
    
    await pool.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('Added columns: price_per_sqft, min_charge, material');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

runAddPricingColumns();

