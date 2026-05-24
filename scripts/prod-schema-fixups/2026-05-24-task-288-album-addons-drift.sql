-- Task #288 — Sell tab stuck on Loading.
--
-- shared/schema.ts declares five columns on `album_addons` that never
-- made it into either dev or prod DBs (Task #245's drizzle-kit push
-- silently bailed). Every Sell-tab open 500s on
-- listAllAddons → "column print_vendor_id does not exist", so the
-- SellPanel's `isLoading || !data` gate stays Loading forever.
--
-- Idempotent — safe to re-run on a partially-migrated DB.

BEGIN;

ALTER TABLE album_addons
  ADD COLUMN IF NOT EXISTS print_vendor_id     varchar REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hologram_vendor_id  varchar REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS insertion_vendor_id varchar REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pricing_snapshot    jsonb,
  ADD COLUMN IF NOT EXISTS pricing_snapshot_at timestamp;

COMMIT;
