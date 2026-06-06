import { type ReactNode, useEffect, useRef, useState } from "react";
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
  Music2,
  Maximize2,
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
 * IDLE (no selection): same wide pill, with a slate placeholder where the
 * cover would go and empty title/subtitle text. Apple parity: the dock
 * doesn't resize between idle and playing states, it just lights up.
 *
 * Positioning: `fixed bottom-[calc(2rem+env(safe-area-inset-bottom,0px))]` —
 * pins to the browser viewport so the dock floats above page content and
 * stays a consistent distance from the window's bottom edge as the user
 * resizes. The `env(safe-area-inset-bottom)` term lifts the dock clear of
 * the iPhone/iPad home indicator inside the Capacitor native webview; on
 * plain web the inset is 0 so behavior is unchanged. Host must reserve
 * ~110px of bottom padding so the dock doesn't cover the last row of
 * scrollable content.
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
  /** When set, the title becomes a tappable link to the song's album (brief
   *  underline on press). Omit to keep the title plain text — e.g. when the
   *  album destination doesn't exist (admin contexts). */
  onTitleActivate?: () => void;
  /** When set, the subtitle becomes a tappable link to the artist. Omit to
   *  keep the subtitle plain text when there's no artist destination. */
  onSubtitleActivate?: () => void;
  /** Lyrics button on the right cluster. Omit to hide the button entirely. */
  onLyrics?: () => void;
  /** When true, the lyrics glyph renders in its active (brand-blue,
   *  aria-pressed) state — used by the desktop surface to reflect that
   *  the right-side lyrics panel is currently open. */
  lyricsActive?: boolean;

  /** Fires when the user toggles shuffle (internal state). */
  onShuffleChange?: (next: boolean) => void;
  /** Fires when the user cycles repeat off → all → one → off. */
  onRepeatChange?: (next: RepeatMode) => void;
  /** Fires whenever volume level or mute state changes. */
  onVolumeChange?: (level: number, muted: boolean) => void;

  /** Optional cover slot — pass an `<img>`, gradient block, etc. When
   *  omitted the dock paints a brand-gradient placeholder. */
  coverNode?: ReactNode;

  /** When provided (and something is playing), the cover gains an
   *  expand affordance that opens the full-screen Now Playing surface:
   *  a hover-reveal Maximize overlay on pointer devices, two-tap on
   *  touch (first tap reveals the control, second triggers expand). */
  onExpand?: () => void;

  /** Initial volume level (0–100). Defaults to 65. */
  defaultVolume?: number;
  /** Initial muted state. Defaults to false. */
  defaultMuted?: boolean;

  /** Demo-only override: force compact layout regardless of window width.
   *  Production callers leave this undefined and let the resize listener
   *  drive layout. */
  forceCompact?: boolean;
  /**
   * Visual density. `default` is the admin Tracks-tab size; `compact`
   * tightens the pill, transport buttons, cover, and type ~6–10% so the
   * dock reads at Apple-Music desktop density on the fan-facing surface.
   * Compact also drops the wide-pill width from 760 → 660. Independent
   * of the responsive `compact` (width-based) auto-switch.
   */
  density?: "default" | "compact";
  /**
   * When true, render a small rose "PREVIEW" pill next to the title so
   * fans know they're auditioning 30-sec snippets, not full playback.
   * Host is responsible for clamping `progress` + `totalSeconds` to the
   * 30-second cap; this prop is the visible badge only.
   */
  previewMode?: boolean;
  /**
   * Desktop rail-aware docking. When BOTH are provided and the dock is in
   * its wide (non-edge-to-edge) regime, the pill centers within the content
   * channel `[channelLeft, windowWidth − channelRight]` instead of the whole
   * browser window — so it sits in the gutter between the left nav rail and
   * the right lyrics rail, shifting + resizing (with a smooth transition)
   * when the right rail opens or closes. Both are px insets from the
   * respective window edges. Ignored in the edge-to-edge compact regime
   * (narrow widths keep the existing full-bleed dock that overlaps the
   * left rail — see the iPad rail/dock-overlap note).
   */
  channelLeft?: number;
  channelRight?: number;
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
  onTitleActivate,
  onSubtitleActivate,
  onLyrics,
  lyricsActive = false,
  onShuffleChange,
  onRepeatChange,
  onVolumeChange,
  coverNode,
  onExpand,
  defaultVolume = 65,
  defaultMuted = false,
  forceCompact,
  density = "default",
  previewMode = false,
  channelLeft,
  channelRight,
}: PlayerDockProps) {
  const playable = track.playable;
  const isCompactDensity = density === "compact";

  // Token map — every dimension that flexes between admin (default) and
  // fan-facing desktop (compact). Keeps the JSX downstream readable.
  const D = isCompactDensity
    ? {
        // Symmetric vertical padding optically centers the transport row
        // within the pill (Apple parity). The inset scrubber overlays the
        // bottom padding zone (absolute, bottom-1.5) so it doesn't push
        // the row up — and in responsive-compact, where the scrubber is
        // absent entirely, the row still reads dead-centered.
        pillPy: "py-3.5",
        transportBtn: "w-8 h-8",
        playBtn: "w-9 h-9",
        playIcon: "w-[22px] h-[22px]",
        pauseIcon: "w-[20px] h-[20px]",
        prevNextIcon: "w-4 h-4",
        smallIcon: "w-[14px] h-[14px]",
        cover: "w-8 h-8",
        utilityBtn: "w-9 h-9",
        utilityIcon: 18,
        titleSize: "text-[12.5px]",
        subtitleSize: "text-[10.5px]",
        wideWidth: "min(660px, calc(100% - 32px))",
        // Inset scrubber bounds adapt to the smaller LEFT / RIGHT clusters.
        // LEFT  = 5 transport (8+8+9+8+8) + 4 gaps@2 + divider 8 + padL 12 ≈ 49+44? Empirically tuned below.
        scrubLeft: "left-[206px]",
        scrubRight: "right-[138px]",
      }
    : {
        pillPy: "py-4",
        transportBtn: "w-9 h-9",
        playBtn: "w-11 h-11",
        playIcon: "w-7 h-7",
        pauseIcon: "w-6 h-6",
        prevNextIcon: "w-[18px] h-[18px]",
        smallIcon: "w-4 h-4",
        cover: "w-10 h-10",
        utilityBtn: "w-10 h-10",
        utilityIcon: 20,
        titleSize: "text-[13px]",
        subtitleSize: "text-[11px]",
        wideWidth: "min(760px, calc(100% - 32px))",
        scrubLeft: "left-[237px]",
        scrubRight: "right-[156px]",
      };

  // ── Internal control state ──────────────────────────────────────────
  // Volume cluster mirrors Apple's anatomy: speaker icon always visible,
  // slider slides out to its LEFT on hover, click anywhere on the rail
  // sets level + unmutes, click the speaker toggles mute (preserving the
  // prior level). Glyph swaps with level so the icon itself reads the
  // state at a glance:  X / 1–14% / 15–64% / 65–100%.
  const [volumeMuted, setVolumeMuted] = useState(defaultMuted);
  const [volumeLevel, setVolumeLevel] = useState(defaultVolume);

  // Shuffle: binary toggle. Repeat: tri-state matching Apple's pattern
  // (off → all → one → off). Active states use brand blue.
  // (Fan favorites now render as quiet dimmed-white, not pink.)
  const [shuffleOn, setShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");

  // Scrubber hover — drives Apple's hover treatment: cover + title blur
  // out while elapsed + remaining time labels fade in flush with the
  // bar's edges. Left/right icon clusters stay sharp.
  const [scrubHover, setScrubHover] = useState(false);

  // Cover expand affordance (only when `onExpand` is wired). On pointer
  // devices the Maximize overlay reveals on hover; on touch the first tap
  // reveals it and the second triggers expand (two-tap).
  const [canHover] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover)").matches,
  );
  const [coverRevealed, setCoverRevealed] = useState(false);

  // Manual hide/show — collapses the dock to a small corner pill.
  // Independent of the auto-compact responsive breakpoint above.
  //
  // Default state is COLLAPSED so the dock doesn't dominate the page
  // chrome before anyone has asked for it. The collapsed pill renders
  // differently depending on `hasSelection`:
  //   • no selection → wider "Player" tab with a music glyph + label
  //     so it doesn't read as a chat-bubble FAB.
  //   • selection    → the familiar cover · play · chevron-up pill.
  //
  // Auto-restores when the track CHANGES (not on initial mount) so a
  // new selection always surfaces the full dock — otherwise picking a
  // new track from the collapsed state would leave the user with no
  // cover/title preview of what they just queued up.
  const [dockHidden, setDockHidden] = useState(true);
  const initialTrackRef = useRef(`${track.title}::${track.subtitle ?? ""}`);
  useEffect(() => {
    const key = `${track.title}::${track.subtitle ?? ""}`;
    if (key === initialTrackRef.current) return;
    initialTrackRef.current = key;
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

  // In preview mode the lyrics button is hidden from the right cluster
  // (Apple-match — see the utility cluster below). On wide layouts that
  // narrows the cluster by the lyrics button + gap, so tighten the
  // inline scrubber's right inset to keep the bar reaching to ~12px
  // before the (now lyrics-less) cluster instead of leaving a dead gap.
  // Compact layouts drop the scrubber entirely, so this only matters wide.
  const scrubRightClass =
    !compact && previewMode ? "right-[96px]" : D.scrubRight;

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

  // Both rails support DRAG, not just click. Pointer events with
  // setPointerCapture keep the rail receiving move events even after the
  // cursor leaves the bar bounds — matches Apple/Spotify drag-to-scrub
  // and drag-to-volume. Without this, click-only feels laggy when a user
  // tries to drag and nothing happens until mouseup.
  const applyVolumeFromPointer = (
    el: HTMLDivElement,
    clientX: number,
  ) => {
    const rect = el.getBoundingClientRect();
    const pct = Math.max(
      0,
      Math.min(100, ((clientX - rect.left) / rect.width) * 100),
    );
    const level = Math.round(pct);
    setVolumeLevel(level);
    if (volumeMuted) setVolumeMuted(false);
    onVolumeChange?.(level, false);
  };
  const handleVolumePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    applyVolumeFromPointer(e.currentTarget, e.clientX);
  };
  const handleVolumePointerMove = (
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      applyVolumeFromPointer(e.currentTarget, e.clientX);
    }
  };

  const applyScrubFromPointer = (
    el: HTMLDivElement,
    clientX: number,
  ) => {
    if (!onSeek) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(Math.round(pct * totalSeconds));
  };
  const handleScrubPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!onSeek) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    applyScrubFromPointer(e.currentTarget, e.clientX);
  };
  const handleScrubPointerMove = (
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      applyScrubFromPointer(e.currentTarget, e.clientX);
    }
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

  // Empty/"nothing playing" cover — the white GoodTunes "G" mark on a
  // faint plate instead of a flat gray block. Reads as the brand idle
  // state on the dark dock. Used wherever the host hasn't supplied a
  // `coverNode` (full dock idle + minimized empty cover slot). The G
  // asset has its own internal margin, so a little padding keeps it
  // optically centered without crowding the slot edges.
  const emptyCover = (
    <div
      className="w-full h-full flex items-center justify-center bg-white/[0.06]"
      aria-hidden
    >
      <img
        src="/goodtunes-g-mark.png"
        alt=""
        className="w-full h-full object-contain p-1"
        draggable={false}
      />
    </div>
  );

  // ── Minimized corner pill ──────────────────────────────────────────
  // Intentionally minimal: cover (so the user knows WHAT is playing),
  // play/pause (the one control that might still matter while minimized),
  // and chevron-up to restore. Title omitted — a tooltip on the cover or
  // a dedicated Now Playing sheet can answer that without bloating the pill.
  // Compact (fan) density NEVER collapses to a corner pill — the fan
  // dock behaves like Apple Music's persistent mini-player: always the
  // full rounded bar, sitting in a dormant/idle state when nothing is
  // playing. The caret / collapse-to-corner is admin-only (default
  // density), so this whole minimized branch is gated off for fans.
  if (dockHidden && !isCompactDensity) {
    // Idle (no selection): one button — a wider tab-shaped pill with
    // a music glyph + "Player" label. Reads unambiguously as the music
    // dock instead of a chat-bubble FAB (the prior single-chevron
    // circle was visually identical to Intercom/Crisp). Whole pill is
    // the click target.
    if (!hasSelection) {
      return (
        <div className="fixed left-4 bottom-[calc(2rem+env(safe-area-inset-bottom,0px))] z-40" data-testid="player-dock-mini">
          <button
            type="button"
            aria-label="Show player"
            title="Show player"
            onClick={() => setDockHidden(false)}
            data-testid="button-show-player"
            className="h-10 pl-3 pr-3 rounded-full bg-slate-900/95 backdrop-blur-md text-white shadow-2xl ring-1 ring-white/10 inline-flex items-center gap-2 hover:bg-slate-800/95 transition-colors"
          >
            <Music2 className="w-[18px] h-[18px] text-[#319ED8]" />
            <span className="text-[12.5px] font-semibold tracking-[0.01em] text-fan-primary">
              Player
            </span>
            <ChevronUp className="w-4 h-4 text-fan-secondary -mr-0.5" />
          </button>
        </div>
      );
    }
    // Playing state: cover + play/pause + restore chevron — the user
    // already knows it's the player because a track is loaded.
    return (
      <div className="fixed left-4 bottom-[calc(2rem+env(safe-area-inset-bottom,0px))] z-40" data-testid="player-dock-mini">
        <div className="rounded-full bg-slate-900/95 backdrop-blur-md text-white shadow-2xl ring-1 ring-white/10 flex items-center gap-1 pl-3 pr-2 py-2">
          <div
            className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden"
            aria-label={`${track.title} — now playing`}
            title={track.subtitle ? `${track.title} — ${track.subtitle}` : track.title}
          >
            {coverNode ?? emptyCover}
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
                : "text-fan-faint cursor-not-allowed",
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
            className="w-9 h-9 rounded-full inline-flex items-center justify-center text-fan-primary hover:text-white hover:bg-white/10"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // ── Full dock ──────────────────────────────────────────────────────
  // Wrapper sizing — pill width is CONSTANT across idle / playing so the
  // dock doesn't visibly resize when a track is selected (Apple parity).
  //   • Wide                   → centered 760px pill (capped at viewport − 32).
  //   • Compact + auto narrow  → edge-to-edge (`left-2 right-2`).
  //   • Compact + forced demo  → constrained 640px centered (so demo
  //     callers passing `forceCompact` reproduce the cramped layout even
  //     inside a 1280px iframe).
  const edgeToEdge = compact && forceCompact !== true;
  const wrapperStyle = !compact
    ? { width: D.wideWidth }
    : forceCompact === true
    ? { width: "min(640px, calc(100% - 32px))" }
    : undefined;

  // ── Rail-aware docking ─────────────────────────────────────────────
  // When the host supplies the content-channel insets AND the dock is in
  // its wide regime (not edge-to-edge), center the pill within the channel
  // `[channelLeft, windowWidth − channelRight]` instead of the whole window
  // — so it floats in the gutter between the left nav rail and the right
  // lyrics rail, and slides/resizes when the right rail opens or closes.
  // Edge-to-edge (narrow) keeps the existing full-bleed behavior so the
  // iPad rail/dock overlap is unchanged. The CSS transition on left/width
  // (motion-reduce safe) makes the re-center read as one smooth shift.
  const channelMode =
    !edgeToEdge && channelLeft != null && channelRight != null;
  const channelWidth = channelMode
    ? windowWidth - channelLeft! - channelRight!
    : 0;
  // Gutter the pill keeps on each side of the channel when the channel is
  // narrower than the pill's natural cap (e.g. lyrics open on a non-huge
  // desktop), so it never grazes either rail.
  const CHANNEL_GUTTER = 24;
  const pillCapPx = isCompactDensity ? 660 : 760;
  const rootStyle = channelMode
    ? {
        left: channelLeft! + channelWidth / 2,
        width: `min(${pillCapPx}px, ${Math.max(0, channelWidth - CHANNEL_GUTTER * 2)}px)`,
      }
    : wrapperStyle;

  // Clamp slider handle inside the rail so the knob never hangs off the
  // end-caps at 0% / 100%. Handle is 10px wide → -5px centers it on the
  // tick. Architect flagged this as a polish item during the mockup phase.
  const knobLeft = (pct: number) =>
    `calc(${Math.max(0, Math.min(100, pct))}% - 5px)`;

  return (
    <div
      className={[
        "fixed bottom-[calc(2rem+env(safe-area-inset-bottom,0px))] z-40",
        edgeToEdge
          ? "left-2 right-2"
          : channelMode
          ? "-translate-x-1/2 transition-[left,width] duration-300 ease-out motion-reduce:transition-none"
          : "left-1/2 -translate-x-1/2",
      ].join(" ")}
      style={rootStyle}
      data-testid="player-dock"
    >
      {/* Symmetric vertical padding (`D.pillPy`) keeps every transport
          button + the album cover optically centered on the tallest
          element (Play). Admin uses py-4 (~76px pill); the fan/compact
          dock uses py-3.5 for a tighter Apple-mini-player pill. Either
          way the row is centered and the inset scrubber lives in the
          bottom padding zone (absolute, bottom-1.5). */}
      <div
        className={[
          // Compact (fan) lowers the surface opacity so the existing
          // backdrop-blur actually reads as frosted glass with content
          // blurring behind it (Apple mini-player). Admin (default)
          // stays near-opaque. Single backdrop-filter surface only —
          // never stack a second blur layer here (WebKit hazard).
          isCompactDensity ? "bg-slate-900/70" : "bg-slate-900/95",
          "relative backdrop-blur-md text-fan-primary shadow-2xl ring-1 ring-white/10 overflow-hidden rounded-full",
        ].join(" ")}
      >
        <div className={`flex items-center gap-1.5 px-3 ${D.pillPy}`}>
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
                `${D.transportBtn} rounded-full inline-flex items-center justify-center transition-colors`,
                !hasSelection
                  ? "text-fan-faint cursor-default"
                  : shuffleOn
                  ? "text-[#319ED8] bg-[#319ED8]/15 hover:bg-[#319ED8]/20"
                  : "text-fan-primary hover:text-white hover:bg-white/10",
              ].join(" ")}
            >
              <Shuffle className={D.smallIcon} />
            </button>
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous track"
              data-testid="button-prev"
              className={[
                `${D.transportBtn} rounded-full inline-flex items-center justify-center transition-colors`,
                hasSelection
                  ? "text-fan-primary hover:text-white hover:bg-white/10"
                  : "text-fan-faint cursor-default",
              ].join(" ")}
            >
              <SkipBack className={`${D.prevNextIcon} fill-current`} />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={!playable}
              aria-label={playing ? "Pause" : "Play"}
              data-testid="button-play"
              className={[
                `${D.playBtn} rounded-full inline-flex items-center justify-center transition-colors`,
                playable
                  ? "text-white hover:bg-white/10"
                  : "text-fan-faint cursor-not-allowed",
              ].join(" ")}
            >
              {playing ? (
                // Pause sized down vs Play so the two glyphs read at the
                // same optical weight — Lucide's pause bars are heavier
                // than the Play triangle at equal nominal size.
                <Pause className={`${D.pauseIcon} fill-current`} />
              ) : (
                <Play className={`${D.playIcon} translate-x-[1.5px] fill-current`} />
              )}
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next track"
              data-testid="button-next"
              className={[
                `${D.transportBtn} rounded-full inline-flex items-center justify-center transition-colors`,
                hasSelection
                  ? "text-fan-primary hover:text-white hover:bg-white/10"
                  : "text-fan-faint cursor-default",
              ].join(" ")}
            >
              <SkipForward className={`${D.prevNextIcon} fill-current`} />
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
                `${D.transportBtn} rounded-full inline-flex items-center justify-center transition-colors`,
                !hasSelection
                  ? "text-fan-faint cursor-default"
                  : repeatMode === "off"
                  ? "text-fan-primary hover:text-white hover:bg-white/10"
                  : "text-[#319ED8] bg-[#319ED8]/15 hover:bg-[#319ED8]/20",
              ].join(" ")}
            >
              <RepeatGlyph className={D.smallIcon} />
            </button>
          </div>

          <span className="mx-2 h-6 w-px bg-white/10 flex-shrink-0" aria-hidden />

          {/* ── CENTER · track info ──────────────────────────────
              Cover ~40px (one notch shorter than the 44px Play so
              Play drives the row height). Center cluster blurs out
              while the user is hovering the scrubber so the time
              labels above the bar read cleanly.

              Idle (no selection) collapses to a single centered, dimmed
              gray GoodTunes "G" mark — no cover plate, no title text (so
              a host-supplied "Not playing" never appears) — mirroring
              Apple's calm idle dock where the whole pill reads as one
              gray state. The center keeps its `flex-1` footprint either
              way so the pill width doesn't jump between idle/playing. */}
          {hasSelection ? (
            <div
              className={[
                "flex items-center gap-3 min-w-0 flex-1 transition-[filter,opacity] duration-150",
                scrubHover ? "blur-[6px] opacity-50" : "",
              ].join(" ")}
              aria-hidden={scrubHover}
            >
              <div
                className={`${D.cover} relative flex-shrink-0 rounded-md overflow-hidden group/expand`}
                onClick={
                  onExpand && !canHover
                    ? () => {
                        if (coverRevealed) {
                          onExpand();
                          setCoverRevealed(false);
                        } else {
                          setCoverRevealed(true);
                        }
                      }
                    : undefined
                }
              >
                {coverNode ?? emptyCover}
                {onExpand && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExpand();
                      setCoverRevealed(false);
                    }}
                    aria-label="Expand to full-screen player"
                    className={[
                      "absolute inset-0 flex items-center justify-center transition-opacity duration-150",
                      canHover
                        ? "opacity-0 group-hover/expand:opacity-100"
                        : coverRevealed
                          ? "opacity-100"
                          : "opacity-0 pointer-events-none",
                    ].join(" ")}
                    style={{ background: "rgba(0,0,0,0.45)" }}
                    data-testid="button-expand-player"
                  >
                    <Maximize2 className="w-4 h-4 text-white" />
                    <span className="sr-only">Expand</span>
                  </button>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {onTitleActivate ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTitleActivate();
                      }}
                      className={`${D.titleSize} font-semibold truncate leading-tight text-left max-w-full active:underline underline-offset-2`}
                      data-testid="text-track-title"
                    >
                      {track.title}
                    </button>
                  ) : (
                    <div
                      className={`${D.titleSize} font-semibold truncate leading-tight`}
                      data-testid="text-track-title"
                    >
                      {track.title}
                    </div>
                  )}
                  {previewMode && (
                    <span
                      className="inline-flex items-center px-1.5 h-[14px] rounded-[3px] text-[9.5px] font-bold uppercase tracking-[0.08em] flex-shrink-0"
                      style={{ background: "rgba(255,84,112,0.18)", color: "#FF5470" }}
                      data-testid="badge-preview-mode"
                    >
                      Preview
                    </span>
                  )}
                </div>
                {track.subtitle &&
                  (onSubtitleActivate ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSubtitleActivate();
                      }}
                      className={`${D.subtitleSize} text-fan-secondary truncate leading-tight mt-0.5 block text-left max-w-full active:underline underline-offset-2`}
                      data-testid="text-track-subtitle"
                    >
                      {track.subtitle}
                    </button>
                  ) : (
                    <div
                      className={`${D.subtitleSize} text-fan-secondary truncate leading-tight mt-0.5`}
                      data-testid="text-track-subtitle"
                    >
                      {track.subtitle}
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div
              className="flex items-center justify-center flex-1"
              data-testid="player-dock-idle"
              aria-hidden
            >
              {/* Compact has no inset scrubber, so the idle "G" simply
                  centers within this now-playing slot. In wide mode the
                  G is rendered as an overlay (below) so it can center
                  over the progress line's horizontal span instead of
                  this slightly off-center cluster. The empty flex-1
                  footprint stays so the right utility cluster keeps its
                  position and the pill doesn't shift. */}
              {compact && (
                <img
                  src="/goodtunes-g-mark.png"
                  alt=""
                  className={`${D.cover} object-contain p-0.5 grayscale opacity-40`}
                  draggable={false}
                />
              )}
            </div>
          )}

          {/* ── RIGHT · utility cluster ──────────────────────────
              Lyrics glyph + volume cluster + minimize chevron.
              ⋯ song-options menu intentionally omitted: Apple
              surfaces it for fan-side options that the consuming
              surface (album/track row) already owns elsewhere. */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Lyrics mic — rendered ALWAYS so the dock anatomy is
                complete; if the host hasn't wired `onLyrics` yet (admin
                today) the button is a visual-only placeholder. Same
                slot will fire the Lyrics overlay once it's wired.
                EXCEPTION: hidden entirely while a track is in Preview
                (the rose "Preview" badge is showing). Apple Music drops
                the lyrics control in preview, and it's driven by the
                SAME `previewMode` flag as the badge so the two stay in
                lock-step. Side benefit: fans can't open lyrics for a
                track they haven't bought. */}
            {!previewMode && (
            <button
              type="button"
              aria-label={lyricsActive ? "Hide lyrics" : "Show lyrics"}
              aria-pressed={onLyrics ? lyricsActive : undefined}
              title={
                onLyrics
                  ? lyricsActive
                    ? "Hide lyrics"
                    : "Show lyrics"
                  : "Lyrics unavailable"
              }
              onClick={onLyrics}
              disabled={!onLyrics || !hasSelection}
              data-testid="button-lyrics"
              className={[
                `${D.utilityBtn} rounded-full inline-flex items-center justify-center transition-colors`,
                onLyrics && hasSelection
                  ? lyricsActive
                    ? "bg-white/10 hover:bg-white/15"
                    : "text-fan-primary hover:text-white hover:bg-white/10"
                  : "text-fan-faint cursor-default",
              ].join(" ")}
              style={
                onLyrics && hasSelection && lyricsActive
                  ? { color: "var(--brand-blue)" }
                  : undefined
              }
            >
              <LyricsIcon size={D.utilityIcon} />
            </button>
            )}
            {/* Volume cluster — slider slides out left on hover.
                Hidden in compact: Apple drops volume from its narrow
                mini-player too. The title gets the ~46px back.
                Rail bg lifted to white/25 so the empty (right-of-knob)
                portion reads as a track rather than blending into
                the dark pill. Fill transition dropped so clicks on the
                rail snap immediately to the new level. */}
            {!compact && (
              <div className="group/vol flex items-center pr-0.5">
                <div className="overflow-hidden transition-[width,margin] duration-200 ease-out w-0 group-hover/vol:w-[68px] group-hover/vol:mr-1.5">
                  <div
                    className="relative w-16 h-[3px] bg-slate-500 rounded-full cursor-pointer touch-none select-none"
                    onPointerDown={handleVolumePointerDown}
                    onPointerMove={handleVolumePointerMove}
                    data-testid="rail-volume"
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-white rounded-full"
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
                  className={[
                    `${D.utilityBtn} rounded-full inline-flex items-center justify-center transition-colors`,
                    hasSelection
                      ? "text-fan-primary hover:text-white hover:bg-white/10"
                      : "text-fan-faint",
                  ].join(" ")}
                >
                  <VolumeGlyph className={isCompactDensity ? "w-[18px] h-[18px]" : "w-5 h-5"} />
                </button>
              </div>
            )}

            {/* Minimize — collapses to the corner pill. ChevronDown
                points toward where the mini-pill will land. Available
                in both idle AND playing states so a host like the
                admin Tracks tab can tuck the dock away while editing
                without first having to pick a track. Omitted on the
                fan-facing (compact) dock — fans don't tuck the player
                away, matching Apple Music's persistent mini-player. */}
            {!isCompactDensity && (
              <button
                type="button"
                aria-label="Minimize player"
                title="Minimize player"
                onClick={() => setDockHidden(true)}
                data-testid="button-minimize-player"
                className={`${D.utilityBtn} rounded-full inline-flex items-center justify-center text-fan-primary hover:text-white hover:bg-white/10`}
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Inline progress bar (wide only) ───────────────────────
            Bar is SCOPED to the now-playing card area: ~12px past the
            repeat button on the left and ~12px before the lyrics
            button on the right, so the gap-to-nearest-icon reads
            symmetric. Bar does NOT run under the transport buttons.
            In compact mode the inline scrubber is dropped entirely —
            Apple's narrow mini-player does the same. Tap to expand for
            scrubbing (a separate Now Playing sheet, owned by the host). */}
        {/* Idle (no selection): center the GoodTunes "G" over the SAME
            horizontal span the progress line occupies (the inset
            scrubber bounds), so it reads as deliberately centered in
            the pill rather than centered within the off-center
            now-playing cluster. The inline progress line itself is
            suppressed entirely in this state (gated below). */}
        {!compact && !hasSelection && (
          <div
            className={`absolute ${D.scrubLeft} ${D.scrubRight} inset-y-0 flex items-center justify-center pointer-events-none`}
            data-testid="player-dock-idle-mark"
            aria-hidden
          >
            <img
              src="/goodtunes-g-mark.png"
              alt=""
              className={`${D.cover} object-contain p-0.5 grayscale opacity-40`}
              draggable={false}
            />
          </div>
        )}
        {!compact && hasSelection && (
          <>
            <div
              className={[
                `absolute ${D.scrubLeft} ${scrubRightClass} inset-y-0 flex items-center justify-between pointer-events-none z-10`,
                "transition-opacity duration-150",
                scrubHover && hasSelection ? "opacity-100" : "opacity-0",
              ].join(" ")}
            >
              <span
                className={`${D.titleSize} tabular-nums text-fan-faint whitespace-nowrap`}
                data-testid="text-elapsed"
              >
                {fmt(elapsedSeconds)}
              </span>
              <span
                className={`${D.titleSize} tabular-nums text-fan-faint whitespace-nowrap`}
                data-testid="text-remaining"
              >
                −{fmt(remainingSeconds)}
              </span>
            </div>
            <div
              className={[
                `group/scrub absolute ${D.scrubLeft} ${scrubRightClass} bottom-1.5 h-3 flex items-center touch-none select-none`,
                hasSelection ? "cursor-pointer" : "cursor-default pointer-events-none",
              ].join(" ")}
              onMouseEnter={() => setScrubHover(true)}
              onMouseLeave={() => setScrubHover(false)}
              onPointerDown={hasSelection ? handleScrubPointerDown : undefined}
              onPointerMove={hasSelection ? handleScrubPointerMove : undefined}
              data-testid="rail-scrubber"
            >
              {/* Rail bg lifted to white/40 (was /25) so the remainder
                  reads clearly on the dark pill — matches the mock.
                  White elapsed sits on top with no transition and the
                  rail drives off pointer events (drag-to-scrub), so the
                  bar tracks the cursor in real time. */}
              <div className="relative flex-1 h-[2px] rounded-full bg-slate-500 transition-[height,background-color] duration-100 group-hover/scrub:h-[4px] group-hover/scrub:bg-slate-400 group-active/scrub:h-[5px] group-active/scrub:bg-slate-300">
                <div
                  className="absolute inset-y-0 left-0 bg-white rounded-full"
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
