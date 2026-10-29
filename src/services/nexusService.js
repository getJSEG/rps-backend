const nexusRepository = require('../repositories/nexusRepository');

/** Warn at 95% of a threshold, alert (reached) at 100%. */
const WARNING_RATIO = 0.95;

/** How far a state is toward nexus: 1 = threshold met. OR uses the higher ratio, AND the lower. */
function progressRatio(state, sales, orders) {
  const ratios = [];
  const salesThreshold = Number(state.sales_threshold);
  const txnThreshold = Number(state.transaction_threshold);
  if (salesThreshold > 0) ratios.push(sales / salesThreshold);
  if (txnThreshold > 0) ratios.push(orders / txnThreshold);
  if (ratios.length === 0) return null;
  return state.threshold_rule === 'and' ? Math.min(...ratios) : Math.max(...ratios);
}

/** Status the numbers call for; the repository only applies it to not_collecting / close_warning states. */
function autoStatus(state, sales, orders) {
  const ratio = progressRatio(state, sales, orders);
  if (ratio === null) return 'not_collecting';
  if (ratio >= 1) return 'reached';
  if (ratio >= WARNING_RATIO) return 'close_warning';
  return 'not_collecting';
}

/**
 * Recount completed orders for the rolling 12 months (to yesterday) and update every state's totals
 * and auto status. Skips when today's period was already calculated, unless force is set.
 */
async function recalculateNexus({ force = false } = {}) {
  const period = await nexusRepository.getRollingPeriod();
  if (!force && !(await nexusRepository.needsRecalculation(period.period_end))) {
    return { skipped: true, period };
  }
  const [states, totals] = await Promise.all([
    nexusRepository.listStates(),
    nexusRepository.getTotalsByState(period.period_start, period.period_end),
  ]);
  const rollups = states.map((state) => {
    const t = totals.get(state.code) || { sales: 0, orders: 0 };
    return { code: state.code, sales: t.sales, orders: t.orders, autoStatus: autoStatus(state, t.sales, t.orders) };
  });
  const saved = await nexusRepository.saveRollups(rollups, period);
  return { skipped: false, period, states: saved };
}

module.exports = {
  WARNING_RATIO,
  progressRatio,
  autoStatus,
  recalculateNexus,
};
