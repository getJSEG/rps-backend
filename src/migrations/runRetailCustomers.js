const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

async function runRetailCustomers() {
  try {
    console.log('Running migrateRetailCustomers...');

    const sql = fs.readFileSync(
      path.join(__dirname, 'migrateRetailCustomers.sql'),
      'utf8'
    );

    const result = await pool.query(sql);
    console.log('✅ Migration completed.', result.rowCount != null ? `Rows updated: ${result.rowCount}` : '');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

runRetailCustomers();
