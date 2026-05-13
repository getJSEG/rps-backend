CREATE TABLE IF NOT EXISTS product_conditional_modifier_rules (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  hardware_option_id INTEGER NULL REFERENCES product_purchase_options(id) ON DELETE CASCADE,
  source_modifier_id INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  source_option_id INTEGER NULL REFERENCES modifier_options(id) ON DELETE CASCADE,
  action_type VARCHAR(30) NOT NULL,
  target_modifier_id INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  target_option_id INTEGER NULL REFERENCES modifier_options(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT product_conditional_modifier_rules_action_chk
    CHECK (action_type IN ('auto_select', 'disable'))
);

CREATE INDEX IF NOT EXISTS idx_product_conditional_modifier_rules_product
  ON product_conditional_modifier_rules(product_id);

CREATE INDEX IF NOT EXISTS idx_product_conditional_modifier_rules_hardware_option
  ON product_conditional_modifier_rules(hardware_option_id);

ALTER TABLE IF EXISTS product_conditional_modifier_rules
  ALTER COLUMN target_option_id DROP NOT NULL;

ALTER TABLE IF EXISTS product_conditional_modifier_rules
  ALTER COLUMN source_option_id DROP NOT NULL;
