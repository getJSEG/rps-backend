-- Real print size of a design template (inches), read from the uploaded SVG; NULL when the file has no usable size.
ALTER TABLE product_design_templates ADD COLUMN IF NOT EXISTS width_in DOUBLE PRECISION;
ALTER TABLE product_design_templates ADD COLUMN IF NOT EXISTS height_in DOUBLE PRECISION;
