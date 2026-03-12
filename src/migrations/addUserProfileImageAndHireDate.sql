-- Add profile_image (URL) and hire_date for employees/admins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'profile_image'
  ) THEN
    ALTER TABLE users ADD COLUMN profile_image VARCHAR(500);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'hire_date'
  ) THEN
    ALTER TABLE users ADD COLUMN hire_date DATE;
  END IF;
END $$;
