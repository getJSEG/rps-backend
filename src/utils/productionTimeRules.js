function normalizeProductionTimeRules(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = raw.trim() ? JSON.parse(raw) : [];
    } catch (_) {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .map((rule) => {
      const minQty = Math.trunc(Number(rule?.minQty ?? rule?.min_qty ?? 1));
      const maxQtyRaw = rule?.maxQty ?? rule?.max_qty;
      const maxQty =
        maxQtyRaw === null || maxQtyRaw === undefined || maxQtyRaw === ''
          ? null
          : Math.trunc(Number(maxQtyRaw));
      const businessDays = Math.trunc(Number(rule?.businessDays ?? rule?.business_days));
      if (!Number.isFinite(minQty) || minQty < 1) return null;
      if (maxQty !== null && (!Number.isFinite(maxQty) || maxQty < minQty)) return null;
      if (!Number.isFinite(businessDays) || businessDays < 0) return null;
      return { minQty, maxQty, businessDays };
    })
    .filter(Boolean)
    .sort((a, b) => a.minQty - b.minQty);
}

function productionTimeBusinessDaysForQuantity(quantity, rules) {
  const qty = Math.max(1, Math.trunc(Number(quantity) || 1));
  const normalized = normalizeProductionTimeRules(rules);
  const match = normalized.find(
    (rule) => qty >= rule.minQty && (rule.maxQty === null || qty <= rule.maxQty)
  );
  return match ? match.businessDays : 0;
}

function validateProductionTimeRules(value) {
  const rules = normalizeProductionTimeRules(value);
  for (let idx = 0; idx < rules.length; idx += 1) {
    const current = rules[idx];
    const previous = rules[idx - 1];
    if (!previous) continue;
    if (previous.maxQty === null) {
      return {
        rules: [],
        error: `Production time row ${idx} has no max qty, so no later row can be added.`,
      };
    }
    const minimumAllowed = previous.maxQty + 1;
    if (current.minQty !== minimumAllowed) {
      return {
        rules: [],
        error: `Production time row ${idx + 1}: min qty must be equal to or greater than ${minimumAllowed}.`,
      };
    }
  }
  return { rules };
}

module.exports = {
  normalizeProductionTimeRules,
  productionTimeBusinessDaysForQuantity,
  validateProductionTimeRules,
};
