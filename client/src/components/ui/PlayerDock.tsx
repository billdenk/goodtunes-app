import { type ReactNode, useEffect, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { LyricsIcon } from "@/components/ui/LyricsIcon";

/**
 * Canonical Apple-Music-style floating dock primitive.
 *
 * Anatomy (Apple parity):
 *   LEFT   transport — shuffle · prev · PLAY · next · repeat
 *   CENTER track info — cover · title/subtitle · inline scrubber + hover times
 *   RIGHT  utility   — lyrics glyph · volume cluster · minimize
 *
 * Behaviors baked in:
 *   • Wide layout — centered 760px pill with inset progress bar.
 *   • Compact (window < 1100px or `forceCompact`) — edge-to-edge capsule,
 *     scrubber removed, volume cluster hidden so the title gets ~46px back.
 *   • Minimized — corner pill (cover · play/pause · restore chevron). The
 *     minimize/restore is internal UI chrome and does not need a host prop.
 *   • Shuffle / Repeat / Volume / Mute are managed internally. Hosts that
 *     need to sync them to a real audio engine can listen via the optional
 *     `onShuffleChange` / `onRepeatChange` / `onVolumeChange` callbacks
 *     without breaking the demo-friendly "uncontrolled" default.
 *   • Hover the scrubber → cover + title blur, elapsed + remaining time
 *     labels fade in flush with the bar's left/right edges.
 *
 * IDLE (no selection): pill collapses to just the LEFT transport cluster
 * with content on the right hidden. Pill width auto-sizes so it doesn't
 * read as a half-empty bar when nothing is playing.
 *
 * Positioning: rendered with `absolute bottom-4` — host must mount inside
 * a `position: relative` parent (a card / panel / `Player` page).
 *
 * This component was graduated from the admin-Tracks-tab Seamless mockup
 * after Bill signed off on the anatomy. The mockup keeps a parallel inline
 * copy (the sandbox can't import from `client/src`); when polishing,
 * mirror the fix into both files until the sandbox gains a real alias.
 */

export interface PlayerDockTrack {
  /** Display title (truncated at the center column's edge). */
  title: string;
  /** Optional secondary line — typically `Artist — Album`. */
  subtitle?: string;
  /** When false, the Play button renders disabled (greyed). */
  playable: boolean;
}

export type RepeatMode = "off" | "all" | "one";

export interface PlayerDockProps {
  track: PlayerDockTrack;
  /** True when a track is selected. When false the dock collapses to a
   *  transport-only width and hides the center/right clusters. */
  hasSelection: boolean;
  playing: boolean;
  /** 0–100. The host owns playback time, the dock just paints the bar. */
  progress: number;
  /** Total seconds of the current track — drives the elapsed / remaining
   *  labels that fade in on scrubber hover. */
  totalSeconds: number;

  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;

  /** Click-to-seek on the inline scrubber. Called with target seconds.
   *  Omit to make the scrubber visual-only (mock-data mode). */
  onSeek?: (seconds: number) => void;
  /** Lyrics button on the right cluster. Omit to hide the button entirely. */
  onLyrics?: () => void;

  /** Fires when the user toggles shuffle (internal state). */
  onShuffleChange?: (next: boolean) => void;
  /** Fires when the user cycles repeat off → all → one → off. */
  onRepeatChange?: (next: RepeatMode) => void;
  /** Fires whenever volume level or mute state changes. */
  onVolumeChange?: (level: number, muted: boolean) => void;

  /** Optional cover slot — pass an `<img>`, gradient block, etc. When
   *  omitted the dock paints a brand-gradient placeholder. */
  coverNode?: ReactNode;

  /** Initial volume level (0–100). Defaults to 65. */
  defaultVolume?: number;
  /** Initial muted state. Defaults to false. */
  defaultMuted?: boolean;

  /** Demo-only override: force compact layout regardless of window width.
   *  Production callers leave this undefined and let the resize listener
   *  drive layout. */
  forceCompact?: boolean;
}

/** Width-in-pixels below which the dock auto-switches to compact (edge-to-
 *  edge, no inline scrubber, volume hidden). Tuned for desktop layouts
 *  where a LIVE PREVIEW column will eat horizontal room. */
const COMPACT_BREAKPOINT = 1100;

export function PlayerDock({
  track,
  hasSelection,
  playing,
  progress,
  totalSeconds,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onLyrics,
  onShuffleChange,
  onRepeatChange,
  onVolumeChange,
  coverNode,
  defaultVolume = 65,
  defaultMuted = false,
  forceCompact,
}: PlayerDockProps) {
  const playable = track.playable;

  // ── Internal control state ──────────────────────────────────────────
  // Volume cluster mirrors Apple's anatomy: speaker icon always visible,
  // slider slides out to its LEFT on hover, click anywhere on the rail
  // sets level + unmutes, click the speaker toggles mute (preserving the
  // prior level). Glyph swaps with level so the icon itself reads the
  // state at a glance:  X / 1–14% / 15–64% / 65–100%.
  const [volumeMuted, setVolumeMuted] = useState(defaultMuted);
  const [volumeLevel, setVolumeLevel] = useState(defaultVolume);

  // Shuffle: binary toggle. Repeat: tri-state matching Apple's pattern
  // (off → all → one → off). Active states use brand blue (#319ED8);
  // #FF5470 stays reserved for fan-side favorites per design system.
  const [shuffleOn, setShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");

  // Scrubber hover — drives Apple's hover treatment: cover + title blur
  // out while elapsed + remaining time labels fade in flush with the
  // bar's edges. Left/right icon clusters stay sharp.
  const [scrubHover, setScrubHover] = useState(false);

  // Manual hide/show — collapses the dock to a small corner pill (cover
  // thumb + play/pause + chevron-up). Independent of the auto-compact
  // responsive breakpoint above. Auto-restores when the track changes so
  // a new selection always surfaces the full dock (architect's UX fix —
  // otherwise picking a new track from the minimized state leaves the
  // user with no cover/title preview of what they just queued up).
  const [dockHidden, setDockHidden] = useState(false);
  useEffect(() => {
    setDockHidden(false);
  }, [track.title, track.subtitle]);

  // ── Responsive auto-compact ────────────────────────────────────────
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  const compact = forceCompact ?? windowWidth < COMPACT_BREAKPOINT;

  // ── Derived ────────────────────────────────────────────────────────
  const cycleRepeat = () => {
    const next: RepeatMode =
      repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    setRepeatMode(next);
    onRepeatChange?.(next);
  };
  const toggleShuffle = () => {
    const next = !shuffleOn;
    setShuffleOn(next);
    onShuffleChange?.(next);
  };
  const toggleMute = () => {
    const next = !volumeMuted;
    setVolumeMuted(next);
    onVolumeChange?.(volumeLevel, next);
  };
  const RepeatGlyph = repeatMode === "one" ? Repeat1 : Repeat;
  const VolumeGlyph =
    volumeMuted || volumeLevel === 0
      ? VolumeX
      : volumeLevel < 15
      ? Volume
      : volumeLevel < 65
      ? Volume1
      : Volume2;

  const handleVolumeRail = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(
      0,
      Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
    );
    const level = Math.round(pct);
    setVolumeLevel(level);
    if (volumeMuted) setVolumeMuted(false);
    onVolumeChange?.(level, false);
  };

  const handleScrubClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    onSeek(Math.round(pct * totalSeconds));
  };

  // Time labels — derive elapsed from progress so the host doesn't have
  // to keep two clocks in sync. Clamp inputs defensively: a host that
  // briefly passes `progress > 100` (e.g. between a "track ended" tick
  // and the queue advancing) shouldn't make the dock render "−1:05".
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const safeTotal = Math.max(0, totalSeconds);
  const elapsedSeconds = Math.floor((clampedProgress / 100) * safeTotal);
  const remainingSeconds = Math.max(0, safeTotal - elapsedSeconds);
  const fmt = (s: number) => {
    // Always format the magnitude — Math.floor on negatives goes the
    // wrong direction (e.g. Math.floor(-5/60) === -1, giving "−1:55").
    const abs = Math.max(0, Math.floor(s));
    return `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
  };

  // Default cover when host doesn't supply one — brand gradient block.
  const cover =
    coverNode ?? (
      <div
        className="w-10 h-10 rounded-md flex-shrink-0"
        style={{
          background: "linear-gradient(135deg, #319ED8 0%, #7F10A7 100%)",
        }}
      />
    );

  // ── Minimized corner pill ──────────────────────────────────────────
  // Intentionally minimal: cover (so the user knows WHAT is playing),
  // play/pause (the one control that might still matter while minimized),
  // and chevron-up to restore. Title omitted — a tooltip on the cover or
  // a dedicated Now Playing sheet can answer that without bloating the pill.
  if (dockHidden && hasSelection) {
    return (
      <div className="absolute right-4 bottom-4 z-20" data-testid="player-dock-mini">
        <div className="rounded-full bg-slate-900/95 backdrop-blur-md text-white shadow-2xl ring-1 ring-white/10 flex items-center gap-1 pl-3 pr-2 py-2">
          <div
            className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden"
            aria-label={`${track.title} — now playing`}
            title={track.subtitle ? `${track.title} — ${track.subtitle}` : track.title}
            style={
              coverNode
                ? undefined
                : { background: "linear-gradient(135deg, #319ED8 0%, #7F10A7 100%)" }
            }
          >
            {coverNode}
          </div>
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!playable}
            aria-label={playing ? "Pause" : "Play"}
            data-testid="button-play-mini"
            className={[
              "w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors",
              playable
                ? "text-white hover:bg-white/10"
                : "text-slate-500 cursor-not-allowed",
            ].join(" ")}
          >
            {playing ? (
              <Pause className="w-[18px] h-[18px] fill-current" />
            ) : (
              <Play className="w-[18px] h-[18px] ml-0.5 fill-current" />
            )}
          </button>
          <button
            type="button"
            aria-label="Show player"
            title="Show player"
            onClick={() => setDockHidden(false)}
            data-testid="button-show-player"
            className="w-9 h-9 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // ── Full dock ──────────────────────────────────────────────────────
  // Wrapper sizing:
  //   • Wide          → centered 760px pill (capped at viewport − 32).
  //   • Compact + auto narrow → edge-to-edge (`left-2 right-2`).
  //   • Compact + forced       → constrained 640px centered (so demo
  //     callers passing `forceCompact` reproduce the cramped layout
  //     even inside a 1280px iframe).
  const edgeToEdge = compact && forceCompact !== true;
  const wrapperStyle =
    !compact && hasSelection
      ? { width: "min(760px, calc(100% - 32px))" }
      : forceCompact === true
      ? { width: "min(640px, calc(100% - 32px))" }
      : undefined;

  // Clamp slider handle inside the rail so the knob never hangs off the
  // end-caps at 0% / 100%. Handle is 10px wide → -5px centers it on the
  // tick. Architect flagged this as a polish item during the mockup phase.
  const knobLeft = (pct: number) =>
    `calc(${Math.max(0, Math.min(100, pct))}% - 5px)`;

  return (
    <div
      className={[
        "absolute bottom-4 z-20",
        edgeToEdge ? "left-2 right-2" : "left-1/2 -translate-x-1/2",
      ].join(" ")}
      style={wrapperStyle}
      data-testid="player-dock"
    >
      {/* Symmetric py-4 keeps every transport button + the album cover
          vertically centered on the tallest element (44px Play). At py-4
          the pill is 76px tall — matches Apple's mini-player proportions
          and leaves room for the inset scrubber along the bottom edge. */}
      <div className="relative bg-slate-900/95 backdrop-blur-md text-white shadow-2xl ring-1 ring-white/10 overflow-hidden rounded-full">
        <div className="flex items-center gap-1.5 px-3 py-4">
          {/* ── LEFT · transport ───────────────────────────────────── */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              type="button"
              aria-label="Shuffle"
              aria-pressed={shuffleOn}
              title={shuffleOn ? "Shuffle on" : "Shuffle off"}
              onClick={toggleShuffle}
              data-testid="button-shuffle"
              className={[
                "w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors",
                shuffleOn
                  ? "text-[#319ED8] bg-[#319ED8]/15 hover:bg-[#319ED8]/20"
                  : "text-slate-300 hover:text-white hover:bg-white/10",
              ].join(" ")}
            >
              <Shuffle className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous track"
              data-testid="button-prev"
              className="w-9 h-9 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
            >
              <SkipBack className="w-[18px] h-[18px] fill-current" />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={!playable}
              aria-label={playing ? "Pause" : "Play"}
              data-testid="button-play"
              className={[
                "w-11 h-11 rounded-full inline-flex items-center justify-center transition-colors",
                playable
                  ? "text-white hover:bg-white/10"
                  : "text-slate-500 cursor-not-allowed",
              ].join(" ")}
            >
              {playing ? (
                // Pause sized down vs Play so the two glyphs read at the
                // same optical weight — Lucide's pause bars are heavier
                // than the Play triangle at equal nominal size.
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-7 h-7 translate-x-[1.5px] fill-current" />
              )}
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next track"
              data-testid="button-next"
              className="w-9 h-9 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
            >
              <SkipForward className="w-[18px] h-[18px] fill-current" />
            </button>
            <button
              type="button"
              aria-label={
                repeatMode === "off"
                  ? "Repeat off"
                  : repeatMode === "all"
                  ? "Repeat all"
                  : "Repeat one"
              }
              title={
                repeatMode === "off"
                  ? "Repeat off"
                  : repeatMode === "all"
                  ? "Repeat all"
                  : "Repeat one"
              }
              onClick={cycleRepeat}
              data-testid="button-repeat"
              className={[
                "w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors",
                repeatMode === "off"
                  ? "text-slate-300 hover:text-white hover:bg-white/10"
                  : "text-[#319ED8] bg-[#319ED8]/15 hover:bg-[#319ED8]/20",
              ].join(" ")}
            >
              <RepeatGlyph className="w-4 h-4" />
            </button>
          </div>

          {hasSelection && (
            <>
              <span className="mx-2 h-6 w-px bg-white/10 flex-shrink-0" aria-hidden />

              {/* ── CENTER · track info ──────────────────────────────
                  Cover ~40px (one notch shorter than the 44px Play so
                  Play drives the row height). Center cluster blurs out
                  while the user is hovering the scrubber so the time
                  labels above the bar read cleanly. */}
              <div
                className={[
                  "flex items-center gap-3 min-w-0 flex-1 transition-[filter,opacity] duration-150",
                  scrubHover ? "blur-[6px] opacity-50" : "",
                ].join(" ")}
                aria-hidden={scrubHover}
              >
                {cover}
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[13px] font-semibold truncate leading-tight"
                    data-testid="text-track-title"
                  >
                    {track.title}
                  </div>
                  {track.subtitle && (
                    <div
                      className="text-[11px] text-slate-400 truncate leading-tight mt-0.5"
                      data-testid="text-track-subtitle"
                    >
                      {track.subtitle}
                    </div>
                  )}
                </div>
              </div>

              {/* ── RIGHT · utility cluster ──────────────────────────
                  Lyrics glyph + volume cluster + minimize chevron.
                  ⋯ song-options menu intentionally omitted: Apple
                  surfaces it for fan-side options that the consuming
                  surface (album/track row) already owns elsewhere. */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {onLyrics && (
                  <button
                    type="button"
                    aria-label="Show lyrics"
                    title="Show lyrics"
                    onClick={onLyrics}
                    data-testid="button-lyrics"
                    className="w-10 h-10 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
                  >
                    <LyricsIcon size={20} />
                  </button>
                )}
                {/* Volume cluster — slider slides out left on hover.
                    Hidden in compact: Apple drops volume from its narrow
                    mini-player too. The title gets the ~46px back. */}
                {!compact && (
                  <div className="group/vol flex items-center pr-0.5">
                    <div className="overflow-hidden transition-[width,margin] duration-200 ease-out w-0 group-hover/vol:w-[68px] group-hover/vol:mr-1.5">
                      <div
                        className="relative w-16 h-[3px] bg-white/15 rounded-full cursor-pointer"
                        onClick={handleVolumeRail}
                        data-testid="rail-volume"
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-white rounded-full transition-[width] duration-150"
                          style={{ width: volumeMuted ? "0%" : `${volumeLevel}%` }}
                        />
                        {!volumeMuted && (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow ring-1 ring-black/10"
                            style={{ left: knobLeft(volumeLevel) }}
                            aria-hidden
                          />
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={volumeMuted ? "Unmute" : "Mute"}
                      title={volumeMuted ? "Unmute" : "Mute"}
                      onClick={toggleMute}
                      data-testid="button-mute"
                      className="w-10 h-10 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
                    >
                      <VolumeGlyph className="w-5 h-5" />
                    </button>
                  </div>
                )}

                {/* Minimize — collapses to the corner pill. ChevronDown
                    points toward where the mini-pill will land. */}
                <button
                  type="button"
                  aria-label="Minimize player"
                  title="Minimize player"
                  onClick={() => setDockHidden(true)}
                  data-testid="button-minimize-player"
                  className="w-10 h-10 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Inline progress bar (wide only) ───────────────────────
            Bar is SCOPED to the now-playing card area: ~12px past the
            repeat button on the left and ~12px before the lyrics
            button on the right, so the gap-to-nearest-icon reads
            symmetric. Bar does NOT run under the transport buttons.
            In compact mode the inline scrubber is dropped entirely —
            Apple's narrow mini-player does the same. Tap to expand for
            scrubbing (a separate Now Playing sheet, owned by the host). */}
        {!compact && hasSelection && (
          <>
            <div
              className={[
                "absolute left-[228px] right-[164px] inset-y-0 flex items-center justify-between pointer-events-none z-10",
                "transition-opacity duration-150",
                scrubHover ? "opacity-100" : "opacity-0",
              ].join(" ")}
            >
              <span
                className="text-[13px] tabular-nums text-slate-300 whitespace-nowrap"
                data-testid="text-elapsed"
              >
                {fmt(elapsedSeconds)}
              </span>
              <span
                className="text-[13px] tabular-nums text-slate-300 whitespace-nowrap"
                data-testid="text-remaining"
              >
                −{fmt(remainingSeconds)}
              </span>
            </div>
            <div
              className="group/scrub absolute left-[228px] right-[164px] bottom-1.5 h-3 flex items-center cursor-pointer"
              onMouseEnter={() => setScrubHover(true)}
              onMouseLeave={() => setScrubHover(false)}
              onClick={handleScrubClick}
              data-testid="rail-scrubber"
            >
              <div className="relative flex-1 h-[2px] rounded-full bg-white/15 transition-[height,background-color] duration-100 group-hover/scrub:h-[4px] group-hover/scrub:bg-white/25 group-active/scrub:h-[5px] group-active/scrub:bg-white/40">
                <div
                  className="absolute inset-y-0 left-0 bg-white rounded-full transition-all"
                  style={{ width: `${clampedProgress}%` }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
