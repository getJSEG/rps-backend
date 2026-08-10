-- Per-line fulfillment status (admin-managed; independent of orders.status).
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'awaiting_artwork';

-- Existing lines: copy current order status when present, else awaiting_artwork.
UPDATE order_items oi
SET status = lower(trim(COALESCE(NULLIF(o.status, ''), 'awaiting_artwork')))
FROM orders o
WHERE oi.order_id = o.id;
