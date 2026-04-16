-- Customer-approved artwork file URL per order line (linked after upload approval).
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customer_artwork_url TEXT;
