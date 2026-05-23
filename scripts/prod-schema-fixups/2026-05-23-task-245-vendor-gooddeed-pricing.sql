-- Task #245 — Vendor-managed GoodDeed pricing portal.
--
-- 1. New `vendor_gooddeed_services` table. One row per (vendor_id, service)
--    triple. `service` ∈ {'printing','hologram','insertion'}. Printing
--    carries a per-tier ladder in `tiers_json` (tier_qty → per_unit_cents).
--    Hologram + insertion carry a single `flat_per_unit_cents`. Setup fee,
--    minimum batch, lead-time days, ship-to default, and notes are common
--    to all three legs.
--
-- 2. Three nullable vendor FK columns on `album_addons` (one per leg) +
--    a `pricing_snapshot` jsonb that the sale-window close handler stamps
--    once the run goes to print.
--
-- 3. Idempotent / re-runnable. Safe on dev DBs that already have parts.

CREATE TABLE IF NOT EXISTS vendor_gooddeed_services (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id varchar NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  service text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  -- Printing: jsonb array of { qty: int, perUnitCents: int }, sorted asc.
  -- Hologram / insertion: NULL (use flat_per_unit_cents).
  tiers_json jsonb,
  -- Hologram / insertion flat price. Printing: NULL.
  flat_per_unit_cents integer,
  setup_fee_cents integer NOT NULL DEFAULT 0,
  min_batch integer NOT NULL DEFAULT 25,
  lead_time_days integer NOT NULL DEFAULT 14,
  ship_to_default text,
  notes text,
  updated_by_user_id varchar,
  updated_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_gooddeed_services_vendor_service_uniq
  ON vendor_gooddeed_services (vendor_id, service);

ALTER TABLE vendor_gooddeed_services
  DROP CONSTRAINT IF EXISTS vendor_gooddeed_services_service_check;
ALTER TABLE vendor_gooddeed_services
  ADD CONSTRAINT vendor_gooddeed_services_service_check
  CHECK (service IN ('printing','hologram','insertion'));

ALTER TABLE album_addons
  ADD COLUMN IF NOT EXISTS print_vendor_id varchar
    REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hologram_vendor_id varchar
    REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS insertion_vendor_id varchar
    REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS pricing_snapshot_at timestamp;
