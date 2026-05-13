/**
 * FedEx Rate / Ship APIs often return serviceType values starting with "FEDEX_".
 * Some domestic / SmartPost / overnight codes omit that prefix but are still FedEx REST services.
 * Used so cart lines with a quoted amount are not mistaken for "rate at checkout" / catalog Ground.
 */
const FEDEX_RATE_TYPES_WITHOUT_FEDEX_PREFIX = new Set([
  'GROUND_HOME_DELIVERY',
  'SMART_POST',
  'FIRST_OVERNIGHT',
  'PRIORITY_OVERNIGHT',
  'STANDARD_OVERNIGHT',
  'INTERNATIONAL_PRIORITY',
  'INTERNATIONAL_ECONOMY',
  'INTERNATIONAL_FIRST',
  'REGIONAL_ECONOMY',
  'EUROPE_FIRST_INTERNATIONAL_PRIORITY',
]);

function isPersistedFedexQuotedServiceType(serviceRaw) {
  const s = String(serviceRaw ?? '')
    .trim()
    .toUpperCase();
  if (!s) return false;
  if (s.startsWith('FEDEX_')) return true;
  return FEDEX_RATE_TYPES_WITHOUT_FEDEX_PREFIX.has(s);
}

module.exports = { isPersistedFedexQuotedServiceType };
