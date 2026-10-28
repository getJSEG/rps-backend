const appSettingsRepository = require('../repositories/appSettingsRepository');

const MAX_LENGTHS = {
  contactPhone: 50,
  contactEmail: 255,
  contactHours: 255,
  contactAddress: 500,
  holidayScheduleImageUrl: 2000,
};

/**
 * Validate the site-content part of a settings update. Only keys present in the body are returned.
 * Phone and email can't be blank (the Contact Us page shows them); address and hours may be.
 */
function parseSiteContent(body = {}) {
  const changes = {};
  for (const [key, max] of Object.entries(MAX_LENGTHS)) {
    if (body[key] === undefined) continue;
    const raw = body[key] == null ? '' : String(body[key]).trim();
    if (raw.length > max) return { error: `${key} must be at most ${max} characters.` };
    changes[key] = raw;
  }
  if (changes.contactPhone !== undefined && !changes.contactPhone) {
    return { error: 'Phone number is required.' };
  }
  if (changes.contactEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changes.contactEmail)) {
    return { error: 'Enter a valid email address.' };
  }
  if (changes.holidayScheduleImageUrl !== undefined) {
    // Empty removes the image.
    if (!changes.holidayScheduleImageUrl) changes.holidayScheduleImageUrl = null;
    else if (!/^(https?:\/\/|\/uploads\/)/i.test(changes.holidayScheduleImageUrl)) {
      return { error: 'Holiday schedule image must be an uploaded image URL.' };
    }
  }
  return { changes };
}

const getAppSettings = async (req, res) => {
  try {
    const [settings, siteContent] = await Promise.all([
      appSettingsRepository.getSettings(),
      appSettingsRepository.getSiteContent(),
    ]);
    res.json({ ...settings, ...siteContent });
  } catch (error) {
    console.error('getAppSettings:', error);
    res.status(500).json({ message: 'Failed to load settings' });
  }
};

/** Partial update: send any of emailNotificationsEnabled and the site-content fields. */
const putAppSettings = async (req, res) => {
  try {
    const body = req.body || {};
    const parsed = parseSiteContent(body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const hasEmailToggle = body.emailNotificationsEnabled !== undefined;
    if (!hasEmailToggle && Object.keys(parsed.changes).length === 0) {
      return res.status(400).json({ message: 'No settings to update' });
    }
    const settings = hasEmailToggle
      ? await appSettingsRepository.updateSettings({
          emailNotificationsEnabled: !!body.emailNotificationsEnabled,
        })
      : await appSettingsRepository.getSettings();
    const siteContent = await appSettingsRepository.updateSiteContent(parsed.changes);
    res.json({ ...settings, ...siteContent });
  } catch (error) {
    console.error('putAppSettings:', error);
    res.status(500).json({ message: 'Failed to update settings' });
  }
};

/** Public: contact details and holiday schedule image for the storefront. */
const getPublicSiteContent = async (req, res) => {
  try {
    res.json(await appSettingsRepository.getSiteContent());
  } catch (error) {
    console.error('getPublicSiteContent:', error);
    res.status(500).json({ message: 'Failed to load site content' });
  }
};

module.exports = {
  getAppSettings,
  putAppSettings,
  getPublicSiteContent,
};
