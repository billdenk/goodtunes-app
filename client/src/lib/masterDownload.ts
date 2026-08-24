// Task #3287 — shared toast copy for a failed per-track master download.
// The server's masters download route replies with reason-coded JSON
// (401/403/404 no_master|missing_object/422 external — see
// server/mastersHealth.ts MASTER_FAILURE_MESSAGES); fetchBlob surfaces that
// message on a FetchBlobError. Every per-track download surface (View
// Masters dialog, Digital tab row, inline audio control) must route its
// catch through this helper so failures self-diagnose instead of a bare
// "Download failed".
import { FetchBlobError, authHeaders } from "@/lib/queryClient";

// Task #3335 — per-track downloads mirror the zip's PROVEN handoff: an
// authed POST mints a short-lived signed link (reason-coded failures —
// no_master / external / missing_object — surface here as FetchBlobError),
// then a plain anchor navigation lets the browser's own download manager
// stream the file straight to disk. The old fetch()-into-Blob path buffered
// multi-hundred-MB WAVs in JS memory and was aborted by the prod edge
// proxy → the bare "Download failed." toast.
export async function downloadMasterTrack(albumId: string, songId: string): Promise<void> {
  const res = await fetch(`/api/admin/albums/${albumId}/masters/${songId}/download-link`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const text = await res.text();
      try {
        message = JSON.parse(text).message ?? text ?? message;
      } catch {
        message = text || message;
      }
    } catch {}
    throw new FetchBlobError(res.status, message);
  }
  const { url } = (await res.json()) as { url: string };
  const a = document.createElement("a");
  a.href = url;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function masterDownloadErrorMessage(e: unknown): string {
  if (e instanceof FetchBlobError) {
    if (e.status === 401) return "Your session expired — sign in again and retry.";
    if (e.status === 403) return "Your account doesn't have access to this album's masters.";
    return e.message || "Download failed.";
  }
  return (e as any)?.message ?? "Download failed — check your connection and retry.";
}
