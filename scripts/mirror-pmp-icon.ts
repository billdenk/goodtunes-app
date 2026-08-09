/**
 * Mirror the official Physical Music Products (PMP) icon —
 * handoff/press-dashboard/assets/pmp-icon.svg (round pressed-record mark,
 * shown on a white circle, never recolored) — into Object Storage ONCE, and
 * point PMP's manufacturers.logo_url at it, replacing the old photo upload.
 *
 * The bucket is shared by dev + prod, so the same /objects/uploads/<id>.svg
 * URL resolves in both. The resolved URL is persisted to
 * scripts/data/pmp-icon-url.json so a second run (e.g. against prod via
 * post-merge) reuses the same upload instead of re-mirroring.
 *
 * IDEMPOTENT: clean no-op when the target row already carries the mirrored URL.
 *
 * Dev:   npx tsx scripts/mirror-pmp-icon.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/mirror-pmp-icon.ts
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { objectStorageClient } from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";

const SRC = "handoff/press-dashboard/assets/pmp-icon.svg";
const MANIFEST = "scripts/data/pmp-icon-url.json";
const PRESS_NAME = "Physical Music Products";

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
  const url = await uploadOnce();
  const rows = await db.execute<{ id: string; logo_url: string | null }>(
    sql`SELECT id, logo_url FROM manufacturers WHERE name = ${PRESS_NAME} AND deleted_at IS NULL LIMIT 1`,
  );
  const press = rows.rows[0];
  if (!press) {
    console.log(`mirror-pmp-icon: ${PRESS_NAME} not found in ${envLabel} DB — nothing to do.`);
    return;
  }
  if (press.logo_url === url) {
    console.log(`mirror-pmp-icon (${envLabel}): already pointing at ${url} — clean no-op.`);
    return;
  }
  await db.execute(sql`UPDATE manufacturers SET logo_url = ${url} WHERE id = ${press.id}`);
  console.log(`mirror-pmp-icon (${envLabel}): logo_url ${press.logo_url ?? "NULL"} -> ${url}`);
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    pool.end().finally(() => process.exit(1));
  });
