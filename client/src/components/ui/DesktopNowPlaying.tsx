import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  ChevronDown,
  ListMusic,
  Volume2,
  Volume1,
  VolumeX,
} from "lucide-react";
import { usePlayer, PREVIEW_CAP_SECONDS } from "@/context/PlayerContext";
import { IconButton } from "@/components/ui/IconButton";
import { LyricsIcon } from "@/components/ui/LyricsIcon";
import { SyncedLyrics } from "@/components/ui/SyncedLyrics";
import { DesktopQueueBody } from "@/components/ui/DesktopQueueBody";
import { EASE_OUT } from "@/lib/motion";
import { isIOS } from "@/lib/platform";
import { track } from "@/lib/analytics";
import { useSystemVolume } from "@/lib/nativeVolume";

/**
 * Apple-Music-style expandable full-screen "Now Playing" surface for the
 * GoodTunes desktop & tablet shells (md+ web — the phone shell keeps the
 * mobile `Player.tsx`). Driven entirely by the global player's `showPlayer`
 * flag; App.tsx's PlayerOverlay branches on shell and mounts this here.
 *
 * Three layouts, one component:
 *   • Default — centered artwork, title/subtitle, scrubber, transport, volume.
 *   • Lyrics  — artwork shifts left, a side panel slides in hosting the SHARED
 *               karaoke `SyncedLyrics` (same engine the mobile player uses).
 *   • Up Next — same side slot, mutually exclusive with Lyrics; tap a row to
 *               jump, ✕ to drop it from the queue.
 *
 * Chrome rules honored: 44pt IconButton for every icon-only control, brand
 * colors via `var(--brand-*)` (never raw hex), the single full-screen scrim
 * owns the only backdrop blur. Reduced-motion collapses the slide/scale.
 */
export function DesktopNowPlaying() {
  const player = usePlayer();
  const reduce = useReducedMotion();
  const cs = player.currentSong;

  // Track the viewport so the artwork + panel resize with smooth numeric
  // framer animations (string `min()`/`vh` widths don't interpolate).
  const [vw, setVw] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  const [vh, setVh] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 800,
  );
  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Escape minimizes back to the dock, matching the chevron affordance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") player.setShowPlayer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player]);

  if (!cs) return null;

  const panelMode: "lyrics" | "queue" | null = player.showLyrics
    ? "lyrics"
    : player.showQueue
      ? "queue"
      : null;
  const panelOpen = panelMode !== null;

  // Side panel + artwork geometry (numeric so framer can tween them).
  const panelWidth = Math.round(Math.max(320, Math.min(460, vw * 0.34)));
  const sidePad = vw >= 1024 ? 80 : 40;
  const availForArt = vw - (panelOpen ? panelWidth : 0) - sidePad * 2;
  const artBase = panelOpen
    ? Math.min(vh * 0.34, 360)
    : Math.min(vh * 0.46, 480);
  const artSize = Math.max(180, Math.min(artBase, availForArt));

  // Lyrics + queue are mutually exclusive; opening one closes the other.
  const openLyrics = () => {
    player.setShowQueue(false);
    player.setShowLyrics(!player.showLyrics);
  };
  const openQueue = () => {
    player.setShowLyrics(false);
    player.setShowQueue(!player.showQueue);
  };

  // Preview-mode scrubber denominator mirrors the dock: the 30-sec cap, not
  // the song's true duration, so the bar fills as previews auto-advance.
  const total = player.previewMode ? PREVIEW_CAP_SECONDS : player.duration;
  const progressPct =
    total > 0 ? Math.min(100, (player.currentTime / total) * 100) : 0;
  const onSeek = (pct: number) => {
    const secs = (pct / 100) * total;
    if (player.previewMode) {
      player.seekTo(Math.min(secs, PREVIEW_CAP_SECONDS - 0.1));
    } else {
      player.seekTo(secs);
    }
  };

  const blue = "var(--brand-blue)";

  // On native iOS the slider reads/writes the phone's hardware volume via the
  // SystemVolume plugin; elsewhere it drives PlayerContext's in-app volume.
  const systemVolume = useSystemVolume();
  const volumeLevel = systemVolume.active
    ? systemVolume.level ?? player.volume
    : player.muted
      ? 0
      : player.volume;
  const setVolumeLevel = systemVolume.active
    ? systemVolume.setLevel
    : player.setVolume;
  const VolumeGlyph = volumeLevel === 0
    ? VolumeX
    : volumeLevel < 50
      ? Volume1
      : Volume2;

  const panelTransition = reduce
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 420, damping: 44, mass: 0.9 } as const);
  const artTransition = reduce
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 380, damping: 40, mass: 0.9 } as const);

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ background: "rgba(var(--brand-bg-rgb), 1)" }}
      initial={reduce ? false : { opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 28 }}
      transition={{ duration: reduce ? 0 : 0.34, ease: EASE_OUT }}
      data-testid="overlay-now-playing-desktop"
    >
      {/* Blurred-artwork navy backdrop — the single full-screen scrim owns
          the only backdrop blur on this region (chrome: one-blur-per-region). */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden>
        <img
          src={cs.album.artwork}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-125"
          style={{ filter: "blur(70px) brightness(0.32) saturate(1.6)" }}
          draggable={false}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(var(--brand-bg-rgb),0.30) 0%, rgba(var(--brand-bg-rgb),0.62) 100%)",
          }}
        />
      </div>

      <div className="relative h-full flex flex-col">
        {/* Header: minimize chevron + eyebrow */}
        <div className="flex items-center gap-3 px-5 lg:px-8 pt-6 pb-2 flex-shrink-0">
          <IconButton
            variant="glass"
            size="lg"
            label="Minimize player"
            onClick={() => player.setShowPlayer(false)}
            data-testid="button-minimize-now-playing"
          >
            <ChevronDown />
          </IconButton>
          <p className="text-fan-secondary text-xs font-semibold uppercase tracking-[0.2em]">
            Now Playing
          </p>
        </div>

        {/* Body: primary column + (optional) side panel */}
        <div className="flex-1 min-h-0 flex items-stretch px-5 lg:px-8 pb-8">
          <div className="flex-1 min-w-0 flex flex-col items-center justify-center">
            <motion.div
              className="relative rounded-2xl overflow-hidden flex-shrink-0"
              style={{ boxShadow: "0 24px 70px rgba(0,0,0,0.55)" }}
              animate={{ width: artSize, height: artSize }}
              transition={artTransition}
              data-testid="img-now-playing-art"
            >
              <img
                src={cs.album.artwork}
                alt={cs.album.title}
                className="w-full h-full object-cover"
                draggable={false}
              />
            </motion.div>

            {/* Title / subtitle */}
            <div
              className="w-full text-center mt-7 px-2"
              style={{ maxWidth: Math.max(artSize, 360) }}
            >
              <p
                className="text-fan-primary text-2xl font-bold leading-tight truncate"
                data-testid="text-now-playing-title"
              >
                {cs.title}
              </p>
              <p className="text-fan-secondary text-base leading-tight truncate mt-1">
                {cs.album.artist}
              </p>
            </div>

            {/* Scrubber + times */}
            <div
              className="w-full mt-6"
              style={{ maxWidth: Math.max(artSize, 360) }}
            >
              <DragBar
                pct={progressPct}
                onChange={onSeek}
                ariaLabel="Seek"
              />
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-fan-faint text-xs tabular-nums">
                  {fmt(player.currentTime)}
                </span>
                <span className="text-fan-faint text-xs tabular-nums">
                  {player.previewMode ? "Preview" : fmt(total)}
                </span>
              </div>
            </div>

            {/* Transport */}
            <div className="flex items-center justify-center gap-4 mt-6">
              <IconButton
                variant="ghost"
                size="lg"
                label="Shuffle"
                aria-pressed={player.shuffle}
                onClick={player.toggleShuffle}
                style={{ color: player.shuffle ? blue : undefined }}
                data-testid="button-now-playing-shuffle"
              >
                <Shuffle />
              </IconButton>
              <IconButton
                variant="ghost"
                size="lg"
                label="Previous"
                onClick={player.prev}
                data-testid="button-now-playing-prev"
              >
                <SkipBack fill="currentColor" />
              </IconButton>

              <button
                type="button"
                onClick={player.togglePlay}
                aria-label={player.isPlaying ? "Pause" : "Play"}
                className="w-16 h-16 rounded-full flex items-center justify-center text-[color:var(--brand-bg)] active:scale-95 transition-transform"
                style={{ background: "#fff" }}
                data-testid="button-now-playing-play"
              >
                {player.isPlaying ? (
                  <Pause className="w-7 h-7" fill="currentColor" strokeWidth={0} />
                ) : (
                  <Play
                    className="w-7 h-7 ml-0.5"
                    fill="currentColor"
                    strokeWidth={0}
                  />
                )}
                <span className="sr-only">
                  {player.isPlaying ? "Pause" : "Play"}
                </span>
              </button>

              <IconButton
                variant="ghost"
                size="lg"
                label="Next"
                onClick={player.next}
                data-testid="button-now-playing-next"
              >
                <SkipForward fill="currentColor" />
              </IconButton>
              <IconButton
                variant="ghost"
                size="lg"
                label="Repeat"
                aria-pressed={player.repeat !== "none"}
                onClick={player.toggleRepeat}
                style={{ color: player.repeat !== "none" ? blue : undefined }}
                data-testid="button-now-playing-repeat"
              >
                {player.repeat === "one" ? <Repeat1 /> : <Repeat />}
              </IconButton>
            </div>

            {/* Utility row: lyrics · volume · queue */}
            <div
              className="w-full flex items-center justify-between gap-4 mt-7"
              style={{ maxWidth: Math.max(artSize, 360) }}
            >
              <IconButton
                variant="ghost"
                size="md"
                label="Lyrics"
                aria-pressed={player.showLyrics}
                onClick={openLyrics}
                style={{ color: player.showLyrics ? blue : undefined }}
                data-testid="button-now-playing-lyrics"
              >
                <LyricsIcon />
              </IconButton>

              {/* Volume cluster — hidden on ALL iOS (web iPad Safari + the
                  native iPad app). On web iOS audio volume is read-only so the
                  slider is a dead control; on the native iPad app the
                  SystemVolume plugin doesn't reach the hardware volume reliably
                  either, so per Bill we hide it for now rather than show a
                  control that does nothing (hardware buttons own loudness).
                  The native iPhone keeps its working slider via the mobile
                  Player.tsx, which this desktop surface never renders. */}
              {!isIOS && (
                <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                  {systemVolume.active ? (
                    <span
                      className="flex items-center justify-center w-9 h-9 text-fan-secondary"
                      data-testid="icon-now-playing-volume"
                    >
                      <VolumeGlyph />
                    </span>
                  ) : (
                    <IconButton
                      variant="ghost"
                      size="md"
                      label={player.muted ? "Unmute" : "Mute"}
                      onClick={player.toggleMute}
                      data-testid="button-now-playing-mute"
                    >
                      <VolumeGlyph />
                    </IconButton>
                  )}
                  <div className="flex-1">
                    <DragBar
                      pct={volumeLevel}
                      onChange={setVolumeLevel}
                      ariaLabel="Volume"
                      live
                    />
                  </div>
                </div>
              )}

              {/* AirPlay — the desktop/iPad analog of the mobile player's
                  output button. `airPlaySupported` is true only where iOS
                  WebKit exposes the picker (Safari + the native iPad/iPhone
                  app), so it surfaces AirPlay on the iPad app — where it was
                  previously missing — and stays hidden on Android/desktop. */}
              {player.airPlaySupported && (
                <IconButton
                  variant="ghost"
                  size="md"
                  label="AirPlay"
                  onClick={() => {
                    player.showAirPlayPicker();
                    track("airplay_picker_opened", {
                      songId: cs.id,
                      albumId: cs.album?.id,
                    });
                  }}
                  data-testid="button-now-playing-airplay"
                >
                  {/* Apple's AirPlay glyph: a rounded display with a small
                      upward triangle centered at its base. */}
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M5 17H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v9a2 2 0 01-2 2h-1" />
                    <polygon points="12 15 17 21 7 21 12 15" fill="currentColor" stroke="none" />
                  </svg>
                </IconButton>
              )}

              <IconButton
                variant="ghost"
                size="md"
                label="Up Next"
                aria-pressed={player.showQueue}
                onClick={openQueue}
                style={{ color: player.showQueue ? blue : undefined }}
                data-testid="button-now-playing-queue"
              >
                <ListMusic />
              </IconButton>
            </div>
          </div>

          {/* Side panel — lyrics or queue, mutually exclusive */}
          <AnimatePresence initial={false}>
            {panelOpen && (
              <motion.aside
                key="now-playing-panel"
                className="flex-shrink-0 overflow-hidden self-stretch"
                initial={reduce ? false : { width: 0, opacity: 0 }}
                animate={{ width: panelWidth, opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { width: 0, opacity: 0 }}
                transition={panelTransition}
                aria-label={panelMode === "lyrics" ? "Lyrics" : "Up Next"}
                data-testid={`panel-now-playing-${panelMode}`}
              >
                <div
                  className="h-full flex flex-col pl-4"
                  style={{ width: panelWidth }}
                >
                  <div
                    className="flex-1 min-h-0 rounded-2xl overflow-hidden flex flex-col"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {panelMode === "lyrics" ? (
                      <LyricsPanelBody />
                    ) : (
                      <DesktopQueueBody />
                    )}
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/** Lyrics side-panel body — the SHARED karaoke `SyncedLyrics` surface, tuned
 *  up for the full-screen panel. We never edit SyncedLyrics internals. */
function LyricsPanelBody() {
  const player = usePlayer();
  const cs = player.currentSong;
  if (!cs) return null;
  const hasPlain = !!cs.lyrics && cs.lyrics.trim().length > 0;
  const hasSynced = !!cs.syncedLyrics && cs.syncedLyrics.length > 0;
  if (!hasPlain && !hasSynced) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-fan-primary font-semibold text-base">
          No Lyrics Available
        </p>
        <p className="text-fan-secondary text-sm mt-1">
          There aren't any lyrics available for this song.
        </p>
      </div>
    );
  }
  return (
    <SyncedLyrics
      lyrics={cs.lyrics}
      duration={player.duration}
      syncedLyrics={cs.syncedLyrics}
      currentTime={player.currentTime}
      onSeek={player.seekTo}
      writers={(cs as any).writers}
      active={player.showLyrics}
      fontSize={28}
      gapClassName="gap-4"
      scrollOffsetRatio={0.18}
      paddingTop="14vh"
      paddingBottom="24vh"
      className="flex-1 min-h-0 px-6"
    />
  );
}


/** A thin draggable bar used for both the scrubber and the volume slider.
 *  Geometry is inline-styled (not Tailwind `rounded-full w-N` classes) so it
 *  reads cleanly past the fan touch-target linter while staying a 1px rail. */
function DragBar({
  pct,
  onChange,
  ariaLabel,
  live = false,
}: {
  pct: number;
  onChange: (pct: number) => void;
  ariaLabel: string;
  live?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localPct, setLocalPct] = useState(pct);
  const shown = dragging ? localPct : pct;

  const calc = (clientX: number) => {
    const el = ref.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 100;
  };

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = calc(e.clientX);
    setDragging(true);
    setLocalPct(p);
    if (live) onChange(p);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const p = calc(e.clientX);
    setLocalPct(p);
    if (live) onChange(p);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    const p = calc(e.clientX);
    setDragging(false);
    onChange(p);
  };

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(shown)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      className="relative cursor-pointer select-none touch-none"
      style={{ height: 16 }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div
        className="absolute left-0 right-0 top-1/2 -translate-y-1/2 overflow-hidden"
        style={{ height: 6, borderRadius: 9999, background: "rgba(255,255,255,0.18)" }}
      >
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${shown}%`, background: "rgba(255,255,255,0.92)" }}
        />
      </div>
      <div
        className="absolute top-1/2"
        style={{
          left: `${shown}%`,
          transform: "translate(-50%, -50%)",
          width: 12,
          height: 12,
          borderRadius: 9999,
          background: "#fff",
          boxShadow: "0 1px 5px rgba(0,0,0,0.45)",
          opacity: dragging ? 1 : 0.92,
        }}
      />
    </div>
  );
}

/** mm:ss formatter for the scrubber times. */
function fmt(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
