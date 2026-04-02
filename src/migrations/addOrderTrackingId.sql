-- Optional carrier / shipment tracking reference (set via admin order API).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_tracking_id VARCHAR(255);
