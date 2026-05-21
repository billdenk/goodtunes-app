import { Play, Pause, Search } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";

/**
 * Thin top strip that shows what's currently playing on the fan-facing
 * desktop shell. Sits above the album hero, mirrors Apple Music's
 * top-of-page "now playing" pill but quieter — single row, transparent
 * background, divider underneath.
 *
 * Tap the cover/title → toggles play/pause. When nothing's playing yet,
 * the strip renders empty space on the left and just the search affordance
 * on the right so the page chrome stays balanced.
 *
 * Graduated from the mockup sandbox. Re-exported by the sandbox via a
 * thin shim so the canvas stays in sync.
 */
export function AlbumTopNowPlayingStrip() {
  const { currentSong, isPlaying, togglePlay } = usePlayer();

  return (
    <div
      className="flex items-center gap-3 px-6 h-14 border-b border-white/8 flex-shrink-0"
      data-testid="top-now-playing-strip"
    >
      {currentSong ? (
        <button
          type="button"
          onClick={togglePlay}
          className="group flex items-center gap-3 min-w-0 max-w-[420px] -ml-1 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
          data-testid="button-top-toggle"
        >
          <div className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0 bg-white/10 relative">
            {currentSong.album?.artwork ? (
              <img
                src={currentSong.album.artwork}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : null}
            <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity">
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current text-white" strokeWidth={0} />
              ) : (
                <Play className="w-4 h-4 fill-current text-white" strokeWidth={0} />
              )}
            </div>
          </div>
          <div className="min-w-0 text-left">
            <div className="text-white text-[13px] font-semibold truncate">
              {currentSong.title}
            </div>
            <div className="text-white/55 text-[11.5px] truncate">
              {currentSong.album?.artist}
            </div>
          </div>
        </button>
      ) : (
        <div className="text-white/40 text-[12px]">Nothing playing</div>
      )}

      <div className="flex-1" />

      <button
        type="button"
        aria-label="Search"
        data-testid="button-top-search"
        className="w-10 h-10 rounded-full inline-flex items-center justify-center text-white/65 hover:text-white hover:bg-white/8 transition-colors"
      >
        <Search className="w-[18px] h-[18px]" strokeWidth={2} />
      </button>
    </div>
  );
}
