-- Add job_name to order_items for customer job/PO label (e.g. "Leo - Small Banner")
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS job_name VARCHAR(255);
