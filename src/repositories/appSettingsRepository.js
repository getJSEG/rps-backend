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

/** Shown until an admin saves their own contact details. */
const DEFAULT_SITE_CONTENT = {
  contactPhone: '1 (888) 739-8501',
  contactEmail: 'info@resourcefulDigital.com',
  contactHours: 'Mon - Fri: 8:00am - 5:00pm PST',
  contactAddress: '',
  holidayScheduleImageUrl: null,
};

const SITE_CONTENT_COLUMNS = {
  contactPhone: 'contact_phone',
  contactEmail: 'contact_email',
  contactHours: 'contact_hours',
  contactAddress: 'contact_address',
  holidayScheduleImageUrl: 'holiday_schedule_image_url',
};

/** Storefront contact details and holiday schedule image (public). */
async function getSiteContent() {
  await ensureRow();
  const r = await pool.query(
    `SELECT contact_phone, contact_email, contact_hours, contact_address, holiday_schedule_image_url
     FROM app_settings WHERE id = 1`
  );
  const row = r.rows[0] || {};
  const content = {};
  for (const [key, column] of Object.entries(SITE_CONTENT_COLUMNS)) {
    content[key] = row[column] != null ? row[column] : DEFAULT_SITE_CONTENT[key];
  }
  return content;
}

/** Partial update: only keys present in `changes` are written. */
async function updateSiteContent(changes = {}) {
  await ensureRow();
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(SITE_CONTENT_COLUMNS)) {
    if (changes[key] === undefined) continue;
    values.push(changes[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length) {
    await pool.query(
      `UPDATE app_settings SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
      values
    );
  }
  return getSiteContent();
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
  getSiteContent,
  updateSiteContent,
  isEmailNotificationsEnabled,
};
