/**
 * Builds one consolidated FedEx rating package from cart lines.
 * Hardware products (hardware_template_id + shipping_* on line or pricing_snapshot)
 * use DB dimensions and shipping_weight × billable qty.
 * Standard products use product length/weight plus customer-entered width/height.
 */

function billableQtyFromItem(item) {
  const jobs = Array.isArray(item?.jobs) ? item.jobs : [];
  if (jobs.length > 0) {
    return jobs.reduce((sum, j) => sum + Math.max(1, Number(j.quantity) || 1), 0);
  }
  return Math.max(1, Number(item?.quantity) || 1);
}

function isStorePickupLine(item) {
  const mode = String(item?.shippingMode ?? item?.shipping_mode ?? '').trim().toLowerCase();
  if (mode === 'store_pickup' || mode === 'store-pickup' || mode === 'store pickup') return true;
  const ship = String(item?.shipping ?? '').trim().toLowerCase();
  if (ship === 'store-pickup' || ship === 'store_pickup') return true;
  const pid = item?.storePickupAddressId ?? item?.store_pickup_address_id;
  return pid != null && String(pid) !== '';
}

function parsePositiveNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hardwareShippingFromCartLine(item) {
  const snap = item?.pricing_snapshot && typeof item.pricing_snapshot === 'object' ? item.pricing_snapshot : {};
  const htRaw = item?.hardware_template_id ?? item?.hardwareTemplateId ?? snap.hardware_template_id ?? snap.hardwareTemplateId;
  if (htRaw == null || String(htRaw).trim() === '') return null;
  const htNum = Number(htRaw);
  if (!Number.isFinite(htNum)) return null;

  const pick = (snake, camel) =>
    item?.[snake] ?? item?.[camel] ?? snap[snake] ?? snap[camel];

  const sl = parsePositiveNumber(pick('shipping_length', 'shippingLength'));
  const sw = parsePositiveNumber(pick('shipping_width', 'shippingWidth'));
  const sh = parsePositiveNumber(pick('shipping_height', 'shippingHeight'));
  const swt = parsePositiveNumber(pick('shipping_weight', 'shippingWeight'));
  if (!sl || !sw || !sh || !swt) return null;

  return { length: sl, width: sw, height: sh, weightPerUnit: swt };
}

function buildFedexPackagesFromShippableCartItems(cartItems) {
  const shippable = (Array.isArray(cartItems) ? cartItems : []).filter((i) => !isStorePickupLine(i));
  if (shippable.length === 0) {
    return [{ weight: 1, length: 12, width: 10, height: 6 }];
  }

  let maxLen = 0;
  let maxWid = 0;
  let maxHt = 0;
  let sumWeight = 0;

  for (const item of shippable) {
    const qty = billableQtyFromItem(item);
    const hw = hardwareShippingFromCartLine(item);
    if (hw) {
      maxLen = Math.max(maxLen, Math.ceil(hw.length));
      maxWid = Math.max(maxWid, Math.ceil(hw.width));
      maxHt = Math.max(maxHt, Math.ceil(hw.height));
      sumWeight += hw.weightPerUnit * qty;
    } else {
      const w = Number(item.width ?? item.width_inches) || 0;
      const h = Number(item.height ?? item.height_inches) || 0;
      const storedLength = parsePositiveNumber(item.shipping_length ?? item.shippingLength);
      const storedWeight = parsePositiveNumber(item.shipping_weight ?? item.shippingWeight);
      maxLen = Math.max(maxLen, storedLength != null ? Math.ceil(storedLength) : 12);
      maxWid = Math.max(maxWid, w > 0 ? Math.max(1, Math.ceil(w)) : 10);
      maxHt = Math.max(maxHt, h > 0 ? Math.max(1, Math.ceil(h)) : 6);
      sumWeight += (storedWeight != null ? storedWeight : 1) * qty;
    }
  }

  const length = maxLen > 0 ? maxLen : 12;
  const width = maxWid > 0 ? maxWid : 10;
  const height = maxHt > 0 ? maxHt : 6;
  const roundedWt = Math.round(sumWeight * 100) / 100;
  const weight = Math.max(1, roundedWt);

  return [{ weight, length, width, height }];
}

module.exports = {
  buildFedexPackagesFromShippableCartItems,
};
