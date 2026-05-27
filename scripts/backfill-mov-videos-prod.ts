/**
 * Backfill: convert every `album_videos` row whose `video_url` still
 * points at a `.mov` / `.m4v` object into a browser-playable `.mp4`.
 *
 * Why: the bulk Dropbox-folder video importer used to save QuickTime
 * containers verbatim, and Chrome / mobile Safari refuse to play those
 * inline. The importer now transcodes on the way in, but the existing
 * `.mov` rows in production stay broken until we rewrite them. The two
 * known offenders today are on Nick Carter's "Love Life Tragedy"
 * (Basketball) and "Hurts to Love You" (LLT Recording Session — In
 * Booth) albums.
 *
 * For each candidate row this script:
 *   1. Looks up the source object via the Replit object-storage client.
 *   2. Streams the bytes to a tempfile.
 *   3. Runs ffprobe → picks remux (H.264 + AAC already, just repack the
 *      container) or transcode (libx264 + AAC). Mirrors the per-upload
 *      `transcodeVideoToWebFriendlyMp4` helper in server/routes.ts.
 *   4. Uploads the resulting .mp4 as a new `/objects/uploads/<uuid>.mp4`
 *      with the same public ACL + immutable cache-control every upload
 *      path uses.
 *   5. UPDATEs the row to point at the new URL.
 *   6. Only then deletes the original .mov object. If the UPDATE fails,
 *      the original stays put.
 *
 * Idempotent — re-running only sees rows that still end in .mov/.m4v.
 * Per-row failures are recorded in the JSON summary; the batch never
 * rolls back the rows that succeeded.
 *
 * Run:
 *   PROD_DATABASE_URL=... npx tsx scripts/backfill-mov-videos-prod.ts
 *
 * Dry-run (no DB writes, no deletes):
 *   PROD_DATABASE_URL=... DRY_RUN=1 npx tsx scripts/backfill-mov-videos-prod.ts
 */
import { Pool } from "pg";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fsp from "node:fs/promises";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import os from "node:os";
import path from "node:path";
import {
  objectStorageClient,
  ObjectStorageService,
} from "../server/replit_integrations/object_storage/objectStorage";
import { setObjectAclPolicy } from "../server/replit_integrations/object_storage/objectAcl";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

function resolveBucketAndPrefix(): { bucketName: string; prefix: string } {
  const dir = new ObjectStorageService().getPrivateObjectDir().replace(/\/$/, "");
  const trimmed = dir.startsWith("/") ? dir.slice(1) : dir;
  const firstSlash = trimmed.indexOf("/");
  const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
  const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
  return { bucketName, prefix };
}

// Resolve `/objects/uploads/<id>` to a GCS File handle. Same path
// convention every upload route in routes.ts uses.
function resolveObjectFile(videoUrl: string) {
  const { bucketName, prefix } = resolveBucketAndPrefix();
  if (!videoUrl.startsWith("/objects/")) {
    throw new Error(`video_url is not a managed object path: ${videoUrl}`);
  }
  const entityId = videoUrl.slice("/objects/".length);
  const objectName = `${prefix ? `${prefix}/` : ""}${entityId}`;
  return objectStorageClient.bucket(bucketName).file(objectName);
}

async function downloadToTemp(videoUrl: string): Promise<string> {
  const file = resolveObjectFile(videoUrl);
  const [exists] = await file.exists();
  if (!exists) throw new Error(`object not found in bucket: ${videoUrl}`);
  const ext = (videoUrl.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "mov");
  const tmpPath = path.join(os.tmpdir(), `${randomUUID()}.${ext}`);
  await pipeline(file.createReadStream(), fs.createWriteStream(tmpPath));
  return tmpPath;
}

async function probeCodecs(filePath: string): Promise<{ vcodec: string; acodec: string | null }> {
  const json = await new Promise<any>((resolve, reject) => {
    const p = spawn(
      "ffprobe",
      ["-v", "error", "-print_format", "json", "-show_streams", filePath],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let so = "";
    let se = "";
    p.stdout.on("data", (c) => (so += c.toString()));
    p.stderr.on("data", (c) => (se += c.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${se.trim()}`));
      try { resolve(JSON.parse(so)); }
      catch (e: any) { reject(new Error(`ffprobe parse: ${e?.message}`)); }
    });
  });
  const streams: any[] = json.streams || [];
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");
  if (!v) throw new Error("no video stream");
  return {
    vcodec: String(v.codec_name || ""),
    acodec: a ? String(a.codec_name || "") : null,
  };
}

async function transcodeToMp4(inputPath: string): Promise<{ outputPath: string; action: "remux" | "transcode" }> {
  const probe = await probeCodecs(inputPath);
  const audioPlayable = probe.acodec === null || probe.acodec === "aac";
  const videoPlayable = probe.vcodec === "h264";
  const action: "remux" | "transcode" = videoPlayable && audioPlayable ? "remux" : "transcode";
  const outputPath = path.join(os.tmpdir(), `${randomUUID()}.mp4`);
  const args = action === "remux"
    ? ["-y", "-i", inputPath, "-c", "copy", "-movflags", "+faststart", outputPath]
    : [
        "-y", "-i", inputPath,
        "-c:v", videoPlayable ? "copy" : "libx264",
        ...(videoPlayable ? [] : ["-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p"]),
        "-c:a", audioPlayable ? "copy" : "aac",
        ...(audioPlayable ? [] : ["-b:a", "192k"]),
        "-movflags", "+faststart",
        outputPath,
      ];
  try {
    await new Promise<void>((resolve, reject) => {
      const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      p.stderr.on("data", (c) => (stderr += c.toString()));
      p.on("error", reject);
      p.on("close", (code) => {
        if (code === 0) return resolve();
        const tail = stderr.split("\n").slice(-6).join("\n").trim();
        reject(new Error(`ffmpeg ${action} failed (exit ${code}): ${tail || "no stderr"}`));
      });
    });
  } catch (err) {
    try { await fsp.unlink(outputPath); } catch {}
    throw err;
  }
  return { outputPath, action };
}

async function uploadMp4(tmpPath: string): Promise<{ id: string; publicUrl: string }> {
  const { bucketName, prefix } = resolveBucketAndPrefix();
  const id = `${randomUUID()}.mp4`;
  const objectName = `${prefix ? `${prefix}/` : ""}uploads/${id}`;
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  const ws = file.createWriteStream({
    contentType: "video/mp4",
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
    resumable: false,
  });
  await pipeline(fs.createReadStream(tmpPath), ws);
  await setObjectAclPolicy(file, { owner: "admin", visibility: "public" });
  return { id, publicUrl: `/objects/uploads/${id}` };
}

type Outcome = {
  id: string;
  albumId: string;
  albumTitle: string | null;
  title: string;
  beforeUrl: string;
  afterUrl: string | null;
  action: "remux" | "transcode" | null;
  status: "ok" | "skipped-dry-run" | "failed";
  error?: string;
};

async function main() {
  const connectionString = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("PROD_DATABASE_URL (or DATABASE_URL) not set");
    process.exit(1);
  }
  const pool = new Pool({ connectionString });

  const { rows } = await pool.query<{
    id: string;
    album_id: string;
    title: string;
    video_url: string;
    album_title: string | null;
  }>(
    `SELECT av.id, av.album_id, av.title, av.video_url, a.title AS album_title
       FROM album_videos av
       LEFT JOIN albums a ON a.id = av.album_id
      WHERE av.deleted_at IS NULL
        AND (av.video_url ILIKE '%.mov' OR av.video_url ILIKE '%.m4v')
      ORDER BY a.title ASC NULLS LAST, av.position ASC, av.id ASC`,
  );
  console.log(`[backfill-mov-videos] found ${rows.length} .mov/.m4v video rows${DRY_RUN ? " (dry-run)" : ""}`);

  const outcomes: Outcome[] = [];

  for (const row of rows) {
    const label = `${row.album_title ?? "(no album)"} — ${row.title}`;
    const outcome: Outcome = {
      id: row.id,
      albumId: row.album_id,
      albumTitle: row.album_title,
      title: row.title,
      beforeUrl: row.video_url,
      afterUrl: null,
      action: null,
      status: "failed",
    };

    let tmpIn: string | null = null;
    let tmpOut: string | null = null;
    try {
      tmpIn = await downloadToTemp(row.video_url);
      const conv = await transcodeToMp4(tmpIn);
      tmpOut = conv.outputPath;
      outcome.action = conv.action;
      if (DRY_RUN) {
        outcome.status = "skipped-dry-run";
        console.log(`[backfill-mov-videos] ~ ${label} — would ${conv.action} → .mp4`);
      } else {
        const { publicUrl } = await uploadMp4(conv.outputPath);
        outcome.afterUrl = publicUrl;

        // Update the row BEFORE deleting the original — that way a
        // failed UPDATE leaves the .mov intact and re-running the
        // script picks the row up again. The WHERE clause includes
        // the original video_url so a concurrent edit (operator
        // re-uploaded the same video from the admin UI mid-backfill)
        // doesn't get clobbered.
        const upd = await pool.query(
          `UPDATE album_videos SET video_url = $1 WHERE id = $2 AND video_url = $3`,
          [publicUrl, row.id, row.video_url],
        );

        if (upd.rowCount !== 1) {
          // Row changed under us (deleted, edited, or already migrated).
          // Skip the delete so we never orphan a file the live row
          // still points at, and best-effort delete the .mp4 we just
          // uploaded so it doesn't dangle in the bucket.
          try { await resolveObjectFile(publicUrl).delete(); } catch {}
          outcome.afterUrl = null;
          outcome.status = "failed";
          outcome.error = `UPDATE matched ${upd.rowCount} rows (row changed mid-run); skipped`;
          console.warn(`[backfill-mov-videos] ~ ${label} — ${outcome.error}`);
        } else {
          // Now delete the original — best-effort. If this fails we
          // still log it, but the row already points at the new file
          // so playback is fixed.
          try {
            await resolveObjectFile(row.video_url).delete();
          } catch (e: any) {
            console.warn(`[backfill-mov-videos] note: failed to delete original ${row.video_url}: ${e?.message || e}`);
          }
          outcome.status = "ok";
          console.log(`[backfill-mov-videos] ✓ ${label} — ${conv.action} → ${publicUrl}`);
        }
      }
    } catch (e: any) {
      outcome.error = e?.message || String(e);
      console.warn(`[backfill-mov-videos] ✗ ${label} — ${outcome.error}`);
    } finally {
      if (tmpIn) { try { await fsp.unlink(tmpIn); } catch {} }
      if (tmpOut) { try { await fsp.unlink(tmpOut); } catch {} }
    }
    outcomes.push(outcome);
  }

  const summary = {
    ranAt: new Date().toISOString(),
    target: process.env.PROD_DATABASE_URL ? "PROD_DATABASE_URL" : "DATABASE_URL",
    dryRun: DRY_RUN,
    scanned: rows.length,
    ok: outcomes.filter((o) => o.status === "ok").length,
    skipped: outcomes.filter((o) => o.status === "skipped-dry-run").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
    outcomes,
  };
  console.log("\n[backfill-mov-videos] === SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  const date = new Date().toISOString().slice(0, 10);
  const outPath = path.join("docs", `backfill-mov-videos-prod-${date}.json`);
  try {
    await fsp.writeFile(outPath, JSON.stringify(summary, null, 2));
    console.log(`[backfill-mov-videos] wrote durable summary to ${outPath}`);
  } catch (e: any) {
    console.warn(`[backfill-mov-videos] could not write summary: ${e?.message || e}`);
  }

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
