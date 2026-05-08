import { usePlayer } from "@/context/PlayerContext";
import { useLocation } from "wouter";

export function MiniPlayer() {
  const { currentSong, isPlaying, togglePlay, next, setShowPlayer, currentTime, duration } = usePlayer();
  const [location] = useLocation();

  if (!currentSong || location === "/player") return null;

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="absolute bottom-[83px] left-0 right-0 z-30 px-3 pb-2">
      <div
        className="relative rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
        style={{
          background: "rgba(28, 28, 30, 0.85)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.08) inset",
        }}
        onClick={() => setShowPlayer(true)}
      >
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="relative flex-shrink-0">
            <img
              src={currentSong.album.artwork}
              alt={currentSong.album.title}
              className="w-11 h-11 rounded-xl object-cover"
              style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-white text-[13px] font-semibold truncate leading-tight">{currentSong.title}</p>
            <p className="text-white/60 text-[12px] truncate mt-0.5 leading-tight">{currentSong.album.artist}</p>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="w-9 h-9 flex items-center justify-center text-white rounded-xl active:bg-white/10"
            >
              {isPlaying ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="4" width="4" height="16" rx="1.5" />
                  <rect x="15" y="4" width="4" height="16" rx="1.5" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18a1 1 0 000-1.69L9.54 5.98A.998.998 0 008 6.82z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="w-9 h-9 flex items-center justify-center text-white rounded-xl active:bg-white/10"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18V6l8.5 6L6 18zm9-12h2v12h-2z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mx-3 mb-2.5 h-0.5 rounded-full bg-white/15 overflow-hidden">
          <div
            className="h-full rounded-full bg-white transition-all duration-1000"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
