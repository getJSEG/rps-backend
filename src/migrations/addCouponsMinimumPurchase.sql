ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS minimum_purchase_amount DECIMAL(14, 2) DEFAULT 0;
