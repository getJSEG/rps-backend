const pool = require('../config/database');
const path = require('path');
const fs = require('fs');
const { uploadFromBuffer, isConfigured: spacesConfigured } = require('../utils/spaces');
const { getProductPricingConfig, validateAndCalculatePricing } = require('../services/pricingService');
const { normalizeProductionTimeRules, validateProductionTimeRules } = require('../utils/productionTimeRules');

/** @param {unknown} value */
function normalizeGalleryArrayInput(value) {
  if (!Array.isArray(value)) return [];
  return value.map((u) => String(u || '').trim()).filter(Boolean);
}

/** @param {{ gallery_images?: unknown; image_url?: string | null }} row */
function galleryFromRow(row) {
  if (!row) return [];
  const g = row.gallery_images;
  if (Array.isArray(g) && g.length) return g.map((u) => String(u || '').trim()).filter(Boolean);
  if (row.image_url) return [String(row.image_url).trim()];
  return [];
}

function asNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validateFedexShippingDataForHardware({
  isHardware,
  shippingLength,
  shippingWidth,
  shippingHeight,
  shippingWeight,
}) {
  if (!isHardware) return null;
  const required = [
    ['length', shippingLength],
    ['width', shippingWidth],
    ['height', shippingHeight],
    ['weight', shippingWeight],
  ];
  const missing = required
    .filter(([, value]) => !Number.isFinite(Number(value)) || Number(value) <= 0)
    .map(([label]) => label);
  if (missing.length === 0) return null;
  const list = missing.length > 1
    ? `${missing.slice(0, -1).join(', ')}, and ${missing[missing.length - 1]}`
    : missing[0];
  return `FedEx shipping data is required. Add ${list}.`;
}

/** Whole number for INTEGER columns; null if empty/invalid. */
function asIntegerOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function normalizeMode(value, fallback) {
  const v = String(value || '').trim().toLowerCase();
  return v || fallback;
}

// Accept any non-empty string as a mode scope (supports dynamic purchase option keys)
function normalizeModeScope(value) {
  const v = String(value || '').trim().toLowerCase();
  return v || 'all';
}

function parseSizeOptionsInput(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      id: item?.id != null && item?.id !== '' ? parseInt(String(item.id), 10) : null,
      label: String(item?.label || '').trim(),
      width: asNumberOrNull(item?.width),
      height: asNumberOrNull(item?.height),
      unit_price: asNumberOrNull(item?.unit_price ?? item?.unitPrice),
      is_default: item?.is_default === true || item?.isDefault === true,
    }))
    .filter((item) => item.label && item.width != null && item.height != null);
}

function parseShippingBoxRulesInput(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      shipping_box_id:
        item?.shipping_box_id == null || item?.shipping_box_id === ''
          ? null
          : parseInt(String(item.shipping_box_id), 10),
      min_smallest_side: asNumberOrNull(item?.min_smallest_side),
      max_smallest_side: asNumberOrNull(item?.max_smallest_side),
      max_quantity_per_box: asIntegerOrNull(item?.max_quantity_per_box),
      max_weight_per_box: asNumberOrNull(item?.max_weight_per_box),
      is_active: item?.is_active !== false,
    }))
    .filter((item) => item.shipping_box_id != null);
}

async function replaceProductShippingBoxRules(productId, rules) {
  await pool.query('DELETE FROM product_shipping_box_rules WHERE product_id = $1', [productId]);
  if (!Array.isArray(rules) || rules.length === 0) return;
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    if (!Number.isFinite(rule.shipping_box_id) || rule.shipping_box_id <= 0) {
      throw new Error('Shipping box is required for each box rule.');
    }
    if (
      rule.min_smallest_side != null &&
      rule.max_smallest_side != null &&
      Number(rule.min_smallest_side) > Number(rule.max_smallest_side)
    ) {
      throw new Error('Box rule minimum smallest side cannot be greater than maximum.');
    }
    if (!Number.isFinite(Number(rule.max_quantity_per_box)) || Number(rule.max_quantity_per_box) <= 0) {
      throw new Error('Box rule max quantity per box is required.');
    }
    if (rule.max_weight_per_box != null && (!Number.isFinite(Number(rule.max_weight_per_box)) || Number(rule.max_weight_per_box) <= 0)) {
      throw new Error('Box rule max weight per box must be greater than zero.');
    }
    const check = await pool.query('SELECT id FROM shipping_boxes WHERE id = $1', [rule.shipping_box_id]);
    if (check.rows.length === 0) {
      throw new Error('Selected shipping box does not exist.');
    }
    await pool.query(
      `INSERT INTO product_shipping_box_rules
       (product_id, shipping_box_id, min_smallest_side, max_smallest_side, max_quantity_per_box, max_weight_per_box, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        productId,
        rule.shipping_box_id,
        rule.min_smallest_side,
        rule.max_smallest_side,
        Math.trunc(Number(rule.max_quantity_per_box)),
        rule.max_weight_per_box == null ? null : rule.max_weight_per_box,
        i,
        rule.is_active !== false,
      ]
    );
  }
}

async function getProductShippingBoxRules(productId) {
  const result = await pool.query(
    `SELECT
       r.id,
       r.product_id,
       r.shipping_box_id,
       r.min_smallest_side,
       r.max_smallest_side,
       r.max_quantity_per_box,
       r.max_weight_per_box,
       r.sort_order,
       r.is_active,
       b.name AS box_name,
       b.length AS box_length,
       b.width AS box_width,
       b.height AS box_height
     FROM product_shipping_box_rules r
     INNER JOIN shipping_boxes b ON b.id = r.shipping_box_id
     WHERE r.product_id = $1
     ORDER BY r.sort_order ASC, r.id ASC`,
    [productId]
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    product_id: Number(row.product_id),
    shipping_box_id: Number(row.shipping_box_id),
    min_smallest_side: row.min_smallest_side == null ? null : Number(row.min_smallest_side),
    max_smallest_side: row.max_smallest_side == null ? null : Number(row.max_smallest_side),
    max_quantity_per_box: row.max_quantity_per_box == null ? null : Number(row.max_quantity_per_box),
    max_weight_per_box: row.max_weight_per_box == null ? null : Number(row.max_weight_per_box),
    sort_order: Number(row.sort_order || 0),
    is_active: row.is_active !== false,
    box: {
      id: Number(row.shipping_box_id),
      name: String(row.box_name || ''),
      length: Number(row.box_length) || 0,
      width: Number(row.box_width) || 0,
      height: Number(row.box_height) || 0,
    },
  }));
}

async function getProductSizeOptions(productId) {
  const result = await pool.query(
    `SELECT id, product_id, label, width, height, unit_price, is_default
     FROM product_size_options
     WHERE product_id = $1
     ORDER BY is_default DESC, id ASC`,
    [productId]
  );
  return result.rows;
}

async function replaceProductSizeOptions(productId, options) {
  await pool.query('DELETE FROM product_size_options WHERE product_id = $1', [productId]);
  if (!Array.isArray(options) || options.length === 0) return;
  const hasDefault = options.some((o) => o.is_default);
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const isDefault = hasDefault ? !!opt.is_default : i === 0;
    await pool.query(
      `INSERT INTO product_size_options (product_id, label, width, height, unit_price, is_default)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [productId, opt.label, opt.width, opt.height, opt.unit_price, isDefault]
    );
  }
}

function parsePurchaseOptionsInput(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      label: String(item?.label || '').trim(),
      option_key: String(item?.option_key || item?.key || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      pricing_mode: String(item?.pricing_mode || 'fixed').trim().toLowerCase() === 'area' ? 'area' : 'fixed',
      unit_price: asNumberOrNull(item?.unit_price ?? item?.unitPrice),
      price_per_sqft: asNumberOrNull(item?.price_per_sqft ?? item?.pricePerSqft),
      min_charge: asNumberOrNull(item?.min_charge ?? item?.minCharge),
      sort_order: item?.sort_order != null ? Number(item.sort_order) : 0,
      is_default: item?.is_default === true || item?.isDefault === true,
      is_active: item?.is_active !== false,
    }))
    .filter((item) => item.label && item.option_key);
}

async function getProductPurchaseOptions(productId) {
  const result = await pool.query(
    `SELECT id, product_id, label, option_key, pricing_mode, unit_price, price_per_sqft, min_charge, sort_order, is_default, is_active
     FROM product_purchase_options
     WHERE product_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [productId]
  );
  return result.rows;
}

async function replaceProductPurchaseOptions(productId, options) {
  await pool.query('DELETE FROM product_purchase_options WHERE product_id = $1', [productId]);
  if (!Array.isArray(options) || options.length === 0) return;
  const hasDefault = options.some((o) => o.is_default);
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const isDefault = hasDefault ? !!opt.is_default : i === 0;
    await pool.query(
      `INSERT INTO product_purchase_options (product_id, label, option_key, pricing_mode, unit_price, price_per_sqft, min_charge, sort_order, is_default, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        productId,
        opt.label,
        opt.option_key,
        opt.pricing_mode || 'fixed',
        opt.unit_price,
        opt.price_per_sqft,
        opt.min_charge,
        i,
        isDefault,
        opt.is_active !== false,
      ]
    );
  }
}

async function getProductModifierGroups(productId, { includeInactive = false } = {}) {
  const result = await pool.query(
    `SELECT
      pm.id AS product_modifier_id,
      pm.is_required,
      pm.sort_order AS product_sort_order,
      pm.mode_scope,
      pm.is_active AS product_modifier_active,
      mg.id AS modifier_group_id,
      mg.name AS group_name,
      mg.key AS group_key,
      mg.input_type,
      mg.is_active AS group_active,
      mo.id AS modifier_option_id,
      mo.label AS option_label,
      mo.value AS option_value,
      mo.price_adjustment AS option_price_adjustment,
      mo.price_type AS option_price_type,
      mo.is_default AS option_default,
      mo.is_active AS option_active,
      pmo.id AS product_modifier_option_id,
      pmo.price_adjustment_override,
      pmo.is_default AS product_option_default,
      pmo.is_active AS product_option_active
    FROM product_modifiers pm
    INNER JOIN modifier_groups mg ON mg.id = pm.modifier_group_id
    INNER JOIN product_modifier_options pmo ON pmo.product_modifier_id = pm.id
    INNER JOIN modifier_options mo ON mo.id = pmo.modifier_option_id
    WHERE pm.product_id = $1
    ORDER BY pm.sort_order ASC, mg.sort_order ASC, pmo.is_default DESC, mo.sort_order ASC, mo.id ASC`,
    [productId]
  );
  const byKey = new Map();
  for (const row of result.rows) {
    if (!includeInactive) {
      if (!row.product_modifier_active || !row.group_active || !row.product_option_active || !row.option_active) {
        continue;
      }
    }
    const key = String(row.group_key || '').trim();
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, {
        product_modifier_id: Number(row.product_modifier_id),
        modifier_group_id: Number(row.modifier_group_id),
        key,
        name: String(row.group_name || key),
        input_type: String(row.input_type || 'dropdown'),
        is_required: !!row.is_required,
        mode_scope: normalizeModeScope(row.mode_scope),
        is_active: !!row.product_modifier_active,
        sort_order: Number(row.product_sort_order || 0),
        options: [],
      });
    }
    byKey.get(key).options.push({
      id: Number(row.modifier_option_id),
      product_modifier_option_id: Number(row.product_modifier_option_id),
      label: String(row.option_label || ''),
      value: String(row.option_value || ''),
      price_adjustment:
        row.price_adjustment_override != null
          ? Number(row.price_adjustment_override)
          : Number(row.option_price_adjustment || 0),
      price_type: String(row.option_price_type || 'fixed').toLowerCase(),
      is_default: !!row.product_option_default,
      _catalog_default: !!row.option_default,
      is_active: !!row.product_option_active,
    });
  }
  const groups = Array.from(byKey.values());
  for (const group of groups) {
    const hasProductDefault = group.options.some((opt) => opt.is_default === true);
    group.options = group.options.map((opt, idx) => ({
      ...opt,
      // Product-level default must win. Only fall back to catalog default when
      // no explicit product default exists for this group.
      is_default: hasProductDefault
        ? !!opt.is_default
        : !!opt._catalog_default,
      _catalog_default: undefined,
    }));
  }
  return groups;
}

async function getProductConditionalModifierRules(productId) {
  const result = await pool.query(
    `SELECT
      r.id,
      r.product_id,
      r.hardware_option_id,
      po.option_key AS hardware_option_key,
      po.label AS hardware_option_label,
      r.source_modifier_id,
      smg.key AS source_modifier_key,
      smg.name AS source_modifier_name,
      r.source_option_id,
      so.value AS source_option_value,
      so.label AS source_option_label,
      r.action_type,
      r.target_modifier_id,
      tmg.key AS target_modifier_key,
      tmg.name AS target_modifier_name,
      r.target_option_id,
      target_o.value AS target_option_value,
      target_o.label AS target_option_label,
      r.sort_order
    FROM product_conditional_modifier_rules r
    LEFT JOIN product_purchase_options po ON po.id = r.hardware_option_id
    INNER JOIN modifier_groups smg ON smg.id = r.source_modifier_id
    LEFT JOIN modifier_options so ON so.id = r.source_option_id
    INNER JOIN modifier_groups tmg ON tmg.id = r.target_modifier_id
    LEFT JOIN modifier_options target_o ON target_o.id = r.target_option_id
    WHERE r.product_id = $1
    ORDER BY r.sort_order ASC, r.id ASC`,
    [productId]
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    product_id: Number(row.product_id),
    hardware_option_id: row.hardware_option_id == null ? null : Number(row.hardware_option_id),
    hardware_option_key: row.hardware_option_key == null ? null : String(row.hardware_option_key),
    hardware_option_label: row.hardware_option_label == null ? null : String(row.hardware_option_label),
    source_modifier_id: Number(row.source_modifier_id),
    source_modifier_key: String(row.source_modifier_key || ''),
    source_modifier_name: String(row.source_modifier_name || ''),
    source_option_id: row.source_option_id == null ? null : Number(row.source_option_id),
    source_option_value: row.source_option_value == null ? null : String(row.source_option_value || ''),
    source_option_label: row.source_option_label == null ? null : String(row.source_option_label || ''),
    action_type: String(row.action_type || ''),
    target_modifier_id: Number(row.target_modifier_id),
    target_modifier_key: String(row.target_modifier_key || ''),
    target_modifier_name: String(row.target_modifier_name || ''),
    target_option_id: row.target_option_id == null ? null : Number(row.target_option_id),
    target_option_value: row.target_option_value == null ? null : String(row.target_option_value || ''),
    target_option_label: row.target_option_label == null ? null : String(row.target_option_label || ''),
    sort_order: Number(row.sort_order || 0),
  }));
}

async function resolveProductPurchaseOptionId(client, productId, rawId, rawKey) {
  if (rawId != null && rawId !== '') {
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid hardware option id.');
    const check = await client.query(
      'SELECT id FROM product_purchase_options WHERE id = $1 AND product_id = $2',
      [id, productId]
    );
    if (check.rows.length === 0) throw new Error('Hardware option does not belong to this product.');
    return id;
  }
  const key = String(rawKey || '').trim().toLowerCase();
  if (!key || key === 'all') return null;
  const check = await client.query(
    'SELECT id FROM product_purchase_options WHERE product_id = $1 AND LOWER(option_key) = $2 ORDER BY sort_order ASC, id ASC LIMIT 1',
    [productId, key]
  );
  if (check.rows.length === 0) throw new Error(`Hardware option not found: ${key}`);
  return Number(check.rows[0].id);
}

async function validateModifierOptionPair(client, modifierGroupId, optionId, label) {
  const groupId = Number(modifierGroupId);
  const optId = Number(optionId);
  if (!Number.isFinite(groupId) || groupId <= 0) throw new Error(`${label} modifier is required.`);
  if (!Number.isFinite(optId) || optId <= 0) throw new Error(`${label} option is required.`);
  const result = await client.query(
    `SELECT mo.id
     FROM modifier_options mo
     INNER JOIN modifier_groups mg ON mg.id = mo.modifier_group_id
     WHERE mg.id = $1 AND mo.id = $2`,
    [groupId, optId]
  );
  if (result.rows.length === 0) throw new Error(`${label} option does not belong to selected modifier.`);
  return { groupId, optId };
}

async function validateModifierGroup(client, modifierGroupId, label) {
  const groupId = Number(modifierGroupId);
  if (!Number.isFinite(groupId) || groupId <= 0) throw new Error(`${label} modifier is required.`);
  const result = await client.query('SELECT id FROM modifier_groups WHERE id = $1', [groupId]);
  if (result.rows.length === 0) throw new Error(`${label} modifier not found.`);
  return groupId;
}

async function replaceProductConditionalModifierRules(client, productId, rules) {
  await client.query('DELETE FROM product_conditional_modifier_rules WHERE product_id = $1', [productId]);
  if (!Array.isArray(rules) || rules.length === 0) return;
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i] || {};
    const actionType = String(rule.action_type || rule.actionType || '').trim();
    if (actionType !== 'auto_select' && actionType !== 'disable') {
      throw new Error('Conditional rule action must be auto_select or disable.');
    }
    const hardwareOptionId = await resolveProductPurchaseOptionId(
      client,
      productId,
      rule.hardware_option_id ?? rule.hardwareOptionId,
      rule.hardware_option_key ?? rule.hardwareOptionKey
    );
    const sourceGroupId = await validateModifierGroup(client, rule.source_modifier_id ?? rule.sourceModifierId, 'Source');
    const rawSourceOptionId = rule.source_option_id ?? rule.sourceOptionId;
    const sourceOptionId =
      rawSourceOptionId == null || rawSourceOptionId === ''
        ? null
        : (await validateModifierOptionPair(client, sourceGroupId, rawSourceOptionId, 'Source')).optId;
    const targetGroupId = await validateModifierGroup(client, rule.target_modifier_id ?? rule.targetModifierId, 'Target');
    const rawTargetOptionId = rule.target_option_id ?? rule.targetOptionId;
    const targetOptionId =
      rawTargetOptionId == null || rawTargetOptionId === ''
        ? null
        : (await validateModifierOptionPair(client, targetGroupId, rawTargetOptionId, 'Target')).optId;
    if (actionType === 'auto_select' && targetOptionId == null) {
      throw new Error('Target option is required for auto-select rules.');
    }
    await client.query(
      `INSERT INTO product_conditional_modifier_rules
       (product_id, hardware_option_id, source_modifier_id, source_option_id, action_type, target_modifier_id, target_option_id, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [productId, hardwareOptionId, sourceGroupId, sourceOptionId, actionType, targetGroupId, targetOptionId, i]
    );
  }
}

async function replaceProductModifierConfig(productId, payload) {
  const groups = Array.isArray(payload?.groups) ? payload.groups : [];
  const rules = Array.isArray(payload?.conditional_rules)
    ? payload.conditional_rules
    : Array.isArray(payload?.conditionalRules)
      ? payload.conditionalRules
      : [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM product_modifier_options WHERE product_modifier_id IN (SELECT id FROM product_modifiers WHERE product_id = $1)', [productId]);
    await client.query('DELETE FROM product_modifiers WHERE product_id = $1', [productId]);
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i] || {};
      const groupKey = String(g.key || '').trim().toLowerCase();
      if (!groupKey) continue;
      const mgRes = await client.query(
        `SELECT id FROM modifier_groups WHERE key = $1 AND is_active = true`,
        [groupKey]
      );
      if (mgRes.rows.length === 0) {
        throw new Error(`Modifier group not found: ${groupKey}`);
      }
      const productModifierRes = await client.query(
        `INSERT INTO product_modifiers (product_id, modifier_group_id, is_required, sort_order, mode_scope, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id`,
        [
          productId,
          mgRes.rows[0].id,
          g.is_required === true,
          g.sort_order != null ? Number(g.sort_order) : i,
          normalizeModeScope(g.mode_scope),
        ]
      );
      const productModifierId = productModifierRes.rows[0].id;
      const options = Array.isArray(g.options) ? g.options : [];
      const insertedOptionIds = new Set();
      for (let j = 0; j < options.length; j++) {
        const opt = options[j] || {};
        const explicitOptionId = opt.option_id != null ? Number(opt.option_id) : null;
        let resolvedOptionId = null;
        if (explicitOptionId != null && Number.isFinite(explicitOptionId)) {
          const checkById = await client.query(
            `SELECT id FROM modifier_options WHERE id = $1 AND modifier_group_id = $2 AND is_active = true`,
            [explicitOptionId, mgRes.rows[0].id]
          );
          if (checkById.rows.length === 0) {
            throw new Error(`Modifier option not found for id ${explicitOptionId}.`);
          }
          resolvedOptionId = Number(checkById.rows[0].id);
        } else {
          const optionValue = String(opt.value || '').trim();
          if (!optionValue) continue;
          const moRes = await client.query(
            `SELECT id FROM modifier_options WHERE modifier_group_id = $1 AND value = $2 AND is_active = true ORDER BY id ASC`,
            [mgRes.rows[0].id, optionValue]
          );
          if (moRes.rows.length === 0) {
            throw new Error(`Modifier option not found: ${groupKey}.${optionValue}`);
          }
          resolvedOptionId = Number(moRes.rows[0].id);
        }
        if (insertedOptionIds.has(resolvedOptionId)) continue;
        insertedOptionIds.add(resolvedOptionId);
        await client.query(
          `INSERT INTO product_modifier_options (product_modifier_id, modifier_option_id, price_adjustment_override, is_default, is_active)
           VALUES ($1, $2, $3, $4, true)`,
          [
            productModifierId,
            resolvedOptionId,
            opt.price_adjustment_override != null ? Number(opt.price_adjustment_override) : null,
            opt.is_default === true,
          ]
        );
      }
    }
    await replaceProductConditionalModifierRules(client, productId, rules);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getModifierCatalog({ includeInactive = true } = {}) {
  const result = await pool.query(
    `SELECT
      mg.id AS group_id,
      mg.name AS group_name,
      mg.key AS group_key,
      mg.input_type,
      mg.sort_order AS group_sort_order,
      mg.is_active AS group_active,
      mo.id AS option_id,
      mo.label AS option_label,
      mo.value AS option_value,
      mo.price_adjustment,
      mo.price_type,
      mo.is_default,
      mo.sort_order AS option_sort_order,
      mo.is_active AS option_active
    FROM modifier_groups mg
    LEFT JOIN modifier_options mo ON mo.modifier_group_id = mg.id
    ORDER BY mg.sort_order ASC, mg.id ASC, mo.sort_order ASC, mo.id ASC`
  );
  const groupsByKey = new Map();
  for (const row of result.rows) {
    if (!includeInactive && !row.group_active) continue;
    const key = String(row.group_key || '').trim();
    if (!key) continue;
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        id: Number(row.group_id),
        key,
        name: String(row.group_name || key),
        input_type: String(row.input_type || 'dropdown'),
        sort_order: Number(row.group_sort_order || 0),
        is_active: !!row.group_active,
        options: [],
      });
    }
    if (row.option_id == null) continue;
    if (!includeInactive && !row.option_active) continue;
    groupsByKey.get(key).options.push({
      id: Number(row.option_id),
      label: String(row.option_label || ''),
      value: String(row.option_value || ''),
      price_adjustment: Number(row.price_adjustment || 0),
      price_type: String(row.price_type || 'fixed'),
      is_default: !!row.is_default,
      sort_order: Number(row.option_sort_order || 0),
      is_active: !!row.option_active,
    });
  }
  return Array.from(groupsByKey.values());
}

async function replaceModifierCatalog(payload) {
  const groups = Array.isArray(payload?.groups) ? payload.groups : [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const keptGroupIds = [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i] || {};
      const key = String(g.key || '').trim().toLowerCase();
      const name = String(g.name || '').trim();
      if (!key || !name) continue;
      const groupRes = await client.query(
        `INSERT INTO modifier_groups (name, key, input_type, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (key)
         DO UPDATE SET
           name = EXCLUDED.name,
           input_type = EXCLUDED.input_type,
           sort_order = EXCLUDED.sort_order,
           is_active = EXCLUDED.is_active,
           updated_at = NOW()
         RETURNING id`,
        [
          name,
          key,
          String(g.input_type || 'dropdown'),
          g.sort_order != null ? Number(g.sort_order) : i,
          g.is_active !== false,
        ]
      );
      const groupId = Number(groupRes.rows[0].id);
      keptGroupIds.push(groupId);

      const options = Array.isArray(g.options) ? g.options : [];
      const keptOptionIds = [];
      for (let j = 0; j < options.length; j++) {
        const o = options[j] || {};
        const value = String(o.value || o.label || '').trim();
        const label = String(o.label || '').trim();
        if (!label) continue;
        const explicitOptionId = o.id != null ? Number(o.id) : null;

        if (explicitOptionId != null && Number.isFinite(explicitOptionId)) {
          const checkRes = await client.query(
            `SELECT id FROM modifier_options WHERE id = $1 AND modifier_group_id = $2`,
            [explicitOptionId, groupId]
          );
          if (checkRes.rows.length > 0) {
            const updateRes = await client.query(
              `UPDATE modifier_options
               SET
                 label = $1,
                 value = $2,
                 price_adjustment = $3,
                 price_type = $4,
                 is_default = $5,
                 sort_order = $6,
                 is_active = $7,
                 updated_at = NOW()
               WHERE id = $8
               RETURNING id`,
              [
                label,
                value,
                o.price_adjustment != null ? Number(o.price_adjustment) : 0,
                String(o.price_type || 'fixed'),
                o.is_default === true,
                o.sort_order != null ? Number(o.sort_order) : j,
                o.is_active !== false,
                explicitOptionId,
              ]
            );
            keptOptionIds.push(Number(updateRes.rows[0].id));
            continue;
          }
        }

        const insertRes = await client.query(
          `INSERT INTO modifier_options (modifier_group_id, label, value, price_adjustment, price_type, is_default, sort_order, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            groupId,
            label,
            value,
            o.price_adjustment != null ? Number(o.price_adjustment) : 0,
            String(o.price_type || 'fixed'),
            o.is_default === true,
            o.sort_order != null ? Number(o.sort_order) : j,
            o.is_active !== false,
          ]
        );
        keptOptionIds.push(Number(insertRes.rows[0].id));
      }

      if (keptOptionIds.length > 0) {
        await client.query(
          `DELETE FROM modifier_options
           WHERE modifier_group_id = $1
             AND NOT (id = ANY($2::int[]))`,
          [groupId, keptOptionIds]
        );
      } else {
        await client.query(`DELETE FROM modifier_options WHERE modifier_group_id = $1`, [groupId]);
      }
    }

    if (keptGroupIds.length > 0) {
      await client.query(
        `DELETE FROM modifier_groups
         WHERE NOT (id = ANY($1::int[]))`,
        [keptGroupIds]
      );
    } else {
      await client.query(`DELETE FROM modifier_groups`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const getAllProducts = async (req, res) => {
  try {
    const { category, subcategory, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Show all products on storefront (admin can set is_active=false later to hide)
    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (category) {
      // Include parent category and all its children (subcategories)
      query += ` AND (c.slug = $${paramCount} OR c.parent_id = (SELECT id FROM categories WHERE slug = $${paramCount} LIMIT 1))`;
      params.push(category);
      paramCount++;
    }

    if (subcategory) {
      query += ` AND p.subcategory = $${paramCount}`;
      params.push(subcategory);
      paramCount++;
    }

    if (search) {
      query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount} OR c.name ILIKE $${paramCount} OR p.subcategory ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1';
    const countParams = [];
    let countParamCount = 1;

    if (category) {
      countQuery += ` AND (c.slug = $${countParamCount} OR c.parent_id = (SELECT id FROM categories WHERE slug = $${countParamCount} LIMIT 1))`;
      countParams.push(category);
      countParamCount++;
    }

    if (subcategory) {
      countQuery += ` AND p.subcategory = $${countParamCount}`;
      countParams.push(subcategory);
      countParamCount++;
    }

    if (search) {
      countQuery += ` AND (p.name ILIKE $${countParamCount} OR p.description ILIKE $${countParamCount} OR c.name ILIKE $${countParamCount} OR p.subcategory ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      products: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Failed to fetch products' });
  }
};

const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    const product = result.rows[0];
    product.size_options = await getProductSizeOptions(product.id);
    product.purchase_options = await getProductPurchaseOptions(product.id);
    product.modifier_groups = await getProductModifierGroups(product.id);
    product.conditional_modifier_rules = await getProductConditionalModifierRules(product.id);
    product.shipping_box_rules = await getProductShippingBoxRules(product.id);
    const sm = product.size_mode != null ? String(product.size_mode).trim() : '';
    if (!sm && Array.isArray(product.size_options) && product.size_options.length > 0) {
      product.size_mode = 'predefined';
    }
    res.json({ product });
  } catch (error) {
    console.error('❌ Get product error:', error);
    res.status(500).json({ message: 'Failed to fetch product' });
  }
};

const getProductModifierConfigAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Product not found' });
    const groups = await getProductModifierGroups(id, { includeInactive: true });
    const conditional_rules = await getProductConditionalModifierRules(id);
    res.json({ product_id: Number(id), groups, conditional_rules });
  } catch (error) {
    console.error('Get product modifier config error:', error);
    res.status(500).json({ message: 'Failed to fetch product modifier config' });
  }
};

const updateProductModifierConfigAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Product not found' });
    await replaceProductModifierConfig(id, req.body || {});
    const groups = await getProductModifierGroups(id, { includeInactive: true });
    const conditional_rules = await getProductConditionalModifierRules(id);
    res.json({ product_id: Number(id), groups, conditional_rules });
  } catch (error) {
    console.error('Update product modifier config error:', error);
    const code = /not found|invalid|required/i.test(String(error.message || '')) ? 400 : 500;
    res.status(code).json({ message: error.message || 'Failed to update product modifier config' });
  }
};

const getModifierCatalogAdmin = async (req, res) => {
  try {
    const groups = await getModifierCatalog({ includeInactive: true });
    res.json({ groups });
  } catch (error) {
    console.error('Get modifier catalog error:', error);
    res.status(500).json({ message: 'Failed to fetch modifier catalog' });
  }
};

const updateModifierCatalogAdmin = async (req, res) => {
  try {
    await replaceModifierCatalog(req.body || {});
    const groups = await getModifierCatalog({ includeInactive: true });
    res.json({ groups });
  } catch (error) {
    console.error('Update modifier catalog error:', error);
    const code = /invalid|required|constraint/i.test(String(error.message || '')) ? 400 : 500;
    res.status(code).json({ message: error.message || 'Failed to update modifier catalog' });
  }
};

const deleteModifierCatalogGroupAdmin = async (req, res) => {
  try {
    const rawKey = req.params?.key;
    const key = String(rawKey || '').trim().toLowerCase();
    if (!key) {
      return res.status(400).json({ message: 'Modifier key is required.' });
    }
    const result = await pool.query(
      `DELETE FROM modifier_groups WHERE key = $1 RETURNING id, key, name`,
      [key]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Modifier group not found.' });
    }
    return res.json({
      message: 'Modifier group deleted.',
      group: result.rows[0],
    });
  } catch (error) {
    console.error('Delete modifier catalog group error:', error);
    return res.status(500).json({ message: 'Failed to delete modifier group' });
  }
};

function parsePresetModifierGroupIds(body) {
  const raw = body?.modifier_group_ids ?? body?.modifierGroupIds;
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const x of raw) {
    const n = Number(x);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

async function fetchModifierPresetsPayload() {
  const presetsRes = await pool.query(
    `SELECT id, name, sort_order, created_at, updated_at
     FROM modifier_presets
     ORDER BY sort_order ASC, id ASC`
  );
  if (presetsRes.rows.length === 0) return [];
  const presetIds = presetsRes.rows.map((r) => Number(r.id));
  const itemsRes = await pool.query(
    `SELECT mpi.id, mpi.modifier_preset_id, mpi.modifier_group_id, mpi.sort_order,
            mg.key AS group_key, mg.name AS group_name
     FROM modifier_preset_items mpi
     INNER JOIN modifier_groups mg ON mg.id = mpi.modifier_group_id
     WHERE mpi.modifier_preset_id = ANY($1::int[])
     ORDER BY mpi.modifier_preset_id ASC, mpi.sort_order ASC, mpi.id ASC`,
    [presetIds]
  );
  const byPreset = new Map();
  for (const row of itemsRes.rows) {
    const pid = Number(row.modifier_preset_id);
    if (!byPreset.has(pid)) byPreset.set(pid, []);
    byPreset.get(pid).push({
      id: Number(row.id),
      modifier_group_id: Number(row.modifier_group_id),
      sort_order: Number(row.sort_order || 0),
      key: String(row.group_key || ''),
      name: String(row.group_name || ''),
    });
  }
  return presetsRes.rows.map((p) => ({
    id: Number(p.id),
    name: String(p.name || ''),
    sort_order: Number(p.sort_order || 0),
    modifiers: byPreset.get(Number(p.id)) || [],
  }));
}

const getModifierPresetsAdmin = async (req, res) => {
  try {
    const presets = await fetchModifierPresetsPayload();
    res.json({ presets });
  } catch (error) {
    console.error('Get modifier presets error:', error);
    res.status(500).json({ message: 'Failed to fetch modifier presets' });
  }
};

const createModifierPresetAdmin = async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) {
    return res.status(400).json({ message: 'Preset name is required.' });
  }
  const ids = parsePresetModifierGroupIds(req.body);
  const sortOrder = req.body?.sort_order != null ? Number(req.body.sort_order) : 0;
  const client = await pool.connect();
  let presetId;
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO modifier_presets (name, sort_order) VALUES ($1, $2) RETURNING id`,
      [name, Number.isFinite(sortOrder) ? sortOrder : 0]
    );
    presetId = Number(ins.rows[0].id);
    for (let i = 0; i < ids.length; i++) {
      const gid = ids[i];
      const check = await client.query(`SELECT id FROM modifier_groups WHERE id = $1`, [gid]);
      if (check.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Modifier not found (id ${gid}). Save modifiers first.` });
      }
      await client.query(
        `INSERT INTO modifier_preset_items (modifier_preset_id, modifier_group_id, sort_order)
         VALUES ($1, $2, $3)`,
        [presetId, gid, i]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore
    }
    console.error('Create modifier preset error:', error);
    const msg = String(error.message || '');
    if (/modifier_presets|modifier_preset_items/i.test(msg)) {
      return res.status(500).json({ message: 'Database is missing modifier preset tables. Run migrations.' });
    }
    return res.status(500).json({ message: 'Failed to create modifier preset' });
  } finally {
    client.release();
  }
  try {
    const presets = await fetchModifierPresetsPayload();
    const created = presets.find((p) => p.id === presetId);
    res.status(201).json({
      preset: created || { id: presetId, name, sort_order: sortOrder, modifiers: [] },
    });
  } catch (error) {
    console.error('Create modifier preset fetch error:', error);
    res.status(201).json({ preset: { id: presetId, name, sort_order: sortOrder, modifiers: [] } });
  }
};

const updateModifierPresetAdmin = async (req, res) => {
  const presetId = Number(req.params?.id);
  if (!Number.isFinite(presetId) || presetId <= 0) {
    return res.status(400).json({ message: 'Invalid preset id.' });
  }
  const nameRaw = req.body?.name;
  const ids = parsePresetModifierGroupIds(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exist = await client.query(`SELECT id FROM modifier_presets WHERE id = $1`, [presetId]);
    if (exist.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Preset not found.' });
    }
    if (nameRaw != null) {
      const name = String(nameRaw || '').trim();
      if (!name) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Preset name cannot be empty.' });
      }
      await client.query(`UPDATE modifier_presets SET name = $1, updated_at = NOW() WHERE id = $2`, [
        name,
        presetId,
      ]);
    }
    if (req.body?.modifier_group_ids != null || req.body?.modifierGroupIds != null) {
      await client.query(`DELETE FROM modifier_preset_items WHERE modifier_preset_id = $1`, [presetId]);
      for (let i = 0; i < ids.length; i++) {
        const gid = ids[i];
        const check = await client.query(`SELECT id FROM modifier_groups WHERE id = $1`, [gid]);
        if (check.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: `Modifier not found (id ${gid}).` });
        }
        await client.query(
          `INSERT INTO modifier_preset_items (modifier_preset_id, modifier_group_id, sort_order)
           VALUES ($1, $2, $3)`,
          [presetId, gid, i]
        );
      }
    }
    if (req.body?.sort_order != null) {
      const so = Number(req.body.sort_order);
      if (Number.isFinite(so)) {
        await client.query(`UPDATE modifier_presets SET sort_order = $1, updated_at = NOW() WHERE id = $2`, [
          so,
          presetId,
        ]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore
    }
    console.error('Update modifier preset error:', error);
    return res.status(500).json({ message: 'Failed to update modifier preset' });
  } finally {
    client.release();
  }
  try {
    const presets = await fetchModifierPresetsPayload();
    const updated = presets.find((p) => p.id === presetId);
    res.json({ preset: updated || { id: presetId, name: '', sort_order: 0, modifiers: [] } });
  } catch (error) {
    console.error('Update modifier preset fetch error:', error);
    res.status(500).json({ message: 'Preset updated but failed to reload.' });
  }
};

const deleteModifierPresetAdmin = async (req, res) => {
  const presetId = Number(req.params?.id);
  if (!Number.isFinite(presetId) || presetId <= 0) {
    return res.status(400).json({ message: 'Invalid preset id.' });
  }
  try {
    const result = await pool.query(`DELETE FROM modifier_presets WHERE id = $1 RETURNING id, name`, [
      presetId,
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Preset not found.' });
    }
    res.json({ message: 'Preset deleted.', preset: result.rows[0] });
  } catch (error) {
    console.error('Delete modifier preset error:', error);
    res.status(500).json({ message: 'Failed to delete modifier preset' });
  }
};

const getProductPurchaseOptionsAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Product not found' });
    const options = await getProductPurchaseOptions(id);
    res.json({ product_id: Number(id), purchase_options: options });
  } catch (error) {
    console.error('Get product purchase options error:', error);
    res.status(500).json({ message: 'Failed to fetch product purchase options' });
  }
};

const updateProductPurchaseOptionsAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Product not found' });
    const parsed = parsePurchaseOptionsInput(req.body?.purchase_options ?? []);
    await replaceProductPurchaseOptions(id, parsed);
    const options = await getProductPurchaseOptions(id);
    res.json({ product_id: Number(id), purchase_options: options });
  } catch (error) {
    console.error('Update product purchase options error:', error);
    const code = /invalid|required/i.test(String(error.message || '')) ? 400 : 500;
    res.status(code).json({ message: error.message || 'Failed to update product purchase options' });
  }
};

const getProductShippingBoxRulesAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Product not found' });
    const shipping_box_rules = await getProductShippingBoxRules(id);
    res.json({ product_id: Number(id), shipping_box_rules });
  } catch (error) {
    console.error('Get product shipping box rules error:', error);
    res.status(500).json({ message: 'Failed to fetch product shipping box rules' });
  }
};

const updateProductShippingBoxRulesAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Product not found' });
    const parsedRules = parseShippingBoxRulesInput(req.body?.shipping_box_rules);
    await replaceProductShippingBoxRules(id, parsedRules);
    const shipping_box_rules = await getProductShippingBoxRules(id);
    res.json({ product_id: Number(id), shipping_box_rules });
  } catch (error) {
    console.error('Update product shipping box rules error:', error);
    const code = /Shipping box|Box rule|minimum smallest side/i.test(String(error?.message || '')) ? 400 : 500;
    res.status(code).json({ message: error.message || 'Failed to update product shipping box rules' });
  }
};

function normalizeHardwareOptionKey(value, fallbackIndex) {
  const raw = String(value || '').trim().toLowerCase();
  const normalized = raw.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (normalized) return normalized;
  return `option_${fallbackIndex + 1}`;
}

function parseHardwareTemplatePayload(body) {
  const name = String(body?.name || '').trim();
  const rawOptions = Array.isArray(body?.options) ? body.options : [];
  const options = rawOptions
    .map((opt, index) => ({
      label: String(opt?.label || '').trim(),
      option_key: normalizeHardwareOptionKey(opt?.option_key || opt?.label, index),
      unit_price: asNumberOrNull(opt?.unit_price ?? opt?.unitPrice) ?? 0,
      is_default: opt?.is_default === true || opt?.isDefault === true,
      sort_order: index,
      modifiers: Array.isArray(opt?.modifiers) ? opt.modifiers : [],
    }))
    .filter((opt) => opt.label);

  if (!name) throw new Error('Template name is required.');
  if (options.length !== 2) throw new Error('Hardware template must contain exactly 2 options.');
  if (!options.some((opt) => opt.is_default)) {
    options[0].is_default = true;
  }

  const defaultCount = options.filter((opt) => opt.is_default).length;
  if (defaultCount !== 1) {
    throw new Error('Exactly one option must be default.');
  }

  const keySet = new Set();
  for (const opt of options) {
    if (opt.unit_price < 0) throw new Error('Option price must be zero or greater.');
    if (keySet.has(opt.option_key)) throw new Error('Option keys must be unique.');
    keySet.add(opt.option_key);
  }

  return { name, options };
}

async function computeHardwareOptionPricing(client, baseUnitPrice, modifierGroupIds) {
  const base = asNumberOrNull(baseUnitPrice) ?? 0;
  if (!Array.isArray(modifierGroupIds) || modifierGroupIds.length === 0) {
    return { base_unit_price: base, modifier_total: 0, computed_unit_price: base };
  }

  let modifierTotal = 0;
  const uniqueGroupIds = Array.from(
    new Set(
      modifierGroupIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id))
    )
  );

  for (const groupId of uniqueGroupIds) {
    const optRes = await client.query(
      `SELECT price_adjustment, price_type
       FROM modifier_options
       WHERE modifier_group_id = $1
         AND is_active = true
       ORDER BY is_default DESC, sort_order ASC, id ASC
       LIMIT 1`,
      [groupId]
    );
    if (optRes.rows.length === 0) continue;
    const row = optRes.rows[0];
    const adjustment = asNumberOrNull(row.price_adjustment) ?? 0;
    const priceType = String(row.price_type || 'percent').trim().toLowerCase();
    if (priceType === 'fixed') {
      modifierTotal += adjustment;
    } else {
      modifierTotal += base * (adjustment / 100);
    }
  }

  return {
    base_unit_price: base,
    modifier_total: modifierTotal,
    computed_unit_price: base + modifierTotal,
  };
}

async function getHardwareTemplatesNested(client) {
  const templatesRes = await client.query(
    `SELECT id, name, is_active, created_at, updated_at
     FROM hardware_templates
     ORDER BY updated_at DESC, id DESC`
  );
  if (templatesRes.rows.length === 0) return [];

  const optionsRes = await client.query(
    `SELECT id, hardware_template_id, label, option_key, unit_price, base_unit_price, modifier_total, computed_unit_price, is_default, sort_order, is_active
     FROM hardware_template_options
     ORDER BY hardware_template_id ASC, sort_order ASC, id ASC`
  );

  const templateIds = templatesRes.rows.map((t) => Number(t.id));
  const optionIds = optionsRes.rows.map((o) => Number(o.id));

  let modifiersRes = { rows: [] };
  if (optionIds.length > 0) {
    modifiersRes = await client.query(
      `SELECT
         htom.hardware_template_option_id,
         htom.is_required,
         htom.sort_order,
         mg.id AS modifier_group_id,
         mg.key AS modifier_key,
         mg.name AS modifier_name
       FROM hardware_template_option_modifiers htom
       INNER JOIN modifier_groups mg ON mg.id = htom.modifier_group_id
       WHERE htom.hardware_template_option_id = ANY($1::int[])
         AND htom.is_active = true
         AND mg.is_active = true
       ORDER BY htom.hardware_template_option_id ASC, htom.sort_order ASC, mg.sort_order ASC, mg.id ASC`,
      [optionIds]
    );
  }

  const modsByOptionId = new Map();
  for (const row of modifiersRes.rows) {
    const optionId = Number(row.hardware_template_option_id);
    if (!modsByOptionId.has(optionId)) modsByOptionId.set(optionId, []);
    modsByOptionId.get(optionId).push({
      id: Number(row.modifier_group_id),
      key: String(row.modifier_key || ''),
      name: String(row.modifier_name || ''),
      is_required: !!row.is_required,
      sort_order: Number(row.sort_order || 0),
    });
  }

  const optionsByTemplateId = new Map();
  for (const row of optionsRes.rows) {
    const templateId = Number(row.hardware_template_id);
    if (!templateIds.includes(templateId)) continue;
    if (!optionsByTemplateId.has(templateId)) optionsByTemplateId.set(templateId, []);
    optionsByTemplateId.get(templateId).push({
      id: Number(row.id),
      label: String(row.label || ''),
      option_key: String(row.option_key || ''),
      unit_price: Number(row.unit_price || 0),
      base_unit_price: asNumberOrNull(row.base_unit_price) ?? asNumberOrNull(row.unit_price) ?? 0,
      modifier_total: asNumberOrNull(row.modifier_total) ?? 0,
      computed_unit_price: asNumberOrNull(row.computed_unit_price) ?? asNumberOrNull(row.unit_price) ?? 0,
      is_default: !!row.is_default,
      sort_order: Number(row.sort_order || 0),
      is_active: !!row.is_active,
      modifiers: modsByOptionId.get(Number(row.id)) || [],
    });
  }

  return templatesRes.rows.map((t) => ({
    id: Number(t.id),
    name: String(t.name || ''),
    is_active: !!t.is_active,
    created_at: t.created_at,
    updated_at: t.updated_at,
    options: optionsByTemplateId.get(Number(t.id)) || [],
  }));
}

const getHardwareTemplatesAdmin = async (_req, res) => {
  try {
    const templates = await getHardwareTemplatesNested(pool);
    res.json({ templates });
  } catch (error) {
    console.error('Get hardware templates error:', error);
    res.status(500).json({ message: 'Failed to fetch hardware templates' });
  }
};

const upsertHardwareTemplateAdmin = async (req, res) => {
  const idRaw = req.params?.id;
  const templateId = idRaw != null && idRaw !== '' ? parseInt(String(idRaw), 10) : null;
  const client = await pool.connect();
  try {
    const { name, options } = parseHardwareTemplatePayload(req.body || {});
    await client.query('BEGIN');

    let activeTemplateId = templateId;
    if (activeTemplateId) {
      const check = await client.query('SELECT id FROM hardware_templates WHERE id = $1', [activeTemplateId]);
      if (check.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Hardware template not found.' });
      }
      await client.query(
        `UPDATE hardware_templates
         SET name = $1, updated_at = NOW()
         WHERE id = $2`,
        [name, activeTemplateId]
      );
      await client.query('DELETE FROM hardware_template_option_modifiers WHERE hardware_template_option_id IN (SELECT id FROM hardware_template_options WHERE hardware_template_id = $1)', [activeTemplateId]);
      await client.query('DELETE FROM hardware_template_options WHERE hardware_template_id = $1', [activeTemplateId]);
    } else {
      const insertTemplate = await client.query(
        `INSERT INTO hardware_templates (name, is_active)
         VALUES ($1, true)
         RETURNING id`,
        [name]
      );
      activeTemplateId = Number(insertTemplate.rows[0].id);
    }

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const optionRes = await client.query(
        `INSERT INTO hardware_template_options (hardware_template_id, label, option_key, unit_price, base_unit_price, modifier_total, computed_unit_price, is_default, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5, 0, $4, $6, $7, true)
         RETURNING id`,
        [activeTemplateId, opt.label, opt.option_key, opt.unit_price, opt.unit_price, !!opt.is_default, i]
      );
      const hardwareTemplateOptionId = Number(optionRes.rows[0].id);

      const modifierRows = [];
      for (const m of opt.modifiers) {
        const key = String(m?.key || m?.modifier_key || '').trim().toLowerCase();
        if (!key) continue;
        modifierRows.push({
          key,
          is_required: m?.is_required === true,
        });
      }

      for (let j = 0; j < modifierRows.length; j++) {
        const m = modifierRows[j];
        const groupRes = await client.query(
          `SELECT id FROM modifier_groups WHERE key = $1 AND is_active = true`,
          [m.key]
        );
        if (groupRes.rows.length === 0) continue;
        const modifierGroupId = Number(groupRes.rows[0].id);
        m.modifier_group_id = modifierGroupId;
        await client.query(
          `INSERT INTO hardware_template_option_modifiers (hardware_template_option_id, modifier_group_id, is_required, sort_order, is_active)
           VALUES ($1, $2, $3, $4, true)`,
          [hardwareTemplateOptionId, modifierGroupId, m.is_required, j]
        );
      }

      const computed = await computeHardwareOptionPricing(
        client,
        opt.unit_price,
        modifierRows.map((m) => m.modifier_group_id).filter((id) => id != null)
      );
      await client.query(
        `UPDATE hardware_template_options
         SET base_unit_price = $1, modifier_total = $2, computed_unit_price = $3, updated_at = NOW()
         WHERE id = $4`,
        [computed.base_unit_price, computed.modifier_total, computed.computed_unit_price, hardwareTemplateOptionId]
      );
    }

    await client.query('COMMIT');
    const templates = await getHardwareTemplatesNested(pool);
    const saved = templates.find((t) => Number(t.id) === Number(activeTemplateId)) || null;
    res.json({ template: saved, templates });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Upsert hardware template error:', error);
    const code = /required|exactly|must|unique/i.test(String(error.message || '')) ? 400 : 500;
    res.status(code).json({ message: error.message || 'Failed to save hardware template' });
  } finally {
    client.release();
  }
};

const deleteHardwareTemplateAdmin = async (req, res) => {
  try {
    const id = parseInt(String(req.params?.id || ''), 10);
    if (Number.isNaN(id)) return res.status(400).json({ message: 'Invalid template id.' });
    const deleted = await pool.query('DELETE FROM hardware_templates WHERE id = $1 RETURNING id, name', [id]);
    if (deleted.rowCount === 0) return res.status(404).json({ message: 'Hardware template not found.' });
    res.json({ message: 'Hardware template deleted.', template: deleted.rows[0] });
  } catch (error) {
    console.error('Delete hardware template error:', error);
    res.status(500).json({ message: 'Failed to delete hardware template' });
  }
};

const previewProductPrice = async (req, res) => {
  try {
    const { id } = req.params;
    const productId = parseInt(String(id), 10);
    if (Number.isNaN(productId)) {
      return res.status(400).json({ message: 'Invalid product id.' });
    }
    const config = await getProductPricingConfig(productId);
    if (!config) {
      return res.status(404).json({ message: 'Product not found' });
    }
    const pricing = validateAndCalculatePricing(config, req.body || {});
    return res.json({ pricing });
  } catch (error) {
    const code = /required|invalid|must|missing|supported|at least|at most|configured/i.test(String(error.message || ''))
      ? 400
      : 500;
    return res.status(code).json({ message: 'Failed to preview price' });
  }
};

const getCategories = async (req, res) => {
  try {
    /**
     * Parent rows (parent_id IS NULL): count active products in that category OR any descendant subcategory.
     * Subcategory rows: count active products with category_id = that row only.
     * Recomputed on every request — updates when products move between categories.
     */
    const result = await pool.query(
      `SELECT c.*,
        CASE
          WHEN c.parent_id IS NULL THEN (
            SELECT COUNT(*)::int
            FROM products p
            WHERE p.is_active = true
              AND p.category_id IN (
                WITH RECURSIVE subtree AS (
                  SELECT id FROM categories WHERE id = c.id
                  UNION ALL
                  SELECT ch.id FROM categories ch
                  INNER JOIN subtree s ON ch.parent_id = s.id
                )
                SELECT id FROM subtree
              )
          )
          ELSE (
            SELECT COUNT(*)::int
            FROM products p
            WHERE p.is_active = true AND p.category_id = c.id
          )
        END AS product_count
       FROM categories c
       ORDER BY c.display_order, c.name`
    );

    const categories = result.rows.map((cat) => ({
      ...cat,
      product_count: parseInt(cat.product_count, 10) || 0,
    }));

    res.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
};

const getRelatedProducts = async (req, res) => {
  try {
    const { productId, limit = 8 } = req.query;

    if (!productId) {
      return res.status(400).json({ message: 'Product ID is required' });
    }

    // First, get the current product's category
    const productResult = await pool.query(
      `SELECT p.category_id, c.slug as category_slug FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [productId]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const currentCategoryId = productResult.rows[0].category_id;
    const currentCategorySlug = productResult.rows[0].category_slug;

    // Get products from different categories (excluding current product)
    // Priority: Different categories first, then same category but different products
    const result = await pool.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id != $1
       ORDER BY 
         (CASE WHEN p.category_id IS DISTINCT FROM $2 THEN 0 ELSE 1 END),
         RANDOM()
       LIMIT $3`,
      [productId, currentCategoryId, limit]
    );

    res.json({ 
      products: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get related products error:', error);
    res.status(500).json({ message: 'Failed to fetch related products' });
  }
};

/** Admin: get all categories including for dropdown (no auth on getCategories is public, so admin uses same) */

const createCategory = async (req, res) => {
  try {
    const { name, slug, parent_id, description, display_order, image_url } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ message: 'Name and slug are required' });
    }
    const result = await pool.query(
      `INSERT INTO categories (name, slug, parent_id, description, display_order, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, slug.trim().toLowerCase().replace(/\s+/g, '-'), parent_id || null, description || null, display_order != null ? parseInt(display_order) : 0, image_url || null]
    );
    res.status(201).json({ category: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ message: 'Category slug already exists' });
    console.error('Create category error:', error);
    res.status(500).json({ message: 'Failed to create category' });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, parent_id, description, display_order, image_url } = req.body;
    const getResult = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
    if (getResult.rows.length === 0) return res.status(404).json({ message: 'Category not found' });
    const row = getResult.rows[0];
    const nameVal = name !== undefined ? name : row.name;
    const slugVal = slug !== undefined ? slug.trim().toLowerCase().replace(/\s+/g, '-') : row.slug;
    const parentIdVal = parent_id !== undefined ? (parent_id === '' || parent_id === null ? null : parent_id) : row.parent_id;
    const descVal = description !== undefined ? description : row.description;
    const orderVal = display_order !== undefined ? parseInt(display_order) : row.display_order;
    const imageUrlVal = image_url !== undefined ? image_url : row.image_url;
    const result = await pool.query(
      `UPDATE categories SET name = $1, slug = $2, parent_id = $3, description = $4, display_order = $5, image_url = $6 WHERE id = $7 RETURNING *`,
      [nameVal, slugVal, parentIdVal, descVal, orderVal, imageUrlVal, id]
    );
    res.json({ category: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ message: 'Category slug already exists' });
    console.error('Update category error:', error);
    res.status(500).json({ message: 'Failed to update category' });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM products WHERE category_id = $1) AS products_count,
        (SELECT COUNT(*) FROM categories WHERE parent_id = $1) AS children_count`,
      [id]
    );
    const { products_count, children_count } = check.rows[0];
    if (parseInt(products_count) > 0) {
      return res.status(400).json({ message: 'Cannot delete category that has products. Remove or reassign products first.' });
    }
    if (parseInt(children_count) > 0) {
      return res.status(400).json({ message: 'Cannot delete category that has subcategories. Delete subcategories first.' });
    }
    const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Category not found' });
    res.json({ message: 'Category deleted', id: result.rows[0].id });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ message: 'Failed to delete category' });
  }
};

const createProduct = async (req, res) => {
  try {
    const {
      name,
      slug,
      description,
      spec,
      file_setup,
      installation_guide,
      faq,
      category_id,
      subcategory,
      price,
      price_per_sqft,
      min_charge,
      material,
      image_url,
      is_new,
      is_active,
      sku,
      properties,
      gallery_images,
      pricing_mode,
      size_mode,
      base_unit,
      min_width,
      max_width,
      min_height,
      max_height,
      size_options,
      graphic_scenario_enabled,
      hardware_template_id,
      purchase_options,
      weight,
      weight_per_sqft,
      length,
      shipping_length,
      shipping_width,
      shipping_height,
      shipping_weight,
      shipping_box_rules,
      production_time,
      production_time_rules,
      product_highlights,
    } = req.body;
    if (!name) return res.status(400).json({ message: 'Product name is required' });
    const slugVal = slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
    const isActiveVal = (is_active === undefined || is_active === null) ? true : (is_active !== false && is_active !== 'false');
    const propsVal = Array.isArray(properties) ? JSON.stringify(properties) : (typeof properties === 'string' ? properties : '[]');
    const faqVal = Array.isArray(faq) ? JSON.stringify(faq) : (typeof faq === 'string' ? faq : '[]');
    const galleryFromBody = normalizeGalleryArrayInput(gallery_images);
    const galleryFinal = galleryFromBody.length ? galleryFromBody : (image_url ? [String(image_url).trim()] : []);
    const imageUrlFinal = galleryFinal[0] || null;
    const galleryJson = JSON.stringify(galleryFinal);
    const pricingModeVal = normalizeMode(pricing_mode, price_per_sqft != null ? 'area' : 'fixed');
    const graphicScenarioEnabledVal = graphic_scenario_enabled === true || graphic_scenario_enabled === 'true';
    const hardwareTemplateIdVal =
      hardware_template_id === undefined || hardware_template_id === null || hardware_template_id === ''
        ? null
        : parseInt(String(hardware_template_id), 10);
    if (hardwareTemplateIdVal != null) {
      if (!Number.isFinite(hardwareTemplateIdVal)) {
        return res.status(400).json({ message: 'Invalid hardware_template_id.' });
      }
      const hwCheck = await pool.query('SELECT id FROM hardware_templates WHERE id = $1', [hardwareTemplateIdVal]);
      if (hwCheck.rows.length === 0) {
        return res.status(400).json({ message: 'Selected hardware template does not exist.' });
      }
    }
    if (graphicScenarioEnabledVal && pricingModeVal !== 'fixed') {
      return res.status(400).json({ message: 'Graphic scenario products must use fixed pricing.' });
    }
    const pricePerSqftVal = graphicScenarioEnabledVal
      ? null
      : (price_per_sqft != null ? parseFloat(price_per_sqft) : null);
    const sizeModeVal = normalizeMode(size_mode, 'custom');
    const baseUnitVal = String(base_unit || 'inch').trim().toLowerCase() || 'inch';
    const minWidthVal = asNumberOrNull(min_width);
    const maxWidthVal = asNumberOrNull(max_width);
    const minHeightVal = asNumberOrNull(min_height);
    const maxHeightVal = asNumberOrNull(max_height);
    const weightVal = asNumberOrNull(weight);
    const weightPerSqftVal = asNumberOrNull(weight_per_sqft);
    const lengthVal = asNumberOrNull(length);
    const shippingLengthVal = asNumberOrNull(shipping_length);
    const shippingWidthVal = asNumberOrNull(shipping_width);
    const shippingHeightVal = asNumberOrNull(shipping_height);
    const shippingWeightVal = asNumberOrNull(shipping_weight);
    const parsedShippingBoxRules = parseShippingBoxRulesInput(shipping_box_rules);
    const fedexShippingValidationError = validateFedexShippingDataForHardware({
      isHardware: graphicScenarioEnabledVal,
      shippingLength: shippingLengthVal,
      shippingWidth: shippingWidthVal,
      shippingHeight: shippingHeightVal,
      shippingWeight: shippingWeightVal,
    });
    if (fedexShippingValidationError) {
      return res.status(400).json({ message: fedexShippingValidationError });
    }
    const productionTimeVal = asIntegerOrNull(production_time);
    const productionTimeRulesResult = validateProductionTimeRules(production_time_rules);
    if (productionTimeRulesResult.error) {
      return res.status(400).json({ message: productionTimeRulesResult.error });
    }
    const productionTimeRulesVal = JSON.stringify(productionTimeRulesResult.rules);
    const highlightsVal = Array.isArray(product_highlights)
      ? JSON.stringify(product_highlights.map(String).filter((s) => s.trim()))
      : '[]';
    const parsedSizeOptions = parseSizeOptionsInput(size_options);
    if (sizeModeVal === 'predefined' && parsedSizeOptions.length === 0) {
      return res.status(400).json({ message: 'size_options are required when size_mode is predefined.' });
    }
    if (!graphicScenarioEnabledVal && parsedShippingBoxRules.length > 0 && !(weightPerSqftVal > 0)) {
      return res.status(400).json({ message: 'Weight per sq ft is required when shipping box rules are configured.' });
    }

    const result = await pool.query(
      `INSERT INTO products (name, slug, description, spec, file_setup, installation_guide, faq, category_id, subcategory, price, price_per_sqft, min_charge, material, image_url, is_new, is_active, sku, properties, gallery_images, pricing_mode, size_mode, base_unit, min_width, max_width, min_height, max_height, graphic_scenario_enabled, hardware_template_id, weight, length, shipping_length, shipping_width, shipping_height, shipping_weight, production_time, production_time_rules, product_highlights)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19::jsonb, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36::jsonb, $37::jsonb)
       RETURNING *`,
      [
        name,
        slugVal,
        description || null,
        spec || null,
        file_setup || null,
        installation_guide || null,
        faqVal,
        category_id || null,
        subcategory || null,
        price != null ? parseFloat(price) : null,
        pricePerSqftVal,
        min_charge != null ? parseFloat(min_charge) : null,
        material || null,
        imageUrlFinal,
        is_new === true || is_new === 'true',
        isActiveVal,
        sku || null,
        propsVal,
        galleryJson,
        pricingModeVal,
        sizeModeVal,
        baseUnitVal,
        minWidthVal,
        maxWidthVal,
        minHeightVal,
        maxHeightVal,
        graphicScenarioEnabledVal,
        hardwareTemplateIdVal,
        weightVal,
        weightPerSqftVal,
        lengthVal,
        shippingLengthVal,
        shippingWidthVal,
        shippingHeightVal,
        shippingWeightVal,
        productionTimeVal,
        productionTimeRulesVal,
        highlightsVal,
      ]
    );
    const created = result.rows[0];
    await replaceProductSizeOptions(created.id, parsedSizeOptions);
    await replaceProductShippingBoxRules(created.id, parsedShippingBoxRules);
    const parsedPurchaseOptions = parsePurchaseOptionsInput(purchase_options);
    await replaceProductPurchaseOptions(created.id, parsedPurchaseOptions);
    created.size_options = await getProductSizeOptions(created.id);
    created.purchase_options = await getProductPurchaseOptions(created.id);
    res.status(201).json({ product: created });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ message: 'Product slug already exists' });
    if (
      /Shipping box|Box rule|minimum smallest side/i.test(String(error?.message || ''))
    ) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Create product error:', error);
    res.status(500).json({ message: 'Failed to create product' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const getResult = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (getResult.rows.length === 0) return res.status(404).json({ message: 'Product not found' });
    const row = getResult.rows[0];
    const nameVal = req.body.name !== undefined ? req.body.name : row.name;
    const slugVal = req.body.slug !== undefined ? req.body.slug : row.slug;
    const descriptionVal = req.body.description !== undefined ? req.body.description : row.description;
    const specVal = req.body.spec !== undefined ? req.body.spec : row.spec;
    const fileSetupVal = req.body.file_setup !== undefined ? req.body.file_setup : row.file_setup;
    const installationGuideVal = req.body.installation_guide !== undefined ? req.body.installation_guide : row.installation_guide;
    const categoryIdVal = req.body.category_id !== undefined ? (req.body.category_id || null) : row.category_id;
    const subcategoryVal = req.body.subcategory !== undefined ? req.body.subcategory : row.subcategory;
    const priceVal = req.body.price !== undefined ? (req.body.price != null ? parseFloat(req.body.price) : null) : row.price;
    let pricePerSqftVal = req.body.price_per_sqft !== undefined ? (req.body.price_per_sqft != null ? parseFloat(req.body.price_per_sqft) : null) : row.price_per_sqft;
    const minChargeVal = req.body.min_charge !== undefined ? (req.body.min_charge != null ? parseFloat(req.body.min_charge) : null) : row.min_charge;
    const pricingModeVal = req.body.pricing_mode !== undefined ? normalizeMode(req.body.pricing_mode, 'fixed') : row.pricing_mode;
    const graphicScenarioEnabledVal =
      req.body.graphic_scenario_enabled !== undefined
        ? req.body.graphic_scenario_enabled === true || req.body.graphic_scenario_enabled === 'true'
        : !!row.graphic_scenario_enabled;
    const hardwareTemplateIdVal =
      req.body.hardware_template_id !== undefined
        ? (req.body.hardware_template_id === null || req.body.hardware_template_id === ''
            ? null
            : parseInt(String(req.body.hardware_template_id), 10))
        : row.hardware_template_id;
    if (hardwareTemplateIdVal != null) {
      if (!Number.isFinite(hardwareTemplateIdVal)) {
        return res.status(400).json({ message: 'Invalid hardware_template_id.' });
      }
      const hwCheck = await pool.query('SELECT id FROM hardware_templates WHERE id = $1', [hardwareTemplateIdVal]);
      if (hwCheck.rows.length === 0) {
        return res.status(400).json({ message: 'Selected hardware template does not exist.' });
      }
    }
    if (graphicScenarioEnabledVal && pricingModeVal !== 'fixed') {
      return res.status(400).json({ message: 'Graphic scenario products must use fixed pricing.' });
    }
    if (graphicScenarioEnabledVal) {
      pricePerSqftVal = null;
    }
    const sizeModeVal = req.body.size_mode !== undefined ? normalizeMode(req.body.size_mode, 'custom') : row.size_mode;
    const baseUnitVal = req.body.base_unit !== undefined ? String(req.body.base_unit || 'inch').trim().toLowerCase() : row.base_unit;
    const minWidthVal = req.body.min_width !== undefined ? asNumberOrNull(req.body.min_width) : row.min_width;
    const maxWidthVal = req.body.max_width !== undefined ? asNumberOrNull(req.body.max_width) : row.max_width;
    const minHeightVal = req.body.min_height !== undefined ? asNumberOrNull(req.body.min_height) : row.min_height;
    const maxHeightVal = req.body.max_height !== undefined ? asNumberOrNull(req.body.max_height) : row.max_height;
    const materialVal = req.body.material !== undefined ? req.body.material : row.material;
    let galleryFinal;
    if (req.body.gallery_images !== undefined) {
      galleryFinal = normalizeGalleryArrayInput(req.body.gallery_images);
    } else if (req.body.image_url !== undefined) {
      galleryFinal = req.body.image_url ? [String(req.body.image_url).trim()] : [];
    } else {
      galleryFinal = galleryFromRow(row);
    }
    const imageUrlVal = galleryFinal[0] || null;
    const galleryJson = JSON.stringify(galleryFinal);
    const isNewVal = req.body.is_new !== undefined ? (req.body.is_new === true || req.body.is_new === 'true') : row.is_new;
    const isActiveVal = req.body.is_active !== undefined ? (req.body.is_active !== false && req.body.is_active !== 'false') : row.is_active;
    const skuVal = req.body.sku !== undefined ? req.body.sku : row.sku;
    const weightVal = req.body.weight !== undefined ? asNumberOrNull(req.body.weight) : row.weight;
    const weightPerSqftVal =
      req.body.weight_per_sqft !== undefined ? asNumberOrNull(req.body.weight_per_sqft) : row.weight_per_sqft;
    const lengthVal = req.body.length !== undefined ? asNumberOrNull(req.body.length) : row.length;
    const shippingLengthVal =
      req.body.shipping_length !== undefined ? asNumberOrNull(req.body.shipping_length) : row.shipping_length;
    const shippingWidthVal =
      req.body.shipping_width !== undefined ? asNumberOrNull(req.body.shipping_width) : row.shipping_width;
    const shippingHeightVal =
      req.body.shipping_height !== undefined ? asNumberOrNull(req.body.shipping_height) : row.shipping_height;
    const shippingWeightVal =
      req.body.shipping_weight !== undefined ? asNumberOrNull(req.body.shipping_weight) : row.shipping_weight;
    const parsedShippingBoxRules = req.body.shipping_box_rules !== undefined
          ? parseShippingBoxRulesInput(req.body.shipping_box_rules)
          : null;
    const fedexShippingValidationError = validateFedexShippingDataForHardware({
      isHardware: graphicScenarioEnabledVal,
      shippingLength: shippingLengthVal,
      shippingWidth: shippingWidthVal,
      shippingHeight: shippingHeightVal,
      shippingWeight: shippingWeightVal,
    });
    if (fedexShippingValidationError) {
      return res.status(400).json({ message: fedexShippingValidationError });
    }
    const productionTimeVal =
      req.body.production_time !== undefined ? asIntegerOrNull(req.body.production_time) : row.production_time;
    const productionTimeRulesResult =
      req.body.production_time_rules !== undefined
        ? validateProductionTimeRules(req.body.production_time_rules)
        : { rules: normalizeProductionTimeRules(row.production_time_rules) };
    if (productionTimeRulesResult.error) {
      return res.status(400).json({ message: productionTimeRulesResult.error });
    }
    const productionTimeRulesVal = JSON.stringify(productionTimeRulesResult.rules);
    const highlightsVal = req.body.product_highlights !== undefined
      ? (Array.isArray(req.body.product_highlights)
          ? JSON.stringify(req.body.product_highlights.map(String).filter((s) => s.trim()))
          : '[]')
      : (Array.isArray(row.product_highlights) ? JSON.stringify(row.product_highlights) : (row.product_highlights || '[]'));
    const propertiesVal = req.body.properties !== undefined
      ? (Array.isArray(req.body.properties) ? JSON.stringify(req.body.properties) : (typeof req.body.properties === 'string' ? req.body.properties : (row.properties ? JSON.stringify(row.properties) : '[]')))
      : (row.properties ? JSON.stringify(row.properties) : '[]');
    const faqVal = req.body.faq !== undefined
      ? (Array.isArray(req.body.faq) ? JSON.stringify(req.body.faq) : (typeof req.body.faq === 'string' ? req.body.faq : (row.faq ? JSON.stringify(row.faq) : '[]')))
      : (row.faq ? JSON.stringify(row.faq) : '[]');
    const parsedSizeOptions = req.body.size_options !== undefined
      ? parseSizeOptionsInput(req.body.size_options)
      : await getProductSizeOptions(id);
    if (sizeModeVal === 'predefined' && parsedSizeOptions.length === 0) {
      return res.status(400).json({ message: 'size_options are required when size_mode is predefined.' });
    }
    const effectiveShippingBoxRuleCount =
      parsedShippingBoxRules !== null
        ? parsedShippingBoxRules.length
        : (graphicScenarioEnabledVal ? 0 : (await getProductShippingBoxRules(id)).length);
    if (!graphicScenarioEnabledVal && effectiveShippingBoxRuleCount > 0 && !(weightPerSqftVal > 0)) {
      return res.status(400).json({ message: 'Weight per sq ft is required when shipping box rules are configured.' });
    }
    const parsedPurchaseOptions = req.body.purchase_options !== undefined
      ? parsePurchaseOptionsInput(req.body.purchase_options)
      : null;
    const result = await pool.query(
      `UPDATE products SET name = $1, slug = $2, description = $3, spec = $4, file_setup = $5, installation_guide = $6, faq = $7::jsonb, category_id = $8, subcategory = $9, price = $10, price_per_sqft = $11, min_charge = $12, material = $13, image_url = $14, is_new = $15, is_active = $16, sku = $17, properties = $18::jsonb, gallery_images = $19::jsonb, pricing_mode = $20, size_mode = $21, base_unit = $22, min_width = $23, max_width = $24, min_height = $25, max_height = $26, graphic_scenario_enabled = $27, hardware_template_id = $28, weight = $29, length = $30, shipping_length = $31, shipping_width = $32, shipping_height = $33, shipping_weight = $34, production_time = $35, production_time_rules = $36::jsonb, product_highlights = $37::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $38 RETURNING *`,
      [nameVal, slugVal, descriptionVal, specVal, fileSetupVal, installationGuideVal, faqVal, categoryIdVal, subcategoryVal, priceVal, pricePerSqftVal, minChargeVal, materialVal, imageUrlVal, isNewVal, isActiveVal, skuVal, propertiesVal, galleryJson, pricingModeVal, sizeModeVal, baseUnitVal, minWidthVal, maxWidthVal, minHeightVal, maxHeightVal, graphicScenarioEnabledVal, hardwareTemplateIdVal, weightVal, lengthVal, shippingLengthVal, shippingWidthVal, shippingHeightVal, shippingWeightVal, productionTimeVal, productionTimeRulesVal, highlightsVal, id]
    );
    const updated = result.rows[0];
    await replaceProductSizeOptions(id, parsedSizeOptions);
    if (parsedPurchaseOptions !== null) {
      await replaceProductPurchaseOptions(id, parsedPurchaseOptions);
    }
    if (parsedShippingBoxRules !== null) {
      await replaceProductShippingBoxRules(id, parsedShippingBoxRules);
    }
    updated.size_options = await getProductSizeOptions(id);
    updated.purchase_options = await getProductPurchaseOptions(id);
    updated.shipping_box_rules = await getProductShippingBoxRules(id);
    res.json({ product: updated });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ message: 'Product slug already exists' });
    if (/Shipping box|Box rule|minimum smallest side/i.test(String(error?.message || ''))) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Update product error:', error);
    res.status(500).json({ message: 'Failed to update product' });
  }
};

/** Admin: get all products (including inactive) for admin list */
const getAllProductsAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const countResult = await pool.query('SELECT COUNT(*) FROM products');
    const total = parseInt(countResult.rows[0].count);
    res.json({
      products: result.rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Get all products admin error:', error);
    res.status(500).json({ message: 'Failed to fetch products' });
  }
};

/** Admin: delete a product */
const deleteProductAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json({ message: 'Product deleted', id: result.rows[0].id });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Failed to delete product' });
  }
};

/** Generate safe filename and ensure dir exists; returns full path and relative URL path */
function writeBufferToUploadDir(buffer, dirName) {
  const uploadDir = path.join(__dirname, '../../uploads', dirName);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const ext = '.jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
  const fullPath = path.join(uploadDir, filename);
  fs.writeFileSync(fullPath, buffer);
  return `/uploads/${dirName}/${filename}`;
}

/** Admin: upload product image; DigitalOcean Spaces (live) or disk. Returns { url } */
const uploadProductImage = async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: 'No image file uploaded' });
  }
  try {
    if (spacesConfigured()) {
      const url = await uploadFromBuffer(req.file.buffer, 'elmer/products', {
        contentType: req.file.mimetype,
      });
      return res.json({ url });
    }
    const url = writeBufferToUploadDir(req.file.buffer, 'products');
    res.json({ url });
  } catch (err) {
    console.error('Upload product image error:', err);
    res.status(500).json({ message: 'Image upload failed' });
  }
};

/** Admin: upload category image; Spaces or disk. Returns { url } */
const uploadCategoryImage = async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: 'No image file uploaded' });
  }
  try {
    if (spacesConfigured()) {
      const url = await uploadFromBuffer(req.file.buffer, 'elmer/categories', {
        contentType: req.file.mimetype,
      });
      return res.json({ url });
    }
    const url = writeBufferToUploadDir(req.file.buffer, 'categories');
    res.json({ url });
  } catch (err) {
    console.error('Upload category image error:', err);
    res.status(500).json({ message: 'Image upload failed' });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  previewProductPrice,
  getCategories,
  getRelatedProducts,
  createCategory,
  updateCategory,
  deleteCategory,
  createProduct,
  updateProduct,
  getAllProductsAdmin,
  deleteProductAdmin,
  uploadProductImage,
  uploadCategoryImage,
  getProductModifierConfigAdmin,
  updateProductModifierConfigAdmin,
  getModifierCatalogAdmin,
  updateModifierCatalogAdmin,
  deleteModifierCatalogGroupAdmin,
  getModifierPresetsAdmin,
  createModifierPresetAdmin,
  updateModifierPresetAdmin,
  deleteModifierPresetAdmin,
  getProductPurchaseOptionsAdmin,
  updateProductPurchaseOptionsAdmin,
  getProductShippingBoxRulesAdmin,
  updateProductShippingBoxRulesAdmin,
  getHardwareTemplatesAdmin,
  upsertHardwareTemplateAdmin,
  deleteHardwareTemplateAdmin,
};
