import { Check, Clock, Loader2 } from "lucide-react";

export type PipelineStageStatus = "done" | "active" | "pending";

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
  isHidden: boolean;
}

export function deriveStages(s: PublishingAlbumState): PipelineStage[] {
  const provisionDone = s.hasArtwork;
  const songsExist = s.songCount > 0;
  const scanDone = songsExist && s.songsMuxReady >= s.songCount;
  const buildDone = songsExist && s.songsWithAudio >= s.songCount;
  const bundleDone = s.hasSkusOrPrice;
  const promoteDone = s.isGoodTunesRelease && !s.isHidden;

  // Order matches the canonical pipeline: Provision → Security Scan →
  // Build → Bundle → Promote.
  const flags = [provisionDone, scanDone, buildDone, bundleDone, promoteDone];
  const firstActive = flags.findIndex((d) => !d);

  const make = (key: string, label: string, idx: number): PipelineStage => {
    let status: PipelineStageStatus;
    if (flags[idx]) status = "done";
    else if (idx === firstActive) status = "active";
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
          title={`${stage.label} — ${stage.status}`}
        >
          <StageIcon status={stage.status} />
          <span
            className={[
              "text-xs font-medium uppercase tracking-wide",
              stage.status === "done"
                ? "text-emerald-600"
                : stage.status === "active"
                  ? "text-[color:var(--brand-blue)]"
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
  return (
    <span className="w-4 h-4 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-400">
      <Clock className="w-3 h-3" strokeWidth={2} />
    </span>
  );
}
