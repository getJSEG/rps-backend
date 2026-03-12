-- Cart items table: stores cart per user for role-based cart (user sees own, admin sees all)
CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cart_items_user ON cart_items(user_id);
