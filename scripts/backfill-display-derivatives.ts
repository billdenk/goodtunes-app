/**
 * Task #898 — Backfill display derivatives for existing oversized art.
 *
 * New admin uploads now keep the full-resolution ORIGINAL at a ".orig"
 * sibling and serve a downsized (~1500px) DISPLAY derivative from the
 * canonical /objects/uploads/<id> URL (see server/imageProcessing.ts +
 * uploadBufferToObjectStorage in server/routes.ts). This one-shot backfill
 * does the same to images that were uploaded BEFORE that change — most
 * importantly the prod-only oversized album art (Daniel Lew "Destiny") that
 * OOM-crashed GoodDeed cert/share-card rendering.
 *
 * For every /objects/uploads/<id> URL referenced by the DB:
 *   1. If the ".orig" sibling already exists → already processed, skip.
 *   2. Sniff dimensions (ranged header read first, full read as fallback).
 *   3. If the long edge ≤ 1500px → nothing to do (already display-sized).
 *   4. Otherwise: copy the current object to its ".orig" sibling (the
 *      preserved original), then OVERWRITE the canonical object with the
 *      downscaled derivative. Every existing surface keeps its URL and now
 *      renders the smaller image; the fan zoom lightbox pulls ".orig".
 *
 * IDEMPOTENT + non-destructive:
 *   - The ".orig"-exists check means re-runs skip everything already done.
 *   - A `post_merge_data_backfills` marker row short-circuits the whole pass
 *     once it has completed on a given DB.
 *   - Object Storage is shared dev↔prod, so processing either DB's URLs
 *     benefits both; the marker is per-DB only to avoid redundant scans.
 *
 * Dev:   npx tsx scripts/backfill-display-derivatives.ts
 * Prod:  DATABASE_URL="$PROD_DATABASE_URL" npx tsx scripts/backfill-display-derivatives.ts
 * Dry:   add --dry (no writes)
 */
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import {
  objectStorageClient,
  ObjectStorageService,
} from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";
import {
  DISPLAY_MAX_EDGE,
  makeDisplayDerivative,
  sniffImageDimensions,
} from "../server/imageProcessing";

const DRY = process.argv.includes("--dry");
const MARKER = "task_898_display_derivatives";

const objectStorage = new ObjectStorageService();

// Table/column pairs that store an uploaded image URL. Queried with raw SQL
// + per-pair try/catch so a table/column that doesn't exist in this DB
// (schema drift between dev/prod) is skipped instead of aborting the run.
const IMAGE_COLUMNS: Array<{ table: string; column: string }> = [
  { table: "albums", column: "artwork" },
  { table: "album_photos", column: "photo_url" },
  { table: "people", column: "photo_url" },
  { table: "people", column: "cover_url" },
  { table: "vendors", column: "logo_url" },
  { table: "vendors", column: "cover_url" },
  { table: "instruments", column: "photo_url" },
  { table: "organizations", column: "logo_url" },
  { table: "press_colors", column: "swatch_image_url" },
  { table: "manufacturers", column: "logo_url" },
  { table: "fulfillment_partners", column: "logo_url" },
];

function bucketFor(objectName: string): ReturnType<typeof objectStorageClient.bucket> {
  const privateDir = objectStorage.getPrivateObjectDir().replace(/\/$/, "");
  const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = trimmed.indexOf("/");
  const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
  return objectStorageClient.bucket(bucketName);
}

function objectNameForId(id: string): string {
  const privateDir = objectStorage.getPrivateObjectDir().replace(/\/$/, "");
  const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = trimmed.indexOf("/");
  const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
  return `${prefix ? `${prefix}/` : ""}uploads/${id}`;
}

function origSibling(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= name.lastIndexOf("/")) return name;
  return `${name.slice(0, dot)}.orig${name.slice(dot)}`;
}

function mimeForId(id: string): string {
  const ext = id.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "avif") return "image/avif";
  return "application/octet-stream";
}

async function alreadyApplied(): Promise<boolean> {
  try {
    const r = await db.execute(
      sql`SELECT 1 FROM post_merge_data_backfills WHERE name = ${MARKER} LIMIT 1`,
    );
    return (r.rows?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

async function markApplied(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name text PRIMARY KEY,
      applied_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(
    sql`INSERT INTO post_merge_data_backfills (name) VALUES (${MARKER})
        ON CONFLICT (name) DO NOTHING`,
  );
}

async function collectUrls(): Promise<Set<string>> {
  const urls = new Set<string>();
  for (const { table, column } of IMAGE_COLUMNS) {
    try {
      const r = await db.execute(
        sql`SELECT DISTINCT ${sql.raw(column)} AS url
            FROM ${sql.raw(table)}
            WHERE ${sql.raw(column)} LIKE '/objects/uploads/%'`,
      );
      for (const row of r.rows as Array<{ url: string }>) {
        if (row.url) urls.add(row.url);
      }
    } catch (e: any) {
      console.log(`  (skip ${table}.${column}: ${e?.message ?? e})`);
    }
  }
  return urls;
}

function idFromUrl(url: string): string | null {
  const m = /^\/objects\/uploads\/([a-zA-Z0-9._-]+)$/.exec(url);
  if (!m) return null;
  if (m[1].includes(".orig.")) return null; // already an original
  return m[1];
}

async function processOne(url: string): Promise<"converted" | "skip-small" | "skip-done" | "skip-error"> {
  const id = idFromUrl(url);
  if (!id) return "skip-error";
  const objectName = objectNameForId(id);
  const bucket = bucketFor(objectName);
  const file = bucket.file(objectName);
  const origName = origSibling(objectName);
  const origFile = bucket.file(origName);

  // Already processed?
  const [origExists] = await origFile.exists();
  if (origExists) return "skip-done";

  const [exists] = await file.exists();
  if (!exists) return "skip-error";

  // Ranged header sniff first to avoid pulling huge bytes for small images.
  let dims: { width: number; height: number } | null = null;
  try {
    const [head] = await file.download({ start: 0, end: 131071 });
    dims = sniffImageDimensions(head);
  } catch {
    dims = null;
  }

  // Pull the full object (needed either to confirm small dims from a header
  // the sniff couldn't read, or to actually downscale it).
  const [full] = await file.download();
  if (!dims) dims = sniffImageDimensions(full);
  if (!dims) return "skip-error";
  if (Math.max(dims.width, dims.height) <= DISPLAY_MAX_EDGE) return "skip-small";

  const mime = mimeForId(id);
  const derivative = await makeDisplayDerivative(full, mime);
  if (!derivative) return "skip-error";

  if (DRY) {
    console.log(
      `  would convert ${id} ${dims.width}×${dims.height} ${full.length}B → ${derivative.buffer.length}B`,
    );
    return "converted";
  }

  // 1. Preserve the original at the ".orig" sibling.
  await origFile.save(full, {
    contentType: mime,
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
    resumable: false,
  });
  await setObjectAclPolicy(origFile, { owner: "admin", visibility: "public" });

  // 2. Overwrite the canonical object with the downsized derivative.
  await file.save(derivative.buffer, {
    contentType: derivative.mime,
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
    resumable: false,
  });
  await setObjectAclPolicy(file, { owner: "admin", visibility: "public" });

  console.log(
    `  converted ${id} ${dims.width}×${dims.height} ${full.length}B → ${derivative.buffer.length}B`,
  );
  return "converted";
}

async function main() {
  console.log(`display-derivative backfill${DRY ? " (DRY RUN)" : ""} — ${new Date().toISOString()}`);
  if (!DRY && (await alreadyApplied())) {
    console.log(`already applied (marker '${MARKER}') — skipping`);
    return;
  }
  const urls = await collectUrls();
  console.log(`scanning ${urls.size} uploaded image URL(s)`);

  const counts = { converted: 0, "skip-small": 0, "skip-done": 0, "skip-error": 0 };
  for (const url of urls) {
    try {
      const res = await processOne(url);
      counts[res]++;
    } catch (e: any) {
      counts["skip-error"]++;
      console.log(`  error ${url}: ${e?.message ?? e}`);
    }
  }

  console.log(
    `done: ${counts.converted} converted, ${counts["skip-small"]} already-small, ` +
      `${counts["skip-done"]} already-done, ${counts["skip-error"]} skipped/errored`,
  );

  if (!DRY) await markApplied();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
