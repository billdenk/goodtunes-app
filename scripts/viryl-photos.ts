/**
 * Upload Viryl Technologies Corp. catalogue disc photos to Object Storage
 * and stamp swatch_image_url on the matching press_colors rows.
 *
 * Source of truth: attached_assets/Catalogue_2024_1781121947631.pdf
 *
 * What this script does:
 *   1. Runs `pdfimages -j` to extract every JPEG embedded in the catalogue PDF.
 *   2. Uses a hardcoded page→image-index→color-name mapping derived from
 *      `pdfimages -list` + `pdftotext -layout` analysis of the PDF.
 *   3. For each mapped color, loads the JPEG disc photo, applies maskToVinylDisc
 *      to cut out the uniform backdrop, and uploads the transparent PNG to
 *      Object Storage.
 *   4. Stamps swatch_image_url on the matching press_colors row (only when null
 *      — never overwrites an operator-uploaded photo).
 *   5. Sets the `viryl_photos_v1` marker so re-runs are idempotent no-ops.
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
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { manufacturers, pressColorTiers, pressColors } from "@shared/schema";
import { maskToVinylDisc } from "../server/vendorColorScrape";
import {
  ObjectStorageService,
  objectStorageClient,
} from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";

const DRY = process.argv.includes("--dry");
const MARKER = "viryl_photos_v1";
const PDF_PATH = join(process.cwd(), "attached_assets/Catalogue_2024_1781121947631.pdf");

const objectStorage = new ObjectStorageService();

function resolveUploadTarget(): { bucketName: string; objectName: string; publicUrl: string } {
  const id = `${randomUUID()}.png`;
  const privateDir = objectStorage.getPrivateObjectDir().replace(/\/$/, "");
  const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = trimmed.indexOf("/");
  const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
  const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
  const objectName = `${prefix ? `${prefix}/` : ""}uploads/${id}`;
  return { bucketName, objectName, publicUrl: `/objects/uploads/${id}` };
}

async function uploadPng(buf: Buffer): Promise<string> {
  const { bucketName, objectName, publicUrl } = resolveUploadTarget();
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
    .select({ id: pressColors.id, name: pressColors.name, swatchImageUrl: pressColors.swatchImageUrl })
    .from(pressColors)
    .innerJoin(pressColorTiers, eq(pressColors.tierId, pressColorTiers.id))
    .where(eq(pressColorTiers.pressId, mfr.id));

  // Deduplicate: same color name appears in multiple formats; pick first null-swatch row per name
  const colorByName = new Map<string, { id: string; swatchImageUrl: string | null }>();
  for (const r of colorRows) {
    if (!colorByName.has(r.name) || colorByName.get(r.name)!.swatchImageUrl !== null) {
      colorByName.set(r.name, { id: r.id, swatchImageUrl: r.swatchImageUrl });
    }
  }
  console.log(`  ${colorRows.length} color rows for Viryl (${colorByName.size} unique names)`);

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

  for (const { imgIdx, colorName } of IMG_TO_COLOR) {
    const colorEntry = colorByName.get(colorName);
    if (!colorEntry) {
      console.log(`  [skip] ${colorName} — not found in DB`);
      skipped++;
      continue;
    }
    if (colorEntry.swatchImageUrl !== null) {
      console.log(`  [skip] ${colorName} — swatch already set`);
      skipped++;
      continue;
    }

    const imgFile = join(tmpDir, `img-${String(imgIdx).padStart(3, "0")}.jpg`);
    if (!existsSync(imgFile)) {
      console.log(`  [miss] ${colorName} — img-${imgIdx} not found`);
      noPhoto++;
      continue;
    }

    const rawBuf = readFileSync(imgFile);

    if (DRY) {
      console.log(`  [dry]  ${colorName} — would mask + upload ${rawBuf.length} bytes`);
      stamped++;
      continue;
    }

    let uploadBuf: Buffer;
    const masked = await maskToVinylDisc(rawBuf);
    if (masked) {
      uploadBuf = masked;
    } else {
      console.log(`  [warn] ${colorName} — maskToVinylDisc returned null, uploading raw JPEG`);
      uploadBuf = rawBuf;
      failed++;
    }

    try {
      const url = await uploadPng(uploadBuf);
      // Stamp ALL rows for this color name (same color appears in 12_lp/12_double/7_inch tiers)
      const matchingIds = colorRows
        .filter((r) => r.name === colorName && r.swatchImageUrl === null)
        .map((r) => r.id);
      for (const id of matchingIds) {
        await db.update(pressColors).set({ swatchImageUrl: url }).where(eq(pressColors.id, id));
      }
      console.log(`  [ok]   ${colorName} → ${url} (${matchingIds.length} rows stamped)`);
      stamped++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  [err]  ${colorName} — upload failed: ${msg}`);
      failed++;
    }
  }

  if (!DRY) {
    await db.execute(sql`
      INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT DO NOTHING
    `);
  }

  console.log(
    `  stamped=${stamped} skipped=${skipped} noPhoto=${noPhoto} failed=${failed}`
  );
  if (!DRY) console.log(`  marker '${MARKER}' set.`);
  console.log("Done.");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
