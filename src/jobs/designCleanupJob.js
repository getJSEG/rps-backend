const { deleteAbandonedDesigns } = require('../services/designService');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function runDesignCleanup() {
  try {
    const removedCount = await deleteAbandonedDesigns();
    console.log(`[DesignCleanupJob] Removed ${removedCount} abandoned design(s).`);
  } catch (error) {
    console.error('[DesignCleanupJob] Failed to remove abandoned designs:', error.message);
  }
}

function startDesignCleanupJob() {
  // Run once on startup, then once every 24 hours.
  runDesignCleanup();
  return setInterval(runDesignCleanup, ONE_DAY_MS);
}

module.exports = {
  startDesignCleanupJob,
  runDesignCleanup,
};
