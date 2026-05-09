-- Product purchase options: replaces hardcoded graphic_only/graphic_frame with flexible rows
CREATE TABLE IF NOT EXISTS product_purchase_options (
  id             SERIAL PRIMARY KEY,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label          VARCHAR(120) NOT NULL,
  option_key     VARCHAR(80)  NOT NULL,
  pricing_mode   VARCHAR(20)  NOT NULL DEFAULT 'fixed',
  unit_price     DECIMAL(14, 6),
  price_per_sqft DECIMAL(14, 6),
  min_charge     DECIMAL(14, 6),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_default     BOOLEAN NOT NULL DEFAULT false,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, option_key)
);

CREATE INDEX IF NOT EXISTS idx_product_purchase_options_product_id ON product_purchase_options(product_id);

-- Drop the hardcoded check constraint so mode_scope can hold any option key string
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_modifiers_mode_scope_chk') THEN
    ALTER TABLE product_modifiers DROP CONSTRAINT product_modifiers_mode_scope_chk;
  END IF;
END $$;

-- Widen mode_scope to accommodate any option key (was VARCHAR(30))
ALTER TABLE IF EXISTS product_modifiers
  ALTER COLUMN mode_scope TYPE VARCHAR(80);

-- Migrate existing graphic scenario products: create matching purchase option rows
-- so old mode_scope values ('graphic_only', 'graphic_frame') still work as-is
INSERT INTO product_purchase_options (product_id, label, option_key, pricing_mode, unit_price, sort_order, is_default)
SELECT
  p.id,
  'Graphic + Frame'  AS label,
  'graphic_frame'    AS option_key,
  'fixed'            AS pricing_mode,
  p.price            AS unit_price,
  0                  AS sort_order,
  true               AS is_default
FROM products p
WHERE p.graphic_scenario_enabled = true
ON CONFLICT (product_id, option_key) DO NOTHING;

INSERT INTO product_purchase_options (product_id, label, option_key, pricing_mode, unit_price, sort_order, is_default)
SELECT
  p.id,
  'Graphic Only'  AS label,
  'graphic_only'  AS option_key,
  'fixed'         AS pricing_mode,
  p.price         AS unit_price,
  1               AS sort_order,
  false           AS is_default
FROM products p
WHERE p.graphic_scenario_enabled = true
ON CONFLICT (product_id, option_key) DO NOTHING;
