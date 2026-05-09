-- Store which purchase option was selected when the order item was created
ALTER TABLE IF EXISTS order_items
  ADD COLUMN IF NOT EXISTS purchase_option_key   VARCHAR(80),
  ADD COLUMN IF NOT EXISTS purchase_option_label VARCHAR(120);
