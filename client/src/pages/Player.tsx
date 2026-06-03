import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion, type Transition } from "framer-motion";
import { useLocation } from "wouter";
import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/data/musicData";
import { LyricsIcon } from "@/components/ui/LyricsIcon";
import { IconButton } from "@/components/ui/IconButton";
import { SyncedLyrics } from "@/components/ui/SyncedLyrics";
import { PlaylistPickerSheet } from "@/components/PlaylistPickerSheet";
import { track } from "@/lib/analytics";

export function Player() {
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
    showAddToPlaylist,
    setShowAddToPlaylist,
    showQueue,
    setShowQueue,
    autoplay,
    toggleAutoplay,
    queue,
    currentIndex,
    playSong,
    removeFromQueue,
    setShowPlayer,
    toggleFavorite,
    isFavorite,
    airPlaySupported,
    showAirPlayPicker,
  } = usePlayer();

  const [volume, setVolume] = useState(80);
  const [showGoToMenu, setShowGoToMenu] = useState(false);
  const [showLyricsMenu, setShowLyricsMenu] = useState(false);
  const [, navigate] = useLocation();
  const reduceMotion = useReducedMotion();

  // Synced-lyrics timing + rendering now live in the shared SyncedLyrics
  // component (client/src/components/ui/SyncedLyrics.tsx), driven by the
  // engine in client/src/lib/syncedLyrics.ts — the same surface the desktop
  // immersive player renders, so karaoke behaviour stays identical.

  // Auto-hide the lyrics-overlay bottom controls after a few seconds of no
  // interaction, the way Apple does on its full-screen Now Playing surface.
  // Any tap / scroll / touch on the overlay re-shows them and restarts the
  // 5-second timer.
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showControlsAndArmHide = useRef(() => {});
  useEffect(() => {
    showControlsAndArmHide.current = () => {
      setControlsVisible(true);
      if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = setTimeout(() => setControlsVisible(false), 5000);
    };
  });
  useEffect(() => {
    if (!showLyrics) {
      if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
      setControlsVisible(true);
      setShowLyricsMenu(false);
      return;
    }
    showControlsAndArmHide.current();
    return () => {
      if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current);
    };
  }, [showLyrics]);

  // Fire song_viewed whenever the full Now Playing surface presents a new
  // song. The mini-player tap mounts this component, and queue-advance
  // swaps `currentSong.id`, so this captures both entry points.
  useEffect(() => {
    if (!currentSong) return;
    track("song_viewed", { songId: currentSong.id, albumId: currentSong.album?.id });
  }, [currentSong?.id]);

  if (!currentSong) return null;

  // Apple-style mini→full open/close spring. Opening slides the surface up
  // from the bottom with a small overshoot/settle (the same motion language
  // Task #767 gave the mini-player capsule + bottom-nav dock); closing eases
  // back down to the mini-player. Honors prefers-reduced-motion via framer's
  // useReducedMotion() — falling back to a short non-overshoot tween, the
  // same gating used in MiniPlayer.tsx / BottomNav.tsx. Transform/opacity
  // only (translateY + fade) so it composites on the GPU at 60fps and adds
  // no new backdrop-blur layers (respects the iOS-WebKit glass memo).
  const openTransition: Transition = reduceMotion
    ? { duration: 0.2, ease: [0.32, 0.72, 0, 1] }
    : { type: "spring", stiffness: 420, damping: 34, mass: 0.9 };
  const closeTransition: Transition = reduceMotion
    ? { duration: 0.16, ease: [0.32, 0.72, 0, 1] }
    : { duration: 0.3, ease: [0.32, 0.72, 0, 1] };

  // "Go to Album / Go to Artist" context menu — tapping the title/artist
  // pops an Apple-Music-style menu that bounces open from the title.
  // Transform/opacity only (no backdrop-blur) per the iOS-WebKit glass memo.
  // The spring's low damping is what gives it the little overshoot/settle.
  const goToMenuAnimate: Transition = reduceMotion
    ? { duration: 0.15 }
    : { type: "spring", stiffness: 520, damping: 22, mass: 0.8 };
  const goToFromMenu = (path: string) => {
    setShowGoToMenu(false);
    setShowPlayer(false);
    navigate(path);
  };
  // Same nav, but from the lyrics-overlay ⋯ menu — also dismiss the overlay.
  const goToFromLyricsMenu = (path: string) => {
    setShowLyricsMenu(false);
    setShowLyrics(false);
    setShowPlayer(false);
    navigate(path);
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const isRepeatActive = repeat !== "none";
  const favorited = isFavorite(currentSong.id);

  // iOS-sheet-style swipe-down to dismiss. Attached to the grabber strip
  // AND the album artwork so a downward drag anywhere in the top half of
  // the player closes Now Playing. Threshold 80px matches what feels like
  // an intentional pull rather than a stray scroll. Paired with the
  // outer container's `overscrollBehavior: none` which blocks Safari's
  // pull-to-refresh from stealing the gesture.
  const dismissOnSwipeDown = (e: React.TouchEvent) => {
    const startY = e.touches[0].clientY;
    const onMove = (ev: TouchEvent) => {
      const dy = ev.touches[0].clientY - startY;
      // CRITICAL: preventDefault on any downward drag blocks iOS Safari's
      // pull-to-refresh from stealing the gesture and reloading the page
      // (which kills audio). Must be a non-passive listener — see the
      // { passive: false } below — otherwise preventDefault is a no-op.
      if (dy > 0) {
        ev.preventDefault();
      }
      if (dy > 80) {
        setShowPlayer(false);
        cleanup();
      }
    };
    const cleanup = () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", cleanup);
    };
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", cleanup);
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 flex justify-center bg-[#00062B]"
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1, transition: openTransition }}
        exit={{ y: "100%", opacity: 0, transition: closeTransition }}
        style={{
          zIndex: 50,
          // iOS Safari's toolbar shrinks/grows as you scroll, and a plain
          // `fixed inset-0` element tracks the *layout* viewport — so its
          // solid background leaves a sliver above the toolbar where the
          // page behind peeks through. Anchor to the top and size to the
          // *dynamic* visual viewport (`100dvh`) so the navy fill always
          // reaches the real bottom edge, in any toolbar state.
          top: 0,
          bottom: "auto",
          height: "100dvh",
          // Block iOS Safari's pull-to-refresh. Without this, swiping down
          // anywhere on the player reloads the page and kills the audio —
          // the opposite of what an Apple-Music user expects (they expect
          // the sheet to dismiss). We handle the dismiss gesture ourselves
          // via the grabber's onTouchStart below.
          overscrollBehavior: "none",
          touchAction: "pan-y",
        }}
      >
        {/* Full-bleed blurred artwork background */}
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={currentSong.album.artwork}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-125"
            style={{ filter: "blur(60px) brightness(0.35) saturate(1.6)" }}
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,6,43,0.3) 0%, rgba(0,6,43,0.5) 100%)" }} />
        </div>
        <div className="relative w-full max-w-[390px] h-[100dvh] flex flex-col">

          {/* Grabber + drag zone — Apple-style pull-down dismiss.
              The drag listener (`dismissOnSwipeDown`) is attached to BOTH
              the grabber strip AND the artwork below, so a user can grab
              anywhere in the top half of the player and pull it down to
              dismiss, the way an iOS sheet works. The visible grabber bar
              is just the affordance — the gesture itself works on a much
              larger area. */}
          <div
            className="relative z-10 pt-3 pb-2 flex justify-center select-none cursor-grab active:cursor-grabbing"
            onTouchStart={dismissOnSwipeDown}
            onClick={() => setShowPlayer(false)}
            role="button"
            aria-label="Close Now Playing"
            data-testid="grabber-now-playing"
          >
            <div className="w-9 h-[5px] rounded-full" style={{ background: "rgba(255,255,255,0.35)" }} />
          </div>

          {/* Apple's Now Playing distributes vertical space: artwork sits high,
              title + progress + transport breathe in the middle (taking any
              extra height on tall devices), volume + bottom row anchor low. */}
          <div className="relative z-10 flex-1 flex flex-col px-7 pt-2 pb-2 min-h-0">
            {/* Album art — also acts as a swipe-down drag handle for
                dismissing the player (iOS sheet behavior). */}
            <div
              className="w-full aspect-square rounded-3xl overflow-hidden flex-shrink-0"
              onTouchStart={dismissOnSwipeDown}
              style={{
                boxShadow: "0 24px 64px rgba(0,0,0,0.65)",
                // Apple's Now Playing shrinks the cover noticeably on
                // pause and grows back on play. 1.0 → ~0.82 matches the
                // visible delta in their iOS 17/18 player; the spring-y
                // cubic-bezier gives it the same little settle.
                transform: isPlaying ? "scale(1)" : "scale(0.82)",
                transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            >
              <img src={currentSong.album.artwork} alt={currentSong.album.title} className="w-full h-full object-cover" />
            </div>

            {/* Middle cluster — title + progress + transport, vertically centered
                in the leftover space between artwork and the bottom controls. */}
            <div className="flex-1 flex flex-col justify-center w-full min-h-0 py-3">

            {/* Title row — favorite + more, à la Apple Music */}
            <div className="w-full flex items-center justify-between mb-6 gap-3">
              <div className="flex-1 min-w-0 relative">
                <button
                  type="button"
                  onClick={() => setShowGoToMenu((v) => !v)}
                  className="block w-full text-left active:opacity-60 transition-opacity"
                  aria-haspopup="menu"
                  aria-expanded={showGoToMenu}
                  data-testid="button-song-title-menu"
                >
                  <h2 className="text-white text-xl font-bold leading-snug truncate">{currentSong.title}</h2>
                  <p className="text-white/55 text-sm mt-0.5 truncate">{currentSong.album.artist}</p>
                </button>

                <AnimatePresence>
                  {showGoToMenu && (
                    <>
                      {/* Tap-anywhere-else catcher to dismiss the menu. */}
                      <button
                        type="button"
                        aria-label="Close menu"
                        onClick={() => setShowGoToMenu(false)}
                        className="fixed inset-0 z-40"
                        data-testid="backdrop-goto-menu"
                      />
                      <motion.div
                        role="menu"
                        className="absolute left-0 top-full mt-2 z-50 min-w-[230px] max-w-[280px] rounded-2xl overflow-hidden"
                        style={{
                          background: "rgba(28,30,38,0.97)",
                          boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
                          transformOrigin: "top left",
                        }}
                        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: -6 }}
                        animate={{ opacity: 1, scale: 1, y: 0, transition: goToMenuAnimate }}
                        exit={reduceMotion ? { opacity: 0, transition: { duration: 0.12 } } : { opacity: 0, scale: 0.92, y: -4, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => goToFromMenu(`/album/${currentSong.album.id}`)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/10 transition-colors"
                          data-testid="button-goto-album"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" className="flex-shrink-0">
                            <circle cx="12" cy="12" r="9" />
                            <circle cx="12" cy="12" r="2.5" />
                          </svg>
                          <span className="flex-1 min-w-0">
                            <span className="block text-white text-sm font-semibold leading-tight">Go to Album</span>
                            <span className="block text-white/50 text-xs truncate mt-0.5">{currentSong.album.title}</span>
                          </span>
                        </button>
                        <div className="h-px bg-white/10 mx-4" />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => goToFromMenu(`/artist/${encodeURIComponent(currentSong.album.artist)}`)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/10 transition-colors"
                          data-testid="button-goto-artist"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinejoin="round" className="flex-shrink-0">
                            <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9L12 3z" />
                          </svg>
                          <span className="flex-1 min-w-0">
                            <span className="block text-white text-sm font-semibold leading-tight">Go to Artist</span>
                            <span className="block text-white/50 text-xs truncate mt-0.5">{currentSong.album.artist}</span>
                          </span>
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <IconButton
                  variant="glass"
                  label={favorited ? "Unfavorite" : "Favorite"}
                  aria-pressed={favorited}
                  onClick={() => toggleFavorite(currentSong.id)}
                  data-testid="button-favorite-song"
                >
                  {favorited ? (
                    <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.55)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5">
                      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                    </svg>
                  )}
                </IconButton>
                <IconButton
                  variant="glass"
                  label="More"
                  onClick={() => setShowAddToPlaylist(true)}
                  data-testid="button-song-more"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="1.7" />
                    <circle cx="12" cy="12" r="1.7" />
                    <circle cx="19" cy="12" r="1.7" />
                  </svg>
                </IconButton>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full mb-2">
              <div className="relative w-full h-1 rounded-full overflow-hidden cursor-pointer">
                <div className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />
                <div
                  className="absolute left-0 top-0 h-full rounded-full transition-all duration-1000"
                  style={{ width: `${progress * 100}%`, background: "white" }}
                />
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={(e) => seekTo(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                  style={{ height: "100%" }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-white/40 text-[11px] font-medium">{formatDuration(currentTime)}</span>
                <span className="text-white/40 text-[11px] font-medium">{formatDuration(duration)}</span>
              </div>
            </div>

            {/* Transport — Apple Music: just prev / play / next, centered.
                Shuffle & Repeat live in the Up Next overlay. */}
            <div className="w-full flex items-center justify-center gap-12 mt-5">
              <button
                type="button"
                onClick={prev}
                className="text-white active:opacity-55 transition-opacity"
                aria-label="Previous"
                data-testid="button-prev"
              >
                <svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="2" height="12" rx="1" />
                  <path d="M18 18l-8.5-6 8.5-6v12z" />
                </svg>
              </button>

              <button
                type="button"
                onClick={togglePlay}
                className="active:scale-[0.93] transition-transform text-white"
                aria-label={isPlaying ? "Pause" : "Play"}
                data-testid="button-play-pause"
              >
                {isPlaying ? (
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="5" y="4" width="4" height="16" rx="1.5" />
                    <rect x="15" y="4" width="4" height="16" rx="1.5" />
                  </svg>
                ) : (
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18a1 1 0 000-1.69L9.54 5.98A.998.998 0 008 6.82z" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                onClick={next}
                className="text-white active:opacity-55 transition-opacity"
                aria-label="Next"
                data-testid="button-next"
              >
                <svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12z" />
                  <rect x="16" y="6" width="2" height="12" rx="1" />
                </svg>
              </button>
            </div>

            </div>
            {/* End middle cluster — volume + bottom buttons anchor at bottom. */}

            {/* Volume slider */}
            <div className="w-full flex items-center gap-3 mb-2 flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              </svg>
              <div className="flex-1 relative h-[3px] rounded-full overflow-hidden cursor-pointer">
                <div className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,0.22)" }} />
                <div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{ width: `${volume}%`, background: "white" }}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                  data-testid="slider-volume"
                />
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
              </svg>
            </div>

            {/* Bottom actions: Lyrics · AirPlay · Queue */}
            <div className="w-full flex items-center justify-around pb-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (currentSong.lyrics) {
                    setShowLyrics(true);
                    track("lyrics_opened", { songId: currentSong.id, albumId: currentSong.album?.id });
                  }
                }}
                disabled={!currentSong.lyrics}
                className={`w-11 h-11 flex items-center justify-center transition-colors ${
                  currentSong.lyrics
                    ? "text-white/55 active:text-white"
                    : "text-white/20 cursor-not-allowed"
                }`}
                aria-label={currentSong.lyrics ? "Lyrics" : "Lyrics unavailable"}
                title={currentSong.lyrics ? undefined : "No lyrics available"}
                data-testid="button-lyrics"
              >
                <LyricsIcon size={22} />
              </button>
              {airPlaySupported && (
                <button
                  type="button"
                  onClick={() => {
                    showAirPlayPicker();
                    track("airplay_picker_opened", { songId: currentSong.id, albumId: currentSong.album?.id });
                  }}
                  className="w-11 h-11 flex items-center justify-center text-white/55 active:text-white transition-colors"
                  aria-label="AirPlay"
                  data-testid="button-airplay"
                >
                  {/* Apple's AirPlay glyph: a rounded display rectangle with a
                      small upward-pointing triangle centered at its base. */}
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 17H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v9a2 2 0 01-2 2h-1" />
                    <polygon points="12 15 17 21 7 21 12 15" fill="currentColor" stroke="none" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowQueue(true)}
                className="w-11 h-11 flex items-center justify-center text-white/55 active:text-white transition-colors"
                aria-label="Up Next"
                data-testid="button-queue"
              >
                {/* Apple's queue / list icon — three lines with leading bullets */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <circle cx="4" cy="6" r="1.2" />
                  <circle cx="4" cy="12" r="1.2" />
                  <circle cx="4" cy="18" r="1.2" />
                  <rect x="8" y="5.2" width="13" height="1.6" rx="0.8" />
                  <rect x="8" y="11.2" width="13" height="1.6" rx="0.8" />
                  <rect x="8" y="17.2" width="13" height="1.6" rx="0.8" />
                </svg>
              </button>
            </div>
          </div>

          <div
            className="relative z-10 flex items-end justify-center pt-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
          >
            <div className="w-28 h-[5px] bg-white/25 rounded-full" />
          </div>
        </div>
      </motion.div>

      {/* ─── Lyrics Overlay ─── */}
      {showLyrics && currentSong.lyrics && (
        <div
          className="fixed inset-0 flex justify-center bg-[#00062B]"
          style={{ zIndex: 70, top: 0, bottom: "auto", height: "100dvh" }}
          onPointerDown={() => showControlsAndArmHide.current()}
        >
          {/* Full-bleed blurred artwork background — Apple Music style */}
          <div className="absolute inset-0 overflow-hidden">
            <img
              src={currentSong.album.artwork}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-125"
              style={{ filter: "blur(55px) saturate(1.8) brightness(0.55)" }}
            />
            <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.28)" }} />
          </div>
          <div className="relative w-full max-w-[390px] h-[100dvh] flex flex-col">

            {/* Header: small art + song info + star + ... */}
            <div className="relative z-10 flex items-center gap-3 px-5 pt-14 pb-4">
              <button
                type="button"
                onClick={() => setShowLyrics(false)}
                aria-label="Close lyrics"
                className="w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0"
                style={{ background: "rgba(0,0,0,0.35)" }}
                data-testid="button-close-lyrics"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <img
                src={currentSong.album.artwork}
                alt={currentSong.album.title}
                className="flex-shrink-0 object-cover"
                style={{ width: 44, height: 44, borderRadius: 10, boxShadow: "0 4px 14px rgba(0,0,0,0.5)" }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-white text-[15px] font-bold leading-tight truncate">{currentSong.title}</p>
                <p className="text-white/65 text-[13px] leading-tight truncate">{currentSong.album.artist}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleFavorite(currentSong.id)}
                className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 active:opacity-60"
                style={{ background: "rgba(0,0,0,0.3)" }}
              >
                {favorited ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                )}
              </button>
              {/* ⋯ menu — Apple-Music-style, but only the actions GoodTunes
                  actually supports: Add to Playlist, Go to Album, Go to Artist.
                  Anchored top-right; same bouncy spring + tap-catcher as the
                  title menu. (Favorite lives in the heart button beside it.) */}
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowLyricsMenu((v) => !v)}
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={showLyricsMenu}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-white active:opacity-60"
                  style={{ background: "rgba(0,0,0,0.3)" }}
                  data-testid="button-lyrics-more"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="19" cy="12" r="1.8" />
                  </svg>
                </button>

                <AnimatePresence>
                  {showLyricsMenu && (
                    <>
                      <button
                        type="button"
                        aria-label="Close menu"
                        onClick={() => setShowLyricsMenu(false)}
                        className="fixed inset-0 z-40"
                        data-testid="backdrop-lyrics-menu"
                      />
                      <motion.div
                        role="menu"
                        className="absolute right-0 top-full mt-2 z-50 min-w-[230px] max-w-[280px] rounded-2xl overflow-hidden"
                        style={{
                          background: "rgba(28,30,38,0.97)",
                          boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
                          transformOrigin: "top right",
                        }}
                        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: -6 }}
                        animate={{ opacity: 1, scale: 1, y: 0, transition: goToMenuAnimate }}
                        exit={reduceMotion ? { opacity: 0, transition: { duration: 0.12 } } : { opacity: 0, scale: 0.92, y: -4, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setShowLyricsMenu(false); setShowAddToPlaylist(true); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/10 transition-colors"
                          data-testid="button-lyrics-add-to-playlist"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                            <path d="M3 6h13M3 12h9M3 18h9M16 15v6M13 18h6" />
                          </svg>
                          <span className="block text-white text-sm font-semibold leading-tight">Add to Playlist</span>
                        </button>
                        <div className="h-px bg-white/10 mx-4" />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => goToFromLyricsMenu(`/album/${currentSong.album.id}`)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/10 transition-colors"
                          data-testid="button-lyrics-goto-album"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" className="flex-shrink-0">
                            <circle cx="12" cy="12" r="9" />
                            <circle cx="12" cy="12" r="2.5" />
                          </svg>
                          <span className="flex-1 min-w-0">
                            <span className="block text-white text-sm font-semibold leading-tight">Go to Album</span>
                            <span className="block text-white/50 text-xs truncate mt-0.5">{currentSong.album.title}</span>
                          </span>
                        </button>
                        <div className="h-px bg-white/10 mx-4" />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => goToFromLyricsMenu(`/artist/${encodeURIComponent(currentSong.album.artist)}`)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-white/10 transition-colors"
                          data-testid="button-lyrics-goto-artist"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinejoin="round" className="flex-shrink-0">
                            <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9L12 3z" />
                          </svg>
                          <span className="flex-1 min-w-0">
                            <span className="block text-white text-sm font-semibold leading-tight">Go to Artist</span>
                            <span className="block text-white/50 text-xs truncate mt-0.5">{currentSong.album.artist}</span>
                          </span>
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Lyrics text — scrollable, line-level synced. The shared
                SyncedLyrics surface owns the timing engine, the active-line
                focus stack (sharp white active line, monotone blur/fade on
                neighbours), the ~28%-down auto-scroll, instrumental gap dots,
                the top/bottom mask fade, and the "Written by …" credit — the
                same component the desktop immersive player renders, so the
                two surfaces never drift. Task #616 writers come from
                /api/songs/:id (server-derived from track_publishing_splits;
                names only, never percentages/PROs). */}
            <SyncedLyrics
              lyrics={currentSong.lyrics}
              duration={duration}
              syncedLyrics={currentSong.syncedLyrics}
              currentTime={currentTime}
              onSeek={seekTo}
              writers={(currentSong as any).writers}
              active={showLyrics}
              className="relative z-10 flex-1 px-6"
            />

            {/* Bottom controls */}
            <div
              className="relative z-10 px-6 pt-3"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)",
                opacity: controlsVisible ? 1 : 0,
                transform: controlsVisible ? "translateY(0)" : "translateY(12px)",
                pointerEvents: controlsVisible ? "auto" : "none",
                transition: "opacity 350ms ease, transform 350ms ease",
              }}
              data-testid="lyrics-controls"
            >
              {/* Progress bar */}
              <div className="relative w-full h-[3px] rounded-full overflow-hidden mb-2 cursor-pointer">
                <div className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,0.25)" }} />
                <div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{ width: `${progress * 100}%`, background: "white", transition: "width 1s linear" }}
                />
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={(e) => seekTo(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                />
              </div>
              <div className="flex justify-between mb-5">
                <span className="text-white/55 text-[11px] font-medium">{formatDuration(currentTime)}</span>
                <span className="text-white/55 text-[11px] font-medium">-{formatDuration(Math.max(0, duration - currentTime))}</span>
              </div>

              {/* ◀◀  ▶/⏸  ▶▶ — Apple Music style, no circles */}
              <div className="flex items-center justify-center gap-12 mb-6">
                <button
                  type="button"
                  onClick={prev}
                  className="text-white active:opacity-55 transition-opacity"
                >
                  <svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 6h2v12H6z" />
                    <path d="M18 18l-8.5-6 8.5-6v12z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  className="text-white active:opacity-55 transition-opacity"
                >
                  {isPlaying ? (
                    <svg width="52" height="52" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="5" y="4" width="4" height="16" rx="1.5" />
                      <rect x="15" y="4" width="4" height="16" rx="1.5" />
                    </svg>
                  ) : (
                    <svg width="52" height="52" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18a1 1 0 000-1.69L9.54 5.98A.998.998 0 008 6.82z" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="text-white active:opacity-55 transition-opacity"
                >
                  <svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 18l8.5-6L6 6v12z" />
                    <path d="M16 6h2v12h-2z" />
                  </svg>
                </button>
              </div>

              {/* Volume slider */}
              <div className="flex items-center gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                </svg>
                <div className="flex-1 relative h-[3px] rounded-full overflow-hidden cursor-pointer">
                  <div className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,0.25)" }} />
                  <div
                    className="absolute left-0 top-0 h-full rounded-full"
                    style={{ width: `${volume}%`, background: "white" }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer"
                  />
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Up Next / Queue Overlay ─── */}
      {showQueue && (
        <div className="fixed inset-0 flex justify-center bg-[#00062B]" style={{ zIndex: 70 }} data-testid="overlay-queue">
          {/* Blurred artwork bg, same vibe as the player */}
          <div className="absolute inset-0 overflow-hidden">
            <img
              src={currentSong.album.artwork}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-125"
              style={{ filter: "blur(60px) brightness(0.35) saturate(1.6)" }}
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,6,43,0.35) 0%, rgba(0,6,43,0.55) 100%)" }} />
          </div>

          <div className="relative w-full max-w-[390px] min-h-screen flex flex-col">
            {/* Top bar */}
            <div className="relative z-10 flex items-center justify-between px-5 pt-14 pb-2">
              <IconButton
                variant="glass"
                label="Close queue"
                onClick={() => setShowQueue(false)}
                data-testid="button-close-queue"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </IconButton>
              <p className="text-white/50 text-xs font-medium uppercase tracking-widest">Up Next</p>
              <div className="w-11 h-11" />
            </div>

            {/* Now playing card */}
            <div className="relative z-10 flex items-center gap-3 px-5 py-3">
              <img
                src={currentSong.album.artwork}
                alt={currentSong.album.title}
                className="flex-shrink-0 object-cover"
                style={{ width: 56, height: 56, borderRadius: 8, boxShadow: "0 4px 14px rgba(0,0,0,0.5)" }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-white text-[15px] font-bold leading-tight truncate">{currentSong.title}</p>
                <p className="text-white/65 text-[13px] leading-tight truncate mt-0.5">{currentSong.album.artist}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleFavorite(currentSong.id)}
                className="w-9 h-9 flex items-center justify-center rounded-full active:opacity-60"
                style={{ background: "rgba(255,255,255,0.08)" }}
                aria-label={favorited ? "Unfavorite" : "Favorite"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={favorited ? "rgba(255,255,255,0.55)" : "none"} stroke={favorited ? "rgba(255,255,255,0.55)" : "white"} strokeWidth="1.8" strokeLinecap="round">
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
              </button>
            </div>

            {/* Toggle pills row: Shuffle · Repeat · Infinity (autoplay-like) · Autoplay */}
            <div className="relative z-10 flex items-center gap-2 px-5 pt-1 pb-3">
              <button
                type="button"
                onClick={toggleShuffle}
                className="flex-1 h-10 rounded-full flex items-center justify-center transition-colors"
                style={{
                  background: shuffle ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.10)",
                  color: shuffle ? "#00062B" : "rgba(255,255,255,0.85)",
                }}
                aria-label="Shuffle"
                aria-pressed={shuffle}
                data-testid="toggle-shuffle"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 3 21 3 21 8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" />
                  <line x1="15" y1="15" x2="21" y2="21" />
                  <line x1="4" y1="4" x2="9" y2="9" />
                </svg>
              </button>
              <button
                type="button"
                onClick={toggleRepeat}
                className="flex-1 h-10 rounded-full flex items-center justify-center transition-colors"
                style={{
                  background: repeat !== "none" ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.10)",
                  color: repeat !== "none" ? "#00062B" : "rgba(255,255,255,0.85)",
                }}
                aria-label="Repeat"
                aria-pressed={repeat !== "none"}
                data-testid="toggle-repeat"
              >
                {repeat === "one" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 014-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 01-4 4H3" />
                    <text x="9.5" y="14.5" fontSize="6" fill="currentColor" stroke="none" fontWeight="bold">1</text>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 014-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 01-4 4H3" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={toggleAutoplay}
                className="flex-1 h-10 rounded-full flex items-center justify-center transition-colors"
                style={{
                  background: autoplay ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.10)",
                  color: autoplay ? "#00062B" : "rgba(255,255,255,0.85)",
                }}
                aria-label="Autoplay"
                aria-pressed={autoplay}
                data-testid="toggle-autoplay"
                title="Autoplay similar songs after the queue ends"
              >
                {/* Apple Music "Autoplay" — two interlocked rounded ovals */}
                <svg width="26" height="26" viewBox="0 0 32 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1.5" y="5.5" width="17" height="13" rx="6.5" />
                  <rect x="13.5" y="5.5" width="17" height="13" rx="6.5" />
                </svg>
              </button>
            </div>

            {/* Continue Playing list */}
            <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide px-5 pb-32" data-testid="list-queue">
              {(() => {
                const upcoming = queue.slice(currentIndex + 1);
                if (upcoming.length === 0) {
                  return (
                    <div className="text-center pt-10">
                      <p className="text-white/50 text-sm">Nothing else queued.</p>
                      {autoplay && (
                        <p className="text-white/35 text-xs mt-1">Autoplay will pick something similar when this track ends.</p>
                      )}
                    </div>
                  );
                }
                const fromAlbum = currentSong.album.title;
                return (
                  <>
                    <div className="pt-1 pb-2">
                      <p className="text-white text-[17px] font-bold leading-tight">Continue Playing</p>
                      <p className="text-white/55 text-[13px] mt-0.5">From {fromAlbum}</p>
                    </div>
                    <div>
                      {upcoming.map((s, i) => {
                        const idxInQueue = currentIndex + 1 + i;
                        return (
                          <div
                            key={`${s.id}-${idxInQueue}`}
                            className="flex items-center gap-3 py-2.5 active:bg-white/5 rounded-lg transition-colors"
                            data-testid={`queue-item-${s.id}`}
                          >
                            <button
                              type="button"
                              onClick={() => playSong(s, queue)}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left"
                            >
                              <img
                                src={s.album.artwork}
                                alt={s.album.title}
                                className="flex-shrink-0 object-cover"
                                style={{ width: 44, height: 44, borderRadius: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.45)" }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-[15px] font-medium truncate leading-tight">{s.title}</p>
                                <p className="text-white/55 text-[13px] truncate leading-tight mt-0.5">{s.album.artist}</p>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFromQueue(idxInQueue)}
                              className="w-9 h-9 flex items-center justify-center text-white/40 active:text-white/80 transition-colors"
                              aria-label={`Remove ${s.title} from Up Next`}
                              data-testid={`button-remove-queue-${s.id}`}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                <line x1="3" y1="7" x2="17" y2="7" />
                                <line x1="3" y1="12" x2="17" y2="12" />
                                <line x1="3" y1="17" x2="11" y2="17" />
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Bottom transport — progress, controls, volume */}
            <div className="relative z-10 px-5 pt-2 pb-6" style={{ background: "linear-gradient(to top, rgba(0,6,43,0.85), rgba(0,6,43,0))" }}>
              <div className="relative w-full h-[3px] rounded-full overflow-hidden mb-1.5 cursor-pointer">
                <div className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,0.22)" }} />
                <div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{ width: `${progress * 100}%`, background: "white", transition: "width 1s linear" }}
                />
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={(e) => seekTo(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                />
              </div>
              <div className="flex justify-between mb-3">
                <span className="text-white/55 text-[11px] font-medium">{formatDuration(currentTime)}</span>
                <span className="text-white/55 text-[11px] font-medium">-{formatDuration(Math.max(0, duration - currentTime))}</span>
              </div>

              <div className="flex items-center justify-center gap-14 mb-4">
                {/* Queue overlay: scan-back (double triangle), play, scan-forward — Apple style */}
                <button type="button" onClick={prev} className="text-white active:opacity-55 transition-opacity" aria-label="Previous">
                  <svg width="34" height="34" viewBox="0 0 32 24" fill="currentColor">
                    <path d="M15 18l-8-6 8-6v12z" />
                    <path d="M27 18l-8-6 8-6v12z" />
                  </svg>
                </button>
                <button type="button" onClick={togglePlay} className="text-white active:opacity-55 transition-opacity" aria-label={isPlaying ? "Pause" : "Play"}>
                  {isPlaying ? (
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="5" y="4" width="4" height="16" rx="1.5" />
                      <rect x="15" y="4" width="4" height="16" rx="1.5" />
                    </svg>
                  ) : (
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18a1 1 0 000-1.69L9.54 5.98A.998.998 0 008 6.82z" />
                    </svg>
                  )}
                </button>
                <button type="button" onClick={next} className="text-white active:opacity-55 transition-opacity" aria-label="Next">
                  <svg width="34" height="34" viewBox="0 0 32 24" fill="currentColor">
                    <path d="M5 6l8 6-8 6V6z" />
                    <path d="M17 6l8 6-8 6V6z" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                </svg>
                <div className="flex-1 relative h-[3px] rounded-full overflow-hidden cursor-pointer">
                  <div className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,0.22)" }} />
                  <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${volume}%`, background: "white" }} />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer"
                  />
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add to Playlist sheet */}
      <AnimatePresence>
        {showAddToPlaylist && currentSong && (
          <PlaylistPickerSheet
            songId={currentSong.id}
            songTitle={currentSong.title}
            onClose={() => setShowAddToPlaylist(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
