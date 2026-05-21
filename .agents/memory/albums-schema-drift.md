---
name: Albums query schema drift
description: When /api/albums 500s with "Failed query… <col>", the live DB is missing a column shared/schema.ts selects. Symptom in UI is "all albums gone" + sidebar Albums=0.
---

If the admin reports "all our albums are gone" and `/admin/albums` shows
0 in every tab (Prepping / Staged / Released / Sunset) AND the sidebar
shows `Albums 0`, the data is almost certainly NOT gone. Check the
workflow log for `GET /api/albums 500` first.

The failure mode: `shared/schema.ts` defines a column (e.g.
`priceCents: integer("price_cents")`) that hasn't been pushed to the
live database yet. Drizzle's `select()` lists every column from the
schema, so the SELECT fails with `column "albums.price_cents" does not
exist`. The frontend's `useQuery` then has no data, AdminFrame's
sidebar count is 0, and AdminAlbums' tabs all bucket from an empty
list.

**Why this matters:** the user sees a catastrophic-looking data loss
when the only actual problem is one missing nullable column. Reach for
DB inspection before believing the seed is gone.

**How to apply:**
1. `psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM albums;"` — confirm
   rows still exist.
2. Grep the workflow log for `GET /api/albums` — a 500 with `Failed
   query` in the body names the offending column.
3. Either `npm run db:push` (preferred, handles all drift) or
   `ALTER TABLE albums ADD COLUMN IF NOT EXISTS <col> <type>;` for a
   quick patch.
4. The same pattern applies to any table — when a list endpoint 500s
   and the SQL in the error message references a column not in `\d
   <table>`, the schema is ahead of the DB.

The post-merge script (`scripts/post-merge.sh`) already runs
`db:push`, so this shouldn't recur on merge unless db:push was killed
mid-run (see `post-merge-db-push.md` for the rename-prompt hang that
can cause that).
