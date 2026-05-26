-- Task #461 — `instruments.source_url` keeps the original product/listing
-- page each piece of gear was scraped from (Carter Vintage page,
-- martinguitar.com model page, etc). Without it we can't refetch a
-- missing rehosted photo and we have nowhere to send fans tapping the
-- gear in SuperCredits™. Idempotent — safe to re-run on both dev and
-- prod. Apply to dev by hand before publish so the dev→prod diff is
-- empty.
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS source_url text;
