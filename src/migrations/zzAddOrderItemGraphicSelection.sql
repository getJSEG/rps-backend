ALTER TABLE IF EXISTS order_items
  ADD COLUMN IF NOT EXISTS selection_mode VARCHAR(30),
  ADD COLUMN IF NOT EXISTS graphic_scenario_enabled BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_selection_mode_chk') THEN
      ALTER TABLE order_items
        ADD CONSTRAINT order_items_selection_mode_chk
        CHECK (selection_mode IS NULL OR selection_mode IN ('graphic_only', 'graphic_frame'));
    END IF;
  END IF;
END $$;
