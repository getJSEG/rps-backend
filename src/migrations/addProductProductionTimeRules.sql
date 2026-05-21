ALTER TABLE IF EXISTS products
ADD COLUMN IF NOT EXISTS production_time_rules JSONB DEFAULT '[]'::jsonb;
