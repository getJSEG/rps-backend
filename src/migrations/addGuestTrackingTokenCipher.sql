-- Reversible copy of the guest tracking token so notification emails sent outside the
-- checkout request (Stripe webhook, admin status change, FedEx shipment) can rebuild the
-- guest's tracking link. Authorization still goes through guest_tracking_token_hash.
-- Orders placed before this column exists keep a NULL value and simply get no link.
ALTER TABLE IF EXISTS orders
  ADD COLUMN IF NOT EXISTS guest_tracking_token_cipher TEXT;
