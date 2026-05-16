const DEFAULT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const OPEN_SALES_TAX_URL = 'https://api.opensalestax.org/v1/rates';

const rateCache = new Map();

function roundMoney2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function normalizeZip5(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{5})(?:-\d{4})?$/);
  return match ? match[1] : null;
}

function invalidPostalCodeError() {
  const err = new Error('Invalid postal code');
  err.statusCode = 400;
  err.code = 'INVALID_POSTAL_CODE';
  return err;
}

function missingPostalCodeError() {
  const err = new Error('A default shipping address with ZIP/postal code is required for tax calculation.');
  err.statusCode = 400;
  err.code = 'MISSING_POSTAL_CODE';
  return err;
}

function parseCombinedRatePct(data) {
  const pct = Number(data?.combined_rate_pct);
  if (!Number.isFinite(pct) || pct < 0) return null;
  return pct;
}

async function fetchOpenSalesTaxRate(zip5) {
  const url = `${OPEN_SALES_TAX_URL}?zip5=${encodeURIComponent(zip5)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(data?.message || data?.error || `OpenSalesTax request failed (${response.status})`);
    err.statusCode = response.status;
    throw err;
  }
  const combinedPct = parseCombinedRatePct(data);
  if (combinedPct == null) {
    throw invalidPostalCodeError();
  }
  return {
    zip5,
    taxRate: combinedPct / 100,
    taxPercentage: combinedPct,
    jurisdictions: Array.isArray(data?.jurisdictions) ? data.jurisdictions : [],
    coverageWarning: data?.coverage_warning ?? null,
    disclaimer: data?.disclaimer ?? null,
  };
}

async function getRateByPostalCode(postalCode, options = {}) {
  const zip5 = normalizeZip5(postalCode);
  if (!zip5) {
    throw postalCode ? invalidPostalCodeError() : missingPostalCodeError();
  }

  const now = Date.now();
  const ttlMs = Math.max(0, Number(options.ttlMs ?? process.env.OPEN_SALES_TAX_CACHE_TTL_MS) || DEFAULT_CACHE_TTL_MS);
  const cached = rateCache.get(zip5);
  if (cached && cached.expiresAt > now) {
    return { ...cached.value, cached: true };
  }

  const value = await fetchOpenSalesTaxRate(zip5);
  rateCache.set(zip5, { value, expiresAt: now + ttlMs });
  return { ...value, cached: false };
}

function calculateTaxTotals({ subtotal, shipping, taxRate, taxPercentage, name = 'OpenSalesTax' }) {
  const normalizedSubtotal = roundMoney2(subtotal);
  const normalizedShipping = roundMoney2(shipping);
  const preTaxTotal = roundMoney2(normalizedSubtotal + normalizedShipping);
  const safeRate = Number.isFinite(Number(taxRate)) && Number(taxRate) >= 0 ? Number(taxRate) : 0;
  const pct =
    Number.isFinite(Number(taxPercentage)) && Number(taxPercentage) >= 0
      ? Number(taxPercentage)
      : safeRate * 100;
  const taxAmount = roundMoney2(preTaxTotal * safeRate);
  return {
    subtotal: normalizedSubtotal,
    shipping: normalizedShipping,
    preTaxTotal,
    tax: {
      id: null,
      name,
      percentage: pct,
      rate: safeRate,
      amount: taxAmount,
    },
    total: roundMoney2(preTaxTotal + taxAmount),
  };
}

async function computeDynamicTaxAndTotal(subtotal, shipping, postalCode) {
  try {
    const rate = await getRateByPostalCode(postalCode);
    return {
      ...calculateTaxTotals({
        subtotal,
        shipping,
        taxRate: rate.taxRate,
        taxPercentage: rate.taxPercentage,
      }),
      taxRate: rate,
      success: true,
    };
  } catch (error) {
    if (error?.code === 'INVALID_POSTAL_CODE' || error?.code === 'MISSING_POSTAL_CODE') {
      throw error;
    }
    console.warn('[tax] OpenSalesTax failed; falling back to 0 tax:', error.message);
    return {
      ...calculateTaxTotals({ subtotal, shipping, taxRate: 0, taxPercentage: 0 }),
      taxRate: null,
      success: true,
      warning: 'Tax service unavailable; tax set to 0.',
    };
  }
}

module.exports = {
  normalizeZip5,
  getRateByPostalCode,
  calculateTaxTotals,
  computeDynamicTaxAndTotal,
};
