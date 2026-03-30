const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

function getSqlMigrationFiles(migrationsDir) {
  const files = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.toLowerCase().endsWith('.sql'));

  // Ensure base schema then legacy update, then remaining SQL files.
  const priority = new Map([
    ['createTables.sql', 0],
    ['updateTables.sql', 1],
  ]);

  return files.sort((a, b) => {
    const pa = priority.has(a) ? priority.get(a) : 10;
    const pb = priority.has(b) ? priority.get(b) : 10;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

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

async function runSqlFile(filePath, id) {
  const sql = fs.readFileSync(filePath, 'utf8').trim();
  if (!sql) return;

  await pool.query('BEGIN');
  try {
    await pool.query(sql);
    await markMigrationAsRan(id);
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

async function runMigrations() {
  const migrationsDir = __dirname;
  console.log('Running SQL migrations from', migrationsDir);

  await ensureMigrationsTable();
  const sqlFiles = getSqlMigrationFiles(migrationsDir);

  if (sqlFiles.length === 0) {
    console.log('No SQL migration files found.');
    return;
  }

  for (const file of sqlFiles) {
    if (await migrationAlreadyRan(file)) {
      console.log('Skipping (already ran):', file);
      continue;
    }

    console.log('Applying:', file);
    await runSqlFile(path.join(migrationsDir, file), file);
    console.log('Applied:', file);
  }
}

runMigrations()
  .then(async () => {
    console.log('All migrations complete.');
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Migration failed:', error);
    try {
      await pool.end();
    } catch (_) {
      // ignore pool close errors
    }
    process.exit(1);
  });

