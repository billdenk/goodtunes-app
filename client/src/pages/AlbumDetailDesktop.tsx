import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePlayer, PREVIEW_CAP_SECONDS } from "@/context/PlayerContext";
import { BuySheet } from "@/components/checkout/BuySheet";
import { buyEnabled } from "@/lib/platform";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useFavoriteSongs } from "@/hooks/useFavorites";
import { AlbumCreditsSheet, type AlbumCreditsRow } from "@/components/ui/AlbumCreditsSheet";
import { toast } from "@/hooks/use-toast";
import {
  useAlbumOwnership,
  setDevAlbumOwnership,
} from "@/hooks/useAlbumOwnership";
import {
  AlbumDesktopSidebar,
  BRAND_BG,
} from "@/components/ui/AlbumDesktopSidebar";
import {
  AlbumDetailDesktopSkeleton,
  AlbumNotFound,
} from "@/components/ui/AlbumDetailSkeleton";
import { AlbumTopNowPlayingStrip } from "@/components/ui/AlbumTopNowPlayingStrip";
import { PlayerDock } from "@/components/ui/PlayerDock";
import {
  DesktopAlbumView,
  type DesktopAlbumSong,
  type DesktopAlbumTab,
} from "@/components/ui/DesktopAlbumView";
import type { PlayerSong } from "@/context/PlayerContext";
import type { Album as PlayerAlbum, Person } from "@/data/musicData";
import { PersonDetailSheet } from "@/pages/AlbumDetail";

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
 * Fan-facing Preview & Purchase shell — sidebar + hero + tracklist
 * layout. Rendered by `/album/:id` at viewports ≥768px (the mobile
 * branch handled by AlbumDetail.tsx covers <768px). DesktopAlbumView
 * itself reflows between md (768–1023, real portrait tablets) and lg
 * (≥1024, true desktop): smaller cover and title at md, lyrics side
 * panel mounted only at lg where its 360px width still leaves room.
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
  const [showBuySheet, setShowBuySheet] = useState(() => {
    if (typeof window === "undefined") return false;
    if (!buyEnabled) return false;
    return new URL(window.location.href).searchParams.get("buy") === "1";
  });
  // When the fan ticked the signed-cert add-on chip on the hero before
  // clicking Buy, we hand the toggle into BuySheet so the checkout sheet
  // opens with it pre-checked. Cleared whenever the sheet closes.
  const [buyAddons, setBuyAddons] = useState<{ signedCert: boolean }>({
    signedCert: false,
  });

  const isOwned = useAlbumOwnership(id);
  const favSongs = useFavoriteSongs();
  const [showAlbumCredits, setShowAlbumCredits] = useState(false);
  // Person opened from the album-credits sheet. The desktop view has no
  // SuperCredits sheet stack of its own, so PersonDetailSheet brings its own
  // self-contained About/Music/Gear sheet (+ instrument/vendor sub-stack).
  const [creditPerson, setCreditPerson] = useState<{ person: Person; role: string } | null>(null);

  const { data: album, isLoading } = useQuery<ApiAlbum>({
    queryKey: ["/api/albums", id],
    enabled: !!id,
  });
  const { data: albumCredits } = useQuery<{
    bySongId: Record<string, unknown>;
    production?: AlbumCreditsRow[];
  }>({
    queryKey: ["/api/albums", id, "credits"],
    enabled: !!id,
  });
  const productionCredits = albumCredits?.production ?? [];
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

  // Is the player currently auditioning a song from this album under
  // preview-mode? Used by the rose Play pill to switch into its Pause
  // affordance + by the dock to render the PREVIEW badge.
  const previewActive =
    !isOwned &&
    player.previewMode &&
    !!player.currentSong &&
    player.currentSong.albumId === album?.id;

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
    // Owned playback — full song. Make sure preview-mode is off so a
    // prior preview session doesn't bleed into post-purchase listening.
    if (player.previewMode) player.setPreviewMode(false);
    player.playSong(playableSongs[0], playableSongs);
  };
  const handleShuffle = () => {
    if (playableSongs.length === 0) return;
    if (player.previewMode) player.setPreviewMode(false);
    const shuffled = [...playableSongs].sort(() => Math.random() - 0.5);
    player.playSong(shuffled[0], shuffled);
  };

  // Album-level Preview play pill. Three intents fold into one handler:
  //   1. Already auditioning this album → toggle play/pause.
  //   2. No queue yet (or queue is for a different album) → start a
  //      30-sec-per-track preview session from track 1.
  //   3. Resume a previously-started preview session that was paused
  //      (queue still loaded with this album's previewables) → toggle.
  const handlePlayPreview = () => {
    if (playableSongs.length === 0) return;
    if (previewActive) {
      player.togglePlay();
      return;
    }
    player.setPreviewMode(true);
    player.playSong(playableSongs[0], playableSongs);
  };

  const handlePlayTrack = (song: DesktopAlbumSong) => {
    const playable = playableSongs.find((p) => p.id === song.id);
    if (!playable) return;
    if (player.currentSong?.id === song.id) {
      player.togglePlay();
      return;
    }
    // When the album is not owned, per-row taps audition that row's
    // 30-second preview rather than starting full playback. Mirror the
    // album-level pill so behavior stays consistent.
    if (!isOwned) {
      player.setPreviewMode(true);
    } else if (player.previewMode) {
      player.setPreviewMode(false);
    }
    player.playSong(playable, playableSongs);
  };
  const handleAddTrack = () => {
    toast({ title: "Added to playlist (coming next)" });
  };
  const handleBuyBundle = (opts?: { signedCert?: boolean }) => {
    setBuyAddons({ signedCert: !!opts?.signedCert });
    setShowBuySheet(true);
  };

  // Fetch buy-options up front so the hero can render the signed-cert
  // chip price without waiting for a hover → modal-mount round-trip.
  // Only fires on web (buyEnabled) and only when we have an id.
  const { data: buyOptions } = useQuery<{
    addons: { kind: string; priceCents: number }[];
    signedCertSoldOut?: boolean;
  }>({
    queryKey: ["/api/albums", id, "buy-options"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/albums/${id}/buy-options`);
      return r.json();
    },
    enabled: !!id && buyEnabled && !isOwned,
    staleTime: 60_000,
  });
  const signedCertAddon = buyOptions?.addons?.find(
    (a) => a.kind === "signed_cert",
  );
  const signedCertPriceCents = signedCertAddon?.priceCents ?? null;
  const signedCertSoldOut = !!buyOptions?.signedCertSoldOut;

  // Preview-session end → open Buy. When the fan auditioned all preview
  // tracks back-to-back, the player's natural-end path lands on the last
  // track at the 30-sec cap, fires advance, runs out of queue, and flips
  // isPlaying to false. We watch that exact edge (was-playing → not-
  // playing, in preview-mode, on the last queue index, at the cap) and
  // pop BuySheet so the moment closes with a clear CTA rather than dead
  // silence. Pausing manually mid-preview must NOT trigger this — the
  // currentTime ≥ cap check filters that out.
  const wasPlayingRef = useRef(player.isPlaying);
  useEffect(() => {
    const was = wasPlayingRef.current;
    wasPlayingRef.current = player.isPlaying;
    if (!buyEnabled || isOwned) return;
    if (!player.previewMode) return;
    if (!was || player.isPlaying) return;
    if (player.queue.length === 0) return;
    if (player.currentIndex !== player.queue.length - 1) return;
    if (player.currentTime < PREVIEW_CAP_SECONDS - 0.5) return;
    setBuyAddons({ signedCert: false });
    setShowBuySheet(true);
  }, [
    player.isPlaying,
    player.previewMode,
    player.queue.length,
    player.currentIndex,
    player.currentTime,
    isOwned,
  ]);

  // Turn preview mode off when the route unmounts so a navigation away
  // from Preview & Purchase doesn't leave the 30-sec cap armed for
  // subsequent full-track playback elsewhere in the app. Use a ref so
  // the cleanup always calls the *latest* setter (the player context
  // value identity changes on every render — closing over the initial
  // snapshot would no-op).
  const setPreviewModeRef = useRef(player.setPreviewMode);
  setPreviewModeRef.current = player.setPreviewMode;
  useEffect(() => {
    return () => {
      setPreviewModeRef.current(false);
    };
  }, []);

  if (!album && !isLoading) {
    return <AlbumNotFound variant="desktop" />;
  }

  if (!album) {
    return <AlbumDetailDesktopSkeleton />;
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
            onPlayPreview={handlePlayPreview}
            previewActive={previewActive}
            onPlayTrack={handlePlayTrack}
            onMoreTrack={() => toast({ title: "Track menu coming next" })}
            onAddTrack={handleAddTrack}
            favoriteSongIds={favSongs.set}
            hasAlbumCredits={productionCredits.length > 0}
            onOpenAlbumCredits={() => setShowAlbumCredits(true)}
            onBuyBundle={buyEnabled ? handleBuyBundle : undefined}
            signedCertPriceCents={buyEnabled ? signedCertPriceCents : null}
            signedCertSoldOut={signedCertSoldOut}
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
            previewMode={player.previewMode}
            progress={(() => {
              // Under preview-mode the scrubber denominator is the 30-sec
              // cap, not the song's true duration — so the bar fills to
              // 100% right as PlayerContext auto-advances to the next
              // preview, mirroring Apple Music's preview behavior.
              if (player.previewMode) {
                return Math.min(
                  100,
                  (player.currentTime / PREVIEW_CAP_SECONDS) * 100,
                );
              }
              return player.duration > 0
                ? Math.min(100, (player.currentTime / player.duration) * 100)
                : 0;
            })()}
            totalSeconds={
              player.previewMode
                ? PREVIEW_CAP_SECONDS
                : player.duration
            }
            onTogglePlay={player.togglePlay}
            onPrev={player.prev}
            onNext={player.next}
            onSeek={(s) => {
              // Clamp seeks during preview-mode so dragging the scrubber
              // past the 30-sec cap doesn't desync the auto-advance.
              if (player.previewMode) {
                player.seekTo(Math.min(s, PREVIEW_CAP_SECONDS - 0.1));
              } else {
                player.seekTo(s);
              }
            }}
            onLyrics={() => player.setShowLyrics(!player.showLyrics)}
            coverNode={dockCover}
          />
        </div>
      </div>

      {import.meta.env.DEV && id && (
        <DevOwnershipToggle albumId={id} isOwned={isOwned} />
      )}

      {showBuySheet && album && (
        <BuySheet
          albumId={album.id}
          signedCertDefault={buyAddons.signedCert}
          onClose={() => {
            setShowBuySheet(false);
            setBuyAddons({ signedCert: false });
          }}
        />
      )}

      {creditPerson && album ? (
        <PersonDetailSheet
          person={creditPerson.person}
          album={album as unknown as PlayerAlbum}
          contextLabel={creditPerson.role}
          onClose={() => setCreditPerson(null)}
        />
      ) : showAlbumCredits && productionCredits.length > 0 && album ? (
        <AlbumCreditsSheet
          albumTitle={album.title}
          artist={album.artist}
          rows={productionCredits}
          onOpenPerson={(personId, role) => {
            const row = productionCredits.find((r) => (r.person?.id ?? r.personId) === personId);
            const p = row?.person;
            if (!p) return;
            setShowAlbumCredits(false);
            setCreditPerson({
              person: { id: p.id, name: p.name, photoUrl: p.photoUrl ?? undefined },
              role,
            });
          }}
          onClose={() => setShowAlbumCredits(false)}
        />
      ) : null}
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
