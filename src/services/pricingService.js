const pool = require('../config/database');

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

function normalizeModeScope(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === SELECTION_MODE.GRAPHIC_ONLY || v === SELECTION_MODE.GRAPHIC_FRAME) return v;
  return 'all';
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
      p.graphic_scenario_enabled
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
    modifier_groups,
  };
}

function resolveSelectedModifiers(product, input) {
  const groups = Array.isArray(product.modifier_groups) ? product.modifier_groups : [];
  if (groups.length === 0) return { selected: [], total: 0 };
  const selectionMode = normalizeSelectionMode(input.selection_mode ?? input.selectionMode);
  const isGraphicScenario = !!product.graphic_scenario_enabled;
  if (isGraphicScenario && !selectionMode) {
    throw new Error('Graphic mode selection is required.');
  }
  const rawSelected = input.selectedModifiers ?? input.selected_modifiers ?? {};
  const selectedObj =
    rawSelected && typeof rawSelected === 'object' && !Array.isArray(rawSelected) ? rawSelected : {};
  const selected = [];
  let total = 0;
  for (const group of groups) {
    const modeScope = normalizeModeScope(group.mode_scope);
    if (isGraphicScenario && modeScope !== 'all' && modeScope !== selectionMode) {
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
      // Optional groups must remain unselected when not provided by client.
      // Required groups may fall back to explicit default only.
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
    if (priceType !== 'fixed') {
      throw new Error(`Unsupported price type for ${group.name}.`);
    }
    total += adjustment;
    selected.push({
      group_key: group.key,
      group_name: group.name,
      option_value: optionEffectiveValue(option),
      option_label: option.label,
      price_adjustment: adjustment,
    });
  }
  return { selected, total };
}

function validateAndCalculatePricing(product, input) {
  const isGraphicScenario = !!product.graphic_scenario_enabled;
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

  const modifierSelection = resolveSelectedModifiers(product, input);
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
    selectionMode: normalizeSelectionMode(input.selection_mode ?? input.selectionMode) || null,
    graphicScenarioEnabled: isGraphicScenario,
    selectedModifiers: modifierSelection.selected,
    modifierTotal: modifierSelection.total,
    baseUnitPrice: computedUnitPrice - modifierSelection.total,
    unitPrice: computedUnitPrice,
  };
}

function buildCartSnapshot(pricing, input) {
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
  return {
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
    storePickupAddressId: shippingMode === 'store_pickup' ? storePickupAddressId : null,
    selectionMode: pricing.selectionMode,
    selection_mode: pricing.selectionMode,
    graphicScenarioEnabled: pricing.graphicScenarioEnabled,
    graphic_scenario_enabled: pricing.graphicScenarioEnabled,
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
  return buildCartSnapshot(pricing, input);
}

module.exports = {
  calculateCartItemFromInput,
  getProductPricingConfig,
  validateAndCalculatePricing,
};
