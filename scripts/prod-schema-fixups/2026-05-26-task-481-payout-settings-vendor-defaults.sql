-- Task #481 — payout_settings schema drift.
--
-- shared/schema.ts declares default_print_vendor_id /
-- default_hologram_vendor_id / default_insertion_vendor_id on
-- payout_settings (Task #471), but neither dev nor prod actually has
-- the columns. Every code path that loads the singleton settings row
-- (album editor save, Platform Pricing page, Sell-panel cost preview
-- via server/vendorGoodDeedPricing.ts) explodes with:
--   Failed query: select … "default_print_vendor_id" … from payout_settings
--
-- The Task #471 migration in scripts/post-merge.sh ships the same
-- ALTERs, but they never landed on either DB (see
-- .agents/memory/migration-claims-vs-reality.md).
--
-- Additive, nullable, FK to vendors(id) ON DELETE SET NULL — matches
-- the drizzle definition exactly. Idempotent: safe to re-run.

BEGIN;

ALTER TABLE payout_settings
  ADD COLUMN IF NOT EXISTS default_print_vendor_id     varchar,
  ADD COLUMN IF NOT EXISTS default_hologram_vendor_id  varchar,
  ADD COLUMN IF NOT EXISTS default_insertion_vendor_id varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'payout_settings_default_print_vendor_id_vendors_id_fk'
  ) THEN
    ALTER TABLE payout_settings
      ADD CONSTRAINT payout_settings_default_print_vendor_id_vendors_id_fk
      FOREIGN KEY (default_print_vendor_id)
      REFERENCES vendors(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'payout_settings_default_hologram_vendor_id_vendors_id_fk'
  ) THEN
    ALTER TABLE payout_settings
      ADD CONSTRAINT payout_settings_default_hologram_vendor_id_vendors_id_fk
      FOREIGN KEY (default_hologram_vendor_id)
      REFERENCES vendors(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'payout_settings_default_insertion_vendor_id_vendors_id_fk'
  ) THEN
    ALTER TABLE payout_settings
      ADD CONSTRAINT payout_settings_default_insertion_vendor_id_vendors_id_fk
      FOREIGN KEY (default_insertion_vendor_id)
      REFERENCES vendors(id) ON DELETE SET NULL;
  END IF;
END
$$;

COMMIT;
