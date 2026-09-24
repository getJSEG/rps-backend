-- Design editor: admin-uploaded editor templates per product, and customer designs made from them.

CREATE TABLE IF NOT EXISTS product_design_templates (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    -- Original SVG uploaded by the admin.
    svg_url TEXT NOT NULL,
    svg_storage_key TEXT NOT NULL,
    -- PNG rendered from the SVG; this is what the editor loads.
    image_url TEXT NOT NULL,
    image_storage_key TEXT NOT NULL,
    image_width_px INTEGER NOT NULL,
    image_height_px INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_design_templates_product_id
    ON product_design_templates(product_id);

CREATE TABLE IF NOT EXISTS designs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    guest_session_id VARCHAR(128),
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    -- Template row may be deleted later; the design keeps its own file.
    template_id INTEGER REFERENCES product_design_templates(id) ON DELETE SET NULL,
    source VARCHAR(20) NOT NULL CHECK (source IN ('created', 'uploaded')),
    design_state JSONB,
    file_url TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    width_px INTEGER,
    height_px INTEGER,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT designs_owner_present CHECK (user_id IS NOT NULL OR guest_session_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_designs_user_id ON designs(user_id);
CREATE INDEX IF NOT EXISTS idx_designs_guest_session_id ON designs(guest_session_id);

-- Uploaded designs keep the customer's original image so "Edit my design" can reopen it with its edit layers.
ALTER TABLE designs ADD COLUMN IF NOT EXISTS original_file_url TEXT;
