const shippingRatesRepository = require('../repositories/shippingRatesRepository');
const taxRepository = require('../repositories/taxRepository');

function roundMoney2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function normalizeShippingMode(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'store_pickup' || s === 'store-pickup') return 'store_pickup';
  return 'blind_drop_ship';
}

function isCartLineStorePickup(item) {
  const mode = normalizeShippingMode(item.shippingMode ?? item.shipping_mode ?? '');
  if (mode === 'store_pickup') return true;
  const ship = String(item.shipping ?? '').trim().toLowerCase();
  if (ship === 'store-pickup' || ship === 'store_pickup') return true;
  const pid = item.storePickupAddressId ?? item.store_pickup_address_id;
  if (pid != null && String(pid) !== '') return true;
  return false;
}

function isFedexServiceType(svcRaw) {
  const s = String(svcRaw || '').trim().toUpperCase();
  return s.startsWith('FEDEX_');
}

async function aggregateShippingFromCartItems(cartItems) {
  const seenKeys = new Set();
  let mergedSum = 0;
  const labels = [];
  let carrierServiceTypeFedex = null;
  let shippingEstimatedDelivery = null;
  for (const i of cartItems) {
    if (isCartLineStorePickup(i)) continue;
    const svcRaw = String(i.shippingService ?? i.shipping_service ?? '').trim();
    if (!svcRaw) continue;
    const key = svcRaw.toLowerCase();
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const explicitAmountRaw = i.shippingRateAmount ?? i.shipping_rate_amount;
    const explicitAmount = Number(explicitAmountRaw);
    const fedex = isFedexServiceType(svcRaw);
    let price;
    if (fedex) {
      price = Number.isFinite(explicitAmount) ? explicitAmount : 0;
    } else if (Number.isFinite(explicitAmount)) {
      price = explicitAmount;
    } else {
      price = await shippingRatesRepository.findPriceByServiceName(svcRaw);
    }
    mergedSum += roundMoney2(price);
    const label = String(
      i.shippingRateServiceName ?? i.shipping_rate_service_name ?? svcRaw
    ).trim();
    if (label) labels.push(label);
    if (fedex && !carrierServiceTypeFedex) {
      carrierServiceTypeFedex = svcRaw;
      const etaRaw = i.shippingRateEstimatedDelivery ?? i.shipping_rate_estimated_delivery;
      if (etaRaw != null && String(etaRaw).trim() !== '') {
        shippingEstimatedDelivery = String(etaRaw).trim();
      }
    }
  }
  const dedupedLabels = [...new Set(labels)];
  return {
    shippingSum: roundMoney2(mergedSum),
    shippingMethod: dedupedLabels.length === 0 ? null : dedupedLabels.join(', '),
    shippingCharge: roundMoney2(mergedSum),
    carrier: carrierServiceTypeFedex ? 'fedex' : null,
    carrierServiceType: carrierServiceTypeFedex,
    shippingEstimatedDelivery,
  };
}

async function computeShippingFromCartItems(cartItems) {
  const modeSet = new Set(cartItems.map((i) => normalizeShippingMode(i.shippingMode ?? i.shipping_mode)));
  const shippingMode = modeSet.size === 1 ? Array.from(modeSet)[0] : 'blind_drop_ship';
  if (shippingMode === 'store_pickup') {
    const rawPickup = cartItems[0]?.storePickupAddressId ?? cartItems[0]?.store_pickup_address_id;
    const parsedPickup = rawPickup != null && rawPickup !== '' ? parseInt(String(rawPickup), 10) : NaN;
    return {
      shippingMode,
      shippingSum: 0,
      shippingMethod: 'Store Pickup',
      shippingCharge: 0,
      carrier: null,
      carrierServiceType: null,
      shippingEstimatedDelivery: null,
      storePickupAddressId: Number.isNaN(parsedPickup) ? null : parsedPickup,
      applyFreeShipping() {
        return { shippingSum: 0, shippingCharge: 0 };
      },
    };
  }
  const agg = await aggregateShippingFromCartItems(cartItems);
  const policy = await shippingRatesRepository.getRates();
  let shippingSum = agg.shippingSum;
  let shippingCharge = agg.shippingCharge;
  return {
    shippingMode,
    shippingSum,
    shippingMethod: agg.shippingMethod,
    shippingCharge,
    carrier: agg.carrier ?? null,
    carrierServiceType: agg.carrierServiceType ?? null,
    shippingEstimatedDelivery: agg.shippingEstimatedDelivery ?? null,
    freeShippingEnabled: !!policy.freeShippingEnabled,
    freeShippingThreshold: roundMoney2(policy.freeShippingThreshold),
    applyFreeShipping(subtotal) {
      if (policy.freeShippingEnabled && roundMoney2(subtotal) >= roundMoney2(policy.freeShippingThreshold)) {
        shippingSum = 0;
        shippingCharge = 0;
      }
      return { shippingSum, shippingCharge };
    },
  };
}

async function computeTaxAndTotal(subtotal, shipping) {
  const normalizedSubtotal = roundMoney2(subtotal);
  const normalizedShipping = roundMoney2(shipping);
  const preTaxTotal = roundMoney2(normalizedSubtotal + normalizedShipping);
  const activeTax = await taxRepository.getActiveTax();
  const taxPercentage = activeTax ? Number(activeTax.percentage) || 0 : 0;
  const taxAmount = roundMoney2(preTaxTotal * (taxPercentage / 100));
  const total = roundMoney2(preTaxTotal + taxAmount);
  return {
    subtotal: normalizedSubtotal,
    shipping: normalizedShipping,
    preTaxTotal,
    tax: {
      id: activeTax?.id ?? null,
      name: activeTax?.name ?? null,
      percentage: taxPercentage,
      amount: taxAmount,
    },
    total,
  };
}

module.exports = {
  roundMoney2,
  computeShippingFromCartItems,
  computeTaxAndTotal,
};
