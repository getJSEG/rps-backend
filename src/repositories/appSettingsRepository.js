const pool = require('../config/database');

const DEFAULTS = {
  emailNotificationsEnabled: true,
};

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
  if (r.rows.length === 0) return { ...DEFAULTS };
  return {
    emailNotificationsEnabled: !!r.rows[0].email_notifications_enabled,
  };
}

async function updateSettings({ emailNotificationsEnabled } = {}) {
  await ensureRow();
  const cur = await getSettings();
  const enabled =
    emailNotificationsEnabled !== undefined
      ? !!emailNotificationsEnabled
      : cur.emailNotificationsEnabled;

  await pool.query(
    `UPDATE app_settings
     SET email_notifications_enabled = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [enabled]
  );
  return getSettings();
}

async function isEmailNotificationsEnabled() {
  try {
    const settings = await getSettings();
    return settings.emailNotificationsEnabled !== false;
  } catch (e) {
    // Fail open so a missing migration does not block operational mail forever.
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
