-- Task #916 — capability model for production partners.
--
-- Adds three capability flags to the canonical `manufacturers` table so a
-- single production partner can serve up to three capabilities and appear in
-- every matching list automatically:
--   does_vinyl       — pressing plant (Presses tab + RFQ broadcast)
--   does_good_deed   — prints/finishes GoodDeed certificates
--   does_fulfillment — warehouses + ships finished units (Fulfillment nav)
--
-- does_vinyl defaults TRUE so the ADD COLUMN auto-backfills every existing
-- press as a vinyl plant (they all are today). The other two default FALSE.
-- A row with all three off is invisible to every list, so a CHECK requires at
-- least one (mirrors vendors_role_at_least_one; the PUT/POST guard gives the
-- friendlier 400). Additive + idempotent — safe to re-run.
--
-- NOTE: the real-data flips (Hoover → GoodDeeds-only, MRP → all three) are a
-- DATA backfill, not schema, and live in scripts/post-merge.sh guarded by a
-- post_merge_data_backfills marker so an operator edit is never clobbered.

BEGIN;

ALTER TABLE manufacturers
  ADD COLUMN IF NOT EXISTS does_vinyl       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS does_good_deed   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS does_fulfillment boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'manufacturers_capability_at_least_one'
  ) THEN
    ALTER TABLE manufacturers
      ADD CONSTRAINT manufacturers_capability_at_least_one
      CHECK (does_vinyl OR does_good_deed OR does_fulfillment);
  END IF;
END
$$;

COMMIT;
