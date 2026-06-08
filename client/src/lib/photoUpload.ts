// Shared helpers for the profile-photo upload flow used by both the admin
// Edit Profile dialog and the fan-player profile editor.
//
// Two jobs:
//  1. `fileToUploadDataUrl` — downscale/re-encode a picked image client-side so
//     the base64 PUT body to `/api/me/photo` stays well under the edge proxy's
//     request-body limit. Ordinary phone-camera photos are multiple MB and the
//     proxy rejects the large PUT with a raw `403 Forbidden` HTML page before it
//     ever reaches Express — shrinking the payload prevents that 403 entirely.
//  2. `friendlyPhotoError` — map any upload/remove failure to short, on-brand
//     copy. Never surfaces raw HTML, a doctype, or a bare `NNN:` status prefix.

export const PHOTO_ALLOWED_MIMES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];

// HEIC/HEIF — what an iPhone hands the picker from Files or the share sheet.
// The server allowlist still rejects these, so they're NOT added to
// PHOTO_ALLOWED_MIMES; instead `fileToUploadDataUrl` transcodes them to JPEG
// client-side before upload (canvas decodes HEIC natively on iOS Safari;
// elsewhere a lazy-loaded decoder handles it).
export const PHOTO_TRANSCODE_MIMES = [
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * True when a picked file is a HEIC/HEIF. iOS often reports the MIME type, but
 * Files / share-sheet handoffs frequently arrive with an empty or generic
 * type, so we fall back to the filename extension.
 */
export function isHeicFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (PHOTO_TRANSCODE_MIMES.includes(type)) return true;
  return /\.(heic|heif)$/i.test(file.name || "");
}

/**
 * True when we can produce a server-acceptable image from this file — either
 * it's already in the upload allowlist (PNG/JPEG/WEBP/GIF) or it's a HEIC/HEIF
 * we can transcode to JPEG. Genuinely unsupported types (PDF, TIFF, etc.)
 * return false so the callers can reject them with a friendly message.
 */
export function isSupportedPhotoFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (PHOTO_ALLOWED_MIMES.includes(type)) return true;
  return isHeicFile(file);
}

// Avatars render small; capping the longest edge at 1024px keeps quality high
// while collapsing a 4–12MB phone photo to a few hundred KB — comfortably under
// any MB-scale proxy body limit.
const MAX_EDGE = 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onload = () => {
      const out = String(reader.result || "");
      if (!out) reject(new Error("read-failed"));
      else resolve(out);
    };
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode-failed"));
    img.src = src;
  });
}

/**
 * Decode a HEIC/HEIF blob to a JPEG blob using a lazily-loaded decoder. Only
 * reached when the browser's own image pipeline can't decode HEIC (i.e. not
 * iOS Safari, which decodes it natively). The decoder is dynamically imported
 * so its ~libheif payload stays out of the main bundle and only loads the
 * first time someone actually picks a HEIC.
 */
async function heicToJpegBlob(file: File): Promise<Blob> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(result) ? result[0] : result;
  if (!blob) throw new Error("heic-decode-failed");
  return blob;
}

/**
 * Turn a picked image File into a data URL suitable for the `/api/me/photo`
 * PUT, downscaling + re-encoding large rasters first. Animated GIFs are passed
 * through untouched (a canvas re-encode would flatten them to a single frame).
 * HEIC/HEIF (common from iPhones) is transcoded to JPEG so it clears the server
 * allowlist. For non-HEIC sources, any failure to decode/encode falls back to
 * the original file bytes so a valid image is never lost to the shrink step;
 * for HEIC we never fall back to the raw bytes (the server rejects HEIC), and
 * a decode failure propagates so the caller can show friendly copy.
 */
export async function fileToUploadDataUrl(file: File): Promise<string> {
  const type = (file.type || "").toLowerCase();

  // GIFs can be animated — re-encoding via canvas loses every frame but the
  // first. Leave them as-is (the 5MB client guard already bounds the size).
  if (type === "image/gif") return readFileAsDataUrl(file);

  const heic = isHeicFile(file);

  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(file);
    let img: HTMLImageElement;
    try {
      img = await loadImage(objectUrl);
    } catch (decodeErr) {
      // iOS Safari decodes HEIC natively, so the load above succeeds there.
      // Every other browser fails to decode HEIC — transcode it to a JPEG
      // blob first, then continue through the same downscale path below.
      if (heic) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        const jpegBlob = await heicToJpegBlob(file);
        objectUrl = URL.createObjectURL(jpegBlob);
        img = await loadImage(objectUrl);
      } else {
        throw decodeErr;
      }
    }
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) {
      if (heic) throw new Error("heic-decode-failed");
      return readFileAsDataUrl(file);
    }

    const longest = Math.max(width, height);
    const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      if (heic) throw new Error("heic-decode-failed");
      return readFileAsDataUrl(file);
    }
    ctx.drawImage(img, 0, 0, w, h);

    // Stay inside the server allowlist. Preserve transparency for PNG/WEBP
    // sources; everything else (incl. JPEG photos and transcoded HEIC)
    // re-encodes as JPEG, which is the smallest for photographic content.
    const outType =
      type === "image/png"
        ? "image/png"
        : type === "image/webp"
          ? "image/webp"
          : "image/jpeg";
    const quality = outType === "image/png" ? undefined : 0.85;
    const out = canvas.toDataURL(outType, quality);

    // Sanity: a broken/empty encode (or a browser that ignored the requested
    // type) should fall back to the original rather than send garbage. A HEIC
    // can't fall back (raw HEIC bytes are rejected server-side), so surface it.
    if (!out || out.length < 32 || !out.startsWith(`data:${outType}`)) {
      if (heic) throw new Error("heic-decode-failed");
      return readFileAsDataUrl(file);
    }
    return out;
  } catch (err) {
    // HEIC must never fall back to its raw bytes — the server allowlist rejects
    // HEIC, so that's just a dead 400. Let the failure propagate to the caller.
    if (heic) throw err;
    return readFileAsDataUrl(file);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Map an upload/remove failure to short, friendly, on-brand copy.
 *
 * `apiRequest` throws `Error("<status>: <message>")` where <message> is a clean
 * JSON `message` (HTML/doctype bodies are stripped upstream in queryClient), or
 * a bare `TypeError` ("Failed to fetch") when the request never reached a
 * server. We translate those into a human line and never echo the raw body or a
 * bare status code into the UI.
 */
export function friendlyPhotoError(
  err: unknown,
  mode: "upload" | "remove" = "upload",
): string {
  const generic =
    mode === "remove"
      ? "Couldn't remove that photo. Please try again."
      : "Couldn't upload that photo. Please try again.";

  const raw = (err instanceof Error ? err.message : String(err ?? "")).trim();
  if (!raw) return generic;

  const statusMatch = raw.match(/^(\d{3})\b/);
  const status = statusMatch ? Number(statusMatch[1]) : null;

  // No status prefix means the fetch threw before any response — a network /
  // offline failure.
  if (status === null) {
    if (/network|failed to fetch|load failed|fetch/i.test(raw)) {
      return "Couldn't reach the server. Check your connection and try again.";
    }
    return generic;
  }

  // Body after the "NNN: " prefix (already HTML-stripped by queryClient).
  const body = raw.replace(/^\d{3}:\s*/, "").trim();
  const looksLikeHtml = /^<|<!doctype|<html/i.test(body);

  // Too large — either the server's own 413 or the edge proxy's 403 on an
  // oversized body. With client-side downscaling this should be rare now.
  if (status === 413 || status === 403) {
    return mode === "remove"
      ? generic
      : "That photo's too large to upload. Try a smaller image.";
  }

  // Client-side validation errors (400/422) carry helpful, already-friendly
  // server copy (e.g. "Only PNG, JPEG, WEBP, or GIF data URLs are accepted").
  // Surface those, but never a doctype/HTML dump or an over-long blob.
  if (
    (status === 400 || status === 422) &&
    body &&
    !looksLikeHtml &&
    body.length <= 140
  ) {
    return body;
  }

  return generic;
}
