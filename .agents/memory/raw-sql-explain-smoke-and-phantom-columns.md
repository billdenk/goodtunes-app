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
- `albums.created_at` / `albums.updated_at` → **albums has NO generic creation OR
  update timestamp at all.** No created_at/updated_at/inserted_at. For
  "recency"/"most-recently-touched album" ordering, order by the latest real
  lifecycle timestamp via `GREATEST(sell_quote_locked_at, masters_triggered_at,
  first_sold_at) DESC NULLS LAST` (GREATEST ignores NULLs) with `id DESC` as a
  deterministic tiebreaker — and don't forget `deleted_at IS NULL`. The
  invite-accept "land the invitee on the artist's latest album" picker hit this.
- `people.email`      → **`contact_email`**.
- `people.created_at` → **people has NO creation timestamp** (only `deleted_at`).
  `labels` DOES have `created_at`. In a people⋃labels UNION, the people branch's
  "joined_at" has to be `NULL::timestamp`.
- `person_aliases.alias` → the column is **`name`**, and it stores artist NAMES
  (+ muso/spotify source ids), NOT emails. To test "is this email on file for a
  Person" match **`people.contact_email`**, not a person_aliases column.
- `albums.is_good_tunes_release` → the boolean is **`is_goodtunes_release`** (no
  underscore between good+tunes). Confusingly the DATE column next to it
  **`good_tunes_release_date`** DOES keep the underscores. Don't pattern-match.

**Masking gotcha:** when several phantom-column `db.execute` queries run in
sequence in one block (e.g. the `POST /api/admin/invites` claimed-Person review
gate: alias-on-file → linked-admin → goodtunes-releases), the FIRST bad column
throws and hides the rest. Fixing one unmasks the next — re-verify every query in
the block against the live catalog, don't stop at the one that was reported.

**Why:** these reads predate a schema rename/cleanup and were never updated;
they 500 only when the endpoint is actually hit. Known remaining offenders
outside the early-cut/press-portal flows: `server/routes.ts` loadConnectedAlbums
(`a.cover_url`) + the active-artist albums query, and `server/npoPortal.ts`
(`a.created_at`). Extend the smoke registry when touching those flows.
