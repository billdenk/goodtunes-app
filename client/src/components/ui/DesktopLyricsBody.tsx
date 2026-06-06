import { usePlayer } from "@/context/PlayerContext";
import { SyncedLyrics } from "@/components/ui/SyncedLyrics";

/**
 * Shared karaoke body for the desktop lyrics rail.
 *
 * Pulled entirely from the currently-playing song (`.lyrics`,
 * `.syncedLyrics`, `.writers`) + player time/state, so it renders the SAME
 * shared `SyncedLyrics` surface the mobile player uses — active line sharp,
 * neighbours blur/fade, auto-scroll. Both the album page's in-flow lyrics
 * panel and the persistent storefront/artist lyrics rail render THIS, so the
 * two surfaces can't drift. Sizing/padding are tuned for the 360px rail; we
 * never edit SyncedLyrics internals.
 */
export function DesktopLyricsBody() {
  const player = usePlayer();
  const cs = player.currentSong;

  if (!cs) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center px-6">
        <p className="text-fan-secondary italic text-sm text-center">
          Pick a track to see its lyrics here.
        </p>
      </div>
    );
  }

  const hasPlain = !!cs.lyrics && cs.lyrics.trim().length > 0;
  const hasSynced = !!cs.syncedLyrics && cs.syncedLyrics.length > 0;
  if (!hasPlain && !hasSynced) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-fan-primary font-semibold text-base">
          No Lyrics Available
        </p>
        <p className="text-fan-secondary text-sm mt-1">
          There aren't any lyrics available for this song.
        </p>
      </div>
    );
  }

  return (
    <SyncedLyrics
      lyrics={cs.lyrics}
      duration={player.duration}
      syncedLyrics={cs.syncedLyrics}
      currentTime={player.currentTime}
      onSeek={player.seekTo}
      writers={(cs as any).writers}
      active={player.showLyrics}
      fontSize={22}
      gapClassName="gap-3"
      scrollOffsetRatio={0.16}
      paddingTop="16vh"
      paddingBottom="24vh"
      className="flex-1 min-h-0 px-4"
    />
  );
}
