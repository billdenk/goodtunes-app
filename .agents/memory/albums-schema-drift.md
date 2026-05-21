---
name: Prod schema drift — drizzle declares columns the prod DB doesn't have
description: When an admin index page suddenly shows 0 rows for one entity but other entities load, the live prod table is almost certainly missing additive columns that shared/schema.ts already declares. Drizzle's SELECT * fails on the unknown column and the API responds 500/empty.
---

# Prod schema drift — the "everything for one entity vanished" bug

## Symptom
A single admin index page (Albums, People, Vendors, Orders, etc.) shows the empty state ("No people yet", sidebar count = 0) while other entities continue to load normally. Production only; dev is fine.

## Root cause
A recent task added columns to a table via raw `ALTER TABLE` SQL because `npm run db:push` (drizzle-kit) sits on an interactive rename-detection prompt that can't accept piped input in this environment. The dev DB got the columns; **prod did not**. `shared/schema.ts` declares the new columns, so drizzle's generated `SELECT col1, col2, …, new_col FROM …` fails with `column "new_col" does not exist` and the API returns an error or an empty list.

## Why
`scripts/post-merge.sh` runs `npm run db:push` after each task merges. Every merge log I've seen shows it stuck at a prompt like:
> Is `<some_table>` table created or renamed from another table?
> ❯ + `<some_table>` create table
>   ~ user_sessions › `<some_table>` rename table

The "rename from `user_sessions`" false positive keeps tripping the script. drizzle-kit exits without applying anything. Dev had its raw SQL applied at task time, prod never does.

## How to apply (diagnosis)
1. `psql "$PROD_DATABASE_URL" -c "SELECT COUNT(*) FROM <entity>;"` — confirm rows actually exist.
2. `psql "$PROD_DATABASE_URL" -c "\d <entity>"` — list prod columns.
3. `rg "<entityCamelCase> = pgTable" shared/schema.ts -A 40` — list expected columns.
4. Diff. The columns in the schema but not in prod are the offenders.

## How to fix
`ALTER TABLE … ADD COLUMN IF NOT EXISTS …` for every drifted column, run against `PROD_DATABASE_URL`. Idempotent. Match the type drizzle expects (varchar/text/integer/timestamp/jsonb). Re-add FK references if drizzle's column declaration has `.references(...)`.

## Known prod drift sweep query
Whenever a task description mentions "applied via raw SQL / ALTER TABLE / CREATE TABLE because drizzle-kit prompt blocked", check prod immediately:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name='<table>' ORDER BY ordinal_position;
SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='<new_table>';
```

## Longer-term fix
Either make `scripts/post-merge.sh` non-interactive (e.g. `echo "+" | npm run db:push` or pipe `printf '\n'`), or stop relying on drizzle-kit and always apply schema changes with explicit raw-SQL migrations that the script runs by file. Until then, every additive task needs an explicit "apply ALTERs to PROD" step before declaring done.
