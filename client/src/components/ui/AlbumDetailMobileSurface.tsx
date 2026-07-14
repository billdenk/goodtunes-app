import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { formatUsdCents } from "@shared/money";
import { ChevronLeft, Share, MoreHorizontal, Info, Lock } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SiSpotify, SiApplemusic } from "react-icons/si";
import { IconButton } from "@/components/ui/IconButton";
import { AlbumCover } from "@/components/ui/AlbumCover";
import { ChromeScrim } from "@/components/ui/ChromeScrim";
import { FAN_TOP_CHROME_INSET } from "@/components/ui/SheetChrome";
import { useTopChromeFrost } from "@/hooks/useTopChromeFrost";
import { ExplicitBadge } from "@/components/ui/ExplicitBadge";
import { popBounce } from "@/lib/motion";
import { formatReleaseDateLong } from "@shared/albumStage";
import { streamingHandoffEnabled } from "@/lib/platform";

// Height (px) of the top ChromeScrim band. The scrim is rendered at this
// height and the album-options menu is clamped to open strictly below it so
// the two never stack their backdrop-filters (iOS-WebKit one-blur-per-region).
const TOP_SCRIM_PX = 112;

// Task #918 — Bill asked to hide the mint "SuperCredits™" pill over album
// artwork everywhere fans (and admin previews) can see it. The detection
// plumbing (`hasSuperCredits` + its stream-gating consumers) stays wired, so
// flip this back to `true` to restore the chip later.
const SHOW_SUPERCREDITS_CHIP = false;

export interface AlbumDetailMobileSurfaceAlbum {
  id: string;
  title: string;
  artist: string;
  artwork: string | null;
  // Primary artist's profile photo — the ghosted fallback the branded
  // placeholder cover uses when `artwork` is missing or dead (Task #1884).
  artistPhoto?: string | null;
  year: number | null;
  type: "Single" | "Duo" | "EP" | "LP";
  description?: string | null;
  isExplicit?: boolean;
  genre?: string | null;
  priceCents?: number | null;
  // Task #1078 — Apple-style album footer. Exact original release date
  // (ISO YYYY-MM-DD) + free-text ℗ copyright credit. Both optional; the
  // footer falls back to the year-only line when they're absent.
  originalReleaseDate?: string | null;
  copyrightLine?: string | null;
  // Task #1158 — per-album footer copyright symbol (℗ vs ©). Null renders
  // as the ℗ default so existing albums are unchanged.
  copyrightSymbol?: string | null;
  // Album-level streaming handoff links (Task #734).
  spotifyUrl?: string | null;
  appleMusicUrl?: string | null;
}

export interface AlbumDetailMobileSurfaceSong {
  id: string;
  title: string;
  trackNumber: number;
  duration: number;
  isExplicit?: boolean | null;
  // Task #734 — stream-elsewhere track + per-track handoff links.
  streamOnly?: boolean;
  spotifyTrackUrl?: string | null;
  appleMusicTrackUrl?: string | null;
  // Fan-facing preview state (server-derived from `previewHidden`). When
  // `false` on a not-owned album the row renders as a quiet "locked" row
  // (greyed title + lock, no ⋯ menu, not tappable) mirroring desktop.
  isPreviewable?: boolean | null;
}

export interface AlbumDetailMobileSurfaceLabel {
  id: string;
  name: string;
  logoUrl?: string | null;
  websiteUrl?: string | null;
}

export interface AlbumDetailMobileSurfaceProps {
  album: AlbumDetailMobileSurfaceAlbum;
  songs: AlbumDetailMobileSurfaceSong[];
  label?: AlbumDetailMobileSurfaceLabel | null;
  ownedNums?: number[];
  /** Fan owns the album (full playback). Owned albums never lock rows —
   *  matches the desktop `isOwned ? "full"` branch. */
  isOwned?: boolean;
  /** Task #2530 — owner-only "Not yet released" marker. Mirrors the Library
   *  card badge: shows only to a fan who owns a copy of a release that is
   *  still prepping (staged) or hidden, and disappears once it's public. The
   *  host derives this from the owner-scoped `/api/my-albums` flags; the
   *  public detail response never carries them, so non-owners never see it. */
  notYetReleased?: boolean;
  currentSongId?: string | null;
  isPlaying?: boolean;
  downloadedSongIds?: Set<string>;
  favoriteSongIds?: Set<string>;
  nativeDownloadsEnabled?: boolean;
  songMenuOpenForId?: string | null;
  /** When true, the album-level Credits IconButton renders in the
   *  Play/Shuffle row and `onOpenAlbumCredits` is invoked on tap. */
  hasAlbumCredits?: boolean;
  onOpenAlbumCredits?: () => void;
  /** Task #734 — album carries SuperCredits. Gates the SuperCredits badge
   *  over the artwork and the per-track stream handoff affordance. */
  hasSuperCredits?: boolean;
  /** Every track on the album is stream-only (GoodTunes hosts no master),
   *  so the primary Play control becomes a "Stream this" handoff and the
   *  Shuffle/Download controls are suppressed. */
  isStreamOnlyAlbum?: boolean;
  /** Hands the fan off to their chosen streaming service for one track. */
  onStreamSong?: (song: AlbumDetailMobileSurfaceSong) => void;
  /** Hands the fan off to their chosen streaming service for the whole
   *  album (used by the album-level control on no-credit stream-only
   *  albums and the "Stream this" primary control). */
  onStreamAlbum?: () => void;
  bonusSlot?: ReactNode;
  lineupSlot?: ReactNode;
  /** Optional ref attached to the scroll container — used by the fan
   *  route for `useScrollHideNav`. Admin previews don't need it. */
  scrollRef?: RefObject<HTMLDivElement>;
  /** Content rendered inside the scroll container after the metadata
   *  footer — e.g. the fan route's editorial panel (Videos / Photos /
   *  More by). Admin previews don't pass anything. */
  children?: ReactNode;
  onBack?: () => void;
  onShare?: () => void;
  onOpenAlbumMenu?: () => void;
  onPlayAll?: () => void;
  onShuffle?: () => void;
  onPlaySong?: (song: AlbumDetailMobileSurfaceSong) => void;
  onOpenBuy?: () => void;
  /** Task #2714 — Shopify+ external Sale URL is set: the Buy CTA hands the
   *  fan to the artist's own store (new tab, via onOpenBuy), so the pill
   *  reads a plain "Buy Now" (no price — the store owns pricing) and a small
   *  trust cue renders beneath the transport row. */
  externalSale?: boolean;
  /** Task #1628 — staged release whose sales-begin (sunrise) date hasn't
   *  arrived. When set (and the fan doesn't own the album), the Buy CTA is
   *  replaced by a disabled "Sales Begin {label}" pill (e.g. "Sales Begin
   *  6/8"); previews stay playable. Null/undefined = live buy behavior. */
  salesBeginLabel?: string | null;
  /** Sunset release (past streamingReleaseDate). When true AND the fan
   *  doesn't own the album, the Buy CTA is replaced by a disabled "Sold
   *  Out" pill with no path into checkout. Previews stay playable. */
  soldOut?: boolean;
  /** Task #1734 — purchase-funnel "locked unlock" presentation. When true,
   *  the surface hides the ⋯ album menu (share-only chrome) and the action
   *  row leads with a secondary Play + primary Buy/Get Notified + a "Get
   *  Details" text link that re-opens the offer modal. Only set on the
   *  get./store. host; the MY player never passes it. */
  lockedPreview?: boolean;
  /** Task #1755 — campaign fan link: the release is live but general fans are
   *  notify-only, so the locked-preview action row leads with "Get Notified"
   *  (no checkout) even though there's no sunrise `salesBeginLabel`. */
  notifyOnly?: boolean;
  /** Task #1784 — pre-launch preview surface. "notify" = /hope (Get Early
   *  Access), "buy" = /staging (Buy $X to the Stripe card screen). Drives the
   *  mint primary CTA + the "Get Details" link. Undefined on normal views. */
  publicPreview?: "notify" | "buy";
  /** Re-open the offer modal (Get Details link, and the pre-launch primary
   *  CTA when sales haven't begun). */
  onGetDetails?: () => void;
  /** Pre-launch primary CTA — capture the fan's email so operators can
   *  message them when the release goes live. */
  onGetNotified?: () => void;
  onToggleAlbumDownload?: () => void;
  onToggleSongDownload?: (songId: string) => void;
  onOpenSongMenu?: (song: AlbumDetailMobileSurfaceSong, rect: DOMRect) => void;
  onArtistClick?: () => void;
  onExpandDescription?: () => void;
  /** Album-options popup item handlers. Rendered inside the surface so
   *  the popup is anchored against the ⋯ pill. If `onOpenAlbumMenu` is
   *  undefined the ⋯ button is decorative (preview mode). */
  onViewCertificate?: () => void;
  onViewProvenance?: () => void;
  onAddAlbumToPlaylist?: () => void;
  /** Download the unsigned fan GoodDeed certificate PDF. Wired only when
   *  the fan owns a downloadable GoodDeed for this album; renders a
   *  "Download GoodDeed PDF" menu item between View GoodDeed and View
   *  Provenance (mirrors the AlbumCard menu). */
  onDownloadCert?: () => void;
}

/**
 * Apple-Music-style album page presentational surface. Single visual
 * source of truth for the fan-facing `AlbumDetail` mobile route and the
 * admin album editor's phone + tablet previews.
 *
 * Stateless w.r.t. data — all props in, callbacks out. Owns only two
 * pieces of internal UI state: the share/⋯ pill popup (`showMenu`) and
 * the description-clamp overflow detector. Renders nothing if `album`
 * is missing — callers gate.
 */
export function AlbumDetailMobileSurface({
  album,
  songs,
  label,
  ownedNums = [],
  isOwned = false,
  notYetReleased = false,
  currentSongId,
  isPlaying = false,
  downloadedSongIds,
  favoriteSongIds,
  nativeDownloadsEnabled = false,
  hasAlbumCredits = false,
  onOpenAlbumCredits,
  hasSuperCredits = false,
  isStreamOnlyAlbum = false,
  onStreamSong,
  onStreamAlbum,
  bonusSlot,
  lineupSlot,
  scrollRef,
  children,
  onBack,
  onShare,
  onOpenAlbumMenu,
  onPlayAll,
  onShuffle,
  onPlaySong,
  onOpenBuy,
  externalSale = false,
  salesBeginLabel,
  soldOut = false,
  lockedPreview = false,
  notifyOnly = false,
  publicPreview,
  onGetDetails,
  onGetNotified,
  onToggleAlbumDownload,
  onToggleSongDownload,
  onOpenSongMenu,
  onArtistClick,
  onExpandDescription,
  onViewCertificate,
  onViewProvenance,
  onAddAlbumToPlaylist,
  onDownloadCert,
}: AlbumDetailMobileSurfaceProps) {
  const [showMenu, setShowMenu] = useState(false);
  // Task #913 — when the bottom-nav search owns the top frosted layer, the
  // album chrome yields: it drops both its own top backdrop-filter surfaces
  // (the ChromeScrim band + the share/⋯ capsule) so the top band never stacks
  // two blurs (iOS-WebKit one-blur-per-region rule). Admin previews render
  // without the provider, so this defaults to false (unchanged behaviour).
  const { searchOwnsTop } = useTopChromeFrost();
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    if (!showMenu) return;
    const measure = () => {
      const rect = menuBtnRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPos({
        // Clamp the menu so its frosted body starts strictly BELOW the top
        // ChromeScrim band (TOP_SCRIM_PX). Otherwise the menu's own
        // backdrop-blur(28px) overlaps the active scrim blur, re-stacking two
        // backdrop-filter surfaces in the top region (iOS-WebKit
        // one-blur-per-region rule). The +12 headroom also keeps the pop-in
        // animation (initial y:-6 / exit y:-4) from crossing the band on any
        // frame, not just at rest.
        top: Math.max(rect.bottom + 8, TOP_SCRIM_PX + 12),
        right: window.innerWidth - rect.right,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [showMenu]);

  // The top ChromeScrim's frosted layer is the region's single blur owner while
  // the menu is open. On open it appears immediately; on close it fades out via
  // AnimatePresence (~200ms). The share/menu capsule must keep its own blur
  // suppressed for that whole window — including the close fade — or the two
  // backdrop-filters briefly coexist in the top region (iOS-WebKit
  // one-blur-per-region rule). `scrimBlurPresent` tracks that lifecycle: true
  // the instant the menu opens, false only once the scrim's exit fade finishes.
  const [scrimBlurPresent, setScrimBlurPresent] = useState(false);
  useEffect(() => {
    if (showMenu) {
      setScrimBlurPresent(true);
      return;
    }
    const t = setTimeout(
      () => setScrimBlurPresent(false),
      reduceMotion ? 80 : 240,
    );
    return () => clearTimeout(t);
  }, [showMenu, reduceMotion]);

  const isMulti = ownedNums.length > 1;
  const totalDuration = songs.reduce((acc, s) => acc + s.duration, 0);
  const totalMin = Math.floor(totalDuration / 60);
  const totalSec = totalDuration % 60;
  const runtime = `${totalMin} min${totalSec > 0 ? ` ${totalSec} sec` : ""}`;
  const allDownloaded =
    songs.length > 0 &&
    !!downloadedSongIds &&
    songs.every((s) => downloadedSongIds.has(s.id));

  // Share / menu capsule background. It carries its own frosted blur ONLY while
  // the top ChromeScrim is NOT the region's blur owner. We gate on
  // `scrimBlurPresent` (not raw `showMenu`) so the capsule blur stays off for
  // the scrim's full open→close lifecycle, including its exit fade — otherwise
  // the two backdrop-filters briefly stack over the hero (iOS-WebKit rule).
  const capsuleStyle: React.CSSProperties = {
    top: FAN_TOP_CHROME_INSET,
    background: "rgba(255,255,255,0.17)",
    ...(scrimBlurPresent || searchOwnsTop
      ? {}
      : { backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }),
  };

  return (
    <div className="relative w-full h-full flex flex-col text-fan-primary">
      {/* Top chrome scrim — a soft navy gradient fade at rest so the hero art
          reads cleanly under the floating back/share/menu chips (no hard
          band), swapping in a single frosted blur band only while the album
          options menu is open. Sits behind the chips (z-40 < z-50). */}
      <ChromeScrim
        edge="top"
        active={showMenu && !searchOwnsTop}
        className="absolute inset-x-0 top-0 z-40"
        style={{ height: TOP_SCRIM_PX }}
      />
      <IconButton
        variant="glass"
        label="Back to collection"
        onClick={onBack}
        className="absolute left-4 z-50"
        style={{ top: FAN_TOP_CHROME_INSET }}
        data-testid="button-back-album"
      >
        <ChevronLeft strokeWidth={2.5} className="-translate-x-[1px]" />
      </IconButton>

      <div
        className="absolute right-4 z-50 flex items-center rounded-full"
        style={capsuleStyle}
      >
        <button
          type="button"
          onClick={onShare}
          aria-label="Share album"
          className="w-11 h-11 flex items-center justify-center text-white active:scale-[0.94] transition-transform"
          data-testid="button-share-album"
        >
          <Share className="w-[19px] h-[19px]" strokeWidth={2} />
        </button>
        {/* The ⋯ album-options menu only carries owner/GoodDeed actions (View
            GoodDeed, Download PDF, Ownership/Provenance, Add to Playlist), so it
            is shown ONLY to owners — matching the desktop `showMenu={isOwned}`
            rule. Non-owners (locked purchase-funnel previews AND live public
            previews on get./store.) get a share-only capsule, so the page reads
            like a public "unlock" landing. */}
        {isOwned && (
          <>
            <div className="w-px h-4 bg-white/25" aria-hidden />
            <div className="relative">
              <button
                ref={menuBtnRef}
                type="button"
                onClick={() => {
                  if (!onOpenAlbumMenu) return;
                  onOpenAlbumMenu();
                  setShowMenu((s) => !s);
                }}
                aria-label="Album options"
                aria-haspopup="menu"
                aria-expanded={showMenu}
                className="w-11 h-11 flex items-center justify-center text-white active:scale-[0.94] transition-transform"
                data-testid="button-album-menu"
              >
                <MoreHorizontal className="w-[19px] h-[19px]" strokeWidth={2} />
              </button>
            </div>
          </>
        )}
        {createPortal(
        <AnimatePresence>
        {showMenu && onOpenAlbumMenu && menuPos && (
          <>
            <motion.div
              className="fixed inset-0 z-[60]"
              onClick={() => setShowMenu(false)}
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
                    onClick={() => {
                      setShowMenu(false);
                      onViewCertificate();
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-white transition-colors active:bg-white/10"
                    data-testid="menu-view-certificate"
                  >
                    <span>View GoodDeed®</span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#4AFFCA"
                      strokeWidth="2"
                    >
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
                    onClick={() => {
                      setShowMenu(false);
                      onDownloadCert();
                    }}
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
                    onClick={() => {
                      setShowMenu(false);
                      onViewProvenance();
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-white transition-colors active:bg-white/10"
                    data-testid="menu-view-provenance"
                  >
                    <span>{isMulti ? "Ownership" : "View Provenance"}</span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#319ED8"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
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
                  onClick={() => {
                    setShowMenu(false);
                    onAddAlbumToPlaylist();
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-white transition-colors active:bg-white/10"
                  data-testid="menu-add-album-to-playlist"
                >
                  <span>Add to Playlist</span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
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
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-hide"
        style={{ paddingBottom: 160 }}
        data-testid="scroll-album"
      >
        {/* Task #1276 — one continuous navy fill behind the hero, the
            Play/Shuffle/Buy row, and the track list, so the fixed purple
            body gradient never shows through the transparent margins
            between these blocks (the band that used to sit behind Play). */}
        <div style={{ background: "#00062B" }}>
        <div style={{ background: "#00062B" }}>
          <div
            className="px-6 flex justify-center"
            style={{
              // Safe-area-aware so the header→art gap is a consistent ~20px on
              // BOTH the native webview (real status-bar inset) and Safari
              // (inset 0). The floating back/share/⋯ chips sit at
              // FAN_TOP_CHROME_INSET (safe + 12px) and are 44px tall, so
              // (safe + 76px) leaves the art ~20px below the chip row on
              // every device instead of the old fixed pt-32 (too tight on
              // native, too loose on web).
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 76px)",
            }}
          >
            <div
              className="relative w-[72%] max-w-[300px] rounded-xl overflow-hidden"
              style={{
                aspectRatio: "1 / 1",
                boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
              }}
            >
              <AlbumCover
                artwork={album.artwork}
                artistPhoto={album.artistPhoto}
                title={album.title}
              />
              {/* Task #734 — SuperCredits™ badge. Only shown on albums that
                  actually carry credits, so it doubles as the "this album
                  has full liner notes" signal even when the master streams
                  elsewhere.
                  Task #918 — Bill asked to hide the chip everywhere fans can
                  see it for now. The `hasSuperCredits` prop + its other
                  consumers (e.g. stream gating) stay wired so this can be
                  flipped back on by setting SHOW_SUPERCREDITS_CHIP = true. */}
              {SHOW_SUPERCREDITS_CHIP && hasSuperCredits && (
                <div
                  className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 backdrop-blur-md"
                  style={{ background: "rgba(0,6,43,0.55)" }}
                  data-testid="badge-supercredits"
                >
                  <Info
                    strokeWidth={2.2}
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--brand-mint)" }}
                  />
                  <span className="text-[11px] font-semibold tracking-tight text-fan-primary">
                    SuperCredits™
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="relative pt-4 pb-3 px-5 text-center">
            <h1
              className="text-fan-primary text-[22px] font-bold leading-tight tracking-tight text-balance"
              data-testid="text-album-title"
            >
              {(() => {
                const sep = " - ";
                const idx = album.title.indexOf(sep);
                if (idx === -1) return album.title;
                const before = album.title.slice(0, idx);
                const after = album.title.slice(idx + sep.length);
                if (!before.trim() || !after.trim()) return album.title;
                return (
                  <>
                    {before} -<br />
                    {after}
                  </>
                );
              })()}
            </h1>
            <button
              type="button"
              onClick={onArtistClick}
              className="mt-1 text-[17px] font-medium active:opacity-70"
              style={{ color: "#319ED8" }}
              data-testid="link-album-artist"
            >
              {album.artist}
            </button>
            {(album.genre || album.type || album.year || album.isExplicit) && (
              <p
                className="text-[13px] mt-1 flex items-center justify-center gap-1.5"
                style={{ color: "#98A2B3" }}
                data-testid="text-album-meta"
              >
                {(() => {
                  const pieces: ReactNode[] = [];
                  if (album.genre)
                    pieces.push(<span key="genre">{album.genre}</span>);
                  if (album.type)
                    pieces.push(<span key="type">{album.type}</span>);
                  if (album.year)
                    pieces.push(<span key="year">{album.year}</span>);
                  if (album.isExplicit) {
                    pieces.push(<ExplicitBadge key="explicit" tone="muted" />);
                  }
                  return pieces.map((node, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5"
                    >
                      {i > 0 && <span aria-hidden>·</span>}
                      {node}
                    </span>
                  ));
                })()}
              </p>
            )}
            {notYetReleased && (
              // Task #2530 — owner-only "Not yet released" marker, mirroring the
              // Library card badge but centered under the album metadata to fit
              // the Apple-Music mobile header. Same wording + navy translucent
              // pill treatment as AlbumCard.
              <div className="mt-2 flex justify-center">
                <span
                  className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                  style={{
                    background: "rgba(0,6,43,0.62)",
                    color: "rgba(255,255,255,0.92)",
                    border: "1px solid rgba(255,255,255,0.28)",
                  }}
                  data-testid="badge-not-yet-released"
                >
                  Not yet released
                </span>
              </div>
            )}
            {/* Apple reserves the description's room and anchors the Play /
                Shuffle / Info row lower, so it doesn't slide up when an album
                has no description. When a description exists, keep the
                ClampedDescription behavior; when it's absent, hold the same
                two-line vertical space (matching the clamped height + its
                top margin) so the transport row keeps a stable position. */}
            {album.description ? (
              <ClampedDescription
                text={album.description}
                onExpand={() => onExpandDescription?.()}
              />
            ) : (
              <div
                aria-hidden
                className="h-1"
                data-testid="album-description-spacer"
              />
            )}
          </div>
        </div>

        {/* Play / Shuffle / Add bar */}
        <div className="bg-[color:var(--brand-bg)] flex items-center justify-center gap-3 px-5 mt-1 mb-3">
          {/* Shuffle is meaningless when GoodTunes hosts no master, so a
              stream-only album hides it. Task #1734 — the locked purchase-
              funnel preview also hides it (share-only "unlock" chrome). */}
          {!isStreamOnlyAlbum && !lockedPreview && (
            <button
              type="button"
              onClick={onShuffle}
              aria-label="Shuffle album"
              className="w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-[0.94] transition-transform flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.08)" }}
              data-testid="button-shuffle-album"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
            </button>
          )}
          {isStreamOnlyAlbum ? (
            /* Task #734 — the master lives on a streaming service, so the
               primary control hands the fan off instead of playing in-app.
               Task #1406 — the public streaming handoff is off for the Apple
               build (streamingHandoffEnabled). A stream-only album then has
               no in-app master to play, so it simply shows no primary CTA. */
            streamingHandoffEnabled ? (
            <button
              type="button"
              onClick={onStreamAlbum}
              className="flex items-center justify-center gap-2.5 h-12 px-9 rounded-full font-semibold text-[17px] text-white active:scale-[0.98] transition-transform"
              style={{ background: "linear-gradient(135deg, var(--brand-purple), var(--brand-blue))" }}
              data-testid="button-stream-album"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
              Stream this
            </button>
            ) : null
          ) : (
            <button
              type="button"
              onClick={onPlayAll}
              className="flex items-center justify-center gap-2.5 h-12 px-10 rounded-full font-semibold text-[17px] active:scale-[0.98] transition-transform"
              style={{ background: "#fff", color: "#00062B" }}
              data-testid="button-play-album"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              >
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
              Play
            </button>
          )}
          {/* Sunset releases: disabled "Sold Out" pill, no path into checkout. */}
          {ownedNums.length === 0 && album.priceCents != null && soldOut && (
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="flex items-center justify-center gap-2 h-12 px-5 rounded-full font-semibold text-sm text-fan-secondary flex-shrink-0 cursor-default"
              style={{ background: "rgba(255,255,255,0.10)" }}
              data-testid="button-sold-out"
            >
              Sold Out
            </button>
          )}
          {/* Buy CTA. Owners never see it (ownedNums guard). Sunset releases
              (soldOut=true) show the "Sold Out" pill above. (Stream-only
              releases lead with "Stream this" above.) */}
          {ownedNums.length === 0 &&
            album.priceCents != null &&
            !soldOut &&
            onOpenBuy &&
            // Task #1628 / #1755 — locked-preview "Get Notified" wins when
            // either sales haven't begun yet (sunrise) OR a campaign fan link
            // forces notify-only on a live release. Otherwise the disabled
            // "Sales Begin {date}" pill (admin previews) or the live Buy CTA.
            // Previews still play (the Play control above is untouched).
            // Task #1784 — /staging dry-run leads with Buy $X (mint) even while
            // the release is prepping, walking the BuySheet to the Stripe card
            // screen. /hope leads with mint "Get Early Access".
            (publicPreview === "buy" ? (
                <button
                  type="button"
                  onClick={onOpenBuy}
                  className="flex items-center justify-center gap-2 h-12 px-5 rounded-full font-semibold text-[15px] text-white active:scale-[0.98] transition-transform flex-shrink-0"
                  style={{ background: "var(--brand-mint)", color: "var(--brand-bg)" }}
                  data-testid="button-open-buy-sheet"
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
                    <circle cx="9" cy="21" r="1" />
                    <circle cx="20" cy="21" r="1" />
                    <path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6" />
                  </svg>
                  Buy {formatUsdCents(album.priceCents)}
                </button>
              ) : lockedPreview && (salesBeginLabel || notifyOnly) && onGetNotified ? (
                <button
                  type="button"
                  onClick={onGetNotified}
                  className="flex items-center justify-center gap-2 h-12 px-5 rounded-full font-semibold text-[15px] text-white active:scale-[0.98] transition-transform flex-shrink-0"
                  style={
                    publicPreview
                      ? { background: "var(--brand-mint)", color: "var(--brand-bg)" }
                      : { background: "linear-gradient(135deg, var(--brand-purple), var(--brand-blue))" }
                  }
                  data-testid="button-get-notified"
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
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 01-3.46 0" />
                  </svg>
                  Get Early Access
                </button>
              ) : salesBeginLabel ? (
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="flex items-center justify-center gap-2 h-12 px-5 rounded-full font-semibold text-sm text-fan-secondary flex-shrink-0 cursor-default"
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
              <button
                type="button"
                onClick={onOpenBuy}
                className="flex items-center justify-center gap-2 h-12 px-5 rounded-full font-semibold text-[15px] text-white active:scale-[0.98] transition-transform flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
                data-testid="button-open-buy-sheet"
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
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6" />
                </svg>
                {externalSale ? "Buy Now" : `Buy ${formatUsdCents(album.priceCents)}`}
              </button>
            ))}
          {/* Task #1784 — "Get Details" re-opens the offer modal. It used to sit
              inline to the right of the Buy button, which made the transport row
              wide and visually unbalanced on mobile; it now lives on its own
              centered line directly BELOW the Play + Buy buttons (rendered just
              after this row's closing tag). */}
          {/* Task #1580 — the album-level credits "i" button is hidden; credits
              are now per-track only (opened from each track's row). The
              `hasAlbumCredits`/`onOpenAlbumCredits` wiring stays in place so it
              can be flipped back on if album-level credits return. */}
          {nativeDownloadsEnabled && !isStreamOnlyAlbum && !lockedPreview && (
            <button
              type="button"
              onClick={onToggleAlbumDownload}
              aria-label={
                allDownloaded
                  ? "Remove album downloads"
                  : "Download album"
              }
              aria-pressed={allDownloaded}
              className="w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-[0.94] transition-transform flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.08)" }}
              data-testid="button-download-album"
            >
              {allDownloaded ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12.5l4 4L19 7.5"
                    stroke="#fff"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v12" />
                  <path d="M7 12.5L12 17.5l5-5" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Task #2714 — trust cue under the transport row when the Buy CTA
            reroutes to the artist's own store. Only renders alongside a live
            Buy CTA (not owned / sold out / sales-pending). */}
        {externalSale &&
          ownedNums.length === 0 &&
          album.priceCents != null &&
          !soldOut &&
          onOpenBuy &&
          !salesBeginLabel &&
          !(lockedPreview && (salesBeginLabel || notifyOnly)) && (
            <div className="bg-[color:var(--brand-bg)] flex justify-center px-5 pt-2">
              <p
                className="text-fan-faint text-xs text-center"
                data-testid="text-external-sale-cue"
              >
                You'll complete your purchase on the artist's store.
              </p>
            </div>
          )}

        {/* "Get Details" — centered on its own line beneath the Play + Buy
            buttons so the transport row stays a clean, balanced pair of pills.
            Negative top margin tucks it just under the buttons; only renders on
            the preview surfaces, so the owned/normal layout is untouched. */}
        {publicPreview && onGetDetails && !soldOut && (
          <div className="bg-[color:var(--brand-bg)] flex justify-center px-5 -mt-1">
            <button
              type="button"
              onClick={onGetDetails}
              className="inline-flex items-center justify-center min-h-[44px] px-4 text-sm font-medium text-fan-secondary active:opacity-70 transition-opacity underline underline-offset-2"
              data-testid="link-get-details"
            >
              Get Details
            </button>
          </div>
        )}

        {/* Tracks */}
        <div className="bg-[color:var(--brand-bg)] px-5 mt-5 flex flex-col">
          {songs.map((song, i) => {
            const isActive = currentSongId === song.id;
            const isDownloaded = !!downloadedSongIds?.has(song.id);
            const isFavorite = !!favoriteSongIds?.has(song.id);
            // Quiet "locked" row: an operator hid this track (preview hidden /
            // unreleased). Mirrors the desktop `locked` state — greyed title +
            // lock, nothing actionable on the right, not tappable. Locked for
            // NON-OWNERS only — matching Apple's pre-release pattern, and Play
            // / Shuffle skip it. Owners who bought the album get the full,
            // playable row (the embargo only hides the pre-purchase preview).
            const locked = !isOwned && song.isPreviewable === false;
            if (locked) {
              return (
                <Fragment key={song.id}>
                  <div
                    className="h-px flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.20)" }}
                    aria-hidden
                  />
                  <div
                    className="flex items-center gap-3 h-16"
                    data-testid={`row-track-${song.id}`}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0 h-full">
                      <div className="flex-shrink-0 flex items-center gap-1.5">
                        <div className="w-3" />
                        <div className="w-6 flex items-center justify-end">
                          <span
                            className="text-[15px] tabular-nums"
                            style={{ color: "rgba(255,255,255,0.22)" }}
                          >
                            {i + 1}
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 h-full flex items-center gap-2.5">
                        <p className="text-[15px] font-medium truncate text-white/45">
                          {song.title}
                        </p>
                        {song.isExplicit && <ExplicitBadge />}
                        <Lock
                          className="w-3 h-3 text-white/35 flex-shrink-0"
                          strokeWidth={2.2}
                          aria-hidden
                          data-testid={`icon-locked-${song.id}`}
                        />
                      </div>
                    </div>
                  </div>
                </Fragment>
              );
            }
            return (
              <Fragment key={song.id}>
              <div
                className="h-px flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.20)" }}
                aria-hidden
              />
              <div
                className="flex items-center gap-3 h-16 active:bg-white/[0.03] transition-colors"
                data-testid={`row-track-${song.id}`}
              >
                <button
                  type="button"
                  // Task #1406 — with the public streaming handoff off for the
                  // Apple build, a stream-only track has nothing to play, so the
                  // row is rendered non-interactive (disabled) rather than a
                  // dead tappable control.
                  disabled={song.streamOnly && !streamingHandoffEnabled}
                  onClick={() => {
                    if (song.streamOnly) {
                      // Per-track handoff on credited albums; otherwise the
                      // single album-level handoff (no per-track control).
                      if (hasSuperCredits) onStreamSong?.(song);
                      else onStreamAlbum?.();
                    } else {
                      onPlaySong?.(song);
                    }
                  }}
                  className="flex items-center gap-4 flex-1 min-w-0 h-full text-left disabled:cursor-default"
                >
                  <div className="flex-shrink-0 flex items-center gap-1.5">
                    <div className="w-3 flex items-center justify-center">
                      {isFavorite && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="rgba(255,255,255,0.7)"
                          aria-hidden
                          data-testid={`icon-favorite-${song.id}`}
                        >
                          <path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5 6.5 5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3 4 0 5.5 4 4 7-2.5 4.5-9.5 9-9.5 9z" />
                        </svg>
                      )}
                    </div>
                    <div className="w-6 flex items-center justify-end">
                      {isActive ? (
                        <div className="flex gap-0.5 items-end h-4">
                          {[1, 2, 3].map((j) => (
                            <div
                              key={j}
                              className="w-0.5 rounded-full"
                              style={{
                                background: "#319ED8",
                                height: isPlaying ? `${40 + j * 20}%` : "40%",
                                animationName: isPlaying ? "pulse" : "none",
                                animationDuration: `${0.5 + j * 0.1}s`,
                                animationIterationCount: "infinite",
                              }}
                            />
                          ))}
                        </div>
                      ) : song.streamOnly && streamingHandoffEnabled ? (
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="rgba(255,255,255,0.45)"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                          data-testid={`icon-stream-${song.id}`}
                        >
                          <path d="M7 17L17 7M9 7h8v8" />
                        </svg>
                      ) : (
                        <span
                          className="text-[15px] tabular-nums"
                          style={{ color: "rgba(255,255,255,0.32)" }}
                        >
                          {i + 1}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 h-full flex items-center gap-2.5">
                    <p
                      className={`text-[15px] font-semibold truncate ${isActive ? "text-[#319ED8]" : "text-fan-primary"}`}
                    >
                      {song.title}
                    </p>
                    {song.isExplicit && <ExplicitBadge />}
                  </div>
                </button>
                {nativeDownloadsEnabled && (
                  <button
                    type="button"
                    onClick={() => onToggleSongDownload?.(song.id)}
                    aria-label={
                      isDownloaded
                        ? "Remove download"
                        : "Download to this device"
                    }
                    aria-pressed={isDownloaded}
                    className="w-9 h-9 flex items-center justify-center flex-shrink-0 active:scale-[0.9] transition-transform"
                    data-testid={`button-download-song-${song.id}`}
                  >
                    {isDownloaded ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          fill="rgba(255,255,255,0.85)"
                        />
                        <path
                          d="M8 12.5l2.8 2.8L16.5 9.5"
                          stroke="#00062B"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                    ) : (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="rgba(255,255,255,0.45)"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 7v8" />
                        <path d="M8.5 11.5L12 15l3.5-3.5" />
                      </svg>
                    )}
                  </button>
                )}
                {!lockedPreview && !publicPreview && (
                <button
                  type="button"
                  onClick={(e) => {
                    // Opening a row menu must dismiss the album header menu so
                    // the two never overlap (they live in separate layers).
                    setShowMenu(false);
                    onOpenSongMenu?.(
                      song,
                      e.currentTarget.getBoundingClientRect(),
                    );
                  }}
                  aria-label="Song options"
                  aria-haspopup="menu"
                  className="w-7 h-9 flex items-center justify-center text-fan-faint flex-shrink-0"
                  data-testid={`button-track-menu-${song.id}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="19" cy="12" r="1.6" />
                  </svg>
                </button>
                )}
              </div>
              </Fragment>
            );
          })}
          <div
            className="h-px flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.20)" }}
          />
        </div>
        </div>

        {bonusSlot}
        {lineupSlot}

        {/* Metadata footer */}
        <div className="px-5 mt-7">
          <p
            className="text-[11px] leading-relaxed"
            style={{ color: "rgba(255,255,255,0.32)" }}
          >
            {/* Task #1078 — Apple-style footer. Prefer the full original
                release date ("February 16, 2010"); degrade to the bare year
                when no exact date has been entered. */}
            <span className="block" data-testid="text-album-year-footer">
              {formatReleaseDateLong(album.originalReleaseDate) ?? album.year}
            </span>
            <span className="block mt-0.5">
              {songs.length} {songs.length === 1 ? "song" : "songs"}, {runtime}
            </span>
            {label && (label.logoUrl || label.name) && (
              <span
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
              </span>
            )}
            {ownedNums.length > 0 && (
              <span className="block mt-1">
                {ownedNums.length === 1
                  ? `You own No. ${ownedNums[0].toString().padStart(2, "0")} of this ${album.type === "EP" ? "EP" : album.type === "Single" ? "single" : album.type === "Duo" ? "duo" : "LP"}.`
                  : `You own ${ownedNums.length} ${album.type === "EP" ? "EPs" : album.type === "Single" ? "singles" : album.type === "Duo" ? "duos" : "LPs"}.`}
              </span>
            )}
            {/* Task #1078 / #1158 — copyright line. Operator stores the bare
                credit ("2009 Brash Music"); the per-album symbol (℗ default,
                or ©) is prepended here. Hidden entirely when unset. */}
            {album.copyrightLine && (
              <span className="block mt-1" data-testid="text-album-copyright-footer">
                {album.copyrightSymbol || "℗"} {album.copyrightLine}
              </span>
            )}
          </p>
        </div>

        {children}
      </div>
    </div>
  );
}

/**
 * Apple-Music-style 2-line clamp on the album description with an
 * inline "...more" affordance that fades into the truncated last line.
 * Tapping either the text or the "...more" pill calls `onExpand` —
 * consumer opens its own description sheet.
 */
function ClampedDescription({
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
        className="text-fan-secondary text-sm mt-3 leading-relaxed line-clamp-2"
        data-testid="album-description"
      >
        {text}
      </p>
    );
  }

  return (
    <div className="relative mt-3" data-testid="album-description">
      <button
        type="button"
        onClick={onExpand}
        aria-label="Read more about this album"
        className="block w-full text-left active:opacity-80"
      >
        <p
          ref={ref}
          className="text-fan-secondary text-sm leading-relaxed line-clamp-2"
        >
          {text}
        </p>
        <span
          aria-hidden="true"
          className="absolute bottom-0 right-0 text-sm font-semibold pl-14 leading-relaxed"
          style={{
            color: "#319ED8",
            background:
              "linear-gradient(to right, rgba(0,6,43,0) 0%, #00062B 40%, #00062B 100%)",
          }}
          data-testid="button-album-description-more"
        >
          more
        </span>
      </button>
    </div>
  );
}
