import { X } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";

/**
 * Shared "Up Next" body for the desktop surfaces.
 *
 * Renders the upcoming slice of the queue: tap a row to jump to it (same
 * queue), ✕ to drop it. Pulled entirely from the player context so the SAME
 * list renders in both the full-screen Now Playing panel and the persistent
 * desktop right rail / album in-flow panel — the two can't drift. Mirrors the
 * mobile queue list. Container-agnostic: each host wraps it in its own panel
 * chrome (the rail's solid navy card, the overlay's translucent card).
 */
export function DesktopQueueBody() {
  const player = usePlayer();
  const { queue, currentIndex, currentSong } = player;
  const upcoming = queue.slice(currentIndex + 1);
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <p className="text-fan-secondary text-xs font-semibold uppercase tracking-[0.2em]">
          Up Next
        </p>
        {currentSong && (
          <p className="text-fan-faint text-sm mt-1 truncate">
            From {currentSong.album.title}
          </p>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-3 pb-5">
        {upcoming.length === 0 ? (
          <div className="text-center pt-10 px-4">
            <p className="text-fan-secondary text-sm">Nothing else queued.</p>
            {player.autoplay && (
              <p className="text-fan-faint text-xs mt-1">
                Autoplay will pick something similar when this track ends.
              </p>
            )}
          </div>
        ) : (
          upcoming.map((s, i) => {
            const idxInQueue = currentIndex + 1 + i;
            return (
              <div
                key={`${s.id}-${idxInQueue}`}
                className="flex items-center gap-3 rounded-lg hover:bg-white/5 transition-colors"
                data-testid={`queue-item-${s.id}`}
              >
                <button
                  type="button"
                  onClick={() => player.playSong(s, queue)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left py-2 pl-2"
                  data-testid={`button-jump-queue-${s.id}`}
                >
                  <img
                    src={s.album.artwork}
                    alt=""
                    className="flex-shrink-0 object-cover"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 6,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
                    }}
                    draggable={false}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-fan-primary text-sm font-medium truncate leading-tight">
                      {s.title}
                    </p>
                    <p className="text-fan-secondary text-xs truncate leading-tight mt-0.5">
                      {s.album.artist}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => player.removeFromQueue(idxInQueue)}
                  className="w-9 h-9 flex-shrink-0 flex items-center justify-center text-fan-faint hover:text-fan-primary transition-colors"
                  aria-label={`Remove ${s.title} from Up Next`}
                  data-testid={`button-remove-queue-${s.id}`}
                >
                  <X className="w-4 h-4" />
                  <span className="sr-only">Remove</span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
