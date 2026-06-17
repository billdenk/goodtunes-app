/**
 * Seed Hellbender "Splatter" tier disc-color swatches.
 *
 * Bill confirmed the source: the 32 disc renders in the press's
 * `BONUS_VinylMockUp_Examples.psd`. Those layers were extracted (centered on
 * transparency, trimmed + re-canvased to 600x600) to `scripts/data/splatter-discs/01.png..32.png`
 * and named from the PSD layer labels in `scripts/data/hellbender-splatter-photos.json`.
 *
 * Hellbender's 12" Splatter tiers (12_lp + 12_double) currently render EMPTY in
 * the admin SellPanel package designer — there are no color rows. This loads the
 * 32 disc renders the same way "House Mix" was loaded: each render becomes one
 * color row with the disc PNG as its `swatch_image_url` (the picker shows the
 * disc, not a flat hex). `swatch_hex` is a never-displayed fallback.
 *
 * HONEST CAVEAT (for Bill): these 32 are a MIX of effects (splatter, marble,
 * smoke, galaxy, color-in-color, tri-color) from a generic mockup template — not
 * Hellbender's verified per-color catalog — and all sit at the flat Splatter tier
 * price. An operator can rename / reprice / delete any of them in admin.
 *
 * Two idempotent phases (same pattern as backfill-hellbender-photos.ts):
 *   1. MIRROR each local PNG into Object Storage ONCE. The bucket is shared by
 *      dev + prod, so the resolved `/objects/uploads/<id>` URL resolves in both.
 *      Resolved URLs persist back to the manifest so a second run (prod) reuses
 *      them instead of re-uploading. (We skip maskToVinylDisc — these renders are
 *      already clean transparent discs.)
 *   2. For the target DB, INSERT one color row per render into EACH existing
 *      Splatter tier, only when (tier_id, name) is absent — exactly ensureColor's
 *      contract. We never create a Splatter tier (an unpriced tier breaks SKUs)
 *      and never clobber an existing row, so re-runs + operator edits are safe.
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
const IMPORT_SOURCE = "psd:BONUS_VinylMockUp_Examples";

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
  // before we fan 32 rows into the wrong place.
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

  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  if (manifest.colors.length !== 32) {
    console.warn(`! manifest has ${manifest.colors.length} colors (expected 32)`);
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
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    }
  } else if (need.length) {
    console.log(`  [DRY] would mirror ${need.length} images.`);
  }

  // ---- Phase 2: insert one color row per render into each Splatter tier ----
  if (DRY) {
    for (const t of tierRows.rows) {
      const existing = await db.execute<{ name: string }>(
        sql`SELECT name FROM press_colors WHERE tier_id = ${t.id}`,
      );
      const have = new Set(existing.rows.map((r) => r.name));
      const add = manifest.colors.filter((c) => !have.has(c.name)).length;
      console.log(`  [DRY] ${t.format} Splatter: would insert ${add} (already ${have.size})`);
    }
    console.log("\n[DRY] no changes written.");
    return;
  }

  let inserted = 0;
  let skipped = 0;
  await db.transaction(async (tx) => {
    for (const t of tierRows.rows) {
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
  });
  console.log(`\nDone. Inserted ${inserted} color row(s), skipped ${skipped} (already present).`);

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
