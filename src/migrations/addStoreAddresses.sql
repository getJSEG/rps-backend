CREATE TABLE IF NOT EXISTS store_addresses (
  id SERIAL PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  company VARCHAR(120),
  contact_name VARCHAR(120),
  phone VARCHAR(30),
  street_address VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  postcode VARCHAR(20) NOT NULL,
  country VARCHAR(100) NOT NULL DEFAULT 'United States',
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS store_addresses_one_default_idx
  ON store_addresses (is_default)
  WHERE is_default = true;
