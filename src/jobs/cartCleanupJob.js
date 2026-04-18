const cartRepository = require('../repositories/cartRepository');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function runCartCleanup() {
  try {
    const removedCount = await cartRepository.deleteExpiredCartItems();
    console.log(`[CartCleanupJob] Removed ${removedCount} expired cart item(s).`);
  } catch (error) {
    console.error('[CartCleanupJob] Failed to remove expired cart items:', error.message);
  }
}

function startCartCleanupJob() {
  // Run once on startup, then once every 24 hours.
  runCartCleanup();
  return setInterval(runCartCleanup, ONE_DAY_MS);
}

module.exports = {
  startCartCleanupJob,
  runCartCleanup,
};
