ALTER TABLE IF EXISTS hardware_template_options
  ADD COLUMN IF NOT EXISTS base_unit_price DECIMAL(14, 6),
  ADD COLUMN IF NOT EXISTS modifier_total DECIMAL(14, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS computed_unit_price DECIMAL(14, 6);

UPDATE hardware_template_options
SET
  base_unit_price = COALESCE(base_unit_price, unit_price, 0),
  computed_unit_price = COALESCE(computed_unit_price, unit_price, 0),
  modifier_total = COALESCE(modifier_total, 0);
