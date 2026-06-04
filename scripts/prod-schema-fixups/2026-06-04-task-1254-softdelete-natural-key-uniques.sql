-- Task #1254 — audit follow-up to the vendors_domain_top_uniq fix (#1252).
--
-- The vendors domain index was fixed in #1252 to exclude soft-deleted rows.
-- The SAME soft-delete/unique-index mismatch existed on every other
-- soft-deletable entity carrying a natural-key unique:
--   * labels.domain
--   * manufacturers.domain
--   * fulfillment_partners.domain
--   * albums.share_slug
--
-- None of those partial indexes filtered on deleted_at, so trashing a
-- label / press / fulfillment partner / release permanently squatted its
-- domain/slug and re-creation blew up with an unhandled 23505 unique
-- violation. We drop each prior index/constraint and recreate it with
-- `... AND deleted_at IS NULL` so trashing immediately frees the slot.
--
-- drizzle-kit's db:push doesn't push WHERE-claused indexes, so we apply
-- this against dev first, verify with `\d <table>`, then re-apply against
-- prod during publish. Idempotent: DROP IF EXISTS + CREATE UNIQUE INDEX
-- IF NOT EXISTS, so re-running is a no-op. The canonical copy of this
-- migration also lives in scripts/post-merge.sh
-- (migrate_softdelete_natural_key_uniques) so every clone self-heals.

BEGIN;

-- labels.domain — drop any prior form (constraint or index) then recreate
-- excluding soft-deleted rows.
ALTER TABLE labels DROP CONSTRAINT IF EXISTS labels_domain_unique;
ALTER TABLE labels DROP CONSTRAINT IF EXISTS labels_domain_key;
DROP INDEX IF EXISTS labels_domain_unique;
DROP INDEX IF EXISTS labels_domain_key;
CREATE UNIQUE INDEX IF NOT EXISTS labels_domain_unique
  ON labels (domain)
  WHERE domain IS NOT NULL AND deleted_at IS NULL;

-- manufacturers.domain
ALTER TABLE manufacturers DROP CONSTRAINT IF EXISTS manufacturers_domain_unique;
ALTER TABLE manufacturers DROP CONSTRAINT IF EXISTS manufacturers_domain_key;
DROP INDEX IF EXISTS manufacturers_domain_unique;
DROP INDEX IF EXISTS manufacturers_domain_key;
CREATE UNIQUE INDEX IF NOT EXISTS manufacturers_domain_unique
  ON manufacturers (domain)
  WHERE domain IS NOT NULL AND deleted_at IS NULL;

-- fulfillment_partners.domain
ALTER TABLE fulfillment_partners DROP CONSTRAINT IF EXISTS fulfillment_partners_domain_unique;
ALTER TABLE fulfillment_partners DROP CONSTRAINT IF EXISTS fulfillment_partners_domain_key;
DROP INDEX IF EXISTS fulfillment_partners_domain_unique;
DROP INDEX IF EXISTS fulfillment_partners_domain_key;
CREATE UNIQUE INDEX IF NOT EXISTS fulfillment_partners_domain_unique
  ON fulfillment_partners (domain)
  WHERE domain IS NOT NULL AND deleted_at IS NULL;

-- albums.share_slug — the prior partial index filtered share_slug IS NOT
-- NULL but NOT deleted_at, so a trashed release squatted its slug.
DROP INDEX IF EXISTS albums_share_slug_unique;
CREATE UNIQUE INDEX IF NOT EXISTS albums_share_slug_unique
  ON albums (share_slug)
  WHERE share_slug IS NOT NULL AND deleted_at IS NULL;

COMMIT;
