-- Guest cart: anonymous session when user_id is NULL
ALTER TABLE cart_items ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS guest_session_id VARCHAR(128);

DO $$
BEGIN
  ALTER TABLE cart_items ADD CONSTRAINT cart_items_user_or_guest_chk CHECK (
    (user_id IS NOT NULL AND guest_session_id IS NULL)
    OR (user_id IS NULL AND guest_session_id IS NOT NULL AND length(trim(guest_session_id)) >= 8)
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_cart_items_guest_session ON cart_items (guest_session_id) WHERE guest_session_id IS NOT NULL;

-- Guest orders: snapshot when user_id is NULL (tracking can be added later)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_checkout JSONB;
