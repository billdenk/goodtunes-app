/**
 * Add Memphis Record Pressing's "Metallic Blends (HB)" color group to the
 * vinyl catalog. The earlier catalog cleanup deleted an EMPTY "Metallic
 * Blends*" shell (it never had colors), so the press currently has no
 * metallic option — but it's what Bill is showing a client, so we add the
 * real MRP set.
 *
 * Source of truth: scripts/data/memphis-metallic-blends.json (the 36 HB
 * colors + their MRP product-photo URLs, scraped from
 * https://memphisrecordpressing.com/all-vinyl-colors/#section-metallic-blends).
 *
 * Two idempotent phases:
 *   1. MIRROR each HB photo into Object Storage ONCE (the bucket is shared by
 *      dev + prod, so the resulting /objects/uploads/<id> URL resolves in
 *      both). The resolved publicUrl is written back into the JSON manifest,
 *      so a second run (e.g. against prod) reuses the same uploads instead of
 *      re-mirroring. Matches how the existing Memphis photos are stored.
 *   2. For each vinyl format, create a "Metallic Blends" tier CLONED from that
 *      format's Opaque tier (same price_ladder, masters_prep cost, and every
 *      jacket ladder) so metallic prices exactly like Opaque — per Bill,
 *      "pricing can reflect another color." Then insert the 36 colors, each
 *      with swatch_image_url = the mirrored upload and import_source_url = the
 *      MRP URL. Tier is appended after the last existing tier (no resequence).
 *
 * IDEMPOTENT: skips any format that already has a "Metallic Blends" tier, and
 * skips mirroring any color that already has a publicUrl in the manifest.
 *
 * BACKUP: dumps every Memphis tier/color/jacket-ladder for the target DB to
 * scripts/backups/memphis-catalog-<env>-<ts>.json before any write.
 *
 * Dev:   npx tsx scripts/add-memphis-metallic.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/add-memphis-metallic.ts
 * Dry run (no writes): add --dry
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { objectStorageClient } from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";

const DRY = process.argv.includes("--dry");
const FORMATS = ["7_inch", "12_lp", "12_double"] as const;
const TIER_NAME = "Metallic Blends";
const SOURCE_TIER = "Opaque"; // pricing/jacket-ladder template
const MANIFEST = "scripts/data/memphis-metallic-blends.json";

type Color = {
  code: string;
  name: string;
  importSourceUrl: string;
  publicUrl?: string;
};
type Manifest = { tier: string; source: string; colors: Color[] };

async function mirrorImage(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${url} -> ${resp.status}`);
  const mime = resp.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const buf = Buffer.from(await resp.arrayBuffer());

  // resolveUploadTarget (mirrors server/routes.ts): .private/<...>/uploads/<uuid>.png
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
  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  if (!manifest.colors?.length) throw new Error("manifest has no colors");

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

  // ---- Backup ----
  const backup = await db.execute(sql`
    SELECT
      (SELECT jsonb_agg(to_jsonb(t)) FROM press_color_tiers t WHERE t.press_id = ${pressId}) AS tiers,
      (SELECT jsonb_agg(to_jsonb(c)) FROM press_colors c
         JOIN press_color_tiers t ON t.id = c.tier_id WHERE t.press_id = ${pressId}) AS colors,
      (SELECT jsonb_agg(to_jsonb(j)) FROM press_tier_jacket_ladders j
         JOIN press_color_tiers t ON t.id = j.tier_id WHERE t.press_id = ${pressId}) AS jacket_ladders
  `);
  mkdirSync("scripts/backups", { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `scripts/backups/memphis-catalog-${envLabel}-${ts}.json`;
  writeFileSync(backupPath, JSON.stringify({ pressId, snapshot: backup.rows[0] }, null, 2));
  console.log(`Backup written: ${backupPath}`);

  // ---- Phase 1: mirror images (idempotent via manifest publicUrl) ----
  const need = manifest.colors.filter((c) => !c.publicUrl);
  console.log(`\nImages: ${manifest.colors.length} total, ${need.length} to mirror.`);
  if (!DRY) {
    let done = 0;
    for (const c of need) {
      c.publicUrl = await mirrorImage(c.importSourceUrl);
      done++;
      if (done % 6 === 0 || done === need.length) console.log(`  mirrored ${done}/${need.length}`);
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2)); // persist progress
    }
  } else if (need.length) {
    console.log(`  [DRY] would mirror ${need.length} images.`);
  }

  // ---- Phase 2: per-format tier clone + colors ----
  const usable = manifest.colors.filter((c) => c.publicUrl);
  let tiersCreated = 0;
  let colorsAdded = 0;
  let laddersCloned = 0;

  if (DRY) {
    for (const fmt of FORMATS) {
      const exists = await db.execute<{ id: string }>(sql`
        SELECT id FROM press_color_tiers WHERE press_id = ${pressId} AND format = ${fmt} AND name = ${TIER_NAME} LIMIT 1`);
      console.log(`  [DRY] ${fmt}: ${exists.rows[0] ? "tier already present — skip" : `would create "${TIER_NAME}" + ${usable.length} colors (cloned from ${SOURCE_TIER})`}`);
    }
    console.log(`\n[DRY] no changes written.`);
    return;
  }

  await db.transaction(async (tx) => {
    for (const fmt of FORMATS) {
      const existing = await tx.execute<{ id: string }>(sql`
        SELECT id FROM press_color_tiers WHERE press_id = ${pressId} AND format = ${fmt} AND name = ${TIER_NAME} LIMIT 1`);
      if (existing.rows[0]) {
        console.log(`  ${fmt}: "${TIER_NAME}" already exists — skip.`);
        continue;
      }
      const src = await tx.execute<{ id: string; price_ladder: unknown; masters_prep_cost_cents: number }>(sql`
        SELECT id, price_ladder, masters_prep_cost_cents
        FROM press_color_tiers WHERE press_id = ${pressId} AND format = ${fmt} AND name = ${SOURCE_TIER} LIMIT 1`);
      const source = src.rows[0];
      if (!source) {
        console.log(`  ${fmt}: no "${SOURCE_TIER}" template tier — skip (cannot clone pricing).`);
        continue;
      }
      const posRow = await tx.execute<{ next: number }>(sql`
        SELECT COALESCE(MAX(position), -1) + 1 AS next FROM press_color_tiers WHERE press_id = ${pressId} AND format = ${fmt}`);
      const position = posRow.rows[0]?.next ?? 0;

      const ins = await tx.execute<{ id: string }>(sql`
        INSERT INTO press_color_tiers (press_id, format, name, position, price_ladder, masters_prep_cost_cents)
        VALUES (${pressId}, ${fmt}, ${TIER_NAME}, ${position},
                ${JSON.stringify(source.price_ladder ?? [])}::jsonb, ${source.masters_prep_cost_cents ?? 0})
        RETURNING id`);
      const tierId = ins.rows[0].id;
      tiersCreated++;

      // clone every jacket ladder from the Opaque template tier
      const cl = await tx.execute(sql`
        INSERT INTO press_tier_jacket_ladders (tier_id, jacket_id, price_ladder)
        SELECT ${tierId}, jacket_id, price_ladder
        FROM press_tier_jacket_ladders WHERE tier_id = ${source.id}`);
      laddersCloned += cl.rowCount ?? 0;

      // insert colors
      let pos = 0;
      for (const c of usable) {
        await tx.execute(sql`
          INSERT INTO press_colors (tier_id, name, swatch_hex, swatch_image_url, position, import_source_url)
          VALUES (${tierId}, ${c.name}, NULL, ${c.publicUrl}, ${pos}, ${c.importSourceUrl})`);
        pos++;
        colorsAdded++;
      }
      console.log(`  ${fmt}: created "${TIER_NAME}" (pos ${position}) with ${usable.length} colors, ${cl.rowCount ?? 0} jacket ladders cloned from ${SOURCE_TIER}.`);
    }
  });

  console.log(`\nDone. Tiers created: ${tiersCreated}; colors added: ${colorsAdded}; jacket ladders cloned: ${laddersCloned}.`);

  // ---- Verify ----
  const after = await db.execute<{ format: string; tier: string; colors: number; img: number; ladders: number }>(sql`
    SELECT t.format, t.name AS tier, COUNT(DISTINCT c.id)::int AS colors,
           COUNT(DISTINCT c.swatch_image_url)::int AS img,
           COUNT(DISTINCT j.id)::int AS ladders
    FROM press_color_tiers t
    LEFT JOIN press_colors c ON c.tier_id = t.id
    LEFT JOIN press_tier_jacket_ladders j ON j.tier_id = t.id
    WHERE t.press_id = ${pressId} AND t.name = ${TIER_NAME}
    GROUP BY t.format, t.id, t.name, t.position
    ORDER BY t.format`);
  console.log(`\n"${TIER_NAME}" tiers now:`);
  for (const r of after.rows) console.log(`  ${r.format}  ${r.tier}  (${r.colors} colors, ${r.img} photos, ${r.ladders} jacket ladders)`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
