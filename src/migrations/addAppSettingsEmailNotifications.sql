-- Singleton app settings: admin can enable/disable order email notifications
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app_settings (id, email_notifications_enabled)
VALUES (1, TRUE)
ON CONFLICT (id) DO NOTHING;
