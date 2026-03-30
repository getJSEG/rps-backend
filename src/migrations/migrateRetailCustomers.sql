-- One-time: retail shoppers use role "customer" and no manual approval.
UPDATE users
SET role = 'customer',
    is_approved = true
WHERE LOWER(COALESCE(role, '')) IN ('reseller', 'user');
