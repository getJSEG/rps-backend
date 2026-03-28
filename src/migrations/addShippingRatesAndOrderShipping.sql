-- Admin-configurable shipping prices (single row id = 1)
CREATE TABLE IF NOT EXISTS shipping_rates (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ground DECIMAL(14, 2) NOT NULL DEFAULT 120.07,
  express DECIMAL(14, 2) NOT NULL DEFAULT 0,
  overnight DECIMAL(14, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO shipping_rates (id, ground, express, overnight)
VALUES (1, 120.07, 0, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_method VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_charge DECIMAL(14, 2) DEFAULT 0;
