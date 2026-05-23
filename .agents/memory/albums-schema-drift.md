---
name: Prod schema drift — drizzle declares columns/tables the prod DB doesn't have
description: When admin pages 500 or render empty in prod only (Sell tab stuck loading, Shopify/Reports panels error), shared/schema.ts is ahead of the prod DB because drizzle-kit push silently bailed on a rename prompt. Sweep prod against information_schema and ADD COLUMN/CREATE TABLE IF NOT EXISTS.
---

# Prod schema drift — the "everything for one entity vanished" / "panel 500s" bug

## Symptom
Either (a) a single admin index page shows the empty state ("No people yet", sidebar count = 0) while other entities load normally, or (b) a panel/tab on a working entity 500s or stays stuck on "Loading…" (Sell tab, Shopify tab, Reports KPIs, Platform pricing). Production only; dev is fine. Logs show `column "X" does not exist` or `relation "Y" does not exist`.

## Root cause
Tasks add columns/tables to dev via raw `ALTER TABLE` / `CREATE TABLE` SQL because `npm run db:push` (drizzle-kit) sits on interactive rename-detection prompts that can't accept piped input in this environment. Dev DB gets the changes; **prod doesn't**. `shared/schema.ts` declares them, so drizzle's generated SQL fails on prod.

## Why drizzle-kit gets stuck (still happens despite `yes ""` in post-merge.sh)
Every merge log shows the prompt:
> Is `<some_table>` table created or renamed from another table?
> ❯ + `<some_table>` create table
>   ~ user_sessions › `<some_table>` rename table

`scripts/post-merge.sh` now pipes `yes ""` into `npm run db:push`, which **should** accept the default. In practice, prod still drifts across many tables (one recent sweep found 9 missing tables and ~14 missing columns on the orders/album_addons tables alone). Don't assume the post-merge auto-apply worked — verify against `PROD_DATABASE_URL` whenever a task touched schema.

## Diagnosis sweep (run BEFORE assuming anything)
Don't trust the first error in the logs — fix one column and the next request will hit a different missing one. Sweep all suspect tables in one pass:
```bash
psql "$PROD_DATABASE_URL" -c "\d <table>"          # actual columns
rg "<entityCamelCase> = pgTable" shared/schema.ts -A 60   # expected columns
```
Then check missing tables in a single query:
```sql
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public'
   AND table_name IN ('shopify_stores','shopify_product_mappings', …);
```
The drifted set typically clusters by feature area (Shopify, payouts, signed-cert) because tasks land related tables together.

## Fix
Write one SQL file with `BEGIN; …; COMMIT;` containing `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for every missing column and `CREATE TABLE IF NOT EXISTS` for every missing table, then `psql "$PROD_DATABASE_URL" -f` it. Idempotent — safe to re-run. Match the drizzle definition exactly (type, default, nullability, FK references, unique constraints).

## Gotchas surfaced by past sweeps
- **Partial indexes living only in schema comments.** `shopify_product_mappings` documents two partial unique indexes in a code comment but they were never written anywhere as SQL — `shared/schema.ts` can't model partial indexes via drizzle-kit. They have to be created by hand alongside the table:
  ```sql
  CREATE UNIQUE INDEX shopify_mapping_unique_with_variant
    ON shopify_product_mappings (store_id, shopify_product_id, shopify_variant_id)
    WHERE shopify_variant_id IS NOT NULL;
  CREATE UNIQUE INDEX shopify_mapping_unique_product_wide
    ON shopify_product_mappings (store_id, shopify_product_id)
    WHERE shopify_variant_id IS NULL;
  ```
- **Singleton settings rows.** `payout_settings` ships an `id='default'` row. After `CREATE TABLE`, also `INSERT … VALUES ('default') ON CONFLICT DO NOTHING` or `getPayoutSettings()` returns undefined and the Sell-tab profit readout shows `—`.
- **Unique constraints aren't column defaults.** Drizzle's `.unique()` on a column (e.g. `orders.shopifyOrderId`) needs an explicit `ALTER TABLE … ADD CONSTRAINT … UNIQUE` after a late `ADD COLUMN` — otherwise the column exists but the Shopify webhook's `ON CONFLICT (shopify_order_id) DO NOTHING` will throw. Guard with `IF NOT EXISTS` via a `DO $$ … pg_constraint … $$` block.
- **`origin text NOT NULL DEFAULT 'direct'` is safe to add to a populated `orders` table** — existing rows get backfilled to `'direct'` by the default, which matches the schema intent.
- **Stale FKs survive schema removal.** `db:push` only adds/alters columns; it does NOT drop FK constraints that disappear from `shared/schema.ts`. `auth_tokens.user_id → users(id)` lived on in both dev+prod long after the dual-auth refactor removed it from the schema, silently 500ing every customer OAuth sign-in (customer ids live in `customer_users`, not `users`). When a schema change *removes* a FK, drop it by hand against both DBs with `ALTER TABLE … DROP CONSTRAINT IF EXISTS …`.
