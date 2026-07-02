/**
 * One-shot, idempotent cleanup of Memphis Record Pressing's vinyl-color
 * catalog, which got DOUBLED by a second import: every color group exists
 * twice — a plain tier (e.g. "Opaque", with hex swatches + the proper name)
 * and a "*"-suffixed tier (e.g. "Opaque*", carrying the per-color photos Bill
 * uploaded). Plus a handful of empty "*Blends*" shells (Metallic/Glitter/…)
 * that never got any colors.
 *
 * Goal: collapse each pair down to the SINGLE plain tier, moving the uploaded
 * photos onto it so nothing Bill uploaded is lost, then delete the leftover
 * "*" artifacts.
 *
 * Why keep the plain tier (not the "*" one):
 *   - It already has the clean name (no asterisk) and the hex fallbacks.
 *   - Its position forms a clean 0..8 sequence once the "*" tiers are gone.
 *   - SKU snapshots store the tier NAME as text; no live album_skus reference
 *     any of these Memphis names (verified), so this is invisible to orders.
 *   - Pricing lives in press_tier_jacket_ladders and is currently an all-$0
 *     placeholder on every Memphis tier, so the choice is pricing-neutral.
 *
 * What it does, per vinyl format (7_inch, 12_lp, 12_double):
 *   1. Move swatch_image_url (+ import_source_url) from each "*" tier onto the
 *      matching plain tier's same-named color, but ONLY where the plain color
 *      has no image yet (operator edits / prior imports are never clobbered).
 *      Neon images (N01–N06) fold into "Neon/Glow".
 *   2. Delete the "*" tiers (FK cascade drops their colors + jacket ladders).
 *      "Glow*" is a pure duplicate of Neon/Glow's G01 and is just deleted.
 *      The empty "*Blends*" shells are deleted (zero data in them).
 *
 * IDEMPOTENT: once the "*" tiers are gone, re-runs find nothing and no-op.
 * Safe on a clean catalog (e.g. dev, which never had the "*" tiers).
 *
 * BACKUP: before any write, dumps every Memphis tier + color + jacket ladder
 * for the targeted DB to scripts/backups/memphis-catalog-<env>-latest.json
 * (fixed filename, overwritten in place; git-ignored, never committed).
 *
 * Dev:   npx tsx scripts/cleanup-memphis-catalog.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/cleanup-memphis-catalog.ts
 * Dry run (no writes, just the plan): add --dry
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";

const DRY = process.argv.includes("--dry");
const FORMATS = ["7_inch", "12_lp", "12_double"] as const;

// plain tier  ->  "*" tier whose photos fold into it
const IMAGE_MERGES: Array<[plain: string, star: string]> = [
  ["Opaque", "Opaque*"],
  ["Translucent", "Translucent*"],
  ["Smoke Blends", "Smoke Blends*"],
  ["Neon/Glow", "Neon*"],
];

// every "*" tier to remove once photos are folded in
const STAR_TIERS_TO_DELETE = [
  "Opaque*",
  "Translucent*",
  "Smoke Blends*",
  "Neon*",
  "Glow*",
  "EcoMix*",
  "Cream Blends*",
  "Standard Blends*",
  "Metallic Blends*",
  "Glitter Blends*",
  "Shimmer Blends*",
  "Deluxe Blends*",
];

async function main() {
  const pressRows = await db.execute<{ id: string; name: string }>(
    sql`SELECT id, name FROM manufacturers WHERE name = 'Memphis Record Pressing' LIMIT 1`,
  );
  const press = pressRows.rows[0];
  if (!press) {
    console.log("Memphis Record Pressing not found in this DB — nothing to do.");
    return;
  }
  const pressId = press.id;
  const envLabel =
    process.env.DATABASE_URL === process.env.PROD_DATABASE_URL ? "prod" : "dev";
  console.log(`Target: ${envLabel} DB · press ${press.name} (${pressId})${DRY ? " · DRY RUN" : ""}`);

  // ---- Show the "*" tiers currently present (the cleanup target) ----
  const starPresent = await db.execute<{ format: string; name: string; colors: number }>(sql`
    SELECT t.format, t.name, COUNT(c.id)::int AS colors
    FROM press_color_tiers t
    LEFT JOIN press_colors c ON c.tier_id = t.id
    WHERE t.press_id = ${pressId} AND t.name LIKE '%*%'
    GROUP BY t.format, t.id, t.name
    ORDER BY t.format, t.name
  `);
  if (starPresent.rows.length === 0) {
    console.log('No "*" tiers present — catalog already clean. Clean no-op.');
    return;
  }

  // ---- Backup (only when we're about to mutate the DB) ----
  if (!DRY) {
    const backup = await db.execute(sql`
      SELECT
        (SELECT jsonb_agg(to_jsonb(t)) FROM press_color_tiers t WHERE t.press_id = ${pressId}) AS tiers,
        (SELECT jsonb_agg(to_jsonb(c)) FROM press_colors c
           JOIN press_color_tiers t ON t.id = c.tier_id WHERE t.press_id = ${pressId}) AS colors,
        (SELECT jsonb_agg(to_jsonb(j)) FROM press_tier_jacket_ladders j
           JOIN press_color_tiers t ON t.id = j.tier_id WHERE t.press_id = ${pressId}) AS jacket_ladders
    `);
    mkdirSync("scripts/backups", { recursive: true });
    const backupPath = `scripts/backups/memphis-catalog-${envLabel}-latest.json`;
    writeFileSync(backupPath, JSON.stringify({ pressId, snapshot: backup.rows[0] }, null, 2));
    console.log(`Backup written: ${backupPath}`);
  }
  console.log(`\n"*" tiers to remove (after folding photos in):`);
  for (const r of starPresent.rows) console.log(`  ${r.format}  ${r.name}  (${r.colors} colors)`);

  if (DRY) {
    // Report how many photos WOULD move per twin/format.
    console.log(`\n[DRY] photos that would fold into plain tiers:`);
    for (const fmt of FORMATS) {
      for (const [plain, star] of IMAGE_MERGES) {
        const cnt = await db.execute<{ n: number }>(sql`
          SELECT COUNT(*)::int AS n
          FROM press_colors pc
          JOIN press_color_tiers pt ON pt.id = pc.tier_id
          JOIN press_color_tiers st ON st.press_id = pt.press_id AND st.format = pt.format AND st.name = ${star}
          JOIN press_colors sc ON sc.tier_id = st.id AND sc.name = pc.name
          WHERE pt.press_id = ${pressId} AND pt.format = ${fmt} AND pt.name = ${plain}
            AND sc.swatch_image_url IS NOT NULL AND pc.swatch_image_url IS NULL
        `);
        const n = cnt.rows[0]?.n ?? 0;
        if (n > 0) console.log(`  ${fmt}  ${star} -> ${plain}: ${n} photos`);
      }
    }
    console.log(`\n[DRY] no changes written. Re-run without --dry to apply.`);
    return;
  }

  let moved = 0;
  let deleted = 0;
  await db.transaction(async (tx) => {
    for (const fmt of FORMATS) {
      for (const [plain, star] of IMAGE_MERGES) {
        const res = await tx.execute(sql`
          UPDATE press_colors pc
          SET swatch_image_url = sc.swatch_image_url,
              import_source_url = COALESCE(sc.import_source_url, pc.import_source_url)
          FROM press_colors sc
          JOIN press_color_tiers st ON st.id = sc.tier_id
          WHERE pc.tier_id = (
              SELECT id FROM press_color_tiers
              WHERE press_id = ${pressId} AND format = ${fmt} AND name = ${plain}
            )
            AND st.press_id = ${pressId} AND st.format = ${fmt} AND st.name = ${star}
            AND sc.name = pc.name
            AND sc.swatch_image_url IS NOT NULL
            AND pc.swatch_image_url IS NULL
        `);
        moved += res.rowCount ?? 0;
      }
      const del = await tx.execute(sql`
        DELETE FROM press_color_tiers
        WHERE press_id = ${pressId} AND format = ${fmt}
          AND name IN (${sql.join(STAR_TIERS_TO_DELETE.map((n) => sql`${n}`), sql`, `)})
      `);
      deleted += del.rowCount ?? 0;
    }
  });
  console.log(`\nDone. Folded ${moved} photos onto plain tiers; deleted ${deleted} "*" tiers (colors + ladders cascaded).`);

  // ---- Verify final shape ----
  const after = await db.execute<{ format: string; tier: string; colors: number; img: number }>(sql`
    SELECT t.format, t.name AS tier, COUNT(c.id)::int AS colors,
           COUNT(c.swatch_image_url)::int AS img
    FROM press_color_tiers t
    LEFT JOIN press_colors c ON c.tier_id = t.id
    WHERE t.press_id = ${pressId}
    GROUP BY t.format, t.id, t.name, t.position
    ORDER BY t.format, t.position
  `);
  console.log(`\nFinal Memphis catalog:`);
  for (const r of after.rows) console.log(`  ${r.format}  ${r.tier}  (${r.colors} colors, ${r.img} photos)`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
