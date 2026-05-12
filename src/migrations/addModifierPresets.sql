CREATE TABLE IF NOT EXISTS modifier_presets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS modifier_preset_items (
  id SERIAL PRIMARY KEY,
  modifier_preset_id INTEGER NOT NULL REFERENCES modifier_presets(id) ON DELETE CASCADE,
  modifier_group_id INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (modifier_preset_id, modifier_group_id)
);

CREATE INDEX IF NOT EXISTS idx_modifier_preset_items_preset ON modifier_preset_items(modifier_preset_id);
