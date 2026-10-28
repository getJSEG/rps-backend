-- Admin-editable site content shown on the storefront.
-- Contact details feed the Contact Us page and the footer; NULL means "use the built-in default".
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contact_hours VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contact_address TEXT,
  ADD COLUMN IF NOT EXISTS holiday_schedule_image_url TEXT;

-- Help Center: FAQ categories, each with ordered question/answer pairs.
CREATE TABLE IF NOT EXISTS help_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS help_faqs (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES help_categories(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_help_faqs_category ON help_faqs (category_id, sort_order);
