const fs = require('fs').promises;
const path = require('path');
const storeAddressRepository = require('../repositories/storeAddressRepository');

const FEDEX_API_URL = () =>
  (process.env.FEDEX_API_URL || 'https://apis-sandbox.fedex.com').replace(/\/+$/, '');
const FEDEX_API_KEY = () => String(process.env.FEDEX_API_KEY || '').trim();
const FEDEX_API_SECRET = () => String(process.env.FEDEX_API_SECRET || '').trim();
const FEDEX_ACCOUNT_NUMBER = () => String(process.env.FEDEX_ACCOUNT_NUMBER || '').trim();

const DEFAULT_RATE_SERVICE_PROBES = [
  'FEDEX_GROUND',
  'GROUND_HOME_DELIVERY',
  'FEDEX_2_DAY',
  'FEDEX_EXPRESS_SAVER',
  'STANDARD_OVERNIGHT',
  'PRIORITY_OVERNIGHT',
  'FIRST_OVERNIGHT',
];

const STORE_ADDRESS_REQUIRED_MESSAGE = 'Shipping will be available once admin add store address.';

let cachedToken = null;
let tokenExpiresAt = 0;
const rateQuoteCache = new Map();

function fedexRateCacheTtlMs() {
  const n = Number(process.env.FEDEX_RATE_CACHE_TTL_MS);
  if (!Number.isFinite(n)) return 10 * 60 * 1000;
  return Math.max(0, Math.round(n));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function rateQuoteCacheKey({ shipperAddr, recipientAddr, packages, serviceType = '' }) {
  return stableJson({
    shipperAddr,
    recipientAddr,
    packages,
    serviceType: String(serviceType || '').trim().toUpperCase(),
  });
}

function getCachedRates(key) {
  const hit = rateQuoteCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    rateQuoteCache.delete(key);
    return null;
  }
  return hit.rates;
}

function setCachedRates(key, rates) {
  const ttl = fedexRateCacheTtlMs();
  if (ttl <= 0) return;
  rateQuoteCache.set(key, {
    expiresAt: Date.now() + ttl,
    rates: Array.isArray(rates) ? rates : [],
  });
}

function ensureFedexEnv() {
  if (!FEDEX_API_KEY() || !FEDEX_API_SECRET() || !FEDEX_ACCOUNT_NUMBER()) {
    throw new Error(
      'FedEx configuration missing. Set FEDEX_API_KEY, FEDEX_API_SECRET, and FEDEX_ACCOUNT_NUMBER.'
    );
  }
}

function safeRateNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'object') {
    const nested = v.amount ?? v.value;
    if (nested != null) return safeRateNumber(nested);
  }
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getAccessToken() {
  ensureFedexEnv();
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 30_000) return cachedToken;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: FEDEX_API_KEY(),
    client_secret: FEDEX_API_SECRET(),
    account_number: FEDEX_ACCOUNT_NUMBER(),
  });

  const res = await fetch(`${FEDEX_API_URL()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FedEx OAuth failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  cachedToken = json.access_token;
  tokenExpiresAt = now + (Number(json.expires_in) || 3600) * 1000;
  return cachedToken;
}

async function fedexRequest(apiPath, payload, options = {}) {
  const { retryOnceOn5xx = false } = options;

  async function doOnce() {
    const token = await getAccessToken();
    const res = await fetch(`${FEDEX_API_URL()}${apiPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-locale': 'en_US',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (!res.ok) {
      const detail = Array.isArray(json?.errors)
        ? json.errors
            .map((e) => {
              const msg = String(e?.message || '').trim();
              const code = String(e?.code || '').trim();
              if (!msg && !code) return '';
              return code ? `${code}: ${msg}` : msg;
            })
            .filter(Boolean)
            .join(' | ')
        : text.slice(0, 500);
      const err = new Error(`FedEx ${apiPath} failed (${res.status}): ${detail || 'Unknown error'}`);
      err.statusCode = res.status;
      throw err;
    }
    return json;
  }

  try {
    return await doOnce();
  } catch (e) {
    const code = Number(e?.statusCode);
    const transient =
      retryOnceOn5xx &&
      Number.isFinite(code) &&
      (code === 429 || (code >= 500 && code < 600));
    if (transient) {
      const waitMs = code === 429 ? 700 : 450;
      await new Promise((r) => setTimeout(r, waitMs));
      return await doOnce();
    }
    throw e;
  }
}

function normalizePackages(packages) {
  const list = Array.isArray(packages) ? packages : [];
  return list.map((p, idx) => {
    const weight = Number(p?.weight);
    const length = Number(p?.length);
    const width = Number(p?.width);
    const height = Number(p?.height);
    return {
      sequenceNumber: String(idx + 1),
      groupPackageCount: 1,
      weight: {
        units: 'LB',
        value: String(Number.isFinite(weight) && weight > 0 ? weight : 1),
      },
      dimensions: {
        units: 'IN',
        length: Number.isFinite(length) && length > 0 ? Math.round(length) : 12,
        width: Number.isFinite(width) && width > 0 ? Math.round(width) : 10,
        height: Number.isFinite(height) && height > 0 ? Math.round(height) : 6,
      },
    };
  });
}

/** FedEx Rate API expects full addresses; streetLines are required for reliable US domestic quotes. */
function normalizeCountryCode(c) {
  const x = String(c || '').trim();
  if (!x) return 'US';
  if (x.toLowerCase() === 'united states') return 'US';
  if (x.length === 2) return x.toUpperCase();
  return 'US';
}

function storeAddressToFedexAddress(address) {
  if (!address) return null;
  return {
    streetLines: [address.street_address, address.address_line2].map((s) => String(s || '').trim()).filter(Boolean),
    city: String(address.city || '').trim(),
    stateOrProvinceCode: String(address.state || '').trim().toUpperCase().slice(0, 2),
    postalCode: String(address.postcode || '').trim(),
    countryCode: normalizeCountryCode(address.country),
  };
}

function requiredDefaultStoreAddressError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

async function getDefaultStoreAddress() {
  try {
    return await storeAddressRepository.findDefault();
  } catch (error) {
    console.warn('[FedEx] Could not load default store address:', error?.message || error);
    throw requiredDefaultStoreAddressError(STORE_ADDRESS_REQUIRED_MESSAGE);
  }
}

async function buildShipperAddressForRating() {
  const storeAddress = await getDefaultStoreAddress();
  const dynamicAddress = storeAddressToFedexAddress(storeAddress);
  if (dynamicAddress?.streetLines?.length && dynamicAddress.city && dynamicAddress.postalCode) {
    return dynamicAddress;
  }
  throw requiredDefaultStoreAddressError(STORE_ADDRESS_REQUIRED_MESSAGE);
}

async function buildShipperContactAndAddressForShipment() {
  const storeAddress = await getDefaultStoreAddress();
  const address = storeAddressToFedexAddress(storeAddress);
  if (address?.streetLines?.length && address.city && address.postalCode) {
    const shipperName = String(storeAddress.contact_name || storeAddress.company || storeAddress.label || '').trim();
    const shipperPhone = String(storeAddress.phone || '').replace(/\D/g, '').slice(0, 15);
    if (!shipperName || !shipperPhone) {
      throw requiredDefaultStoreAddressError(STORE_ADDRESS_REQUIRED_MESSAGE);
    }
    return {
      contact: {
        personName: shipperName.slice(0, 35),
        phoneNumber: shipperPhone,
        ...(storeAddress.company ? { companyName: String(storeAddress.company).slice(0, 35) } : {}),
      },
      address,
    };
  }
  throw requiredDefaultStoreAddressError(STORE_ADDRESS_REQUIRED_MESSAGE);
}

async function ensureDefaultShipperStoreAddress() {
  await buildShipperContactAndAddressForShipment();
}

function buildRecipientAddressForRating(destinationInput) {
  const postalCode = String(destinationInput?.postalCode || '').trim();
  const countryCode = String(destinationInput?.countryCode || 'US').trim().toUpperCase();
  const stateOrProvinceCode = String(destinationInput?.stateOrProvinceCode || '').trim().toUpperCase();
  const city = String(destinationInput?.city || '').trim();
  const fromArray =
    Array.isArray(destinationInput?.streetLines) && destinationInput.streetLines.length > 0
      ? destinationInput.streetLines.map((s) => String(s).trim()).filter(Boolean).slice(0, 2)
      : [];
  const single = String(
    destinationInput?.streetLine || destinationInput?.streetAddress || ''
  ).trim();
  const streetLines =
    fromArray.length > 0 ? fromArray : single ? [single] : ['100 Commerce St'];
  return {
    streetLines,
    ...(city ? { city } : {}),
    ...(stateOrProvinceCode.length >= 2 ? { stateOrProvinceCode: stateOrProvinceCode.slice(0, 2) } : {}),
    postalCode,
    countryCode: countryCode.length === 2 ? countryCode : 'US',
  };
}

function rateServiceProbes() {
  const raw = String(process.env.FEDEX_RATE_SERVICE_PROBES || '').trim();
  const list = raw
    ? raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    : DEFAULT_RATE_SERVICE_PROBES;
  return [...new Set(list)];
}

/** Delay between FedEx rate probe calls to reduce sandbox throttling (ms). Default 90; max 500; set 0 to disable pause. */
function fedexRateProbeDelayMs() {
  const raw = process.env.FEDEX_RATE_PROBE_DELAY_MS;
  if (raw == null || String(raw).trim() === '') return 90;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 90;
  return Math.min(500, Math.max(0, Math.round(n)));
}

/** Log failed per-service rate probes when set (e.g. FEDEX_RATES_DEBUG=1 or true). */
function fedexRatesDebugEnabled() {
  const raw = String(process.env.FEDEX_RATES_DEBUG || process.env.DEBUG_FEDEX_RATES || '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function buildRatePayload({ shipperAddr, recipientAddr, packages, totalPackageCount, shipDatestamp, serviceType }) {
  const requestedShipment = {
    shipDatestamp,
    shipper: {
      address: { ...shipperAddr, residential: false },
    },
    recipient: {
      address: { ...recipientAddr, residential: false },
    },
    ...(serviceType ? { serviceType } : {}),
    packagingType: 'YOUR_PACKAGING',
    pickupType: 'USE_SCHEDULED_PICKUP',
    rateRequestType: ['ACCOUNT', 'LIST'],
    totalPackageCount,
    requestedPackageLineItems: packages,
  };

  return {
    accountNumber: { value: FEDEX_ACCOUNT_NUMBER() },
    carrierCodes: ['FDXE', 'FDXG'],
    requestedShipment,
  };
}

function ratesFromFedexResponse(data) {
  const rateReplyDetails = Array.isArray(data?.output?.rateReplyDetails)
    ? data.output.rateReplyDetails
    : [];

  return rateReplyDetails
    .map((rd) => {
      const candidateDetails = Array.isArray(rd?.ratedShipmentDetails) ? rd.ratedShipmentDetails : [];
      const bestRated = candidateDetails
        .map((d) => {
          const shipmentRateDetail = d?.shipmentRateDetail || {};
          return {
            amount:
              safeRateNumber(shipmentRateDetail.totalNetCharge) ??
              safeRateNumber(shipmentRateDetail.totalNetFedExCharge) ??
              safeRateNumber(d?.totalNetCharge) ??
              safeRateNumber(d?.totalNetFedExCharge),
            currency:
              shipmentRateDetail.totalNetCharge?.currency ||
              shipmentRateDetail.totalNetFedExCharge?.currency ||
              d?.totalNetCharge?.currency ||
              d?.totalNetFedExCharge?.currency ||
              'USD',
          };
        })
        .find((x) => x.amount != null);

      const serviceType = String(rd?.serviceType || '').trim();
      const serviceName = String(rd?.serviceName || rd?.serviceType || '').trim();
      const estimatedDelivery = rd?.commit?.dateDetail?.dayFormat || rd?.deliveryTimestamp || null;

      return {
        serviceType,
        serviceName,
        totalCharge: bestRated?.amount ?? 0,
        currency: bestRated?.currency || 'USD',
        estimatedDelivery,
      };
    })
    .filter((r) => r.serviceType && Number.isFinite(r.totalCharge));
}

function mergeFedexRates(rateGroups) {
  const byService = new Map();
  for (const rates of rateGroups) {
    if (!Array.isArray(rates)) continue;
    for (const rate of rates) {
      const key = String(rate?.serviceType || '').trim().toUpperCase();
      if (!key) continue;
      const existing = byService.get(key);
      if (!existing || Number(rate.totalCharge) < Number(existing.totalCharge)) {
        byService.set(key, rate);
      }
    }
  }
  return Array.from(byService.values()).sort((a, b) => Number(a.totalCharge) - Number(b.totalCharge));
}

async function getRateQuotes(destinationInput, packagesInput) {
  const recipientAddr = buildRecipientAddressForRating(destinationInput);
  const postalCode = recipientAddr.postalCode;
  if (!postalCode) {
    throw new Error('destination.postalCode is required');
  }
  const packages = normalizePackages(packagesInput);
  const shipperAddr = await buildShipperAddressForRating();

  /** Without carrierCodes, FedEx may evaluate freight/SmartPost paths that reject YOUR_PACKAGING and return SERVICE.PACKAGING.COMBINATION.INVALID. */
  const totalPackageCount = packages.reduce(
    (sum, line) => sum + (Number(line.groupPackageCount) > 0 ? Number(line.groupPackageCount) : 1),
    0
  );
  const shipDatestamp = new Date().toISOString().slice(0, 10);
  const cacheKey = rateQuoteCacheKey({ shipperAddr, recipientAddr, packages });
  const cachedRates = getCachedRates(cacheKey);
  if (cachedRates) return cachedRates;

  const basePayload = buildRatePayload({
    shipperAddr,
    recipientAddr,
    packages,
    totalPackageCount,
    shipDatestamp,
  });
  const baseData = await fedexRequest('/rate/v1/rates/quotes', basePayload, { retryOnceOn5xx: true });
  const baseRates = ratesFromFedexResponse(baseData);

  /** Sequential probes + spacing: parallel bursts often lose most services on sandbox (429/throttle). */
  const probes = rateServiceProbes();
  const probeDelayMs = fedexRateProbeDelayMs();
  const debugRates = fedexRatesDebugEnabled();
  const probeRateArrays = [];
  for (let i = 0; i < probes.length; i += 1) {
    const serviceType = probes[i];
    if (probeDelayMs > 0 && i > 0) {
      await new Promise((r) => setTimeout(r, probeDelayMs));
    }
    try {
      const payload = buildRatePayload({
        shipperAddr,
        recipientAddr,
        packages,
        totalPackageCount,
        shipDatestamp,
        serviceType,
      });
      const data = await fedexRequest('/rate/v1/rates/quotes', payload, { retryOnceOn5xx: true });
      probeRateArrays.push(ratesFromFedexResponse(data));
    } catch (e) {
      if (debugRates) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[FedEx rates] probe ${serviceType} failed:`, msg);
      }
    }
  }

  const mergedRates = mergeFedexRates([baseRates, ...probeRateArrays]);
  setCachedRates(cacheKey, mergedRates);
  for (const rate of mergedRates) {
    const serviceType = String(rate?.serviceType || '').trim().toUpperCase();
    if (serviceType) {
      setCachedRates(rateQuoteCacheKey({ shipperAddr, recipientAddr, packages, serviceType }), [rate]);
    }
  }
  return mergedRates;
}

async function getRateQuoteForService(destinationInput, packagesInput, serviceTypeInput) {
  const serviceType = String(serviceTypeInput || '').trim().toUpperCase();
  if (!serviceType) return null;
  const recipientAddr = buildRecipientAddressForRating(destinationInput);
  if (!recipientAddr.postalCode) {
    throw new Error('destination.postalCode is required');
  }
  const packages = normalizePackages(packagesInput);
  const shipperAddr = await buildShipperAddressForRating();
  const serviceCacheKey = rateQuoteCacheKey({ shipperAddr, recipientAddr, packages, serviceType });
  const cachedServiceRates = getCachedRates(serviceCacheKey);
  if (cachedServiceRates?.length) return cachedServiceRates[0];

  const allRatesCacheKey = rateQuoteCacheKey({ shipperAddr, recipientAddr, packages });
  const cachedAllRates = getCachedRates(allRatesCacheKey);
  const cachedRate = cachedAllRates?.find(
    (rate) => String(rate?.serviceType || '').trim().toUpperCase() === serviceType
  );
  if (cachedRate) {
    setCachedRates(serviceCacheKey, [cachedRate]);
    return cachedRate;
  }

  const totalPackageCount = packages.reduce(
    (sum, line) => sum + (Number(line.groupPackageCount) > 0 ? Number(line.groupPackageCount) : 1),
    0
  );
  const payload = buildRatePayload({
    shipperAddr,
    recipientAddr,
    packages,
    totalPackageCount,
    shipDatestamp: new Date().toISOString().slice(0, 10),
    serviceType,
  });
  const data = await fedexRequest('/rate/v1/rates/quotes', payload, { retryOnceOn5xx: true });
  const rate = ratesFromFedexResponse(data).find(
    (candidate) => String(candidate?.serviceType || '').trim().toUpperCase() === serviceType
  );
  if (rate) {
    setCachedRates(serviceCacheKey, [rate]);
    return rate;
  }
  return null;
}

function parseGuestCheckout(order) {
  let gc = order?.guest_checkout;
  if (gc == null) return null;
  if (typeof gc === 'string') {
    try {
      return JSON.parse(gc);
    } catch {
      return null;
    }
  }
  return typeof gc === 'object' ? gc : null;
}

function recipientFromOrderRow(order) {
  const usa = normalizeCountryCode;
  const linesFrom = (street1, street2) => {
    const a = String(street1 || '').trim();
    const b = String(street2 || '').trim();
    const out = [a, b].filter(Boolean);
    return out.length ? out : ['Address on file'];
  };

  const build = (street1, street2, city, state, postal, country) => {
    const pc = String(postal || '').trim();
    if (!pc) return null;
    const st = String(state || '').trim().toUpperCase();
    return {
      contact: {
        personName: String(order.user_name || order.user_email || 'Recipient').slice(0, 35),
        phoneNumber: String(process.env.FEDEX_RECIPIENT_DEFAULT_PHONE || '9015550123')
          .replace(/\D/g, '')
          .slice(0, 15) || '9015550123',
      },
      address: {
        streetLines: linesFrom(street1, street2),
        city: String(city || '').trim() || 'City',
        ...(st.length >= 2 ? { stateOrProvinceCode: st.slice(0, 2) } : {}),
        postalCode: pc,
        countryCode: usa(country),
      },
    };
  };

  if (String(order.shipping_postcode || '').trim()) {
    return build(
      order.shipping_street_address,
      order.shipping_address_line2,
      order.shipping_city,
      order.shipping_state,
      order.shipping_postcode,
      order.shipping_country
    );
  }
  if (String(order.billing_postcode || '').trim()) {
    return build(
      order.billing_street_address,
      order.billing_address_line2,
      order.billing_city,
      order.billing_state,
      order.billing_postcode,
      order.billing_country
    );
  }
  const gc = parseGuestCheckout(order);
  const sh = gc?.shippingAddress || gc?.shipping_address;
  if (sh) {
    return build(
      sh.streetAddress || sh.street_address,
      sh.addressLine2 || sh.address_line2,
      sh.city,
      sh.state,
      sh.postcode || sh.postalCode,
      sh.country
    );
  }
  return null;
}

function packagesFromOrderItems(items) {
  const list = Array.isArray(items) ? items : [];
  let qty = 0;
  for (const line of list) {
    qty += Math.max(1, parseInt(String(line.quantity ?? 1), 10) || 1);
  }
  const w = Math.max(1, qty);
  return [
    {
      weight: { units: 'LB', value: String(w) },
      dimensions: { length: 12, width: 10, height: 6, units: 'IN' },
    },
  ];
}

async function saveFedexLabelPdf(orderId, base64Pdf) {
  const dir = path.join(__dirname, '..', '..', 'uploads', 'labels');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${orderId}.pdf`);
  await fs.writeFile(file, Buffer.from(String(base64Pdf || ''), 'base64'));
  return `/uploads/labels/${orderId}.pdf`;
}

async function createShipment(order) {
  ensureFedexEnv();
  const serviceType = String(order.carrier_service_type || '').trim();
  if (!serviceType) {
    throw new Error('Order is missing carrier_service_type (FedEx service type).');
  }
  const recipient = recipientFromOrderRow(order);
  if (!recipient) {
    throw new Error('Ship-to address is missing for this order.');
  }
  const requestedPackageLineItems = packagesFromOrderItems(order.items);
  const shipper = await buildShipperContactAndAddressForShipment();
  const payload = {
    labelResponseOptions: 'LABEL',
    accountNumber: { value: FEDEX_ACCOUNT_NUMBER() },
    requestedShipment: {
      shipDatestamp: new Date().toISOString().slice(0, 10),
      serviceType,
      packagingType: 'YOUR_PACKAGING',
      pickupType: 'USE_SCHEDULED_PICKUP',
      blockInsightVisibility: false,
      shippingChargesPayment: { paymentType: 'SENDER' },
      labelSpecification: {
        imageType: 'PDF',
        labelStockType: 'PAPER_85X11_TOP_HALF_LABEL',
      },
      shipper,
      recipients: [recipient],
      requestedPackageLineItems,
    },
  };

  const data = await fedexRequest('/ship/v1/shipments', payload, { retryOnceOn5xx: true });
  const ts = data?.output?.transactionShipments?.[0];
  const piece = Array.isArray(ts?.pieceResponses) ? ts.pieceResponses[0] : null;
  const trackingNumber =
    String(ts?.masterTrackingNumber || '').trim() ||
    String(piece?.trackingNumber || '').trim() ||
    '';
  const pkgDoc = Array.isArray(piece?.packageDocuments) ? piece.packageDocuments[0] : null;
  const fromShipmentDocs = Array.isArray(ts?.shipmentDocuments)
    ? ts.shipmentDocuments.find((d) => String(d?.contentType || '').toLowerCase().includes('pdf'))
    : null;
  const labelEncoded =
    pkgDoc?.encodedLabel || fromShipmentDocs?.encodedLabel || pkgDoc?.url || fromShipmentDocs?.url || null;

  if (!trackingNumber) {
    throw new Error('FedEx Ship response did not include a tracking number.');
  }

  const master = String(ts?.masterTrackingNumber || trackingNumber).trim();
  const shipmentId = String(data?.output?.jobId || master).slice(0, 128);

  return {
    trackingNumber,
    masterTrackingNumber: master,
    labelEncoded,
    shipmentId,
  };
}

async function trackShipment(trackingNumber) {
  ensureFedexEnv();
  const tn = String(trackingNumber || '').trim();
  if (!tn) throw new Error('trackingNumber is required');
  const payload = {
    includeDetailedScans: true,
    trackingInfo: [{ trackingNumberInfo: { trackingNumber: tn } }],
  };
  const data = await fedexRequest('/track/v1/trackingnumbers', payload, { retryOnceOn5xx: true });
  const complete = data?.output?.completeTrackResults?.[0]?.trackResults?.[0];
  const scanEvents = Array.isArray(complete?.scanEvents) ? complete.scanEvents : [];
  const latestEvent = scanEvents.length > 0 ? scanEvents[0] : null;
  const status =
    String(complete?.latestStatusDetail?.description || complete?.serviceCommitMessage || '').trim() ||
    String(latestEvent?.eventDescription || '').trim() ||
    'Unknown';
  const deliveryDate =
    complete?.dateAndTimes?.find((t) => String(t?.type || '').includes('ACTUAL_DELIVERY'))?.dateTime || null;

  return {
    status,
    latestEvent,
    deliveryDate,
  };
}

module.exports = {
  getRateQuotes,
  getRateQuoteForService,
  ensureDefaultShipperStoreAddress,
  createShipment,
  trackShipment,
  saveFedexLabelPdf,
};
