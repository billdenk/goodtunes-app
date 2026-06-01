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
// flight at once. Above this → fallback (the crash fix); below → downscale.
const MAX_RENDER_DECODE_PIXELS = 24_000_000;

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

// Produce a downsized display derivative for an uploaded raster, or null
// when no derivative is warranted/safe:
//   - non-derivative mime (gif/avif/pdf/audio/…)         → null (store original)
//   - dimensions can't be verified                       → null
//   - already ≤ DISPLAY_MAX_EDGE on the long edge        → null
//   - so large it would risk OOM to even decode it       → null
// On success returns the encoded derivative + its mime (same format family
// as the source, so the served extension stays consistent).
export async function makeDisplayDerivative(
  buf: Buffer,
  mime: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!isProcessableImage(mime)) return null;
  const dims = sniffImageDimensions(buf);
  if (!dims) return null;
  const longEdge = Math.max(dims.width, dims.height);
  if (longEdge <= DISPLAY_MAX_EDGE) return null;
  if (dims.width * dims.height > MAX_UPLOAD_DECODE_PIXELS) return null;
  try {
    const { loadImage, createCanvas } = await import("@napi-rs/canvas");
    const img = await loadImage(buf);
    const scale = DISPLAY_MAX_EDGE / Math.max(img.width, img.height);
    if (!(scale > 0) || scale >= 1) return null;
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img as any, 0, 0, w, h);
    if (mime === "image/png") {
      return { buffer: await canvas.encode("png"), mime: "image/png" };
    }
    if (mime === "image/webp") {
      return { buffer: await canvas.encode("webp", 82), mime: "image/webp" };
    }
    return { buffer: await canvas.encode("jpeg", 82), mime: "image/jpeg" };
  } catch {
    return null;
  }
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
  // Too large to decode safely → let the caller fall back.
  if (dims.width * dims.height > MAX_RENDER_DECODE_PIXELS) return null;
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
