/**
 * Upload Viryl Technologies Corp. catalogue disc photos to Object Storage
 * and stamp swatch_image_url on the matching press_colors rows.
 *
 * Source of truth: attached_assets/Catalogue_2024-1_1782363107376.pdf
 *
 * v2 — fixes the white-disc / white-blob bug (Task #2125). The v1 run masked
 * Viryl discs with maskToVinylDisc's COLOUR-segmentation path, which is tuned
 * for Hellbender's light two-tone studio backdrop and erases the dark parts of
 * a disc photographed on Viryl's near-uniform DARK backdrop (so Black/Gold/
 * Silver/Apple Red rendered as plain white circles, and dark-component marbles
 * lost half the disc to a white blob). v2 instead masks with the shape-only
 * crop ({ shapeOnly: true }) — it finds the disc circle and cuts to it,
 * preserving every interior pixel regardless of colour — and FORCE-overwrites
 * the bad v1 URLs behind a new marker.
 *
 * What this script does:
 *   1. Runs `pdfimages -j` to extract every JPEG embedded in the catalogue PDF.
 *      (v2 points at the full `Catalogue_2024-1_…` catalogue — the older
 *      `Catalogue_2024_…` PDF no longer extracts all the disc images under the
 *      current pdfimages, but the colour→index map is identical.)
 *   2. Uses a hardcoded page→image-index→color-name mapping derived from
 *      `pdfimages -list` + `pdftotext -layout` analysis of the PDF.
 *   3. For each mapped color, loads the JPEG disc photo, applies the shape-only
 *      maskToVinylDisc crop to cut out the uniform dark backdrop, and uploads
 *      the transparent PNG to Object Storage.
 *   4. Overwrites swatch_image_url on every SCRIPT-MANAGED row for the colour
 *      (importSourceUrl null = the v1 stamp, or already our Viryl marker) and
 *      stamps importSourceUrl = VIRYL_PHOTO_SOURCE so future tooling can tell a
 *      script-managed swatch from an operator upload. Operator uploads done via
 *      the admin upload+PATCH set a different importSourceUrl-bearing flow; we
 *      never clobber a row whose importSourceUrl points elsewhere.
 *   5. Sets the `viryl_photos_v2` marker so re-runs are idempotent no-ops.
 *
 * Page→color mapping notes:
 *   - Page 1 (cover) has a decorative Black disc — skipped (not the catalog entry).
 *   - Page 2 = OPAQUE section header (no disc).
 *   - Page 15 = CLEAR section header (no disc).
 *   - Page 22 = TRANSLUCENT section header (no disc).
 *   - Page 27 = EFFECTS section header (no disc).
 *   - Page 28 = Silver+Apple Red+Neon Splatter has no disc photo in the PDF.
 *   - Random Colours/Ecomix (page 45) has only a small non-disc image — skipped.
 *
 * Dev:  npx tsx scripts/viryl-photos.ts
 * Prod: DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/viryl-photos.ts
 * Dry:  add --dry
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { manufacturers, pressColorTiers, pressColors } from "@shared/schema";
import { maskToVinylDisc } from "../server/vendorColorScrape";
import {
  ObjectStorageService,
  objectStorageClient,
} from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";

const DRY = process.argv.includes("--dry");
const MARKER = "viryl_photos_v2";
const PDF_PATH = join(process.cwd(), "attached_assets/Catalogue_2024-1_1782363107376.pdf");
// Stamped on importSourceUrl for every swatch this script writes, so a later
// re-stamp can overwrite our own rows but leave operator uploads alone.
const VIRYL_PHOTO_SOURCE = "viryl:catalogue-2024-disc";

const objectStorage = new ObjectStorageService();

function colorSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveUploadTarget(id: string): { bucketName: string; objectName: string; publicUrl: string } {
  const privateDir = objectStorage.getPrivateObjectDir().replace(/\/$/, "");
  const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = trimmed.indexOf("/");
  const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
  const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
  const objectName = `${prefix ? `${prefix}/` : ""}uploads/${id}`;
  return { bucketName, objectName, publicUrl: `/objects/uploads/${id}` };
}

// Deterministic, version-stamped object key per colour. post-merge runs this
// script once against the dev DB and once against the prod DB; with a stable key
// both runs write to the SAME Object Storage object (the bucket is shared
// dev+prod) and therefore stamp the IDENTICAL /objects/uploads/<id> URL into
// both databases. (A random UUID per run would give each DB a different URL and
// orphan a duplicate object.) Bumping the `-v2-` segment forces a fresh key if
// the crop ever changes, so the immutable cache never serves a stale disc.
async function uploadPng(buf: Buffer, colorName: string): Promise<string> {
  const id = `viryl-catalog-2024-disc-v2-${colorSlug(colorName)}.png`;
  const { bucketName, objectName, publicUrl } = resolveUploadTarget(id);
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  await file.save(buf, {
    contentType: "image/png",
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
    resumable: false,
  });
  await setObjectAclPolicy(file, { owner: "admin", visibility: "public" });
  return publicUrl;
}

// Mapping: PDF image index → color name in press_colors.
// Derived from: pdfimages -list + pdftotext -layout page order analysis.
// Image index = zero-based index from pdfimages -list (maps to img-NNN.jpg).
// Only disc-sized images (~1612×1612) are listed; smask variants skipped.
const IMG_TO_COLOR: Array<{ imgIdx: number; colorName: string }> = [
  // Opaque colors (pages 3–14)
  { imgIdx: 13, colorName: "Black" },
  { imgIdx: 18, colorName: "White" },
  { imgIdx: 23, colorName: "Hot Pink" },
  { imgIdx: 28, colorName: "Orange" },
  { imgIdx: 33, colorName: "Apple Red" },
  { imgIdx: 38, colorName: "Maroon" },
  { imgIdx: 43, colorName: "School Bus" },
  { imgIdx: 48, colorName: "Evergreen" },
  { imgIdx: 53, colorName: "Spring Green" },
  { imgIdx: 58, colorName: "Blue Jay" },
  { imgIdx: 63, colorName: "Gold" },
  { imgIdx: 68, colorName: "Silver" },
  // Clear/Translucent colors (pages 16–26)
  { imgIdx: 78, colorName: "Ultra Clear" },
  { imgIdx: 83, colorName: "Coke Bottle" },
  { imgIdx: 88, colorName: "Ruby" },
  { imgIdx: 93, colorName: "Orange (clear)" },
  { imgIdx: 98, colorName: "Cobalt" },
  { imgIdx: 103, colorName: "Emerald" },
  { imgIdx: 113, colorName: "Natural" },
  { imgIdx: 118, colorName: "Orange Crush" },
  { imgIdx: 123, colorName: "Violet" },
  { imgIdx: 128, colorName: "Glow in the Dark" },
  // Splatter effects (pages 29–31; page 28 = Silver+Apple Red+Neon has no disc photo)
  { imgIdx: 143, colorName: "White + Black Clear Center Splatter" },
  { imgIdx: 148, colorName: "Ultra Clear + Apple Red Splatter" },
  { imgIdx: 153, colorName: "Ruby + Cobalt" },
  // Hand pour effects (pages 32–40)
  { imgIdx: 158, colorName: "Orange Crush + Canary Yellow" },
  { imgIdx: 163, colorName: "Canary Yellow + Black + White" },
  { imgIdx: 168, colorName: "Black + School Bus" },
  { imgIdx: 173, colorName: "Apple Red + School Bus" },
  { imgIdx: 178, colorName: "Ever Green + White" },
  { imgIdx: 183, colorName: "Hot Pink + Blue Jay" },
  // Smoke / multi-colour effects (pages 38–44)
  { imgIdx: 188, colorName: "Ultra Clear + Black Smoke" },
  { imgIdx: 193, colorName: "Apple Red + School Bus + Black" },
  { imgIdx: 198, colorName: "White + Blue Jay Smoke" },
  { imgIdx: 203, colorName: "Natural + Black Smoke" },
  { imgIdx: 209, colorName: "Natural + Brown Smoke/Wooden" },
  { imgIdx: 215, colorName: "White + Silver Marble" },
  // Random Colours/Ecomix (page 45) has only a 1212×1212 non-disc swatch — skipped
];

async function main() {
  const label = DRY ? " (DRY RUN)" : "";
  console.log(`viryl-photos${label} — ${new Date().toISOString()}`);

  // Ensure backfills table exists (same guard as seed script)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name        text PRIMARY KEY,
      applied_at  timestamp NOT NULL DEFAULT now()
    )
  `);

  // Check marker
  const [markerRow] = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}
    ) AS exists
  `).then((r) => r.rows);
  if (markerRow?.exists) {
    console.log(`Marker '${MARKER}' already set — nothing to do.`);
    return;
  }

  if (!existsSync(PDF_PATH)) {
    console.error(`Catalogue PDF not found at ${PDF_PATH} — cannot extract photos.`);
    process.exit(1);
  }

  // Find Viryl press
  const [mfr] = await db
    .select({ id: manufacturers.id, name: manufacturers.name })
    .from(manufacturers)
    .where(eq(manufacturers.domain, "viryl.ca"));
  if (!mfr) {
    console.error("Viryl manufacturer not found — run seed-viryl-catalog.ts first.");
    process.exit(1);
  }
  console.log(`  press: ${mfr.name} (${mfr.id})`);

  // Load all Viryl color rows (across all tiers/formats)
  const colorRows = await db
    .select({
      id: pressColors.id,
      name: pressColors.name,
      swatchImageUrl: pressColors.swatchImageUrl,
      importSourceUrl: pressColors.importSourceUrl,
    })
    .from(pressColors)
    .innerJoin(pressColorTiers, eq(pressColors.tierId, pressColorTiers.id))
    .where(eq(pressColorTiers.pressId, mfr.id));

  // The catalogue colours we have a real disc photo for. This doubles as the
  // explicit allowlist for the one-time remediation below — the ONLY colour
  // names this script ever rewrites.
  const photoColorNames = new Set(IMG_TO_COLOR.map((x) => x.colorName));

  // A Viryl row is ours to (over)write when ONE of these holds:
  //   1. it has no swatch yet (swatchImageUrl null) — how fresh clones seed
  //      effect colours, and the safe baseline;
  //   2. its swatch was stamped by a Viryl catalogue script (importSourceUrl is a
  //      viryl… / viryl-catalog-2024: marker) — the opaque/clear single colours
  //      (white discs) and any already-migrated v2 rows;
  //   3. it is one of the catalogue colours we have a photo for AND carries no
  //      import source (importSourceUrl null). This branch catches the
  //      viryl-photos v1 effect/marble stamps, whose shape is non-null swatch +
  //      null source (the seed gives code-less colours a null source and v1 never
  //      set one).
  //
  // The null-source case (3) is the subtle one: the admin manual swatch PATCH
  // leaves importSourceUrl untouched, so an operator upload to a code-less effect
  // colour is also non-null-swatch + null-source — indistinguishable by columns
  // from a v1 stamp. Two things make overwriting it safe here:
  //   - it is scoped to photoColorNames, so a swatch for any colour we DON'T have
  //     a catalogue photo for is never touched; and
  //   - the whole script is guarded by the viryl_photos_v2 marker, so it runs at
  //     most once per environment and cannot clobber an operator upload made
  //     after this remediation. (On first run there are no such uploads: fresh
  //     clones are brand new, and dev/prod were verified to hold only the 37
  //     broken script stamps.)
  // A row whose source points at a NON-Viryl importer is always left untouched.
  const isVirylScriptSource = (s: string | null) =>
    s !== null &&
    (s === VIRYL_PHOTO_SOURCE ||
      s.startsWith("viryl-catalog-2024:") ||
      s.startsWith("viryl:") ||
      s.startsWith("n:"));
  const isScriptManaged = (r: { name: string; swatchImageUrl: string | null; importSourceUrl: string | null }) =>
    r.swatchImageUrl === null ||
    isVirylScriptSource(r.importSourceUrl) ||
    (r.importSourceUrl === null && photoColorNames.has(r.name));

  const uniqueNames = new Set(colorRows.map((r) => r.name));
  console.log(`  ${colorRows.length} color rows for Viryl (${uniqueNames.size} unique names)`);

  // Extract images from PDF to temp dir
  const tmpDir = "/tmp/viryl-photos-extracted";
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  console.log("  Extracting images from catalogue PDF (pdfimages)...");
  try {
    execSync(`pdfimages -j "${PDF_PATH}" "${tmpDir}/img"`, { stdio: "pipe" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  pdfimages failed: ${msg}`);
    process.exit(1);
  }
  console.log("  Extraction complete.");

  let stamped = 0;
  let skipped = 0;
  let noPhoto = 0;
  let failed = 0;

  // Stage 1 — resolve which colours have work to do (synchronous bookkeeping).
  const work: Array<{ colorName: string; imgFile: string; targetIds: string[] }> = [];
  for (const { imgIdx, colorName } of IMG_TO_COLOR) {
    // Rows for this colour name (same colour appears in 12_lp/12_double/7_inch
    // tiers) that this script is allowed to (over)write.
    const targetRows = colorRows.filter((r) => r.name === colorName && isScriptManaged(r));
    if (colorRows.every((r) => r.name !== colorName)) {
      console.log(`  [skip] ${colorName} — not found in DB`);
      skipped++;
      continue;
    }
    if (targetRows.length === 0) {
      console.log(`  [skip] ${colorName} — only operator-managed rows, leaving alone`);
      skipped++;
      continue;
    }

    const imgFile = join(tmpDir, `img-${String(imgIdx).padStart(3, "0")}.jpg`);
    if (!existsSync(imgFile)) {
      console.log(`  [miss] ${colorName} — img-${imgIdx} not found`);
      noPhoto++;
      continue;
    }

    if (DRY) {
      console.log(`  [dry]  ${colorName} — would shape-mask + upload + stamp ${targetRows.length} rows`);
      stamped++;
      continue;
    }

    work.push({ colorName, imgFile, targetIds: targetRows.map((r) => r.id) });
  }

  // Stage 2 — mask + upload + stamp with a bounded concurrency pool. Each unit
  // is independent (own JPEG → own PNG → own rows), so running a few in parallel
  // cuts wall time enough to finish a full 37-colour run against the remote prod
  // DB inside one invocation. Shape-only crop keeps every interior pixel and
  // never erases dark discs on Viryl's dark backdrop; a no-disc result SKIPS
  // (never falls back to the raw rectangle, which would re-introduce a bad swatch).
  const CONCURRENCY = 6;
  let cursor = 0;
  const runOne = async (item: (typeof work)[number]) => {
    const rawBuf = readFileSync(item.imgFile);
    const masked = await maskToVinylDisc(rawBuf, { shapeOnly: true });
    if (!masked) {
      console.log(`  [warn] ${item.colorName} — shape mask found no disc, skipping`);
      failed++;
      return;
    }
    try {
      const url = await uploadPng(masked, item.colorName);
      await db
        .update(pressColors)
        .set({ swatchImageUrl: url, importSourceUrl: VIRYL_PHOTO_SOURCE })
        .where(inArray(pressColors.id, item.targetIds));
      console.log(`  [ok]   ${item.colorName} → ${url} (${item.targetIds.length} rows stamped)`);
      stamped++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  [err]  ${item.colorName} — upload failed: ${msg}`);
      failed++;
    }
  };
  const worker = async () => {
    while (cursor < work.length) {
      const item = work[cursor++];
      await runOne(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));

  console.log(
    `  stamped=${stamped} skipped=${skipped} noPhoto=${noPhoto} failed=${failed}`
  );

  // Only mark the remediation complete when every intended colour actually
  // stamped. A partial run (upload timeout, killed process, etc.) must NOT write
  // the marker, or post-merge would treat the half-done state as permanently
  // complete and never retry.
  if (!DRY) {
    if (failed > 0 || stamped !== work.length) {
      console.error(
        `  ABORT: expected to stamp ${work.length} colours, stamped ${stamped} (failed ${failed}); marker '${MARKER}' NOT set.`
      );
      await pool.end();
      process.exit(1);
    }
    await db.execute(sql`
      INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT DO NOTHING
    `);
    console.log(`  marker '${MARKER}' set.`);
  }
  console.log("Done.");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
