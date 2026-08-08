const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/database');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function anonymizeUser(client, userId) {
  const randomPassword = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(randomPassword, 10);
  const anonEmail = `deleted+${userId}@deleted.invalid`;

  try {
    await client.query(
      `UPDATE users SET
         email = $1,
         password_hash = $2,
         full_name = 'Deleted User',
         telephone = NULL,
         hear_about_us = NULL,
         newsletter = false,
         profile_image = NULL,
         is_active = false,
         deletion_requested_at = NULL,
         deletion_scheduled_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [anonEmail, passwordHash, userId]
    );
  } catch (err) {
    // Older DBs may lack some optional columns
    if (err.message && /does not exist|column/i.test(err.message)) {
      await client.query(
        `UPDATE users SET
           email = $1,
           password_hash = $2,
           telephone = NULL,
           newsletter = false,
           is_active = false,
           deletion_requested_at = NULL,
           deletion_scheduled_at = NULL,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [anonEmail, passwordHash, userId]
      );
    } else {
      throw err;
    }
  }

  await client.query('DELETE FROM addresses WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM credit_cards WHERE user_id = $1', [userId]);
  try {
    await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
  } catch (_) {
    // cart_items may not exist on very old DBs
  }
}

async function runAccountDeletionCleanup() {
  let due;
  try {
    due = await pool.query(
      `SELECT id FROM users
       WHERE deletion_requested_at IS NOT NULL
         AND deletion_scheduled_at IS NOT NULL
         AND deletion_scheduled_at <= NOW()
         AND is_active = true`
    );
  } catch (error) {
    if (error.message && /deletion_requested_at|deletion_scheduled_at|does not exist/i.test(error.message)) {
      console.warn('[AccountDeletionJob] Deletion columns not ready yet; skipping.');
      return;
    }
    throw error;
  }

  if (due.rows.length === 0) {
    console.log('[AccountDeletionJob] No accounts due for deletion.');
    return;
  }

  let processed = 0;
  for (const row of due.rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await anonymizeUser(client, row.id);
      await client.query('COMMIT');
      processed += 1;
      console.log(`[AccountDeletionJob] Anonymized user id=${row.id}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[AccountDeletionJob] Failed for user id=${row.id}:`, error.message);
    } finally {
      client.release();
    }
  }

  console.log(`[AccountDeletionJob] Processed ${processed} account(s).`);
}

function startAccountDeletionJob() {
  runAccountDeletionCleanup().catch((err) => {
    console.error('[AccountDeletionJob] Startup run failed:', err.message);
  });
  return setInterval(() => {
    runAccountDeletionCleanup().catch((err) => {
      console.error('[AccountDeletionJob] Scheduled run failed:', err.message);
    });
  }, ONE_DAY_MS);
}

module.exports = {
  startAccountDeletionJob,
  runAccountDeletionCleanup,
  anonymizeUser,
};
