-- Soft account deletion: 30-day pending period before anonymize
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'deletion_requested_at'
  ) THEN
    ALTER TABLE users ADD COLUMN deletion_requested_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'deletion_scheduled_at'
  ) THEN
    ALTER TABLE users ADD COLUMN deletion_scheduled_at TIMESTAMPTZ;
  END IF;
END $$;
