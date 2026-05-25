/**
 * Task #333 — one-shot prod run of the master-specs backfill.
 *
 * Mirrors POST /api/admin/audio-specs-backfill (Task #331) but speaks
 * directly to PROD_DATABASE_URL so we don't need a deployed-app round
 * trip + admin bearer. Object storage is the same bucket for dev and
 * prod (REPL_ID-keyed), so probes resolve the real bytes either way.
 *
 * Run:   PROD_DATABASE_URL=... npx tsx scripts/backfill-audio-specs-prod.ts
 *
 * Writes a JSON summary (including the unreadable list — the artists
 * we need to re-supply masters for) to
 *   docs/master-specs-backfill-prod-<YYYY-MM-DD>.json
 */
import { Pool } from "pg";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ObjectStorageService } from "../server/replit_integrations/object_storage/objectStorage";

type AudioSpecs = {
  format: string | null;
  containerExt: string | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
  bytes: number | null;
  duration: number | null;
};

type ProbeOutcome =
  | { kind: "probed"; specs: AudioSpecs }
  | { kind: "download-error"; error: string };

const objectStorage = new ObjectStorageService();

async function probeFile(filePath: string): Promise<AudioSpecs> {
  const out: AudioSpecs = {
    format: null, containerExt: null, sampleRate: null, bitDepth: null,
    channels: null, bytes: null, duration: null,
  };
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext) out.containerExt = ext;
  } catch {}
  try {
    const stat = await fsp.stat(filePath);
    if (stat.size > 0) out.bytes = stat.size;
  } catch {}
  try {
    const json = await new Promise<any>((resolve, reject) => {
      const p = spawn("ffprobe", [
        "-v", "error", "-print_format", "json",
        "-show_streams", "-show_format", filePath,
      ], { stdio: ["ignore", "pipe", "pipe"] });
      let so = "", se = "";
      p.stdout.on("data", (c) => (so += c.toString()));
      p.stderr.on("data", (c) => (se += c.toString()));
      p.on("error", reject);
      p.on("close", (code) => {
        if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${se.trim()}`));
        try { resolve(JSON.parse(so)); } catch (e: any) { reject(new Error(`parse: ${e?.message}`)); }
      });
    });
    const streams: any[] = json.streams || [];
    const a = streams.find((s) => s.codec_type === "audio");
    if (a) {
      if (a.codec_name) out.format = String(a.codec_name);
      const sr = Number(a.sample_rate);
      if (Number.isFinite(sr) && sr > 0) out.sampleRate = sr;
      const bps = Number(a.bits_per_raw_sample || a.bits_per_sample || 0);
      if (Number.isFinite(bps) && bps > 0) out.bitDepth = bps;
      const ch = Number(a.channels);
      if (Number.isFinite(ch) && ch > 0) out.channels = ch;
    }
    const dur = Number(json.format?.duration);
    if (Number.isFinite(dur) && dur > 0) out.duration = Math.round(dur);
  } catch {}
  return out;
}

async function probeUrl(url: string): Promise<ProbeOutcome> {
  const ext = (url.match(/\.(\w+)(?:\?|$)/)?.[0] || ".bin").toLowerCase();
  const tmp = path.join(os.tmpdir(), `${randomUUID()}${ext}`);
  try {
    const file = await objectStorage.getObjectEntityFile(url);
    const [buf] = await file.download();
    await fsp.writeFile(tmp, buf);
    const specs = await probeFile(tmp);
    return { kind: "probed", specs };
  } catch (err: any) {
    return { kind: "download-error", error: err?.message || String(err) };
  } finally {
    try { await fsp.unlink(tmp); } catch {}
  }
}

async function main() {
  const connectionString = process.env.PROD_DATABASE_URL;
  if (!connectionString) {
    console.error("PROD_DATABASE_URL not set"); process.exit(1);
  }
  const pool = new Pool({ connectionString });
  const { rows } = await pool.query<{
    id: string; title: string | null; album_title: string | null;
    audio_url: string; audio_source_url: string | null;
  }>(
    `SELECT s.id, s.title, a.title AS album_title,
            s.audio_url, s.audio_source_url
       FROM songs s
       LEFT JOIN albums a ON a.id = s.album_id
      WHERE s.audio_url IS NOT NULL
        AND s.audio_url <> ''
        AND s.audio_url LIKE '/objects/%'
        AND (
          s.audio_format IS NULL
          OR s.audio_sample_rate IS NULL
          OR s.audio_bytes IS NULL
          OR (s.audio_source_url IS NOT NULL AND (
            s.audio_source_format IS NULL
            OR s.audio_source_sample_rate IS NULL
            OR s.audio_source_bytes IS NULL
          ))
        )
      ORDER BY a.title ASC NULLS LAST, s.track_number ASC, s.id ASC`,
  );
  console.log(`[backfill-prod] scanned ${rows.length} songs needing specs`);
  let probedOk = 0;
  const unreadable: Array<{ songId: string; album: string | null; title: string | null }> = [];
  const errored: Array<{ songId: string; album: string | null; title: string | null; error: string }> = [];

  for (const row of rows) {
    const label = `${row.album_title ?? "(no album)"} — ${row.title ?? row.id}`;
    try {
      const served = await probeUrl(row.audio_url);
      const source = row.audio_source_url ? await probeUrl(row.audio_source_url) : null;
      if (served.kind === "download-error") {
        errored.push({ songId: row.id, album: row.album_title, title: row.title, error: served.error });
        console.warn(`[backfill-prod] ✗ ${label} — download failed: ${served.error}`);
        continue;
      }
      const s = served.specs;
      const sets: string[] = [];
      const vals: any[] = [];
      const push = (col: string, v: any) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
      push("audio_format", s.format);
      push("audio_container_ext", s.containerExt);
      push("audio_sample_rate", s.sampleRate);
      push("audio_bit_depth", s.bitDepth);
      push("audio_channels", s.channels);
      push("audio_bytes", s.bytes);
      if (source && source.kind === "probed") {
        const ss = source.specs;
        push("audio_source_format", ss.format);
        push("audio_source_container_ext", ss.containerExt);
        push("audio_source_sample_rate", ss.sampleRate);
        push("audio_source_bit_depth", ss.bitDepth);
        push("audio_source_channels", ss.channels);
        push("audio_source_bytes", ss.bytes);
      } else if (source && source.kind === "download-error") {
        console.warn(`[backfill-prod] · ${label} — source download failed: ${source.error}`);
      }
      vals.push(row.id);
      await pool.query(
        `UPDATE songs SET ${sets.join(", ")} WHERE id = $${vals.length}`,
        vals,
      );
      if (s.format == null && s.sampleRate == null && s.bytes == null) {
        unreadable.push({ songId: row.id, album: row.album_title, title: row.title });
        console.warn(`[backfill-prod] · ${label} — probe returned no usable fields`);
      } else {
        probedOk++;
        console.log(`[backfill-prod] ✓ ${label} — ${s.format ?? "?"} · ${s.sampleRate ?? "?"}Hz · ${s.bitDepth ?? "?"}-bit · ${s.bytes ?? "?"}B`);
      }
    } catch (err: any) {
      errored.push({ songId: row.id, album: row.album_title, title: row.title, error: err?.message || String(err) });
      console.warn(`[backfill-prod] ✗ ${label} — ${err?.message || err}`);
    }
  }

  const summary = {
    ranAt: new Date().toISOString(),
    target: "PROD_DATABASE_URL",
    scanned: rows.length,
    probedOk,
    unreadable,
    errored,
  };
  console.log("\n[backfill-prod] === SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  const date = new Date().toISOString().slice(0, 10);
  const outPath = path.join("docs", `master-specs-backfill-prod-${date}.json`);
  await fsp.writeFile(outPath, JSON.stringify(summary, null, 2));
  console.log(`[backfill-prod] wrote durable summary to ${outPath}`);

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
