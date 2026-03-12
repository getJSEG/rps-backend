-- Add price_per_sqft and min_charge columns to products table
ALTER TABLE IF EXISTS products 
ADD COLUMN IF NOT EXISTS price_per_sqft DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS min_charge DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS material VARCHAR(255);

