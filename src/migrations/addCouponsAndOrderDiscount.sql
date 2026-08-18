CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value DECIMAL(14, 4) NOT NULL CHECK (discount_value > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_coupons_code_lower ON coupons (LOWER(code));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS coupon_discount_amount DECIMAL(14, 2) DEFAULT 0;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(14, 2) DEFAULT 0;
