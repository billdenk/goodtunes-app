-- Task #1425 — "Manager" partner type (label-style roster).
--
-- Adds the `managers` entity table (mirrors `labels`, minus press/Shopify/
-- pricing fields) and the `people.manager_id` link (SET NULL on delete).
-- A manager's catalog is DERIVED from the albums of the people on its
-- roster (people.manager_id → albums.primary_artist_id / owned albums);
-- there is intentionally NO `albums.manager_id`.
--
-- The `managers_domain_unique` partial index excludes soft-deleted rows so
-- trashing a manager immediately frees its domain. drizzle-kit's db:push
-- does NOT push WHERE-claused indexes, so we hand-apply it here against dev
-- first, verify with `\d managers`, then re-apply against prod during
-- publish. Idempotent: CREATE TABLE / ADD COLUMN / CREATE INDEX all IF NOT
-- EXISTS, so re-running is a no-op. The canonical copy of this migration
-- also lives in scripts/post-merge.sh (migrate_managers) so every clone
-- self-heals.
--
-- NOTE: this is the manager ENTITY/role/scope-kind, a separate concept from
-- the teammate sub-role "manager" (memberships.sub_role) — do not conflate.

BEGIN;

CREATE TABLE IF NOT EXISTS managers (
  id               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  domain           text,
  logo_url         text,
  logo_locked      boolean NOT NULL DEFAULT false,
  bio              text,
  location         text,
  location_address jsonb,
  website_url      text,
  instagram_url    text,
  cover_url        text,
  created_at            timestamp DEFAULT now(),
  deleted_at            timestamp,
  deleted_by_user_id    varchar,
  deleted_via_parent_id varchar
);

-- people.manager_id — roster link. SET NULL so trashing a manager doesn't
-- cascade-delete its artists.
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS manager_id varchar REFERENCES managers(id) ON DELETE SET NULL;

-- Domain uniqueness excludes soft-deleted rows (see labels_domain_unique).
DROP INDEX IF EXISTS managers_domain_unique;
CREATE UNIQUE INDEX IF NOT EXISTS managers_domain_unique
  ON managers (domain)
  WHERE domain IS NOT NULL AND deleted_at IS NULL;

COMMIT;
