// Task #3287 — shared toast copy for a failed per-track master download.
// The server's masters download route replies with reason-coded JSON
// (401/403/404 no_master|missing_object/422 external — see
// server/mastersHealth.ts MASTER_FAILURE_MESSAGES); fetchBlob surfaces that
// message on a FetchBlobError. Every per-track download surface (View
// Masters dialog, Digital tab row, inline audio control) must route its
// catch through this helper so failures self-diagnose instead of a bare
// "Download failed".
import { FetchBlobError } from "@/lib/queryClient";

export function masterDownloadErrorMessage(e: unknown): string {
  if (e instanceof FetchBlobError) {
    if (e.status === 401) return "Your session expired — sign in again and retry.";
    if (e.status === 403) return "Your account doesn't have access to this album's masters.";
    return e.message || "Download failed.";
  }
  return (e as any)?.message ?? "Download failed — check your connection and retry.";
}
