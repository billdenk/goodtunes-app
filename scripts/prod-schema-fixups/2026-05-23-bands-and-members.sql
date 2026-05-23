-- Task #190 — Bands & members modeling.
-- Adds is_group / group_kind to people, plus two join tables:
--   band_members   — (band Person ↔ member Person, with roles/tenure)
--   album_lineup   — per-album snapshot of who played on a band's record
-- Idempotent — re-runs are no-ops.

BEGIN;

-- people: group flags ───────────────────────────────────────────────
ALTER TABLE people ADD COLUMN IF NOT EXISTS is_group   boolean NOT NULL DEFAULT false;
ALTER TABLE people ADD COLUMN IF NOT EXISTS group_kind text;

-- band_members ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS band_members (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id       varchar NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  member_id     varchar NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  roles         text[],
  joined_year   integer,
  left_year     integer,
  display_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS band_members_band_id_idx   ON band_members (band_id);
CREATE INDEX IF NOT EXISTS band_members_member_id_idx ON band_members (member_id);

-- album_lineup ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS album_lineup (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id      varchar NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  member_id     varchar NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  roles         text[],
  display_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS album_lineup_album_id_idx  ON album_lineup (album_id);
CREATE INDEX IF NOT EXISTS album_lineup_member_id_idx ON album_lineup (member_id);

COMMIT;
