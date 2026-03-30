-- Update Users table to remove NOT NULL constraint from company_name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'company_name'
  ) THEN
    ALTER TABLE IF EXISTS users
      ALTER COLUMN company_name DROP NOT NULL;
  END IF;
END $$;
