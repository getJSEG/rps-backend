const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

const MIGRATION_ID = 'migrateRetailCustomers.sql';
const MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

async function ensureMigrationsTable() {
  await pool.query(MIGRATIONS_TABLE_SQL);
}

async function migrationAlreadyRan(id) {
  const result = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [id]);
  return result.rowCount > 0;
}

async function markMigrationAsRan(id) {
  await pool.query(
    'INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
    [id]
  );
}

async function runRetailCustomers() {
  try {
    console.log('Running migrateRetailCustomers...');
    await ensureMigrationsTable();

    if (await migrationAlreadyRan(MIGRATION_ID)) {
      console.log('Skipping (already ran):', MIGRATION_ID);
      process.exit(0);
    }

    const sql = fs.readFileSync(
      path.join(__dirname, 'migrateRetailCustomers.sql'),
      'utf8'
    );

    const result = await pool.query(sql);
    await markMigrationAsRan(MIGRATION_ID);
    console.log('✅ Migration completed.', result.rowCount != null ? `Rows updated: ${result.rowCount}` : '');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

runRetailCustomers();
