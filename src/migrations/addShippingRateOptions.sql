CREATE TABLE IF NOT EXISTS shipping_rate_options (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(14, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS shipping_rate_options_name_unique_lower
  ON shipping_rate_options (LOWER(name));

INSERT INTO shipping_rate_options (name, price, is_active, sort_order)
VALUES
  ('Ground', 120.07, TRUE, 1),
  ('Express', 0, TRUE, 2),
  ('Overnight', 0, TRUE, 3)
ON CONFLICT DO NOTHING;
