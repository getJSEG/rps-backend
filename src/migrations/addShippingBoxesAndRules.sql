CREATE TABLE IF NOT EXISTS shipping_boxes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  length DECIMAL(12, 4) NOT NULL,
  width DECIMAL(12, 4) NOT NULL,
  height DECIMAL(12, 4) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_shipping_box_rules (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  shipping_box_id INTEGER NOT NULL REFERENCES shipping_boxes(id),
  min_smallest_side DECIMAL(12, 4),
  max_smallest_side DECIMAL(12, 4),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT product_shipping_box_rules_range_check
    CHECK (
      min_smallest_side IS NULL
      OR max_smallest_side IS NULL
      OR min_smallest_side <= max_smallest_side
    )
);

CREATE INDEX IF NOT EXISTS product_shipping_box_rules_product_idx
  ON product_shipping_box_rules (product_id, sort_order, id);

CREATE INDEX IF NOT EXISTS shipping_boxes_active_idx
  ON shipping_boxes (is_active, name);
