-- Automatic template selection: the modifier options a design template is for. Empty = the product's default template.
ALTER TABLE product_design_templates
  ADD COLUMN IF NOT EXISTS modifier_option_ids INTEGER[] NOT NULL DEFAULT '{}';
