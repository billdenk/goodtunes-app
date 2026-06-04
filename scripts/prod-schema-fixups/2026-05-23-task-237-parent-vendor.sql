-- Task #237 — let Gibson-owned brands (Epiphone, Kramer, Mesa/Boogie,
-- KRK) be their own vendor rows by:
--   1. dropping the global UNIQUE constraint on vendors.domain,
--   2. adding vendors.parent_vendor_id (single-level self-FK,
--      ON DELETE SET NULL so sub-brands survive a parent delete),
--   3. enforcing domain uniqueness only on top-level rows
--      (parent_vendor_id IS NULL) via a partial unique index.
--
-- drizzle-kit's `db:push` doesn't push WHERE-claused indexes and won't
-- safely swap a UNIQUE constraint for one either, so we apply this
-- against dev first, verify with `\d vendors`, then re-apply against
-- prod during publish. Idempotent — every step guards on
-- information_schema / pg_constraint / pg_indexes so re-running is a
-- no-op.

BEGIN;

-- 1. parent_vendor_id column + FK.
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS parent_vendor_id varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendors_parent_vendor_id_fkey'
  ) THEN
    ALTER TABLE vendors
      ADD CONSTRAINT vendors_parent_vendor_id_fkey
      FOREIGN KEY (parent_vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
  END IF;
END$$;

-- 2. Drop the legacy global UNIQUE on vendors.domain. The original
--    `.unique()` in drizzle named the constraint either
--    `vendors_domain_unique` (drizzle-kit's modern convention) or
--    `vendors_domain_key` (Postgres' implicit name). Try both.
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_domain_unique;
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_domain_key;
-- Some older pushes created an implicit unique INDEX with the same
-- name instead of a constraint. Drop the index form too.
DROP INDEX IF EXISTS vendors_domain_unique;
DROP INDEX IF EXISTS vendors_domain_key;

-- 3. Partial unique index — only top-level rows (no parent) are
--    constrained. Two sub-brands of Gibson can both list
--    domain='gibson.com' without colliding with each other or with
--    Gibson's own top-level row.
-- Task #1252 — also exclude soft-deleted rows so trashing a vendor
--    immediately frees its domain slot for re-creation. Drop the old
--    index (which lacked the deleted_at predicate) before recreating.
DROP INDEX IF EXISTS vendors_domain_top_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS vendors_domain_top_uniq
  ON vendors (domain)
  WHERE parent_vendor_id IS NULL AND deleted_at IS NULL;

-- 4. Helper index for "list all sub-brands of X" lookups.
CREATE INDEX IF NOT EXISTS vendors_parent_vendor_id_idx
  ON vendors (parent_vendor_id)
  WHERE parent_vendor_id IS NOT NULL;

COMMIT;
