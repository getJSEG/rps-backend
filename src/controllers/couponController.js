const couponRepository = require('../repositories/couponRepository');
const {
  normalizeCouponCode,
  computeDiscountAmount,
  roundMoney2,
} = require('../services/couponService');

function isUniqueViolation(error) {
  return error && (error.code === '23505' || /ux_coupons_code_lower|duplicate key/i.test(String(error.message || '')));
}

function parseDiscountType(raw) {
  const type = String(raw || '').trim().toLowerCase();
  if (type === 'percent' || type === 'percentage' || type === '%') return 'percent';
  if (type === 'fixed' || type === 'amount' || type === 'flat') return 'fixed';
  return null;
}

function validateCouponPayload(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.code !== undefined) {
    const code = normalizeCouponCode(body.code);
    if (!code) return { error: 'Coupon code is required.' };
    if (code.length < 3 || code.length > 40) return { error: 'Coupon code must be 3–40 characters.' };
    if (!/^[A-Z0-9_-]+$/.test(code)) {
      return { error: 'Coupon code may only contain letters, numbers, hyphens, and underscores.' };
    }
    out.code = code;
  }
  if (!partial || body.discountType !== undefined || body.discount_type !== undefined) {
    const discountType = parseDiscountType(body.discountType ?? body.discount_type);
    if (!discountType) return { error: 'Discount type must be percent or fixed.' };
    out.discountType = discountType;
  }
  if (!partial || body.discountValue !== undefined || body.discount_value !== undefined) {
    const discountValue = Number(body.discountValue ?? body.discount_value);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return { error: 'Discount value must be greater than 0.' };
    }
    out.discountValue = discountValue;
  }
  if (body.isActive !== undefined || body.is_active !== undefined) {
    out.isActive = body.isActive !== undefined ? !!body.isActive : !!body.is_active;
  }
  if (!partial || body.expiresOn !== undefined || body.expires_on !== undefined) {
    const raw = body.expiresOn !== undefined ? body.expiresOn : body.expires_on;
    if (raw == null || String(raw).trim() === '') {
      out.expiresOn = null;
    } else {
      const expiresOn = couponRepository.dateOnly(raw);
      if (!expiresOn) return { error: 'Expiry date must be a valid date.' };
      out.expiresOn = expiresOn;
    }
  }
  const type = out.discountType;
  const value = out.discountValue;
  if (type === 'percent' && value != null && value > 100) {
    return { error: 'Percent discount cannot be greater than 100.' };
  }
  return { value: out };
}

const listCouponsAdmin = async (req, res) => {
  try {
    const coupons = await couponRepository.listAll();
    res.json({ coupons });
  } catch (error) {
    console.error('listCouponsAdmin:', error);
    res.status(500).json({ message: 'Failed to load coupons' });
  }
};

const createCouponAdmin = async (req, res) => {
  try {
    const parsed = validateCouponPayload(req.body, { partial: false });
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const coupon = await couponRepository.create({
      code: parsed.value.code,
      discountType: parsed.value.discountType,
      discountValue: parsed.value.discountValue,
      isActive: parsed.value.isActive !== false,
      expiresOn: parsed.value.expiresOn ?? null,
    });
    res.status(201).json({ coupon });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'A coupon with this code already exists.' });
    }
    console.error('createCouponAdmin:', error);
    res.status(500).json({ message: 'Failed to create coupon' });
  }
};

const updateCouponAdmin = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    const parsed = validateCouponPayload(req.body, { partial: true });
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    if (parsed.value.discountType === 'percent' && parsed.value.discountValue == null) {
      const current = await couponRepository.findById(id);
      if (current && Number(current.discountValue) > 100) {
        return res.status(400).json({ message: 'Percent discount cannot be greater than 100.' });
      }
    }
    if (parsed.value.discountType == null && parsed.value.discountValue != null) {
      const current = await couponRepository.findById(id);
      if (current?.discountType === 'percent' && parsed.value.discountValue > 100) {
        return res.status(400).json({ message: 'Percent discount cannot be greater than 100.' });
      }
    }
    if (parsed.value.isActive === true) {
      const current = await couponRepository.findById(id);
      const expiresOn =
        parsed.value.expiresOn !== undefined ? parsed.value.expiresOn : current?.expiresOn;
      if (couponRepository.isExpired(expiresOn)) {
        return res.status(400).json({ message: 'This coupon has expired. Set a future expiry date to activate it.' });
      }
    }
    const coupon = await couponRepository.update(id, parsed.value);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json({ coupon });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'A coupon with this code already exists.' });
    }
    console.error('updateCouponAdmin:', error);
    res.status(500).json({ message: 'Failed to update coupon' });
  }
};

const previewCoupon = async (req, res) => {
  try {
    const code = normalizeCouponCode(req.body?.code ?? req.body?.couponCode);
    if (!code) return res.status(400).json({ message: 'Enter a coupon code.' });
    const subtotal = roundMoney2(req.body?.subtotal);
    if (!Number.isFinite(Number(req.body?.subtotal)) || subtotal < 0) {
      return res.status(400).json({ message: 'subtotal must be a non-negative number' });
    }
    const coupon = await couponRepository.findActiveByCode(code);
    if (!coupon) {
      return res.status(400).json({ message: 'This coupon is invalid, expired, or no longer active.' });
    }
    const discountAmount = computeDiscountAmount(coupon, subtotal);
    if (discountAmount <= 0) {
      return res.status(400).json({ message: 'This coupon does not apply to the current order.' });
    }
    res.json({
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount,
      discountedSubtotal: roundMoney2(Math.max(0, subtotal - discountAmount)),
    });
  } catch (error) {
    console.error('previewCoupon:', error);
    res.status(500).json({ message: 'Failed to apply coupon' });
  }
};

const deleteCouponAdmin = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    const deleted = await couponRepository.remove(id);
    if (!deleted) return res.status(404).json({ message: 'Coupon not found' });
    res.json({ message: 'Coupon deleted' });
  } catch (error) {
    console.error('deleteCouponAdmin:', error);
    res.status(500).json({ message: 'Failed to delete coupon' });
  }
};

module.exports = {
  listCouponsAdmin,
  createCouponAdmin,
  updateCouponAdmin,
  deleteCouponAdmin,
  previewCoupon,
};
