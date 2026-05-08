import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/data/musicData";
import { useLocation } from "wouter";

export function MiniPlayer() {
  const { currentSong, isPlaying, togglePlay, next, setShowPlayer, currentTime, duration } = usePlayer();
  const [location] = useLocation();

  if (!currentSong || location === "/player") return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="absolute bottom-[83px] left-0 right-0 z-30 bg-[#0D1B4B]/90 backdrop-blur-xl border-t border-white/10 cursor-pointer"
      onClick={() => setShowPlayer(true)}
    >
      <div className="h-0.5 bg-white/10">
        <div
          className="h-full bg-[#319ED8] transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex items-center gap-3 px-4 py-2.5">
        <img
          src={currentSong.album.artwork}
          alt={currentSong.album.title}
          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{currentSong.title}</p>
          <p className="text-white/50 text-xs truncate">{currentSong.album.artist}</p>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          className="text-white p-1"
        >
          {isPlaying ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="text-white/70 p-1"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18L14.5 12 6 6v12zm8-12v12h2V6h-2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
