const appSettingsRepository = require('../repositories/appSettingsRepository');

const getAppSettings = async (req, res) => {
  try {
    const settings = await appSettingsRepository.getSettings();
    res.json(settings);
  } catch (error) {
    console.error('getAppSettings:', error);
    res.status(500).json({ message: 'Failed to load settings' });
  }
};

const putAppSettings = async (req, res) => {
  try {
    if (req.body?.emailNotificationsEnabled === undefined) {
      return res.status(400).json({ message: 'emailNotificationsEnabled is required' });
    }
    const settings = await appSettingsRepository.updateSettings({
      emailNotificationsEnabled: !!req.body.emailNotificationsEnabled,
    });
    res.json(settings);
  } catch (error) {
    console.error('putAppSettings:', error);
    res.status(500).json({ message: 'Failed to update settings' });
  }
};

module.exports = {
  getAppSettings,
  putAppSettings,
};
