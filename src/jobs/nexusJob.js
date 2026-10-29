const { recalculateNexus } = require('../services/nexusService');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Runs daily: recalculates once per day for the rolling 12 months ending yesterday. */
async function runNexusRecalculation() {
  try {
    const result = await recalculateNexus();
    if (result.skipped) return;
    const flagged = result.states.filter((s) => s.status === 'close_warning' || s.status === 'reached');
    console.log(
      `[NexusJob] Recalculated ${result.states.length} state(s) for ${result.period.period_start} to ${result.period.period_end}; ` +
        `${flagged.length} close to or past threshold.`
    );
  } catch (error) {
    console.error('[NexusJob] Recalculation failed:', error.message);
  }
}

function startNexusJob() {
  // Run once on startup, then once every 24 hours.
  runNexusRecalculation();
  return setInterval(runNexusRecalculation, ONE_DAY_MS);
}

module.exports = {
  startNexusJob,
  runNexusRecalculation,
};
