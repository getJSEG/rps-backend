-- Site-wide % off shipping for each customer-facing tier (Admin → Shipping Rates).
ALTER TABLE shipping_rates ADD COLUMN IF NOT EXISTS economy_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE shipping_rates ADD COLUMN IF NOT EXISTS standard_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE shipping_rates ADD COLUMN IF NOT EXISTS express_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
