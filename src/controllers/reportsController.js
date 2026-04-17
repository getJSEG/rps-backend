const reportsRepository = require('../repositories/reportsRepository');

function toStartOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function toEndOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function parseDateOnly(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function resolveClientTodayWindow(tzOffsetMinutes) {
  const offset = Number.parseInt(String(tzOffsetMinutes || ''), 10);
  if (!Number.isFinite(offset) || offset < -840 || offset > 840) return null;

  const offsetMs = offset * 60 * 1000;
  const nowUtcMs = Date.now();
  const localNowMs = nowUtcMs - offsetMs;
  const localNow = new Date(localNowMs);
  const localStartMs = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    0,
    0,
    0,
    0
  );

  return {
    fromDate: new Date(localStartMs + offsetMs),
    toDate: new Date(nowUtcMs),
  };
}

function resolveDateWindow(range, from, to, tzOffsetMinutes) {
  const now = new Date();
  const key = String(range || 'all').toLowerCase();

  if (key === 'today') {
    const clientToday = resolveClientTodayWindow(tzOffsetMinutes);
    if (clientToday) {
      return { ...clientToday, rangeKey: 'today' };
    }
    return { fromDate: toStartOfDay(now), toDate: now, rangeKey: 'today' };
  }

  if (key === 'all') {
    return { fromDate: new Date('1970-01-01T00:00:00.000Z'), toDate: now, rangeKey: 'all' };
  }

  if (key === 'custom') {
    const fromDateRaw = parseDateOnly(from);
    const toDateRaw = parseDateOnly(to);
    if (!fromDateRaw || !toDateRaw) return null;
    const fromDate = toStartOfDay(fromDateRaw);
    const toDate = toEndOfDay(toDateRaw);
    if (fromDate > toDate) return null;
    return { fromDate, toDate, rangeKey: 'custom' };
  }

  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 29);
  return { fromDate: toStartOfDay(fromDate), toDate: now, rangeKey: 'last30' };
}

async function getAdminDashboard(req, res) {
  try {
    const { range = 'all', from, to, chartYear, tzOffsetMinutes } = req.query;

    const window = resolveDateWindow(range, from, to, tzOffsetMinutes);
    if (!window) {
      return res.status(400).json({
        message: "Invalid date filters. For custom range, provide valid 'from' and 'to' in YYYY-MM-DD format.",
      });
    }

    const parsedChartYear = Number.parseInt(String(chartYear || ''), 10);
    const nowYear = new Date().getFullYear();
    const selectedChartYear =
      Number.isFinite(parsedChartYear) && parsedChartYear >= 2000 && parsedChartYear <= nowYear + 1
        ? parsedChartYear
        : nowYear;

    const data = await reportsRepository.getAdminDashboardData({
      fromIso: window.fromDate.toISOString(),
      toIso: window.toDate.toISOString(),
      chartYear: selectedChartYear,
      topLimit: 10,
      recentLimit: 7,
    });

    return res.json({
      filters: {
        range: window.rangeKey,
        from: window.fromDate.toISOString(),
        to: window.toDate.toISOString(),
      },
      ...data,
    });
  } catch (error) {
    console.error('Get admin dashboard report error:', error);
    return res.status(500).json({
      message: 'Failed to fetch dashboard report',
    });
  }
}

module.exports = {
  getAdminDashboard,
};
