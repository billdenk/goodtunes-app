// Thresholds for the auto-sync-lyrics "creeping toward timeout" alert.
//
// ElevenLabs Scribe v1 hard-caps Speech-to-Text at 120 s wall-clock.
// When STT wall-clock crosses STT_WARN_MS we want the on-call admin to
// notice without having to open the Jobs page — that's the trip point
// that means "next regression and this run fails outright."
//
// FA_MAX_SOURCE_BYTES (the master-audio download cap) lives in
// server/routes.ts. We mirror it here as SOURCE_CAP_BYTES so this file
// is the single source of truth for both the alert math and the human
// "within X MB of cap" copy. If the route bumps the cap, bump this too.
export const SOURCE_CAP_BYTES = Math.round(1.5 * 1024 * 1024 * 1024);
export const SOURCE_WARN_MARGIN_BYTES = 100 * 1024 * 1024; // within 100 MB
export const STT_WARN_MS = 90_000;

// Look-back window for the alert scan. 7 days keeps the banner relevant
// without resurfacing month-old incidents.
export const ALERT_LOOKBACK_DAYS = 7;

export type AutoSyncSummaryShape = {
  sttMs?: number | null;
  sourceBytes?: number | null;
} | null | undefined;

export type JobRunLike = {
  id: string;
  jobType: string;
  status: string;
  summary: AutoSyncSummaryShape | Record<string, any> | null;
  finishedAt: string | Date;
  songId?: string | null;
  albumId?: string | null;
};

export type JobAlertReason = "stt-slow" | "source-near-cap";

export type JobAlert = {
  runId: string;
  songId: string | null;
  albumId: string | null;
  finishedAt: string;
  sttMs: number | null;
  sourceBytes: number | null;
  reasons: JobAlertReason[];
};

// Pure helper so both the server endpoint and any future test code can
// share the same trip logic. Returns null when the run is healthy.
export function evaluateAutoSyncRun(run: JobRunLike): JobAlert | null {
  if (run.jobType !== "auto-sync-lyrics") return null;
  const s = (run.summary ?? {}) as { sttMs?: number | null; sourceBytes?: number | null };
  const sttMs = typeof s.sttMs === "number" ? s.sttMs : null;
  const sourceBytes = typeof s.sourceBytes === "number" ? s.sourceBytes : null;
  const reasons: JobAlertReason[] = [];
  if (sttMs != null && sttMs >= STT_WARN_MS) reasons.push("stt-slow");
  if (sourceBytes != null && sourceBytes >= SOURCE_CAP_BYTES - SOURCE_WARN_MARGIN_BYTES) {
    reasons.push("source-near-cap");
  }
  if (reasons.length === 0) return null;
  const finishedAt =
    run.finishedAt instanceof Date ? run.finishedAt.toISOString() : String(run.finishedAt);
  return {
    runId: run.id,
    songId: run.songId ?? null,
    albumId: run.albumId ?? null,
    finishedAt,
    sttMs,
    sourceBytes,
    reasons,
  };
}
