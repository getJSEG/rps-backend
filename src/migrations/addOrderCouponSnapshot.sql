ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS coupon_discount_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS coupon_discount_value DECIMAL(14, 4);

UPDATE orders o
SET coupon_discount_type = c.discount_type,
    coupon_discount_value = c.discount_value
FROM coupons c
WHERE o.coupon_id = c.id
  AND o.coupon_discount_type IS NULL
  AND o.coupon_code IS NOT NULL;
