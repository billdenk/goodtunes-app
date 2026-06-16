/**
 * Replace Hellbender Vinyl color swatches with realistic *record* mockups.
 *
 * Hellbender's color swatches were previously the studio mockups scraped from
 * their Shopify storefront (see backfill-hellbender-photos.ts). Those came in
 * on a gray/white photo backdrop that never masked cleanly, so Bill asked for
 * proper record-looking swatches instead: a neutral grayscale vinyl disc
 * (extracted from the supplied PSD) tinted with each catalog color, so every
 * swatch reads as a real colored record rather than a flat chip.
 *
 * The 35 tinted discs were generated offline (one PNG per color, named by the
 * color's slug, e.g. "Clear Blue" -> clear-blue.png) and live in RECORDS_DIR.
 *
 * Two idempotent phases (same shape as backfill-hellbender-photos.ts):
 *   1. MIRROR each disc PNG into Object Storage ONCE (shared dev+prod bucket →
 *      the /objects/uploads/<id> URL resolves in both). Resolved URLs persist
 *      to scripts/data/hellbender-records.json so a second run (prod) reuses
 *      them instead of re-uploading. After the first dev run the manifest is
 *      complete, so prod + post-merge never need the source PNGs again.
 *   2. For the target DB, re-point EVERY Hellbender press_colors row whose name
 *      matches at its disc image (swatch_image_url). This is a deliberate
 *      replace (the rows already carry the old studio mockups), so unlike the
 *      photos backfill there is no NULL-only guard. We DON'T touch swatch_hex
 *      (it stays as the matching fallback) and we DON'T touch import_source_url
 *      (it feeds the Shopify "already imported" dedup in routes.ts).
 *
 * Dev:   npx tsx scripts/backfill-hellbender-records.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/backfill-hellbender-records.ts
 * Dry run (no writes): add --dry
 *
 * Source PNG dir defaults to .local/proof/records; override with RECORDS_DIR.
 * Once the manifest carries every color's publicUrl the dir is no longer read.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { objectStorageClient } from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";

const DRY = process.argv.includes("--dry");
const RECORDS_DIR = (process.env.RECORDS_DIR || ".local/proof/records").replace(/\/$/, "");
const MANIFEST = "scripts/data/hellbender-records.json";

type Entry = { name: string; slug: string; publicUrl?: string };
type Manifest = { source: string; colors: Entry[] };

const norm = (s: string) => s.trim().toLowerCase();
const slugify = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-");

async function uploadBuffer(buf: Buffer, mime = "image/png"): Promise<string> {
  const ext = mime === "image/png" ? ".png" : mime === "image/jpeg" ? ".jpg" : mime === "image/webp" ? ".webp" : ".png";
  const id = `${crypto.randomUUID()}${ext}`;
  const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
  const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = trimmed.indexOf("/");
  const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
  const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
  const objectName = `${prefix ? `${prefix}/` : ""}uploads/${id}`;
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  await file.save(buf, {
    contentType: mime,
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
    resumable: false,
  });
  await setObjectAclPolicy(file as any, { owner: "admin", visibility: "public" } as any);
  return `/objects/uploads/${id}`;
}

async function main() {
  const pressRows = await db.execute<{ id: string; name: string }>(
    sql`SELECT id, name FROM manufacturers WHERE name ILIKE '%hellbender%' LIMIT 1`,
  );
  const press = pressRows.rows[0];
  if (!press) {
    console.log("Hellbender not found in this DB — nothing to do.");
    return;
  }
  const pressId = press.id;
  const envLabel = process.env.DATABASE_URL === process.env.PROD_DATABASE_URL ? "prod" : "dev";
  console.log(`Target: ${envLabel} DB · press ${press.name} (${pressId})${DRY ? " · DRY RUN" : ""}`);

  // ---- Backup ----
  const backup = await db.execute(sql`
    SELECT jsonb_agg(to_jsonb(c)) AS colors
    FROM press_colors c JOIN press_color_tiers t ON t.id = c.tier_id
    WHERE t.press_id = ${pressId}`);
  mkdirSync("scripts/backups", { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `scripts/backups/hellbender-records-${envLabel}-${ts}.json`;
  writeFileSync(backupPath, JSON.stringify({ pressId, colors: backup.rows[0] }, null, 2));
  console.log(`Backup written: ${backupPath}`);

  // ---- Build name set from target DB ----
  const dbNamesRes = await db.execute<{ name: string }>(sql`
    SELECT DISTINCT c.name FROM press_colors c
    JOIN press_color_tiers t ON t.id = c.tier_id
    WHERE t.press_id = ${pressId} ORDER BY c.name`);
  const dbNames = dbNamesRes.rows.map((r) => r.name);

  // ---- Resolve a disc image per DB color name (manifest-cached) ----
  const manifest: Manifest = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, "utf8"))
    : { source: "PSD: tinted neutral vinyl disc base, one per catalog color", colors: [] };
  const byName = new Map(manifest.colors.map((c) => [norm(c.name), c]));

  for (const name of dbNames) {
    if (!byName.has(norm(name))) {
      const e: Entry = { name, slug: slugify(name) };
      manifest.colors.push(e);
      byName.set(norm(name), e);
    }
  }

  // ---- Phase 1: upload (idempotent via manifest publicUrl) ----
  const targets = dbNames.map((n) => byName.get(norm(n))).filter((e): e is Entry => !!e);
  const need = targets.filter((e) => !e.publicUrl);
  console.log(`\nResolved ${targets.length}/${dbNames.length} colors · ${need.length} discs to upload.`);
  if (!DRY) {
    let done = 0;
    for (const e of need) {
      const path = `${RECORDS_DIR}/${e.slug}.png`;
      if (!existsSync(path)) {
        throw new Error(`Missing disc PNG for "${e.name}" at ${path} (set RECORDS_DIR or regenerate).`);
      }
      e.publicUrl = await uploadBuffer(readFileSync(path), "image/png");
      done++;
      if (done % 6 === 0 || done === need.length) console.log(`  uploaded ${done}/${need.length}`);
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    }
    if (!need.length) writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  } else if (need.length) {
    console.log(`  [DRY] would upload ${need.length} discs from ${RECORDS_DIR}.`);
    for (const e of need) {
      const path = `${RECORDS_DIR}/${e.slug}.png`;
      console.log(`    ${e.name} <- ${path}${existsSync(path) ? "" : "  (MISSING!)"}`);
    }
  }

  // ---- Phase 2: re-point every matched row at its disc image ----
  if (DRY) {
    for (const e of targets) {
      const cnt = await db.execute<{ n: number }>(sql`
        SELECT COUNT(*)::int AS n FROM press_colors c
        JOIN press_color_tiers t ON t.id = c.tier_id
        WHERE t.press_id = ${pressId} AND c.name = ${e.name}`);
      const n = cnt.rows[0]?.n ?? 0;
      if (n) console.log(`  [DRY] ${e.name}: would re-point ${n} row(s)`);
    }
    console.log("\n[DRY] no changes written.");
    return;
  }

  let updated = 0;
  await db.transaction(async (tx) => {
    for (const e of targets) {
      if (!e.publicUrl) continue;
      const res = await tx.execute(sql`
        UPDATE press_colors c
        SET swatch_image_url = ${e.publicUrl}
        FROM press_color_tiers t
        WHERE c.tier_id = t.id AND t.press_id = ${pressId} AND c.name = ${e.name}`);
      updated += res.rowCount ?? 0;
    }
  });
  console.log(`\nDone. Color rows re-pointed to record swatches: ${updated}.`);

  // ---- Verify ----
  const after = await db.execute<{ tier: string; format: string; colors: number; with_photo: number }>(sql`
    SELECT t.name AS tier, t.format, COUNT(c.id)::int AS colors,
           COUNT(c.swatch_image_url)::int AS with_photo
    FROM press_color_tiers t
    LEFT JOIN press_colors c ON c.tier_id = t.id
    WHERE t.press_id = ${pressId}
    GROUP BY t.format, t.name, t.position ORDER BY t.format, t.position`);
  console.log("\nHellbender tiers (colors / with_photo):");
  for (const r of after.rows) console.log(`  ${r.format}  ${r.tier}: ${r.colors} / ${r.with_photo}`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
