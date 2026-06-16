---
name: One-time data backfills to dev + prod
description: How to apply a one-time DATA (not schema) reset to both dev and prod, and why it needs a marker guard.
---

# One-time data backfills that must hit dev AND prod

`executeSql({ environment: "production" })` is **read-only** — you cannot write
prod from the task agent. The task agent's own dev DB is an **isolated throwaway
clone** (often nearly empty), so writes you make there never reach the real dev
DB or prod. The only vehicle that runs against the *real* dev DB and prod is
`scripts/post-merge.sh` (it has both `DATABASE_URL` and `PROD_DATABASE_URL` and
runs after the task merges). Add a `name dev "$DATABASE_URL"` + `name prod
"$PROD_DATABASE_URL"` function pair there, same as every schema migration.

**Why a marker guard is mandatory for DATA resets.** Schema migrations are
naturally idempotent (`ADD COLUMN IF NOT EXISTS`). A *data* reset (e.g. "set
every signed_cert price to $25") is NOT — post-merge runs on **every** future
merge, so a naive `UPDATE` would clobber later operator edits each time. Gate it
with a marker row:

```sql
CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
  name text PRIMARY KEY, applied_at timestamp NOT NULL DEFAULT now());
-- inside one BEGIN/COMMIT + DO block:
IF NOT EXISTS (SELECT 1 FROM post_merge_data_backfills WHERE name='<key>') THEN
  ...the one-time UPDATEs...
  INSERT INTO post_merge_data_backfills (name) VALUES ('<key>');
END IF;
```

**How to apply:** wrap guard + writes in a single `psql` heredoc (one session →
the marker can't strand half-applied). `post_merge_data_backfills` lives on both
dev and prod via the same script, so the publish dev→prod diff sees no drift even
though it's not in `shared/schema.ts` (publish diffs dev DB → prod DB, not
schema → prod). Use `GET DIAGNOSTICS x = ROW_COUNT` + `RAISE NOTICE` to print a
per-DB summary (rows touched, rows skipped).

**If you hand-apply the backfill directly to real dev+prod NOW (e.g. via a
standalone `scripts/*.ts` you run with `DATABASE_URL` / `PROD_DATABASE_URL`),
you MUST also `INSERT` the marker row into `post_merge_data_backfills` on BOTH
DBs by hand.** Otherwise the post-merge copy still has no marker and re-runs its
*unconditional* version on the very next merge — re-clobbering any operator edit
made in between. The post-merge function and the direct run share one marker key;
applying one without stamping the other defeats the guard. (Caught in review: a
standalone re-point script that itself updates unconditionally relies entirely on
the post-merge marker for safety, so the marker must exist before you walk away.)
