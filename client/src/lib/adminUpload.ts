// Shared client-side helper for the admin image-upload surfaces.
//
// Every admin surface that lets an operator drop in an image (album art,
// person/vendor/label photos, partner logos + covers, custom add-on art,
// pressing swatches) used to carry its own near-identical `uploadImageFile`:
// build a `FormData`, POST it to `/api/admin/upload` with the Bearer token, and
// surface `body.message || "Upload failed (NNN)"` straight into a toast. That
// leaked raw status strings / proxy HTML and sent the full-size file, risking
// the same edge-proxy 403 the profile-photo flow already solved.
//
// This module is the single source of truth: it downscales large rasters
// client-side (`downscaleImageFile`) and maps every failure through the shared
// `friendlyUploadError` mapper, so callers can keep showing `err.message`
// directly and get on-brand copy for free.

import { getAuthToken } from "@/lib/queryClient";
import { downscaleImageFile, friendlyUploadError } from "@/lib/photoUpload";

/**
 * POST an image to `/api/admin/upload`, downscaling large rasters first and
 * translating any failure into friendly copy. Returns the full server payload
 * (`url` plus optional `maskApplied` when `mask: "disc"` is requested for a
 * vinyl swatch crop).
 *
 * Thrown errors already carry friendly, on-brand messages — callers can render
 * `err.message` straight into a toast without re-mapping.
 */
export async function postAdminImage(
  file: File,
  opts?: { mask?: "disc"; noun?: string },
): Promise<{ url: string; maskApplied?: boolean }> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Sign out and back in — your session token is missing.");
  }

  const toSend = await downscaleImageFile(file);
  const fd = new FormData();
  fd.append("file", toSend);

  const qs = opts?.mask === "disc" ? "?mask=disc" : "";
  let res: Response;
  try {
    res = await fetch(`/api/admin/upload${qs}`, {
      method: "POST",
      body: fd,
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
  } catch (networkErr) {
    // Fetch threw before any response (offline / DNS / aborted).
    throw new Error(friendlyUploadError(networkErr, { noun: opts?.noun }));
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { message?: string });
    const message = typeof body?.message === "string" ? body.message : "";
    throw new Error(
      friendlyUploadError(`${res.status}: ${message}`, { noun: opts?.noun }),
    );
  }

  const { url, maskApplied } = (await res.json()) as {
    url: string;
    maskApplied?: boolean;
  };
  return { url, maskApplied };
}

/**
 * Convenience wrapper for the common case: upload an image and return just its
 * hosted `/objects/uploads/<id>` URL.
 */
export async function uploadImageFile(file: File): Promise<string> {
  const { url } = await postAdminImage(file);
  return url;
}

// Task #2115 — print templates (PDF / packaged art / ZIP) are often large
// and can't ride the image-only `/api/admin/upload` route. Stream them
// straight to Object Storage with the signed-PUT flow (sign → PUT bytes →
// finalize), mirroring the video upload path. Returns the hosted
// `/objects/uploads/<id>` URL.
const DOC_CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  zip: "application/zip",
  ai: "application/postscript",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  tif: "image/tiff",
  tiff: "image/tiff",
};

export const DOC_UPLOAD_ACCEPT = ".pdf,.zip,.ai,.png,.jpg,.jpeg,.tif,.tiff";

export async function uploadAdminDoc(file: File): Promise<string> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Sign out and back in — your session token is missing.");
  }
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const contentType = file.type || DOC_CONTENT_TYPES[ext];
  if (!contentType || !Object.values(DOC_CONTENT_TYPES).includes(contentType)) {
    throw new Error("Use a PDF, AI/EPS, ZIP, PNG, JPEG, or TIFF file.");
  }

  let signRes: Response;
  try {
    signRes = await fetch("/api/admin/upload-doc/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      credentials: "include",
      body: JSON.stringify({ contentType }),
    });
  } catch (networkErr) {
    throw new Error(friendlyUploadError(networkErr, { noun: "template" }));
  }
  if (!signRes.ok) {
    const body = await signRes.json().catch(() => ({}) as { message?: string });
    throw new Error(
      friendlyUploadError(`${signRes.status}: ${body?.message ?? ""}`, { noun: "template" }),
    );
  }
  const { uploadUrl, finalPath } = (await signRes.json()) as {
    uploadUrl: string;
    finalPath: string;
  };

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(friendlyUploadError(`${putRes.status}: upload failed`, { noun: "template" }));
  }

  const finRes = await fetch("/api/admin/upload-doc/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    credentials: "include",
    body: JSON.stringify({ finalPath }),
  });
  if (!finRes.ok) {
    const body = await finRes.json().catch(() => ({}) as { message?: string });
    throw new Error(
      friendlyUploadError(`${finRes.status}: ${body?.message ?? ""}`, { noun: "template" }),
    );
  }
  const { url } = (await finRes.json()) as { url: string };
  return url;
}
