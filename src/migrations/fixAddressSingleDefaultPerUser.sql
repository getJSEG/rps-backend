-- Ensure at most one default address per user (any type). Idempotent.
-- Keeps the lowest address id among rows that were marked default per user.
WITH keeper AS (
  SELECT DISTINCT ON (user_id) id
  FROM addresses
  WHERE is_default = true
  ORDER BY user_id, id ASC
)
UPDATE addresses a
SET is_default = (a.id IN (SELECT id FROM keeper));
