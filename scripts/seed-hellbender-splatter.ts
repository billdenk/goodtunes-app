/**
 * Load Hellbender "Splatter" tier disc-color swatches from Bill's AUTHORITATIVE
 * PNG export.
 *
 * Source of truth: the 31 disc renders Bill exported himself
 * (`attached_assets/20260616_Hellbender_-_PNGs_1781669771008.zip`), rebuilt into
 * `scripts/data/splatter-discs/01.png..31.png` + named in
 * `scripts/data/hellbender-splatter-photos.json` by
 * `scripts/build-hellbender-splatter-discs.ts`. The picker shows the disc PNG
 * (`swatch_image_url`); `swatch_hex` is a never-displayed fallback.
 *
 * This SUPERSEDES the earlier PROVISIONAL 32-disc set extracted from the press's
 * generic `BONUS_VinylMockUp_Examples.psd` (import_source_url
 * `psd:BONUS_VinylMockUp_Examples`). That provisional set had already landed in
 * the dev DB; Bill's export drops one color ("Purple / White / Royal Blue
 * Tri-Color Striped w/ White Splatter") and is the renders he approved. So this
 * is a scoped clean REPLACE, not a blind insert: per Splatter tier we DELETE the
 * old PSD-sourced rows, then insert Bill's 31 if-absent-by-name. The delete is
 * scoped to the old import_source, so genuine operator-added colors are never
 * touched, and the new rows carry a new import_source so a no-marker re-run is a
 * no-op (defense in depth on top of the marker).
 *
 * Curation-safe + one-time: a `post_merge_data_backfills` marker short-circuits
 * re-runs PER DB (the table lives in each DB), so once this has run an operator
 * can rename / reprice / delete any Splatter color and a later post-merge run
 * won't clobber it or resurrect the dropped one.
 *
 * Two idempotent phases:
 *   1. MIRROR each local PNG into Object Storage ONCE. The bucket is shared by
 *      dev + prod, so the resolved `/objects/uploads/<id>` URL resolves in both.
 *      Resolved URLs persist back to the (committed) manifest so a second run
 *      (prod) and fresh clones reuse them instead of re-uploading.
 *   2. For the target DB, scoped-replace the Splatter colors as described above.
 *
 * Hellbender's id and its tier ids DRIFT between dev and prod, so the press is
 * resolved by name and the tiers by (press_id, name) at runtime — never hardcoded.
 *
 * Dev:   npx tsx scripts/seed-hellbender-splatter.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/seed-hellbender-splatter.ts
 * Dry:   add --dry  (no uploads, no writes — just reports what it would do)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { objectStorageClient } from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";

const DRY = process.argv.includes("--dry");
const MANIFEST = "scripts/data/hellbender-splatter-photos.json";
const DISC_DIR = "scripts/data/splatter-discs";
const TIER_NAME = "Splatter";
const EXPECTED_COLORS = 31;
// New rows carry this source; the old provisional set carried OLD_IMPORT_SOURCE.
const IMPORT_SOURCE = "hellbender-splatter-export-20260616";
const OLD_IMPORT_SOURCE = "psd:BONUS_VinylMockUp_Examples";
// Per-DB one-time guard so operator edits survive future post-merge runs.
const MARKER = "hellbender_splatter_swatches";

type Color = {
  position: number;
  name: string;
  file: string;
  swatchHex: string;
  publicUrl?: string;
};
type Manifest = { source: string; note?: string; discDir?: string; colors: Color[] };

/** Upload a local disc PNG into the shared Object Storage bucket (public ACL). */
async function mirrorLocal(file: string): Promise<string> {
  const buf = readFileSync(join(DISC_DIR, file));
  const id = `${crypto.randomUUID()}.png`;
  const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
  const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = trimmed.indexOf("/");
  const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
  const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
  const objectName = `${prefix ? `${prefix}/` : ""}uploads/${id}`;
  const f = objectStorageClient.bucket(bucketName).file(objectName);
  await f.save(buf, {
    contentType: "image/png",
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
    resumable: false,
  });
  await setObjectAclPolicy(f as any, { owner: "admin", visibility: "public" } as any);
  return `/objects/uploads/${id}`;
}

async function main() {
  // Hellbender's id drifts across dev/prod — resolve by name.
  const pressRows = await db.execute<{ id: string; name: string }>(
    sql`SELECT id, name FROM manufacturers WHERE name ILIKE '%hellbender%' LIMIT 1`,
  );
  const press = pressRows.rows[0];
  if (!press) {
    console.log("Hellbender not found in this DB — nothing to do.");
    return;
  }
  const envLabel = process.env.DATABASE_URL === process.env.PROD_DATABASE_URL ? "prod" : "dev";
  console.log(`Target: ${envLabel} DB · press ${press.name} (${press.id})${DRY ? " · DRY RUN" : ""}`);

  // Only populate Splatter tiers that already exist — never create one (an
  // unpriced tier would make SKUs unpriceable). Tier ids drift, so resolve here.
  const tierRows = await db.execute<{ id: string; format: string }>(
    sql`SELECT id, format FROM press_color_tiers
        WHERE press_id = ${press.id} AND name = ${TIER_NAME}
        ORDER BY format`,
  );
  if (!tierRows.rows.length) {
    console.log(`No "${TIER_NAME}" tiers on this press — nothing to do.`);
    return;
  }
  console.log(`Found ${tierRows.rows.length} Splatter tier(s): ${tierRows.rows.map((t) => t.format).join(", ")}`);

  // Drift guard: Splatter is a 12" stock — it lives on exactly the two 12"
  // formats. If prod surfaces anything else (a duplicate/archived Hellbender
  // row, or an unexpected 7_inch Splatter tier), stop and let a human look
  // before we fan 31 rows into the wrong place.
  const EXPECTED_FORMATS = ["12_double", "12_lp"];
  const gotFormats = tierRows.rows.map((t) => t.format).sort();
  if (JSON.stringify(gotFormats) !== JSON.stringify(EXPECTED_FORMATS)) {
    console.error(
      `Refusing to seed: expected Splatter tiers on exactly [${EXPECTED_FORMATS.join(", ")}] ` +
        `but found [${gotFormats.join(", ")}]. Resolve manually before re-running.`,
    );
    process.exitCode = 1;
    return;
  }

  // Per-DB one-time marker — once applied, leave operator curation alone.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  const markerRows = await db.execute<{ one: number }>(
    sql`SELECT 1 AS one FROM post_merge_data_backfills WHERE name = ${MARKER}`,
  );
  if (markerRows.rows.length) {
    console.log(`seed-hellbender-splatter: marker '${MARKER}' present — already applied, skipping`);
    return;
  }

  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  // Hard-fail BEFORE any write/stamp — a regenerated manifest with the wrong
  // count must never lock in a partial set behind the one-time marker.
  if (manifest.colors.length !== EXPECTED_COLORS) {
    throw new Error(
      `manifest has ${manifest.colors.length} colors (expected ${EXPECTED_COLORS}) — ` +
        `re-run scripts/build-hellbender-splatter-discs.ts before seeding.`,
    );
  }

  // ---- Phase 1: mirror local PNGs (idempotent via manifest publicUrl) ----
  const need = manifest.colors.filter((c) => !c.publicUrl);
  console.log(`\nImages to mirror: ${need.length}/${manifest.colors.length}`);
  if (!DRY) {
    let done = 0;
    for (const c of need) {
      c.publicUrl = await mirrorLocal(c.file);
      done++;
      if (done % 8 === 0 || done === need.length) console.log(`  mirrored ${done}/${need.length}`);
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
    }
  } else if (need.length) {
    console.log(`  [DRY] would mirror ${need.length} images.`);
  }

  // ---- Phase 2: scoped clean-replace per Splatter tier ----
  if (DRY) {
    for (const t of tierRows.rows) {
      const oldRows = await db.execute<{ n: number }>(
        sql`SELECT COUNT(*)::int AS n FROM press_colors WHERE tier_id = ${t.id} AND import_source_url = ${OLD_IMPORT_SOURCE}`,
      );
      const existing = await db.execute<{ name: string }>(
        sql`SELECT name FROM press_colors WHERE tier_id = ${t.id} AND import_source_url <> ${OLD_IMPORT_SOURCE}`,
      );
      const haveAfterDelete = new Set(existing.rows.map((r) => r.name));
      const add = manifest.colors.filter((c) => !haveAfterDelete.has(c.name)).length;
      console.log(`  [DRY] ${t.format} Splatter: would delete ${oldRows.rows[0].n} old PSD row(s), insert ${add}`);
    }
    console.log("\n[DRY] no changes written (marker not stamped).");
    return;
  }

  let deleted = 0;
  let inserted = 0;
  let skipped = 0;
  await db.transaction(async (tx) => {
    for (const t of tierRows.rows) {
      // Remove only the un-approved provisional set; leave operator rows alone.
      const del = await tx.execute(
        sql`DELETE FROM press_colors WHERE tier_id = ${t.id} AND import_source_url = ${OLD_IMPORT_SOURCE}`,
      );
      deleted += del.rowCount ?? 0;

      const existing = await tx.execute<{ name: string }>(
        sql`SELECT name FROM press_colors WHERE tier_id = ${t.id}`,
      );
      const have = new Set(existing.rows.map((r) => r.name));
      for (const c of manifest.colors) {
        if (have.has(c.name)) {
          skipped++;
          continue;
        }
        if (!c.publicUrl) {
          console.warn(`  ! no publicUrl for "${c.name}" — skipping`);
          continue;
        }
        await tx.execute(sql`
          INSERT INTO press_colors (tier_id, name, swatch_hex, swatch_image_url, position, import_source_url)
          VALUES (${t.id}, ${c.name}, ${c.swatchHex}, ${c.publicUrl}, ${c.position}, ${IMPORT_SOURCE})`);
        inserted++;
      }
    }
    await tx.execute(
      sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT (name) DO NOTHING`,
    );
  });
  console.log(
    `\nDone. Deleted ${deleted} old PSD row(s), inserted ${inserted}, skipped ${skipped} (already present). Marker '${MARKER}' stamped.`,
  );

  // ---- Verify ----
  const after = await db.execute<{ format: string; colors: number; with_photo: number }>(sql`
    SELECT t.format, COUNT(c.id)::int AS colors, COUNT(c.swatch_image_url)::int AS with_photo
    FROM press_color_tiers t
    LEFT JOIN press_colors c ON c.tier_id = t.id
    WHERE t.press_id = ${press.id} AND t.name = ${TIER_NAME}
    GROUP BY t.format ORDER BY t.format`);
  console.log("Splatter tiers now (colors / with_photo):");
  for (const r of after.rows) console.log(`  ${r.format}: ${r.colors} / ${r.with_photo}`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
