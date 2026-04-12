-- Free shipping when cart subtotal meets threshold (singleton shipping_rates row)
ALTER TABLE shipping_rates
  ADD COLUMN IF NOT EXISTS free_shipping_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shipping_rates
  ADD COLUMN IF NOT EXISTS free_shipping_threshold DECIMAL(14, 2) NOT NULL DEFAULT 0 CHECK (free_shipping_threshold >= 0);
