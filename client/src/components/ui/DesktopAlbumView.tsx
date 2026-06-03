import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ChevronRight, Play, Pause, Shuffle, MoreHorizontal, Lock, X, Share, Info } from "lucide-react";
import { AlbumDesktopTrackRow } from "@/components/ui/AlbumDesktopTrackRow";
import { IconButton } from "@/components/ui/IconButton";
import { BRAND_BLUE } from "@/components/ui/AlbumDesktopSidebar";
import { useToast } from "@/hooks/use-toast";
import { shareUrlForSlug } from "@shared/shareSlug";

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
  // Task #970 — clean per-release share slug. When present, the copy-link
  // CTA copies https://get.goodtunes.music/<slug> instead of /album/:id.
  shareSlug?: string | null;
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
  /** Buy CTA. Receives the current add-on selection so the host can
   *  open BuySheet with the matching toggles pre-checked. */
  onBuyBundle?: (opts?: { signedCert?: boolean }) => void;
  /** Printed-and-signed GoodDeed add-on price (cents). When provided
   *  AND the album isn't owned, a hover-revealed chip pops below the
   *  Buy pill so the fan can toggle the add-on in before checkout.
   *  Omit when the album has no signed-cert add-on configured. */
  signedCertPriceCents?: number | null;
  /** Whether the signed-cert add-on is sold out for this album. When
   *  true the chip renders disabled with "Sold out" copy. */
  signedCertSoldOut?: boolean;
  /** Task #1049 — once an album reaches its Sunset date it has left the
   *  GoodTunes exclusive window for streaming: the buy window closes
   *  (a disabled "Sold Out" replaces the Buy pill) and a "Listen on…"
   *  handoff is surfaced. Owners never see either (the isOwned branch
   *  short-circuits the buy CTAs entirely). */
  sunsetReached?: boolean;
  /** Hand the fan off to their preferred streaming service for the whole
   *  album. Wired by the host (opens the service picker / deep link). */
  onStreamAlbum?: () => void;
  /** Owned=false only. Toggles a 30-sec-per-track preview session that
   *  walks the album. Host wires this into PlayerContext.setPreviewMode +
   *  playSong; the view just renders the rose outline pill. */
  onPlayPreview?: () => void;
  /** When true, the Preview pill renders in its "Pause" state because a
   *  preview session is currently auditing this album. */
  previewActive?: boolean;

  // Per-row CTAs. `state` is computed inside; the row handlers receive the
  // raw song so callers can dispatch into PlayerContext / toast / etc.
  onPlayTrack?: (song: DesktopAlbumSong) => void;
  onMoreTrack?: (song: DesktopAlbumSong) => void;
  onAddTrack?: (song: DesktopAlbumSong) => void;

  /** Songs the current viewer has favorited. The track row renders a
   *  small neutral-white heart (quiet status marker) to the left of the
   *  number cell when the id is in this set — it stays visible while the
   *  row plays (display only — toggling lives in the ⋯ menu). */
  favoriteSongIds?: Set<string>;

  /** When true, an album-level Credits IconButton renders in the action
   *  bar next to Play/Shuffle. Host wires `onOpenAlbumCredits` into the
   *  album credits sheet. */
  hasAlbumCredits?: boolean;
  onOpenAlbumCredits?: () => void;

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

  /** When true, render the medium-breakpoint (portrait-tablet) sizing
   *  regardless of the actual viewport width. Used by the admin tablet
   *  preview, which renders into a fixed virtual canvas that scales to
   *  fit a bezel — viewport-based Tailwind breakpoints would otherwise
   *  always pick `lg` on a desktop monitor. Without this, the admin
   *  preview wouldn't actually mirror what fans see on a real iPad. */
  compact?: boolean;
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
  signedCertPriceCents = null,
  signedCertSoldOut = false,
  sunsetReached = false,
  onStreamAlbum,
  onPlayPreview,
  previewActive = false,
  onPlayTrack,
  onMoreTrack,
  onAddTrack,
  favoriteSongIds,
  hasAlbumCredits = false,
  onOpenAlbumCredits,
  breadcrumb,
  lyricsOpen,
  lyrics,
  onCloseLyrics,
  compact = false,
}: DesktopAlbumViewProps) {
  /* Tailwind class buckets. When `compact` is true (admin tablet
     preview) we force the md sizing irrespective of viewport, because
     the preview renders inside a transform-scaled canvas where
     viewport-based `lg:` breakpoints would otherwise pick the desktop
     layout on a desktop monitor and the preview wouldn't actually
     mirror what fans see on a real iPad. When false (normal fan route)
     we use responsive `lg:` classes so the layout switches between md
     and lg with the actual window width. */
  const cls = compact
    ? {
        column: "max-w-[720px] mx-auto px-6 py-6 transition-[max-width,margin] duration-200 flex-1 min-w-0",
        heroSection: "mt-7 flex gap-6",
        cover: "rounded-2xl overflow-hidden flex-shrink-0 w-[220px] h-[220px]",
        title: "text-white font-bold tracking-[-0.015em] leading-[1.05] text-[32px]",
        lyricsAside: "hidden",
      }
    : {
        // Apple parity: let the album content (hero + tracklist) breathe
        // the full available width next to the sidebar instead of capping
        // at ~960px and leaving big side margins. We only re-introduce a
        // generous cap on ultra-wide monitors (2xl) so rows don't stretch
        // absurdly long. The description keeps its own reading measure via
        // its max-w below.
        column: "max-w-[720px] mx-auto lg:max-w-none lg:mx-0 2xl:max-w-[1600px] 2xl:mx-auto px-6 lg:px-12 py-6 lg:py-8 transition-[max-width,margin] duration-200 flex-1 min-w-0",
        heroSection: "mt-7 flex gap-6 lg:gap-8",
        cover: "rounded-2xl overflow-hidden flex-shrink-0 w-[220px] h-[220px] lg:w-[280px] lg:h-[280px]",
        title: "text-white font-bold tracking-[-0.015em] leading-[1.05] text-[32px] lg:text-[40px]",
        lyricsAside: "hidden lg:flex flex-col flex-shrink-0 w-[360px] sticky top-0 self-start h-screen py-8 pr-10 pl-2",
      };
  const { toast } = useToast();
  const handleCopyShareLink = async () => {
    // Task #970 — copy the clean per-release share link when the album has
    // a slug so what fans share matches what operators promote.
    const url = album.shareSlug
      ? shareUrlForSlug(album.shareSlug)
      : typeof window !== "undefined"
      ? `${window.location.origin}/album/${album.id}`
      : `/album/${album.id}`;
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
          shell — 960px at lg keeps the hero artwork at 280px without
          stretching the description block past a comfortable reading
          measure. At md (real tablets in portrait, 768–1023) we drop to
          720px max + tighter horizontal padding so the hero and
          tracklist still feel intentional rather than stretched. */}
      <div
        className={[cls.column, showLyrics ? "mx-0 ml-auto" : ""].join(" ")}
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

        {/* Hero. Cover shrinks to 220px at md (portrait tablets) so the
            artist/title block keeps a comfortable reading measure next
            to it; at lg we restore the full 280px Apple-Music density. */}
        <section className={`relative ${cls.heroSection}`} data-testid="album-hero">
          {/* Apple-Music top-right chrome: Share + More sit together in the
              top-right corner of the album header, away from the transport
              controls (Task #1055). */}
          <div className="absolute top-0 right-0 flex items-center gap-1">
            <IconButton
              variant="ghost"
              size="md"
              label="Share album"
              onClick={handleCopyShareLink}
              className="text-white/80 hover:text-white"
              data-testid="button-share-album"
            >
              <Share strokeWidth={2} />
            </IconButton>
            <IconButton
              variant="ghost"
              size="md"
              label="More options"
              className="text-white/70 hover:text-white"
              data-testid="button-album-more"
            >
              <MoreHorizontal strokeWidth={2} />
            </IconButton>
          </div>
          <div
            className={cls.cover}
            style={{
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
              className={cls.title}
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
              {isOwned ? (
                <>
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
                  {canPlay && (
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
                  {hasAlbumCredits && (
                    <IconButton
                      variant="ghost"
                      size="md"
                      label="Album credits"
                      onClick={onOpenAlbumCredits}
                      className="border border-white/30 text-white/80 hover:text-white hover:border-white/85"
                      data-testid="button-album-credits"
                    >
                      <Info strokeWidth={2} />
                    </IconButton>
                  )}
                </>
              ) : (
                <>
                  <PreviewPlayPill
                    canPlay={canPlay}
                    active={previewActive}
                    isPlaying={!!isPlaying}
                    onClick={canPlay ? onPlayPreview : undefined}
                  />
                  {/* Task #1049 — after sunset the album has moved to the
                      streaming services, so the buy window is closed: a quiet,
                      disabled "Sold Out" replaces the lit Buy pill, and a
                      "Listen on…" handoff sits alongside it. */}
                  {album.priceCents != null &&
                    (sunsetReached ? (
                      <button
                        type="button"
                        disabled
                        className="h-11 px-6 rounded-full inline-flex items-center justify-center font-semibold text-[14px] text-white/45 cursor-not-allowed"
                        style={{ background: "rgba(255,255,255,0.06)" }}
                        data-testid="button-buy-sold-out"
                      >
                        Sold Out
                      </button>
                    ) : (
                      <BuyPricePill
                        priceLabel={formatPrice(album.priceCents)}
                        signedCertPriceCents={signedCertPriceCents}
                        signedCertSoldOut={signedCertSoldOut}
                        onBuy={(opts) => onBuyBundle?.(opts)}
                      />
                    ))}
                  {sunsetReached && onStreamAlbum && (
                    <button
                      type="button"
                      onClick={onStreamAlbum}
                      data-testid="button-listen-on"
                      className="h-11 px-6 rounded-full inline-flex items-center justify-center gap-2 text-white font-semibold text-[14px] transition-transform active:scale-[0.97]"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--brand-purple), var(--brand-blue))",
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M7 17L17 7M9 7h8v8" />
                      </svg>
                      Listen on…
                    </button>
                  )}
                </>
              )}
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
            <div className="flex flex-col" data-testid="track-list">
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
                    isFavorite={!!favoriteSongIds?.has(s.id)}
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
          className={cls.lyricsAside}
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

/* Rose accent — matches the per-row triangle/equalizer in
   AlbumDesktopTrackRow so the album-level Play pill and the row-level
   "now previewing" indicator speak the same color story. */
const ROSE = "#FF5470";

/**
 * Rose-outline Play pill for the not-owned (Preview & Purchase) state.
 * • At rest with previews available → rose outline, rose triangle, "Play".
 * • While a preview session is auditioning this album → swaps to a Pause
 *   glyph + "Pause" label (preserves the same button as the toggle).
 * • When no previews exist (`canPlay=false`) → disabled with a tooltip.
 */
function PreviewPlayPill({
  canPlay,
  active,
  isPlaying,
  onClick,
}: {
  canPlay: boolean;
  active: boolean;
  isPlaying: boolean;
  onClick?: () => void;
}) {
  const disabled = !canPlay || !onClick;
  const showPause = active && isPlaying;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={
        disabled
          ? "Previews aren't available for this album yet"
          : showPause
            ? "Pause preview"
            : "Play 30-second preview"
      }
      data-testid="button-play-preview"
      aria-label={showPause ? "Pause preview" : "Play 30-second preview"}
      className={[
        "h-11 pl-4 pr-6 rounded-full inline-flex items-center gap-2 font-semibold text-[14px] transition-colors",
        disabled
          ? "border border-white/20 text-white/35 cursor-not-allowed"
          : "border-2 border-[#FF5470] text-[#FF5470] hover:bg-[#FF5470]/12 active:scale-[0.97]",
      ].join(" ")}
    >
      {showPause ? (
        <Pause className="w-4 h-4 fill-current" strokeWidth={0} />
      ) : (
        <Play className="w-4 h-4 fill-current" strokeWidth={0} />
      )}
      <span>{showPause ? "Pause" : "Play"}</span>
    </button>
  );
}

/**
 * Rose-filled Buy pill wrapper.
 *
 * - At rest: "Buy Bundle — $14.99".
 * - On `pointer:fine` hover (desktop / trackpad): label flips to
 *   "Buy Now" and a small add-on chip pops below offering the printed +
 *   signed GoodDeed at its add-on price. Toggling the chip pre-checks
 *   the matching toggle in BuySheet on click.
 * - Touch surfaces (no fine pointer): the chip is always visible
 *   underneath when an add-on is offered, since hover doesn't exist.
 *
 * The whole group sits inside a `group` wrapper so the chip lifecycle
 * is purely CSS-driven on hover for desktop and idempotent on touch.
 */
function BuyPricePill({
  priceLabel,
  signedCertPriceCents,
  signedCertSoldOut,
  onBuy,
}: {
  priceLabel: string;
  signedCertPriceCents: number | null;
  signedCertSoldOut: boolean;
  onBuy?: (opts?: { signedCert?: boolean }) => void;
}) {
  const [hover, setHover] = useState(false);
  const [signedCert, setSignedCert] = useState(false);
  const hasAddon = signedCertPriceCents != null && signedCertPriceCents > 0;
  // Reset the toggle whenever the album-level add-on availability
  // changes — without this, toggling signed-cert on album A and then
  // navigating to album B (which doesn't offer it) would keep
  // `signedCert=true` and pass it through to checkout, where the
  // server (`server/commerce.ts`) rejects with 400 "Signed certificate
  // isn't offered on this album". Same goes for the run going sold-out
  // mid-session.
  useEffect(() => {
    if ((!hasAddon || signedCertSoldOut) && signedCert) setSignedCert(false);
  }, [hasAddon, signedCertSoldOut, signedCert]);
  // Touch surfaces (no fine pointer): always show the add-on chip;
  // desktop: only on hover/focus. Detect lazily — purely a render
  // affordance, no resize listener needed.
  const isCoarsePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const showChip = hasAddon && (hover || isCoarsePointer);
  return (
    <div
      className="relative inline-flex flex-col items-start"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      data-testid="buy-bundle-group"
    >
      <button
        type="button"
        onClick={() => onBuy?.(signedCert ? { signedCert: true } : undefined)}
        data-testid="button-buy-bundle"
        data-hover={hover ? "true" : "false"}
        className="h-11 px-6 rounded-full inline-flex items-center justify-center text-white font-semibold text-[14px] transition-[background-color,box-shadow,transform] cursor-pointer active:scale-[0.97]"
        style={{
          background: ROSE,
          boxShadow: hover
            ? "0 8px 22px rgba(255,84,112,0.45)"
            : "0 4px 12px rgba(255,84,112,0.25)",
        }}
      >
        <span className="whitespace-nowrap" data-testid="text-buy-label">
          {hover ? "Buy Now" : `Buy Bundle — ${priceLabel}`}
        </span>
      </button>

      {showChip && (
        <div
          className="absolute left-0 top-full mt-2 z-20"
          data-testid="buy-addon-chips"
        >
          <button
            type="button"
            disabled={signedCertSoldOut}
            onClick={(e) => {
              e.stopPropagation();
              if (signedCertSoldOut) return;
              setSignedCert((v) => !v);
            }}
            data-testid="chip-addon-signed-cert"
            data-selected={signedCert ? "true" : "false"}
            className={[
              "inline-flex items-center gap-2 rounded-full h-8 px-3 text-xs font-semibold whitespace-nowrap transition-colors",
              signedCertSoldOut
                ? "border border-white/15 text-white/35 cursor-not-allowed"
                : signedCert
                  ? "border-2 border-[color:var(--brand-pink)] bg-[color:var(--brand-pink)]/15 text-white"
                  : "border border-white/30 bg-black/30 text-white/85 hover:border-white/70 hover:bg-black/45",
            ].join(" ")}
          >
            <span
              aria-hidden
              className={[
                "inline-block w-3.5 h-3.5 rounded-[3px] flex-shrink-0 transition-colors",
                signedCert
                  ? "bg-[color:var(--brand-pink)]"
                  : "border border-white/55 bg-transparent",
              ].join(" ")}
            >
              {signedCert && (
                <svg
                  viewBox="0 0 12 12"
                  className="w-full h-full text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2.5 6.5l2.5 2.5 4.5-5" />
                </svg>
              )}
            </span>
            <span>
              {signedCertSoldOut
                ? "Signed GoodDeed — Sold out"
                : `Add signed GoodDeed +${formatPrice(signedCertPriceCents!)}`}
            </span>
          </button>
        </div>
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
