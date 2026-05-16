-- Schema additions backing the muso.ai credits import.
-- Idempotent: safe to run against dev or prod, repeatedly.
--
--   psql "$DATABASE_URL" -f scripts/migrate-muso-tables.sql
--
-- After this runs, scripts/import-muso-llt.ts can be invoked with --apply.

BEGIN;

ALTER TABLE people ADD COLUMN IF NOT EXISTS muso_id text;

CREATE TABLE IF NOT EXISTS person_aliases (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id varchar NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  name text NOT NULL,
  source text,
  source_id text
);
CREATE UNIQUE INDEX IF NOT EXISTS person_aliases_source_id_uniq
  ON person_aliases (source, source_id)
  WHERE source IS NOT NULL AND source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS organizations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL,
  muso_id text,
  website_url text,
  logo_url text,
  label_id varchar REFERENCES labels(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT NOW()
);
-- Prevent duplicate org rows when re-importing.
CREATE UNIQUE INDEX IF NOT EXISTS organizations_muso_id_uniq
  ON organizations (muso_id)
  WHERE muso_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS track_mechanical_splits (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id varchar NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  person_id varchar REFERENCES people(id) ON DELETE SET NULL,
  organization_id varchar REFERENCES organizations(id) ON DELETE SET NULL,
  name text NOT NULL,
  role text NOT NULL,
  percent_bp integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS track_publishing_splits (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id varchar NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  person_id varchar REFERENCES people(id) ON DELETE SET NULL,
  organization_id varchar REFERENCES organizations(id) ON DELETE SET NULL,
  name text NOT NULL,
  role text NOT NULL,
  pro_affiliation text,
  percent_bp integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0
);

COMMIT;
