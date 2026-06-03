import { usePlayer, PREVIEW_CAP_SECONDS } from "@/context/PlayerContext";
import { useLocation } from "wouter";
import { useDesktopShell } from "@/hooks/useDesktopShell";
import { PlayerDock } from "@/components/ui/PlayerDock";

// Task #1092 — the mobile/tablet now-playing surface moved into the unified
// bottom console (BottomNav). MiniPlayer now renders ONLY on the lg+ web
// desktop shell. On mobile/tablet/native it returns null (the console owns
// now-playing there).
//
// Bill (operator) asked for the desktop storefront now-playing surface to be
// the SAME full-width bottom PlayerDock the desktop album page uses — not the
// small bottom-right capsule it used to be. So this renders the compact-density
// PlayerDock centered above the content area, wired to the global player.
// The lyrics button is intentionally omitted here: storefront pages don't
// mount the side lyrics panel, so the dock would be a dead control. The album
// page (AlbumDetailDesktop) renders its OWN dock with lyrics, so it never
// mounts MobileChrome/MiniPlayer and there's no double dock.
export function MiniPlayer() {
  const player = usePlayer();
  const [location] = useLocation();
  const isDesktop = useDesktopShell();

  if (!isDesktop) return null;
  if (!player.currentSong || location === "/player") return null;

  const dockTrack = {
    title: player.currentSong.title,
    subtitle: player.currentSong.album.artist,
    playable: true,
  };

  const dockCover = (
    <img
      src={player.currentSong.album.artwork}
      alt=""
      className="w-full h-full object-cover"
      draggable={false}
    />
  );

  // Preview-mode mirrors AlbumDetailDesktop: the scrubber denominator is the
  // 30-sec cap (not the song's true duration) so the bar fills as the player
  // auto-advances previews.
  const progress = player.previewMode
    ? Math.min(100, (player.currentTime / PREVIEW_CAP_SECONDS) * 100)
    : player.duration > 0
      ? Math.min(100, (player.currentTime / player.duration) * 100)
      : 0;

  return (
    <div className="fixed left-0 right-0 bottom-4 z-40 flex justify-center pointer-events-none">
      <div className="pointer-events-auto">
        <PlayerDock
          density="compact"
          track={dockTrack}
          hasSelection={true}
          playing={player.isPlaying}
          previewMode={player.previewMode}
          progress={progress}
          totalSeconds={player.previewMode ? PREVIEW_CAP_SECONDS : player.duration}
          onTogglePlay={player.togglePlay}
          onPrev={player.prev}
          onNext={player.next}
          onSeek={(s) => {
            if (player.previewMode) {
              player.seekTo(Math.min(s, PREVIEW_CAP_SECONDS - 0.1));
            } else {
              player.seekTo(s);
            }
          }}
          coverNode={dockCover}
        />
      </div>
    </div>
  );
}
