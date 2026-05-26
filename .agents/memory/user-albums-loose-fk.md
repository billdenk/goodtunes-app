---
name: fan-table user_id loose-FK pattern
description: user_albums / playlists / song_favorites / artist_favorites all carry customer_users.id in user_id even though no single-table FK can express that — drop .references() in schema and sweep the leftover constraint via post-merge.sh.
---

Every fan-written table with a `user_id` column stores `customer_users.id`, **not** `users.id` (admin), even when the Drizzle schema historically pointed `.references(() => users.id)`. Postgres can't express "FK to one of two tables" so the FK has to be dropped entirely; the schema column is a loose varchar.

Confirmed tables on this pattern: `user_albums`, `playlists`, `song_favorites`, `artist_favorites`. The same applied to `auth_tokens.user_id` until Task #265 split it into per-side `admin_user_id` / `customer_user_id` columns (see [auth-tokens-fk-recurrence.md](auth-tokens-fk-recurrence.md)).

**Why:** GoodTunes has two parallel user tables (admin `users` + fan `customer_users`). Fan writes always carry the customer id. When a `.references(users.id)` FK *is* enforced (e.g. fresh DB created via `db:push`, or the publish dev→prod diff re-adding a dropped constraint), fan inserts 500 immediately — that's exactly how Task #395 surfaced for `playlists`.

**How to apply:**
- In `shared/schema.ts`, fan `user_id` columns are loose `varchar("user_id").notNull()` — **no `.references()`**.
- Add an idempotent `ALTER TABLE … DROP CONSTRAINT IF EXISTS <table>_user_id_users_id_fk` to `scripts/post-merge.sh` for both DBs so the publish dev→prod diff can't keep re-adding it.
- Never join these tables to `users`. Join `customer_users` instead.
- Possibly-affected siblings still carrying the FK in schema: `profile_photos.user_id`, `analytics_events.user_id`. Both are written for fans too; if a fan-side 500 ever shows up on those columns, apply the same fix.
