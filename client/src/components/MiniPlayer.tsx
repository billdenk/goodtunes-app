import { usePlayer } from "@/context/PlayerContext";
import { useLocation } from "wouter";

export function MiniPlayer() {
  const { currentSong, isPlaying, togglePlay, next, setShowPlayer } = usePlayer();
  const [location] = useLocation();

  if (!currentSong || location === "/player") return null;

  return (
    <div className="absolute bottom-[83px] left-0 right-0 z-30 px-4 pb-1">
      <div
        className="relative cursor-pointer active:scale-[0.98] transition-transform"
        style={{
          borderRadius: 9999,
          background: "rgba(36, 36, 40, 0.92)",
          backdropFilter: "blur(28px) saturate(180%)",
          WebkitBackdropFilter: "blur(28px) saturate(180%)",
          boxShadow: "0 8px 36px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.07) inset",
        }}
        onClick={() => setShowPlayer(true)}
      >
        <div className="flex items-center gap-3 pl-2.5 pr-3 py-2">
          <img
            src={currentSong.album.artwork}
            alt={currentSong.album.title}
            className="flex-shrink-0 object-cover"
            style={{ width: 40, height: 40, borderRadius: 7, boxShadow: "0 3px 10px rgba(0,0,0,0.45)" }}
          />

          <div className="flex-1 min-w-0">
            <p className="text-white text-[14px] font-semibold truncate leading-snug">{currentSong.title}</p>
            <p className="text-white/55 text-[12px] truncate leading-snug">{currentSong.album.artist}</p>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={togglePlay}
              className="w-9 h-9 flex items-center justify-center text-white active:opacity-60 transition-opacity"
            >
              {isPlaying ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="4" width="4" height="16" rx="1.5" />
                  <rect x="15" y="4" width="4" height="16" rx="1.5" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 6.82v10.36c0 .79.87 1.27 1.54.84l8.14-5.18a1 1 0 000-1.69L9.54 5.98A.998.998 0 008 6.82z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={next}
              className="w-9 h-9 flex items-center justify-center text-white active:opacity-60 transition-opacity"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12z" />
                <rect x="16" y="6" width="2" height="12" rx="1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
