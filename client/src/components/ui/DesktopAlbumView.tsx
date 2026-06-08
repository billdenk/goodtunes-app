import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatUsdCents } from "@shared/money";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";
import { popBounce } from "@/lib/motion";
import { ChevronRight, Play, Pause, Shuffle, Lock, Share, MoreHorizontal, X, Maximize2, Bell, ShoppingCart } from "lucide-react";
import { AlbumDesktopTrackRow } from "@/components/ui/AlbumDesktopTrackRow";
import { BonusPlayBadge } from "@/components/ui/BonusPlayBadge";
import { IconButton } from "@/components/ui/IconButton";
import { FAN_TOP_CHROME_INSET } from "@/components/ui/SheetChrome";
import { BRAND_BLUE } from "@/components/ui/AlbumDesktopSidebar";
import { useToast } from "@/hooks/use-toast";
import { shareAlbum } from "@/lib/shareAlbum";
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
  // Task #1158 — per-album footer copyright symbol (℗ vs ©). Null renders
  // as the ℗ default so existing albums are unchanged.
  copyrightSymbol?: string | null;
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
  /** Task #1628 — staged release whose sales-begin (sunrise) date hasn't
   *  arrived. When set (and the album isn't owned), the Buy pill is replaced
   *  by a disabled "Sales Begin {label}" pill (e.g. "Sales Begin 6/8");
   *  previews stay playable. Null/undefined = live buy behavior. */
  salesBeginLabel?: string | null;
  /** Printed-and-signed GoodDeed add-on price (cents). When provided
   *  AND the album isn't owned, a hover-revealed chip pops below the
   *  Buy pill so the fan can toggle the add-on in before checkout.
   *  Omit when the album has no signed-cert add-on configured. */
  signedCertPriceCents?: number | null;
  /** Whether the signed-cert add-on is sold out for this album. When
   *  true the chip renders disabled with "Sold out" copy. */
  signedCertSoldOut?: boolean;
  /** Owned=false only. Toggles a 30-sec-per-track preview session that
   *  walks the album. Host wires this into PlayerContext.setPreviewMode +
   *  playSong; the view just renders the rose outline pill. */
  onPlayPreview?: () => void;
  /** When true, the Preview pill renders in its "Pause" state because a
   *  preview session is currently auditing this album. */
  previewActive?: boolean;

  /** Task #1734 — purchase-funnel "locked unlock" presentation. When true
   *  (get./store. host, web, not owned) the not-owned transport row becomes
   *  Play · Buy/Get-Notified · Get Details, matching the auto-opening offer
   *  modal. Off on the MY player, where the row stays the normal preview/buy
   *  surface. */
  lockedPreview?: boolean;
  /** Pre-launch (sunrise pending) CTA: opens the offer modal's notify step. */
  onGetNotified?: () => void;
  /** Reopens the centered offer modal ("Get Details"). */
  onGetDetails?: () => void;

  // Per-row CTAs. `state` is computed inside; the row handlers receive the
  // raw song so callers can dispatch into PlayerContext / toast / etc.
  onPlayTrack?: (song: DesktopAlbumSong) => void;
  onAddTrack?: (song: DesktopAlbumSong) => void;
  onPlayNextTrack?: (song: DesktopAlbumSong) => void;
  onPlayLastTrack?: (song: DesktopAlbumSong) => void;
  onToggleFavoriteTrack?: (song: DesktopAlbumSong) => void;
  /** Opens the per-track credits surface for a song (mirrors the mobile
   *  track popover's "View Credits"). Wired by the host into the desktop
   *  credits modal scoped to that one song. */
  onViewCreditsTrack?: (song: DesktopAlbumSong) => void;
  /** Per-song "has credits" predicate. The row's Credits item only renders
   *  for songs this returns true for, matching mobile's gating. */
  songHasCredits?: (song: DesktopAlbumSong) => boolean;

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

  /** Task #1185 — top-right ⋯ album menu (mirrors the mobile album
   *  surface's Share+⋯ pill). Each item only renders when its handler is
   *  supplied, so hosts gate by ownership/applicability exactly like the
   *  mobile menu. The Share button always renders (copy-link). */
  onViewCertificate?: () => void;
  onViewProvenance?: () => void;
  onAddAlbumToPlaylist?: () => void;
  /** Download the unsigned fan GoodDeed certificate PDF — wired only when
   *  the fan owns a downloadable GoodDeed for this album. */
  onDownloadCert?: () => void;
  /** Drives the provenance item's label: "Ownership" when the fan owns
   *  more than one copy, else "View Provenance" (matches mobile). */
  isMultiOwned?: boolean;

  /** Clicking (or Enter/Space on) an unlocked bonus-video card calls this
   *  with the video id so the host can open the playback modal — mirrors the
   *  mobile inline tap-to-play. Locked/unowned cards never invoke it. When
   *  omitted (e.g. the admin preview) the cards stay non-interactive. */
  onPlayVideo?: (videoId: string) => void;

  /** Optional right-side lyrics slide-in panel. When `lyrics` is supplied
   *  AND `lyricsOpen=true`, a 360-wide panel animates in from the right
   *  edge; the main content column smoothly reflows to make room and
   *  stays visible beside it (Apple-Music behavior — no full-screen
   *  takeover). The `lyrics` node owns its own scroll/karaoke surface
   *  (the fan route passes the shared `SyncedLyrics`). The panel has no
   *  title/close header — the dock mic owns the open/close toggle. */
  lyricsOpen?: boolean;
  lyrics?: ReactNode;

  /** When supplied, the in-flow lyrics panel reveals an expand control
   *  (hover on pointer devices, first tap on touch) that opens the
   *  full-screen Now Playing surface — the in-flow counterpart to the
   *  persistent DesktopLyricsRail's expand affordance. The host wires this
   *  to `player.setShowPlayer(true)`. Omitted on surfaces with no
   *  full-screen player (e.g. the admin preview), where the control stays
   *  hidden. */
  onExpandLyrics?: () => void;

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
  return formatUsdCents(cents, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Shared Apple-Music-density desktop album view. Used by:
 *   • The fan-facing /album/:id route at ≥1024px (AlbumDetailDesktop).
 *   • The admin album preview pane (so what the editor sees matches the
 *     fan surface, pixel-for-pixel, instead of relying on a separate
 *     mock).
 *
 * Scope: hero (cover + title/artist/meta/CTAs), tracklist, and the
 * stacked Videos/Photos bonus grids. Does NOT render the left sidebar, top
 * now-playing strip, or PlayerDock — those belong to the host so each
 * surface can wire its own chrome.
 */

/**
 * Expand affordance for the in-flow album lyrics panel — the in-flow
 * counterpart to the persistent DesktopLyricsRail's expand control. Keep the
 * two in lock-step: same Maximize2 glyph, "Expand to full-screen player"
 * aria-label, 44pt (w-11 h-11) touch target, and pointer-hover-vs-touch-tap
 * reveal pattern. Wraps the karaoke body so hovering (pointer devices) — or a
 * first tap (touch) — reveals a button whose click opens the full-screen Now
 * Playing surface via the host's `onExpand` (player.setShowPlayer(true)).
 * The in-flow panel still reflows the album column but now shares the rail's
 * flush edge treatment (solid navy, flush right/bottom, top-left corner only);
 * this wrapper only adds the expand control.
 */
function InFlowLyricsExpand({
  onExpand,
  children,
}: {
  onExpand: () => void;
  children: ReactNode;
}) {
  const [canHover] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover)").matches,
  );
  const [revealed, setRevealed] = useState(false);

  return (
    <div
      className="group/lyrics relative flex-1 min-h-0 flex flex-col"
      onClick={!canHover ? () => setRevealed(true) : undefined}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onExpand();
          setRevealed(false);
        }}
        aria-label="Expand to full-screen player"
        className={[
          "absolute top-3 right-3 z-10 w-11 h-11 rounded-full flex items-center justify-center transition-opacity duration-150",
          canHover
            ? "opacity-0 group-hover/lyrics:opacity-100"
            : revealed
              ? "opacity-100"
              : "opacity-0 pointer-events-none",
        ].join(" ")}
        style={{ background: "rgba(0,0,0,0.45)" }}
        data-testid="button-expand-lyrics-panel"
      >
        <Maximize2 className="w-4 h-4 text-white" />
        <span className="sr-only">Expand</span>
      </button>
      {children}
    </div>
  );
}

export function DesktopAlbumView({
  album,
  songs,
  videos,
  photos,
  label,
  isOwned,
  canPlay,
  currentSongId,
  isPlaying,
  onPlayAll,
  onShuffle,
  onBuyBundle,
  salesBeginLabel,
  signedCertPriceCents = null,
  signedCertSoldOut = false,
  onPlayPreview,
  previewActive = false,
  lockedPreview = false,
  onGetNotified,
  onGetDetails,
  onPlayTrack,
  onAddTrack,
  onPlayNextTrack,
  onPlayLastTrack,
  onToggleFavoriteTrack,
  onViewCreditsTrack,
  songHasCredits,
  favoriteSongIds,
  hasAlbumCredits = false,
  onOpenAlbumCredits,
  onViewCertificate,
  onViewProvenance,
  onAddAlbumToPlaylist,
  onDownloadCert,
  isMultiOwned = false,
  onPlayVideo,
  lyricsOpen,
  lyrics,
  onExpandLyrics,
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
        column: "max-w-[720px] mx-auto px-6 py-5 transition-[max-width,margin] duration-200 flex-1 min-w-0",
        heroSection: "mt-3 flex gap-6",
        cover: "rounded-2xl overflow-hidden flex-shrink-0 w-[200px] h-[200px]",
        title: "text-fan-primary font-bold tracking-[-0.015em] leading-[1.05] text-[24px] text-balance",
      }
    : {
        // Apple parity: let the album content (hero + tracklist) breathe
        // the full available width next to the sidebar instead of capping
        // at ~960px and leaving big side margins. We only re-introduce a
        // generous cap on ultra-wide monitors (2xl) so rows don't stretch
        // absurdly long. The description keeps its own reading measure via
        // its max-w below.
        column: "max-w-[720px] mx-auto lg:max-w-none lg:mx-0 2xl:max-w-[1600px] 2xl:mx-auto px-6 lg:px-12 py-5 lg:py-6 transition-[max-width,margin] duration-200 flex-1 min-w-0",
        heroSection: "mt-3 flex gap-6 lg:gap-8",
        cover: "rounded-2xl overflow-hidden flex-shrink-0 w-[200px] h-[200px] lg:w-[240px] lg:h-[240px]",
        title: "text-fan-primary font-bold tracking-[-0.015em] leading-[1.05] text-[24px] lg:text-[28px] text-balance",
      };
  const { toast } = useToast();
  const handleShareAlbum = async () => {
    // Task #1702 — open the native share sheet (same as the phone), falling
    // back to copy-link + toast when the device/browser can't share. Shared
    // handler keeps every album surface in lock-step (see lib/shareAlbum.ts).
    await shareAlbum(album, {
      onCopied: () =>
        toast({ title: "Link copied", description: "Share this album anywhere." }),
      onCopyFailed: (url) =>
        toast({ title: "Copy failed", description: url, variant: "destructive" }),
    });
  };

  // Task #1185 — top-right ⋯ album menu. Anchored under the ⋯ button and
  // portaled to <body> so it floats above the album chrome regardless of
  // overflow. Mirrors the mobile album surface's menu item set.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const hasMenuItems =
    !!onViewCertificate || !!onDownloadCert || !!onViewProvenance || !!onAddAlbumToPlaylist;
  const openMenu = () => {
    const rect = menuBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setMenuOpen((s) => !s);
  };

  // Task #1561 — desktop/tablet "MORE" description popover. The clamped
  // description (DesktopClampedDescription) renders an inline MORE link when
  // it overflows; tapping it flips this flag and we portal a centered
  // rounded-rect card with the full copy (Escape / backdrop / X to close).
  const [descOpen, setDescOpen] = useState(false);
  useEffect(() => {
    if (!descOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDescOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [descOpen]);

  const meta = [album.genre, album.type === "LP" ? "LP" : album.type, album.year]
    .filter(Boolean)
    .map((s) => String(s).toUpperCase())
    .join(" · ");
  const showLyrics = !!lyricsOpen && !!lyrics;

  // Task #1183 — the desktop album page mirrors Apple Music (and our own
  // mobile surface): no pill toggle. The tracklist renders first, then a
  // "Videos" section, then a "Photos" section, stacked vertically in one
  // scroll. Each bonus section only renders when it has items (Task #1118
  // hide-empty rule), so fans never see an empty heading or placeholder.
  const hasVideos = videos.length > 0;
  const hasPhotos = photos.length > 0;

  // Apple-Music "Music Videos" treatment: the section shows a horizontally
  // scrolled rail of up to VIDEO_ROW_CAP wide tiles. A "See All" affordance
  // on the heading flips the rail into the full stacked grid when there are
  // more than fit comfortably in one glance. Tapping a tile calls onPlayVideo
  // so the host opens the full-screen playback modal (the desktop page reuses
  // the mobile BonusVideoPlayer with autoStart).
  const VIDEO_ROW_CAP = 10;
  const [showAllVideos, setShowAllVideos] = useState(false);
  const showVideoSeeAll = videos.length > 4;

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
        {/* Top chrome row. No back-carat on desktop — Apple Music has none on
            album pages; fans navigate via the sidebar rail (Search / Home /
            Collection) or the browser back button, and any album is only ~two
            levels deep. Share + More stay grouped at the right edge. The album
            title lives in the hero below. */}
        {/* The capsule row is pushed down by the shared FAN_TOP_CHROME_INSET
            (Task #1621) so it clears the device status / info bar with a small,
            deliberate margin instead of sitting flush at the column's top
            padding — matching the FanScreen library pages and Apple Music. */}
        <div
          className="flex items-start gap-2"
          style={{ marginTop: FAN_TOP_CHROME_INSET }}
        >
          {/* Apple-Music top-right chrome: Share + More sit together at the
              right edge of the album header, away from the transport controls
              (Task #1055). `ml-auto` keeps them right-aligned. */}
          <div
            className="flex items-center rounded-full ml-auto"
            style={{
              background: "rgba(255,255,255,0.17)",
              backdropFilter: "blur(18px) saturate(180%)",
              WebkitBackdropFilter: "blur(18px) saturate(180%)",
            }}
          >
            <IconButton
              variant="ghost"
              size="md"
              label="Share album"
              onClick={handleShareAlbum}
              className="text-fan-primary hover:text-white"
              data-testid="button-share-album"
            >
              <Share strokeWidth={2} />
            </IconButton>
            {hasMenuItems && (
              <>
                <div className="w-px h-4 bg-white/25" aria-hidden />
                <IconButton
                  ref={menuBtnRef}
                  variant="ghost"
                  size="md"
                  label="Album options"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={openMenu}
                  className="text-fan-primary hover:text-white"
                  data-testid="button-album-menu"
                >
                  <MoreHorizontal strokeWidth={2} />
                </IconButton>
              </>
            )}
          </div>
        </div>

        {createPortal(
          <AnimatePresence>
            {menuOpen && menuPos && (
              <>
                <motion.div
                  className="fixed inset-0 z-[60]"
                  onClick={() => setMenuOpen(false)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                />
                <motion.div
                  role="menu"
                  className="fixed z-[61] rounded-2xl py-1 min-w-[230px] overflow-hidden"
                  style={{
                    top: menuPos.top,
                    right: menuPos.right,
                    background: "rgba(28, 30, 38, 0.96)",
                    backdropFilter: "blur(28px) saturate(180%)",
                    WebkitBackdropFilter: "blur(28px) saturate(180%)",
                    boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    transformOrigin: "top right",
                  }}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0, transition: popBounce(!!reduceMotion) }}
                  exit={reduceMotion ? { opacity: 0, transition: { duration: 0.12 } } : { opacity: 0, scale: 0.92, y: -4, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } }}
                >
                  {onViewCertificate && (
                    <>
                      <button
                        type="button"
                        onClick={() => { setMenuOpen(false); onViewCertificate(); }}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm text-white transition-colors active:bg-white/10"
                        data-testid="menu-view-certificate"
                      >
                        <span>View GoodDeed®</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-mint)" strokeWidth="2">
                          <path d="M9 12l2 2 4-4M7.8 4.7a3.4 3.4 0 001.95-.8 3.4 3.4 0 014.4 0 3.4 3.4 0 001.95.8 3.4 3.4 0 013.15 3.15 3.4 3.4 0 00.8 1.95 3.4 3.4 0 010 4.4 3.4 3.4 0 00-.8 1.95 3.4 3.4 0 01-3.15 3.15 3.4 3.4 0 00-1.95.8 3.4 3.4 0 01-4.4 0 3.4 3.4 0 00-1.95-.8 3.4 3.4 0 01-3.15-3.15 3.4 3.4 0 00-.8-1.95 3.4 3.4 0 010-4.4 3.4 3.4 0 00.8-1.95 3.4 3.4 0 013.15-3.15z" />
                        </svg>
                      </button>
                      <div className="h-px bg-white/8" />
                    </>
                  )}
                  {onDownloadCert && (
                    <>
                      <button
                        type="button"
                        onClick={() => { setMenuOpen(false); onDownloadCert(); }}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm text-white transition-colors active:bg-white/10"
                        data-testid="menu-download-gooddeed-pdf"
                      >
                        <span>Download GoodDeed PDF</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-mint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 3v12" />
                          <path d="M7 10l5 5 5-5" />
                          <path d="M5 21h14" />
                        </svg>
                      </button>
                      <div className="h-px bg-white/8" />
                    </>
                  )}
                  {onViewProvenance && (
                    <>
                      <button
                        type="button"
                        onClick={() => { setMenuOpen(false); onViewProvenance(); }}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm text-white transition-colors active:bg-white/10"
                        data-testid="menu-view-provenance"
                      >
                        <span>{isMultiOwned ? "Ownership" : "View Provenance"}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-blue)" strokeWidth="2" strokeLinecap="round">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                      </button>
                      <div className="h-px bg-white/8" />
                    </>
                  )}
                  {onAddAlbumToPlaylist && (
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onAddAlbumToPlaylist(); }}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm text-white transition-colors active:bg-white/10"
                      data-testid="menu-add-album-to-playlist"
                    >
                      <span>Add to Playlist</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="6" x2="14" y2="6" />
                        <line x1="3" y1="12" x2="14" y2="12" />
                        <line x1="3" y1="18" x2="10" y2="18" />
                        <line x1="18" y1="9" x2="18" y2="21" />
                        <line x1="12" y1="15" x2="24" y2="15" />
                      </svg>
                    </button>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}

        {/* Task #1561 — full-description popover. Mirrors the centered
            rounded-card convention (dim + backdrop-blur scrim, glass card)
            used by the other desktop overlays. Closes on backdrop click,
            the X control, and Escape (handled above). */}
        {createPortal(
          <AnimatePresence>
            {descOpen && album.description && (
              <>
                <motion.div
                  className="fixed inset-0 z-[70]"
                  style={{
                    background: "rgba(0,0,0,0.55)",
                    backdropFilter: "blur(18px) saturate(140%)",
                    WebkitBackdropFilter: "blur(18px) saturate(140%)",
                  }}
                  onClick={() => setDescOpen(false)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                />
                <div className="fixed inset-0 z-[71] flex items-center justify-center p-6 pointer-events-none">
                  <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label="About this album"
                    className="pointer-events-auto relative w-full max-w-[520px] max-h-[80vh] overflow-y-auto rounded-3xl p-7 pt-6"
                    style={{
                      background: "rgba(28, 30, 38, 0.96)",
                      backdropFilter: "blur(28px) saturate(180%)",
                      WebkitBackdropFilter: "blur(28px) saturate(180%)",
                      boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0, transition: popBounce(!!reduceMotion) }}
                    exit={reduceMotion ? { opacity: 0, transition: { duration: 0.14 } } : { opacity: 0, scale: 0.96, y: 6, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
                    data-testid="album-description-popover"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <h2 className="text-fan-primary text-lg font-bold tracking-[-0.01em] leading-tight">
                        {album.title}
                      </h2>
                      <IconButton
                        variant="ghost"
                        size="md"
                        label="Close"
                        onClick={() => setDescOpen(false)}
                        className="-mr-1.5 -mt-1 flex-shrink-0 text-fan-secondary hover:text-white"
                        data-testid="button-close-album-description"
                      >
                        <X strokeWidth={2.2} />
                      </IconButton>
                    </div>
                    <p className="text-fan-secondary text-sm leading-[1.6] whitespace-pre-line">
                      {album.description}
                    </p>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}

        {/* Hero. Cover shrinks to 220px at md (portrait tablets) so the
            artist/title block keeps a comfortable reading measure next
            to it; at lg we restore the full 280px Apple-Music density. */}
        <section className={`relative ${cls.heroSection}`} data-testid="album-hero">
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
                className="self-start mt-1.5 text-[18px] font-semibold tracking-[-0.01em] transition-colors hover:underline underline-offset-4"
                style={{ color: BRAND_BLUE, textDecorationColor: BRAND_BLUE }}
              >
                {album.artist}
              </Link>
            ) : (
              <span
                className="self-start mt-1.5 text-[18px] font-semibold tracking-[-0.01em]"
                style={{ color: BRAND_BLUE }}
                data-testid="text-artist"
              >
                {album.artist}
              </span>
            )}

            {meta && (
              <div
                className="mt-2 text-fan-secondary text-[13px] font-medium tracking-[0]"
                data-testid="album-meta"
              >
                {meta}
              </div>
            )}

            {album.description && (
              <DesktopClampedDescription
                text={album.description}
                onExpand={() => setDescOpen(true)}
              />
            )}

            {/* Apple anchors the transport row at the BOTTOM of the album
                header so it lines up with the bottom of the artwork whether
                or not a description exists. `mt-auto` pushes this row to the
                foot of the metadata column (which stretches to the artwork
                height), reserving the description's room implicitly. */}
            <div className="mt-auto pt-5 flex items-center gap-2.5">
              {isOwned ? (
                /* Apple-tone transport row, mirroring the mobile album
                   surface: Shuffle (glass) · Play (white pill, primary) ·
                   Info (glass). */
                <>
                  {canPlay && (
                    <IconButton
                      variant="glass"
                      size="md"
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
                      className="h-11 pl-5 pr-6 rounded-full inline-flex items-center gap-2 font-semibold text-[15px] transition-transform active:scale-[0.97]"
                      style={{ background: "#fff", color: "var(--brand-bg)" }}
                    >
                      <Play className="w-[18px] h-[18px] fill-current" strokeWidth={0} />
                      Play
                    </button>
                  )}
                  {/* Task #1580 — album-level credits "i" button hidden; credits
                      are per-track only. `hasAlbumCredits`/`onOpenAlbumCredits`
                      wiring stays in place so it can be re-enabled later. */}
                </>
              ) : lockedPreview ? (
                /* Task #1734 — purchase-funnel "locked unlock" transport row:
                   Play (white) · Buy {price} / Get Notified · Get Details.
                   Mirrors the auto-opening offer modal so the base page reads
                   like the real player with the offer fronting it. */
                <>
                  {canPlay && (
                    <button
                      type="button"
                      onClick={onPlayPreview}
                      data-testid="button-play-album"
                      className="h-11 pl-5 pr-6 rounded-full inline-flex items-center gap-2 font-semibold text-sm transition-transform active:scale-[0.97]"
                      style={{ background: "#fff", color: "var(--brand-bg)" }}
                    >
                      <Play className="w-[18px] h-[18px] fill-current" strokeWidth={0} />
                      Play
                    </button>
                  )}
                  {salesBeginLabel ? (
                    <button
                      type="button"
                      onClick={onGetNotified}
                      data-testid="button-get-notified"
                      className="h-11 px-5 rounded-full inline-flex items-center gap-2 font-semibold text-sm text-white transition-transform active:scale-[0.97]"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--brand-purple), var(--brand-blue))",
                      }}
                    >
                      <Bell className="w-4 h-4" strokeWidth={2.2} />
                      Get Notified
                    </button>
                  ) : onBuyBundle && album.priceCents != null ? (
                    <button
                      type="button"
                      onClick={() => onBuyBundle?.()}
                      data-testid="button-buy-bundle"
                      className="h-11 px-5 rounded-full inline-flex items-center gap-2 font-semibold text-sm text-white transition-transform active:scale-[0.97]"
                      style={{
                        background: "#070B22",
                        border: "1px solid rgba(255,255,255,0.12)",
                      }}
                    >
                      <ShoppingCart className="w-4 h-4" strokeWidth={2.2} />
                      Buy {formatPrice(album.priceCents)}
                    </button>
                  ) : null}
                  {onGetDetails && (
                    <button
                      type="button"
                      onClick={onGetDetails}
                      data-testid="button-get-details"
                      className="h-11 px-2 inline-flex items-center font-medium text-sm text-fan-secondary hover:text-fan-primary transition-colors"
                    >
                      Get Details
                    </button>
                  )}
                </>
              ) : (
                /* Apple-tone preview/buy transport row, mirroring the owned
                   row (and the mobile album surface): Shuffle (glass) ·
                   white Play/Preview pill · Buy / Sold Out / Listen on … ·
                   Info (glass). */
                <>
                  {/* Shuffle intentionally omitted on the preview/buy row —
                      the not-owned surface leads with Preview + Buy only. */}
                  <PreviewPlayPill
                    canPlay={canPlay}
                    active={previewActive}
                    isPlaying={!!isPlaying}
                    onClick={canPlay ? onPlayPreview : undefined}
                  />
                  {/* Buy pill. We no longer swap this for a "Sold Out" pill or
                      a "Listen on…" streaming handoff after a sunset date — the
                      album stays a clean Play + Buy surface. Gated on
                      `onBuyBundle` (undefined on native, where buying is
                      disabled) so the iOS app never surfaces a purchase CTA —
                      App Review 3.1.1, matching the mobile shell. */}
                  {onBuyBundle &&
                    album.priceCents != null &&
                    // Task #1628 — staged release: sales haven't begun, so the
                    // Buy pill is replaced by a disabled "Sales Begin {date}"
                    // pill. Previews stay playable (Play/Preview untouched).
                    (salesBeginLabel ? (
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        className="inline-flex items-center gap-2 h-11 px-5 rounded-full font-semibold text-sm text-fan-secondary cursor-default"
                        style={{ background: "rgba(255,255,255,0.10)" }}
                        data-testid="button-sales-begin"
                      >
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="4" width="18" height="18" rx="2" />
                          <path d="M16 2v4M8 2v4M3 10h18" />
                        </svg>
                        Sales Begin {salesBeginLabel}
                      </button>
                    ) : (
                      <BuyPricePill
                        priceLabel={formatPrice(album.priceCents)}
                        signedCertPriceCents={signedCertPriceCents}
                        signedCertSoldOut={signedCertSoldOut}
                        onBuy={(opts) => onBuyBundle?.(opts)}
                      />
                    ))}
                  {/* Task #1580 — album-level credits "i" button hidden; credits
                      are per-track only. `hasAlbumCredits`/`onOpenAlbumCredits`
                      wiring stays in place so it can be re-enabled later. */}
                </>
              )}
            </div>
          </div>
        </section>

        {/* Tracklist + stacked bonus sections (Task #1183). No pill toggle —
            Music, then Videos, then Photos read as one vertical scroll, the
            same way the mobile surface and Apple Music proper do. */}
        <div className="mt-5">
          {/* Hairlines live as in-flow block elements in the flex column — one
              above the first row (top rule) and one below every row (between-
              row + final bottom rule). Absolute-positioned spans inside the
              rows were consistently invisible due to painting-order ambiguity
              at the flush seam between adjacent flex items; in-flow spans have
              no such issue. See docs/design-system.md → "Track-row hairline". */}
          <div className="flex flex-col" data-testid="track-list">
              {/* Top hairline — sits above row 1 and matches the per-row
                  weight so the list reads as one uniform set of rules. */}
              <span aria-hidden className="mx-3 h-px shrink-0 bg-white/20" />
              {songs.map((s) => {
                // A hidden track (isPreviewable === false) reads as a quiet
                // "locked" row for EVERYONE — even owners — matching Apple's
                // pre-release pattern: greyed title, no runtime, not tappable.
                const state =
                  s.isPreviewable === false
                    ? "locked"
                    : trackPlaybackState({
                        isOwned,
                        isPreviewable: s.isPreviewable,
                      });
                // A locked (unreleased) row is never the "now playing" row —
                // it can't be played, so it must not show the rose title or
                // equalizer even if a stale session still points at it.
                const isCurrent =
                  state !== "locked" && currentSongId === s.id;
                return (
                  <Fragment key={s.id}>
                    <AlbumDesktopTrackRow
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
                      onAdd={
                        state === "locked" || !onAddTrack
                          ? undefined
                          : () => onAddTrack(s)
                      }
                      onPlayNext={
                        state === "locked" || !onPlayNextTrack
                          ? undefined
                          : () => onPlayNextTrack(s)
                      }
                      onPlayLast={
                        state === "locked" || !onPlayLastTrack
                          ? undefined
                          : () => onPlayLastTrack(s)
                      }
                      onToggleFavorite={
                        state === "locked" || !onToggleFavoriteTrack
                          ? undefined
                          : () => onToggleFavoriteTrack(s)
                      }
                      onViewCredits={
                        state === "locked" || !onViewCreditsTrack
                          ? undefined
                          : () => onViewCreditsTrack(s)
                      }
                      hasCredits={songHasCredits?.(s) ?? false}
                      showMenu={isOwned}
                    />
                    {/* Per-row bottom hairline — renders as a genuine flex
                        item so it always paints cleanly between rows. */}
                    <span aria-hidden className="mx-3 h-px shrink-0 bg-white/20" />
                  </Fragment>
                );
              })}
              {/* Task #1182 — Apple-style album footer: exactly three lines —
                  full original release date (falls back to the bare year), song
                  count + total runtime, then the ℗ copyright line. The
                  standalone label credit line was intentionally removed. */}
              <div
                className="mt-12 px-3 text-sm leading-relaxed"
                style={{ color: "rgba(255,255,255,0.34)" }}
              >
                <p data-testid="text-album-date-footer">
                  {formatReleaseDateLong(album.originalReleaseDate) ?? album.year}
                </p>
                <p data-testid="text-album-runtime-footer">
                  {songs.length} {songs.length === 1 ? "song" : "songs"}
                  {", "}
                  {formatRuntime(songs)}
                </p>
                {album.copyrightLine && (
                  <p data-testid="text-album-copyright-footer">
                    {album.copyrightSymbol || "℗"} {album.copyrightLine}
                  </p>
                )}
              </div>
            </div>

          {/* Bonus sections (videos/photos) sit on a subtly lighter panel —
              Apple-Music treatment where the below-the-music sections read as
              a distinct background tint from the tracklist. Each section only
              renders when it has items (Task #1118 hide-empty rule), so fans
              never see an empty heading. */}
          {hasVideos && (
            <section
              className="mt-10 rounded-2xl p-5"
              style={{ background: "rgba(255,255,255,0.04)" }}
              data-testid="section-videos"
            >
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="text-fan-primary text-xl font-bold tracking-tight"
                  data-testid="heading-videos"
                >
                  Videos
                </h2>
                {showVideoSeeAll && (
                  <button
                    type="button"
                    onClick={() => setShowAllVideos((v) => !v)}
                    className="flex items-center gap-0.5 text-sm font-semibold text-fan-secondary hover:text-fan-primary transition-colors"
                    data-testid="button-see-all-videos"
                    aria-expanded={showAllVideos}
                  >
                    {showAllVideos ? "Show Less" : "See All"}
                    <ChevronRight
                      className={[
                        "w-4 h-4 transition-transform",
                        showAllVideos ? "rotate-90" : "",
                      ].join(" ")}
                      strokeWidth={2.4}
                    />
                  </button>
                )}
              </div>
              <BonusGrid
                items={videos.map((v) => ({
                  id: v.id,
                  thumb: v.posterUrl ?? album.artwork,
                  label: v.title ?? "Untitled",
                  sublabel: album.artist,
                }))}
                locked={!isOwned}
                kind="video"
                onPlayItem={onPlayVideo}
                layout={showAllVideos ? "grid" : "row"}
                limit={showAllVideos ? undefined : VIDEO_ROW_CAP}
              />
            </section>
          )}

          {hasPhotos && (
            <section
              className="mt-10 rounded-2xl p-5"
              style={{ background: "rgba(255,255,255,0.04)" }}
              data-testid="section-photos"
            >
              <h2
                className="text-fan-primary text-xl font-bold tracking-tight mb-4"
                data-testid="heading-photos"
              >
                Photos
              </h2>
              <BonusGrid
                items={photos.map((p) => ({
                  id: p.id,
                  thumb: p.photoUrl,
                  label: p.caption ?? "",
                }))}
                locked={!isOwned}
                kind="photo"
              />
            </section>
          )}
        </div>

        <div className="h-16" aria-hidden />
      </div>

      {/* Right-side lyrics rail (Apple-Music style). The width is the
          animated property: the aside grows from 0 → 360px so the primary
          column reflows smoothly to make room and stays fully visible — no
          full-screen takeover. Bill: the rail must look the SAME on the album
          page as on every other screen, so it shares the storefront
          DesktopLyricsRail's flush edge treatment — a solid navy panel butted
          FLUSH against the right + bottom window edges with only the interior
          (top-left) corner rounded, not a floating fully-rounded translucent
          card. Caller owns the toggle (PlayerContext.showLyrics +
          setShowLyrics). lg-only: the 360px panel needs the room a wide
          desktop provides. The `lyrics` node (the shared karaoke SyncedLyrics
          on the fan route) owns its own scroll + bottom padding, so it keeps
          the karaoke text clear of the dock / iPad home indicator even though
          the panel now runs to the bottom edge. */}
      <AnimatePresence initial={false}>
        {showLyrics && !compact && (
          <motion.aside
            key="lyrics-panel"
            // `sticky top-0` + full viewport height so the rail runs flush to
            // the bottom window edge (matching the storefront rail). At lg the
            // floating PlayerDock reserves this panel's width as its right
            // channel, so the dock sits to the rail's LEFT and never overlaps
            // it; SyncedLyrics' own bottom padding handles narrower cases.
            className="hidden lg:flex justify-end flex-shrink-0 overflow-hidden sticky top-0 self-start"
            style={{ height: "100dvh" }}
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
              className="flex-shrink-0 h-full flex flex-col"
              style={{ width: LYRICS_PANEL_WIDTH }}
            >
              <div
                className="flex-1 min-h-0 overflow-hidden flex flex-col"
                style={{
                  background: "rgba(10, 14, 42, 0.97)",
                  borderTopLeftRadius: 16,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  borderLeft: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "-12px 0 40px rgba(0,0,0,0.28)",
                }}
              >
                {/* No title/close header — the dock mic toggles the panel
                    open and closed, so the card is just the lyrics. The
                    shared SyncedLyrics owns its own top padding/fade, so the
                    karaoke body reads cleanly from the top of the card. When
                    the host wires `onExpandLyrics`, the karaoke body also
                    carries the hover/tap expand affordance (mirrors the
                    persistent rail) without changing the in-flow reflow. */}
                {onExpandLyrics ? (
                  <InFlowLyricsExpand onExpand={onExpandLyrics}>
                    {lyrics}
                  </InFlowLyricsExpand>
                ) : (
                  <div className="flex-1 min-h-0 flex flex-col">{lyrics}</div>
                )}
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
 *  the slide reads as an edge reveal rather than a squash. Exported so the
 *  host (AlbumDetailDesktop) can feed the same width to the PlayerDock as
 *  its right channel inset, keeping the dock in the gutter beside the rail. */
export const LYRICS_PANEL_WIDTH = 360;

/* Buy CTA fill — the brand-blue gradient, matching the not-owned Buy
   button on the mobile album surface (AlbumDetailMobileSurface) so the
   purchase action reads with the same blue role across both surfaces. */
const BUY_BLUE_GRADIENT =
  "linear-gradient(135deg, #1D5E8F, var(--brand-blue))";

/**
 * White Play pill for the not-owned (Preview & Purchase) state — Apple-tone,
 * matching the owned row's white Play pill in height/width/radius/press.
 * • At rest with previews available → white pill, navy triangle, "Play".
 * • While a preview session is auditioning this album → swaps to a Pause
 *   glyph + "Pause" label (preserves the same button as the toggle).
 * • When no previews exist (`canPlay=false`) → dimmed-white, disabled,
 *   with a tooltip.
 */
/* Task #1561 — desktop/tablet clamped album description. Mirrors the mobile
   ClampedDescription: clamps to 3 lines and only renders the inline Apple-style
   MORE affordance when the copy actually overflows (measured via scrollHeight vs
   clientHeight, re-checked on resize). When the text fits, it renders the plain
   clamped paragraph so the layout is unchanged. */
function DesktopClampedDescription({
  text,
  onExpand,
}: {
  text: string;
  onExpand: () => void;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!ref.current) return;
        setOverflowing(
          ref.current.scrollHeight - ref.current.clientHeight > 1,
        );
      });
    };
    check();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(check);
      ro.observe(el);
      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
      };
    }
    window.addEventListener("resize", check);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", check);
    };
  }, [text]);

  if (!overflowing) {
    return (
      <p
        ref={ref}
        className="mt-3 text-fan-secondary text-[14px] leading-[1.55] max-w-[640px] line-clamp-3"
        data-testid="album-description"
      >
        {text}
      </p>
    );
  }

  return (
    <div className="relative mt-3 max-w-[640px]" data-testid="album-description">
      <button
        type="button"
        onClick={onExpand}
        aria-label="Read more about this album"
        className="block w-full text-left transition-opacity hover:opacity-90 active:opacity-80"
      >
        <p
          ref={ref}
          className="text-fan-secondary text-sm leading-[1.55] line-clamp-3"
        >
          {text}
        </p>
        <span
          aria-hidden="true"
          className="absolute bottom-0 right-0 text-sm font-semibold pl-14 leading-[1.55]"
          style={{
            color: BRAND_BLUE,
            background:
              "linear-gradient(to right, rgba(var(--brand-bg-rgb), 0) 0%, rgb(var(--brand-bg-rgb)) 40%, rgb(var(--brand-bg-rgb)) 100%)",
          }}
          data-testid="button-album-description-more"
        >
          MORE
        </span>
      </button>
    </div>
  );
}

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
            : "Play preview"
      }
      data-testid="button-play-preview"
      aria-label={showPause ? "Pause preview" : "Play preview"}
      className="h-12 pl-5 pr-6 rounded-full inline-flex items-center gap-2 font-semibold text-[15px] transition-transform active:scale-[0.97] disabled:cursor-not-allowed"
      style={{
        background: disabled ? "rgba(255,255,255,0.35)" : "#fff",
        color: "var(--brand-bg)",
      }}
    >
      {showPause ? (
        <Pause className="w-5 h-5 fill-current" strokeWidth={0} />
      ) : (
        <Play className="w-5 h-5 fill-current" strokeWidth={0} />
      )}
      <span>{showPause ? "Pause" : "Play"}</span>
    </button>
  );
}

/**
 * Rose-filled Buy pill wrapper.
 *
 * - At rest: "Buy Now".
 * - On `pointer:fine` hover (desktop / trackpad): label flips to just
 *   the formatted price (e.g. "$25.00") and a small add-on chip pops
 *   below offering the printed + signed GoodDeed at its add-on price.
 *   Toggling the chip pre-checks the matching toggle in BuySheet on
 *   click.
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
        className="h-12 px-6 rounded-full inline-flex items-center justify-center text-white font-semibold text-[15px] transition-[background-color,box-shadow,transform] cursor-pointer active:scale-[0.97]"
        style={{
          background: BUY_BLUE_GRADIENT,
          boxShadow: hover
            ? "0 8px 22px rgba(49,158,216,0.45)"
            : "0 4px 12px rgba(49,158,216,0.25)",
        }}
      >
        {/* Both labels occupy the same grid cell so the pill always sizes
            to the wider label — swapping "Buy Now" ⇄ the price on hover
            never changes the button's width. With the hover label now just
            the price, "Buy Now" is typically the wider of the two, so the
            grid still pins to whichever label is longer. */}
        <span className="grid justify-items-center" data-testid="text-buy-label">
          <span
            className="col-start-1 row-start-1 whitespace-nowrap"
            style={{ visibility: hover ? "hidden" : "visible" }}
          >
            Buy Now
          </span>
          <span
            className="col-start-1 row-start-1 whitespace-nowrap"
            style={{ visibility: hover ? "visible" : "hidden" }}
            aria-hidden={!hover}
          >
            {priceLabel}
          </span>
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

export function BonusGrid({
  items,
  locked,
  kind,
  onPlayItem,
  layout = "grid",
  limit,
}: {
  items: { id: string; thumb: string; label: string; sublabel?: string }[];
  locked: boolean;
  kind: "video" | "photo";
  // Video cards only: invoked when the fan clicks (or presses Enter/Space on)
  // an unlocked tile, so the host can open the playback modal. Omitted for
  // photos and ignored while locked.
  onPlayItem?: (id: string) => void;
  // "grid" — stacked 3-up grid (the See-All / photo layout). "row" — a single
  // horizontally scrolled Apple-Music rail of fixed-width tiles.
  layout?: "grid" | "row";
  // Cap the number of tiles rendered (the rail shows up to N before See-All).
  limit?: number;
}) {
  // Task #1118 — fans never see the dashed-border "No {kind}s yet"
  // placeholder. Empty bonus sections are hidden upstream so this branch
  // should be unreachable on the fan surface; render nothing rather than
  // a dotted-line empty state if it ever is reached.
  if (items.length === 0) {
    return null;
  }
  const isVideo = kind === "video";
  const isRow = isVideo && layout === "row";
  const shown = typeof limit === "number" ? items.slice(0, limit) : items;
  return (
    <div
      // Videos: smaller Apple-Music-style cards with captions beneath. In
      // "row" layout they sit on a horizontally scrolled rail; otherwise a
      // 3-up grid. Photos: unchanged 3-column square-tile grid.
      className={
        isRow
          ? "flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1 snap-x"
          : isVideo
            ? "grid grid-cols-3 gap-3"
            : "grid grid-cols-3 gap-4"
      }
      data-testid={`grid-${kind}s`}
      data-locked={locked ? "true" : "false"}
    >
      {shown.map((it) =>
        isVideo ? (
          // Video card: thumbnail + caption below (Apple Music Music Videos style).
          // Unlocked tiles are an accessible button-like control: click or
          // Enter/Space opens the playback modal (matches the mobile tap-to-
          // play). Locked tiles stay inert (no handler, no role).
          <div
            key={it.id}
            className={[
              "group flex flex-col gap-1.5",
              isRow ? "flex-shrink-0 w-[260px] snap-start" : "",
            ].join(" ")}
            style={{ cursor: locked ? "default" : "pointer" }}
            tabIndex={!locked ? 0 : undefined}
            role={!locked && onPlayItem ? "button" : undefined}
            aria-label={!locked && onPlayItem ? `Play ${it.label || "video"}` : undefined}
            onClick={!locked && onPlayItem ? () => onPlayItem(it.id) : undefined}
            onKeyDown={
              !locked && onPlayItem
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPlayItem(it.id);
                    }
                  }
                : undefined
            }
            data-testid={`thumb-${kind}-${it.id}`}
          >
            <div className="relative aspect-video rounded-xl overflow-hidden bg-white/5">
              <img
                src={it.thumb}
                alt=""
                className="w-full h-full object-cover"
                style={
                  locked
                    ? {
                        filter: "brightness(0.55) saturate(0.85) blur(16px)",
                        transform: "scale(1.2)",
                      }
                    : undefined
                }
                draggable={false}
              />
              {locked && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  data-testid={`badge-locked-${kind}-${it.id}`}
                >
                  <div className="w-9 h-9 rounded-full bg-black/55 flex items-center justify-center">
                    <Lock className="w-4 h-4 text-fan-primary" strokeWidth={2.2} />
                  </div>
                </div>
              )}
              {!locked && (
                // Play badge revealed on hover/focus, pinned to the
                // bottom-right corner (Apple Music Music-Videos affordance —
                // single play control, no overflow menu). Badge stays mounted
                // so it reads to assistive tech while only opacity animates.
                <div className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 group-focus:opacity-100">
                  <BonusPlayBadge
                    placement="bottom-right"
                    testId={`badge-play-${kind}-${it.id}`}
                  />
                </div>
              )}
            </div>
            {it.label && (
              <div className="px-0.5">
                <p className="text-fan-primary text-xs font-medium leading-snug truncate">
                  {it.label}
                </p>
                {it.sublabel && (
                  <p className="text-fan-secondary text-xs leading-snug truncate mt-0.5">
                    {it.sublabel}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          // Photo card: unchanged square tile (layout, label overlay, and states
          // match exactly what the single-branch version had before the split).
          <div
            key={it.id}
            className="group relative aspect-square rounded-2xl overflow-hidden bg-white/5"
            style={{ cursor: locked ? "default" : "pointer" }}
            data-testid={`thumb-${kind}-${it.id}`}
          >
            <img
              src={it.thumb}
              alt=""
              className="w-full h-full object-cover"
              style={
                locked
                  ? {
                      filter: "brightness(0.55) saturate(0.85) blur(16px)",
                      transform: "scale(1.2)",
                    }
                  : undefined
              }
              draggable={false}
            />
            {locked && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                data-testid={`badge-locked-${kind}-${it.id}`}
              >
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
        )
      )}
    </div>
  );
}
