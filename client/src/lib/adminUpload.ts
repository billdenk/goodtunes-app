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
