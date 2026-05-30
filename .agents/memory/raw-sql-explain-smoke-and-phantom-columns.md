---
name: Raw-SQL EXPLAIN smoke test + phantom album/people columns
description: How to validate hand-written db.execute(sql`...`) without a test framework, and the stale column names that recur in raw SQL across this repo.
---

# Validating raw SQL without executing it

`db.execute(sql`EXPLAIN ${innerSql}`)` inlines a drizzle SQL chunk and asks
Postgres to parse + plan it. Planning resolves **every column/table reference
against the live catalog** but never runs the statement, so it:
- catches renamed/mistyped columns (the Task #772 `orders.paid_at` class),
- needs only the schema present — works on an empty/data-less DB,
- is safe for writes (INSERT/UPDATE are planned, not executed).

`scripts/db-query-smoke.ts` is the deliverable: a registry of exported SQL
*builders* (extract inline `db.execute(sql`…`)` into `export function sqlX(): SQL`
so they're testable) EXPLAINed with dummy bind values. Registered as the
`db-query-smoke` validation command. EXPLAIN stops at the FIRST bad column, so
fixing one can reveal the next — re-run until green. Drizzle wraps the real pg
error; read `e.cause.message` (not `e.message`) to see "column X does not exist".

**Run it against BOTH `$DATABASE_URL` and `$PROD_DATABASE_URL`** — the isolated
task dev DB is a drifted clone, but prod is the real target.

# Phantom columns that recur in this repo's raw SQL

These column names appear in many hand-written queries but **do not exist** in
schema.ts, dev, or real prod (verified against prod with 264 real albums):

- `albums.cover_url`  → the cover image column is **`artwork`** (NOT NULL).
- `albums.format`     → use **`physical_format`** (press/physical) or `type` (release type LP/EP).
- `albums.created_at` → **albums has NO creation timestamp at all.** No created_at/
  updated_at/inserted_at. For "recency"/"latest album" ordering, substitute an
  existing lifecycle timestamp (e.g. `sell_quote_locked_at` for press flows).
- `people.email`      → **`contact_email`**.
- `people.created_at` → **people has NO creation timestamp** (only `deleted_at`).
  `labels` DOES have `created_at`. In a people⋃labels UNION, the people branch's
  "joined_at" has to be `NULL::timestamp`.

**Why:** these reads predate a schema rename/cleanup and were never updated;
they 500 only when the endpoint is actually hit. Known remaining offenders
outside the early-cut/press-portal flows: `server/routes.ts` loadConnectedAlbums
(`a.cover_url`) + the active-artist albums query, and `server/npoPortal.ts`
(`a.created_at`). Extend the smoke registry when touching those flows.
