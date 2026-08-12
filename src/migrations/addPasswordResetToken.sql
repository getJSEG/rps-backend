-- Password reset via emailed link: only the SHA-256 hash of the token is stored
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'reset_token_hash'
  ) THEN
    ALTER TABLE users ADD COLUMN reset_token_hash VARCHAR(64);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'reset_token_expires_at'
  ) THEN
    ALTER TABLE users ADD COLUMN reset_token_expires_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_reset_token_hash ON users (reset_token_hash);
