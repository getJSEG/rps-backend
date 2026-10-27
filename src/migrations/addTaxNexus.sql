-- Sales tax economic nexus: per-state thresholds/status, plus the order data the monthly job counts.

CREATE TABLE IF NOT EXISTS nexus_states (
  code VARCHAR(2) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  -- Both NULL = state has no economic nexus rule (N/A).
  sales_threshold DECIMAL(14, 2) CHECK (sales_threshold IS NULL OR sales_threshold > 0),
  transaction_threshold INTEGER CHECK (transaction_threshold IS NULL OR transaction_threshold > 0),
  -- 'or': either threshold triggers nexus; 'and': both are needed (e.g. New York).
  threshold_rule VARCHAR(3) NOT NULL DEFAULT 'or' CHECK (threshold_rule IN ('or', 'and')),
  -- close_warning / reached are set by the monthly job; the rest by the admin.
  status VARCHAR(30) NOT NULL DEFAULT 'not_collecting' CHECK (
    status IN ('not_collecting', 'close_warning', 'reached', 'pending_registration', 'filing', 'collecting')
  ),
  -- Last monthly run: completed orders in the rolling 12 months.
  rolling_sales DECIMAL(14, 2) NOT NULL DEFAULT 0,
  rolling_orders INTEGER NOT NULL DEFAULT 0,
  period_start DATE,
  period_end DATE,
  calculated_at TIMESTAMP,
  status_changed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Starting thresholds from the client's nexus document; editable in admin, so never overwritten here.
INSERT INTO nexus_states (code, name, sales_threshold, transaction_threshold, threshold_rule) VALUES
  ('AL', 'Alabama', 250000, NULL, 'or'),
  ('AK', 'Alaska', 100000, NULL, 'or'),
  ('AZ', 'Arizona', 100000, NULL, 'or'),
  ('AR', 'Arkansas', 100000, 200, 'or'),
  ('CA', 'California', 500000, NULL, 'or'),
  ('CO', 'Colorado', 100000, NULL, 'or'),
  ('CT', 'Connecticut', 100000, 200, 'or'),
  ('DE', 'Delaware', NULL, NULL, 'or'),
  ('DC', 'District of Columbia', 100000, 200, 'or'),
  ('FL', 'Florida', 100000, NULL, 'or'),
  ('GA', 'Georgia', 100000, 200, 'or'),
  ('HI', 'Hawaii', 100000, 200, 'or'),
  ('ID', 'Idaho', 100000, NULL, 'or'),
  ('IL', 'Illinois', 100000, NULL, 'or'),
  ('IN', 'Indiana', 100000, NULL, 'or'),
  ('IA', 'Iowa', 100000, NULL, 'or'),
  ('KS', 'Kansas', 100000, NULL, 'or'),
  ('KY', 'Kentucky', 100000, NULL, 'or'),
  ('LA', 'Louisiana', 100000, NULL, 'or'),
  ('ME', 'Maine', 100000, NULL, 'or'),
  ('MD', 'Maryland', 100000, 200, 'or'),
  ('MA', 'Massachusetts', 100000, NULL, 'or'),
  ('MI', 'Michigan', 100000, 200, 'or'),
  ('MN', 'Minnesota', 100000, 200, 'or'),
  ('MS', 'Mississippi', 250000, NULL, 'or'),
  ('MO', 'Missouri', 100000, NULL, 'or'),
  ('MT', 'Montana', NULL, NULL, 'or'),
  ('NE', 'Nebraska', 100000, 200, 'or'),
  ('NV', 'Nevada', 100000, 200, 'or'),
  ('NH', 'New Hampshire', NULL, NULL, 'or'),
  ('NJ', 'New Jersey', 100000, 200, 'or'),
  ('NM', 'New Mexico', 100000, NULL, 'or'),
  ('NY', 'New York', 500000, 100, 'and'),
  ('NC', 'North Carolina', 100000, NULL, 'or'),
  ('ND', 'North Dakota', 100000, NULL, 'or'),
  ('OH', 'Ohio', 100000, 200, 'or'),
  ('OK', 'Oklahoma', 100000, NULL, 'or'),
  ('OR', 'Oregon', NULL, NULL, 'or'),
  ('PA', 'Pennsylvania', 100000, NULL, 'or'),
  ('PR', 'Puerto Rico', 100000, 200, 'or'),
  ('RI', 'Rhode Island', 100000, 200, 'or'),
  ('SC', 'South Carolina', 100000, NULL, 'or'),
  ('SD', 'South Dakota', 100000, NULL, 'or'),
  ('TN', 'Tennessee', 100000, NULL, 'or'),
  ('TX', 'Texas', 500000, NULL, 'or'),
  ('UT', 'Utah', 100000, NULL, 'or'),
  ('VT', 'Vermont', 100000, 200, 'or'),
  ('VA', 'Virginia', 100000, 200, 'or'),
  ('WA', 'Washington', 100000, NULL, 'or'),
  ('WV', 'West Virginia', 100000, 200, 'or'),
  ('WI', 'Wisconsin', 100000, NULL, 'or'),
  ('WY', 'Wyoming', 100000, NULL, 'or')
ON CONFLICT (code) DO NOTHING;

-- Shipping address as it was at checkout (address book rows are edited in place),
-- the 2-letter state it was delivered to (pickup = store's state), and when the order was completed.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_address_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS ship_to_state VARCHAR(2),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_orders_nexus ON orders (ship_to_state, completed_at)
  WHERE completed_at IS NOT NULL;

-- Backfill old orders from the best data we have: pickup store, guest snapshot, then the linked address.
UPDATE orders o
SET shipping_address_snapshot = src.addr,
    ship_to_state = ns.code
FROM (
  SELECT o2.id,
    COALESCE(
      CASE WHEN o2.shipping_mode = 'store_pickup' AND sp.id IS NOT NULL THEN jsonb_build_object(
        'street_address', sp.street_address, 'address_line2', sp.address_line2, 'city', sp.city,
        'state', sp.state, 'postcode', sp.postcode, 'country', sp.country, 'label', sp.label
      ) END,
      CASE WHEN jsonb_typeof(o2.guest_checkout -> 'shippingAddress') = 'object'
        THEN o2.guest_checkout -> 'shippingAddress' END,
      CASE WHEN sa.id IS NOT NULL THEN jsonb_build_object(
        'street_address', sa.street_address, 'address_line2', sa.address_line2, 'city', sa.city,
        'state', sa.state, 'postcode', sa.postcode, 'country', sa.country
      ) END
    ) AS addr
  FROM orders o2
  LEFT JOIN store_pickup_addresses sp ON sp.id = o2.store_pickup_address_id
  LEFT JOIN addresses sa ON sa.id = o2.shipping_address_id
  WHERE o2.shipping_address_snapshot IS NULL
) src
LEFT JOIN nexus_states ns
  ON ns.code = upper(trim(src.addr ->> 'state'))
  OR lower(ns.name) = lower(trim(src.addr ->> 'state'))
WHERE o.id = src.id
  AND src.addr IS NOT NULL;

-- Completion time was never recorded; last update is the closest we have for old completed orders.
UPDATE orders
SET completed_at = COALESCE(updated_at, created_at)
WHERE completed_at IS NULL
  AND lower(trim(COALESCE(status, ''))) IN ('completed', 'complete', 'delivered');
