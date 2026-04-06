ALTER TABLE IF EXISTS products
ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(20),
ADD COLUMN IF NOT EXISTS size_mode VARCHAR(20),
ADD COLUMN IF NOT EXISTS base_unit VARCHAR(20) DEFAULT 'inch',
ADD COLUMN IF NOT EXISTS min_width DECIMAL(12, 4),
ADD COLUMN IF NOT EXISTS max_width DECIMAL(12, 4),
ADD COLUMN IF NOT EXISTS min_height DECIMAL(12, 4),
ADD COLUMN IF NOT EXISTS max_height DECIMAL(12, 4);

UPDATE products
SET pricing_mode = CASE
  WHEN pricing_mode IS NOT NULL THEN pricing_mode
  WHEN price_per_sqft IS NOT NULL THEN 'area'
  ELSE 'fixed'
END;

UPDATE products
SET size_mode = CASE
  WHEN size_mode IS NOT NULL THEN size_mode
  WHEN price_per_sqft IS NOT NULL THEN 'custom'
  ELSE 'predefined'
END;

UPDATE products
SET base_unit = COALESCE(NULLIF(base_unit, ''), 'inch');

ALTER TABLE IF EXISTS products
ALTER COLUMN pricing_mode SET DEFAULT 'fixed',
ALTER COLUMN size_mode SET DEFAULT 'custom',
ALTER COLUMN base_unit SET DEFAULT 'inch';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_pricing_mode_chk') THEN
    ALTER TABLE products
      ADD CONSTRAINT products_pricing_mode_chk CHECK (pricing_mode IN ('fixed', 'area'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_size_mode_chk') THEN
    ALTER TABLE products
      ADD CONSTRAINT products_size_mode_chk CHECK (size_mode IN ('predefined', 'custom'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_base_unit_chk') THEN
    ALTER TABLE products
      ADD CONSTRAINT products_base_unit_chk CHECK (base_unit IN ('inch'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS product_size_options (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label VARCHAR(120) NOT NULL,
  width DECIMAL(12, 4) NOT NULL,
  height DECIMAL(12, 4) NOT NULL,
  unit_price DECIMAL(14, 6),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_size_options_product_id ON product_size_options(product_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_size_options_single_default
ON product_size_options(product_id)
WHERE is_default = true;
