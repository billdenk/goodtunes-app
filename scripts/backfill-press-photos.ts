/**
 * Real per-color vinyl photos for the Memphis Record Pressing (MRP) press.
 *
 * MRP publishes a per-color photo for every color on its public
 * all-vinyl-colors page (one disc, dead-centre, on a uniform studio
 * backdrop). This one-shot backfill scrapes that page, matches each photo
 * to the seeded `press_colors` rows BY NAME (across every vinyl format —
 * 12" LP, 12" double, 7"), masks the disc out of the backdrop, rehosts the
 * PNG to Object Storage, and stamps `swatch_image_url` + `import_source_url`
 * on each matching row.
 *
 * It reuses the exact same disc-masking + page-parsing helpers the live
 * admin importer uses (server/vendorColorScrape.ts), so the result is
 * identical to clicking "Import from MRP" in the catalog editor — this just
 * runs it unattended so the photos are actually live without an operator.
 *
 * IDEMPOTENT + non-destructive:
 *   - Only touches rows where BOTH swatch_image_url AND import_source_url
 *     are NULL — an operator-uploaded photo or a prior import is never
 *     overwritten.
 *   - Re-runs skip everything already stamped.
 *   - Leaves swatch_hex untouched (the name-appropriate tint stays as the
 *     fallback the preview disc uses when no photo matched).
 *
 * Dev:   npx tsx scripts/backfill-press-photos.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/backfill-press-photos.ts
 * Dry run (no writes/uploads): add --dry
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../server/db";
import { manufacturers, pressColorTiers, pressColors } from "@shared/schema";
import { MRP_DOMAIN } from "../server/pressCatalog";
import {
  MRP_COLOR_LIBRARY_URL,
  maskToVinylDisc,
  parseMrpColorPage,
} from "../server/vendorColorScrape";
import {
  ObjectStorageService,
  objectStorageClient,
} from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";

const DRY = process.argv.includes("--dry");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const UA = "Mozilla/5.0 (compatible; GoodTunesBot/1.0)";

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

async function fetchBuf(url: string, timeoutMs: number): Promise<Buffer> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength > 10 * 1024 * 1024) throw new Error("image >10MB");
    return buf;
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log(`MRP color-photo backfill${DRY ? " (DRY RUN)" : ""} — ${new Date().toISOString()}`);

  // 1) Locate the MRP press.
  const presses = await db
    .select()
    .from(manufacturers)
    .where(eq(manufacturers.domain, MRP_DOMAIN));
  const press = presses[0];
  if (!press) {
    console.log(`No MRP press (domain="${MRP_DOMAIN}") in this DB — nothing to do.`);
    return;
  }
  console.log(`Press: ${press.name} (${press.id})`);

  // 2) Load its tiers + colors.
  const tiers = await db
    .select()
    .from(pressColorTiers)
    .where(eq(pressColorTiers.pressId, press.id));
  const tierIds = tiers.map((t) => t.id);
  if (tierIds.length === 0) {
    console.log("Press has no color tiers — has the catalog been seeded? Aborting.");
    return;
  }
  const colors = await db
    .select()
    .from(pressColors)
    .where(inArray(pressColors.tierId, tierIds));

  // Candidate rows = no photo AND no prior import stamp (operator edits safe).
  const candidates = colors.filter(
    (c) => !c.swatchImageUrl && !c.importSourceUrl,
  );
  console.log(
    `${colors.length} colors total; ${candidates.length} eligible for a photo ` +
      `(missing both swatch_image_url and import_source_url).`,
  );
  if (candidates.length === 0) {
    console.log("Nothing eligible — already backfilled. Done.");
    return;
  }

  // 3) Scrape the MRP page → per-color tiles, indexed by normalized name.
  const html = await (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const r = await fetch(MRP_COLOR_LIBRARY_URL, {
        signal: ctrl.signal,
        headers: { "User-Agent": UA },
      });
      if (!r.ok) throw new Error(`MRP page returned ${r.status}`);
      return await r.text();
    } finally {
      clearTimeout(t);
    }
  })();
  const tiles = parseMrpColorPage(html);
  console.log(`Parsed ${tiles.length} colors from ${MRP_COLOR_LIBRARY_URL}`);
  if (tiles.length === 0) {
    console.log("Parsed 0 colors — MRP page structure may have changed. Aborting.");
    return;
  }
  // MRP seeds each color name as "<CODE> <short name>" (e.g. "T01 Ruby",
  // "O01 Brown", "ECO2 Greens"); the page tiles carry the same CODE. The
  // code is the reliable join key — the human names diverge ("T01 Ruby" vs
  // the page's "Translucent Ruby"). We index by code, and keep a normalized
  // full-name index as a fallback for any GoodTunes color without a code.
  const tileByCode = new Map<string, (typeof tiles)[number]>();
  const tileByName = new Map<string, (typeof tiles)[number]>();
  for (const tile of tiles) {
    if (!tileByCode.has(tile.code)) tileByCode.set(tile.code, tile);
    const key = norm(tile.name);
    if (!tileByName.has(key)) tileByName.set(key, tile);
  }
  const codeOf = (name: string): string | null =>
    name.match(/^([A-Z]{1,4}\d{1,3})\b/)?.[1] ?? null;

  // 4) For each eligible color, download → mask → upload → stamp. Cache the
  //    rehosted URL per source so the same MRP photo shared by the same color
  //    across multiple vinyl formats is fetched + masked + uploaded once.
  const urlBySource = new Map<string, string>();
  let matched = 0, stamped = 0, unmatched = 0, failed = 0;

  for (const color of candidates) {
    const code = codeOf(color.name);
    const tile =
      (code ? tileByCode.get(code) : undefined) ?? tileByName.get(norm(color.name));
    if (!tile) {
      unmatched++;
      continue;
    }
    matched++;
    try {
      let storedUrl = urlBySource.get(tile.sourceUrl);
      if (!storedUrl) {
        if (DRY) {
          storedUrl = `(dry) ${tile.sourceUrl}`;
        } else {
          const buf = await fetchBuf(tile.sourceUrl, 20_000);
          const masked = await maskToVinylDisc(buf);
          storedUrl = await uploadPng(masked ?? buf);
        }
        urlBySource.set(tile.sourceUrl, storedUrl);
      }
      if (!DRY) {
        // Re-check the guard at write time (defensive against concurrent runs):
        // only stamp rows still missing both fields.
        await db
          .update(pressColors)
          .set({ swatchImageUrl: storedUrl, importSourceUrl: tile.sourceUrl })
          .where(
            and(
              eq(pressColors.id, color.id),
              isNull(pressColors.swatchImageUrl),
              isNull(pressColors.importSourceUrl),
            ),
          );
      }
      stamped++;
      console.log(`  ✓ ${color.name} ← ${tile.code} ${tile.name}`);
    } catch (e: any) {
      failed++;
      console.log(`  ✗ ${color.name}: ${e?.message || e}`);
    }
  }

  console.log(
    `\nDone. matched=${matched} stamped=${stamped} unmatched=${unmatched} failed=${failed}` +
      `${DRY ? " (dry run — no writes)" : ""}`,
  );
  if (unmatched > 0) {
    console.log(
      `${unmatched} eligible color(s) had no name match on the MRP page — they keep ` +
        `their name-appropriate hex tint (expected for any GoodTunes-only colors).`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
