---
name: Migration "applied to dev DB" claims are not trustworthy
description: When a task commit message says "Applied to dev DB" or "Schema applied", verify against both DATABASE_URL and PROD_DATABASE_URL before assuming. Multiple Task #174-class incidents have left both DBs without the columns the drizzle schema declares.
---

When a merged task ships a `scripts/prod-schema-fixups/<date>-*.sql` migration alongside a `shared/schema.ts` change and the commit message claims "Applied to dev DB" (or similar), **do not trust the claim**. Verify with `\d <table>` against both `DATABASE_URL` and `PROD_DATABASE_URL` before assuming the schema is live.

**Why:** Task agents run in an isolated environment with their own DB; whatever they "applied to dev" doesn't reach main's dev DB after the merge. Post-merge `db:push` then silently bails on rename prompts (see `albums-schema-drift.md`). Net result: both DBs drift behind `shared/schema.ts`, and the symptom is a 500 with `column "<X>" does not exist` the first time a fan or admin hits a query that references the new column — often days after the merge.

**How to apply:** After any schema-touching merge, run `\d <table>` against both DBs and diff against `shared/schema.ts`. If columns are missing, run the task's fixup .sql against the missing side(s) with `psql -f`. The scripts in `scripts/prod-schema-fixups/` are written to be idempotent (`ADD COLUMN IF NOT EXISTS`, `DO $$ … pg_constraint` guards), so it's safe to re-run against a partially-migrated DB.
