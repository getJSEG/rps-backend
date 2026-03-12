const { Pool } = require('pg');
require('dotenv').config();

// Railway / Heroku: use only connection string. No DB_HOST, DB_PASSWORD etc. - avoids SCRAM "password must be a string" error.
const rawUrl = process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_URL;
const connectionString = typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl.trim() : null;

let pool;

if (connectionString) {
  console.log('✅ Using DATABASE_URL connection string (Railway/cloud)');
  pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    ssl: { rejectUnauthorized: false },
  });
} else {
  console.log('❌ DATABASE_URL not set - using local config (for local dev only)');
  pool = new Pool({
    database: process.env.DB_NAME || 'elmer_db',
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    password: process.env.DB_PASSWORD != null ? String(process.env.DB_PASSWORD) : undefined,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;
