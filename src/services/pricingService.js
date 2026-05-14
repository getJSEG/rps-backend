const pool = require('../config/database');
const { isPersistedFedexQuotedServiceType } = require('../utils/fedexQuoteServiceType');

const PRICING_MODE = {
  FIXED: 'fixed',
  AREA: 'area',
};

const SIZE_MODE = {
  PREDEFINED: 'predefined',
  CUSTOM: 'custom',
};

const SELECTION_MODE = {
  GRAPHIC_ONLY: 'graphic_only',
  GRAPHIC_FRAME: 'graphic_frame',
};

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeMode(value, fallback) {
  const v = String(value || '').trim().toLowerCase();
  return v || fallback;
}

function normalizeSelectionMode(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === SELECTION_MODE.GRAPHIC_ONLY || v === SELECTION_MODE.GRAPHIC_FRAME) return v;
  return '';
}

// Accept any non-empty string as a mode scope (not just the two legacy hardcoded values)
function normalizeModeScope(value) {
  const v = String(value || '').trim().toLowerCase();
  return v || 'all';
}

function optionEffectiveValue(option) {
  return String(option?.value || option?.label || '').trim();
}

function normalizeShippingMode(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'store_pickup' || s === 'store-pickup' || s === 'store pickup') {
    return 'store_pickup';
  }
  return 'blind_drop_ship';
}

/**
 * When `pricing_mode` is missing, infer the same way the storefront listing does:
 * listing shows `product.price` first, then `price_per_sqft`. Rows with both columns
 * populated must not default to area just because `price_per_sqft` is non-null.
 */
function inferPricingMode(product) {
  const explicit = String(product.pricing_mode || '').trim().toLowerCase();
  if (explicit === PRICING_MODE.FIXED || explicit === PRICING_MODE.AREA) {
    return explicit;
  }
  const sizeMode = normalizeMode(product.size_mode, SIZE_MODE.CUSTOM);
  if (sizeMode === SIZE_MODE.PREDEFINED) {
    return PRICING_MODE.FIXED;
  }
  const fixedFromProduct = asNumber(product.price);
  if (fixedFromProduct != null) {
    return PRICING_MODE.FIXED;
  }
  if (asNumber(product.price_per_sqft) != null) {
    return PRICING_MODE.AREA;
  }
  return PRICING_MODE.FIXED;
}

async function getProductPricingConfig(productId) {
  const productResult = await pool.query(
    `SELECT
      p.id,
      p.name,
      p.image_url,
      p.price,
      p.price_per_sqft,
      p.min_charge,
      p.pricing_mode,
      p.size_mode,
      p.base_unit,
      p.min_width,
      p.max_width,
      p.min_height,
      p.max_height,
      p.graphic_scenario_enabled,
      p.hardware_template_id,
      p.shipping_length,
      p.shipping_width,
      p.shipping_height,
      p.shipping_weight
    FROM products p
    WHERE p.id = $1`,
    [productId]
  );
  if (productResult.rows.length === 0) return null;
  const product = productResult.rows[0];

  const optionsResult = await pool.query(
    `SELECT id, label, width, height, unit_price, is_default
     FROM product_size_options
     WHERE product_id = $1
     ORDER BY is_default DESC, id ASC`,
    [productId]
  );

  // Load purchase options (the new dynamic option system)
  const purchaseOptionsResult = await pool.query(
    `SELECT id, label, option_key, pricing_mode, unit_price, price_per_sqft, min_charge, sort_order, is_default
     FROM product_purchase_options
     WHERE product_id = $1 AND is_active = true
     ORDER BY sort_order ASC, id ASC`,
    [productId]
  );

  const modifierGroupsResult = await pool.query(
    `SELECT
      pm.id AS product_modifier_id,
      pm.is_required,
      pm.sort_order AS product_sort_order,
      pm.mode_scope,
      mg.id AS modifier_group_id,
      mg.key AS group_key,
      mg.name AS group_name,
      mg.input_type,
      mo.id AS option_id,
      mo.label AS option_label,
      mo.value AS option_value,
      COALESCE(pmo.price_adjustment_override, mo.price_adjustment, 0) AS option_price_adjustment,
      mo.price_type AS option_price_type,
      COALESCE(pmo.is_default, false) OR COALESCE(mo.is_default, false) AS option_is_default,
      pmo.is_active AS product_option_active,
      mo.is_active AS option_active
    FROM product_modifiers pm
    INNER JOIN modifier_groups mg ON mg.id = pm.modifier_group_id AND mg.is_active = true
    INNER JOIN product_modifier_options pmo ON pmo.product_modifier_id = pm.id AND pmo.is_active = true
    INNER JOIN modifier_options mo ON mo.id = pmo.modifier_option_id
    WHERE pm.product_id = $1
      AND pm.is_active = true
    ORDER BY pm.sort_order ASC, mg.sort_order ASC, pmo.is_default DESC, mo.sort_order ASC, mo.id ASC`,
    [productId]
  );
  const groupsByKey = new Map();
  for (const row of modifierGroupsResult.rows) {
    if (!row.option_active || !row.product_option_active) continue;
    const key = String(row.group_key || '').trim();
    if (!key) continue;
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        id: Number(row.modifier_group_id),
        key,
        name: String(row.group_name || key),
        input_type: String(row.input_type || 'dropdown'),
        is_required: !!row.is_required,
        mode_scope: normalizeModeScope(row.mode_scope),
        sort_order: Number(row.product_sort_order || 0),
        options: [],
      });
    }
    groupsByKey.get(key).options.push({
      id: Number(row.option_id),
      label: String(row.option_label || ''),
      value: String(row.option_value || ''),
      price_adjustment: asNumber(row.option_price_adjustment) ?? 0,
      price_type: String(row.option_price_type || 'fixed').trim().toLowerCase() || 'fixed',
      is_default: !!row.option_is_default,
    });
  }
  const modifier_groups = Array.from(groupsByKey.values()).filter((g) => g.options.length > 0);
  return {
    ...product,
    size_options: optionsResult.rows,
    purchase_options: purchaseOptionsResult.rows,
    modifier_groups,
  };
}

function resolveSelectedModifiers(product, input, baseUnitPrice, activePurchaseOptionKey) {
  const groups = Array.isArray(product.modifier_groups) ? product.modifier_groups : [];
  if (groups.length === 0) return { selected: [], total: 0 };

  const hasPurchaseOptions = Array.isArray(product.purchase_options) && product.purchase_options.length > 0;
  const isGraphicScenario = !!product.graphic_scenario_enabled;

  // Determine the effective scope key for filtering modifiers
  let effectiveScopeKey = null;
  if (hasPurchaseOptions && activePurchaseOptionKey) {
    effectiveScopeKey = String(activePurchaseOptionKey).trim().toLowerCase();
  } else if (isGraphicScenario) {
    // Legacy: use selection_mode
    const selectionMode = normalizeSelectionMode(input.selection_mode ?? input.selectionMode);
    if (!selectionMode) {
      throw new Error('Graphic mode selection is required.');
    }
    effectiveScopeKey = selectionMode;
  }

  const rawSelected = input.selectedModifiers ?? input.selected_modifiers ?? {};
  const selectedObj =
    rawSelected && typeof rawSelected === 'object' && !Array.isArray(rawSelected) ? rawSelected : {};
  const selected = [];
  let fixedTotal = 0;
  let percentTotal = 0;
  for (const group of groups) {
    const modeScope = normalizeModeScope(group.mode_scope);
    // Filter by scope when an effectiveScopeKey is set
    if (effectiveScopeKey && modeScope !== 'all' && modeScope !== effectiveScopeKey) {
      continue;
    }
    const options = Array.isArray(group.options) ? group.options : [];
    if (options.length === 0) continue;
    const requestedValue = selectedObj[group.key];
    let option = null;
    if (requestedValue != null && requestedValue !== '') {
      option = options.find((o) => optionEffectiveValue(o) === String(requestedValue));
      if (!option) {
        throw new Error(`Invalid option for ${group.name}.`);
      }
    } else {
      if (group.is_required) {
        option = options.find((o) => o.is_default) || null;
      } else {
        option = null;
      }
      if (!option && group.is_required) {
        throw new Error(`${group.name} selection is required.`);
      }
    }
    if (!option) continue;
    const priceType = String(option.price_type || 'fixed').toLowerCase();
    const adjustment = asNumber(option.price_adjustment) ?? 0;
    if (priceType !== 'fixed' && priceType !== 'percent') {
      throw new Error(`Unsupported price type for ${group.name}.`);
    }
    if (priceType === 'percent') {
      percentTotal += adjustment;
    } else {
      fixedTotal += adjustment;
    }
    selected.push({
      group_key: group.key,
      group_name: group.name,
      option_value: optionEffectiveValue(option),
      option_label: option.label,
      price_adjustment: adjustment,
      price_type: priceType,
    });
  }
  const percentAmount = (asNumber(baseUnitPrice) ?? 0) * (percentTotal / 100);
  const total = fixedTotal + percentAmount;
  return { selected, total };
}

function validateAndCalculatePricing(product, input) {
  const hasPurchaseOptions = Array.isArray(product.purchase_options) && product.purchase_options.length > 0;
  const isGraphicScenario = !!product.graphic_scenario_enabled;

  // ── Purchase Options flow ────────────────────────────────────────────
  if (hasPurchaseOptions) {
    const purchaseOptions = product.purchase_options;
    const requestedKey = String(input.purchase_option_key ?? input.purchaseOptionKey ?? '').trim().toLowerCase();
    let selectedPurchaseOption = null;

    if (requestedKey) {
      selectedPurchaseOption = purchaseOptions.find(
        (o) => String(o.option_key || '').trim().toLowerCase() === requestedKey
      );
      if (!selectedPurchaseOption) {
        throw new Error(`Invalid purchase option: ${requestedKey}`);
      }
    } else {
      selectedPurchaseOption = purchaseOptions.find((o) => !!o.is_default) || purchaseOptions[0];
      if (!selectedPurchaseOption) {
        throw new Error('No purchase option available for this product.');
      }
    }

    const activePurchaseOptionKey = String(selectedPurchaseOption.option_key || '').trim().toLowerCase();
    const optionPricingMode = normalizeMode(selectedPurchaseOption.pricing_mode, PRICING_MODE.FIXED);
    const baseUnit = String(product.base_unit || 'inch').trim().toLowerCase();
    if (baseUnit !== 'inch') {
      throw new Error('Only inch input is supported for pricing at this time.');
    }

    // Dimensions — only needed for area pricing options
    let width = 1;
    let height = 1;
    let areaSqft = 1 / 144;
    let sizeSource = SIZE_MODE.CUSTOM;
    let selectedSizeOption = null;

    if (optionPricingMode === PRICING_MODE.AREA) {
      const widthRaw = asNumber(input.width ?? input.width_inches ?? input.widthInches);
      const heightRaw = asNumber(input.height ?? input.height_inches ?? input.heightInches);
      if (!(widthRaw > 0) || !(heightRaw > 0)) {
        throw new Error('Valid width and height (in inches) are required for this option.');
      }
      width = widthRaw;
      height = heightRaw;
      areaSqft = (width * height) / 144;
    } else {
      // Fixed pricing per option — no dimensions required (like graphic scenario)
      // But still accept dimensions if provided for display purposes
      const widthRaw = asNumber(input.width ?? input.width_inches ?? input.widthInches);
      const heightRaw = asNumber(input.height ?? input.height_inches ?? input.heightInches);
      if (widthRaw > 0 && heightRaw > 0) {
        width = widthRaw;
        height = heightRaw;
        areaSqft = (width * height) / 144;
      }
    }

    let computedUnitPrice = null;
    let rate = null;
    let minApplied = false;

    if (optionPricingMode === PRICING_MODE.FIXED) {
      const optionPrice = asNumber(selectedPurchaseOption.unit_price);
      if (optionPrice == null) throw new Error('Selected option has no unit price configured.');
      computedUnitPrice = optionPrice;
    } else if (optionPricingMode === PRICING_MODE.AREA) {
      rate = asNumber(selectedPurchaseOption.price_per_sqft);
      const minCharge = asNumber(selectedPurchaseOption.min_charge) ?? 0;
      if (rate == null) throw new Error('Selected option has no area price rate configured.');
      computedUnitPrice = areaSqft * rate;
      if (computedUnitPrice < minCharge) {
        computedUnitPrice = minCharge;
        minApplied = true;
      }
    } else {
      throw new Error(`Unsupported pricing mode for option: ${optionPricingMode}`);
    }

    const modifierSelection = resolveSelectedModifiers(product, input, computedUnitPrice, activePurchaseOptionKey);
    computedUnitPrice += modifierSelection.total;

    return {
      productId: Number(product.id),
      productName: String(product.name || 'Product'),
      productImage: product.image_url || null,
      pricing_mode: optionPricingMode,
      size_mode: SIZE_MODE.CUSTOM,
      base_unit: baseUnit,
      width,
      height,
      areaSqft,
      rate,
      minApplied,
      sizeSource,
      sizeOptionId: selectedSizeOption ? Number(selectedSizeOption.id) : null,
      sizeOptionLabel: selectedSizeOption ? String(selectedSizeOption.label || '') : null,
      selectionMode: null,
      graphicScenarioEnabled: isGraphicScenario,
      purchaseOptionKey: activePurchaseOptionKey,
      purchaseOptionLabel: String(selectedPurchaseOption.label || ''),
      selectedModifiers: modifierSelection.selected,
      modifierTotal: modifierSelection.total,
      baseUnitPrice: computedUnitPrice - modifierSelection.total,
      unitPrice: computedUnitPrice,
    };
  }

  // ── Legacy flow (graphic_scenario_enabled or plain products) ─────────
  if (isGraphicScenario && inferPricingMode(product) !== PRICING_MODE.FIXED) {
    throw new Error('Graphic scenario products must use fixed pricing.');
  }
  const pricingMode = inferPricingMode(product);
  const sizeMode = normalizeMode(product.size_mode, SIZE_MODE.CUSTOM);
  const baseUnit = String(product.base_unit || 'inch').trim().toLowerCase();
  if (baseUnit !== 'inch') {
    throw new Error('Only inch input is supported for pricing at this time.');
  }

  const sizeOptionIdRaw = input.size_option_id ?? input.sizeOptionId;
  const sizeOptionId = sizeOptionIdRaw != null && sizeOptionIdRaw !== '' ? parseInt(String(sizeOptionIdRaw), 10) : null;
  let width = asNumber(input.width ?? input.width_inches ?? input.widthInches);
  let height = asNumber(input.height ?? input.height_inches ?? input.heightInches);
  let sizeSource = SIZE_MODE.CUSTOM;
  let selectedOption = null;

  if (sizeMode === SIZE_MODE.PREDEFINED) {
    if (!Array.isArray(product.size_options) || product.size_options.length === 0) {
      throw new Error('No predefined size options are configured for this product.');
    }
    selectedOption = sizeOptionId
      ? product.size_options.find((o) => Number(o.id) === Number(sizeOptionId))
      : product.size_options.find((o) => o.is_default) || product.size_options[0];
    if (!selectedOption) {
      throw new Error('A valid size option is required for predefined mode.');
    }
    sizeSource = SIZE_MODE.PREDEFINED;
    width = Number(selectedOption.width);
    height = Number(selectedOption.height);
  }

  if (!isGraphicScenario && sizeMode === SIZE_MODE.CUSTOM) {
    if (!(width > 0) || !(height > 0)) {
      throw new Error('Valid width and height (in inches) are required for custom size mode.');
    }
  }

  if (isGraphicScenario) {
    width = 1;
    height = 1;
  } else if (!(width > 0) || !(height > 0)) {
    throw new Error('Resolved width/height must be greater than zero.');
  }

  const minWidth = asNumber(product.min_width);
  const maxWidth = asNumber(product.max_width);
  const minHeight = asNumber(product.min_height);
  const maxHeight = asNumber(product.max_height);
  if (!isGraphicScenario) {
    if (minWidth != null && width < minWidth) throw new Error(`Width must be at least ${minWidth} inches.`);
    if (maxWidth != null && width > maxWidth) throw new Error(`Width must be at most ${maxWidth} inches.`);
    if (minHeight != null && height < minHeight) throw new Error(`Height must be at least ${minHeight} inches.`);
    if (maxHeight != null && height > maxHeight) throw new Error(`Height must be at most ${maxHeight} inches.`);
  }

  const areaSqft = (width * height) / 144;
  let rate = null;
  let computedUnitPrice = null;
  let minApplied = false;

  if (pricingMode === PRICING_MODE.FIXED) {
    if (sizeMode === SIZE_MODE.PREDEFINED) {
      const optionPrice = asNumber(selectedOption?.unit_price);
      if (optionPrice == null) throw new Error('Selected predefined size option has no unit price.');
      computedUnitPrice = optionPrice;
    } else {
      const fixedPrice = asNumber(product.price);
      if (fixedPrice == null) throw new Error('Fixed price is not configured for this product.');
      computedUnitPrice = fixedPrice;
    }
  } else if (pricingMode === PRICING_MODE.AREA) {
    rate = asNumber(product.price_per_sqft);
    const minCharge = asNumber(product.min_charge) ?? 0;
    if (rate == null) throw new Error('Area pricing rate (price_per_sqft) is missing.');
    computedUnitPrice = areaSqft * rate;
    if (computedUnitPrice < minCharge) {
      computedUnitPrice = minCharge;
      minApplied = true;
    }
  } else {
    throw new Error(`Unsupported pricing mode: ${pricingMode}`);
  }

  const selectionMode = normalizeSelectionMode(input.selection_mode ?? input.selectionMode);
  const modifierSelection = resolveSelectedModifiers(product, input, computedUnitPrice, null);
  computedUnitPrice += modifierSelection.total;

  return {
    productId: Number(product.id),
    productName: String(product.name || 'Product'),
    productImage: product.image_url || null,
    pricing_mode: pricingMode,
    size_mode: sizeMode,
    base_unit: baseUnit,
    width,
    height,
    areaSqft,
    rate,
    minApplied,
    sizeSource,
    sizeOptionId: selectedOption ? Number(selectedOption.id) : null,
    sizeOptionLabel: selectedOption ? String(selectedOption.label || '') : null,
    selectionMode: selectionMode || null,
    graphicScenarioEnabled: isGraphicScenario,
    purchaseOptionKey: null,
    purchaseOptionLabel: null,
    selectedModifiers: modifierSelection.selected,
    modifierTotal: modifierSelection.total,
    baseUnitPrice: computedUnitPrice - modifierSelection.total,
    unitPrice: computedUnitPrice,
  };
}

/**
 * If the client sent a persisted FedEx quote (REST serviceType + finite amount), merge it onto the cart snapshot
 * so it is never dropped when amount parsing or defaults would omit it. No-op for guests / no FedEx in input.
 * Skips when shipping mode is store pickup.
 */
function applyPersistedFedExQuoteFromInput(snapshot, input) {
  if (!snapshot || !input || typeof input !== 'object') return snapshot;
  const mode = normalizeShippingMode(input.shippingMode ?? input.shipping_mode ?? input.shipping);
  if (mode === 'store_pickup') return snapshot;
  const svcIn = String(input.shippingService ?? input.shipping_service ?? '').trim();
  if (!isPersistedFedexQuotedServiceType(svcIn)) return snapshot;
  const rawAmt = input.shippingRateAmount ?? input.shipping_rate_amount;
  if (rawAmt === undefined || rawAmt === null || rawAmt === '') return snapshot;
  const amtIn = Number(rawAmt);
  if (!Number.isFinite(amtIn) || amtIn < 0) return snapshot;
  const cur = String(input.shippingRateCurrency ?? input.shipping_rate_currency ?? 'USD').trim().toUpperCase() || 'USD';
  const name = String(input.shippingRateServiceName ?? input.shipping_rate_service_name ?? '').trim() || svcIn;
  const ed = input.shippingRateEstimatedDelivery ?? input.shipping_rate_estimated_delivery;
  const edOut = ed != null && String(ed).trim() !== '' ? ed : null;
  snapshot.shippingService = svcIn;
  snapshot.shipping_service = svcIn;
  snapshot.shippingRateAmount = amtIn;
  snapshot.shipping_rate_amount = amtIn;
  snapshot.shippingRateCurrency = cur;
  snapshot.shipping_rate_currency = cur;
  snapshot.shippingRateServiceName = name;
  snapshot.shipping_rate_service_name = name;
  snapshot.shippingRateEstimatedDelivery = edOut;
  snapshot.shipping_rate_estimated_delivery = edOut;
  return snapshot;
}

/** Copy hardware FedEx box from product row (and optional client overrides) onto cart JSON. */
function attachHardwareShippingSnapshot(result, productRow, input) {
  if (!result || !productRow) return;
  const htRaw = productRow.hardware_template_id ?? input.hardware_template_id ?? input.hardwareTemplateId;
  if (htRaw == null || htRaw === '') return;
  const htId = Number(htRaw);
  if (!Number.isFinite(htId)) return;

  const sl = asNumber(input.shipping_length ?? input.shippingLength ?? productRow.shipping_length);
  const sw = asNumber(input.shipping_width ?? input.shippingWidth ?? productRow.shipping_width);
  const sh = asNumber(input.shipping_height ?? input.shippingHeight ?? productRow.shipping_height);
  const swt = asNumber(input.shipping_weight ?? input.shippingWeight ?? productRow.shipping_weight);
  if (!(sl > 0) || !(sw > 0) || !(sh > 0) || !(swt > 0)) return;

  result.hardware_template_id = htId;
  result.hardwareTemplateId = htId;
  result.shipping_length = sl;
  result.shipping_width = sw;
  result.shipping_height = sh;
  result.shipping_weight = swt;
  result.shippingLength = sl;
  result.shippingWidth = sw;
  result.shippingHeight = sh;
  result.shippingWeight = swt;

  result.pricing_snapshot = {
    ...result.pricing_snapshot,
    hardware_template_id: htId,
    shipping_length: sl,
    shipping_width: sw,
    shipping_height: sh,
    shipping_weight: swt,
  };
}

function buildCartSnapshot(pricing, input, productRow) {
  const shippingMode = normalizeShippingMode(input.shippingMode ?? input.shipping_mode ?? input.shipping);
  const shippingService =
    shippingMode === 'store_pickup'
      ? 'Store Pickup'
      : String(input.shippingService ?? input.shipping_service ?? 'Ground');
  const storePickupAddressIdRaw = input.storePickupAddressId ?? input.store_pickup_address_id;
  const storePickupAddressId =
    storePickupAddressIdRaw != null && storePickupAddressIdRaw !== ''
      ? Number(storePickupAddressIdRaw)
      : null;
  const jobsInput = Array.isArray(input.jobs) ? input.jobs : [];
  let jobs = [];
  let quantity = 0;
  if (jobsInput.length > 0) {
    jobs = jobsInput.map((job, idx) => {
      const q = Math.max(1, parseInt(String(job.quantity ?? 1), 10) || 1);
      quantity += q;
      return {
        id: String(job.id || `job-${idx + 1}`),
        jobName: String(job.jobName || job.job_name || `Job ${idx + 1}`),
        quantity: q,
        unitPrice: pricing.unitPrice,
        lineSubtotal: pricing.unitPrice * q,
      };
    });
  } else {
    quantity = Math.max(1, parseInt(String(input.quantity ?? 1), 10) || 1);
    jobs = [
      {
        id: 'job-1',
        jobName: String(input.jobName || input.job_name || pricing.productName),
        quantity,
        unitPrice: pricing.unitPrice,
        lineSubtotal: pricing.unitPrice * quantity,
      },
    ];
  }
  const subtotal = jobs.reduce((sum, j) => sum + Number(j.lineSubtotal || 0), 0);
  const shippingRateAmountRaw = input.shippingRateAmount ?? input.shipping_rate_amount;
  const shippingRateAmount = Number(shippingRateAmountRaw);
  const shippingRateCurrency = String(
    input.shippingRateCurrency ?? input.shipping_rate_currency ?? 'USD'
  ).trim().toUpperCase();
  const shippingRateServiceName = String(
    input.shippingRateServiceName ?? input.shipping_rate_service_name ?? ''
  ).trim();
  const shippingRateEstimatedDelivery = String(
    input.shippingRateEstimatedDelivery ?? input.shipping_rate_estimated_delivery ?? ''
  ).trim();
  const result = {
    productId: pricing.productId,
    productName: pricing.productName,
    productImage: pricing.productImage,
    width: pricing.width,
    height: pricing.height,
    areaSqFt: pricing.areaSqft,
    quantity,
    jobs,
    totalJobs: jobs.length,
    jobName: jobs.length === 1 ? jobs[0].jobName : `${jobs[0].jobName} (+${jobs.length - 1} more)`,
    shippingMode,
    shipping: shippingMode === 'store_pickup' ? 'store-pickup' : 'blind-drop',
    shippingService,
    shipping_service: shippingService,
    shippingRateAmount: Number.isFinite(shippingRateAmount) ? shippingRateAmount : undefined,
    shipping_rate_amount: Number.isFinite(shippingRateAmount) ? shippingRateAmount : undefined,
    shippingRateCurrency: shippingRateCurrency || 'USD',
    shipping_rate_currency: shippingRateCurrency || 'USD',
    shippingRateServiceName: shippingRateServiceName || shippingService,
    shipping_rate_service_name: shippingRateServiceName || shippingService,
    shippingRateEstimatedDelivery: shippingRateEstimatedDelivery || null,
    shipping_rate_estimated_delivery: shippingRateEstimatedDelivery || null,
    storePickupAddressId: shippingMode === 'store_pickup' ? storePickupAddressId : null,
    selectionMode: pricing.selectionMode,
    selection_mode: pricing.selectionMode,
    graphicScenarioEnabled: pricing.graphicScenarioEnabled,
    graphic_scenario_enabled: pricing.graphicScenarioEnabled,
    purchaseOptionKey: pricing.purchaseOptionKey,
    purchase_option_key: pricing.purchaseOptionKey,
    purchaseOptionLabel: pricing.purchaseOptionLabel,
    purchase_option_label: pricing.purchaseOptionLabel,
    unitPrice: pricing.unitPrice,
    baseUnitPrice: pricing.baseUnitPrice,
    modifierTotal: pricing.modifierTotal,
    modifier_total: pricing.modifierTotal,
    selectedModifiers: pricing.selectedModifiers,
    selected_modifiers: pricing.selectedModifiers,
    subtotal,
    total: subtotal,
    pricing_snapshot: {
      pricing_mode: pricing.pricing_mode,
      size_mode: pricing.size_mode,
      base_unit: pricing.base_unit,
      size_source: pricing.sizeSource,
      size_option_id: pricing.sizeOptionId,
      size_option_label: pricing.sizeOptionLabel,
      selection_mode: pricing.selectionMode,
      graphic_scenario_enabled: pricing.graphicScenarioEnabled,
      purchase_option_key: pricing.purchaseOptionKey,
      purchase_option_label: pricing.purchaseOptionLabel,
      width: pricing.width,
      height: pricing.height,
      area_sqft: pricing.areaSqft,
      rate: pricing.rate,
      unit_price: pricing.unitPrice,
      base_unit_price: pricing.baseUnitPrice,
      modifier_total: pricing.modifierTotal,
      modifierTotal: pricing.modifierTotal,
      selected_modifiers: pricing.selectedModifiers,
      selectedModifiers: pricing.selectedModifiers,
      min_applied: pricing.minApplied,
    },
    timestamp: new Date().toISOString(),
  };
  applyPersistedFedExQuoteFromInput(result, input);
  attachHardwareShippingSnapshot(result, productRow, input);
  return result;
}

async function calculateCartItemFromInput(input) {
  const productIdRaw = input.productId ?? input.product_id;
  const productId = productIdRaw != null && productIdRaw !== '' ? parseInt(String(productIdRaw), 10) : NaN;
  if (Number.isNaN(productId)) {
    throw new Error('productId is required.');
  }
  const config = await getProductPricingConfig(productId);
  if (!config) throw new Error('Product not found.');
  const pricing = validateAndCalculatePricing(config, input);
  return buildCartSnapshot(pricing, input, config);
}

module.exports = {
  calculateCartItemFromInput,
  getProductPricingConfig,
  validateAndCalculatePricing,
};
