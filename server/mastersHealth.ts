// Task #3197 — press masters download resolution + catalog-wide masters
// health. The Physical → Audio "Download all masters" is where pressing
// plants pull the files they cut vinyl from, so it must deliver the
// highest-quality bytes we hold: the artist's ORIGINAL upload
// (`songs.audioSourceUrl` — e.g. the untouched 24-bit WAV whenever the
// import pipeline transcoded to FLAC for playback), falling back to the
// served playback file (`audioUrl`) only when no original exists. (That
// fallback is still press-grade: a pipeline-made FLAC is losslessly
// identical audio.)
//
// The same classification powers three surfaces so they can never drift:
//   • the authed download route (routes.ts) — which file to stream + a
//     REASONED failure (no master uploaded vs. un-mirrored external link
//     vs. file missing from storage) instead of a generic error;
//   • the per-album pre-flight (`GET /api/admin/albums/:id/masters/health`)
//     the Press panel uses to flag broken rows BEFORE a plant clicks;
//   • the catalog-wide background sweep (startMastersHealthSweep) that
//     probes storage off the request path and pages ops via alertOps when
//     new breakage appears, mirroring scripts/audit-masters.ts.
import { alertOps } from "./opsAlert";

// ---------------------------------------------------------------------------
// Pure classification (unit-testable, no I/O)
// ---------------------------------------------------------------------------

export type PointerClass = "empty" | "external" | "object";

/** Classify a stored audio pointer. `/objects/...` is ours; anything else
 *  non-empty is an external URL that was never mirrored into our bucket. */
export function classifyPointer(url: string | null | undefined): PointerClass {
  const u = (url ?? "").trim();
  if (!u) return "empty";
  return u.startsWith("/objects/") ? "object" : "external";
}

export type MasterSongPointers = {
  audioUrl?: string | null;
  audioSourceUrl?: string | null;
};

export type MasterStatus =
  /** downloadable — will serve the artist's original upload */
  | "ok_original"
  /** downloadable — no original stashed, serves the (lossless-or-uploaded) playback file */
  | "ok_served"
  /** no master uploaded at all */
  | "no_master"
  /** only pointer(s) are external URLs that were never mirrored into storage */
  | "external"
  /** pointer(s) look right but the object is gone from storage */
  | "missing_object";

export const BROKEN_MASTER_STATUSES: ReadonlySet<MasterStatus> = new Set([
  "no_master",
  "external",
  "missing_object",
]);

/** Ordered candidates to stream: original first, served playback second. */
export function masterCandidates(song: MasterSongPointers): Array<{
  url: string;
  source: "original" | "served";
  cls: PointerClass;
}> {
  const out: Array<{ url: string; source: "original" | "served"; cls: PointerClass }> = [];
  const src = (song.audioSourceUrl ?? "").trim();
  const served = (song.audioUrl ?? "").trim();
  if (src) out.push({ url: src, source: "original", cls: classifyPointer(src) });
  if (served) out.push({ url: served, source: "served", cls: classifyPointer(served) });
  return out;
}

/** The pointer the client should EXPECT to download (mirrors the route's
 *  source preference) — used client-side for the filename extension. */
export function preferredMasterUrl(song: MasterSongPointers): string | null {
  for (const c of masterCandidates(song)) {
    if (c.cls === "object") return c.url;
  }
  return null;
}

export type MasterProbe = (objectPath: string) => Promise<boolean>;

/** Classify a song's master health. `probe` answers "does this /objects/
 *  path exist in storage?" — pass a stub in tests / a memoized prober in
 *  sweeps. */
export async function classifySongMaster(
  song: MasterSongPointers,
  probe: MasterProbe,
): Promise<{ status: MasterStatus; url: string | null }> {
  const candidates = masterCandidates(song);
  if (candidates.length === 0) return { status: "no_master", url: null };
  let sawObject = false;
  for (const c of candidates) {
    if (c.cls !== "object") continue;
    sawObject = true;
    if (await probe(c.url)) {
      return { status: c.source === "original" ? "ok_original" : "ok_served", url: c.url };
    }
  }
  if (sawObject) return { status: "missing_object", url: candidates.find((c) => c.cls === "object")!.url };
  return { status: "external", url: candidates[0].url };
}

/** Human messages for the download route / toasts, keyed by failure class. */
export const MASTER_FAILURE_MESSAGES: Record<
  Exclude<MasterStatus, "ok_original" | "ok_served">,
  string
> = {
  no_master:
    "No master uploaded for this track — add one on the Tracks tab.",
  external:
    "This track's master is an external link that was never mirrored into storage — re-upload it on the Tracks tab.",
  missing_object:
    "This track's master file is missing from storage — re-upload it on the Tracks tab.",
};

// ---------------------------------------------------------------------------
// Catalog-wide background sweep (off the request path)
// ---------------------------------------------------------------------------

export type MastersSweepRow = {
  songId: string;
  songTitle: string;
  albumId: string;
  albumTitle: string;
  status: MasterStatus;
  url: string | null;
};

export type MastersSweep = {
  checkedAt: string; // ISO
  totalSongs: number;
  okOriginal: number;
  okServed: number;
  broken: MastersSweepRow[];
};

let sweepCache: MastersSweep | null = null;
let sweepTimer: ReturnType<typeof setInterval> | null = null;
let sweepInFlight: Promise<MastersSweep> | null = null;
let lastAlertedBrokenIds = new Set<string>();
let sweepBaselineSeeded = false;

export function getMastersSweepCache(): MastersSweep | null {
  return sweepCache;
}

async function defaultProbe(objectPath: string): Promise<boolean> {
  const { ObjectStorageService, ObjectNotFoundError } = await import(
    "./replit_integrations/object_storage/objectStorage"
  );
  try {
    await new ObjectStorageService().getObjectEntityFile(objectPath);
    return true;
  } catch (e) {
    if (e instanceof ObjectNotFoundError) return false;
    // Transient storage/API failure — do NOT classify as broken; treat the
    // object as present so a blip can't page ops with false positives.
    console.warn(`[masters-health] probe error for ${objectPath} — treating as present`, e);
    return true;
  }
}

/** Run one catalog-wide sweep against THIS environment's DB. Storage
 *  probes are memoized per distinct path within a sweep. */
export async function runMastersSweep(probe: MasterProbe = defaultProbe): Promise<MastersSweep> {
  if (sweepInFlight) return sweepInFlight;
  sweepInFlight = (async () => {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    const res: any = await db.execute(sql`
      SELECT s.id, s.title, s.album_id, a.title AS album_title,
             s.audio_url, s.audio_source_url
        FROM songs s
        JOIN albums a ON a.id = s.album_id
       WHERE s.deleted_at IS NULL AND a.deleted_at IS NULL
       ORDER BY a.title, s.track_number
    `);
    const rows: any[] = res.rows ?? res;
    const memo = new Map<string, Promise<boolean>>();
    const memoProbe: MasterProbe = (p) => {
      let hit = memo.get(p);
      if (!hit) {
        hit = probe(p);
        memo.set(p, hit);
      }
      return hit;
    };
    const sweep: MastersSweep = {
      checkedAt: new Date().toISOString(),
      totalSongs: rows.length,
      okOriginal: 0,
      okServed: 0,
      broken: [],
    };
    for (const r of rows) {
      const { status, url } = await classifySongMaster(
        { audioUrl: r.audio_url, audioSourceUrl: r.audio_source_url },
        memoProbe,
      );
      if (status === "ok_original") sweep.okOriginal++;
      else if (status === "ok_served") sweep.okServed++;
      else {
        sweep.broken.push({
          songId: r.id,
          songTitle: r.title ?? "Untitled",
          albumId: r.album_id,
          albumTitle: r.album_title ?? "—",
          status,
          url,
        });
      }
    }
    sweepCache = sweep;
    maybeAlertOnSweep(sweep);
    return sweep;
  })();
  try {
    return await sweepInFlight;
  } finally {
    sweepInFlight = null;
  }
}

// Page ops only when NEW breakage appears (a stable known-broken backlog
// shouldn't email every 6 hours; alertOps itself adds a 15-min cooldown +
// hourly cap on top). First sweep after boot seeds the baseline and alerts
// only on the classes a press would actually hit (missing objects /
// external links) — "no master uploaded yet" is normal mid-production and
// stays a dashboard-only signal.
function maybeAlertOnSweep(sweep: MastersSweep): void {
  const severe = sweep.broken.filter((b) => b.status !== "no_master");
  const ids = new Set(severe.map((b) => b.songId));
  const fresh = severe.filter((b) => !lastAlertedBrokenIds.has(b.songId));
  const isFirstSweep = !sweepBaselineSeeded;
  sweepBaselineSeeded = true;
  lastAlertedBrokenIds = ids;
  const toReport = isFirstSweep ? severe : fresh;
  if (toReport.length === 0) return;
  const lines = toReport
    .slice(0, 20)
    .map((b) => `• "${b.songTitle}" on "${b.albumTitle}" — ${b.status} (${b.url ?? "no pointer"})`)
    .join("\n");
  alertOps({
    signature: "masters-health broken",
    subject: `Masters health: ${toReport.length} track master${toReport.length === 1 ? "" : "s"} unusable`,
    detail:
      `The background masters sweep found ${toReport.length} track(s) whose press master is unusable ` +
      `(external un-mirrored link or file missing from storage). Presses cannot download these.\n\n${lines}` +
      (toReport.length > 20 ? `\n…and ${toReport.length - 20} more.` : "") +
      `\n\nFull list: GET /api/admin/masters/health`,
  });
}

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const SWEEP_BOOT_DELAY_MS = 2 * 60 * 1000; // let boot settle; stay off the request path

/** Start the periodic sweep. No-op under tests. */
export function startMastersHealthSweep(): void {
  if (process.env.GT_TEST || process.env.NODE_ENV === "test") return;
  if (sweepTimer) return;
  const run = () =>
    runMastersSweep().catch((e) => console.warn("[masters-health] sweep failed", e));
  const boot = setTimeout(run, SWEEP_BOOT_DELAY_MS);
  boot.unref?.();
  sweepTimer = setInterval(run, SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();
}
