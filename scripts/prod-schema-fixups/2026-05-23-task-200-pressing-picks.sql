-- Task #200 — Snapshot vinyl pressing picks on every SKU.
-- Adds the artist's chosen color (+ collapsed price tier), jacket
-- upgrade, snapped quantity tier, and the source of the cost number
-- onto `album_skus` so the Cost readout stays stable until re-save
-- and we have a record of exactly which row of the Hellbender matrix
-- the SKU was priced from. Idempotent.

BEGIN;

ALTER TABLE album_skus ADD COLUMN IF NOT EXISTS vinyl_color           text;
ALTER TABLE album_skus ADD COLUMN IF NOT EXISTS vinyl_color_tier      text;
ALTER TABLE album_skus ADD COLUMN IF NOT EXISTS jacket_upgrade        text;
ALTER TABLE album_skus ADD COLUMN IF NOT EXISTS quantity_tier         integer;
ALTER TABLE album_skus ADD COLUMN IF NOT EXISTS cost_source           text;

COMMIT;
