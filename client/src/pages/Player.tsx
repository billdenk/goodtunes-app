import { useState } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/data/musicData";

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
    setShowPlayer,
  } = usePlayer();

  if (!currentSong) return null;

  const progress = duration > 0 ? currentTime / duration : 0;

  const repeatIcon = () => {
    if (repeat === "one") return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2">
        <path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" strokeLinecap="round" />
        <text x="9" y="15" fontSize="8" fill="#319ED8" stroke="none" fontWeight="bold">1</text>
      </svg>
    );
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={repeat === "all" ? "#319ED8" : "currentColor"} strokeWidth="2">
        <path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" strokeLinecap="round" />
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center">
      <div className="relative w-full max-w-[390px] min-h-screen flex flex-col overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={currentSong.album.artwork}
            alt=""
            className="w-full h-full object-cover scale-110"
            style={{ filter: "blur(40px) brightness(0.4) saturate(1.4)" }}
          />
          <div className="absolute inset-0 bg-[#00062B]/60" />
        </div>

        <div className="relative z-10 flex items-center justify-between px-5 pt-14 pb-4">
          <button
            type="button"
            onClick={() => setShowPlayer(false)}
            className="w-8 h-8 flex items-center justify-center text-white/80"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 9l-7 7-7-7" strokeLinecap="round" />
            </svg>
          </button>
          <div className="text-center">
            <p className="text-white text-sm font-semibold">{currentSong.album.title}</p>
            <p className="text-white/50 text-xs">{currentSong.album.artist}</p>
          </div>
          <button type="button" className="w-8 h-8 flex items-center justify-center text-white/50">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="1" fill="currentColor" />
              <circle cx="12" cy="12" r="1" fill="currentColor" />
              <circle cx="12" cy="19" r="1" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div className="relative z-10 flex-1 flex flex-col items-center px-8">
          <div className="w-full aspect-square rounded-3xl overflow-hidden shadow-2xl mb-8 mt-2">
            <img
              src={currentSong.album.artwork}
              alt={currentSong.album.title}
              className="w-full h-full object-cover"
              style={{
                transform: isPlaying ? "scale(1.02)" : "scale(1)",
                transition: "transform 0.5s ease",
              }}
            />
          </div>

          <div className="w-full flex items-center justify-between mb-5">
            <div className="flex-1 min-w-0">
              <h2 className="text-white text-xl font-bold leading-tight truncate">{currentSong.title}</h2>
              <p className="text-white/60 text-sm mt-0.5 truncate">{currentSong.album.artist}</p>
            </div>
            <button
              type="button"
              className="ml-4 text-white/30 flex-shrink-0"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
            </button>
          </div>

          <div className="w-full mb-2">
            <input
              type="range"
              min={0}
              max={duration}
              value={currentTime}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="w-full h-1 rounded-full appearance-none cursor-pointer player-progress-thumb"
              style={{
                background: `linear-gradient(to right, #319ED8 ${progress * 100}%, rgba(255,255,255,0.2) ${progress * 100}%)`,
              }}
            />
            <div className="flex justify-between mt-1.5">
              <span className="text-white/40 text-xs">{formatDuration(currentTime)}</span>
              <span className="text-white/40 text-xs">{formatDuration(duration)}</span>
            </div>
          </div>

          <div className="w-full flex items-center justify-between mb-8">
            <button
              type="button"
              onClick={toggleShuffle}
              className={`p-2 transition-colors ${shuffle ? "text-[#319ED8]" : "text-white/40"}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" strokeLinecap="round" />
              </svg>
            </button>

            <button type="button" onClick={prev} className="text-white p-2">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6zm3.5 6L20 18V6z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={togglePlay}
              className="w-16 h-16 rounded-full flex items-center justify-center text-[#00062B] shadow-lg active:scale-95 transition-transform"
              style={{ background: "linear-gradient(135deg, #a0d8f0, #319ED8)" }}
            >
              {isPlaying ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1.5" />
                  <rect x="14" y="4" width="4" height="16" rx="1.5" />
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.14v14l11-7-11-7z" />
                </svg>
              )}
            </button>

            <button type="button" onClick={next} className="text-white p-2">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zm2.5-6L18 18V6z" />
              </svg>
            </button>

            <button type="button" onClick={toggleRepeat} className="p-2">
              {repeatIcon()}
            </button>
          </div>

          <div className="w-full flex items-center justify-around">
            <button
              type="button"
              onClick={() => setShowLyrics(true)}
              className="flex flex-col items-center gap-1 text-white/40"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" />
              </svg>
              <span className="text-[9px] font-medium">Lyrics</span>
            </button>
            <button type="button" className="flex flex-col items-center gap-1 text-white/40">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 8v4l3 3" strokeLinecap="round" />
              </svg>
              <span className="text-[9px] font-medium">Up Next</span>
            </button>
            <button type="button" className="flex flex-col items-center gap-1 text-white/40">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" />
              </svg>
              <span className="text-[9px] font-medium">Share</span>
            </button>
          </div>
        </div>

        <div className="relative z-10 h-8 flex items-end justify-center pb-2">
          <div className="w-32 h-1 bg-white/20 rounded-full" />
        </div>
      </div>

      {showLyrics && currentSong.lyrics && (
        <div className="fixed inset-0 z-60 flex justify-center">
          <div className="relative w-full max-w-[390px] min-h-screen flex flex-col overflow-hidden">
            <div className="absolute inset-0">
              <img
                src={currentSong.album.artwork}
                alt=""
                className="w-full h-full object-cover scale-110"
                style={{ filter: "blur(60px) brightness(0.2) saturate(1.2)" }}
              />
              <div className="absolute inset-0 bg-[#00062B]/80" />
            </div>

            <div className="relative z-10 flex items-center justify-between px-5 pt-14 pb-4">
              <button
                type="button"
                onClick={() => setShowLyrics(false)}
                className="w-8 h-8 flex items-center justify-center text-white/80"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M19 9l-7 7-7-7" strokeLinecap="round" />
                </svg>
              </button>
              <p className="text-white text-sm font-semibold">Lyrics</p>
              <div className="w-8" />
            </div>

            <div className="relative z-10 px-6 pb-12 overflow-y-auto scrollbar-hide flex-1">
              <h3 className="text-white text-lg font-bold mb-1">{currentSong.title}</h3>
              <p className="text-white/50 text-sm mb-6">{currentSong.album.artist}</p>
              <div className="text-white/80 text-lg leading-loose whitespace-pre-line font-light">
                {currentSong.lyrics}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
