const nexusRepository = require('../repositories/nexusRepository');
const { autoStatus } = require('../services/nexusService');

/** Statuses the admin can pick; close_warning / reached are only set from the numbers. */
const MANUAL_STATUSES = new Set(['not_collecting', 'pending_registration', 'filing', 'collecting']);

function toApiState(row, periodTotals) {
  const t = periodTotals ? periodTotals.get(row.code) || { sales: 0, orders: 0 } : null;
  return {
    code: row.code,
    name: row.name,
    salesThreshold: row.sales_threshold == null ? null : Number(row.sales_threshold),
    transactionThreshold: row.transaction_threshold,
    rule: row.threshold_rule,
    status: row.status,
    statusChangedAt: row.status_changed_at,
    rollingSales: Number(row.rolling_sales),
    rollingOrders: row.rolling_orders,
    // Numbers for the selected period; the rolling view uses the month-end totals.
    sales: t ? t.sales : Number(row.rolling_sales),
    orders: t ? t.orders : row.rolling_orders,
  };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Month: key YYYY-MM (default current month). Week: key = Monday as YYYY-MM-DD (default current week).
 * @returns {{ kind: string, start: string, end: string } | { error: string }}
 */
function parsePeriod(query) {
  const kind = String(query.period || 'rolling').trim().toLowerCase();
  const key = String(query.key || '').trim();
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  if (kind === 'rolling') return { kind };

  if (kind === 'month') {
    let year = today.getUTCFullYear();
    let month = today.getUTCMonth();
    if (key) {
      const m = key.match(/^(\d{4})-(\d{2})$/);
      if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return { error: 'Month must be YYYY-MM.' };
      year = Number(m[1]);
      month = Number(m[2]) - 1;
    }
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 0));
    return { kind, start: isoDate(start), end: isoDate(end) };
  }

  if (kind === 'week') {
    let start;
    if (key) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return { error: 'Week must be the Monday date as YYYY-MM-DD.' };
      start = new Date(`${key}T00:00:00Z`);
      if (Number.isNaN(start.getTime()) || isoDate(start) !== key) return { error: 'Invalid week date.' };
      if (start.getUTCDay() !== 1) return { error: 'Weeks start on Monday.' };
    } else {
      start = new Date(today);
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    }
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { kind, start: isoDate(start), end: isoDate(end) };
  }

  return { error: 'Period must be rolling, month, or week.' };
}

function parseCode(raw) {
  const code = String(raw || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/** Optional positive number; '' / null mean "not set". */
function parseOptionalPositive(raw, { integer = false } = {}) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return { value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || (integer && !Number.isInteger(n))) return { error: true };
  return { value: integer ? n : Math.round(n * 100) / 100 };
}

const listNexusStatesAdmin = async (req, res) => {
  try {
    const period = parsePeriod(req.query);
    if (period.error) return res.status(400).json({ message: period.error });

    const states = await nexusRepository.listStates();
    let periodTotals = null;
    let periodInfo;
    if (period.kind === 'rolling') {
      const calculated = states.find((s) => s.period_end) || {};
      periodInfo = {
        kind: 'rolling',
        start: calculated.period_start_text || null,
        end: calculated.period_end_text || null,
        calculatedAt: calculated.calculated_at || null,
      };
    } else {
      periodTotals = await nexusRepository.getTotalsByState(period.start, period.end);
      periodInfo = period;
    }

    const apiStates = states.map((s) => toApiState(s, periodTotals));
    res.json({
      period: periodInfo,
      states: apiStates,
      attentionCount: apiStates.filter((s) => s.status === 'close_warning' || s.status === 'reached').length,
    });
  } catch (error) {
    console.error('listNexusStatesAdmin:', error);
    res.status(500).json({ message: 'Failed to load nexus states' });
  }
};

const updateNexusThresholdAdmin = async (req, res) => {
  try {
    const code = parseCode(req.params.code);
    if (!code) return res.status(400).json({ message: 'Invalid state code' });

    const notApplicable = req.body.notApplicable === true;
    const sales = parseOptionalPositive(req.body.salesThreshold);
    const txns = parseOptionalPositive(req.body.transactionThreshold, { integer: true });
    if (sales.error) return res.status(400).json({ message: 'Sales threshold must be a positive amount.' });
    if (txns.error) return res.status(400).json({ message: 'Transaction threshold must be a positive whole number.' });
    if (!notApplicable && sales.value == null && txns.value == null) {
      return res.status(400).json({ message: 'Enter a sales amount, a transaction count, or mark the state N/A.' });
    }
    const rule = String(req.body.rule || 'or').trim().toLowerCase();
    if (rule !== 'or' && rule !== 'and') return res.status(400).json({ message: 'Rule must be or / and.' });

    let state = await nexusRepository.updateThreshold(code, {
      salesThreshold: notApplicable ? null : sales.value,
      transactionThreshold: notApplicable ? null : txns.value,
      rule,
    });
    if (!state) return res.status(404).json({ message: 'State not found' });

    // Re-check the latest 12-month totals against the new threshold (reached / manual statuses stay).
    const next = autoStatus(state, Number(state.rolling_sales), state.rolling_orders);
    state = (await nexusRepository.updateStatus(code, next, { onlyFromAuto: true })) || state;
    res.json({ state: toApiState(state) });
  } catch (error) {
    console.error('updateNexusThresholdAdmin:', error);
    res.status(500).json({ message: 'Failed to update threshold' });
  }
};

const updateNexusStatusAdmin = async (req, res) => {
  try {
    const code = parseCode(req.params.code);
    if (!code) return res.status(400).json({ message: 'Invalid state code' });
    const requested = String(req.body.status || '').trim().toLowerCase();
    if (!MANUAL_STATUSES.has(requested)) {
      return res.status(400).json({ message: 'Status must be not_collecting, pending_registration, filing, or collecting.' });
    }

    const current = await nexusRepository.getState(code);
    if (!current) return res.status(404).json({ message: 'State not found' });

    // "Not collecting" hands the state back to the numbers, so a state over its threshold shows as reached.
    const status =
      requested === 'not_collecting'
        ? autoStatus(current, Number(current.rolling_sales), current.rolling_orders)
        : requested;
    const state = await nexusRepository.updateStatus(code, status);
    res.json({ state: toApiState(state) });
  } catch (error) {
    console.error('updateNexusStatusAdmin:', error);
    res.status(500).json({ message: 'Failed to update status' });
  }
};

const getNexusAttentionCountAdmin = async (req, res) => {
  try {
    const { reached, warning } = await nexusRepository.countAttention();
    res.json({ count: reached + warning, reached, warning });
  } catch (error) {
    console.error('getNexusAttentionCountAdmin:', error);
    res.status(500).json({ message: 'Failed to load nexus alerts' });
  }
};

module.exports = {
  listNexusStatesAdmin,
  updateNexusThresholdAdmin,
  updateNexusStatusAdmin,
  getNexusAttentionCountAdmin,
  parsePeriod,
};
