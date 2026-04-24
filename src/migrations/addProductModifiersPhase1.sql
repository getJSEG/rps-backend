CREATE TABLE IF NOT EXISTS modifier_groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  key VARCHAR(80) NOT NULL UNIQUE,
  input_type VARCHAR(30) NOT NULL DEFAULT 'dropdown',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS modifier_options (
  id SERIAL PRIMARY KEY,
  modifier_group_id INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  label VARCHAR(160) NOT NULL,
  value VARCHAR(120) NOT NULL,
  price_adjustment DECIMAL(14, 6) NOT NULL DEFAULT 0,
  price_type VARCHAR(20) NOT NULL DEFAULT 'fixed',
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (modifier_group_id, value)
);

CREATE TABLE IF NOT EXISTS product_modifiers (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  modifier_group_id INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, modifier_group_id)
);

CREATE TABLE IF NOT EXISTS product_modifier_options (
  id SERIAL PRIMARY KEY,
  product_modifier_id INTEGER NOT NULL REFERENCES product_modifiers(id) ON DELETE CASCADE,
  modifier_option_id INTEGER NOT NULL REFERENCES modifier_options(id) ON DELETE CASCADE,
  price_adjustment_override DECIMAL(14, 6),
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_modifier_id, modifier_option_id)
);

ALTER TABLE IF EXISTS order_items
  ADD COLUMN IF NOT EXISTS selected_modifiers JSONB,
  ADD COLUMN IF NOT EXISTS modifier_total DECIMAL(14, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_unit_price DECIMAL(14, 6);

CREATE INDEX IF NOT EXISTS idx_modifier_options_group ON modifier_options(modifier_group_id);
CREATE INDEX IF NOT EXISTS idx_product_modifiers_product ON product_modifiers(product_id);
CREATE INDEX IF NOT EXISTS idx_product_modifier_options_pm ON product_modifier_options(product_modifier_id);
