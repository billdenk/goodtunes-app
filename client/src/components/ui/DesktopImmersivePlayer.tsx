import { useEffect, useState } from "react";
import {
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Play,
  Pause,
  X,
} from "lucide-react";
import { usePlayer, PREVIEW_CAP_SECONDS } from "@/context/PlayerContext";
import { formatDuration } from "@/data/musicData";
import { IconButton } from "@/components/ui/IconButton";
import { LyricsIcon } from "@/components/ui/LyricsIcon";
import { SyncedLyrics } from "@/components/ui/SyncedLyrics";
import { BRAND_BG } from "@/components/ui/AlbumDesktopSidebar";

/**
 * Desktop full-screen immersive player (Task #1056). Apple-Music's
 * "expanded" Now Playing for the web surface: a full-width overlay with
 * the album art + transport on the LEFT and the synced karaoke lyrics on
 * the RIGHT. A toggle (the Lyrics glyph) collapses the lyrics column to a
 * centred art+transport "player-only" layout; the close X returns to the
 * desktop album page. Every control reads/writes the shared PlayerContext
 * so playback stays in lock-step with the bottom PlayerDock — opening or
 * closing this overlay never touches the audio element.
 *
 * Desktop-only — mounted from AlbumDetailDesktop. The lyrics column is the
 * exact same `SyncedLyrics` surface the mobile player renders, so the
 * karaoke timing/highlight/auto-scroll/gap-dots behaviour is identical.
 *
 * The lyrics-shown state is the host's `player.showLyrics`, so toggling it
 * here also reflects in the inline desktop lyrics panel after close.
 */
export function DesktopImmersivePlayer({ onClose }: { onClose: () => void }) {
  const {
    currentSong,
    isPlaying,
    togglePlay,
    next,
    prev,
    currentTime,
    duration,
    seekTo,
    shuffle,
    repeat,
    toggleShuffle,
    toggleRepeat,
    showLyrics,
    setShowLyrics,
    previewMode,
  } = usePlayer();

  // Volume is a local, visual control here to match the bottom PlayerDock
  // and the mobile player (the audio element's gain isn't wired to a
  // global control in PlayerContext). Kept so the immersive transport has
  // full parity with the dock cluster.
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);

  // Esc closes the overlay (Apple-Music / macOS convention). Playback is
  // untouched — only the overlay unmounts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!currentSong) return null;

  // Under preview-mode the scrubber denominator is the 30-sec cap, not the
  // song's true duration — mirrors the dock's preview behaviour.
  const denom = previewMode ? PREVIEW_CAP_SECONDS : duration;
  const progress = denom > 0 ? Math.min(1, currentTime / denom) : 0;
  const remaining = Math.max(0, denom - currentTime);

  const handleSeek = (s: number) => {
    if (previewMode) seekTo(Math.min(s, PREVIEW_CAP_SECONDS - 0.1));
    else seekTo(s);
  };

  const repeatActive = repeat !== "none";

  return (
    <div
      className="fixed inset-0 z-[70] text-white overflow-hidden"
      style={{ background: BRAND_BG }}
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
      data-testid="immersive-player"
    >
      {/* Blurred album-art backdrop — the single backdrop surface in this
          overlay (no stacked blur). A navy scrim keeps the foreground
          legible regardless of artwork brightness. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${currentSong.album.artwork})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(64px) saturate(1.4)",
          transform: "scale(1.2)",
          opacity: 0.5,
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,6,43,0.55), rgba(0,6,43,0.82))",
        }}
        aria-hidden
      />

      <div className="relative z-10 h-full flex flex-col">
        {/* Top bar — layout toggle (lyrics on/off) + close. */}
        <div className="flex items-center justify-end gap-2 px-6 pt-6">
          <IconButton
            variant="ghost"
            size="lg"
            label={showLyrics ? "Hide lyrics" : "Show lyrics"}
            aria-pressed={showLyrics}
            onClick={() => setShowLyrics(!showLyrics)}
            data-testid="button-immersive-toggle-lyrics"
            style={showLyrics ? { color: "var(--brand-blue)" } : undefined}
          >
            <LyricsIcon />
          </IconButton>
          <IconButton
            variant="ghost"
            size="lg"
            label="Close full screen"
            onClick={onClose}
            data-testid="button-immersive-close"
          >
            <X />
          </IconButton>
        </div>

        {/* Main split — art + transport on the left, lyrics on the right.
            When lyrics are hidden the left column centers itself for the
            "player-only" layout. */}
        <div className="flex-1 min-h-0 flex items-stretch gap-8 px-10 pb-12 lg:px-16">
          <div
            className={[
              "flex flex-col items-center justify-center min-w-0",
              showLyrics ? "w-[44%] max-w-[560px]" : "mx-auto w-full max-w-[620px]",
            ].join(" ")}
          >
            {/* Album art */}
            <div
              className="w-full max-w-[420px] aspect-square rounded-2xl overflow-hidden"
              style={{ boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}
            >
              <img
                src={currentSong.album.artwork}
                alt=""
                className="w-full h-full object-cover"
                draggable={false}
                data-testid="img-immersive-art"
              />
            </div>

            {/* Title + artist */}
            <div className="w-full max-w-[420px] mt-7">
              <div
                className="font-bold tracking-[-0.01em] truncate"
                style={{ fontSize: 26 }}
                data-testid="text-immersive-title"
              >
                {currentSong.title}
              </div>
              <div
                className="text-white/60 truncate mt-1"
                style={{ fontSize: 17 }}
                data-testid="text-immersive-artist"
              >
                {currentSong.album.artist}
              </div>
            </div>

            {/* Scrubber */}
            <div className="w-full max-w-[420px] mt-6">
              <div className="relative w-full h-[4px] rounded-full overflow-hidden">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ background: "rgba(255,255,255,0.22)" }}
                />
                <div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{
                    width: `${progress * 100}%`,
                    background: "white",
                    transition: "width 1s linear",
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={denom || 100}
                  value={currentTime}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                  aria-label="Seek"
                  data-testid="input-immersive-seek"
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-white/55 tabular-nums" style={{ fontSize: 12 }}>
                  {formatDuration(currentTime)}
                </span>
                <span className="text-white/55 tabular-nums" style={{ fontSize: 12 }}>
                  -{formatDuration(remaining)}
                </span>
              </div>
            </div>

            {/* Transport — shuffle · prev · play/pause · next · repeat */}
            <div className="flex items-center justify-center gap-3 mt-5">
              <IconButton
                variant="ghost"
                size="md"
                label="Shuffle"
                aria-pressed={shuffle}
                onClick={toggleShuffle}
                data-testid="button-immersive-shuffle"
                style={shuffle ? { color: "var(--brand-blue)" } : undefined}
              >
                <Shuffle />
              </IconButton>
              <IconButton
                variant="ghost"
                size="lg"
                label="Previous"
                onClick={prev}
                data-testid="button-immersive-prev"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h2v12H6z" />
                  <path d="M18 18l-8.5-6 8.5-6v12z" />
                </svg>
              </IconButton>
              <IconButton
                variant="glass"
                size="lg"
                label={isPlaying ? "Pause" : "Play"}
                onClick={togglePlay}
                className="!w-16 !h-16 [&>svg]:!w-7 [&>svg]:!h-7"
                data-testid="button-immersive-play"
              >
                {isPlaying ? (
                  <Pause fill="currentColor" strokeWidth={0} />
                ) : (
                  <Play fill="currentColor" strokeWidth={0} />
                )}
              </IconButton>
              <IconButton
                variant="ghost"
                size="lg"
                label="Next"
                onClick={next}
                data-testid="button-immersive-next"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 6h2v12h-2z" />
                  <path d="M6 6l8.5 6L6 18V6z" />
                </svg>
              </IconButton>
              <IconButton
                variant="ghost"
                size="md"
                label={
                  repeat === "one"
                    ? "Repeat one"
                    : repeat === "all"
                      ? "Repeat all"
                      : "Repeat off"
                }
                aria-pressed={repeatActive}
                onClick={toggleRepeat}
                data-testid="button-immersive-repeat"
                style={repeatActive ? { color: "var(--brand-blue)" } : undefined}
              >
                {repeat === "one" ? <Repeat1 /> : <Repeat />}
              </IconButton>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-3 mt-6 w-full max-w-[280px]">
              <IconButton
                variant="ghost"
                size="md"
                label={muted ? "Unmute" : "Mute"}
                aria-pressed={muted}
                onClick={() => setMuted((m) => !m)}
                data-testid="button-immersive-mute"
              >
                {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
              </IconButton>
              <div className="relative flex-1 h-[4px] rounded-full overflow-hidden">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ background: "rgba(255,255,255,0.22)" }}
                />
                <div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{
                    width: `${muted ? 0 : volume}%`,
                    background: "rgba(255,255,255,0.9)",
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(Number(e.target.value));
                    if (muted) setMuted(false);
                  }}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                  aria-label="Volume"
                  data-testid="input-immersive-volume"
                />
              </div>
            </div>
          </div>

          {/* Lyrics column */}
          {showLyrics && (
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              <SyncedLyrics
                lyrics={currentSong.lyrics}
                duration={duration}
                syncedLyrics={currentSong.syncedLyrics}
                currentTime={currentTime}
                onSeek={seekTo}
                writers={(currentSong as any).writers}
                active={showLyrics}
                fontSize={34}
                gapClassName="gap-4"
                scrollOffsetRatio={0.32}
                paddingTop="14vh"
                paddingBottom="26vh"
                className="flex-1 min-h-0 px-2"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
