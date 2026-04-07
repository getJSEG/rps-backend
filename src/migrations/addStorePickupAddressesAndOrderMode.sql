CREATE TABLE IF NOT EXISTS store_pickup_addresses (
  id SERIAL PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  street_address VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  postcode VARCHAR(20) NOT NULL,
  country VARCHAR(100) NOT NULL DEFAULT 'United States',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_mode VARCHAR(40) NOT NULL DEFAULT 'blind_drop_ship';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS store_pickup_address_id INTEGER REFERENCES store_pickup_addresses(id);
