/**
 * Create the "Good Press" DEMO press by cloning Viryl Technologies' catalog
 * (best pricing/art balance: 3 vinyl formats, 8 tiers each, 6 jackets,
 * 56/56 confirmed price ladders, 111 color swatch images).
 *
 * Purpose (Bill, 2026-08-10): a white-label demo press for pitching presses
 * (MRP etc.) without exposing any real partner's art or pricing identity.
 * Viryl-identifying fields (domain/website/bio/location/contacts) are
 * BLANKED; the logo is the uploaded GoodTunes press mark (mirrored ONCE to
 * the shared dev+prod Object Storage bucket, manifest-pinned so both DBs
 * get the same /objects/uploads/<id>.svg URL).
 *
 * Deterministic child ids — md5('goodpress:'||source_id) formatted as a
 * uuid — make the clone idempotent and the tier→color/ladder remapping
 * trivial. Re-running is a clean no-op once "Good Press" exists.
 *
 * Dev:   npx tsx scripts/create-good-press.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/create-good-press.ts
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { objectStorageClient } from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";

const SRC = "attached_assets/20260808_gtpress_icon_1786348488564.svg";
const MANIFEST = "scripts/data/good-press-logo-url.json";
const SOURCE_PRESS_NAME = "Viryl Technologies";
const DEMO_NAME = "Good Press";

async function uploadOnce(): Promise<string> {
  if (existsSync(MANIFEST)) {
    const saved = JSON.parse(readFileSync(MANIFEST, "utf8"));
    if (typeof saved?.publicUrl === "string" && saved.publicUrl.startsWith("/objects/uploads/")) {
      return saved.publicUrl;
    }
  }
  const buf = readFileSync(SRC);
  const id = `${crypto.randomUUID()}.svg`;
  const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
  const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = trimmed.indexOf("/");
  const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
  const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
  const objectName = `${prefix ? `${prefix}/` : ""}uploads/${id}`;
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  await file.save(buf, {
    contentType: "image/svg+xml",
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
    resumable: false,
  });
  await setObjectAclPolicy(file as any, { owner: "admin", visibility: "public" } as any);
  const publicUrl = `/objects/uploads/${id}`;
  mkdirSync("scripts/data", { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify({ source: SRC, publicUrl }, null, 2) + "\n");
  return publicUrl;
}

async function main() {
  const envLabel =
    process.env.DATABASE_URL === process.env.PROD_DATABASE_URL ? "prod" : "dev";

  const existing = await db.execute<{ id: string }>(
    sql`SELECT id FROM manufacturers WHERE name = ${DEMO_NAME} AND deleted_at IS NULL LIMIT 1`,
  );
  if (((existing as any).rows ?? []).length) {
    console.log(`[good-press] ${envLabel}: "${DEMO_NAME}" already exists — no-op`);
    await pool.end();
    return;
  }

  const srcRows = await db.execute<{ id: string }>(
    sql`SELECT id FROM manufacturers WHERE name = ${SOURCE_PRESS_NAME} AND deleted_at IS NULL LIMIT 1`,
  );
  const src = ((srcRows as any).rows ?? [])[0];
  if (!src) throw new Error(`[good-press] ${envLabel}: source press "${SOURCE_PRESS_NAME}" not found — aborting (nothing written)`);
  const srcId: string = src.id;
  const logoUrl = await uploadOnce();

  // Deterministic uuid-shaped id from any source id.
  const gp = (col: string) =>
    sql.raw(
      `(substr(md5('goodpress:'||${col}),1,8)||'-'||substr(md5('goodpress:'||${col}),9,4)||'-'||substr(md5('goodpress:'||${col}),13,4)||'-'||substr(md5('goodpress:'||${col}),17,4)||'-'||substr(md5('goodpress:'||${col}),21,12))`,
    );

  await db.transaction(async (tx) => {
    const newPressId = crypto.randomUUID();
    // Manufacturer row: copy operational catalog-relevant fields, blank the
    // Viryl identity. Demo does vinyl only (no GoodDeed/fulfillment noise).
    await tx.execute(sql`
      INSERT INTO manufacturers (id, name, domain, logo_url, bio, location, website_url,
        turnaround_weeks_min, turnaround_weeks_max, does_vinyl, does_good_deed, does_fulfillment)
      SELECT ${newPressId}, ${DEMO_NAME}, NULL, ${logoUrl}, NULL, NULL, NULL,
        turnaround_weeks_min, turnaround_weeks_max, does_vinyl, false, false
      FROM manufacturers WHERE id = ${srcId}
    `);
    await tx.execute(sql`
      INSERT INTO press_formats (id, press_id, format, position, hidden_at, turnaround_weeks_min, turnaround_weeks_max, hidden_templates)
      SELECT ${gp("f.id")}, ${newPressId}, f.format, f.position, f.hidden_at, f.turnaround_weeks_min, f.turnaround_weeks_max, f.hidden_templates
      FROM press_formats f WHERE f.press_id = ${srcId}
    `);
    await tx.execute(sql`
      INSERT INTO press_color_tiers (id, press_id, format, name, position, price_ladder, masters_prep_cost_cents)
      SELECT ${gp("t.id")}, ${newPressId}, t.format, t.name, t.position, t.price_ladder, t.masters_prep_cost_cents
      FROM press_color_tiers t WHERE t.press_id = ${srcId}
    `);
    await tx.execute(sql`
      INSERT INTO press_colors (id, tier_id, name, swatch_hex, swatch_image_url, position, import_source_url, color_group_id, swatch_thumb_url)
      SELECT ${gp("c.id")}, ${gp("t.id")}, c.name, c.swatch_hex, c.swatch_image_url, c.position, c.import_source_url, c.color_group_id, c.swatch_thumb_url
      FROM press_colors c JOIN press_color_tiers t ON c.tier_id = t.id WHERE t.press_id = ${srcId}
    `);
    await tx.execute(sql`
      INSERT INTO press_jackets (id, press_id, name, position, is_default, applicable_formats)
      SELECT ${gp("j.id")}, ${newPressId}, j.name, j.position, j.is_default, j.applicable_formats
      FROM press_jackets j WHERE j.press_id = ${srcId}
    `);
    await tx.execute(sql`
      INSERT INTO press_tier_jacket_ladders (id, tier_id, jacket_id, price_ladder, price_ladder_180)
      SELECT ${gp("l.id")}, ${gp("t.id")}, ${gp("l.jacket_id")}, l.price_ladder, l.price_ladder_180
      FROM press_tier_jacket_ladders l JOIN press_color_tiers t ON l.tier_id = t.id WHERE t.press_id = ${srcId}
    `);
    await tx.execute(sql`
      INSERT INTO press_format_costs (press_id, format, manufacturing_cents, publishing_cents, payment_processing_cents, goodtunes_cents)
      SELECT ${newPressId}, format, manufacturing_cents, publishing_cents, payment_processing_cents, goodtunes_cents
      FROM press_format_costs WHERE press_id = ${srcId}
    `);
    console.log(`[good-press] ${envLabel}: created "${DEMO_NAME}" ${newPressId} from ${SOURCE_PRESS_NAME}`);
  });

  const counts = await db.execute<any>(sql`
    SELECT
      (SELECT count(*) FROM press_formats f JOIN manufacturers m ON f.press_id=m.id WHERE m.name=${DEMO_NAME}) fmts,
      (SELECT count(*) FROM press_color_tiers t JOIN manufacturers m ON t.press_id=m.id WHERE m.name=${DEMO_NAME}) tiers,
      (SELECT count(*) FROM press_colors c JOIN press_color_tiers t ON c.tier_id=t.id JOIN manufacturers m ON t.press_id=m.id WHERE m.name=${DEMO_NAME}) colors,
      (SELECT count(*) FROM press_jackets j JOIN manufacturers m ON j.press_id=m.id WHERE m.name=${DEMO_NAME}) jackets,
      (SELECT count(*) FROM press_tier_jacket_ladders l JOIN press_color_tiers t ON l.tier_id=t.id JOIN manufacturers m ON t.press_id=m.id WHERE m.name=${DEMO_NAME} AND l.price_ladder::text<>'[]') priced_ladders
  `);
  console.log(`[good-press] ${envLabel}: verify`, ((counts as any).rows ?? [])[0]);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
