/**
 * One-shot asset swap for Hellbender Black and House Mix disc swatches.
 *
 * These two source photos can't be auto-masked by maskToVinylDisc, so they
 * get hand-cropped transparent-disc PNGs (pre-produced by ImageMagick).
 *
 * What this script does:
 *   1. Reads the two pre-cropped PNGs from /tmp/disc-crops/
 *   2. Mirrors each into Object Storage ONCE (idempotent via manifest)
 *   3. Updates scripts/data/hellbender-photos.json with the new publicUrls
 *   4. Re-points the matching press_colors rows on the current DATABASE_URL
 *      — overwrites blank rows OR rows previously written by our tooling
 *      (photos.json / records.json URLs), so the stale uncropped URLs get
 *      replaced.
 *
 * Run on dev first, then prod:
 *   npx tsx scripts/swap-hellbender-black-housemix.ts
 *   DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/swap-hellbender-black-housemix.ts
 *
 * The script is idempotent: if Object Storage already has publicUrls in the
 * manifest it will skip mirroring and go straight to DB re-point.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { objectStorageClient } from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";

const MANIFEST_PATH = "scripts/data/hellbender-photos.json";
const RECORDS_MANIFEST_PATH = "scripts/data/hellbender-records.json";

// The pre-cropped source files produced by ImageMagick
const CROPS: Record<string, { file: string; importSourceUrl: string }> = {
  Black: {
    file: "/tmp/disc-crops/black-disc.png",
    importSourceUrl:
      "https://cdn.shopify.com/s/files/1/0593/3137/9286/files/solid-black-vinyl-record-buscrates.jpg?v=1774533860&width=600",
  },
  "House Mix": {
    file: "/tmp/disc-crops/housemix-disc.png",
    importSourceUrl:
      "https://cdn.shopify.com/s/files/1/0593/3137/9286/files/IMG_3826.jpg?v=1770692254&width=600",
  },
};

// Force-mirror: always upload fresh crops (overwriting old stale manifest URLs).
// Set to false to skip re-upload if publicUrl already set and correct.
const FORCE_MIRROR = true;

type Entry = {
  name: string;
  shopifyTitle: string;
  importSourceUrl: string;
  publicUrl?: string;
  maskVersion?: number;
  masked?: boolean;
};
type Manifest = { source: string; colors: Entry[] };

async function mirrorBuffer(buf: Buffer, mime: string): Promise<string> {
  const ext = mime === "image/png" ? ".png" : ".jpg";
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

async function resolvePress(): Promise<{ id: string; name: string } | null> {
  const res = await db.execute<{ id: string; name: string }>(
    sql`SELECT id, name FROM manufacturers WHERE name ILIKE '%hellbender%' LIMIT 1`,
  );
  return res.rows[0] ?? null;
}

async function main() {
  const press = await resolvePress();
  if (!press) {
    console.log("Hellbender not found — nothing to do.");
    return;
  }
  const envLabel =
    process.env.DATABASE_URL === process.env.PROD_DATABASE_URL ? "prod" : "dev";
  console.log(`Target: ${envLabel} DB · press ${press.name} (${press.id})`);

  // Load manifests (need the full set of tool-managed URLs for the re-point guard)
  const manifest: Manifest = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
    : { source: "", colors: [] };
  const recordsManifest: Manifest = existsSync(RECORDS_MANIFEST_PATH)
    ? JSON.parse(readFileSync(RECORDS_MANIFEST_PATH, "utf8"))
    : { source: "", colors: [] };

  const byName = new Map(manifest.colors.map((c) => [c.name, c]));

  // Capture old publicUrls BEFORE overwriting — they're currently in the DB
  // and must stay in the managed-URL guard so the re-point WHERE clause matches.
  const oldUrls: string[] = Object.keys(CROPS)
    .map((n) => byName.get(n)?.publicUrl)
    .filter((u): u is string => !!u);

  // --- Phase 1: mirror each crop into Object Storage ---
  // FORCE_MIRROR=true means we always upload the hand-cropped PNG as a fresh
  // object, overwriting the old stale URL in the manifest. This is intentional
  // for this one-shot swap: the existing manifest URLs point at the uncropped
  // photos we're replacing.
  for (const [colorName, { file, importSourceUrl }] of Object.entries(CROPS)) {
    const entry = byName.get(colorName);
    if (!FORCE_MIRROR && entry?.publicUrl) {
      console.log(`  ${colorName}: already in manifest (${entry.publicUrl}), skipping mirror.`);
      continue;
    }
    if (!existsSync(file)) {
      throw new Error(
        `Pre-cropped PNG not found: ${file}\n` +
          `Run ImageMagick crop step first (see task instructions).`,
      );
    }
    console.log(`  Mirroring ${colorName} from ${file} …`);
    const buf = readFileSync(file);
    const publicUrl = await mirrorBuffer(buf, "image/png");
    console.log(`  → ${publicUrl}`);

    if (entry) {
      entry.publicUrl = publicUrl;
      entry.importSourceUrl = importSourceUrl;
      entry.maskVersion = 3; // v3 = hand-cropped replacement
      delete entry.masked;
    } else {
      const newEntry: Entry = {
        name: colorName,
        shopifyTitle:
          colorName === "Black"
            ? "Custom Vinyl Records - Black"
            : "Custom Vinyl Records - Regrind Mix",
        importSourceUrl,
        publicUrl,
        maskVersion: 3,
      };
      manifest.colors.push(newEntry);
      byName.set(colorName, newEntry);
    }
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log(`  Manifest updated.`);
  }

  // --- Phase 2: re-point press_colors rows ---
  // Managed URL set = every URL written by our tooling (safe to overwrite).
  // Critically: include the OLD manifest URLs captured before mirroring —
  // those are what currently live in the DB rows and must match the guard.
  const managedUrls = Array.from(
    new Set([
      ...oldUrls,
      ...manifest.colors.map((e) => e.publicUrl).filter((u): u is string => !!u),
      ...recordsManifest.colors.map((e) => e.publicUrl).filter((u): u is string => !!u),
    ]),
  );

  const managedIn = sql.join(
    managedUrls.map((u) => sql`${u}`),
    sql`, `,
  );

  let updated = 0;
  await db.transaction(async (tx) => {
    for (const colorName of Object.keys(CROPS)) {
      const entry = byName.get(colorName);
      if (!entry?.publicUrl) {
        console.warn(`  ${colorName}: no publicUrl after mirror — skipping DB re-point.`);
        continue;
      }
      const res = await tx.execute(sql`
        UPDATE press_colors c
        SET swatch_image_url = ${entry.publicUrl},
            import_source_url = ${entry.importSourceUrl}
        FROM press_color_tiers t
        WHERE c.tier_id = t.id
          AND t.press_id = ${press.id}
          AND t.name NOT ILIKE '%splatter%'
          AND c.name = ${colorName}
          AND (c.swatch_image_url IS NULL OR c.swatch_image_url IN (${managedIn}))`);
      const n = res.rowCount ?? 0;
      updated += n;
      console.log(`  ${colorName}: updated ${n} row(s) → ${entry.publicUrl}`);
    }
  });
  console.log(`\nDone. Rows updated: ${updated}`);

  // --- Verify ---
  const check = await db.execute<{
    name: string;
    swatch_image_url: string | null;
  }>(sql`
    SELECT c.name, c.swatch_image_url
    FROM press_colors c
    JOIN press_color_tiers t ON t.id = c.tier_id
    WHERE t.press_id = ${press.id}
      AND c.name IN ('Black', 'House Mix')
    ORDER BY c.name`);
  console.log("\nVerification:");
  for (const r of check.rows) {
    console.log(`  ${r.name}: ${r.swatch_image_url}`);
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
