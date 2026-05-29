/**
 * Builds one consolidated FedEx rating package from cart lines.
 * Hardware products (graphic_scenario_enabled or hardware_template_id + shipping_* on line or snapshot)
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

function shippingBoxRulesFromItem(item) {
  const snap = item?.pricing_snapshot && typeof item.pricing_snapshot === 'object' ? item.pricing_snapshot : {};
  const raw =
    item?.shipping_box_rules ??
    item?.shippingBoxRules ??
    snap.shipping_box_rules ??
    snap.shippingBoxRules;
  return Array.isArray(raw) ? raw : [];
}

function hasActiveShippingBoxRules(item) {
  return shippingBoxRulesFromItem(item).some((rule) => rule?.is_active !== false);
}

function ruleBox(rule) {
  const box = rule?.box && typeof rule.box === 'object' ? rule.box : {};
  const length = parsePositiveNumber(
    box.length ?? box.shipping_length ?? rule?.box_length ?? rule?.length
  );
  const width = parsePositiveNumber(
    box.width ?? box.shipping_width ?? rule?.box_width ?? rule?.width
  );
  const height = parsePositiveNumber(
    box.height ?? box.shipping_height ?? rule?.box_height ?? rule?.height
  );
  if (!length || !width || !height) return null;
  return { length, width, height };
}

function findMatchingShippingBoxRule(item, widthInches, heightInches) {
  const rules = shippingBoxRulesFromItem(item).filter((rule) => rule?.is_active !== false);
  if (rules.length === 0) return null;
  const sorted = [...rules].sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
  const smallestSide =
    widthInches > 0 && heightInches > 0 ? Math.min(widthInches, heightInches) : null;

  if (smallestSide != null) {
    for (const rule of sorted) {
      const min = parsePositiveNumber(rule?.min_smallest_side);
      const max = parsePositiveNumber(rule?.max_smallest_side);
      const minOk = min == null || smallestSide >= min;
      const maxOk = max == null || smallestSide <= max;
      const box = ruleBox(rule);
      if (box && minOk && maxOk) return { ...rule, box };
    }
  }

  for (const rule of sorted) {
    const min = parsePositiveNumber(rule?.min_smallest_side);
    const max = parsePositiveNumber(rule?.max_smallest_side);
    const box = ruleBox(rule);
    if (box && min == null && max == null) return { ...rule, box };
  }
  return null;
}

function weightPerSqftFromItem(item) {
  const snap = item?.pricing_snapshot && typeof item.pricing_snapshot === 'object' ? item.pricing_snapshot : {};
  return parsePositiveNumber(item?.weight_per_sqft ?? item?.weightPerSqft ?? snap.weight_per_sqft ?? snap.weightPerSqft);
}

function unitWeightForBoxRuleItem(item, widthInches, heightInches) {
  const weightPerSqft = weightPerSqftFromItem(item);
  if (weightPerSqft != null && widthInches > 0 && heightInches > 0) {
    return (widthInches * heightInches / 144) * weightPerSqft;
  }
  return parsePositiveNumber(
    item.shipping_weight ??
      item.shippingWeight ??
      item.weight ??
      item.pricing_snapshot?.shipping_weight ??
      item.pricing_snapshot?.shippingWeight
  ) ?? 1;
}

function buildPackagesForMatchedBoxRule(rule, qty, unitWeight) {
  const box = rule?.box;
  if (!box) return [];
  const maxQty = parsePositiveNumber(rule?.max_quantity_per_box);
  const maxWeight = parsePositiveNumber(rule?.max_weight_per_box);
  const totalQty = Math.max(1, Math.trunc(qty));
  const totalWeight = Math.max(1, unitWeight * totalQty);
  const qtyLimit = maxQty != null ? Math.max(1, Math.trunc(maxQty)) : totalQty;
  const boxesByQty = Math.max(1, Math.ceil(totalQty / qtyLimit));
  const boxesByWeight = maxWeight != null ? Math.max(1, Math.ceil(totalWeight / maxWeight)) : 1;
  const boxCount = Math.max(boxesByQty, boxesByWeight);
  const packages = [];
  let remainingWeight = totalWeight;
  for (let i = 0; i < boxCount; i += 1) {
    const remainingBoxes = boxCount - i;
    const idealWeight = remainingWeight / remainingBoxes;
    const cappedWeight = maxWeight != null ? Math.min(maxWeight, idealWeight) : idealWeight;
    const weight = Math.max(1, Math.round(cappedWeight * 100) / 100);
    packages.push({
      weight,
      length: Math.max(1, Math.ceil(box.length)),
      width: Math.max(1, Math.ceil(box.width)),
      height: Math.max(1, Math.ceil(box.height)),
    });
    remainingWeight = Math.max(0, remainingWeight - cappedWeight);
  }
  return packages;
}

function firstActiveShippingBoxRuleWithBox(item) {
  const rules = shippingBoxRulesFromItem(item)
    .filter((rule) => rule?.is_active !== false)
    .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
  if (rules.length === 0) return null;
  const box = ruleBox(rules[0]);
  if (!box) return null;
  return { ...rules[0], box };
}

function isHardwareFedexLine(item) {
  const snap = item?.pricing_snapshot && typeof item.pricing_snapshot === 'object' ? item.pricing_snapshot : {};
  if (item?.graphic_scenario_enabled === true || item?.graphicScenarioEnabled === true) return true;
  if (snap.graphic_scenario_enabled === true || snap.graphicScenarioEnabled === true) return true;
  const htRaw = item?.hardware_template_id ?? item?.hardwareTemplateId ?? snap.hardware_template_id ?? snap.hardwareTemplateId;
  if (htRaw == null || String(htRaw).trim() === '') return false;
  return Number.isFinite(Number(htRaw));
}

function isFixedPriceShippingLine(item) {
  const snap = item?.pricing_snapshot && typeof item.pricing_snapshot === 'object' ? item.pricing_snapshot : {};
  return (
    item?.fixed_price_shipping_only === true ||
    item?.fixedPriceShippingOnly === true ||
    snap.fixed_price_shipping_only === true ||
    snap.fixedPriceShippingOnly === true
  );
}

function hardwareShippingFromCartLine(item) {
  if (!isHardwareFedexLine(item) && !isFixedPriceShippingLine(item)) return null;
  const snap = item?.pricing_snapshot && typeof item.pricing_snapshot === 'object' ? item.pricing_snapshot : {};

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
  const packages = [];

  for (const item of shippable) {
    const qty = billableQtyFromItem(item);
    const itemWidth = Number(item.width ?? item.width_inches) || 0;
    const itemHeight = Number(item.height ?? item.height_inches) || 0;
    const isHardware = isHardwareFedexLine(item) || isFixedPriceShippingLine(item);
    const hw = hardwareShippingFromCartLine(item);
    const matchedRule = isHardware
      ? firstActiveShippingBoxRuleWithBox(item)
      : findMatchingShippingBoxRule(item, itemWidth, itemHeight);
    if (matchedRule) {
      const unitWeight = hw ? hw.weightPerUnit : unitWeightForBoxRuleItem(item, itemWidth, itemHeight);
      packages.push(...buildPackagesForMatchedBoxRule(matchedRule, qty, unitWeight));
      continue;
    }
    if (!isHardware && hasActiveShippingBoxRules(item)) {
      throw new Error('Shipping box is not configured for this size. Please contact admin.');
    }

    if (hw) {
      maxLen = Math.max(maxLen, Math.ceil(hw.length));
      maxWid = Math.max(maxWid, Math.ceil(hw.width));
      maxHt = Math.max(maxHt, Math.ceil(hw.height));
      sumWeight += hw.weightPerUnit * qty;
    } else {
      const storedLength = parsePositiveNumber(item.shipping_length ?? item.shippingLength);
      const storedWeight = parsePositiveNumber(item.shipping_weight ?? item.shippingWeight);
      maxLen = Math.max(maxLen, storedLength != null ? Math.ceil(storedLength) : 12);
      maxWid = Math.max(maxWid, itemWidth > 0 ? Math.max(1, Math.ceil(itemWidth)) : 10);
      maxHt = Math.max(maxHt, itemHeight > 0 ? Math.max(1, Math.ceil(itemHeight)) : 6);
      sumWeight += (storedWeight != null ? storedWeight : 1) * qty;
    }
  }

  const length = maxLen > 0 ? maxLen : 12;
  const width = maxWid > 0 ? maxWid : 10;
  const height = maxHt > 0 ? maxHt : 6;
  const roundedWt = Math.round(sumWeight * 100) / 100;
  const weight = Math.max(1, roundedWt);

  if (sumWeight > 0 || packages.length === 0) {
    packages.push({ weight, length, width, height });
  }
  return packages;
}

module.exports = {
  buildFedexPackagesFromShippableCartItems,
};
