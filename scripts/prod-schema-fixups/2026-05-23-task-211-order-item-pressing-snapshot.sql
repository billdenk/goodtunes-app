-- Task #211 — Snapshot vinyl pressing picks on every order_item.
-- Adds nullable vinyl_color + jacket_upgrade columns to order_items so
-- a fan's receipt locks in the color + jacket they actually bought,
-- regardless of any later artist edit to album_skus. Null on non-vinyl
-- rows and on historical orders written before this column existed
-- (those fall back to a current-SKU lookup on read). Idempotent.

BEGIN;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS vinyl_color    text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS jacket_upgrade text;

COMMIT;
