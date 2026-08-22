// One-shot repair: mirror any songs.audio_url that still points at an
// EXTERNAL http(s) link (the known row is '49 by Raynes, track 7 — a raw
// Dropbox link saved before the mirror-at-save boundary shipped) into our
// object storage, stamping the original link as source_url provenance.
//
// Marker-guarded via post_merge_data_backfills ('task_3260_mirror_external_
// song_audio') so operator re-uploads are never clobbered on later merges.
// A row whose link is dead is LEFT AS-IS (masters health already classifies
// external pointers as needing attention — "flag, don't silently delete";
// note the known row may duplicate track 1). The marker is stamped only when
// the pass runs to completion (per-row failures are terminal dead-link
// states, not retryable script failures).
//
// Raw byte mirror only — no transcode. The stored audio spec columns were
// probed from the same remote bytes, so they stay valid; Mux re-ingest is
// not needed (maybeIngestToMux also accepts /objects/ URLs on next touch).
//
// Usage: DATABASE_URL=<url> npx tsx scripts/mirror-external-song-audio.ts
// (invoked for dev + prod from scripts/post-merge.sh; requires the object
// storage sidecar + PRIVATE_OBJECT_DIR, both present in the workspace).

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { fetchExternalFileToTmp, isExternalFileUrl } from "../server/externalFileMirror";
import { objectStorageClient, setObjectAclPolicy } from "../server/replit_integrations/object_storage";

const MARKER = "task_3260_mirror_external_song_audio";

function uploadDestination(id: string): { bucketName: string; objectName: string } {
  const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR is not set");
  const trimmed = privateDir.startsWith("/") ? privateDir.slice(1) : privateDir;
  const firstSlash = trimmed.indexOf("/");
  const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
  const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
  return { bucketName, objectName: `${prefix ? `${prefix}/` : ""}uploads/${id}` };
}

export type MirrorRowResult =
  | { status: "mirrored"; objectPath: string }
  | { status: "skipped-stale" };

/**
 * Mirror ONE external-URL song row: download (guarded fetch), upload into
 * object storage with the SAME public ACL policy every normal audio upload
 * gets (so the public /objects/ read path can serve it), then conditionally
 * stamp the row. If the row changed underneath us (operator re-upload racing
 * the repair), the freshly uploaded object is deleted — never orphaned, and
 * the operator's newer value is never clobbered.
 * Throws on fetch/upload failure — the caller logs NEEDS RE-UPLOAD.
 */
export async function mirrorOneExternalSong(
  pool: Pool,
  row: { id: string; audio_url: string },
): Promise<MirrorRowResult> {
  const fs = await import("node:fs");
  const fsp = await import("node:fs/promises");
  const { pipeline } = await import("node:stream/promises");
  const fetched = await fetchExternalFileToTmp(row.audio_url, "audio");
  try {
    const id = `${randomUUID()}${fetched.ext}`;
    const { bucketName, objectName } = uploadDestination(id);
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const w = file.createWriteStream({
      contentType: fetched.mime,
      metadata: { cacheControl: "public, max-age=31536000, immutable" },
      resumable: fetched.bytes > 8 * 1024 * 1024,
    });
    await pipeline(fs.createReadStream(fetched.tmpPath), w);
    // Same ACL policy as uploadFileToObjectStorage — without it the public
    // /objects/ read path refuses to serve the object and playback breaks.
    await setObjectAclPolicy(file, { owner: "admin", visibility: "public" });
    const objectPath = `/objects/uploads/${id}`;
    const upd = await pool.query(
      `UPDATE songs SET audio_url = $1, source_url = $2
        WHERE id = $3 AND audio_url = $4`,
      [objectPath, row.audio_url, row.id, row.audio_url],
    );
    if (!upd.rowCount) {
      // Row changed underneath us — clean up the object we just uploaded.
      try { await file.delete(); } catch { /* best-effort */ }
      return { status: "skipped-stale" };
    }
    return { status: "mirrored", objectPath };
  } finally {
    try { await fsp.unlink(fetched.tmpPath); } catch { /* ignore */ }
  }
}

export async function runMirrorExternalSongAudio(pool: Pool): Promise<{ mirrored: number; failed: number; skipped: number } | null> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_merge_data_backfills (
      name        text PRIMARY KEY,
      applied_at  timestamp NOT NULL DEFAULT now()
    )`);
  const marker = await pool.query(
    "SELECT 1 FROM post_merge_data_backfills WHERE name = $1", [MARKER],
  );
  if (marker.rowCount) {
    console.log(`[mirror-external-song-audio] marker present — nothing to do.`);
    return null;
  }
  // Column may lag on a drifted clone — make the read safe.
  await pool.query("ALTER TABLE IF EXISTS songs ADD COLUMN IF NOT EXISTS source_url text");
  const { rows } = await pool.query(`
    SELECT id, title, album_id, audio_url FROM songs
     WHERE audio_url ~* '^https?://' AND deleted_at IS NULL
  `);
  console.log(`[mirror-external-song-audio] ${rows.length} external-URL song row(s) found.`);
  let mirrored = 0, failed = 0, skipped = 0;
  for (const row of rows) {
    if (!isExternalFileUrl(row.audio_url)) continue;
    try {
      const r = await mirrorOneExternalSong(pool, row);
      if (r.status === "mirrored") {
        mirrored++;
        console.log(`[mirror-external-song-audio] mirrored "${row.title}" (${row.id}) → ${r.objectPath}`);
      } else {
        skipped++;
        console.log(`[mirror-external-song-audio] row changed mid-repair — skipped "${row.title}" (${row.id}), uploaded object removed.`);
      }
    } catch (e: any) {
      failed++;
      // Leave the row untouched — masters health classifies external
      // pointers as needing re-upload; the operator handles it there.
      console.warn(
        `[mirror-external-song-audio] NEEDS RE-UPLOAD — "${row.title}" (${row.id}) link failed: ${e?.message ?? e}`,
      );
    }
  }
  await pool.query(
    "INSERT INTO post_merge_data_backfills (name) VALUES ($1) ON CONFLICT DO NOTHING",
    [MARKER],
  );
  console.log(`[mirror-external-song-audio] done — mirrored=${mirrored} needs-reupload=${failed} skipped-stale=${skipped}. Marker stamped.`);
  return { mirrored, failed, skipped };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    await runMirrorExternalSongAudio(pool);
  } finally {
    await pool.end();
  }
}

// Only run as a script — importing for tests must not trigger the sweep.
if (process.argv[1] && /mirror-external-song-audio\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error("[mirror-external-song-audio] FATAL", e);
    process.exit(1);
  });
}
