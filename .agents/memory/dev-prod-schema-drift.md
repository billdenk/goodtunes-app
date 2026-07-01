---
name: Dev↔Prod schema drift and the publish migration
description: How Replit's publish flow generates migrations (it diffs dev DB → prod DB, not schema → prod), and what to do when it wants to DROP tables/columns.
---

## The trap

Replit's publish UI shows a banner "Development database changes detected → Generated migrations to apply to production database." That migration is the **diff between dev DB and prod DB**, not between `shared/schema.ts` and prod.

So if dev DB is missing tables/columns that prod has, the publish migration will want to **DROP them from prod** — with all their data. The warning banner ("about to delete X with N items") is the only thing standing between you and a wipe.

## How dev DB falls behind

The dev DB doesn't always get a column when a task adds one to `shared/schema.ts`. The fan-side code keeps working because Drizzle is forgiving on reads, but the dev DB silently lags. Months of these accumulate. Then a publish lights up red.

## The fix

1. **Cancel the publish dialog immediately** when you see DROP TABLE / DROP COLUMN on tables that aren't obvious garbage. Don't even click into the SQL preview to "just read it" — accidental confirmations happen.
2. **Don't run `npm run db:push` blindly** — it's interactive and ambiguous ("Is X created or renamed from user_sessions?"). Wrong answer = wrong migration.
3. **Apply the missing pieces by hand**: read the `pgTable(...)` definitions in `shared/schema.ts` for each dropped table/column, write `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` SQL, and run it against `DATABASE_URL` (dev). The destructive items in the banner are exactly your todo list.
4. **Re-open the publish dialog and confirm only the legit ADDs remain** — typically the columns the current task actually wants to add.

## What does NOT matter for the publish diff

Drizzle-kit `db:push` is pickier than the publish flow. It complains about:
- Constraint names (`<table>_<col>_key` vs `<table>_<col>_unique`) — pg's default names vs drizzle's expected names for anonymous `.unique()`
- Partial unique indexes (`UNIQUE ... WHERE col IS NOT NULL`) vs full unique constraints

**The publish flow only diffs structure (tables + columns), not constraint names.** Don't chase these for publish safety. If you do rename `_key` → `_unique` on dev to quiet drizzle-kit, prod won't be affected unless prod has them too — in which case the next publish will generate harmless `ALTER TABLE ... RENAME CONSTRAINT` lines.

## Why we never write to prod directly

Targeted prod fixups live in `scripts/prod-schema-fixups/<date>-<task>.sql` and run at the next deploy. We never `psql $PROD_DATABASE_URL` from the agent. Same goes for "fix dev to match prod" — those stay dev-only. (Read-only `SELECT`s against prod to *diagnose* drift are fine.)

## Runtime lazy-created tables trigger the same DROP — and the drift guard can't see them

Some tables are NOT in `shared/schema.ts` at all: app code creates them lazily with `CREATE TABLE IF NOT EXISTS` on first use (e.g. `view_as_audit_log` in `server/auth/viewAsToken.ts`, the admin "view as"/impersonation audit trail). Consequence: prod has the table (someone used the feature there) but a fresh/unused dev clone does NOT (the code path never fired), so the publish dev→prod diff proposes a destructive `DROP TABLE ... CASCADE` with real prod rows.

Two things make this class sneaky:
- The `schema-drift-smoke` guard reflects `pgTable` definitions and won't flag these — there's no pgTable to reflect, so nothing warns you before the publish banner does.
- "Only N items" in the banner is still real data (an audit record here); the app would silently recreate an empty table after the drop, hiding the loss.

**Fix (this is the durable pattern):** add an idempotent `migrate_<table>()` block to `scripts/post-merge.sh` — `CREATE TABLE IF NOT EXISTS` matching the runtime DDL verbatim — and call it for BOTH dev and prod (mirrors every other `migrate_*` in that file), so a fresh clone always has the table and the diff stays empty. Also create it in dev now so the *current* publish stops proposing the drop (the already-staged migration won't regenerate until you Cancel + Republish). Keep the DDL in lockstep with the runtime `CREATE TABLE` in the source file.
