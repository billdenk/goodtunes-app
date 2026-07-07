import { Check, Clock, Hourglass, Loader2 } from "lucide-react";

// "waiting" — Task #2618. The current (first-incomplete) stage is genuinely
// blocked waiting on an operator input (usually masters/audio) rather than
// actively processing. It renders as a calm static hourglass, NOT a spinner,
// so the Security Scan stage stops spinning forever on an album whose masters
// were never uploaded (the bug this fixes). "active" (spinner) is now reserved
// for work that is genuinely in-flight (Mux transcoding uploaded audio).
export type PipelineStageStatus = "done" | "active" | "waiting" | "pending";

export interface PipelineStage {
  key: string;
  label: string;
  status: PipelineStageStatus;
}

/**
 * Task #295 — five-step publishing pipeline strip rendered on every
 * connected-album row inside an entity-detail page (NPO / Reseller /
 * Press). Each stage shows green check (done), blue spinner (current
 * stage), or muted clock (pending future). The strip is read-only —
 * it derives its state from the album row and a couple of joined
 * counts; the underlying pipeline (Provision → Security Scan → Build
 * → Bundle → Promote) is owned by AdminAlbum and the upload jobs that
 * mutate the album. We just visualize what's there.
 *
 * Stage order is fixed: Provision → Security Scan → Build → Bundle →
 * Promote. Don't reshuffle these without updating AdminAlbum + the
 * Publishing screenshots in lockstep.
 */
export interface PublishingAlbumState {
  hasArtwork: boolean;
  songCount: number;
  songsWithAudio: number;
  songsMuxReady: number;
  hasSkusOrPrice: boolean;
  isGoodTunesRelease: boolean;
  // Task #440 — "Prepping" gate keeps unfinished shells off the Released
  // tab. Promote stage doesn't tick until isPrepping=false.
  isPrepping: boolean;
  isHidden: boolean;
}

// Stage-specific tooltip copy for the calm "waiting" state, so a blocked
// Provision/Bundle/Promote step isn't mislabeled as "waiting for masters".
const WAITING_HINT: Record<string, string> = {
  provision: "waiting for artwork",
  scan: "waiting for masters",
  build: "waiting for masters",
  bundle: "waiting for pricing",
  promote: "waiting to publish",
};

export function deriveStages(s: PublishingAlbumState): PipelineStage[] {
  const provisionDone = s.hasArtwork;
  const songsExist = s.songCount > 0;
  const scanDone = songsExist && s.songsMuxReady >= s.songCount;
  const buildDone = songsExist && s.songsWithAudio >= s.songCount;
  const bundleDone = s.hasSkusOrPrice;
  const promoteDone = s.isGoodTunesRelease && !s.isPrepping && !s.isHidden;

  // Order matches the canonical pipeline: Provision → Security Scan →
  // Build → Bundle → Promote.
  const flags = [provisionDone, scanDone, buildDone, bundleDone, promoteDone];
  const firstActive = flags.findIndex((d) => !d);

  // Task #2618 — decide whether the current (first-incomplete) stage is
  // genuinely processing ("active", spinner) or just blocked waiting on an
  // operator input ("waiting", calm hourglass). The only stage that can be
  // legitimately in-flight from these counts is Security Scan: audio has
  // been uploaded (songsWithAudio > 0) but Mux hasn't finished transcoding
  // every track yet (songsMuxReady < songsWithAudio). Everything else — no
  // artwork, no masters uploaded, unpriced, unpublished — is a manual step
  // that isn't "running", so it waits instead of spinning forever.
  const scanRunning =
    songsExist && s.songsWithAudio > 0 && s.songsMuxReady < s.songsWithAudio;

  const make = (key: string, label: string, idx: number): PipelineStage => {
    let status: PipelineStageStatus;
    if (flags[idx]) status = "done";
    else if (idx === firstActive)
      status = key === "scan" && scanRunning ? "active" : "waiting";
    else status = "pending";
    return { key, label, status };
  };

  return [
    make("provision", "Provision", 0),
    make("scan", "Security Scan", 1),
    make("build", "Build", 2),
    make("bundle", "Bundle", 3),
    make("promote", "Promote", 4),
  ];
}

export function PublishingPipelineStrip({
  state,
  className,
}: {
  state: PublishingAlbumState;
  className?: string;
}) {
  const stages = deriveStages(state);
  return (
    <ol
      className={["flex items-center gap-1.5", className || ""].join(" ")}
      data-testid="pipeline-strip"
    >
      {stages.map((stage) => (
        <li
          key={stage.key}
          className="flex items-center gap-1"
          data-testid={`pipeline-stage-${stage.key}`}
          data-status={stage.status}
          title={
            stage.status === "waiting"
              ? `${stage.label} — ${WAITING_HINT[stage.key] ?? "waiting for input"}`
              : `${stage.label} — ${stage.status}`
          }
        >
          <StageIcon status={stage.status} />
          <span
            className={[
              "text-xs font-medium uppercase tracking-wide",
              stage.status === "done"
                ? "text-emerald-600"
                : stage.status === "active"
                  ? "text-[color:var(--brand-blue)]"
                  : stage.status === "waiting"
                    ? "text-amber-600"
                    : "text-slate-400",
            ].join(" ")}
          >
            {stage.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StageIcon({ status }: { status: PipelineStageStatus }) {
  if (status === "done") {
    return (
      <span className="w-4 h-4 inline-flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <Check className="w-3 h-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="w-4 h-4 inline-flex items-center justify-center rounded-full bg-[color:var(--brand-blue)]/10 text-[color:var(--brand-blue)]">
        <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2.5} />
      </span>
    );
  }
  if (status === "waiting") {
    return (
      <span className="w-4 h-4 inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <Hourglass className="w-3 h-3" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className="w-4 h-4 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-400">
      <Clock className="w-3 h-3" strokeWidth={2} />
    </span>
  );
}
