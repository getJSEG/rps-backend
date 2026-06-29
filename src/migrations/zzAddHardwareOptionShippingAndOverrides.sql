ALTER TABLE IF EXISTS hardware_template_options
  ADD COLUMN IF NOT EXISTS weight_per_item DECIMAL(12, 4);

ALTER TABLE IF EXISTS hardware_template_option_modifiers
  ADD COLUMN IF NOT EXISTS price_adjustment_override DECIMAL(14, 6);

CREATE TABLE IF NOT EXISTS hardware_template_option_modifier_options (
  id SERIAL PRIMARY KEY,
  hardware_template_option_modifier_id INTEGER NOT NULL REFERENCES hardware_template_option_modifiers(id) ON DELETE CASCADE,
  modifier_option_id INTEGER NOT NULL REFERENCES modifier_options(id) ON DELETE CASCADE,
  price_adjustment_override DECIMAL(14, 6),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (hardware_template_option_modifier_id, modifier_option_id)
);

CREATE INDEX IF NOT EXISTS idx_hw_option_modifier_options_modifier
  ON hardware_template_option_modifier_options (hardware_template_option_modifier_id);

INSERT INTO hardware_template_option_modifier_options (
  hardware_template_option_modifier_id,
  modifier_option_id,
  price_adjustment_override,
  is_active
)
SELECT
  htom.id,
  mo.id,
  htom.price_adjustment_override,
  TRUE
FROM hardware_template_option_modifiers htom
INNER JOIN modifier_options mo ON mo.modifier_group_id = htom.modifier_group_id
WHERE mo.is_active = TRUE
ON CONFLICT (hardware_template_option_modifier_id, modifier_option_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS hardware_template_option_shipping_box_rules (
  id SERIAL PRIMARY KEY,
  hardware_template_option_id INTEGER NOT NULL REFERENCES hardware_template_options(id) ON DELETE CASCADE,
  shipping_box_id INTEGER NOT NULL REFERENCES shipping_boxes(id),
  max_quantity_per_box INTEGER,
  max_weight_per_box DECIMAL(12, 4),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT hardware_template_option_shipping_box_rules_limits_check
    CHECK (
      (max_quantity_per_box IS NULL OR max_quantity_per_box > 0)
      AND (max_weight_per_box IS NULL OR max_weight_per_box > 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_hw_option_shipping_rules_option
  ON hardware_template_option_shipping_box_rules (hardware_template_option_id, sort_order, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hw_option_shipping_rules_single_active
  ON hardware_template_option_shipping_box_rules (hardware_template_option_id)
  WHERE is_active = TRUE;
