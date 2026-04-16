ALTER TABLE IF EXISTS orders
  ADD COLUMN IF NOT EXISTS guest_tracking_token_hash VARCHAR(128),
  ADD COLUMN IF NOT EXISTS guest_tracking_token_created_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_orders_guest_tracking_hash
  ON orders (guest_tracking_token_hash)
  WHERE guest_tracking_token_hash IS NOT NULL;
