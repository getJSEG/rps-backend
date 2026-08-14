const pool = require('../config/database');

async function ensureRow() {
  await pool.query(
    `INSERT INTO app_settings (id, email_notifications_enabled)
     VALUES (1, TRUE)
     ON CONFLICT (id) DO NOTHING`
  );
}

async function getSettings() {
  await ensureRow();
  const r = await pool.query(
    `SELECT COALESCE(email_notifications_enabled, TRUE) AS email_notifications_enabled
     FROM app_settings WHERE id = 1`
  );
  return {
    emailNotificationsEnabled: r.rows.length
      ? !!r.rows[0].email_notifications_enabled
      : true,
  };
}

async function updateSettings({ emailNotificationsEnabled }) {
  await ensureRow();
  const enabled = !!emailNotificationsEnabled;
  await pool.query(
    `UPDATE app_settings
     SET email_notifications_enabled = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [enabled]
  );
  return { emailNotificationsEnabled: enabled };
}

async function isEmailNotificationsEnabled() {
  try {
    const { emailNotificationsEnabled } = await getSettings();
    return emailNotificationsEnabled;
  } catch (e) {
    // Fail open so a missing migration does not block operational mail.
    console.warn(
      '[email] could not read email_notifications_enabled; defaulting to enabled:',
      e && e.message ? e.message : e
    );
    return true;
  }
}

module.exports = {
  getSettings,
  updateSettings,
  isEmailNotificationsEnabled,
};
