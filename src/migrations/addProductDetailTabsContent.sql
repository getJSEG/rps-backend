-- Product detail tabs content managed from admin product form
ALTER TABLE products ADD COLUMN IF NOT EXISTS spec TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS file_setup TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS installation_guide TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS faq JSONB DEFAULT '[]'::jsonb;
