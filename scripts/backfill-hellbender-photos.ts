/**
 * Backfill Hellbender Vinyl color swatch PHOTOS from their Shopify storefront.
 *
 * Hellbender's catalog colors were imported with hex swatches (and metallic
 * with neither hex nor photo), but no product photos. Bill wants the real
 * Hellbender mockup images shown — they're the square gray/white-background
 * mockups on hellbendervinyl.com (PNG, plus a couple .webp/.jpg).
 *
 * Source: https://hellbendervinyl.com/products.json — every "Custom Vinyl
 * Records - <Color>" product's first image is that color's mockup. We map by
 * color NAME (the DB color name == the Shopify title minus the prefix), with
 * two fuzzy aliases (see ALIASES).
 *
 * Two idempotent phases (same pattern as add-memphis-metallic.ts):
 *   1. MIRROR each matched mockup into Object Storage ONCE (shared dev+prod
 *      bucket → the /objects/uploads/<id> URL resolves in both). Resolved URLs
 *      persist to scripts/data/hellbender-photos.json so a second run (prod)
 *      reuses them instead of re-mirroring. Images are pulled at ?width=600.
 *   2. For the target DB, UPDATE every Hellbender press_colors row whose name
 *      matches and whose swatch_image_url IS NULL — sets swatch_image_url +
 *      import_source_url. We DON'T touch swatch_hex (hex stays as the matching
 *      fallback; the photo just wins for display) and we never overwrite an
 *      existing photo, so operator edits and re-runs are safe.
 *
 * Dev:   npx tsx scripts/backfill-hellbender-photos.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/backfill-hellbender-photos.ts
 * Dry run (no writes): add --dry
 *
 * Re-mask (square -> clean transparent disc): add --remask. mirrorImage now
 * runs every mockup through maskToVinylDisc (colors whose backdrop can't be
 * told from the disc — white/clear/black/silver — bail and keep their raw
 * square), and --remask both (a) re-mirrors any color not yet masked and
 * (b) re-points EXISTING rows at the new circle image instead of only filling
 * NULLs. Run --remask on dev once to mint the circle images into the shared
 * bucket + persist them to the manifest (masked=true), then run --remask on
 * prod to point prod at those same URLs without re-mirroring:
 *   npx tsx scripts/backfill-hellbender-photos.ts --remask
 *   DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/backfill-hellbender-photos.ts --remask
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { objectStorageClient } from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";
import { maskToVinylDisc } from "../server/vendorColorScrape";

const DRY = process.argv.includes("--dry");
// --remask: re-mirror every matched mockup through the (improved) disc mask
// and re-point existing rows at the new circle-cropped image, even when they
// already carry a square photo. Without it the script only fills NULL rows.
const REMASK = process.argv.includes("--remask");
const PRODUCTS_URL = "https://hellbendervinyl.com/products.json?limit=250";
const MANIFEST = "scripts/data/hellbender-photos.json";

// DB color name (lowercased) -> Shopify color name (lowercased) when they
// don't match verbatim after stripping the "Custom Vinyl Records - " prefix.
const ALIASES: Record<string, string> = {
  "coke bottle": "coke bottle clear",
  "house mix": "regrind mix",
};

type Entry = {
  name: string; // DB color name
  shopifyTitle: string;
  importSourceUrl: string;
  publicUrl?: string;
  masked?: boolean; // true once mirrored through maskToVinylDisc (--remask)
};
type Manifest = { source: string; colors: Entry[] };

const norm = (s: string) => s.trim().toLowerCase();

function withWidth(src: string, w = 600): string {
  return src.includes("?") ? `${src}&width=${w}` : `${src}?width=${w}`;
}

async function fetchShopifyMap(): Promise<Map<string, { title: string; url: string }>> {
  const resp = await fetch(PRODUCTS_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!resp.ok) throw new Error(`products.json -> ${resp.status}`);
  const j = (await resp.json()) as { products: Array<{ title: string; images?: Array<{ src: string }> }> };
  const map = new Map<string, { title: string; url: string }>();
  for (const p of j.products) {
    const m = p.title.match(/^custom vinyl records\s*-\s*(.+)$/i);
    if (!m) continue;
    const src = p.images?.[0]?.src;
    if (!src) continue;
    map.set(norm(m[1]), { title: p.title, url: withWidth(src) });
  }
  return map;
}

async function mirrorImage(url: string): Promise<string> {
  const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!resp.ok) throw new Error(`fetch ${url} -> ${resp.status}`);
  const upstreamMime = resp.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const raw = Buffer.from(await resp.arrayBuffer());
  // Crop the studio mockup to a clean transparent vinyl disc. Colors whose
  // backdrop can't be told from the disc (white/clear/black/silver) bail and
  // keep their raw square — the same graceful fallback the import route uses.
  const masked = await maskToVinylDisc(raw).catch((e) => {
    console.warn(`  ! disc mask failed for ${url}: ${(e as any)?.message || e}`);
    return null;
  });
  const buf = masked ?? raw;
  const mime = masked ? "image/png" : upstreamMime;
  const ext =
    mime === "image/png" ? ".png" : mime === "image/jpeg" ? ".jpg" : mime === "image/webp" ? ".webp" : ".png";
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
  const backupPath = `scripts/backups/hellbender-colors-${envLabel}-${ts}.json`;
  writeFileSync(backupPath, JSON.stringify({ pressId, colors: backup.rows[0] }, null, 2));
  console.log(`Backup written: ${backupPath}`);

  // ---- Build name set from target DB ----
  const dbNamesRes = await db.execute<{ name: string }>(sql`
    SELECT DISTINCT c.name FROM press_colors c
    JOIN press_color_tiers t ON t.id = c.tier_id
    WHERE t.press_id = ${pressId} ORDER BY c.name`);
  const dbNames = dbNamesRes.rows.map((r) => r.name);

  // ---- Resolve Shopify image per DB color name ----
  const shopify = await fetchShopifyMap();
  const manifest: Manifest = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, "utf8"))
    : { source: PRODUCTS_URL, colors: [] };
  const byName = new Map(manifest.colors.map((c) => [norm(c.name), c]));

  const unmatched: string[] = [];
  for (const name of dbNames) {
    const key = ALIASES[norm(name)] ?? norm(name);
    const hit = shopify.get(key);
    if (!hit) {
      unmatched.push(name);
      continue;
    }
    const existing = byName.get(norm(name));
    if (existing) {
      existing.shopifyTitle = hit.title;
      existing.importSourceUrl = hit.url; // refresh source (publicUrl preserved)
    } else {
      const e: Entry = { name, shopifyTitle: hit.title, importSourceUrl: hit.url };
      manifest.colors.push(e);
      byName.set(norm(name), e);
    }
  }
  if (unmatched.length) console.log(`No Shopify match (skipped): ${unmatched.join(", ")}`);

  // ---- Phase 1: mirror (idempotent via manifest publicUrl) ----
  // Normal run: mirror only colors with no photo yet. --remask: also
  // re-mirror any color not yet passed through the disc mask, so a single
  // dev run mints the circle-cropped images once into the shared bucket and
  // a later prod run reuses those same URLs (masked=true) instead of
  // re-mirroring — keeping dev and prod pointed at one image.
  const targets = dbNames.map((n) => byName.get(norm(n))).filter((e): e is Entry => !!e);
  const need = targets.filter((e) => !e.publicUrl || (REMASK && !e.masked));
  console.log(
    `\nMatched ${targets.length}/${dbNames.length} colors · ${need.length} images to ${REMASK ? "re-mask" : "mirror"}.`,
  );
  if (!DRY) {
    let done = 0;
    for (const e of need) {
      e.publicUrl = await mirrorImage(e.importSourceUrl);
      e.masked = true;
      done++;
      if (done % 6 === 0 || done === need.length) console.log(`  mirrored ${done}/${need.length}`);
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    }
    if (!need.length) writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  } else if (need.length) {
    console.log(`  [DRY] would ${REMASK ? "re-mask" : "mirror"} ${need.length} images.`);
  }

  // ---- Phase 2: backfill swatch_image_url where NULL ----
  let updated = 0;
  if (DRY) {
    for (const e of targets) {
      // --remask re-points every matched row; a normal run only fills NULLs.
      const guard = REMASK ? sql`` : sql` AND c.swatch_image_url IS NULL`;
      const cnt = await db.execute<{ n: number }>(sql`
        SELECT COUNT(*)::int AS n FROM press_colors c
        JOIN press_color_tiers t ON t.id = c.tier_id
        WHERE t.press_id = ${pressId} AND c.name = ${e.name}${guard}`);
      const n = cnt.rows[0]?.n ?? 0;
      if (n) console.log(`  [DRY] ${e.name}: would set photo on ${n} row(s)`);
    }
    console.log("\n[DRY] no changes written.");
    return;
  }

  await db.transaction(async (tx) => {
    for (const e of targets) {
      if (!e.publicUrl) continue;
      // --remask re-points every matched row at the new circle image; a
      // normal run only fills rows that have no photo yet (operator-safe).
      const guard = REMASK ? sql`` : sql` AND c.swatch_image_url IS NULL`;
      const res = await tx.execute(sql`
        UPDATE press_colors c
        SET swatch_image_url = ${e.publicUrl}, import_source_url = ${e.importSourceUrl}
        FROM press_color_tiers t
        WHERE c.tier_id = t.id AND t.press_id = ${pressId}
          AND c.name = ${e.name}${guard}`);
      updated += res.rowCount ?? 0;
    }
  });
  console.log(`\nDone. Color rows photo-backfilled: ${updated}.`);

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
