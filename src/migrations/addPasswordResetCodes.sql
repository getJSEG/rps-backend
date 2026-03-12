-- Store one-time codes for password reset (email receives code)
CREATE TABLE IF NOT EXISTS password_reset_codes (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(10) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email ON password_reset_codes(email);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires ON password_reset_codes(expires_at);
