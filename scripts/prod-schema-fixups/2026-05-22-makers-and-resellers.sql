-- Task #174 — Split Vendors into Makers + Resellers.
-- One vendor row can carry both flags (Gibson is both Maker and Reseller).
-- Adds the Maker FK on instruments (one builder per piece of gear).
-- Idempotent — re-runs are no-ops.

BEGIN;

-- vendors role flags ─────────────────────────────────────────────────
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_maker    boolean NOT NULL DEFAULT false;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_reseller boolean NOT NULL DEFAULT true;

-- At least one role must be true at all times — the row would be a
-- ghost otherwise (invisible to both index pages). Mirrors the API
-- guard in PUT /api/admin/vendors/:id. Constraint is NOT VALID-safe
-- via the DO block so re-runs against a partially-migrated DB don't
-- fail on existing rows the API has been mutating in the meantime.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendors_role_at_least_one'
  ) THEN
    -- Cure any zero-role rows first so the constraint can be added.
    UPDATE vendors SET is_reseller = true WHERE NOT is_maker AND NOT is_reseller;
    ALTER TABLE vendors
      ADD CONSTRAINT vendors_role_at_least_one CHECK (is_maker OR is_reseller);
  END IF;
END $$;

-- instruments → maker (vendor) FK ────────────────────────────────────
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS maker_vendor_id varchar;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'instruments_maker_vendor_id_fkey'
  ) THEN
    ALTER TABLE instruments
      ADD CONSTRAINT instruments_maker_vendor_id_fkey
      FOREIGN KEY (maker_vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill ───────────────────────────────────────────────────────────
-- Every existing vendor is already a reseller (that's what the table
-- meant before this task). The DEFAULT on ADD COLUMN already sets this
-- for existing rows, but we re-state it explicitly so re-runs against
-- a partially-migrated DB also settle correctly.
UPDATE vendors SET is_reseller = true WHERE is_reseller IS NULL OR is_reseller = false;

-- Infer Maker on a vendor whose name appears as a token inside any
-- instrument.name (e.g. "Gibson" in "1959 Gibson Les Paul Standard").
-- Word-boundary match so "Fen" doesn't match "Fender", and "PRS" doesn't
-- match arbitrary letter runs. Case-insensitive.
UPDATE vendors v
   SET is_maker = true
 WHERE NOT v.is_maker
   AND EXISTS (
     SELECT 1 FROM instruments i
      WHERE i.name ~* ('\m' || regexp_replace(v.name, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M')
   );

-- Link gear → maker using the same name-match rule. Where multiple
-- vendor rows could match one instrument (e.g. "Gibson" + "Gibson
-- Custom"), Postgres picks one deterministically by the join row order
-- — the admin can re-pick in the Maker selector. Skips instruments
-- that already have a maker_vendor_id so re-runs are safe.
UPDATE instruments i
   SET maker_vendor_id = v.id
  FROM vendors v
 WHERE i.maker_vendor_id IS NULL
   AND v.is_maker
   AND i.name ~* ('\m' || regexp_replace(v.name, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M');

COMMIT;
