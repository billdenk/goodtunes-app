// Task #1113 — Catch missing database columns before they break the live site.
//
// This repo has a recurring failure mode: a column/table is added to
// `shared/schema.ts` but no matching `migrate_*` block ever ships in
// `scripts/post-merge.sh`, so neither the dev nor the prod database gets it.
// Published code then SELECTs/UPDATEs a column that doesn't exist and the
// surface 500s — days after merge, one outage at a time (see
// .agents/memory/albums-schema-drift.md and migration-claims-vs-reality.md).
//
// This script is the cheap automated guard. It:
//   1. Reflects every Drizzle `pgTable(...)` out of `shared/schema.ts` using
//      drizzle's own `getTableConfig` (more robust than regex — it sees the
//      real db column names, spreads like `...softDeleteCols`, etc.), building
//      a table → {db column names} map.
//   2. Pulls `information_schema.columns` from the live database.
//   3. Fails (exit 1) if the schema declares a table or column the database is
//      missing, printing the exact `table.column` pairs so the fix — an
//      idempotent `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`
//      block in post-merge.sh — is obvious.
//
// It checks `DATABASE_URL` (the dev DB used by CI/validation) and, when
// `PROD_DATABASE_URL` is also present, additionally diffs prod read-only.
//
// Note: this is intentionally one-directional. Columns/tables that exist in
// the DB but not in the schema are NOT failures here — drift in that direction
// (legacy/leftover columns, prod-only seed tables) is handled by the Publish
// diff and the post-merge reconciliation, and would produce noisy false
// positives. We only care about what the *code* needs but the DB lacks.
//
// Run with: `tsx scripts/schema-drift-smoke.ts`.

import { Pool } from "pg";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import * as schema from "../shared/schema";

type TableColumns = { table: string; columns: Set<string> };

// Build the table → db-column-names map from the Drizzle schema definitions.
function declaredTables(): TableColumns[] {
  const out: TableColumns[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const cfg = getTableConfig(value as PgTable);
    out.push({
      table: cfg.name,
      columns: new Set(cfg.columns.map((c) => c.name)),
    });
  }
  return out;
}

type Missing = { table: string; column: string | null };

async function checkDb(label: string, url: string): Promise<Missing[]> {
  const declared = declaredTables();
  const pool = new Pool({ connectionString: url });
  const missing: Missing[] = [];
  try {
    const { rows } = await pool.query<{
      table_name: string;
      column_name: string;
    }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'`,
    );

    // table -> Set(db columns) actually present in the database.
    const present = new Map<string, Set<string>>();
    for (const r of rows) {
      let set = present.get(r.table_name);
      if (!set) {
        set = new Set<string>();
        present.set(r.table_name, set);
      }
      set.add(r.column_name);
    }

    for (const { table, columns } of declared) {
      const dbCols = present.get(table);
      if (!dbCols) {
        // Whole table is missing from the DB.
        missing.push({ table, column: null });
        continue;
      }
      for (const col of columns) {
        if (!dbCols.has(col)) {
          missing.push({ table, column: col });
        }
      }
    }
  } finally {
    await pool.end();
  }

  if (missing.length === 0) {
    console.log(
      `  ✓ ${label}: all ${declared.length} schema tables present with every declared column`,
    );
  } else {
    console.error(`  ✗ ${label}: ${missing.length} missing object(s)`);
    for (const m of missing) {
      if (m.column === null) {
        console.error(`      MISSING TABLE   ${m.table}`);
      } else {
        console.error(`      MISSING COLUMN  ${m.table}.${m.column}`);
      }
    }
  }
  return missing;
}

async function main() {
  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) {
    console.error("schema-drift-smoke: DATABASE_URL is not set — cannot check.");
    process.exit(1);
  }

  console.log("schema-drift-smoke: comparing shared/schema.ts → database\n");

  const devMissing = await checkDb("dev (DATABASE_URL)", devUrl);

  const prodUrl = process.env.PROD_DATABASE_URL;
  let prodMissing: Missing[] = [];
  if (prodUrl && prodUrl !== devUrl) {
    prodMissing = await checkDb("prod (PROD_DATABASE_URL, read-only)", prodUrl);
  } else {
    console.log("  · prod (PROD_DATABASE_URL) not set — skipping prod diff");
  }

  const total = devMissing.length + prodMissing.length;
  if (total > 0) {
    console.error(
      `\nschema-drift-smoke: schema declares ${total} table/column${
        total === 1 ? "" : "s"
      } the database is missing.\n` +
        `These would 500 in production the moment a query touches them. Add an\n` +
        `idempotent ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS block to\n` +
        `scripts/post-merge.sh (run against both dev and prod) before merging.`,
    );
    process.exit(1);
  }

  console.log("\nschema-drift-smoke: no drift — schema and database agree.");
}

main().catch((e) => {
  console.error("schema-drift-smoke crashed:", e);
  process.exit(1);
});
