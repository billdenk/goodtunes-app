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
  isProcessableImage,
  makeDisplayDerivative,
  sniffImageDimensions,
} from "../server/imageProcessing";

const DRY = process.argv.includes("--dry");
// v2: the original task-898 pass marked itself done even though it SKIPPED the
// one image it was built to fix — Daniel Lew "Destiny" (~178MP) was above the
// old 64MP decode ceiling, so it produced no derivative yet the marker was
// written anyway. The pipeline now has a memory-safe libvips path for
// over-ceiling art AND treats an un-convertible oversized image as a BLOCKING
// error (never left raw), so we re-run under a fresh marker name (the stale
// `task_898_display_derivatives` row is left in place, harmless) and ONLY
// stamp this marker when nothing errored.
const MARKER = "task_898_display_derivatives_v2";

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

// Outcome taxonomy. "skip-error" — an oversized, processable image we SHOULD
// have converted but couldn't (a decode failure, OR one beyond the memory-safe
// ceiling that we refuse to leave raw) — blocks the done-marker and keeps the
// pass loud + re-runnable; completion can't be stamped while a risky raw
// original remains. The benign skips ("skip-missing" orphaned URL, "skip-small"
// already display-sized, "skip-unprocessable" non-raster / format we don't
// derive) are "we did everything we could" and never block the marker.
type Outcome =
  | "converted"
  | "skip-small"
  | "skip-done"
  | "skip-missing"
  | "skip-unprocessable"
  | "skip-error";

async function processOne(url: string): Promise<Outcome> {
  const id = idFromUrl(url);
  if (!id) return "skip-unprocessable";
  const objectName = objectNameForId(id);
  const bucket = bucketFor(objectName);
  const file = bucket.file(objectName);
  const origName = origSibling(objectName);
  const origFile = bucket.file(origName);

  // Already processed?
  const [origExists] = await origFile.exists();
  if (origExists) return "skip-done";

  const [exists] = await file.exists();
  if (!exists) return "skip-missing";

  // Ranged header sniff first. For the overwhelming majority of objects this
  // alone settles the question (PNG/JPEG/GIF/WebP dims all live in the first
  // bytes), so we can return WITHOUT ever pulling the full object — the whole
  // pass only fully downloads the handful of genuinely oversized images,
  // which keeps it fast enough to finish inside the post-merge time budget.
  let dims: { width: number; height: number } | null = null;
  try {
    const [head] = await file.download({ start: 0, end: 131071 });
    dims = sniffImageDimensions(head);
  } catch {
    dims = null;
  }
  if (dims && Math.max(dims.width, dims.height) <= DISPLAY_MAX_EDGE) {
    return "skip-small";
  }

  // Either the header couldn't be read, or this is oversized — now we need
  // the full bytes (to confirm dims the sniff couldn't read, or to downscale).
  const [full] = await file.download();
  if (!dims) dims = sniffImageDimensions(full);
  // Not a raster we can size/derive (e.g. AVIF whose dims we don't parse, or
  // a non-image object): leave it untouched, don't block the marker.
  if (!dims) return "skip-unprocessable";
  if (Math.max(dims.width, dims.height) <= DISPLAY_MAX_EDGE) return "skip-small";

  const mime = mimeForId(id);
  // gif/avif/etc. have no display derivative path — store-original behavior.
  if (!isProcessableImage(mime)) return "skip-unprocessable";

  // makeDisplayDerivative decides: produce a downsized derivative, say the
  // original is fine as-is, or REJECT it (oversized + beyond the memory-safe
  // ceiling, or one that neither decode path could handle). A reject is a
  // BLOCKING error: leaving the raw oversized original in place is the exact
  // bug this backfill exists to fix, so the run must NOT stamp its done-marker
  // while one remains — it stays loud and re-runnable.
  const result = await makeDisplayDerivative(full, mime);
  if (result.kind === "reject") {
    console.log(
      `  CANNOT CONVERT (blocking) ${id} ${dims.width}×${dims.height}: ${result.reason}`,
    );
    return "skip-error";
  }
  if (result.kind === "passthrough") {
    // makeDisplayDerivative's own re-sniff found it already display-sized or
    // couldn't verify the header — benign, store-as-is, re-running won't help.
    return "skip-unprocessable";
  }
  const derivative = result.derivative;

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

  const counts: Record<Outcome, number> = {
    converted: 0,
    "skip-small": 0,
    "skip-done": 0,
    "skip-missing": 0,
    "skip-unprocessable": 0,
    "skip-error": 0,
  };
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
      `${counts["skip-done"]} already-done, ${counts["skip-missing"]} missing, ` +
      `${counts["skip-unprocessable"]} unprocessable, ${counts["skip-error"]} errored`,
  );

  // Only stamp the done-marker when nothing ERRORED. A run that failed to
  // convert an oversized image it should have handled stays un-marked so the
  // next post-merge re-runs it (the ".orig"-exists check makes the retry skip
  // everything already converted). Benign skips don't block — re-running them
  // wouldn't change the outcome.
  if (!DRY) {
    if (counts["skip-error"] === 0) {
      await markApplied();
      console.log(`marker '${MARKER}' written — pass complete`);
    } else {
      console.log(
        `NOT marking '${MARKER}': ${counts["skip-error"]} image(s) errored — re-runnable on next merge`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
