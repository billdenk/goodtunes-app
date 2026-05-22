import { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  useAlbumOwnership,
  setDevAlbumOwnership,
} from "@/hooks/useAlbumOwnership";
import {
  AlbumDesktopSidebar,
  BRAND_BG,
} from "@/components/ui/AlbumDesktopSidebar";
import { AlbumTopNowPlayingStrip } from "@/components/ui/AlbumTopNowPlayingStrip";
import { PlayerDock } from "@/components/ui/PlayerDock";
import {
  DesktopAlbumView,
  type DesktopAlbumSong,
  type DesktopAlbumTab,
} from "@/components/ui/DesktopAlbumView";
import type { PlayerSong } from "@/context/PlayerContext";
import type { Album as PlayerAlbum } from "@/data/musicData";

type ApiSong = {
  id: string;
  albumId: string;
  title: string;
  trackNumber: number;
  duration: number;
  lyrics: string | null;
  audioUrl: string | null;
  syncedLyrics: { timeMs: number; text: string }[] | null;
  isExplicit: boolean;
  isPreviewable?: boolean | null;
  previewStartMs?: number | null;
  previewEndMs?: number | null;
};
type ApiAlbum = {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  year: number | null;
  type: "Single" | "EP" | "LP";
  description: string | null;
  isExplicit: boolean;
  genre?: string | null;
  goodTunesReleaseDate?: string | null;
  priceCents?: number | null;
  primaryArtistId?: string | null;
  label?: { id: string; name: string; logoUrl: string | null } | null;
  songs: ApiSong[];
};
type ApiAlbumVideo = {
  id: string;
  albumId: string;
  videoUrl: string;
  posterUrl?: string | null;
  title?: string | null;
};
type ApiAlbumPhoto = {
  id: string;
  albumId: string;
  photoUrl: string;
  caption?: string | null;
};

/**
 * Desktop fan-facing Preview & Purchase shell. Rendered by `/album/:id`
 * at viewports ≥1024px (mobile branch handled by AlbumDetail.tsx).
 *
 * This page composes:
 *   • AlbumDesktopSidebar          (left nav)
 *   • AlbumTopNowPlayingStrip      (header strip)
 *   • DesktopAlbumView             (hero + tabs + tracklist + bonus + lyrics panel)
 *   • PlayerDock density="compact" (Apple-Music-density bottom chrome)
 *
 * The DesktopAlbumView primitive is shared with the admin album preview
 * so editors see the same surface fans see, pixel-for-pixel.
 */
export function AlbumDetailDesktop() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const player = usePlayer();
  const [tab, setTab] = useState<DesktopAlbumTab>("music");

  const isOwned = useAlbumOwnership(id);

  const { data: album, isLoading } = useQuery<ApiAlbum>({
    queryKey: ["/api/albums", id],
    enabled: !!id,
  });
  const { data: videos = [] } = useQuery<ApiAlbumVideo[]>({
    queryKey: ["/api/albums", id, "videos"],
    enabled: !!id,
  });
  const { data: photos = [] } = useQuery<ApiAlbumPhoto[]>({
    queryKey: ["/api/albums", id, "photos"],
    enabled: !!id,
  });

  const songs = useMemo(
    () =>
      [...(album?.songs ?? [])].sort((a, b) => a.trackNumber - b.trackNumber),
    [album?.songs],
  );

  const hasPreviews = songs.some((s) => s.isPreviewable);
  const canPlay = isOwned || hasPreviews;

  // Songs eligible to play given current ownership state. Locked songs
  // never enter the queue — preview-only sessions are filtered to the
  // marked singles, fully-owned sessions include everything.
  const playableSongs: PlayerSong[] = useMemo(() => {
    if (!album) return [];
    const albumForSong: PlayerAlbum = {
      id: album.id,
      title: album.title,
      artist: album.artist,
      artwork: album.artwork,
      year: album.year ?? 0,
      type: album.type,
      description: album.description ?? "",
    };
    return songs
      .filter((s) => isOwned || s.isPreviewable)
      .map((s) => ({
        id: s.id,
        albumId: s.albumId,
        title: s.title,
        trackNumber: s.trackNumber,
        duration: s.duration,
        lyrics: s.lyrics ?? undefined,
        audioUrl: s.audioUrl ?? undefined,
        syncedLyrics: s.syncedLyrics ?? null,
        isExplicit: !!s.isExplicit,
        album: albumForSong,
      })) as PlayerSong[];
  }, [album, songs, isOwned]);

  const handlePlayAll = () => {
    if (playableSongs.length === 0) return;
    player.playSong(playableSongs[0], playableSongs);
  };
  const handleShuffle = () => {
    if (playableSongs.length === 0) return;
    const shuffled = [...playableSongs].sort(() => Math.random() - 0.5);
    player.playSong(shuffled[0], shuffled);
  };
  const handlePlayTrack = (song: DesktopAlbumSong) => {
    const playable = playableSongs.find((p) => p.id === song.id);
    if (!playable) return;
    if (player.currentSong?.id === song.id) {
      player.togglePlay();
      return;
    }
    player.playSong(playable, playableSongs);
  };
  const handleAddTrack = () => {
    toast({ title: "Added to playlist (coming next)" });
  };
  const handleBuyBundle = () => {
    toast({ title: "Checkout coming next" });
  };

  if (!album && !isLoading) {
    return (
      <div
        className="w-full h-screen flex items-center justify-center text-white"
        style={{ background: BRAND_BG }}
      >
        <div className="text-center">
          <p>Album not found</p>
          <button
            onClick={() => navigate("/collection")}
            className="mt-4 text-[#319ED8]"
            data-testid="link-back-collection"
          >
            Back to Collection
          </button>
        </div>
      </div>
    );
  }

  if (!album) {
    return (
      <div
        className="w-full h-screen flex items-center justify-center text-white/55"
        style={{ background: BRAND_BG }}
      >
        Loading…
      </div>
    );
  }

  // Lyrics panel body — pulled from the currently-playing song. Falls
  // back to a placeholder so the panel still reads as intentional when
  // the user opens it before picking a track. GoodSync (timed) lyrics
  // get the karaoke pass in a follow-up — for now the panel renders the
  // plain `lyrics` text line by line.
  const lyricsBody = (() => {
    const cs = player.currentSong;
    if (!cs) {
      return (
        <p className="text-white/55 italic">
          Pick a track to see its lyrics here.
        </p>
      );
    }
    if (!cs.lyrics || cs.lyrics.trim().length === 0) {
      return (
        <p className="text-white/55 italic">
          No lyrics yet for "{cs.title}".
        </p>
      );
    }
    return (
      <div className="whitespace-pre-line">{cs.lyrics}</div>
    );
  })();

  // PlayerDock track adapter. Dock shows the artwork as the cover slot
  // when something is playing; otherwise the dock's idle placeholder
  // takes over. Title falls back to a friendly "Not playing" so the
  // pill still reads cleanly while idle on the desktop surface.
  const dockTrack = player.currentSong
    ? {
        title: player.currentSong.title,
        subtitle: player.currentSong.album.artist,
        playable: true,
      }
    : { title: "Not playing", subtitle: undefined, playable: false };
  const dockCover = player.currentSong ? (
    <img
      src={player.currentSong.album.artwork}
      alt=""
      className="w-full h-full object-cover"
      draggable={false}
    />
  ) : undefined;

  return (
    <div
      className="flex w-full h-screen overflow-hidden text-white"
      style={{
        background: BRAND_BG,
        fontFamily: "system-ui, -apple-system, 'SF Pro Text', sans-serif",
      }}
      data-testid="preview-purchase-desktop"
    >
      <AlbumDesktopSidebar
        user={
          user
            ? {
                displayName: user.displayName ?? user.email,
                email: user.email,
                avatarUrl: user.photoUrl ?? null,
              }
            : null
        }
        activeKey="discover"
      />

      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        <AlbumTopNowPlayingStrip />

        <main className="flex-1 overflow-y-auto">
          <DesktopAlbumView
            album={album}
            songs={songs}
            videos={videos}
            photos={photos}
            isOwned={isOwned}
            canPlay={canPlay}
            tab={tab}
            onTabChange={setTab}
            currentSongId={player.currentSong?.id ?? null}
            isPlaying={player.isPlaying}
            onPlayAll={handlePlayAll}
            onShuffle={handleShuffle}
            onPlayTrack={handlePlayTrack}
            onMoreTrack={() => toast({ title: "Track menu coming next" })}
            onAddTrack={handleAddTrack}
            onBuyBundle={handleBuyBundle}
            lyricsOpen={player.showLyrics}
            lyrics={lyricsBody}
            onCloseLyrics={() => player.setShowLyrics(false)}
          />
        </main>
      </div>

      {/* Bottom-fixed compact PlayerDock. Centered above the content area
          (left:0/right:0 + flex justify-center) so it sits in the same
          horizontal band as the tracklist, matching Apple Music's desktop
          dock placement. */}
      <div className="fixed left-0 right-0 bottom-4 z-40 flex justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <PlayerDock
            density="compact"
            track={dockTrack}
            hasSelection={!!player.currentSong}
            playing={player.isPlaying}
            progress={
              player.duration > 0
                ? Math.min(100, (player.currentTime / player.duration) * 100)
                : 0
            }
            totalSeconds={player.duration}
            onTogglePlay={player.togglePlay}
            onPrev={player.prev}
            onNext={player.next}
            onSeek={(s) => player.seekTo(s)}
            onLyrics={() => player.setShowLyrics(!player.showLyrics)}
            coverNode={dockCover}
          />
        </div>
      </div>

      {import.meta.env.DEV && id && (
        <DevOwnershipToggle albumId={id} isOwned={isOwned} />
      )}
    </div>
  );
}

/**
 * Dev-only ownership flip. Renders a small fixed pill in the bottom-right.
 * `import.meta.env.DEV` gate at the call site keeps this out of prod
 * builds entirely (Vite tree-shakes the unused branch).
 */
function DevOwnershipToggle({
  albumId,
  isOwned,
}: {
  albumId: string;
  isOwned: boolean;
}) {
  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-black/65 backdrop-blur-md ring-1 ring-white/15 px-3 py-2 text-[11.5px] font-semibold text-white shadow-2xl"
      data-testid="dev-ownership-toggle"
    >
      <span className="text-white/60 uppercase tracking-[0.1em] text-[10px]">DEV</span>
      <button
        type="button"
        onClick={() => setDevAlbumOwnership(albumId, !isOwned)}
        className={[
          "px-2.5 h-7 rounded-full transition-colors",
          isOwned ? "bg-[#319ED8] text-white" : "bg-white/10 text-white/75 hover:bg-white/15",
        ].join(" ")}
        data-testid="button-dev-ownership"
      >
        {isOwned ? "Owned" : "Not owned"}
      </button>
    </div>
  );
}
