function roundMoney2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function normalizeCouponCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function computeDiscountAmount(coupon, subtotal) {
  const sub = roundMoney2(subtotal);
  if (sub <= 0 || !coupon) return 0;
  const type = String(coupon.discount_type || coupon.discountType || '').toLowerCase();
  const value = Number(coupon.discount_value ?? coupon.discountValue);
  if (!Number.isFinite(value) || value <= 0) return 0;
  let amount = 0;
  if (type === 'percent') {
    amount = roundMoney2(sub * (value / 100));
  } else {
    amount = roundMoney2(value);
  }
  if (amount > sub) amount = sub;
  if (amount < 0) amount = 0;
  return amount;
}

/**
 * Split a coupon across product lines by share of subtotal. Leftover cents go to
 * the largest remainders so allocated discounts always equal the coupon amount.
 */
function allocateDiscountToLines(lines, discountAmount) {
  const amount = roundMoney2(discountAmount);
  const out = (Array.isArray(lines) ? lines : []).map((line) => ({
    ...line,
    discount_amount: 0,
    total_price: roundMoney2(line.total_price),
  }));
  if (amount <= 0) return { lines: out, allocated: 0 };

  const eligibleIdx = [];
  let subtotal = 0;
  out.forEach((line, i) => {
    const t = roundMoney2(line.total_price);
    if (t > 0) {
      eligibleIdx.push(i);
      subtotal = roundMoney2(subtotal + t);
    }
  });
  if (subtotal <= 0) return { lines: out, allocated: 0 };

  const cap = Math.min(amount, subtotal);
  const capCents = Math.round(cap * 100);
  const shares = eligibleIdx.map((i) => {
    const exact = (out[i].total_price / subtotal) * cap;
    const cents = Math.floor(exact * 100 + 1e-9);
    return { i, exact, cents, frac: exact * 100 - cents };
  });
  let used = shares.reduce((s, r) => s + r.cents, 0);
  let leftover = capCents - used;
  shares.sort((a, b) => b.frac - a.frac || out[b.i].total_price - out[a.i].total_price);
  for (let k = 0; k < leftover; k += 1) {
    shares[k % shares.length].cents += 1;
  }
  for (const share of shares) {
    const line = out[share.i];
    const disc = Math.min(roundMoney2(share.cents / 100), roundMoney2(line.total_price));
    line.discount_amount = disc;
    line.total_price = roundMoney2(line.total_price - disc);
  }
  const allocated = roundMoney2(out.reduce((s, l) => s + (Number(l.discount_amount) || 0), 0));
  return { lines: out, allocated };
}

/** Inner offer text: `AZADI - 25%` or `AZADI - $40`. Falls back to the code alone. */
function couponOfferLabel(coupon) {
  const code = String(coupon?.code || coupon?.coupon_code || '').trim();
  if (!code) return '';
  const type = String(coupon?.discountType || coupon?.discount_type || coupon?.coupon_discount_type || '').toLowerCase();
  const value = Number(coupon?.discountValue ?? coupon?.discount_value ?? coupon?.coupon_discount_value);
  if (!Number.isFinite(value) || value <= 0) return code;
  if (type === 'percent') {
    const pct = Number.isInteger(value) ? String(value) : String(roundMoney2(value));
    return `${code} - ${pct}%`;
  }
  const amount = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${code} - $${amount}`;
}

function couponLineLabel(coupon) {
  const inner = couponOfferLabel(coupon);
  return inner ? `Coupon (${inner})` : 'Coupon';
}

module.exports = {
  roundMoney2,
  normalizeCouponCode,
  computeDiscountAmount,
  allocateDiscountToLines,
  couponOfferLabel,
  couponLineLabel,
};
