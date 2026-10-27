const pool = require('../config/database');

const COMPLETED_STATUS = `replace(lower(trim(COALESCE(o.status, ''))), ' ', '_') IN ('completed', 'complete', 'delivered')`;

/** Net sales per order for nexus: order total (incl. shipping and any tax charged) minus refunds. */
const ORDER_NET_SALES = `o.total_amount - COALESCE(o.refund_amount, 0)`;

/** Tracking starts when the feature went live (nexus_states seeded); older orders never count. */
const PLACED_AFTER_LAUNCH = `o.created_at >= (SELECT MIN(created_at) FROM nexus_states)`;

const SQL = {
  /** Rolling window = the 12 full months before the current month. */
  SELECT_ROLLING_PERIOD: `SELECT
       (date_trunc('month', CURRENT_DATE) - interval '12 months')::date::text AS period_start,
       (date_trunc('month', CURRENT_DATE) - interval '1 day')::date::text AS period_end`,
  NEEDS_RECALCULATION: `SELECT EXISTS (
       SELECT 1 FROM nexus_states WHERE period_end IS DISTINCT FROM $1::date
     ) AS needed`,
  SELECT_STATES: `SELECT * FROM nexus_states ORDER BY name`,
  /** Completed, not fully refunded orders per ship-to state between two dates (inclusive). */
  SELECT_TOTALS_BY_STATE: `SELECT ship_to_state AS code,
       ROUND(SUM(net), 2)::numeric AS sales,
       COUNT(*)::int AS orders
     FROM (
       SELECT o.ship_to_state, ${ORDER_NET_SALES} AS net
       FROM orders o
       WHERE o.ship_to_state IS NOT NULL
         AND ${PLACED_AFTER_LAUNCH}
         AND o.completed_at >= $1::date
         AND o.completed_at < $2::date + 1
         AND ${COMPLETED_STATUS}
     ) t
     WHERE net > 0
     GROUP BY ship_to_state`,
  /** Auto statuses only move from not_collecting / close_warning; reached and manual statuses are kept. */
  UPDATE_STATE_ROLLUP: `UPDATE nexus_states
       SET rolling_sales = $2,
           rolling_orders = $3,
           period_start = $4,
           period_end = $5,
           calculated_at = CURRENT_TIMESTAMP,
           status_changed_at = CASE
             WHEN status IN ('not_collecting', 'close_warning') AND status <> $6 THEN CURRENT_TIMESTAMP
             ELSE status_changed_at END,
           status = CASE WHEN status IN ('not_collecting', 'close_warning') THEN $6 ELSE status END,
           updated_at = CURRENT_TIMESTAMP
     WHERE code = $1
     RETURNING *`,
};

async function getRollingPeriod() {
  const r = await pool.query(SQL.SELECT_ROLLING_PERIOD);
  return r.rows[0];
}

async function needsRecalculation(periodEnd) {
  const r = await pool.query(SQL.NEEDS_RECALCULATION, [periodEnd]);
  return r.rows[0].needed;
}

async function listStates() {
  const r = await pool.query(SQL.SELECT_STATES);
  return r.rows;
}

/** @returns {Promise<Map<string, { sales: number, orders: number }>>} keyed by state code */
async function getTotalsByState(startDate, endDate) {
  const r = await pool.query(SQL.SELECT_TOTALS_BY_STATE, [startDate, endDate]);
  return new Map(r.rows.map((row) => [row.code, { sales: Number(row.sales), orders: row.orders }]));
}

/**
 * @param {Array<{ code: string, sales: number, orders: number, autoStatus: string }>} rollups
 * @param {{ period_start: string, period_end: string }} period
 */
async function saveRollups(rollups, period) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const saved = [];
    for (const r of rollups) {
      const res = await client.query(SQL.UPDATE_STATE_ROLLUP, [
        r.code,
        r.sales,
        r.orders,
        period.period_start,
        period.period_end,
        r.autoStatus,
      ]);
      saved.push(res.rows[0]);
    }
    await client.query('COMMIT');
    return saved;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getRollingPeriod,
  needsRecalculation,
  listStates,
  getTotalsByState,
  saveRollups,
};
