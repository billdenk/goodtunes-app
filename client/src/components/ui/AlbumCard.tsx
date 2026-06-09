// Shared album card (Task #1090).
//
// ONE album-card component for every fan surface — the Collection grid +
// Recently-Played rail, the Artist page (GoodTunes releases grid, streaming
// rails, "See All" bucket sheet), and Search album results. Before this,
// each surface re-implemented its own card markup, badges, and (on the
// album page) menu. This consolidates the rendering and adds the
// Apple-Music-style hover affordances:
//
//   - a circular Play button (bottom-left) and a "…" More menu
//     (bottom-right) appear over a subtle scrim ON POINTER/DESKTOP devices
//     only. Touch devices keep tap-to-navigate with no overlay.
//   - the card body always navigates to the album (or, for streaming-only
//     discography rows, opens the "How to Play" handoff the caller wires).
//
// The "…" menu reuses the exact actions + test-ids from the mobile album
// menu (`AlbumDetailMobileSurface`) — View GoodDeed®, Ownership / View
// Provenance, Add to Playlist — plus a NEW "Download GoodDeed PDF" item
// that reuses the existing order-keyed fan cert-PDF download
// (`GET /api/orders/:orderId/cert/pdf`). Menu items show only when they
// apply (owned + has a certificate / a downloadable order).
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import type { Album, Song } from "@/data/musicData";
import { SONGS } from "@/data/musicData";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/hooks/useAuth";
import { useAlbumOwnership } from "@/hooks/useAlbumOwnership";
import { useFullPlaybackAccess } from "@/hooks/useFullPlaybackAccess";
import { buyEnabled } from "@/lib/platform";
import { popBounce } from "@/lib/motion";
import { IconButton } from "@/components/ui/IconButton";
import { AlbumCover } from "@/components/ui/AlbumCover";
import { ExplicitBadge } from "@/components/ui/ExplicitBadge";
import { GoodDeedCertificate } from "@/components/GoodDeedCertificate";
import { CertPdfViewerSheet } from "@/components/ui/CertPdfViewerSheet";
import { PlaylistPickerSheet } from "@/components/PlaylistPickerSheet";
import { ProvenanceSheet, OwnershipSheet } from "@/pages/AlbumDetail";

export type AlbumCardMode = "grid" | "row";

// The minimal order shape we read off /api/orders to find a downloadable
// GoodDeed cert PDF + the live cert numbers for a real (non-seed) album.
type OrderLite = {
  id: string;
  albumId: string;
  goodDeedNumber: number | null;
  refundedAt: string | null;
  cert?: { id: string } | null;
};

// Detect a true hover/pointer device. Touch surfaces never get the overlay
// (tap-to-navigate stays the only interaction); pointer/desktop devices get
// the Apple-Music hover affordances.
function useCanHover(): boolean {
  const [can, setCan] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    setCan(mq.matches);
    const onChange = () => setCan(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return can;
}

export interface AlbumCardProps {
  album: Album;
  mode?: AlbumCardMode;
  /** Demo chip in place of the owned/×N badge (active preview). */
  isPreview?: boolean;
  /** Override the secondary metadata line (defaults to the artist name). */
  subtitle?: string;
  /** Fixed width — used by the rails (Recently Played 90, streaming 160). */
  width?: number;
  /**
   * Compact treatment for the small Recently-Played rail (90px): tighter
   * type and a single centered Play on hover (the corners are too small for
   * two 44pt controls; the "…" actions stay reachable on larger cards + the
   * album page).
   */
  compact?: boolean;
  /**
   * Whether in-app play + the "…" menu apply. False for streaming-only
   * discography rows (no master to play, no ownership) — they just render
   * the cover + body-click handoff.
   */
  playable?: boolean;
  /** Body-click handler. Defaults to navigating to /album/:id. */
  onNavigate?: () => void;
}

export function AlbumCard({
  album,
  mode = "grid",
  isPreview = false,
  subtitle,
  width,
  compact = false,
  playable = true,
  onNavigate,
}: AlbumCardProps) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const canHover = useCanHover();
  const {
    playSong,
    currentSong,
    isPlaying,
    togglePlay,
    setPreviewMode,
    previewMode,
  } = usePlayer();

  const isOwned = useAlbumOwnership(album.id);
  const fullAccess = useFullPlaybackAccess();
  const previewFirst = buyEnabled && !isOwned && !fullAccess;

  // Songs for this album — prefer the cached /api/songs catalog, fall back
  // to the static seed for demo albums that aren't in the DB.
  const { data: dbSongs } = useQuery<Song[]>({ queryKey: ["/api/songs"] });
  const albumSongs = useMemo(() => {
    const fromDb = (dbSongs ?? []).filter((s) => s.albumId === album.id);
    const list = fromDb.length > 0 ? fromDb : SONGS.filter((s) => s.albumId === album.id);
    return list.map((s) => ({ ...s, album }));
  }, [dbSongs, album]);
  const playableSongs = useMemo(
    () =>
      previewFirst
        ? albumSongs.filter((s) => (s as any).isPreviewable !== false)
        : albumSongs,
    [albumSongs, previewFirst],
  );

  // Cert state. Static-seed albums carry ownedCertificates/purchases; real
  // albums resolve owned cert numbers + a downloadable order from /api/orders.
  const { data: orders } = useQuery<OrderLite[]>({
    queryKey: ["/api/orders"],
    enabled: playable && !!user,
  });
  const seedNums = album.ownedCertificates ?? (album.certificateNumber ? [album.certificateNumber] : []);
  const certOrders = useMemo(
    () =>
      (orders ?? []).filter(
        (o) => o.albumId === album.id && !o.refundedAt && (o.cert || o.goodDeedNumber != null),
      ),
    [orders, album.id],
  );
  const orderNums = useMemo(
    () => certOrders.map((o) => o.goodDeedNumber).filter((n): n is number => n != null),
    [certOrders],
  );
  const ownedNums = seedNums.length > 0 ? seedNums : orderNums;
  const isMulti = !isPreview && ownedNums.length > 1;
  const hasCert = ownedNums.length > 0;
  const pdfOrder = certOrders[0] ?? null;

  const ownedCount = album.ownedCertificates?.length ?? (orderNums.length || 1);
  const showOwnedBadge = !isPreview && ownedCount > 1;

  const isCurrentAlbum = currentSong?.albumId === album.id;
  const isCurrentlyPlaying = isCurrentAlbum && isPlaying;

  // ── menu + sheet state ──────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const [showCert, setShowCert] = useState(false);
  const [singleCertNum, setSingleCertNum] = useState<number | null>(null);
  const [provenanceCertNum, setProvenanceCertNum] = useState<number | null>(null);
  const [showOwnership, setShowOwnership] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showPdf, setShowPdf] = useState(false);

  const ownerName = user?.displayName || "GoodTunes Fan";
  const hasMenuActions = playable && (hasCert || !!pdfOrder || albumSongs.length > 0);

  const handlePlay = () => {
    if (playableSongs.length === 0) return;
    if (isCurrentAlbum) {
      togglePlay();
      return;
    }
    if (previewFirst) setPreviewMode(true);
    else if (previewMode) setPreviewMode(false);
    playSong(playableSongs[0], playableSongs);
  };

  const handleNavigate = () => {
    if (onNavigate) onNavigate();
    else navigate(`/album/${album.id}`);
  };

  const openMenu = () => {
    const r = moreRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    setMenuOpen(true);
  };

  const handleViewProvenance = () => {
    if (isMulti) setShowOwnership(true);
    else setProvenanceCertNum(ownedNums[0] ?? album.certificateNumber ?? 1);
  };

  const openPdf = () => {
    if (!pdfOrder) return;
    setShowPdf(true);
  };

  // ── artwork + overlay ───────────────────────────────────────────────
  // Small thumbs (the 90px rail, the 44px search row) can't fit two 44pt
  // corner controls, so they show a single centered Play on hover. Row mode
  // surfaces the "…" as a trailing control in the row instead.
  const overlayCompact = compact || mode === "row";
  const radius = mode === "row" ? "rounded-md" : "rounded-lg";
  const playingShadow = isCurrentlyPlaying
    ? "0 0 0 2px var(--brand-blue), 0 4px 20px rgba(0,0,0,0.4)"
    : "0 4px 20px rgba(0,0,0,0.4)";

  const artwork = (
    <div className="relative aspect-square group/card">
      {/* stacked-cards treatment for multi-owned */}
      {isMulti && (
        <>
          <div
            aria-hidden
            className="absolute inset-0 rounded-lg overflow-hidden"
            style={{ transform: "rotate(-6deg) translate(-6px, -4px) scale(0.94)", boxShadow: "0 4px 16px rgba(0,0,0,0.45)", zIndex: 0 }}
          >
            <AlbumCover artwork={album.artwork} artistPhoto={album.artistPhoto} title={album.title} decorative className="opacity-85" />
          </div>
          {ownedCount > 2 && (
            <div
              aria-hidden
              className="absolute inset-0 rounded-lg overflow-hidden"
              style={{ transform: "rotate(5deg) translate(6px, -3px) scale(0.96)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)", zIndex: 1 }}
            >
              <AlbumCover artwork={album.artwork} artistPhoto={album.artistPhoto} title={album.title} decorative className="opacity-90" />
            </div>
          )}
        </>
      )}

      <button
        type="button"
        onClick={handleNavigate}
        className={`relative z-10 w-full h-full ${radius} overflow-hidden active:scale-[0.97] transition-transform`}
        style={{ boxShadow: playingShadow }}
        data-testid={`albumcard-art-${album.id}`}
      >
        <AlbumCover artwork={album.artwork} artistPhoto={album.artistPhoto} title={album.title} showName={!compact} />

        {isCurrentlyPlaying && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,6,43,0.45)" }}>
            <div className="flex gap-[3px] items-end h-5">
              {[0.6, 1, 0.75].map((h, i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full"
                  style={{ background: "white", height: `${h * 100}%`, animation: "equalizerBounce 0.8s ease-in-out infinite alternate", animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {showOwnedBadge && (
          <div className="absolute top-2 right-2">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: "rgba(74,255,202,0.2)", color: "var(--brand-mint)", border: "1px solid rgba(74,255,202,0.35)", backdropFilter: "blur(4px)" }}
              data-testid={`badge-owned-${album.id}`}
            >
              ×{ownedCount}
            </span>
          </div>
        )}
        {isPreview && (
          <div className="absolute top-2 right-2">
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.22)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.4)", backdropFilter: "blur(4px)" }}
              data-testid={`badge-demo-${album.id}`}
            >
              Demo
            </span>
          </div>
        )}
      </button>

      {/* Apple-Music hover affordances — pointer/desktop only. */}
      {canHover && playable && (
        <div
          className={`absolute inset-0 z-20 ${radius} pointer-events-none transition-opacity duration-150 opacity-0 group-hover/card:opacity-100 ${menuOpen ? "opacity-100" : ""}`}
        >
          {/* subtle scrim from the bottom so the controls read on any art */}
          <div
            className={`absolute inset-0 ${radius}`}
            style={{ background: "linear-gradient(to top, rgba(0,6,43,0.55), rgba(0,6,43,0) 55%)" }}
          />
          {overlayCompact ? (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
              <IconButton
                variant="solid"
                size="md"
                label={isCurrentlyPlaying ? "Pause" : "Play"}
                onClick={(e) => { e.stopPropagation(); handlePlay(); }}
                className="active:scale-[0.94] shadow-lg"
                data-testid={`albumcard-play-${album.id}`}
              >
                {isCurrentlyPlaying ? (
                  <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><path d="M8 5.14v14l11-7-11-7z" /></svg>
                )}
              </IconButton>
            </div>
          ) : (
            <>
              <div className="absolute bottom-2 left-2 pointer-events-auto">
                <IconButton
                  variant="solid"
                  size="md"
                  label={isCurrentlyPlaying ? "Pause" : "Play"}
                  onClick={(e) => { e.stopPropagation(); handlePlay(); }}
                  className="active:scale-[0.94] shadow-lg"
                  data-testid={`albumcard-play-${album.id}`}
                >
                  {isCurrentlyPlaying ? (
                    <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><path d="M8 5.14v14l11-7-11-7z" /></svg>
                  )}
                </IconButton>
              </div>
              {hasMenuActions && (
                <div className="absolute bottom-2 right-2 pointer-events-auto">
                  <IconButton
                    ref={moreRef}
                    variant="dimmed"
                    size="md"
                    label="Album options"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={(e) => { e.stopPropagation(); openMenu(); }}
                    className="active:scale-[0.94]"
                    data-testid={`albumcard-more-${album.id}`}
                  >
                    <MoreHorizontal />
                  </IconButton>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  // ── metadata line ───────────────────────────────────────────────────
  const meta = compact ? (
    <div className="mt-1.5">
      <p className="text-fan-primary text-[11px] font-normal truncate leading-tight text-left" data-testid={`text-album-title-${album.id}`}>{album.title}</p>
      <p className="text-fan-secondary text-[10px] truncate leading-tight text-left mt-0.5">{subtitle ?? album.artist}</p>
    </div>
  ) : (
    <div className="mt-2 px-0.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <p className="flex-1 min-w-0 text-fan-primary text-[15px] font-normal leading-tight truncate" data-testid={`text-album-title-${album.id}`}>{album.title}</p>
        {album.isExplicit && <ExplicitBadge />}
      </div>
      <p className="text-fan-secondary text-[13px] font-normal truncate mt-0.5">{subtitle ?? album.artist}</p>
    </div>
  );

  // ── menu + sheets (portaled / overlaid) ─────────────────────────────
  const menu = createPortal(
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
            {hasCert && (
              <>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setSingleCertNum(null); setShowCert(true); }}
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
            {pdfOrder && (
              <>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); openPdf(); }}
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
            {hasCert && (
              <>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); handleViewProvenance(); }}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-white transition-colors active:bg-white/10"
                  data-testid="menu-view-provenance"
                >
                  <span>{isMulti ? "Ownership" : "View Provenance"}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-blue)" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </button>
                <div className="h-px bg-white/8" />
              </>
            )}
            {albumSongs.length > 0 && isOwned && !isPreview && (
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setShowPlaylist(true); }}
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
  );

  const sheets = (
    <>
      {showCert && (
        <GoodDeedCertificate
          album={album}
          ownerName={ownerName}
          identities={{
            realName: user?.realName ?? null,
            displayName: user?.displayName || "GoodTunes Fan",
            username: user?.username || "you",
          }}
          certificateNumber={singleCertNum ?? album.certificateNumber ?? ownedNums[0] ?? 1}
          certificateNumbers={singleCertNum !== null ? [singleCertNum] : (album.ownedCertificates ?? ownedNums)}
          isPreview={isPreview}
          onClose={() => setShowCert(false)}
        />
      )}
      {provenanceCertNum !== null && (
        <ProvenanceSheet
          album={album}
          ownerName={ownerName}
          certNum={provenanceCertNum}
          onViewGoodDeed={(n) => { setProvenanceCertNum(null); setSingleCertNum(n); setShowCert(true); }}
          onClose={() => setProvenanceCertNum(null)}
        />
      )}
      {showOwnership && (
        <OwnershipSheet
          album={album}
          ownerName={ownerName}
          onSelectCert={(n) => { setShowOwnership(false); setProvenanceCertNum(n); }}
          onClose={() => setShowOwnership(false)}
        />
      )}
      <AnimatePresence>
        {showPlaylist && (
          <PlaylistPickerSheet
            songIds={albumSongs.map((s) => s.id)}
            songTitle={`${album.title} · ${albumSongs.length} song${albumSongs.length === 1 ? "" : "s"}`}
            heading="Add Album to Playlist"
            onClose={() => setShowPlaylist(false)}
          />
        )}
      </AnimatePresence>
      {showPdf && pdfOrder && (
        <CertPdfViewerSheet
          orderId={pdfOrder.id}
          filename={`GoodDeed-${album.title}.pdf`}
          onClose={() => setShowPdf(false)}
        />
      )}
    </>
  );

  if (mode === "row") {
    return (
      <div
        className="w-full flex items-center gap-3 py-2.5 group/card"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        data-testid={`albumcard-row-${album.id}`}
      >
        <div className="w-11 h-11 flex-shrink-0">{artwork}</div>
        <button type="button" onClick={handleNavigate} className="flex-1 min-w-0 text-left active:opacity-60 transition-opacity">
          <p className="text-fan-primary text-sm font-normal truncate leading-tight">{album.title}</p>
          <p className="text-fan-secondary text-xs truncate leading-tight mt-0.5">{subtitle ?? album.artist}</p>
        </button>
        {canHover && hasMenuActions ? (
          <IconButton
            ref={moreRef}
            variant="ghost"
            size="md"
            label="Album options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => { e.stopPropagation(); openMenu(); }}
            className="opacity-0 group-hover/card:opacity-100 transition-opacity flex-shrink-0"
            data-testid={`albumcard-more-${album.id}`}
          >
            <MoreHorizontal />
          </IconButton>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.3">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" />
          </svg>
        )}
        {menu}
        {sheets}
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={width ? { width } : undefined} data-testid={`albumcard-${album.id}`}>
      {artwork}
      {meta}
      {menu}
      {sheets}
    </div>
  );
}
