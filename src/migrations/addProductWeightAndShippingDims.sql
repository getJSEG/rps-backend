-- Product mass / linear dimension and carton dimensions for shipping
ALTER TABLE IF EXISTS products
ADD COLUMN IF NOT EXISTS weight DECIMAL(12, 4),
ADD COLUMN IF NOT EXISTS length DECIMAL(12, 4),
ADD COLUMN IF NOT EXISTS shipping_length DECIMAL(12, 4),
ADD COLUMN IF NOT EXISTS shipping_width DECIMAL(12, 4),
ADD COLUMN IF NOT EXISTS shipping_height DECIMAL(12, 4),
ADD COLUMN IF NOT EXISTS shipping_weight DECIMAL(12, 4);
