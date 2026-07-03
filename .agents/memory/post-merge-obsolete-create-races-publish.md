---
name: Obsolete post-merge index create races the publish diff
description: Why a superseded CREATE-INDEX block left in post-merge.sh can fail a production publish, even when both live DBs are already correct
---

# Obsolete post-merge index/constraint creates are a publish landmine

The publish flow **introspects the live dev DB and live prod DB and applies the
diff to prod** (it is NOT schema.ts/drizzle-kit based, and the deploy build is
`npm run build`, never post-merge.sh). So a publish that introspects the dev DB
**mid-merge** captures whatever transient objects post-merge has created at that
instant.

**The failure mode:** if post-merge has block A that CREATEs an object and a
LATER block B that DROPs+replaces it, then for the seconds between A and B the
dev DB holds the obsolete object. A publish sampling dev in that window emits a
CREATE for the obsolete object against prod — which can fail on prod data the
obsolete object can't tolerate.

**Concrete case (albums share_slug):** uniqueness moved from a GLOBAL
`albums_share_slug_unique` to a PER-ARTIST composite `albums_artist_share_slug_unique`
(task-1310). Two superseded blocks kept recreating the global index every merge:
- task-965 block — bare global, `WHERE share_slug IS NOT NULL` (NO deleted_at).
- task-1254 softdelete block — global `WHERE share_slug IS NOT NULL AND deleted_at IS NULL`.
task-1310 later DROPs the global and creates the composite, so the settled state
is composite-only on both DBs (correct). But a publish that introspected dev
during the task-965 create→task-1310 drop window captured the **bare** global and
tried to apply `CREATE UNIQUE INDEX albums_share_slug_unique ... WHERE (share_slug
IS NOT NULL)` to prod. Prod has a slug used twice — one live + one soft-deleted
release that kept its slug (e.g. `greatest-hits`) — and the bare global, lacking
the deleted_at filter, can't build. Publish stalls on "Migrations failed
validation".

**Fix:** never recreate a superseded index in post-merge. Let the owning block
(task-1310) create the composite; keep only `DROP INDEX IF EXISTS` in the older
blocks for legacy cleanup. The column ALTER (share_slug text) stays so a
freshly-cloned dev DB still has the column.

**Resolution for the operator:** keep "Cancel deployment and retry once
resolved" (NEVER "Copy dev schema & data to prod" — clobbers prod). Then
re-publish when no task merge is actively running — the diff is clean because
both DBs are already composite-only with zero live-row duplicate slugs. No prod
DML needed; the soft-deleted duplicate slug is legitimate and harmless.

**General rule:** grep post-merge.sh for any CREATE that a later block DROPs and
replaces; that create→drop churn is a publish-diff race. Remove the superseded
create.

## Variant: an IN-FLIGHT (unmerged) task's prod-side table makes publish emit a DROP

A task agent working a **prod-only data job** (its post-merge runs `CREATE TABLE
IF NOT EXISTS` against BOTH DATABASE_URL and PROD_DATABASE_URL) can create its
bookkeeping table in **live prod before the task merges**. Until that task merges,
main's dev DB and `shared/schema.ts` don't know the table exists. A publish kicked
off from main then diffs dev→prod, sees "prod has a table dev doesn't," and
generates `DROP TABLE "<name>" CASCADE` against prod.

**Symptom:** publish "Generated migrations" step shows a lone
`DROP TABLE "<something>" CASCADE;` for a table nobody in the current codebase
references (`rg` finds nothing in shared/server/scripts; dev `to_regclass` is
NULL; prod `to_regclass` is non-null).

**Do NOT approve it.** Tell the operator to **Cancel** the publish. Rationale even
when the table is empty + has no FK deps (CASCADE harmless): dropping it fights a
mid-run job and it just gets recreated on merge, so pure downside. Once the owning
task merges, main's post-merge creates the table in dev too (IF NOT EXISTS is a
no-op on prod), the drift resolves, and a re-publish is clean with no DROP.

**Diagnose fast:** `SELECT to_regclass('public.<name>')` on prod vs dev +
`rg <name> shared server scripts`. If prod-only and code-absent, it's an unmerged
task's prod artifact — cancel, wait for merge, re-publish.
