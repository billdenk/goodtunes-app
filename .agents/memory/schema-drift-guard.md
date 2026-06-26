---
name: schema-drift guard
description: The validation step that catches schema.ts columns/tables the DB is missing, and where to fix any drift it finds.
---

# schema-drift guard

`scripts/schema-drift-smoke.ts` is a registered validation step (sibling to `db-query-smoke`) that reflects every Drizzle `pgTable` out of `shared/schema.ts` via drizzle's own `getTableConfig` (NOT regex), pulls `information_schema.columns`, and **fails if the schema declares a table/column the DB lacks**. Checks `DATABASE_URL` and, when set, `PROD_DATABASE_URL` (read-only).

**Why:** this repo's recurring outage is schema drift — a column added to `shared/schema.ts` with no matching `migrate_*` block in `scripts/post-merge.sh`, so neither DB ever gets it and published code 500s days later (see `albums-schema-drift.md`, `migration-claims-vs-reality.md`). This is the cheap pre-merge guard.

**How to apply (the fix when it goes red):** the failure prints exact `table.column` pairs. Add a matching idempotent `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` block to `scripts/post-merge.sh` mirroring the `shared/schema.ts` definition, run against BOTH dev and prod (the `migrate_task_1113_schema_drift` function is the template). Then re-run the guard.

**Direction-only by design:** DB-only columns/tables (legacy leftovers, prod-only seeds) are NOT flagged — that direction is handled by the Publish diff + post-merge reconciliation and would be noisy false positives. We only catch what code needs but the DB lacks.

**Register via the validation skill** (`setValidationCommand`), never by hand-editing `.replit` (that edit is blocked).

**Stale workflow status after same-restart table creation:** the `schema-drift-smoke` WORKFLOW line is a snapshot from its last run (often the restart moment). If you create the missing table/column AFTER that restart, the workflow still shows FAILED with the old timestamp. Trust a fresh direct `tsx scripts/schema-drift-smoke.ts` over the cached workflow status — re-run it, don't believe the stale red.
