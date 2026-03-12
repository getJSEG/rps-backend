-- Add full_name to users if missing (used by auth, admin, employees)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'full_name'
  ) THEN
    ALTER TABLE users ADD COLUMN full_name VARCHAR(255);
  END IF;
END $$;
