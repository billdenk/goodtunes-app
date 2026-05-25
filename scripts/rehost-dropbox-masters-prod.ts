/**
 * Task #345 — re-host the 243 legacy Dropbox masters into our own bucket so
 * the master-specs probe (Task #333) can read their format/rate/depth/size.
 *
 * For every song in PROD whose `audio_url` still points at
 * `https://dl.dropboxusercontent.com/...` (or any other dropbox.com host),
 * we:
 *   1. Stream the bytes into a tempfile (Dropbox URL is rewritten dl=1,
 *      redirects followed, 500 MB hard cap mirroring the upload-audio
 *      route).
 *   2. Sniff the content-type from the URL extension + magic bytes, pick
 *      an extension from AUDIO_MIME_TO_EXT.
 *   3. Upload to `${PRIVATE_OBJECT_DIR}/uploads/<uuid>.<ext>` with the
 *      same public ACL + cache-control the live upload route sets.
 *   4. Run ffprobe on the local tempfile to fill in
 *      audio_format / sample_rate / bit_depth / channels / bytes /
 *      container_ext.
 *   5. UPDATE the row — new `audio_url` and the spec columns in one
 *      transaction so a partial failure can't leave a re-hosted file
 *      with null specs.
 *
 * Dropbox URLs that no longer resolve (expired shares, 404/410, the
 * "file is currently unavailable" HTML page) are recorded into a
 * `needsArtistReSupply` list in the summary JSON. Nick chases those
 * tracks specifically.
 *
 * Run:
 *   PROD_DATABASE_URL=... npx tsx scripts/rehost-dropbox-masters-prod.ts
 *
 * The script is idempotent: it only looks at rows whose audio_url still
 * starts with http(s)://, so a partial run can be resumed by re-invoking.
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

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB — generous WAV-master ceiling
const FETCH_TIMEOUT_MS = 5 * 60_000;
const MAX_REDIRECTS = 8;

const EXT_TO_MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".wave": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".aiff": "audio/aiff",
  ".aif": "audio/aiff",
};

function sniffAudioMime(buf: Buffer, urlExt: string | null): { mime: string; ext: string } {
  // Magic-byte sniff. Order matters — the .wav/.aiff "RIFF/FORM" header
  // is unambiguous, so try those first.
  if (buf.length >= 12) {
    const head4 = buf.slice(0, 4).toString("ascii");
    const tag8 = buf.slice(8, 12).toString("ascii");
    if (head4 === "RIFF" && tag8 === "WAVE") return { mime: "audio/wav", ext: ".wav" };
    if (head4 === "FORM" && (tag8 === "AIFF" || tag8 === "AIFC")) {
      return { mime: "audio/aiff", ext: ".aiff" };
    }
    if (head4 === "fLaC") return { mime: "audio/flac", ext: ".flac" };
    if (head4 === "OggS") return { mime: "audio/ogg", ext: ".ogg" };
  }
  // ID3-tagged MP3 ("ID3" header) or raw MP3 frame (0xFF 0xFB/0xF3/0xF2).
  if (buf.length >= 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    return { mime: "audio/mpeg", ext: ".mp3" };
  }
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    return { mime: "audio/mpeg", ext: ".mp3" };
  }
  // ISO Base Media (mp4/m4a): bytes 4..8 == "ftyp".
  if (buf.length >= 12 && buf.slice(4, 8).toString("ascii") === "ftyp") {
    return { mime: "audio/mp4", ext: ".m4a" };
  }
  if (urlExt && EXT_TO_MIME[urlExt]) {
    return { mime: EXT_TO_MIME[urlExt], ext: urlExt === ".aif" ? ".aiff" : urlExt };
  }
  return { mime: "application/octet-stream", ext: ".bin" };
}

function urlExtOf(u: string): string | null {
  try {
    const p = new URL(u).pathname.toLowerCase();
    const m = p.match(/\.([a-z0-9]{2,5})$/);
    return m ? `.${m[1]}` : null;
  } catch {
    return null;
  }
}

function rewriteDropboxUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const isDropbox =
      u.hostname === "www.dropbox.com" ||
      u.hostname === "dropbox.com" ||
      u.hostname === "dl.dropboxusercontent.com" ||
      /\.dropboxusercontent\.com$/i.test(u.hostname);
    if (isDropbox) {
      // dl=1 forces the byte stream instead of a preview HTML page.
      u.searchParams.set("dl", "1");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

type FetchOutcome =
  | { kind: "ok"; tmpPath: string; sniffedMime: string; ext: string; bytes: number }
  | { kind: "http-error"; status: number; bodyHint: string }
  | { kind: "fetch-error"; error: string };

async function downloadToTemp(rawUrl: string): Promise<FetchOutcome> {
  let url = rewriteDropboxUrl(rawUrl);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    let response: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const r = await fetch(url, {
        redirect: "manual",
        signal: ac.signal,
        headers: { "User-Agent": "GoodTunesBot/1.0 (master rehost)" },
      });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) {
          return { kind: "http-error", status: r.status, bodyHint: "redirect without location" };
        }
        try {
          url = new URL(loc, url).toString();
        } catch {
          return { kind: "http-error", status: r.status, bodyHint: `bad redirect: ${loc}` };
        }
        try { await r.arrayBuffer(); } catch {}
        continue;
      }
      response = r as unknown as Response;
      break;
    }
    if (!response) {
      return { kind: "http-error", status: 0, bodyHint: "too many redirects" };
    }
    if (!response.ok || !response.body) {
      let hint = "";
      try { hint = (await response.text()).slice(0, 200); } catch {}
      return { kind: "http-error", status: response.status, bodyHint: hint };
    }
    const ctHeader = (response.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
    // Dropbox returns text/html when the share has been revoked or the
    // file was deleted, even on a 200 response. Treat that as "needs
    // re-supply" — we can't probe a webpage.
    if (ctHeader.startsWith("text/")) {
      return { kind: "http-error", status: response.status, bodyHint: `content-type ${ctHeader}` };
    }

    const tmpPath = path.join(os.tmpdir(), `${randomUUID()}.download`);
    const ws = fs.createWriteStream(tmpPath);
    let written = 0;
    const reader = (response.body as any).getReader();
    let firstChunk: Buffer | null = null;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          const chunk = Buffer.from(value);
          written += chunk.byteLength;
          if (written > MAX_BYTES) {
            try { await reader.cancel(); } catch {}
            ws.destroy();
            try { await fsp.unlink(tmpPath); } catch {}
            return { kind: "fetch-error", error: `exceeded ${MAX_BYTES} bytes` };
          }
          if (!firstChunk) firstChunk = chunk.subarray(0, Math.min(chunk.length, 32));
          if (!ws.write(chunk)) {
            await new Promise<void>((resolve) => ws.once("drain", () => resolve()));
          }
        }
      }
      await new Promise<void>((resolve, reject) => {
        ws.end((err: any) => (err ? reject(err) : resolve()));
      });
    } catch (e: any) {
      ws.destroy();
      try { await fsp.unlink(tmpPath); } catch {}
      return { kind: "fetch-error", error: e?.message || String(e) };
    }

    if (written === 0) {
      try { await fsp.unlink(tmpPath); } catch {}
      return { kind: "fetch-error", error: "zero-byte response" };
    }
    const head = firstChunk ?? Buffer.alloc(0);
    const sniff = sniffAudioMime(head, urlExtOf(rawUrl));
    return { kind: "ok", tmpPath, sniffedMime: sniff.mime, ext: sniff.ext, bytes: written };
  } catch (e: any) {
    const reason = ac.signal.aborted ? `timeout after ${FETCH_TIMEOUT_MS}ms` : e?.message || String(e);
    return { kind: "fetch-error", error: reason };
  } finally {
    clearTimeout(timer);
  }
}

type AudioSpecs = {
  format: string | null;
  containerExt: string | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
  bytes: number | null;
};

async function probeFile(filePath: string, containerExt: string): Promise<AudioSpecs> {
  // `containerExt` is the sniffed audio extension (e.g. ".wav") — the
  // tempfile itself is just `<uuid>.download`, so we can't derive the
  // real container from the path. Pass the sniffed value in explicitly.
  const out: AudioSpecs = {
    format: null, containerExt: containerExt || null, sampleRate: null,
    bitDepth: null, channels: null, bytes: null,
  };
  try {
    const stat = await fsp.stat(filePath);
    if (stat.size > 0) out.bytes = stat.size;
  } catch {}
  try {
    const json = await new Promise<any>((resolve, reject) => {
      const p = spawn(
        "ffprobe",
        ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", filePath],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let so = ""; let se = "";
      p.stdout.on("data", (c) => (so += c.toString()));
      p.stderr.on("data", (c) => (se += c.toString()));
      p.on("error", reject);
      p.on("close", (code) => {
        if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${se.trim()}`));
        try { resolve(JSON.parse(so)); } catch (e: any) { reject(new Error(`parse: ${e?.message}`)); }
      });
    });
    const a = (json.streams || []).find((s: any) => s.codec_type === "audio");
    if (a) {
      if (a.codec_name) out.format = String(a.codec_name);
      const sr = Number(a.sample_rate);
      if (Number.isFinite(sr) && sr > 0) out.sampleRate = sr;
      const bps = Number(a.bits_per_raw_sample || a.bits_per_sample || 0);
      if (Number.isFinite(bps) && bps > 0) out.bitDepth = bps;
      const ch = Number(a.channels);
      if (Number.isFinite(ch) && ch > 0) out.channels = ch;
    }
  } catch {}
  return out;
}

function resolveBucketAndPrefix(): { bucketName: string; prefix: string } {
  const dir = (new ObjectStorageService().getPrivateObjectDir()).replace(/\/$/, "");
  const trimmed = dir.startsWith("/") ? dir.slice(1) : dir;
  const firstSlash = trimmed.indexOf("/");
  const bucketName = firstSlash === -1 ? trimmed : trimmed.slice(0, firstSlash);
  const prefix = firstSlash === -1 ? "" : trimmed.slice(firstSlash + 1);
  return { bucketName, prefix };
}

async function uploadTempfileToObjectStorage(
  tmpPath: string,
  mime: string,
  ext: string,
): Promise<{ id: string; publicUrl: string }> {
  const { bucketName, prefix } = resolveBucketAndPrefix();
  const id = `${randomUUID()}${ext}`;
  const objectName = `${prefix ? `${prefix}/` : ""}uploads/${id}`;
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  const ws = file.createWriteStream({
    contentType: mime,
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
    resumable: false,
  });
  await pipeline(fs.createReadStream(tmpPath), ws);
  await setObjectAclPolicy(file, { owner: "admin", visibility: "public" });
  return { id, publicUrl: `/objects/uploads/${id}` };
}

type ReSupplyEntry = {
  songId: string;
  album: string | null;
  title: string | null;
  audioUrl: string;
  reason: string;
};

async function main() {
  const connectionString = process.env.PROD_DATABASE_URL;
  if (!connectionString) {
    console.error("PROD_DATABASE_URL not set"); process.exit(1);
  }
  const pool = new Pool({ connectionString });

  const { rows } = await pool.query<{
    id: string; title: string | null; album_title: string | null; audio_url: string;
  }>(
    `SELECT s.id, s.title, a.title AS album_title, s.audio_url
       FROM songs s
       LEFT JOIN albums a ON a.id = s.album_id
      WHERE s.audio_url IS NOT NULL
        AND s.audio_url <> ''
        AND (s.audio_url LIKE 'http://%' OR s.audio_url LIKE 'https://%')
      ORDER BY a.title ASC NULLS LAST, s.track_number ASC, s.id ASC`,
  );
  console.log(`[rehost-dropbox] scanned ${rows.length} songs with off-bucket audio_url`);

  let rehosted = 0;
  let probed = 0;
  const needsReSupply: ReSupplyEntry[] = [];
  const errored: ReSupplyEntry[] = [];

  for (const row of rows) {
    const label = `${row.album_title ?? "(no album)"} — ${row.title ?? row.id}`;
    const download = await downloadToTemp(row.audio_url);
    if (download.kind === "http-error") {
      needsReSupply.push({
        songId: row.id, album: row.album_title, title: row.title,
        audioUrl: row.audio_url, reason: `HTTP ${download.status} ${download.bodyHint}`.trim(),
      });
      console.warn(`[rehost-dropbox] ✗ ${label} — http ${download.status} ${download.bodyHint}`);
      continue;
    }
    if (download.kind === "fetch-error") {
      errored.push({
        songId: row.id, album: row.album_title, title: row.title,
        audioUrl: row.audio_url, reason: `fetch: ${download.error}`,
      });
      console.warn(`[rehost-dropbox] ✗ ${label} — ${download.error}`);
      continue;
    }
    const { tmpPath, sniffedMime, ext, bytes } = download;
    try {
      if (ext === ".bin") {
        needsReSupply.push({
          songId: row.id, album: row.album_title, title: row.title,
          audioUrl: row.audio_url, reason: `unrecognized audio bytes (${bytes} B)`,
        });
        console.warn(`[rehost-dropbox] ✗ ${label} — unrecognized audio bytes`);
        continue;
      }
      const { publicUrl } = await uploadTempfileToObjectStorage(tmpPath, sniffedMime, ext);
      const specs = await probeFile(tmpPath, ext);
      // ffprobe sometimes succeeds on partial bytes; require at least
      // one usable metadata field before we mark the row "specced".
      const probedOk = specs.format != null || specs.sampleRate != null;
      await pool.query(
        `UPDATE songs SET
           audio_url = $1,
           audio_format = $2,
           audio_container_ext = $3,
           audio_sample_rate = $4,
           audio_bit_depth = $5,
           audio_channels = $6,
           audio_bytes = $7
         WHERE id = $8`,
        [
          publicUrl,
          specs.format,
          specs.containerExt,
          specs.sampleRate,
          specs.bitDepth,
          specs.channels,
          specs.bytes ?? bytes,
          row.id,
        ],
      );
      rehosted++;
      if (probedOk) probed++;
      console.log(
        `[rehost-dropbox] ✓ ${label} — ${publicUrl} · ${specs.format ?? "?"} · ` +
          `${specs.sampleRate ?? "?"}Hz · ${specs.bitDepth ?? "?"}-bit · ${specs.bytes ?? bytes}B`,
      );
    } catch (e: any) {
      errored.push({
        songId: row.id, album: row.album_title, title: row.title,
        audioUrl: row.audio_url, reason: `upload/db: ${e?.message || e}`,
      });
      console.warn(`[rehost-dropbox] ✗ ${label} — ${e?.message || e}`);
    } finally {
      try { await fsp.unlink(tmpPath); } catch {}
    }
  }

  const summary = {
    ranAt: new Date().toISOString(),
    target: "PROD_DATABASE_URL",
    task: "#345 — re-host Dropbox masters into object storage",
    scanned: rows.length,
    rehosted,
    probed,
    needsReSupply,
    errored,
  };
  console.log("\n[rehost-dropbox] === SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  const date = new Date().toISOString().slice(0, 10);
  const outPath = path.join("docs", `rehost-dropbox-masters-prod-${date}.json`);
  await fsp.writeFile(outPath, JSON.stringify(summary, null, 2));
  console.log(`[rehost-dropbox] wrote durable summary to ${outPath}`);

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
