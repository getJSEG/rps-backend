const { normalizeProductionTimeRules, productionTimeBusinessDaysForQuantity } = require('./productionTimeRules');

const FEDEX_SERVICE_TRANSIT_BUSINESS_DAYS = {
  FIRST_OVERNIGHT: 1,
  PRIORITY_OVERNIGHT: 1,
  STANDARD_OVERNIGHT: 1,
  FEDEX_2_DAY_AM: 2,
  FEDEX_2_DAY: 2,
  FEDEX_EXPRESS_SAVER: 3,
  FEDEX_GROUND: 5,
  GROUND_HOME_DELIVERY: 5,
  GROUND_ECONOMY: 7,
  SMART_POST: 7,
};

function addBusinessDays(date, days) {
  const out = new Date(date.getTime());
  let remaining = Math.max(0, Math.trunc(Number(days) || 0));
  while (remaining > 0) {
    out.setDate(out.getDate() + 1);
    const day = out.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return out;
}

function parseFedexDeliveryDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = raw.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*(\d{4}))?\b/);
  if (!match) return null;
  const year = match[3] ? Number(match[3]) : new Date().getFullYear();
  const parsed = new Date(`${match[1]} ${match[2]}, ${year}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateForDeliveryEstimate(date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function productionTimeBusinessDays(value) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

function productionTimeQuantityFromItem(item) {
  const jobs = Array.isArray(item?.jobs) ? item.jobs : [];
  if (jobs.length > 0) {
    return jobs.reduce((sum, job) => sum + Math.max(1, Math.trunc(Number(job?.quantity) || 1)), 0);
  }
  return Math.max(1, Math.trunc(Number(item?.quantity) || 1));
}

function maxProductionTimeBusinessDays(items) {
  return (Array.isArray(items) ? items : []).reduce((max, item) => {
    const snap = item && typeof item.pricing_snapshot === 'object' ? item.pricing_snapshot : {};
    const rules =
      item?.productionTimeRules ??
      item?.production_time_rules ??
      snap.productionTimeRules ??
      snap.production_time_rules;
    const productionDays = productionTimeBusinessDaysForQuantity(
      productionTimeQuantityFromItem(item),
      rules
    );
    return Math.max(
      max,
      productionDays
    );
  }, 0);
}

function fedexDeliveryEstimateWithProduction(rate, productionDaysRaw) {
  if (!rate) return null;
  const productionDays = productionTimeBusinessDays(productionDaysRaw);
  const serviceType = String(rate.serviceType || '').trim().toUpperCase();
  const serviceDays = FEDEX_SERVICE_TRANSIT_BUSINESS_DAYS[serviceType] ?? null;
  const fedexDate = parseFedexDeliveryDate(rate.estimatedDelivery);

  if (fedexDate) {
    return formatDateForDeliveryEstimate(addBusinessDays(fedexDate, productionDays));
  }
  if (serviceDays != null) {
    return formatDateForDeliveryEstimate(addBusinessDays(new Date(), productionDays + serviceDays));
  }
  if (rate.estimatedDelivery && String(rate.estimatedDelivery).trim()) {
    return productionDays > 0
      ? `${String(rate.estimatedDelivery).trim()} + ${productionDays} production business day${productionDays === 1 ? '' : 's'}`
      : String(rate.estimatedDelivery).trim();
  }
  return productionDays > 0
    ? `${productionDays} production business day${productionDays === 1 ? '' : 's'} + FedEx transit`
    : null;
}

module.exports = {
  fedexDeliveryEstimateWithProduction,
  maxProductionTimeBusinessDays,
  productionTimeBusinessDays,
};
