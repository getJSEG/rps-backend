ALTER TABLE IF EXISTS products
  ADD COLUMN IF NOT EXISTS graphic_scenario_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS product_modifiers
  ADD COLUMN IF NOT EXISTS mode_scope VARCHAR(30) NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'product_modifiers'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_modifiers_mode_scope_chk') THEN
      ALTER TABLE product_modifiers
        ADD CONSTRAINT product_modifiers_mode_scope_chk
        CHECK (mode_scope IN ('all', 'graphic_only', 'graphic_frame'));
    END IF;
  END IF;
END $$;
