/**
 * Task #3451 — MRP "Translucent" group renders as generated translucent vinyl.
 *
 * One-time, idempotent update of Memphis Record Pressing's already-persisted
 * Vinyl component (press_components.config, component_key 'vinyl'): every
 * gen-less swatch in the EXACT "Translucent" category gains a Standard
 * generator spec with the Translucent finish, seeded from its saved swatch
 * hex. Photos (customImg), names, ids, sizes and every other category are
 * left byte-identical — the imported photo stays as the rebuild/compare
 * reference. Swatches an operator already rebuilt through the generator
 * (carrying `gen`) are never overwritten.
 *
 * Safety:
 *   - Memphis is resolved by exact identity (name / domain), never
 *     ILIKE-first-row (prod carries decoy manufacturer rows).
 *   - Marker-guarded via post_merge_data_backfills so a later operator edit
 *     (e.g. deliberately removing a swatch's gen) is never re-clobbered by
 *     the next merge. No press / no vinyl row = skip WITHOUT stamping the
 *     marker (the seed path produces the same result on a fresh read, and a
 *     later merge re-checks cheaply).
 *
 * Dev:   npx tsx scripts/backfill-mrp-translucent-gen.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/backfill-mrp-translucent-gen.ts
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import {
  applyMrpTranslucentStandardGen,
  type VinylComponentConfig,
} from "../shared/pressComponents";

const MARKER = "task_3451_mrp_translucent_gen";

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name text PRIMARY KEY,
      created_at timestamptz DEFAULT now()
    )
  `);
  const marked = await db.execute(
    sql`SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}`,
  );
  if ((marked as any).rows?.length) {
    console.log(`[mrp-translucent-gen] marker ${MARKER} present — nothing to do`);
    return;
  }

  // Exact-identity resolution (never ILIKE-first-row — prod decoy rows).
  const pressRes = await db.execute(sql`
    SELECT id, name, domain FROM manufacturers
    WHERE lower(trim(name)) = 'memphis record pressing'
       OR lower(coalesce(domain, '')) LIKE '%memphisrecordpressing%'
    ORDER BY (lower(coalesce(domain, '')) LIKE '%memphisrecordpressing%') DESC, created_at
    LIMIT 1
  `);
  const press = (pressRes as any).rows?.[0];
  if (!press) {
    console.log("[mrp-translucent-gen] no Memphis Record Pressing row — skipping (marker left unset)");
    return;
  }

  const rowRes = await db.execute(sql`
    SELECT id, config FROM press_components
    WHERE press_id = ${press.id} AND component_key = 'vinyl'
    LIMIT 1
  `);
  const row = (rowRes as any).rows?.[0];
  if (!row) {
    console.log("[mrp-translucent-gen] Memphis has no persisted vinyl component — seed path covers it (marker left unset)");
    return;
  }

  const config = row.config as VinylComponentConfig;
  const { config: next, changed } = applyMrpTranslucentStandardGen(config);
  if (changed) {
    const updated = (next.categories ?? [])
      .filter((c) => (c.name ?? "").trim().toLowerCase() === "translucent")
      .reduce((n, c) => n + c.swatches.filter((s) => s.gen).length, 0);
    await db.execute(sql`
      UPDATE press_components
      SET config = ${JSON.stringify(next)}::jsonb, updated_at = now()
      WHERE id = ${row.id}
    `);
    console.log(`[mrp-translucent-gen] updated Translucent group — ${updated} generated swatch(es)`);
  } else {
    console.log("[mrp-translucent-gen] already normalized — no write");
  }
  await db.execute(
    sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT (name) DO NOTHING`,
  );
  console.log(`[mrp-translucent-gen] marker ${MARKER} stamped`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[mrp-translucent-gen] FAILED:", err);
    return pool.end().finally(() => process.exit(1));
  });
