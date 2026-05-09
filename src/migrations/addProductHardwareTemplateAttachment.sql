ALTER TABLE products
  ADD COLUMN IF NOT EXISTS hardware_template_id INTEGER NULL
    REFERENCES hardware_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_hardware_template_id
  ON products(hardware_template_id);
