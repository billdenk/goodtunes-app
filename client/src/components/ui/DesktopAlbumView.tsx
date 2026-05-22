import type { ReactNode } from "react";
import { Link } from "wouter";
import { ChevronRight, Play, Shuffle, MoreHorizontal, Lock, X, Link2 } from "lucide-react";
import { AlbumDesktopTrackRow } from "@/components/ui/AlbumDesktopTrackRow";
import { BRAND_BLUE } from "@/components/ui/AlbumDesktopSidebar";
import { useToast } from "@/hooks/use-toast";

/* Trimmed-down song/album/video/photo shapes — DesktopAlbumView consumes
   the SAME response shapes the fan route + admin preview do. We pin only
   the fields this view reads so swapping the upstream endpoint (consumer
   vs. admin) requires no widening. */
export type DesktopAlbumSong = {
  id: string;
  title: string;
  trackNumber: number;
  duration: number;
  isExplicit?: boolean | null;
  isPreviewable?: boolean | null;
};

export type DesktopAlbumData = {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  year: number | null;
  type: "Single" | "EP" | "LP";
  description: string | null;
  genre?: string | null;
  priceCents?: number | null;
  primaryArtistId?: string | null;
};

export type DesktopAlbumVideo = {
  id: string;
  posterUrl?: string | null;
  title?: string | null;
};

export type DesktopAlbumPhoto = {
  id: string;
  photoUrl: string;
  caption?: string | null;
};

export type DesktopAlbumTab = "music" | "videos" | "photos";

export type DesktopAlbumViewProps = {
  album: DesktopAlbumData;
  songs: DesktopAlbumSong[];
  videos: DesktopAlbumVideo[];
  photos: DesktopAlbumPhoto[];

  isOwned: boolean;
  /** When false, "Play" / "Shuffle" CTAs are suppressed (no previews + locked album). */
  canPlay: boolean;

  // Active tab + setter so hosts can persist or sync tab state.
  tab: DesktopAlbumTab;
  onTabChange: (t: DesktopAlbumTab) => void;

  // Currently-playing wiring. Either supply a song id + isPlaying, or omit
  // both for non-interactive previews (admin preview when no player is on
  // screen). Passing currentSongId=null is the same as "nothing playing".
  currentSongId?: string | null;
  isPlaying?: boolean;

  // Album-level CTAs.
  onPlayAll?: () => void;
  onShuffle?: () => void;
  onBuyBundle?: () => void;

  // Per-row CTAs. `state` is computed inside; the row handlers receive the
  // raw song so callers can dispatch into PlayerContext / toast / etc.
  onPlayTrack?: (song: DesktopAlbumSong) => void;
  onMoreTrack?: (song: DesktopAlbumSong) => void;
  onAddTrack?: (song: DesktopAlbumSong) => void;

  /** Override breadcrumb back-link. Defaults to /collection · "Discover". */
  breadcrumb?: ReactNode;

  /** Optional right-side lyrics slide-in panel. When `lyrics` is supplied
   *  AND `lyricsOpen=true`, a 360-wide panel slides in from the right;
   *  the tracklist column stays at its natural width and the panel
   *  layers next to it inside the scroll area. `onCloseLyrics` wires the
   *  panel's `×` button — host owns the open/close state. */
  lyricsOpen?: boolean;
  lyrics?: ReactNode;
  onCloseLyrics?: () => void;
};

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
 * Shared Apple-Music-density desktop album view. Used by:
 *   • The fan-facing /album/:id route at ≥1024px (AlbumDetailDesktop).
 *   • The admin album preview pane (so what the editor sees matches the
 *     fan surface, pixel-for-pixel, instead of relying on a separate
 *     mock).
 *
 * Scope: hero (cover + title/artist/meta/CTAs), tabs, tracklist, and the
 * Videos/Photos bonus grids. Does NOT render the left sidebar, top
 * now-playing strip, or PlayerDock — those belong to the host so each
 * surface can wire its own chrome.
 */
export function DesktopAlbumView({
  album,
  songs,
  videos,
  photos,
  isOwned,
  canPlay,
  tab,
  onTabChange,
  currentSongId,
  isPlaying,
  onPlayAll,
  onShuffle,
  onBuyBundle,
  onPlayTrack,
  onMoreTrack,
  onAddTrack,
  breadcrumb,
  lyricsOpen,
  lyrics,
  onCloseLyrics,
}: DesktopAlbumViewProps) {
  const { toast } = useToast();
  const handleCopyShareLink = async () => {
    const url = typeof window !== "undefined" ? `${window.location.origin}/album/${album.id}` : `/album/${album.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Share this album anywhere." });
    } catch {
      toast({ title: "Copy failed", description: url, variant: "destructive" });
    }
  };
  const meta = [album.genre, album.type === "LP" ? "LP" : album.type, album.year]
    .filter(Boolean)
    .map((s) => String(s).toUpperCase())
    .join(" · ");
  const showLyrics = !!lyricsOpen && !!lyrics;

  return (
    <div className="flex gap-6 w-full" data-testid="desktop-album-view">
      {/* Primary column. Max-width matches the prior AlbumDetailDesktop
          shell — 960px keeps the hero artwork at 280px without stretching
          the description block past a comfortable reading measure. */}
      <div
        className={[
          "max-w-[960px] mx-auto px-10 py-8 transition-[max-width,margin] duration-200 flex-1 min-w-0",
          showLyrics ? "mx-0 ml-auto" : "",
        ].join(" ")}
      >
        {/* Breadcrumb */}
        <nav
          className="flex items-center gap-2 text-[13px]"
          aria-label="Breadcrumb"
          data-testid="breadcrumb"
        >
          {breadcrumb ?? (
            <>
              <Link
                href="/collection"
                className="text-white/55 hover:text-white transition-colors"
                data-testid="link-breadcrumb-discover"
              >
                Discover
              </Link>
              <ChevronRight className="w-3.5 h-3.5 text-white/35" strokeWidth={2.2} />
            </>
          )}
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
                  onClick={onPlayAll}
                  data-testid="button-play-album"
                  className="h-11 pl-5 pr-7 rounded-full inline-flex items-center gap-2 text-white font-semibold text-[14px] transition-colors active:scale-[0.97] hover:opacity-90"
                  style={{ background: BRAND_BLUE }}
                >
                  <Play className="w-4 h-4 fill-current" strokeWidth={0} />
                  Play
                </button>
              )}
              {canPlay && isOwned && (
                <button
                  type="button"
                  onClick={onShuffle}
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
                  onClick={onBuyBundle}
                  data-testid="button-buy-bundle"
                  className="h-11 px-5 rounded-full inline-flex items-center gap-2 text-white font-semibold text-[14px] border border-white/85 hover:bg-white hover:text-[#00062B] transition-colors active:scale-[0.97]"
                >
                  Buy {formatPrice(album.priceCents)}
                </button>
              )}

              <button
                type="button"
                onClick={handleCopyShareLink}
                data-testid="button-share-album"
                aria-label="Copy share link"
                className="h-11 w-11 rounded-full inline-flex items-center justify-center text-white/80 border border-white/30 hover:text-white hover:border-white/85 hover:bg-white/10 transition-colors active:scale-[0.94]"
              >
                <Link2 className="w-4 h-4" strokeWidth={2} />
              </button>

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
              ] as { key: DesktopAlbumTab; label: string; count: number }[]
            ).map((it) => {
              const on = it.key === tab;
              return (
                <button
                  key={it.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-testid={`tab-${it.key}`}
                  onClick={() => onTabChange(it.key)}
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
                const isCurrent = currentSongId === s.id;
                return (
                  <AlbumDesktopTrackRow
                    key={s.id}
                    trackNumber={s.trackNumber}
                    title={s.title}
                    duration={formatDuration(s.duration)}
                    isCurrent={isCurrent}
                    isPlaying={isCurrent && !!isPlaying}
                    isExplicit={!!s.isExplicit}
                    state={state}
                    onPlay={
                      state === "locked" || !onPlayTrack
                        ? undefined
                        : () => onPlayTrack(s)
                    }
                    onMore={
                      state === "locked" || !onMoreTrack
                        ? undefined
                        : () => onMoreTrack(s)
                    }
                    onAdd={
                      state === "locked" || !onAddTrack
                        ? undefined
                        : () => onAddTrack(s)
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

      {/* Right-side lyrics slide-in. Mounted only when both `lyrics` content
          and `lyricsOpen` flag are truthy. Caller owns the toggle (typically
          PlayerContext.showLyrics + setShowLyrics). The panel is sticky-
          height so it scrolls with the primary column and avoids dueling
          scrollbars. */}
      {showLyrics && (
        <aside
          className="hidden lg:flex flex-col flex-shrink-0 w-[360px] sticky top-0 self-start h-screen py-8 pr-10 pl-2"
          aria-label="Lyrics"
          data-testid="panel-lyrics"
        >
          <div
            className="flex-1 min-h-0 rounded-2xl overflow-hidden flex flex-col"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <span className="text-white text-[14px] font-semibold tracking-[-0.005em]">
                Lyrics
              </span>
              <button
                type="button"
                onClick={onCloseLyrics}
                aria-label="Close lyrics"
                data-testid="button-close-lyrics"
                className="w-8 h-8 rounded-full inline-flex items-center justify-center text-white/65 hover:text-white hover:bg-white/8 transition-colors"
              >
                <X className="w-4 h-4" strokeWidth={2.2} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 text-white/82 text-[14px] leading-[1.7]">
              {lyrics}
            </div>
          </div>
        </aside>
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
