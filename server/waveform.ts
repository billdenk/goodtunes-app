/**
 * Waveform extraction.
 *
 * Reads an audio file (Dropbox / HTTP(S) URL or a `/objects/uploads/<id>`
 * path) through ffmpeg, decodes to mono 8 kHz 16-bit PCM, and reduces the
 * sample stream to `BAR_COUNT` normalized peaks (0..1) — one number per
 * waveform bar. The result is a small JSON array we store on
 * `songs.waveform` and ship to the client to render the preview/scrubber
 * waveform.
 *
 * Same shape SoundCloud / Bandcamp / Apple's clip share use — small enough
 * (~200 floats, <1 KB after rounding) to send inline with the song row.
 */
import { spawn } from "node:child_process";
import type { Readable } from "node:stream";

export const BAR_COUNT = 200;
const SAMPLE_RATE = 8000;

/**
 * Run ffmpeg, capture raw PCM on stdout, reduce to `bars` peaks.
 * Accepts a URL/path string (ffmpeg fetches it) or a readable stream
 * (piped to ffmpeg's stdin via `-i pipe:0`).
 */
export function extractWaveform(
  input: string | Readable,
  bars: number = BAR_COUNT,
): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const inputArg = typeof input === "string" ? input : "pipe:0";
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-i",
      inputArg,
      "-ac",
      "1",
      "-ar",
      String(SAMPLE_RATE),
      "-f",
      "s16le",
      "-acodec",
      "pcm_s16le",
      "pipe:1",
    ];
    const ff = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      try {
        ff.kill("SIGKILL");
      } catch {}
      reject(err);
    };
    ff.stdout.on("data", (c: Buffer) => chunks.push(c));
    ff.stderr.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    ff.on("error", (err) => fail(err));
    ff.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        return fail(
          new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 500)}`),
        );
      }
      const buf = Buffer.concat(chunks);
      const samples = Math.floor(buf.length / 2);
      if (samples < bars) {
        return fail(new Error(`audio too short (${samples} samples)`));
      }
      // Bucket samples into `bars` windows and take the peak abs amplitude
      // of each window. Peak (not RMS) so quiet verses don't flatten the
      // waveform; matches how SoundCloud renders.
      const peaks: number[] = new Array(bars).fill(0);
      for (let i = 0; i < bars; i++) {
        const start = Math.floor((i * samples) / bars);
        const end = Math.floor(((i + 1) * samples) / bars);
        let max = 0;
        for (let j = start; j < end; j++) {
          const v = Math.abs(buf.readInt16LE(j * 2));
          if (v > max) max = v;
        }
        peaks[i] = max / 32768;
      }
      // Normalize so the loudest bar = 1.0, then round to 3 decimal places.
      // Keeps every track visually full-height regardless of mastering
      // level; the JSON stays tiny (~1 KB) when rounded.
      let peak = 0;
      for (const v of peaks) if (v > peak) peak = v;
      if (peak <= 0) return fail(new Error("silent track"));
      const out = peaks.map((v) => Number((v / peak).toFixed(3)));
      settled = true;
      resolve(out);
    });

    if (typeof input !== "string") {
      input.on("error", (err) => fail(err));
      input.pipe(ff.stdin).on("error", () => {
        /* ffmpeg may close stdin early once it has enough — ignore */
      });
    }
  });
}

/**
 * Convenience: given a song's `audioUrl` (Dropbox/HTTPS or
 * `/objects/uploads/<id>`), return the waveform peaks. Object-storage
 * paths are streamed through GCS instead of going back out to localhost.
 */
export async function waveformFromAudioUrl(audioUrl: string): Promise<number[]> {
  if (audioUrl.startsWith("/objects/")) {
    const { ObjectStorageService } = await import(
      "./replit_integrations/object_storage/objectStorage"
    );
    const svc = new ObjectStorageService();
    const file = await svc.getObjectEntityFile(audioUrl);
    return extractWaveform(file.createReadStream() as unknown as Readable);
  }
  return extractWaveform(audioUrl);
}
