-- Store the product image URL at time of order (same image client added to cart)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);
