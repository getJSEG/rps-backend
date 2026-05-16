const pool = require('../config/database');
const { computeDynamicTaxAndTotal, normalizeZip5 } = require('../services/taxService');

function parseMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function findDefaultAddressForUser(userId) {
  const result = await pool.query(
    `SELECT id, postcode, address_type, is_default
     FROM addresses
     WHERE user_id = $1
     ORDER BY is_default DESC,
       CASE WHEN address_type = 'shipping' THEN 0 ELSE 1 END,
       updated_at DESC NULLS LAST,
       created_at DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

async function estimateTax(req, res) {
  try {
    const subtotal = parseMoney(req.body?.subtotal);
    const shipping = parseMoney(req.body?.shipping);
    if (subtotal == null) return res.status(400).json({ message: 'subtotal must be a non-negative number' });
    if (shipping == null) return res.status(400).json({ message: 'shipping must be a non-negative number' });

    const explicitPostalCode = String(
      req.body?.postalCode ?? req.body?.postcode ?? req.body?.zip ?? ''
    ).trim();
    let postalCode = explicitPostalCode;
    let addressId = null;

    if (!postalCode && req.user?.id) {
      const defaultAddress = await findDefaultAddressForUser(req.user.id);
      addressId = defaultAddress?.id ?? null;
      postalCode = String(defaultAddress?.postcode || '').trim();
    }

    if (!normalizeZip5(postalCode)) {
      return res.status(400).json({
        success: false,
        code: postalCode ? 'INVALID_POSTAL_CODE' : 'MISSING_POSTAL_CODE',
        message: postalCode
          ? 'Invalid postal code'
          : 'Add a default shipping address with a valid ZIP code to calculate tax.',
      });
    }

    const totals = await computeDynamicTaxAndTotal(subtotal, shipping, postalCode);
    return res.json({
      success: true,
      taxRate: totals.tax.rate,
      taxPercentage: totals.tax.percentage,
      tax: totals.tax.amount,
      total: totals.total,
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      addressId,
      postalCode: normalizeZip5(postalCode),
      warning: totals.warning,
    });
  } catch (error) {
    console.error('estimateTax:', error);
    const statusCode = Number(error?.statusCode) || 500;
    return res.status(statusCode >= 400 && statusCode < 500 ? statusCode : 500).json({
      success: false,
      code: error?.code || 'TAX_ESTIMATE_FAILED',
      message: error?.message || 'Failed to estimate tax',
    });
  }
}

module.exports = {
  estimateTax,
};
