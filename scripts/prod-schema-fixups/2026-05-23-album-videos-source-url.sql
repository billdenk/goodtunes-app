-- album_videos.source_url was added to shared/schema.ts (the "Imported
-- from <host>" chip in the admin Edit dialog) but never reached either
-- database because post-merge.sh skips db:push and Publish hadn't run
-- since. The drift surfaces as GET /api/albums/:id/videos 500 with
-- "Failed query: select … source_url from album_videos".
-- Idempotent — safe to re-run.
ALTER TABLE album_videos ADD COLUMN IF NOT EXISTS source_url text;
