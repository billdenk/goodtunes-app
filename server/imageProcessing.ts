// Shared image dimension-sniffing + bounded rasterization.
//
// Two jobs back onto this module:
//
//   1. The admin upload pipeline (server/routes.ts) calls
//      `makeDisplayDerivative` so every new raster upload keeps the
//      full-resolution original AND gets a downsized (~1500px) display
//      derivative that gets served everywhere automatically. Smaller bytes
//      on the wire, and — critically — nothing huge ever reaches the
//      GoodDeed renderers in the first place.
//
//   2. The GoodDeed share-card (server/certOgImage.ts) and cert PDF
//      (server/goodDeedPrintTemplate.ts) renderers call
//      `safeRasterForRender` before they ever decode/embed album art, so a
//      legacy oversized original (e.g. Daniel Lew "Destiny", which OOM-
//      crashed prod cert rendering) is either downscaled to a safe size or
//      skipped entirely — never decoded at full resolution. The renderer
//      draws its gradient/grey fallback when this returns null.
//
// We deliberately reuse @napi-rs/canvas (already a dependency via
// vendorColorScrape, already externalized in script/build.ts) so this adds
// no new native build dependency.

// Long edge of the served display derivative. 1500px covers a full-width
// album cover at 3× DPR on the ~440px mobile column with headroom; the fan
// zoom lightbox pulls the full-res original for crisp close-ups.
export const DISPLAY_MAX_EDGE = 1500;

// Long edge the GoodDeed renderers downscale legacy art to. The cert prints
// the cover at ~7.5"; 1500px ≈ 200dpi, which is plenty for a framed cert and
// keeps the embedded image small.
export const RENDER_MAX_EDGE = 1500;

// Upload-time decode ceiling. Above this we refuse to decode (store the
// original untouched, no derivative) so a pathological "pixel bomb" upload
// can't OOM the request handler. 64MP comfortably covers real print art
// (a 6000×6000 cover is 36MP) while rejecting absurd inputs. This is still
// MORE conservative than the status quo — maskToVinylDisc already decodes
// uploads with no cap at all.
const MAX_UPLOAD_DECODE_PIXELS = 64_000_000;

// Render-time decode ceiling. The renderers normally see only the ≤1500px
// display derivative, so this only bounds legacy un-backfilled art. Kept
// lower than the upload cap because cert batches can render several pages in
// flight at once. Above this → memory-safe downscale (the crash fix); below
// → cheap canvas downscale.
const MAX_RENDER_DECODE_PIXELS = 24_000_000;

// Hard ceiling for the memory-safe (libvips shrink-on-load) path. Inputs
// ABOVE the cheap canvas ceilings but at/below this are downscaled via sharp
// without ever materializing the full decoded raster (e.g. Daniel Lew
// "Destiny" is 13,333×13,333 ≈ 178MP — full RGBA would be ~712MB and OOM the
// worker; libvips shrinks it on load, peaking ~150MB). 300MP comfortably
// covers the largest real raster art (a max-dimension 16,383² WebP is
// ~268MP) while still refusing a pathological pixel-bomb.
export const MAX_SAFE_DOWNSCALE_PIXELS = 300_000_000;

export type ImageFormat = "png" | "jpeg" | "gif" | "webp" | "avif";

// Mime types we can decode + re-encode for a display derivative. AVIF is
// intentionally excluded from derivative generation (napi avif encode is
// slow and album-art AVIF is vanishingly rare) but is still a recognized
// raster format for sniffing/rendering.
const DERIVATIVE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isProcessableImage(mime: string): boolean {
  return DERIVATIVE_MIMES.has(mime);
}

// Identify the container format from magic bytes (independent of any
// claimed mime). Returns null for anything we don't recognize.
export function magicFormat(buf: Buffer): ImageFormat | null {
  if (buf.length < 16) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "png";
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  // GIF: "GIF8"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return "gif";
  }
  // RIFF....WEBP / AVIF (ISOBMFF "ftyp" with avif/avis brand)
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "webp";
  }
  // AVIF: bytes 4-7 "ftyp", brand at 8-11 contains "avif"/"avis".
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") return "avif";
  }
  return null;
}

// Read pixel dimensions WITHOUT fully decoding the raster — just enough of
// the header to enforce a size cap before we ever hand bytes to a decoder.
// Returns null when the format is unknown or the header is truncated/odd
// (AVIF dimensions live in a nested ISOBMFF box we don't parse — callers
// treat null as "can't verify → don't decode").
export function sniffImageDimensions(
  buf: Buffer,
): { width: number; height: number } | null {
  const fmt = magicFormat(buf);
  try {
    if (fmt === "png") {
      // IHDR is the first chunk: width @16, height @20 (big-endian).
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    if (fmt === "gif") {
      const width = buf.readUInt16LE(6);
      const height = buf.readUInt16LE(8);
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    if (fmt === "jpeg") {
      let off = 2;
      while (off + 9 < buf.length) {
        if (buf[off] !== 0xff) {
          off++;
          continue;
        }
        const marker = buf[off + 1];
        // Standalone markers (no length payload).
        if (
          marker === 0xd8 || marker === 0xd9 || marker === 0x01 ||
          (marker >= 0xd0 && marker <= 0xd7)
        ) {
          off += 2;
          continue;
        }
        const len = buf.readUInt16BE(off + 2);
        // SOF0-SOF15 carry the frame dimensions; skip DHT(C4)/JPG(C8)/DAC(CC).
        if (
          marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
        ) {
          const height = buf.readUInt16BE(off + 5);
          const width = buf.readUInt16BE(off + 7);
          if (width > 0 && height > 0) return { width, height };
          return null;
        }
        if (len < 2) return null;
        off += 2 + len;
      }
      return null;
    }
    if (fmt === "webp") {
      const fourcc = buf.toString("ascii", 12, 16);
      if (fourcc === "VP8 ") {
        // Lossy: 14-bit dims after the 3-byte start code at offset 26.
        const width = buf.readUInt16LE(26) & 0x3fff;
        const height = buf.readUInt16LE(28) & 0x3fff;
        if (width > 0 && height > 0) return { width, height };
        return null;
      }
      if (fourcc === "VP8L") {
        // Lossless: 14-bit-1 dims packed across 4 bytes after the 0x2f sig.
        if (buf[20] !== 0x2f) return null;
        const b0 = buf[21];
        const b1 = buf[22];
        const b2 = buf[23];
        const b3 = buf[24];
        const width = 1 + (((b1 & 0x3f) << 8) | b0);
        const height =
          1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
        return { width, height };
      }
      if (fourcc === "VP8X") {
        // Extended: 24-bit-1 dims (little-endian) at offsets 24 / 27.
        const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
        const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
        return { width, height };
      }
      return null;
    }
  } catch {
    return null;
  }
  return null;
}

type OutFormat = "png" | "jpeg" | "webp";

function outFormatForMime(mime: string): OutFormat {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpeg";
}

function mimeForOutFormat(fmt: OutFormat): string {
  if (fmt === "png") return "image/png";
  if (fmt === "webp") return "image/webp";
  return "image/jpeg";
}

let sharpConfigured = false;
async function loadSharp() {
  const sharp = (await import("sharp")).default;
  if (!sharpConfigured) {
    // Bound libvips memory for our one-image-at-a-time use: no operation
    // cache and a single worker thread, so a huge source can't fan out into
    // many full-width scanline buffers across threads.
    sharp.cache(false);
    sharp.concurrency(1);
    sharpConfigured = true;
  }
  return sharp;
}

// Memory-safe downscale for rasters too large for the cheap @napi-rs/canvas
// path. libvips shrinks WebP/JPEG on load and streams PNG through a
// demand-driven pipeline, so peak memory tracks the OUTPUT size, not the
// (potentially ~178MP) source — no full decoded buffer is ever materialized.
// Returns encoded bytes in `outFormat`, or null when the source is beyond
// MAX_SAFE_DOWNSCALE_PIXELS / unreadable.
async function downscaleHugeRaster(
  buf: Buffer,
  outFormat: OutFormat,
  maxEdge: number,
): Promise<Buffer | null> {
  try {
    const sharp = await loadSharp();
    let pipeline = sharp(buf, {
      limitInputPixels: MAX_SAFE_DOWNSCALE_PIXELS,
      failOn: "none",
    }).resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    });
    if (outFormat === "png") pipeline = pipeline.png();
    else if (outFormat === "webp") pipeline = pipeline.webp({ quality: 82 });
    else pipeline = pipeline.jpeg({ quality: 82 });
    return await pipeline.toBuffer();
  } catch {
    return null;
  }
}

// Result of asking for a display derivative. The three outcomes exist so a
// caller can tell a benign "nothing to do, the original is fine as-is" apart
// from a dangerous "this is an oversized raster we will NOT keep raw":
//   - "derivative": produced a downsized display image; serve it and preserve
//     the source at the ".orig" sibling.
//   - "passthrough": store/keep the original unchanged — a non-derivable mime
//     (gif/avif/pdf/audio/…), a header we couldn't verify, or art already
//     ≤ DISPLAY_MAX_EDGE on the long edge.
//   - "reject": a PROCESSABLE raster that is oversized but we cannot safely
//     shrink — beyond MAX_SAFE_DOWNSCALE_PIXELS, or one that neither decode
//     path could handle. Callers MUST NOT store/serve the raw original here
//     (uploads reject the request; the backfill marks a blocking error).
//     Serving the raw huge bytes is exactly what OOM-crashed mobile WebKit.
export type DisplayDerivative = { buffer: Buffer; mime: string };
export type DerivativeResult =
  | { kind: "derivative"; derivative: DisplayDerivative }
  | { kind: "passthrough" }
  | { kind: "reject"; reason: string };

// Thrown by the upload pipeline when art is too large to process safely, so
// the raw original is never persisted at its canonical /objects/uploads URL.
export class ImageTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageTooLargeError";
  }
}

// Decide how to handle an uploaded raster (see DerivativeResult). Inputs
// at/below MAX_UPLOAD_DECODE_PIXELS take the cheap @napi-rs/canvas full-decode
// path; larger-but-in-cap inputs route through the libvips shrink-on-load
// path. An oversized image is NEVER returned as "passthrough" — it's either
// downscaled or rejected, so a huge original can't slip through served raw.
export async function makeDisplayDerivative(
  buf: Buffer,
  mime: string,
): Promise<DerivativeResult> {
  if (!isProcessableImage(mime)) return { kind: "passthrough" };
  const dims = sniffImageDimensions(buf);
  if (!dims) return { kind: "passthrough" };
  const longEdge = Math.max(dims.width, dims.height);
  if (longEdge <= DISPLAY_MAX_EDGE) return { kind: "passthrough" };
  const pixels = dims.width * dims.height;
  const outFormat = outFormatForMime(mime);
  // Beyond the memory-safe ceiling: refuse rather than risk an OOM — and
  // never fall back to storing the raw original.
  if (pixels > MAX_SAFE_DOWNSCALE_PIXELS) {
    return {
      kind: "reject",
      reason: `${dims.width}×${dims.height} (${pixels}px) exceeds the ${MAX_SAFE_DOWNSCALE_PIXELS}px safe-downscale ceiling`,
    };
  }
  const ok = (buffer: Buffer, m: string): DerivativeResult => ({
    kind: "derivative",
    derivative: { buffer, mime: m },
  });
  // Above the cheap canvas ceiling → memory-safe libvips shrink-on-load.
  if (pixels > MAX_UPLOAD_DECODE_PIXELS) {
    const out = await downscaleHugeRaster(buf, outFormat, DISPLAY_MAX_EDGE);
    if (out) return ok(out, mimeForOutFormat(outFormat));
    return {
      kind: "reject",
      reason: `libvips could not downscale ${dims.width}×${dims.height}`,
    };
  }
  // In-cap oversized: cheap @napi-rs/canvas decode.
  try {
    const { loadImage, createCanvas } = await import("@napi-rs/canvas");
    const img = await loadImage(buf);
    const scale = DISPLAY_MAX_EDGE / Math.max(img.width, img.height);
    if (scale > 0 && scale < 1) {
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img as any, 0, 0, w, h);
      if (mime === "image/png") return ok(await canvas.encode("png"), "image/png");
      if (mime === "image/webp") return ok(await canvas.encode("webp", 82), "image/webp");
      return ok(await canvas.encode("jpeg", 82), "image/jpeg");
    }
  } catch {
    // fall through to the libvips fallback below
  }
  // Canvas couldn't handle it (decode quirk / odd scale): try the libvips
  // path before giving up, so an oversized image still downscales rather than
  // being stored raw. Only reject if BOTH paths fail.
  const out = await downscaleHugeRaster(buf, outFormat, DISPLAY_MAX_EDGE);
  if (out) return ok(out, mimeForOutFormat(outFormat));
  return {
    kind: "reject",
    reason: `could not decode oversized ${dims.width}×${dims.height} image`,
  };
}

// Return a buffer that's safe to hand to a renderer (PDFKit `doc.image` or
// @napi-rs/canvas `loadImage`): always PNG or JPEG bytes, always bounded to
// `maxEdge` on the long side. Returns null when the source is too large to
// decode safely or is an unrecognized/unverifiable format — the caller then
// draws its own fallback instead of crashing.
export async function safeRasterForRender(
  buf: Buffer,
  maxEdge: number = RENDER_MAX_EDGE,
): Promise<Buffer | null> {
  const dims = sniffImageDimensions(buf);
  if (!dims) return null;
  const fmt = magicFormat(buf);
  const longEdge = Math.max(dims.width, dims.height);
  // Fast path: already small AND directly embeddable by PDFKit → as-is.
  if (longEdge <= maxEdge && (fmt === "png" || fmt === "jpeg")) return buf;
  const pixels = dims.width * dims.height;
  // Above the cheap canvas ceiling: route through the memory-safe libvips
  // shrink-on-load path (PNG out keeps alpha + is always PDFKit-safe) so a
  // legacy un-backfilled oversized original downscales rather than OOM-ing.
  // Beyond the hard cap we still let the caller draw its fallback.
  if (pixels > MAX_RENDER_DECODE_PIXELS) {
    if (pixels > MAX_SAFE_DOWNSCALE_PIXELS) return null;
    return await downscaleHugeRaster(buf, "png", maxEdge);
  }
  try {
    const { loadImage, createCanvas } = await import("@napi-rs/canvas");
    const img = await loadImage(buf);
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img as any, 0, 0, w, h);
    // PNG keeps alpha (logos/transparent art) and is always PDFKit-safe.
    return await canvas.encode("png");
  } catch {
    return null;
  }
}

// Map a display-derivative object id/url to its full-resolution original
// sibling. We store the original at "<uuid>.orig<ext>" alongside the
// display object at "<uuid><ext>", so the fan zoom lightbox and any future
// high-DPI consumer can request the original and fall back to the display
// version on 404. Returns the input unchanged when it isn't an uploads URL
// or has no extension to splice into.
export function originalSiblingId(id: string): string {
  const dot = id.lastIndexOf(".");
  if (dot <= 0) return id;
  return `${id.slice(0, dot)}.orig${id.slice(dot)}`;
}

export function originalUrlForUpload(url: string): string | null {
  const m = /^\/objects\/uploads\/([a-zA-Z0-9._-]+)$/.exec(url);
  if (!m) return null;
  if (m[1].includes(".orig.")) return url; // already the original
  return `/objects/uploads/${originalSiblingId(m[1])}`;
}
