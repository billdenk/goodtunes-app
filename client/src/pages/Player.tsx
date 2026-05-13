import { useState, useRef } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/data/musicData";
import { PlaylistPickerSheet } from "@/components/PlaylistPickerSheet";

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
  } = usePlayer();

  const [volume, setVolume] = useState(80);

  if (!currentSong) return null;

  const progress = duration > 0 ? currentTime / duration : 0;
  const isRepeatActive = repeat !== "none";
  const favorited = isFavorite(currentSong.id);

  return (
    <>
      <div className="fixed inset-0 flex justify-center bg-[#00062B]" style={{ zIndex: 50 }}>
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
        <div className="relative w-full max-w-[390px] min-h-screen flex flex-col">

          {/* Top bar */}
          <div className="relative z-10 flex items-center justify-between px-5 pt-14 pb-2">
            <button
              type="button"
              onClick={() => setShowPlayer(false)}
              className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/10 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <p className="text-white/50 text-xs font-medium uppercase tracking-widest">Now Playing</p>
            <button
              type="button"
              className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/10 transition-colors text-white/60"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="19" cy="12" r="1.5" />
              </svg>
            </button>
          </div>

          <div className="relative z-10 flex-1 flex flex-col items-center px-7">
            {/* Album art */}
            <div
              className="w-full aspect-square rounded-3xl overflow-hidden mb-7 mt-1"
              style={{
                boxShadow: "0 24px 64px rgba(0,0,0,0.65)",
                transform: isPlaying ? "scale(1.02)" : "scale(0.96)",
                transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            >
              <img src={currentSong.album.artwork} alt={currentSong.album.title} className="w-full h-full object-cover" />
            </div>

            {/* Title row — favorite + more, à la Apple Music */}
            <div className="w-full flex items-center justify-between mb-5 gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-white text-xl font-bold leading-snug truncate">{currentSong.title}</h2>
                <p className="text-white/55 text-sm mt-0.5 truncate">{currentSong.album.artist}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => toggleFavorite(currentSong.id)}
                  className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-60 transition-opacity"
                  style={{ background: "rgba(255,255,255,0.10)" }}
                  aria-label={favorited ? "Unfavorite" : "Favorite"}
                  aria-pressed={favorited}
                  data-testid="button-favorite-song"
                >
                  {favorited ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF5470" stroke="#FF5470" strokeWidth="1.5">
                      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddToPlaylist(true)}
                  className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-60 transition-opacity text-white"
                  style={{ background: "rgba(255,255,255,0.10)" }}
                  aria-label="More"
                  data-testid="button-song-more"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="1.7" />
                    <circle cx="12" cy="12" r="1.7" />
                    <circle cx="19" cy="12" r="1.7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full mb-1">
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
            <div className="w-full flex items-center justify-center gap-12 mb-7 mt-1">
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

            {/* Volume slider */}
            <div className="w-full flex items-center gap-3 mb-3">
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
            <div className="w-full flex items-center justify-around pb-2">
              <button
                type="button"
                onClick={() => setShowLyrics(true)}
                className="w-11 h-11 flex items-center justify-center text-white/55 active:text-white transition-colors"
                aria-label="Lyrics"
                data-testid="button-lyrics"
              >
                {/* Apple's "quote bubble" lyrics icon */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v9A2.5 2.5 0 0117.5 17H13l-4 3.5V17H6.5A2.5 2.5 0 014 14.5v-9z" />
                  <path d="M9 8.5c-1.2.4-2 1.4-2 2.6V13h2.6V10.4H8.2c0-.6.3-1.2.8-1.5l-0-.4zM15 8.5c-1.2.4-2 1.4-2 2.6V13h2.6V10.4h-1.4c0-.6.3-1.2.8-1.5l-0-.4z" fill="currentColor" stroke="none" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="AirPlay (coming soon)"
                title="AirPlay & Cast — coming soon"
                className="w-11 h-11 flex items-center justify-center text-white/30 cursor-not-allowed"
                data-testid="button-airplay"
              >
                {/* Apple's AirPlay: concentric arcs over a triangle */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 0118 0" />
                  <path d="M6 12a6 6 0 0112 0" />
                  <path d="M9 12a3 3 0 016 0" />
                  <polygon points="12 15 17 21 7 21 12 15" fill="currentColor" stroke="none" />
                </svg>
              </button>
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

          <div className="relative z-10 h-8 flex items-end justify-center pb-2">
            <div className="w-28 h-[5px] bg-white/25 rounded-full" />
          </div>
        </div>
      </div>

      {/* ─── Lyrics Overlay ─── */}
      {showLyrics && currentSong.lyrics && (
        <div className="fixed inset-0 flex justify-center bg-[#00062B]" style={{ zIndex: 70 }}>
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
          <div className="relative w-full max-w-[390px] min-h-screen flex flex-col">

            {/* Header: small art + song info + star + ... */}
            <div className="relative z-10 flex items-center gap-3 px-5 pt-14 pb-4">
              <button
                type="button"
                onClick={() => setShowLyrics(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0"
                style={{ background: "rgba(0,0,0,0.35)" }}
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
              <button
                type="button"
                className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 text-white active:opacity-60"
                style={{ background: "rgba(0,0,0,0.3)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
            </div>

            {/* Lyrics text — scrollable */}
            <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide px-6 pb-4">
              <div className="text-white text-[22px] leading-[1.55] font-bold whitespace-pre-line">
                {currentSong.lyrics}
              </div>
            </div>

            {/* Bottom controls */}
            <div className="relative z-10 px-6 pt-3 pb-8">
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
              <button
                type="button"
                onClick={() => setShowQueue(false)}
                className="w-9 h-9 flex items-center justify-center rounded-full active:bg-white/10 transition-colors"
                data-testid="button-close-queue"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <p className="text-white/50 text-xs font-medium uppercase tracking-widest">Up Next</p>
              <div className="w-9 h-9" />
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill={favorited ? "#FF5470" : "none"} stroke={favorited ? "#FF5470" : "white"} strokeWidth="1.8" strokeLinecap="round">
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
      {showAddToPlaylist && currentSong && (
        <PlaylistPickerSheet
          songId={currentSong.id}
          songTitle={currentSong.title}
          onClose={() => setShowAddToPlaylist(false)}
        />
      )}
    </>
  );
}
