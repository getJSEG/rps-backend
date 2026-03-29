-- Custom print size per line (inches), from product detail cart. Nullable for legacy rows.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS width_inches DECIMAL(14, 4);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS height_inches DECIMAL(14, 4);
