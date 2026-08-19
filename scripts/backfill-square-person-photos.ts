// Task #3196 — one-time backfill: square center-crop non-square person
// avatar photos so every avatar circle renders true on all surfaces.
//
// For each DB (dev DATABASE_URL + prod PROD_DATABASE_URL):
//   - marker-guarded (one_shot_markers 'square_person_photos_v1' per DB);
//   - reads every people.photo_url;
//   - /objects/uploads/<id> → download stored bytes; https://… → fetch
//     (image mime, ≤8MB) and mirror per the external-links mirror rule;
//   - if non-square, writes a square center-cropped copy to object storage
//     (the bucket is shared dev+prod — crops are cached per source URL so a
//     photo shared by both DBs is processed once) and updates photo_url;
//   - external-but-already-square photos are mirrored (URL becomes ours);
//   - stamps the marker only when the pass had ZERO hard failures, so a
//     transient fetch error gets retried on the next full post-merge pass
//     instead of being locked in half-done.
//
// Safe to run repeatedly: rows already square (or already migrated to a
// cropped object URL) are no-ops, and updates are guarded on the old URL.
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  ObjectStorageService,
  objectStorageClient,
} from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";
import { squareCropImage, sniffImageDimensions } from "../server/imageProcessing";

const MARKER = "square_person_photos_v1";

const IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
};

const objectStorage = new ObjectStorageService();

function uploadTarget(mime: string): { bucketName: string; objectName: string; publicUrl: string } {
  const ext = IMAGE_MIME_TO_EXT[mime] || ".bin";
  const id = `${randomUUID()}${ext}`;
  const privateDir = objectStorage.getPrivateObjectDir().replace(/\/$/, "");
  const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = trimmed.indexOf("/");
  const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
  const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
  return {
    bucketName,
    objectName: `${prefix ? `${prefix}/` : ""}uploads/${id}`,
    publicUrl: `/objects/uploads/${id}`,
  };
}

async function uploadPublic(buf: Buffer, mime: string): Promise<string> {
  const { bucketName, objectName, publicUrl } = uploadTarget(mime);
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  await file.save(buf, {
    contentType: mime,
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
    resumable: false,
  });
  await setObjectAclPolicy(file, { owner: "admin", visibility: "public" });
  return publicUrl;
}

async function fetchBytes(url: string): Promise<{ buf: Buffer; mime: string } | null> {
  if (url.startsWith("/objects/uploads/")) {
    const file = await objectStorage.getObjectEntityFile(url);
    const [metadata] = await file.getMetadata();
    const mime = String(metadata.contentType || "").split(";")[0].trim().toLowerCase();
    const [bytes] = await file.download();
    return { buf: Buffer.from(bytes), mime };
  }
  if (/^https:\/\//i.test(url)) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GoodTunesBot/1.0)" },
      });
      if (!r.ok) {
        const err = new Error(`fetch ${r.status}`) as Error & { permanent?: boolean };
        // Hotlink-protected CDNs 403 every server-side fetch, forever —
        // retrying on later passes can never succeed, so callers treat
        // non-transient 4xx as a logged skip instead of a marker-blocking
        // failure. 408/429/5xx stay retryable.
        err.permanent = r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429;
        throw err;
      }
      const mime = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!IMAGE_MIME_TO_EXT[mime]) throw new Error(`unsupported mime ${mime || "unknown"}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.byteLength > 8 * 1024 * 1024) throw new Error("image larger than 8MB");
      return { buf, mime };
    } finally {
      clearTimeout(t);
    }
  }
  return null; // local static path / anything else — leave alone
}

// Per-source-URL result cache so a URL shared across rows/DBs is fetched,
// cropped, and uploaded exactly once. Value = new URL, or null = leave as-is.
const resolved = new Map<string, Promise<string | null>>();

function resolveSquareUrl(srcUrl: string, isExternal: boolean): Promise<string | null> {
  let p = resolved.get(srcUrl);
  if (!p) {
    p = (async () => {
      const got = await fetchBytes(srcUrl);
      if (!got) return null;
      const cropped = await squareCropImage(got.buf, got.mime);
      if (!cropped) {
        // Already square (±1px) or not croppable. Externals still get
        // mirrored so the URL is ours and stable.
        const dims = sniffImageDimensions(got.buf);
        console.log(
          `  square-ok ${srcUrl.slice(0, 90)} (${dims ? `${dims.width}x${dims.height}` : "?"})${isExternal ? " → mirroring" : ""}`,
        );
        return isExternal ? await uploadPublic(got.buf, got.mime) : null;
      }
      const url = await uploadPublic(cropped.buffer, cropped.mime);
      console.log(`  cropped   ${srcUrl.slice(0, 90)} → ${url}`);
      return url;
    })();
    resolved.set(srcUrl, p);
  }
  return p;
}

async function runForDb(label: string, dbUrl: string | undefined): Promise<void> {
  if (!dbUrl) {
    console.log(`[${label}] no DB URL set — skipping`);
    return;
  }
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS one_shot_markers (name text PRIMARY KEY, created_at timestamptz DEFAULT now())`,
    );
    const marked = await pool.query(`SELECT 1 FROM one_shot_markers WHERE name = $1`, [MARKER]);
    if (marked.rowCount) {
      console.log(`[${label}] marker ${MARKER} present — already backfilled, skipping`);
      return;
    }
    const { rows } = await pool.query<{ id: string; name: string; photo_url: string }>(
      `SELECT id, name, photo_url FROM people WHERE photo_url IS NOT NULL AND photo_url <> ''`,
    );
    console.log(`[${label}] ${rows.length} people with photos`);
    let updated = 0;
    let failures = 0;
    const CONCURRENCY = 6;
    let idx = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (idx < rows.length) {
          const row = rows[idx++];
          const src = row.photo_url.trim();
          const isExternal = /^https:\/\//i.test(src);
          try {
            const newUrl = await resolveSquareUrl(src, isExternal);
            if (newUrl && newUrl !== src) {
              const r = await pool.query(
                `UPDATE people SET photo_url = $1 WHERE id = $2 AND photo_url = $3`,
                [newUrl, row.id, row.photo_url],
              );
              if (r.rowCount) {
                updated++;
                console.log(`[${label}] updated ${row.name}`);
              }
            }
          } catch (err) {
            if ((err as { permanent?: boolean })?.permanent) {
              console.warn(`[${label}] SKIPPED (permanently unfetchable) ${row.name} (${src.slice(0, 90)}):`, (err as Error)?.message);
            } else {
              failures++;
              console.warn(`[${label}] FAILED ${row.name} (${src.slice(0, 90)}):`, (err as Error)?.message);
            }
          }
        }
      }),
    );
    console.log(`[${label}] done — ${updated} updated, ${failures} failed`);
    if (failures === 0) {
      await pool.query(
        `INSERT INTO one_shot_markers (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [MARKER],
      );
      console.log(`[${label}] marker ${MARKER} stamped`);
    } else {
      console.warn(`[${label}] NOT stamping marker — ${failures} failures will retry on the next full pass`);
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  await runForDb("dev", process.env.DATABASE_URL);
  await runForDb("prod", process.env.PROD_DATABASE_URL);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("backfill-square-person-photos failed:", err);
    process.exit(1);
  },
);
