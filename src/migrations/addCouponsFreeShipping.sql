-- Shipping coupons: discount types that reduce the order's shipping charge instead of the
-- product subtotal.
--   free_shipping     waives all shipping; stores discount_value = 0
--   shipping_percent  takes discount_value % (1-100) off shipping
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_discount_type_check;
ALTER TABLE coupons
  ADD CONSTRAINT coupons_discount_type_check
  CHECK (discount_type IN ('percent', 'fixed', 'free_shipping', 'shipping_percent'));

ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_discount_value_check;
ALTER TABLE coupons
  ADD CONSTRAINT coupons_discount_value_check
  CHECK (discount_type = 'free_shipping' OR discount_value > 0);

-- Shipping taken off by a shipping coupon. Kept apart from coupon_discount_amount, which is
-- always the product-subtotal discount (emails and per-line refunds rely on that).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS coupon_shipping_discount_amount DECIMAL(14, 2) DEFAULT 0;
