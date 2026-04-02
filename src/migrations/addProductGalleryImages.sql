-- Multiple product photos; first URL is also stored in image_url for listings and legacy clients.
ALTER TABLE products ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]'::jsonb;
