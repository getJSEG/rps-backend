CREATE TABLE IF NOT EXISTS hardware_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hardware_template_options (
  id SERIAL PRIMARY KEY,
  hardware_template_id INTEGER NOT NULL REFERENCES hardware_templates(id) ON DELETE CASCADE,
  label VARCHAR(160) NOT NULL,
  option_key VARCHAR(80) NOT NULL,
  unit_price DECIMAL(14, 6) NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (hardware_template_id, option_key)
);

CREATE TABLE IF NOT EXISTS hardware_template_option_modifiers (
  id SERIAL PRIMARY KEY,
  hardware_template_option_id INTEGER NOT NULL REFERENCES hardware_template_options(id) ON DELETE CASCADE,
  modifier_group_id INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (hardware_template_option_id, modifier_group_id)
);

CREATE INDEX IF NOT EXISTS idx_hardware_template_options_template_id
  ON hardware_template_options(hardware_template_id);
CREATE INDEX IF NOT EXISTS idx_hardware_template_option_modifiers_option_id
  ON hardware_template_option_modifiers(hardware_template_option_id);
