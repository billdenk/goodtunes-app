import { useMemo, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Play, Shuffle, MoreHorizontal, Lock } from "lucide-react";
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
  BRAND_BLUE,
} from "@/components/ui/AlbumDesktopSidebar";
import { AlbumTopNowPlayingStrip } from "@/components/ui/AlbumTopNowPlayingStrip";
import { AlbumDesktopTrackRow } from "@/components/ui/AlbumDesktopTrackRow";
import type { PlayerSong } from "@/context/PlayerContext";
import type { Album as PlayerAlbum } from "@/data/musicData";

/* Album shape served by GET /api/albums/:id (admin returns isHidden,
   the consumer endpoint omits it). Only the fields we read on this
   surface are pinned — extra fields are ignored. */
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

type TabKey = "music" | "videos" | "photos";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

/**
 * Desktop fan-facing Preview & Purchase shell. Rendered by `/album/:id`
 * at viewports ≥1024px (mobile branch handled by AlbumDetail.tsx).
 *
 * Wires the graduated mockup primitives (sidebar + top strip + track
 * row) to real album data, real PlayerContext, and a dev-only ownership
 * toggle. Real purchase flow (cart, Stripe, OrderDesk, GoodDeed) lands
 * in subsequent tasks — Buy Bundle is a stub toast for now.
 */
export function AlbumDetailDesktop() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const player = usePlayer();
  const [tab, setTab] = useState<TabKey>("music");

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
  const handlePlayTrack = (song: ApiSong) => {
    const playable = playableSongs.find((p) => p.id === song.id);
    if (!playable) return;
    if (player.currentSong?.id === song.id) {
      player.togglePlay();
      return;
    }
    player.playSong(playable, playableSongs);
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

  const meta = [album.genre, album.type === "LP" ? "LP" : album.type, album.year]
    .filter(Boolean)
    .map((s) => String(s).toUpperCase())
    .join(" · ");

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
          <div className="max-w-[960px] mx-auto px-10 py-8">
            {/* Breadcrumb */}
            <nav
              className="flex items-center gap-2 text-[13px]"
              aria-label="Breadcrumb"
              data-testid="breadcrumb"
            >
              <Link
                href="/collection"
                className="text-white/55 hover:text-white transition-colors"
                data-testid="link-breadcrumb-discover"
              >
                Discover
              </Link>
              <ChevronRight className="w-3.5 h-3.5 text-white/35" strokeWidth={2.2} />
              <span
                className="text-white font-semibold truncate"
                data-testid="text-breadcrumb-title"
              >
                {album.title}
              </span>
            </nav>

            {/* Hero */}
            <section className="mt-7 flex gap-8" data-testid="album-hero">
              <div
                className="rounded-2xl overflow-hidden flex-shrink-0"
                style={{
                  width: 280,
                  height: 280,
                  boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
                }}
              >
                <img src={album.artwork} alt="" className="w-full h-full object-cover" />
              </div>

              <div className="flex-1 min-w-0 flex flex-col pt-2">
                {album.primaryArtistId ? (
                  <Link
                    href={`/admin/people/${album.primaryArtistId}`}
                    data-testid="link-artist"
                    className="group inline-flex items-center gap-2 self-start mb-3"
                  >
                    <div className="w-7 h-7 rounded-full bg-white/10 flex-shrink-0" />
                    <span
                      className="text-white text-[13.5px] font-semibold tracking-[-0.005em] transition-colors group-hover:text-[#319ED8] group-hover:underline underline-offset-4"
                      style={{ textDecorationColor: BRAND_BLUE }}
                    >
                      {album.artist}
                    </span>
                  </Link>
                ) : (
                  <span
                    className="inline-flex items-center gap-2 self-start mb-3 text-white text-[13.5px] font-semibold"
                    data-testid="text-artist"
                  >
                    <span className="w-7 h-7 rounded-full bg-white/10 flex-shrink-0" />
                    {album.artist}
                  </span>
                )}

                <h1
                  className="text-white font-bold tracking-[-0.015em] leading-[1.05]"
                  style={{ fontSize: 40 }}
                  data-testid="album-title"
                >
                  {album.title}
                </h1>

                {meta && (
                  <div
                    className="mt-3 text-white/55 text-[11.5px] font-semibold uppercase tracking-[0.14em]"
                    data-testid="album-meta"
                  >
                    {meta}
                  </div>
                )}

                {album.description && (
                  <p
                    className="mt-4 text-white/72 text-[14px] leading-[1.55] max-w-[640px] line-clamp-3"
                    data-testid="album-description"
                  >
                    {album.description}
                  </p>
                )}

                <div className="mt-6 flex items-center gap-3">
                  {canPlay && (
                    <button
                      type="button"
                      onClick={handlePlayAll}
                      data-testid="button-play-album"
                      className="h-11 pl-5 pr-7 rounded-full inline-flex items-center gap-2 text-white font-semibold text-[14px] transition-colors active:scale-[0.97] hover:opacity-90"
                      style={{ background: BRAND_BLUE }}
                    >
                      <Play className="w-4 h-4 fill-current" strokeWidth={0} />
                      Play
                    </button>
                  )}
                  {canPlay && (
                    <button
                      type="button"
                      onClick={handleShuffle}
                      data-testid="button-shuffle-album"
                      className="h-11 w-11 rounded-full inline-flex items-center justify-center text-white border border-white/85 hover:bg-white hover:text-[#00062B] transition-colors active:scale-[0.94]"
                      aria-label="Shuffle"
                    >
                      <Shuffle className="w-4 h-4" strokeWidth={2} />
                    </button>
                  )}
                  {!isOwned && album.priceCents != null && (
                    <button
                      type="button"
                      onClick={handleBuyBundle}
                      data-testid="button-buy-bundle"
                      className="h-11 pl-5 pr-4 rounded-full inline-flex items-center gap-2 text-white font-semibold text-[14px] border border-white/85 hover:bg-white hover:text-[#00062B] transition-colors active:scale-[0.97]"
                    >
                      Buy Bundle · {formatPrice(album.priceCents)}
                      <ChevronRight className="w-4 h-4" strokeWidth={2.2} />
                    </button>
                  )}

                  <div className="flex-1" />

                  <button
                    type="button"
                    aria-label="More options"
                    data-testid="button-album-more"
                    className="w-11 h-11 rounded-full inline-flex items-center justify-center text-white/70 hover:text-white hover:bg-white/8 transition-colors active:scale-[0.94]"
                  >
                    <MoreHorizontal className="w-5 h-5" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </section>

            {/* Tabs */}
            <div className="mt-10 border-b border-white/8 pb-1">
              <div
                className="w-full flex items-center justify-center gap-10"
                role="tablist"
                data-testid="hero-tabs"
              >
                {(
                  [
                    { key: "music", label: "Music", count: songs.length },
                    { key: "videos", label: "Videos", count: videos.length },
                    { key: "photos", label: "Photos", count: photos.length },
                  ] as { key: TabKey; label: string; count: number }[]
                ).map((it) => {
                  const on = it.key === tab;
                  return (
                    <button
                      key={it.key}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      data-testid={`tab-${it.key}`}
                      onClick={() => setTab(it.key)}
                      className="relative h-11 px-2 inline-flex items-center gap-1.5 text-[15px] font-semibold transition-colors"
                      style={{ color: on ? "#fff" : "rgba(255,255,255,0.5)" }}
                    >
                      {it.label}
                      {it.key !== "music" && it.count > 0 && (
                        <span className="text-[12px] text-white/45 font-medium">
                          ({it.count})
                        </span>
                      )}
                      <span
                        aria-hidden
                        className="absolute left-1/2 -translate-x-1/2 bottom-1 w-7 h-[2.5px] rounded-full transition-opacity"
                        style={{ background: BRAND_BLUE, opacity: on ? 1 : 0 }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab content */}
            <div className="mt-6">
              {tab === "music" && (
                <div className="flex flex-col gap-1.5" data-testid="track-list">
                  {songs.map((s) => {
                    const state: "locked" | "preview" | "full" = isOwned
                      ? "full"
                      : s.isPreviewable
                        ? "preview"
                        : "locked";
                    const isCurrent = player.currentSong?.id === s.id;
                    return (
                      <AlbumDesktopTrackRow
                        key={s.id}
                        trackNumber={s.trackNumber}
                        title={s.title}
                        duration={formatDuration(s.duration)}
                        isCurrent={isCurrent}
                        isPlaying={isCurrent && player.isPlaying}
                        isExplicit={!!s.isExplicit}
                        state={state}
                        onPlay={state === "locked" ? undefined : () => handlePlayTrack(s)}
                        onMore={
                          state === "locked"
                            ? undefined
                            : () => toast({ title: "Track menu coming next" })
                        }
                      />
                    );
                  })}
                </div>
              )}

              {tab === "videos" && (
                <BonusGrid
                  items={videos.map((v) => ({
                    id: v.id,
                    thumb: v.posterUrl ?? album.artwork,
                    label: v.title ?? "Untitled",
                  }))}
                  locked={!isOwned}
                  kind="video"
                />
              )}

              {tab === "photos" && (
                <BonusGrid
                  items={photos.map((p) => ({
                    id: p.id,
                    thumb: p.photoUrl,
                    label: p.caption ?? "",
                  }))}
                  locked={!isOwned}
                  kind="photo"
                />
              )}
            </div>

            <div className="h-16" aria-hidden />
          </div>
        </main>
      </div>

      {import.meta.env.DEV && id && (
        <DevOwnershipToggle albumId={id} isOwned={isOwned} />
      )}
    </div>
  );
}

function BonusGrid({
  items,
  locked,
  kind,
}: {
  items: { id: string; thumb: string; label: string }[];
  locked: boolean;
  kind: "video" | "photo";
}) {
  if (items.length === 0) {
    return (
      <div
        className="w-full rounded-2xl flex items-center justify-center text-white/45 text-[14px]"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px dashed rgba(255,255,255,0.12)",
          minHeight: 220,
        }}
        data-testid={`empty-${kind}s`}
      >
        No {kind}s yet
      </div>
    );
  }
  return (
    <div
      className="grid grid-cols-3 gap-4"
      data-testid={`grid-${kind}s`}
      data-locked={locked ? "true" : "false"}
    >
      {items.map((it) => (
        <div
          key={it.id}
          className="relative aspect-square rounded-2xl overflow-hidden bg-white/5"
          style={{ cursor: locked ? "default" : "pointer" }}
          data-testid={`thumb-${kind}-${it.id}`}
        >
          <img
            src={it.thumb}
            alt=""
            className="w-full h-full object-cover"
            style={{ filter: locked ? "brightness(0.55) saturate(0.85)" : undefined }}
            draggable={false}
          />
          {locked && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-9 h-9 rounded-full bg-black/55 flex items-center justify-center">
                <Lock className="w-4 h-4 text-white" strokeWidth={2.2} />
              </div>
            </div>
          )}
          {it.label && (
            <div className="absolute left-3 right-3 bottom-3 text-white text-[12.5px] font-semibold truncate">
              {it.label}
            </div>
          )}
        </div>
      ))}
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
