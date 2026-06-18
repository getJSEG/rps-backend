CREATE TABLE IF NOT EXISTS product_template_files (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    group_label VARCHAR(255) NOT NULL,
    group_value VARCHAR(255) NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    template_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_template_files_product_id
    ON product_template_files(product_id);

CREATE INDEX IF NOT EXISTS idx_product_template_files_grouping
    ON product_template_files(product_id, group_value, file_type);
