const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

async function runUpdate() {
  try {
    console.log('Running database update migration...');
    
    const sql = fs.readFileSync(
      path.join(__dirname, 'updateTables.sql'),
      'utf8'
    );
    
    await pool.query(sql);
    
    console.log('Update migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Update migration error:', error);
    process.exit(1);
  }
}

runUpdate();
