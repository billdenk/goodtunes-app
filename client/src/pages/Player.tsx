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
      <div className="fixed inset-0 flex justify-center" style={{ zIndex: 50 }}>
        <div className="relative w-full max-w-[390px] min-h-screen flex flex-col overflow-hidden">
          {/* Blurred artwork background */}
          <div className="absolute inset-0">
            <img
              src={currentSong.album.artwork}
              alt=""
              className="w-full h-full object-cover scale-110"
              style={{ filter: "blur(50px) brightness(0.35) saturate(1.6)" }}
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,6,43,0.3) 0%, rgba(0,6,43,0.5) 100%)" }} />
          </div>

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

            {/* Title + favorite */}
            <div className="w-full flex items-center justify-between mb-5">
              <div className="flex-1 min-w-0">
                <h2 className="text-white text-xl font-bold leading-snug truncate">{currentSong.title}</h2>
                <p className="text-white/55 text-sm mt-0.5 truncate">{currentSong.album.artist}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleFavorite(currentSong.id)}
                className="ml-4 flex-shrink-0 active:scale-90 transition-transform"
              >
                {favorited ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="#319ED8" stroke="#319ED8" strokeWidth="1.5">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                )}
              </button>
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

            {/* Transport controls */}
            <div className="w-full flex items-center justify-between mb-7 mt-1">
              <button
                type="button"
                onClick={toggleShuffle}
                className={`w-11 h-11 flex items-center justify-center rounded-full active:bg-white/10 transition-colors ${shuffle ? "text-[#319ED8]" : "text-white/40"}`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 3 21 3 21 8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" />
                  <line x1="15" y1="15" x2="21" y2="21" />
                  <line x1="4" y1="4" x2="9" y2="9" />
                </svg>
              </button>

              <button
                type="button"
                onClick={prev}
                className="w-11 h-11 flex items-center justify-center text-white active:text-white/60 transition-colors"
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="2" height="12" rx="1" />
                  <path d="M18 18l-8.5-6 8.5-6v12z" />
                </svg>
              </button>

              <button
                type="button"
                onClick={togglePlay}
                className="w-[72px] h-[72px] rounded-full flex items-center justify-center shadow-xl active:scale-[0.93] transition-transform"
                style={{
                  background: "white",
                  boxShadow: "0 8px 30px rgba(255,255,255,0.2), 0 4px 12px rgba(0,0,0,0.4)",
                }}
              >
                {isPlaying ? (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="#00062B">
                    <rect x="5" y="4" width="4" height="16" rx="1.5" />
                    <rect x="15" y="4" width="4" height="16" rx="1.5" />
                  </svg>
                ) : (
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="#00062B">
                    <path d="M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18a1 1 0 000-1.69L9.54 5.98A.998.998 0 008 6.82z" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                onClick={next}
                className="w-11 h-11 flex items-center justify-center text-white active:text-white/60 transition-colors"
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12z" />
                  <rect x="16" y="6" width="2" height="12" rx="1" />
                </svg>
              </button>

              <button
                type="button"
                onClick={toggleRepeat}
                className={`w-11 h-11 flex items-center justify-center rounded-full active:bg-white/10 transition-colors ${isRepeatActive ? "text-[#319ED8]" : "text-white/40"}`}
              >
                {repeat === "one" ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 014-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 01-4 4H3" />
                    <text x="9.5" y="14.5" fontSize="6" fill="currentColor" stroke="none" fontWeight="bold">1</text>
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 014-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 01-4 4H3" />
                  </svg>
                )}
              </button>
            </div>

            {/* Bottom actions */}
            <div className="w-full flex items-center justify-around pb-2">
              <button
                type="button"
                onClick={() => setShowLyrics(true)}
                className="flex flex-col items-center gap-1.5 text-white/40 active:text-white/70 transition-colors"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                <span className="text-[10px] font-medium">Lyrics</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAddToPlaylist(true)}
                className="flex flex-col items-center gap-1.5 text-white/40 active:text-white/70 transition-colors"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                <span className="text-[10px] font-medium">Add to List</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-1.5 text-white/40 active:text-white/70 transition-colors"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="12 3 12 14" />
                  <polyline points="8 7 12 3 16 7" />
                  <path d="M20 14v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5" />
                </svg>
                <span className="text-[10px] font-medium">Share</span>
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
        <div className="fixed inset-0 flex justify-center" style={{ zIndex: 70 }}>
          <div className="relative w-full max-w-[390px] min-h-screen flex flex-col overflow-hidden">

            {/* Colourful blurred artwork background — Apple Music style */}
            <img
              src={currentSong.album.artwork}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-125"
              style={{ filter: "blur(55px) saturate(1.8) brightness(0.55)" }}
            />
            <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.28)" }} />

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
