-- Add properties (JSONB) for product attributes e.g. {"Size": "Large", "Material": "Vinyl"}
ALTER TABLE products ADD COLUMN IF NOT EXISTS properties JSONB DEFAULT '[]'::jsonb;

-- Comment: description column already exists (TEXT) - can store HTML from rich editor
