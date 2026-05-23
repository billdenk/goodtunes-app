-- Task #217 — Print-ready PDF generation history.
-- Two tables: `print_generations` groups one click of "Generate print
-- PDFs for [Vendor]" on a release admin page; `print_artifacts` lists
-- the individual per-template PDFs produced (center label, jacket,
-- insert, …). Versioning is implicit — re-generating inserts a new
-- generation row; older ones remain downloadable. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS print_generations (
  id                     varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id               varchar NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  vendor_id              text NOT NULL,
  created_by_user_id     varchar,
  override_justification text,
  created_at             timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS print_generations_album_idx
  ON print_generations(album_id, created_at DESC);

CREATE TABLE IF NOT EXISTS print_artifacts (
  id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id   varchar NOT NULL REFERENCES print_generations(id) ON DELETE CASCADE,
  template_id     text NOT NULL,
  template_label  text NOT NULL,
  file_name       text NOT NULL,
  asset_url       text NOT NULL,
  size_bytes      integer NOT NULL,
  created_at      timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS print_artifacts_generation_idx
  ON print_artifacts(generation_id);

COMMIT;
