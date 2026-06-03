import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { ChevronLeft, Play, Pause, Shuffle, MoreHorizontal, Lock, Share, Info } from "lucide-react";
import { AlbumDesktopTrackRow } from "@/components/ui/AlbumDesktopTrackRow";
import { IconButton } from "@/components/ui/IconButton";
import { BRAND_BLUE } from "@/components/ui/AlbumDesktopSidebar";
import { useToast } from "@/hooks/use-toast";
import { shareUrlForSlug } from "@shared/shareSlug";
import { formatReleaseDateLong } from "@shared/albumStage";
import { trackPlaybackState } from "@shared/trackPlayback";

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
  // Task #1078 — Apple-style album footer. Exact original release date
  // (ISO YYYY-MM-DD) + free-text ℗ copyright credit. Both optional; the
  // footer degrades to the bare year when no exact date is set.
  originalReleaseDate?: string | null;
  copyrightLine?: string | null;
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
  // Task #1078 — denormalized record-label entity for the footer credit.
  label?: { id: string; name: string; logoUrl?: string | null } | null;

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

  /** Override the back-pill destination. Defaults to navigating to
   *  /collection (mirrors the mobile album surface's back carat). */
  onBack?: () => void;

  /** Optional right-side lyrics slide-in panel. When `lyrics` is supplied
   *  AND `lyricsOpen=true`, a 360-wide panel animates in from the right
   *  edge; the main content column smoothly reflows to make room and
   *  stays visible beside it (Apple-Music behavior — no full-screen
   *  takeover). The `lyrics` node owns its own scroll/karaoke surface
   *  (the fan route passes the shared `SyncedLyrics`). `onCloseLyrics`
   *  wires the panel's `×` button — host owns the open/close state. */
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

// Task #1078 — total album runtime for the footer, in whole minutes
// ("58 minutes"). Falls back to seconds for sub-minute runs so a single
// 40-second track doesn't read "0 minutes".
function formatRuntime(songs: { duration: number }[]): string {
  const total = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const min = Math.round(total / 60);
  if (min < 1) {
    const sec = Math.round(total);
    return `${sec} ${sec === 1 ? "second" : "seconds"}`;
  }
  return `${min} ${min === 1 ? "minute" : "minutes"}`;
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
  label,
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
  onBack,
  lyricsOpen,
  lyrics,
  onCloseLyrics,
  compact = false,
}: DesktopAlbumViewProps) {
  const reduceMotion = useReducedMotion();
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
        title: "text-fan-primary font-bold tracking-[-0.015em] leading-[1.05] text-[32px]",
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
        title: "text-fan-primary font-bold tracking-[-0.015em] leading-[1.05] text-[32px] lg:text-[40px]",
      };
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const handleBack = onBack ?? (() => navigate("/collection"));
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
        className={[cls.column, showLyrics ? "lg:mx-0 lg:ml-auto" : ""].join(" ")}
      >
        {/* Back-carat pill — matches the mobile album surface's glass
            IconButton + chevron-left treatment so the two surfaces are
            consistent. Returns the viewer to where they came from
            (collection by default, or the originating context if a host
            passes `onBack`). The album title lives in the hero below. */}
        <IconButton
          variant="glass"
          label="Back to collection"
          onClick={handleBack}
          data-testid="button-back-album"
        >
          <ChevronLeft strokeWidth={2.5} className="-translate-x-[1px]" />
        </IconButton>

        {/* Hero. Cover shrinks to 220px at md (portrait tablets) so the
            artist/title block keeps a comfortable reading measure next
            to it; at lg we restore the full 280px Apple-Music density. */}
        <section className={`relative ${cls.heroSection}`} data-testid="album-hero">
          {/* Apple-Music top-right chrome: Share + More sit together in the
              top-right corner of the album header, away from the transport
              controls (Task #1055). */}
          <div className="absolute top-0 right-0 flex items-center gap-1">
            <IconButton
              variant="glass"
              size="md"
              label="Share album"
              onClick={handleCopyShareLink}
              className="text-fan-primary hover:text-white"
              data-testid="button-share-album"
            >
              <Share strokeWidth={2} />
            </IconButton>
            <IconButton
              variant="glass"
              size="md"
              label="More options"
              className="text-fan-secondary hover:text-white"
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
            {/* Apple tone: big bold white title first, then the artist line
                directly beneath it flush-left in GoodTunes blue (no avatar
                circle), then the genre · year meta, then the description —
                mirroring the mobile album surface. */}
            <h1
              className={cls.title}
              data-testid="album-title"
            >
              {album.title}
            </h1>

            {album.primaryArtistId ? (
              <Link
                href={`/admin/people/${album.primaryArtistId}`}
                data-testid="link-artist"
                className="self-start mt-2 text-[17px] font-semibold tracking-[-0.01em] transition-colors hover:underline underline-offset-4"
                style={{ color: BRAND_BLUE, textDecorationColor: BRAND_BLUE }}
              >
                {album.artist}
              </Link>
            ) : (
              <span
                className="self-start mt-2 text-[17px] font-semibold tracking-[-0.01em]"
                style={{ color: BRAND_BLUE }}
                data-testid="text-artist"
              >
                {album.artist}
              </span>
            )}

            {meta && (
              <div
                className="mt-3 text-fan-secondary text-[11.5px] font-semibold uppercase tracking-[0.14em]"
                data-testid="album-meta"
              >
                {meta}
              </div>
            )}

            {album.description && (
              <p
                className="mt-4 text-fan-secondary text-[14px] leading-[1.55] max-w-[640px] line-clamp-3"
                data-testid="album-description"
              >
                {album.description}
              </p>
            )}

            <div className="mt-6 flex items-center gap-3">
              {isOwned ? (
                /* Apple-tone transport row, mirroring the mobile album
                   surface: Shuffle (glass) · Play (white pill, primary) ·
                   Info (glass). */
                <>
                  {canPlay && (
                    <IconButton
                      variant="glass"
                      size="lg"
                      label="Shuffle"
                      onClick={onShuffle}
                      style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                      data-testid="button-shuffle-album"
                    >
                      <Shuffle strokeWidth={2.2} />
                    </IconButton>
                  )}
                  {canPlay && (
                    <button
                      type="button"
                      onClick={onPlayAll}
                      data-testid="button-play-album"
                      className="h-12 pl-6 pr-7 rounded-full inline-flex items-center gap-2 font-semibold text-[15px] transition-transform active:scale-[0.97]"
                      style={{ background: "#fff", color: "var(--brand-bg)" }}
                    >
                      <Play className="w-5 h-5 fill-current" strokeWidth={0} />
                      Play
                    </button>
                  )}
                  {hasAlbumCredits && (
                    <IconButton
                      variant="glass"
                      size="lg"
                      label="Album credits"
                      onClick={onOpenAlbumCredits}
                      style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
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
                        className="h-11 px-6 rounded-full inline-flex items-center justify-center font-semibold text-[14px] text-fan-secondary cursor-not-allowed"
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

        {/* Tabs — Apple-Music segmented control */}
        <div className="mt-10 flex items-center justify-center">
          <div
            className="inline-flex items-center gap-1 rounded-full bg-white/8 p-1"
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
                  className="relative h-9 px-5 inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors"
                  style={{ color: on ? "#fff" : "rgba(255,255,255,0.55)" }}
                >
                  {on && (
                    <motion.span
                      aria-hidden
                      layoutId="album-tab-pill"
                      className="absolute inset-0 rounded-full bg-white/15 shadow-[0_1px_3px_rgba(0,0,0,0.25)] ring-1 ring-white/10"
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 520, damping: 38, mass: 0.8 }
                      }
                    />
                  )}
                  <span className="relative z-10">{it.label}</span>
                  {it.key !== "music" && it.count > 0 && (
                    <span className="relative z-10 text-xs text-fan-secondary font-medium">
                      ({it.count})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="mt-6">
          {tab === "music" && (
            <div className="flex flex-col pt-1" data-testid="track-list">
              {/* Apple-style top hairline — inset + same weight as the
                  per-row separators so the list reads as one uniform set of
                  rules instead of a thick full-bleed bar above row 1. */}
              <span aria-hidden className="mx-4 h-px bg-white/10" />
              {songs.map((s) => {
                const state = trackPlaybackState({
                  isOwned,
                  isPreviewable: s.isPreviewable,
                });
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
              {/* Task #1078 — Apple-style album footer: full original
                  release date (falls back to the bare year), song count +
                  total runtime, label credit, then the ℗ copyright line. */}
              <div
                className="mt-7 text-xs leading-relaxed"
                style={{ color: "rgba(255,255,255,0.34)" }}
              >
                <p data-testid="text-album-date-footer">
                  {formatReleaseDateLong(album.originalReleaseDate) ?? album.year}
                </p>
                <p className="mt-0.5" data-testid="text-album-runtime-footer">
                  {songs.length} {songs.length === 1 ? "song" : "songs"}
                  {", "}
                  {formatRuntime(songs)}
                </p>
                {label && label.name && (
                  <p
                    className="mt-1 inline-flex items-center gap-1.5"
                    data-testid={`text-album-label-footer-${label.id}`}
                  >
                    {label.logoUrl && (
                      <img
                        src={label.logoUrl}
                        alt=""
                        className="w-3.5 h-3.5 rounded-sm object-contain bg-white/10"
                      />
                    )}
                    <span>{label.name}</span>
                  </p>
                )}
                {album.copyrightLine && (
                  <p className="mt-1" data-testid="text-album-copyright-footer">
                    ℗ {album.copyrightLine}
                  </p>
                )}
              </div>
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

      {/* Right-side lyrics slide-in (Apple-Music style). The width is the
          animated property: the aside grows from 0 → 360px so the primary
          column reflows smoothly to make room and stays fully visible —
          no full-screen takeover. The inner card is fixed-width and
          right-justified inside the overflow-hidden aside, so it reads as
          a panel sliding in from the right edge. Caller owns the toggle
          (PlayerContext.showLyrics + setShowLyrics). lg-only: the 360px
          panel needs the room a wide desktop provides. The `lyrics` node
          (the shared karaoke SyncedLyrics on the fan route) owns its own
          scroll, so the body is a plain flex container — no extra
          scrollbar. */}
      <AnimatePresence initial={false}>
        {showLyrics && !compact && (
          <motion.aside
            key="lyrics-panel"
            className="hidden lg:flex justify-end flex-shrink-0 overflow-hidden sticky top-0 self-start h-screen"
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: LYRICS_PANEL_WIDTH }}
            exit={{ width: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 420, damping: 44, mass: 0.9 }
            }
            aria-label="Lyrics"
            data-testid="panel-lyrics"
          >
            <div
              className="flex-shrink-0 h-full py-8 pr-8 pl-2 flex flex-col"
              style={{ width: LYRICS_PANEL_WIDTH }}
            >
              <div
                className="flex-1 min-h-0 rounded-2xl overflow-hidden flex flex-col"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex-1 min-h-0 flex flex-col">{lyrics}</div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Fixed pixel width of the desktop lyrics panel. The aside animates its
 *  own width between 0 and this value; the inner card is pinned to it so
 *  the slide reads as an edge reveal rather than a squash. */
const LYRICS_PANEL_WIDTH = 360;

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
          ? "border border-white/20 text-fan-faint cursor-not-allowed"
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
                ? "border border-white/15 text-fan-faint cursor-not-allowed"
                : signedCert
                  ? "border-2 border-[color:var(--brand-pink)] bg-[color:var(--brand-pink)]/15 text-white"
                  : "border border-white/30 bg-black/30 text-fan-primary hover:border-white/70 hover:bg-black/45",
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
                  className="w-full h-full text-fan-primary"
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
        className="w-full rounded-2xl flex items-center justify-center text-fan-secondary text-[14px]"
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
                <Lock className="w-4 h-4 text-fan-primary" strokeWidth={2.2} />
              </div>
            </div>
          )}
          {it.label && (
            <div className="absolute left-3 right-3 bottom-3 text-fan-primary text-[12.5px] font-semibold truncate">
              {it.label}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
