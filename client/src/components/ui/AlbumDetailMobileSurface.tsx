import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronLeft, Share, MoreHorizontal, Info } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { ExplicitBadge } from "@/components/ui/ExplicitBadge";

export interface AlbumDetailMobileSurfaceAlbum {
  id: string;
  title: string;
  artist: string;
  artwork: string | null;
  year: number | null;
  type: "Single" | "Duo" | "EP" | "LP";
  description?: string | null;
  isExplicit?: boolean;
  genre?: string | null;
  priceCents?: number | null;
}

export interface AlbumDetailMobileSurfaceSong {
  id: string;
  title: string;
  trackNumber: number;
  duration: number;
  isExplicit?: boolean | null;
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
  currentSongId,
  isPlaying = false,
  downloadedSongIds,
  favoriteSongIds,
  nativeDownloadsEnabled = false,
  hasAlbumCredits = false,
  onOpenAlbumCredits,
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
  onToggleAlbumDownload,
  onToggleSongDownload,
  onOpenSongMenu,
  onArtistClick,
  onExpandDescription,
  onViewCertificate,
  onViewProvenance,
  onAddAlbumToPlaylist,
}: AlbumDetailMobileSurfaceProps) {
  const [showMenu, setShowMenu] = useState(false);

  const isMulti = ownedNums.length > 1;
  const totalDuration = songs.reduce((acc, s) => acc + s.duration, 0);
  const totalMin = Math.floor(totalDuration / 60);
  const totalSec = totalDuration % 60;
  const runtime = `${totalMin} min${totalSec > 0 ? ` ${totalSec} sec` : ""}`;
  const allDownloaded =
    songs.length > 0 &&
    !!downloadedSongIds &&
    songs.every((s) => downloadedSongIds.has(s.id));

  return (
    <div className="relative w-full h-full flex flex-col text-white">
      <IconButton
        variant="glass"
        label="Back to collection"
        onClick={onBack}
        className="absolute top-14 left-4 z-50"
        data-testid="button-back-album"
      >
        <ChevronLeft strokeWidth={2.5} className="-translate-x-[1px]" />
      </IconButton>

      <div
        className="absolute top-14 right-4 z-50 flex items-center rounded-full backdrop-blur-md"
        style={{ background: "rgba(255,255,255,0.17)" }}
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
        <div className="w-px h-4 bg-white/25" aria-hidden />
        <div className="relative">
          <button
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
        {showMenu && onOpenAlbumMenu && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setShowMenu(false)}
            />
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 z-40 rounded-2xl py-1 min-w-[230px] overflow-hidden"
              style={{
                background: "rgba(28, 30, 38, 0.96)",
                backdropFilter: "blur(28px) saturate(180%)",
                WebkitBackdropFilter: "blur(28px) saturate(180%)",
                boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {onViewCertificate && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onViewCertificate();
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-white active:bg-white/10"
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
              {onViewProvenance && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onViewProvenance();
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-white active:bg-white/10"
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
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-white active:bg-white/10"
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
            </div>
          </>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-hide"
        style={{ paddingBottom: 160 }}
        data-testid="scroll-album"
      >
        <div style={{ background: "#00062B" }}>
          <div className="pt-32 px-6 flex justify-center">
            <div
              className="w-[72%] max-w-[300px] rounded-xl overflow-hidden"
              style={{
                aspectRatio: "1 / 1",
                boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
              }}
            >
              {album.artwork && (
                <img
                  src={album.artwork}
                  alt=""
                  className="w-full h-full object-cover block"
                />
              )}
            </div>
          </div>

          <div className="relative pt-4 pb-3 px-5 text-center">
            <h1
              className="text-white text-[22px] font-bold leading-tight tracking-tight flex items-center justify-center gap-2 flex-wrap"
              data-testid="text-album-title"
            >
              <span>{album.title}</span>
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
            {album.description && (
              <ClampedDescription
                text={album.description}
                onExpand={() => onExpandDescription?.()}
              />
            )}
          </div>
        </div>

        {/* Play / Shuffle / Add bar */}
        <div className="flex items-center justify-center gap-3 px-5 mt-1 mb-3">
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
          {ownedNums.length === 0 && album.priceCents != null && onOpenBuy && (
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
              Buy ${(album.priceCents / 100).toFixed(2)}
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
          {nativeDownloadsEnabled && (
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

        {/* Tracks */}
        <div
          className="bg-[#00062B] px-5 mt-5 border-t"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          {songs.map((song, i) => {
            const isActive = currentSongId === song.id;
            const isDownloaded = !!downloadedSongIds?.has(song.id);
            const isFavorite = !!favoriteSongIds?.has(song.id);
            return (
              <div
                key={song.id}
                className="flex items-center gap-3 h-16 active:bg-white/[0.03] transition-colors"
                data-testid={`row-track-${song.id}`}
              >
                <button
                  type="button"
                  onClick={() => onPlaySong?.(song)}
                  className="flex items-center gap-4 flex-1 min-w-0 h-full text-left"
                >
                  <div className="flex-shrink-0 flex items-center gap-1.5">
                    <div className="w-3 flex items-center justify-center">
                      {!isActive && isFavorite && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="var(--brand-heart)"
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
                      ) : (
                        <span
                          className="text-[15px] tabular-nums"
                          style={{ color: "rgba(255,255,255,0.32)" }}
                        >
                          {song.trackNumber}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 relative h-full flex items-center gap-2.5">
                    <p
                      className={`text-[15px] font-medium truncate ${isActive ? "text-[#319ED8]" : "text-white"}`}
                    >
                      {song.title}
                    </p>
                    {song.isExplicit && <ExplicitBadge />}
                    {i > 0 && (
                      <span
                        className="absolute left-0 right-0 top-0 h-px pointer-events-none"
                        style={{ background: "rgba(255,255,255,0.07)" }}
                      />
                    )}
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
                <button
                  type="button"
                  onClick={(e) =>
                    onOpenSongMenu?.(
                      song,
                      e.currentTarget.getBoundingClientRect(),
                    )
                  }
                  aria-label="Song options"
                  aria-haspopup="menu"
                  className="w-7 h-9 flex items-center justify-center text-white/40 flex-shrink-0"
                  data-testid={`button-track-menu-${song.id}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="19" cy="12" r="1.6" />
                  </svg>
                </button>
              </div>
            );
          })}
          <div
            className="h-px"
            style={{ background: "rgba(255,255,255,0.08)" }}
          />
        </div>

        {bonusSlot}
        {lineupSlot}

        {/* Metadata footer */}
        <div className="px-5 mt-7">
          <p
            className="text-[11px] leading-relaxed"
            style={{ color: "rgba(255,255,255,0.32)" }}
          >
            <span className="block" data-testid="text-album-year-footer">
              {album.year}
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
        className="text-white/70 text-sm mt-3 leading-relaxed line-clamp-2"
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
          className="text-white/70 text-sm leading-relaxed line-clamp-2"
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
