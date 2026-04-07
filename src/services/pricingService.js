const pool = require('../config/database');

const PRICING_MODE = {
  FIXED: 'fixed',
  AREA: 'area',
};

const SIZE_MODE = {
  PREDEFINED: 'predefined',
  CUSTOM: 'custom',
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
      p.max_height
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
  return {
    ...product,
    size_options: optionsResult.rows,
  };
}

function validateAndCalculatePricing(product, input) {
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

  if (sizeMode === SIZE_MODE.CUSTOM) {
    if (!(width > 0) || !(height > 0)) {
      throw new Error('Valid width and height (in inches) are required for custom size mode.');
    }
  }

  if (!(width > 0) || !(height > 0)) {
    throw new Error('Resolved width/height must be greater than zero.');
  }

  const minWidth = asNumber(product.min_width);
  const maxWidth = asNumber(product.max_width);
  const minHeight = asNumber(product.min_height);
  const maxHeight = asNumber(product.max_height);
  if (minWidth != null && width < minWidth) throw new Error(`Width must be at least ${minWidth} inches.`);
  if (maxWidth != null && width > maxWidth) throw new Error(`Width must be at most ${maxWidth} inches.`);
  if (minHeight != null && height < minHeight) throw new Error(`Height must be at least ${minHeight} inches.`);
  if (maxHeight != null && height > maxHeight) throw new Error(`Height must be at most ${maxHeight} inches.`);

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
    unitPrice: pricing.unitPrice,
    subtotal,
    total: subtotal,
    pricing_snapshot: {
      pricing_mode: pricing.pricing_mode,
      size_mode: pricing.size_mode,
      base_unit: pricing.base_unit,
      size_source: pricing.sizeSource,
      size_option_id: pricing.sizeOptionId,
      size_option_label: pricing.sizeOptionLabel,
      width: pricing.width,
      height: pricing.height,
      area_sqft: pricing.areaSqft,
      rate: pricing.rate,
      unit_price: pricing.unitPrice,
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
