// Server-rendered, irreversibly-blurred preview tiles for locked bonus media
// (album Videos posters + Photos). Non-owners must NEVER receive the original
// full-resolution poster/photo URL — those are publicly-fetchable
// `/objects/uploads/<id>` masters and a CSS blur is cosmetic only (Reader /
// view-source / DOM reveals the raw URL). Instead the fan payload points the
// poster/photo at GET /api/album-media/:kind/:id/preview, which streams a
// tiny, heavily-downscaled-then-blurred raster generated here. The blur is
// baked into the bytes, so there is no original to recover.
//
// This mirrors the Mux-only precedent for the video master (the raw MP4 never
// leaves as a file) and the SSRF-safe OG-image render in certOgImage.ts.

import type { Readable } from "stream";

// Output geometry. Video posters are 16:9, photos are square. We render at a
// deliberately tiny size and blur on top so even an attacker who pulls these
// bytes only ever gets a smear, never the original art.
const VIDEO_W = 64;
const VIDEO_H = 36;
const PHOTO_W = 48;
const PHOTO_H = 48;

// Brand navy (see replit.md / index.css) for the fallback tile when there's
// no source or the fetch/render fails.
const BRAND_BG = "#00062B";

let sharpConfigured = false;
async function loadSharp() {
  const sharp = (await import("sharp")).default;
  if (!sharpConfigured) {
    // Match the repo-wide sharp posture: no on-disk cache, single-threaded so
    // a burst of preview requests can't pin every core / OOM mobile WebKit's
    // upstream box. Idempotent — safe to call alongside imageProcessing's own.
    sharp.cache(false);
    sharp.concurrency(1);
    sharpConfigured = true;
  }
  return sharp;
}

// Block private / link-local / cloud-metadata hosts so an absolute source URL
// can never make the server reach internal infrastructure (SSRF). Loopback is
// intentionally allowed: in dev the app's own origin is localhost. Mirrors
// certOgImage.isBlockedHost.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h.endsWith(".internal")) return true;
  if (/^10\./.test(h)) return true; // private
  if (/^192\.168\./.test(h)) return true; // private
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true; // private
  if (/^169\.254\./.test(h)) return true; // link-local + cloud metadata
  if (/^fe80:/i.test(h) || /^fc/i.test(h) || /^fd/i.test(h)) return true; // IPv6 link-local / ULA
  return false;
}

function streamToBuffer(stream: Readable, maxBytes: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;
    const finish = (val: Buffer | null) => {
      if (done) return;
      done = true;
      try { stream.destroy(); } catch { /* noop */ }
      resolve(val);
    };
    stream.on("data", (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) return finish(null);
      chunks.push(Buffer.from(c));
    });
    stream.on("end", () => finish(Buffer.concat(chunks)));
    stream.on("error", () => finish(null));
  });
}

// Read the source bytes. `/objects/...` paths (every uploaded poster/photo)
// are read straight from object storage — no HTTP, no edge proxy, no SSRF
// surface. Absolute http(s) URLs (defensive; bonus media is normally an
// upload) are fetched with the redirect-refusing, size-capped, host-blocked
// guard.
async function fetchSourceBytes(sourceUrl: string): Promise<Buffer | null> {
  const MAX_BYTES = 24 * 1024 * 1024; // generous — sharp downscales anyway
  try {
    if (sourceUrl.startsWith("/objects/")) {
      const { ObjectStorageService } = await import(
        "./replit_integrations/object_storage/objectStorage"
      );
      const svc = new ObjectStorageService();
      const file = await svc.getObjectEntityFile(sourceUrl);
      return await streamToBuffer(file.createReadStream() as unknown as Readable, MAX_BYTES);
    }
    if (/^https?:\/\//i.test(sourceUrl)) {
      let url: URL;
      try { url = new URL(sourceUrl); } catch { return null; }
      if (isBlockedHost(url.hostname)) return null;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      try {
        const res = await fetch(url.toString(), { redirect: "error", signal: ctrl.signal });
        if (!res.ok) return null;
        const ct = res.headers.get("content-type") || "";
        if (!ct.startsWith("image/")) return null;
        const ab = await res.arrayBuffer();
        if (ab.byteLength === 0 || ab.byteLength > MAX_BYTES) return null;
        return Buffer.from(ab);
      } finally {
        clearTimeout(timer);
      }
    }
  } catch {
    // ObjectNotFound, network error, abort — fall through to the brand tile.
  }
  return null;
}

async function brandTile(kind: "video" | "photo"): Promise<Buffer> {
  const sharp = await loadSharp();
  const w = kind === "video" ? VIDEO_W : PHOTO_W;
  const h = kind === "video" ? VIDEO_H : PHOTO_H;
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: BRAND_BG,
    },
  })
    .webp({ quality: 50 })
    .toBuffer();
}

/**
 * Render the locked-state preview for a bonus video poster or photo: a tiny,
 * heavily-blurred WebP with no recoverable original. Always resolves to bytes
 * — falls back to a solid brand-navy tile when there's no source or the
 * render fails — so the route can hand a non-owner a safe rendition every
 * time without ever disclosing the master URL.
 */
export async function renderBonusMediaPreview(
  sourceUrl: string | null,
  kind: "video" | "photo",
): Promise<Buffer> {
  if (!sourceUrl) return brandTile(kind);
  const bytes = await fetchSourceBytes(sourceUrl);
  if (!bytes) return brandTile(kind);
  try {
    const sharp = await loadSharp();
    const w = kind === "video" ? VIDEO_W : PHOTO_W;
    const h = kind === "video" ? VIDEO_H : PHOTO_H;
    return await sharp(bytes, { failOn: "none" })
      .resize(w, h, { fit: "cover" })
      .blur(6)
      .modulate({ brightness: 0.82, saturation: 0.85 })
      .webp({ quality: 45 })
      .toBuffer();
  } catch {
    return brandTile(kind);
  }
}
