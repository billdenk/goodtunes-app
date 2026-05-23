-- Task #219 — restore admin index pages after Publish.
--
-- shared/schema.ts declares labels.invited_by_press_id and
-- people.invited_by_press_id (Task #199 — invited-by press soft-lock for
-- the Sell-panel press calculator). Both columns are missing from prod,
-- so every `db.select().from(labels|people)` 500s with
-- `column "<table>".invited_by_press_id does not exist`. That kills the
-- Labels admin index, the People admin index, and the Albums admin index
-- (Albums LEFT JOINs labels). The Vendors admin page is collateral damage
-- via AdminFrame sidebar counts hitting one of the same endpoints.
--
-- This patch is idempotent (ADD COLUMN IF NOT EXISTS + DO $$ … pg_constraint
-- guard) so it's safe to re-run against a partially-migrated DB.

BEGIN;

ALTER TABLE labels
  ADD COLUMN IF NOT EXISTS invited_by_press_id varchar;

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS invited_by_press_id varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'labels_invited_by_press_id_fkey'
  ) THEN
    ALTER TABLE labels
      ADD CONSTRAINT labels_invited_by_press_id_fkey
      FOREIGN KEY (invited_by_press_id) REFERENCES manufacturers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'people_invited_by_press_id_fkey'
  ) THEN
    ALTER TABLE people
      ADD CONSTRAINT people_invited_by_press_id_fkey
      FOREIGN KEY (invited_by_press_id) REFERENCES manufacturers(id) ON DELETE SET NULL;
  END IF;
END
$$;

COMMIT;
