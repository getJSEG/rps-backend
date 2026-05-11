-- Estimated production lead time (whole units, e.g. business days — interpretation is app-defined)
-- Bullet-style highlights shown under the product image on the storefront (JSON array of strings)
ALTER TABLE IF EXISTS products
ADD COLUMN IF NOT EXISTS production_time INTEGER,
ADD COLUMN IF NOT EXISTS product_highlights JSONB DEFAULT '[]'::jsonb;
