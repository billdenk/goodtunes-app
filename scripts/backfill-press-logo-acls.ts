/**
 * Task #3254 — one-shot backfill: set the public ACL on every object-storage
 * object referenced by a manufacturer logo/image column.
 *
 * Press profile logos uploaded via the signed-PUT flow landed in the shared
 * bucket with NO custom:aclPolicy metadata, so the /objects/uploads/:id
 * serving route 404s them (Memphis Record Pressing's prod logos among them).
 * This scans every manufacturer image column in the TARGET DB and publishes
 * each referenced `/objects/uploads/...` object that isn't already public.
 *
 * Idempotent: already-public objects are skipped; MISSING objects are logged
 * and never fatal (the URL is simply broken, same as today). Marker-guarded
 * (post_merge_data_backfills / press_logo_acl_backfill_v1) so it runs once
 * per DB; an ACL-set FAILURE withholds the marker so the next merge retries.
 *
 * Dev:   npx tsx scripts/backfill-press-logo-acls.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/backfill-press-logo-acls.ts
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { ObjectStorageService, ObjectNotFoundError } from "../server/replit_integrations/object_storage/objectStorage";
import { getObjectAclPolicy, setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";

const MARKER = "press_logo_acl_backfill_v1";

const LOGO_COLUMNS = [
  "logo_url",
  "identity_icon_url",
  "nav_logo_url",
  "light_logo_url",
  "light_nav_logo_url",
  "square_logo_url",
  "light_square_logo_url",
  "cover_url",
  "vinyl_placeholder_url",
];

async function main() {
  const [marker] = (
    await db.execute(sql`SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER}`)
  ).rows;
  if (marker) {
    console.log(`press-logo-acl backfill: marker ${MARKER} already applied — nothing to do`);
    return;
  }

  const cols = LOGO_COLUMNS.join(", ");
  const rows = (await db.execute(sql.raw(`SELECT id, name, ${cols} FROM manufacturers`))).rows as any[];

  // Collect distinct /objects/uploads/... URLs across all columns.
  const urls = new Map<string, string>(); // url -> "press-name (column)" for logging
  for (const r of rows) {
    for (const c of LOGO_COLUMNS) {
      const v = r[c];
      if (typeof v === "string" && v.startsWith("/objects/uploads/")) {
        if (!urls.has(v)) urls.set(v, `${r.name} (${c})`);
      }
    }
  }
  console.log(`press-logo-acl backfill: ${urls.size} distinct upload URLs across ${rows.length} manufacturers`);

  const oss = new ObjectStorageService();
  let published = 0, alreadyPublic = 0, missing = 0, failed = 0;
  for (const [url, src] of urls) {
    try {
      const file = await oss.getObjectEntityFile(url);
      const acl = await getObjectAclPolicy(file);
      if (acl?.visibility === "public") {
        alreadyPublic++;
        continue;
      }
      await setObjectAclPolicy(file, { owner: "admin", visibility: "public" });
      const check = await getObjectAclPolicy(file);
      if (check?.visibility !== "public") throw new Error("ACL readback not public");
      published++;
      console.log(`  published ${url} — ${src}`);
    } catch (e) {
      if (e instanceof ObjectNotFoundError) {
        missing++;
        console.warn(`  MISSING (skipped) ${url} — ${src}`);
      } else {
        failed++;
        console.error(`  FAILED ${url} — ${src}:`, e);
      }
    }
  }
  console.log(`press-logo-acl backfill: published=${published} alreadyPublic=${alreadyPublic} missing=${missing} failed=${failed}`);

  if (failed > 0) {
    // Withhold the marker so the next merge retries the failed sets.
    throw new Error(`press-logo-acl backfill: ${failed} ACL set(s) failed — marker withheld`);
  }
  await db.execute(
    sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER}) ON CONFLICT DO NOTHING`,
  );
  console.log(`press-logo-acl backfill: marker ${MARKER} stamped`);
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error(e);
    await pool.end().catch(() => {});
    process.exit(1);
  });
