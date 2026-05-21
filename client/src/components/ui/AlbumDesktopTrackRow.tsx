import { useState } from "react";
import { MoreHorizontal, Play, Pause, Lock } from "lucide-react";
import { ExplicitBadge } from "@/components/ui/ExplicitBadge";

export type AlbumDesktopTrackRowProps = {
  trackNumber: number;
  title: string;
  /** Formatted runtime (e.g. "3:31"). Hidden in locked state. */
  duration: string;
  /** True while this row is the currently-playing track. */
  isCurrent: boolean;
  isPlaying: boolean;
  isExplicit?: boolean;
  /**
   * Row state controls every interaction:
   * - `locked` → grey, inert, no runtime, no menu, no play. Apple's
   *   pre-release locked-row treatment.
   * - `preview` → playable (artist-designated single). Title bolds,
   *   runtime visible, ⋯ menu visible. Tapping plays the preview clip
   *   via PlayerContext (caller decides snippet vs full).
   * - `full` → fan owns the album. Standard interactive row.
   */
  state: "locked" | "preview" | "full";
  onPlay?: () => void;
  onMore?: () => void;
};

/**
 * Desktop fan-facing track row used by the Preview & Purchase shell.
 *
 * Graduated from the mockup sandbox. Each row is a 48px-tall pill on a
 * subtle white-on-navy surface. Hover lifts the background and reveals
 * a "Preview · 30s" hint on preview rows; locked rows never light up.
 */
export function AlbumDesktopTrackRow({
  trackNumber,
  title,
  duration,
  isCurrent,
  isPlaying,
  isExplicit,
  state,
  onPlay,
  onMore,
}: AlbumDesktopTrackRowProps) {
  const [hover, setHover] = useState(false);
  const interactive = state !== "locked";

  return (
    <div
      className="group flex items-center gap-4 h-12 px-4 rounded-xl transition-colors"
      style={{
        background:
          state === "locked"
            ? "rgba(255,255,255,0.025)"
            : hover
              ? "rgba(255,255,255,0.10)"
              : "rgba(255,255,255,0.04)",
        cursor: interactive && onPlay ? "pointer" : "default",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (interactive && onPlay) onPlay();
      }}
      data-testid={`row-track-${trackNumber}`}
      data-row-state={state}
    >
      {/* Track number / play affordance. Locked rows show just the
          number in muted grey. Interactive rows swap to play/pause on
          hover or when current. */}
      <div className="w-6 text-right relative">
        <span
          className={[
            "text-[13px] tabular-nums transition-opacity",
            state === "locked" ? "text-white/30" : "text-white/55",
            interactive && (hover || isCurrent) ? "opacity-0" : "opacity-100",
          ].join(" ")}
        >
          {trackNumber}.
        </span>
        {interactive && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlay?.();
            }}
            aria-label={isCurrent && isPlaying ? "Pause" : `Play track ${trackNumber}`}
            data-testid={`button-play-row-${trackNumber}`}
            className={[
              "absolute inset-0 inline-flex items-center justify-center text-white transition-opacity rounded",
              hover || isCurrent ? "opacity-100" : "opacity-0",
            ].join(" ")}
          >
            {isCurrent && isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" strokeWidth={0} />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" strokeWidth={0} />
            )}
          </button>
        )}
      </div>

      {/* Title — preview rows go bold (signals "playable single"),
          locked rows stay regular weight + muted. */}
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        <span
          className={[
            "truncate text-[14px]",
            state === "locked" ? "text-white/45 font-medium" : "text-white",
            state === "preview" ? "font-semibold" : state === "full" ? "font-medium" : "",
            isCurrent ? "text-[#319ED8]" : "",
          ].join(" ")}
          data-testid={`text-track-title-${trackNumber}`}
        >
          {title}
        </span>
        {isExplicit && <ExplicitBadge tone="slate" />}
        {state === "locked" && (
          <Lock
            className="w-3 h-3 text-white/35 flex-shrink-0"
            strokeWidth={2.2}
            aria-hidden
          />
        )}
      </div>

      {/* "Preview · 30s" hint — preview rows only, fades in on hover. */}
      {state === "preview" && (
        <div
          className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/55 transition-opacity"
          style={{ opacity: hover ? 1 : 0 }}
          aria-hidden
        >
          Preview · 30s
        </div>
      )}

      {/* Runtime — hidden on locked rows (Apple's pre-release pattern). */}
      <div className="w-12 text-right">
        {state !== "locked" && (
          <span className="text-white/55 text-[13px] tabular-nums">{duration}</span>
        )}
      </div>

      {/* ⋯ menu — hidden on locked rows. */}
      {state !== "locked" && (
        <button
          type="button"
          aria-label={`More options for ${title}`}
          data-testid={`button-track-more-${trackNumber}`}
          onClick={(e) => {
            e.stopPropagation();
            onMore?.();
          }}
          className="w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/8 transition-colors active:scale-[0.94]"
        >
          <MoreHorizontal className="w-[18px] h-[18px]" strokeWidth={2} />
        </button>
      )}
      {state === "locked" && <div className="w-11 -mr-2" aria-hidden />}
    </div>
  );
}
