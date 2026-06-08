import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from "framer-motion";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePlayer, PREVIEW_CAP_SECONDS } from "@/context/PlayerContext";
import { BuySheet } from "@/components/checkout/BuySheet";
import { buyEnabled } from "@/lib/platform";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useFavoriteSongs } from "@/hooks/useFavorites";
import {
  AlbumCreditsPage,
  buildAlbumCreditGroups,
  type AlbumCreditsPayload,
} from "@/components/ui/AlbumCreditsSheet";
import { PlaylistPickerSheet } from "@/components/PlaylistPickerSheet";
import { toast } from "@/hooks/use-toast";
import {
  useAlbumOwnership,
  setDevAlbumOwnership,
} from "@/hooks/useAlbumOwnership";
import { useFullPlaybackAccess } from "@/hooks/useFullPlaybackAccess";
import { useFanPreview } from "@/hooks/useFanPreview";
import {
  AlbumDesktopSidebar,
  BRAND_BG,
} from "@/components/ui/AlbumDesktopSidebar";
import {
  AlbumDetailDesktopSkeleton,
  AlbumNotFound,
} from "@/components/ui/AlbumDetailSkeleton";
import { DesktopSearchView } from "@/components/search/DesktopSearchView";
import { PlayerDock } from "@/components/ui/PlayerDock";
import { DesktopLyricsBody } from "@/components/ui/DesktopLyricsBody";
import { DesktopQueueBody } from "@/components/ui/DesktopQueueBody";
import {
  DesktopAlbumView,
  LYRICS_PANEL_WIDTH,
  type DesktopAlbumSong,
} from "@/components/ui/DesktopAlbumView";
import type { PlayerSong } from "@/context/PlayerContext";
import type { Album as PlayerAlbum } from "@/data/musicData";
import { ProvenanceSheet, OwnershipSheet, BonusVideoPlayer } from "@/pages/AlbumDetail";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { GoodDeedCertificate } from "@/components/GoodDeedCertificate";
import { CertPdfViewerSheet } from "@/components/ui/CertPdfViewerSheet";
import { track } from "@/lib/analytics";
import { isSunrisePending, formatSalesBeginDate } from "@shared/albumStage";
import { SalesBeginArrivalModal } from "@/components/ui/SalesBeginArrivalModal";

/** Left inset of the desktop album content channel, used to center the
 *  PlayerDock between the rails: AlbumDesktopSidebar sits 12px from the
 *  window edge, is 260px wide (matching the storefront rail), and the
 *  outer flex adds a 12px gap → 12 + 260 + 12 = 284. */
const ALBUM_DOCK_CHANNEL_LEFT = 284;

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
  // Task #1049 — repurposed "Sunset date". When set AND <= today the album
  // has left the GoodTunes exclusive window for streaming.
  streamingReleaseDate?: string | null;
  // Task #1078 — Apple-style album footer fields.
  originalReleaseDate?: string | null;
  copyrightLine?: string | null;
  // Task #1158 — per-album footer copyright symbol (℗ vs ©).
  copyrightSymbol?: string | null;
  spotifyUrl?: string | null;
  appleMusicUrl?: string | null;
  tidalUrl?: string | null;
  qobuzUrl?: string | null;
  deezerUrl?: string | null;
  pandoraUrl?: string | null;
  priceCents?: number | null;
  primaryArtistId?: string | null;
  shareSlug?: string | null;
  label?: { id: string; name: string; logoUrl: string | null } | null;
  songs: ApiSong[];
};
// Task #1185 — minimal shape of an /api/orders row, just the fields the ⋯
// menu's "Download GoodDeed PDF" action needs to resolve the owning order.
// Mirrors AlbumCard / mobile AlbumDetail's OrderLite.
type OrderLite = {
  id: string;
  albumId: string;
  goodDeedNumber: number | null;
  refundedAt: string | null;
  cert?: { id: string } | null;
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
 *   • AlbumDesktopSidebar          (left nav, incl. top "Search" entry)
 *   • DesktopAlbumView             (hero + tracklist + stacked bonus + lyrics panel)
 *   • DesktopSearchView            (shown in place of the hero in search mode)
 *   • PlayerDock density="compact" (Apple-Music-density bottom chrome)
 *
 * Task #1054 retired the old AlbumTopNowPlayingStrip header (its
 * magnifying-glass search was a dead control). Now-playing is fully
 * covered by the bottom PlayerDock; search moved into the sidebar.
 *
 * The DesktopAlbumView primitive is shared with the admin album preview
 * so editors see the same surface fans see, pixel-for-pixel.
 */
export function AlbumDetailDesktop({ albumId }: { albumId?: string } = {}) {
  const params = useParams<{ id: string }>();
  const id = albumId ?? params.id;
  const { user, updateProfile } = useAuth();
  const player = usePlayer();
  const reduceMotion = useReducedMotion();
  const [, navigate] = useLocation();
  // Drag controls for the md lyrics overlay's swipe-to-dismiss. We start
  // the drag from the header grab handle only (dragListener disabled on
  // the sheet) so the swipe never steals pointer/touch events from the
  // SyncedLyrics scroll region below it.
  const lyricsDragControls = useDragControls();
  // The lyrics side panel needs the room a wide desktop provides (its
  // 360px aside would crush the hero/tracklist at md). At md (portrait
  // tablets / split laptop windows, 768–1023) we render a full-bleed
  // lyrics overlay over the content area instead, so the dock's lyrics
  // button is never a no-op. Only one karaoke surface mounts at a time
  // because `lyricsOpen` (lg panel) and the md overlay are mutually
  // exclusive on this flag.
  const isLgViewport = useMediaQuery("(min-width: 1024px)");
  // Task #1054 — sidebar "Search" swaps the main content area into an
  // Apple-Music-style search view (box at top, ranked results below)
  // instead of the album hero. Picking a result navigates + drops back
  // out of search mode (onNavigate), so it lands on the chosen album.
  const [searchMode, setSearchMode] = useState(false);
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

  // While the md lyrics overlay is open, push a throwaway history entry so
  // the browser/native Back gesture closes the sheet instead of leaving
  // the album page. Closing the sheet any other way (header ×, dock
  // button, swipe-down) pops our entry back off so Back still works
  // normally afterwards. lg side-panel + <768 mobile never mount this
  // overlay, so they're untouched.
  const mdRailOpen = (player.showLyrics || player.showQueue) && !isLgViewport;
  useEffect(() => {
    if (!mdRailOpen) return;
    window.history.pushState({ gtLyricsOverlay: true }, "");
    const onPop = () => {
      player.setShowLyrics(false);
      player.setShowQueue(false);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // If our entry is still the current one (sheet closed by × / dock /
      // swipe rather than by Back), pop it so we don't strand a dead
      // history entry that would swallow the next Back press.
      if (window.history.state?.gtLyricsOverlay) {
        window.history.back();
      }
    };
  }, [mdRailOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOwned = useAlbumOwnership(id);
  // Bill's own accounts (admin sessions + a small email allowlist) are
  // exempted from preview-first "for now" so they hear full-length tracks
  // on every album — including ones shared to an account that doesn't own
  // it. `effectiveOwned` is what every playback/preview branch reads;
  // the real `isOwned` is kept for the dev ownership toggle so QA can
  // still flip between owned/not-owned states. Temporary until the real
  // ownership pipeline lands (Phase 4).
  const fullPlaybackAccess = useFullPlaybackAccess();
  // "View as a fan" lens — when a privileged operator flips it on, the page
  // renders as a non-owner visitor would see it (previews + Buy, no library
  // actions). See useFanPreview / the floating toggle in AlbumDetail.
  const { fanView } = useFanPreview();
  const effectiveOwned = !fanView && (isOwned || fullPlaybackAccess);
  // Task #909 parity — is this album an *active* admin-granted preview (a
  // temporary "demo" grant) rather than a real owned/comp copy? When it is,
  // the GoodDeed cert must render "[Demo]" everywhere a serial would appear
  // instead of falling back to a misleading "#01". Mirrors mobile AlbumDetail;
  // the server already excludes expired previews from /api/my-albums.
  const { data: myAlbumsForPreview } = useQuery<Array<{ albumId: string; isPreview?: boolean }> | null>({
    queryKey: ["/api/my-albums"],
  });
  const isPreviewAlbum = !!id && (myAlbumsForPreview ?? []).some((a) => a.albumId === id && a.isPreview);
  const favSongs = useFavoriteSongs();
  const [showAlbumCredits, setShowAlbumCredits] = useState(false);
  const [playlistPickerSong, setPlaylistPickerSong] = useState<{ id: string; title: string } | null>(null);
  // Task #1185 — desktop ⋯ menu sheet stack (mirrors mobile AlbumDetail).
  const [showCert, setShowCert] = useState(false);
  const [singleCertNum, setSingleCertNum] = useState<number | null>(null);
  const [provenanceCertNum, setProvenanceCertNum] = useState<number | null>(null);
  const [showOwnership, setShowOwnership] = useState(false);
  const [showAlbumPlaylistPicker, setShowAlbumPlaylistPicker] = useState(false);
  // Bonus video opened for playback in the desktop modal. Holds the id of the
  // clicked card; the overlay reuses the mobile BonusVideoPlayer (autoStart)
  // so a click plays straight away. Cleared on close.
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  // Escape closes the bonus-video playback modal (mirrors the click-on-scrim
  // dismiss). Only listens while a video is open.
  useEffect(() => {
    if (!playingVideoId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlayingVideoId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playingVideoId]);

  // Per-track credits opened from a track row's ⋯ menu (mirrors the mobile
  // track popover's "View Credits"). Scoped to one song — that song's
  // performers/writers plus the album-level production rows.
  const [creditsForSong, setCreditsForSong] = useState<{ id: string; title: string } | null>(null);

  const { data: album, isLoading } = useQuery<ApiAlbum>({
    queryKey: ["/api/albums", id],
    enabled: !!id,
  });
  const { data: albumCredits } = useQuery<AlbumCreditsPayload>({
    queryKey: ["/api/albums", id, "credits"],
    enabled: !!id,
  });
  const creditGroups = useMemo(
    () => buildAlbumCreditGroups(albumCredits),
    [albumCredits],
  );
  const hasAnyCredits = creditGroups.length > 0;
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

  const hasPreviews = songs.some((s) => s.isPreviewable !== false);
  const canPlay = effectiveOwned || hasPreviews;

  // Task #1628 — staged release whose sales-begin (sunrise) date hasn't
  // arrived yet. Drives the disabled "Sales Begin {date}" buy pill + the
  // arrival modal. Owners never see the locked state. Date-driven, so the
  // page flips to live buy behavior automatically the day sales begin.
  const salesPending =
    !effectiveOwned && isSunrisePending(album?.goodTunesReleaseDate);
  // When sales are pending the locked pill MUST render even if the date can't
  // be formatted: a malformed-but-lexically-future ISO string makes
  // isSunrisePending() true while formatSalesBeginDate() returns null, which
  // would otherwise drop us back to the live Buy pill while onBuyBundle is a
  // no-op (salesPending early-return). Fall back to a generic "soon" so the
  // staged surface stays internally consistent.
  const salesBeginLabel = salesPending
    ? formatSalesBeginDate(album?.goodTunesReleaseDate) ?? "soon"
    : null;

  // Task #1185 — resolve the fan's owning order(s) for this album so the ⋯
  // menu can offer GoodDeed actions (view cert/provenance/ownership +
  // "Download GoodDeed PDF"). The desktop ApiAlbum carries no ownership
  // numbers, so we derive them from the shared /api/orders cache (same
  // pattern as AlbumCard / mobile AlbumDetail). Download hits the existing
  // GET /api/orders/:orderId/cert/pdf unsigned fan endpoint.
  const { data: certOrdersData } = useQuery<OrderLite[]>({
    queryKey: ["/api/orders"],
    enabled: !!user,
  });
  const certOrders = (certOrdersData ?? []).filter(
    (o) => o.albumId === album?.id && !o.refundedAt && (o.cert || o.goodDeedNumber != null),
  );
  const ownedNums = certOrders
    .map((o) => o.goodDeedNumber)
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b);
  const hasCert = ownedNums.length > 0;
  const isMulti = ownedNums.length > 1;
  const pdfOrder = certOrders[0] ?? null;
  const [showCertPdf, setShowCertPdf] = useState(false);
  const openCertPdf = () => {
    if (!pdfOrder) return;
    setShowCertPdf(true);
  };
  // Album cast for the GoodDeed sheets (same `as unknown as PlayerAlbum`
  // pattern PersonDetailSheet uses). OwnershipSheet reads ownedCertificates,
  // which the API row lacks, so stamp the order-derived numbers on.
  const certAlbum = album
    ? ({ ...(album as unknown as PlayerAlbum), ownedCertificates: ownedNums })
    : null;
  const handleViewProvenance = () => {
    if (isMulti) setShowOwnership(true);
    else setProvenanceCertNum(ownedNums[0] ?? 1);
  };

  // Is the player currently auditioning a song from this album under
  // preview-mode? Used by the rose Play pill to switch into its Pause
  // affordance + by the dock to render the PREVIEW badge.
  const previewActive =
    !effectiveOwned &&
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
      // A track the operator hid (isPreviewable === false) is treated as
      // unreleased for EVERYONE — even owners. It never enters the
      // play-all / shuffle queue, so Play skips straight to the next
      // released track (Apple's pre-release pattern).
      .filter((s) => s.isPreviewable !== false)
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
  }, [album, songs, effectiveOwned]);

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
    if (!effectiveOwned) {
      player.setPreviewMode(true);
    } else if (player.previewMode) {
      player.setPreviewMode(false);
    }
    player.playSong(playable, playableSongs);
  };
  const handleAddTrack = (song: DesktopAlbumSong) => {
    setPlaylistPickerSong({ id: song.id, title: song.title });
  };
  const handlePlayNextTrack = (song: DesktopAlbumSong) => {
    const playable = playableSongs.find((p) => p.id === song.id);
    if (playable) player.playNext(playable);
  };
  const handlePlayLastTrack = (song: DesktopAlbumSong) => {
    const playable = playableSongs.find((p) => p.id === song.id);
    if (playable) player.playLast(playable);
  };
  const handleToggleFavoriteTrack = (song: DesktopAlbumSong) => {
    player.toggleFavorite(song.id);
  };
  // Per-track credits: scope the album credits payload down to one song's
  // performers/writers (the album-level production rows ride along so the
  // desktop card shows the same three groups the album modal does).
  const scopedCreditsFor = (songId: string): AlbumCreditsPayload => ({
    bySongId: albumCredits?.bySongId?.[songId]
      ? { [songId]: albumCredits.bySongId[songId] }
      : {},
    production: albumCredits?.production ?? [],
  });
  // A track "has credits" when it carries its own performers or writers,
  // mirroring the mobile track popover's gating (album-only production never
  // lights up a track's Credits action).
  const songHasCredits = (song: DesktopAlbumSong) => {
    const bucket = albumCredits?.bySongId?.[song.id];
    return (
      !!bucket &&
      ((bucket.performers?.length ?? 0) > 0 || (bucket.writers?.length ?? 0) > 0)
    );
  };
  const handleViewCreditsTrack = (song: DesktopAlbumSong) => {
    setShowAlbumCredits(false);
    setCreditsForSong({ id: song.id, title: song.title });
    if (album) track("credits_opened", { songId: song.id, albumId: album.id });
  };
  const handleBuyBundle = (opts?: { signedCert?: boolean }) => {
    // Task #1628 — read-only during a "Sales Begin" locked preview.
    if (salesPending) return;
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
    enabled: !!id && buyEnabled && !effectiveOwned,
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
    if (!buyEnabled || effectiveOwned) return;
    // Task #1628 — never auto-open Buy during a "Sales Begin" locked preview.
    if (salesPending) return;
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
    effectiveOwned,
    salesPending,
  ]);

  // Task #1628 — single source-of-truth lock: the Buy sheet must never stay
  // open during a "Sales Begin" locked preview, no matter how it was opened
  // (the `?buy=1` deep link initializes showBuySheet before the album data has
  // loaded, etc.). Force it closed.
  useEffect(() => {
    if (salesPending && showBuySheet) setShowBuySheet(false);
  }, [salesPending, showBuySheet]);

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
  // the user opens it before picking a track. When the song has lyrics we
  // render the SHARED karaoke `SyncedLyrics` surface (the same component
  // the mobile player uses) driven entirely by props — active line sharp,
  // neighbours blur/fade, auto-scroll, every line the same size. The
  // sizing/padding are tuned down for the 360px side panel; we never edit
  // SyncedLyrics internals.
  // Shared with the persistent storefront lyrics rail (Task #1523) so the two
  // surfaces can't drift — reads the current song + player time straight from
  // context.
  const lyricsBody = <DesktopLyricsBody />;

  // Shared desktop right rail. Lyrics and Up Next (queue) are mutually
  // exclusive (PlayerContext.toggleRail enforces it), so the SAME rail/overlay
  // renders whichever is active: queue body when showQueue, otherwise lyrics.
  const railOpen = player.showLyrics || player.showQueue;
  const railBody = player.showQueue ? <DesktopQueueBody /> : lyricsBody;

  // PlayerDock track adapter. Dock shows the artwork as the cover slot
  // when something is playing; otherwise the dock's idle treatment (a
  // centered gray "G", no title) takes over. We pass an empty title
  // while idle so no "Not playing" label ever leaks through — the dock
  // ignores the idle title anyway, but keeping it empty is honest.
  const dockTrack = player.currentSong
    ? {
        title: player.currentSong.title,
        subtitle: player.currentSong.album.artist,
        playable: true,
      }
    : { title: "", subtitle: undefined, playable: false };
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
      className="flex gap-3 w-full h-screen overflow-hidden text-fan-primary"
      style={{
        // `100dvh` (inline) tracks the visible viewport on iPad Safari so
        // the flex column — and the account chip the rail bottom-pins via
        // its `flex-1` spacer — doesn't slide under the browser chrome.
        // Falls back to the `h-screen` (100vh) class on browsers without
        // dvh support, since the invalid inline value is simply dropped.
        height: "100dvh",
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
        searchActive={searchMode}
        onSearch={() => setSearchMode(true)}
      />

      <div className="relative flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        <div className="flex-1 min-h-0 flex overflow-hidden">
        <main className="flex-1 min-w-0 overflow-y-auto overscroll-contain">
          {searchMode ? (
            <DesktopSearchView onNavigate={() => setSearchMode(false)} />
          ) : (
          <DesktopAlbumView
            album={album}
            songs={songs}
            videos={videos}
            photos={photos}
            label={album?.label ?? null}
            isOwned={effectiveOwned}
            canPlay={canPlay}
            currentSongId={player.currentSong?.id ?? null}
            isPlaying={player.isPlaying}
            onPlayAll={handlePlayAll}
            onShuffle={handleShuffle}
            onPlayPreview={handlePlayPreview}
            previewActive={previewActive}
            onPlayTrack={handlePlayTrack}
            onAddTrack={handleAddTrack}
            onPlayNextTrack={handlePlayNextTrack}
            onPlayLastTrack={handlePlayLastTrack}
            onToggleFavoriteTrack={handleToggleFavoriteTrack}
            onViewCreditsTrack={handleViewCreditsTrack}
            songHasCredits={songHasCredits}
            favoriteSongIds={favSongs.set}
            hasAlbumCredits={effectiveOwned && hasAnyCredits}
            onOpenAlbumCredits={() => setShowAlbumCredits(true)}
            onViewCertificate={effectiveOwned ? () => setShowCert(true) : undefined}
            onViewProvenance={effectiveOwned ? handleViewProvenance : undefined}
            onAddAlbumToPlaylist={() => setShowAlbumPlaylistPicker(true)}
            onDownloadCert={pdfOrder ? openCertPdf : undefined}
            isMultiOwned={isMulti}
            onPlayVideo={effectiveOwned ? setPlayingVideoId : undefined}
            onBuyBundle={buyEnabled ? handleBuyBundle : undefined}
            salesBeginLabel={salesBeginLabel}
            signedCertPriceCents={buyEnabled ? signedCertPriceCents : null}
            signedCertSoldOut={signedCertSoldOut}
            lyricsOpen={railOpen && isLgViewport}
            lyrics={railBody}
            onExpandLyrics={() => player.setShowPlayer(true)}
          />
          )}
        </main>

        {/* lg search lyrics rail. The album page's own lg lyrics panel
            lives inside DesktopAlbumView, which is swapped out for
            DesktopSearchView while searching — so the dock mic would have
            nothing to open. This sibling aside mirrors that panel (same
            shared `lyricsBody`, same 360px width the dock reserves as its
            right channel) so the karaoke rail opens beside the search
            results too. lg-only; md/portrait falls through to the overlay
            below. No backdrop-filter here — the card is a plain translucent
            surface, so it never stacks a second blur over the chrome. */}
        <AnimatePresence initial={false}>
          {searchMode && railOpen && isLgViewport && (
            <motion.aside
              key="search-lyrics-panel"
              className="hidden lg:flex justify-end flex-shrink-0 overflow-hidden self-start"
              style={{
                // Full-height rail: runs flush to the bottom window edge like
                // the storefront DesktopLyricsRail (Bill: consistent rail on
                // every screen). The floating dock reserves this width as its
                // right channel (≥1100) so it sits to the rail's LEFT and never
                // overlaps; SyncedLyrics' own bottom padding keeps the text
                // clear at narrower widths.
                height: "100dvh",
              }}
              initial={reduceMotion ? false : { width: 0 }}
              animate={{ width: LYRICS_PANEL_WIDTH }}
              exit={{ width: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 420, damping: 44, mass: 0.9 }
              }
              aria-label="Lyrics"
              data-testid="panel-lyrics-search"
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
                  <div className="flex-1 min-h-0 flex flex-col">{railBody}</div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
        </div>

        {/* Medium-width (768–1023) lyrics overlay. The lg side panel is
            mounted only at lg (lyricsOpen is gated on isLgViewport), so on
            portrait tablets / narrow split windows we cover the content
            area with a full-bleed lyrics sheet instead. It sits inside the
            content column (right of the sidebar) and below the fixed
            PlayerDock (z-40 > z-30), so the transport — including the
            lyrics toggle — stays reachable while reading. Reuses the SAME
            `lyricsBody` (shared SyncedLyrics, props only). */}
        <AnimatePresence initial={false}>
          {railOpen && !isLgViewport && (
            <motion.div
              key="lyrics-overlay-md"
              className="lg:hidden absolute inset-0 z-30 flex flex-col"
              style={{ background: BRAND_BG }}
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 420, damping: 44, mass: 0.9 }
              }
              // Swipe-to-dismiss. Drag is started manually from the header
              // grab handle (dragListener disabled) so the gesture never
              // competes with SyncedLyrics' own vertical scroll. Constrained
              // to 0 with elastic only on the downward (bottom) edge so the
              // sheet rubber-bands down and springs back if not flung far
              // enough. framer owns the inline transform here — there are no
              // Tailwind transform classes or `transition: all` on this el to
              // fight it (see framer/Tailwind transform-conflict note).
              drag="y"
              dragControls={lyricsDragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.7 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 120 || info.velocity.y > 600) {
                  player.setShowLyrics(false);
                  player.setShowQueue(false);
                }
              }}
              aria-label={player.showQueue ? "Up Next" : "Lyrics"}
              data-testid="overlay-lyrics-md"
            >
              {/* No title/close header — the dock mic owns the open/close
                  toggle. This slim bar keeps the swipe-down-to-dismiss
                  gesture alive with a minimal grab affordance (the little
                  pill) instead of a "Lyrics" + X row. */}
              <div
                className="flex items-center justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none select-none"
                onPointerDown={(e) => lyricsDragControls.start(e)}
                aria-label={player.showQueue ? "Drag down to close Up Next" : "Drag down to close lyrics"}
                data-testid="handle-lyrics-md-drag"
              >
                <span
                  aria-hidden
                  style={{
                    height: 4,
                    width: 36,
                    borderRadius: 9999,
                    background: "rgba(255,255,255,0.25)",
                  }}
                />
              </div>
              <div className="flex-1 min-h-0 flex flex-col">{railBody}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom-fixed compact PlayerDock. Centered above the content area
          (left:0/right:0 + flex justify-center) so it sits in the same
          horizontal band as the tracklist, matching Apple Music's desktop
          dock placement. */}
      <div className="fixed left-0 right-0 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-40 flex justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <PlayerDock
            density="compact"
            // Rail-aware docking: center the pill on the content channel
            // between the left nav rail (AlbumDesktopSidebar: 12px inset +
            // 220px wide + 12px flex gap = 244) and the right lyrics rail
            // (its 360px width, only while open at lg) — not the whole
            // window. The dock slides + resizes when lyrics open/close.
            channelLeft={ALBUM_DOCK_CHANNEL_LEFT}
            channelRight={
              railOpen && isLgViewport ? LYRICS_PANEL_WIDTH : 0
            }
            track={dockTrack}
            onTitleActivate={
              player.currentSong?.album.id != null &&
              player.currentSong?.album.id !== ""
                ? () => navigate(`/album/${player.currentSong!.album.id}`)
                : undefined
            }
            onSubtitleActivate={
              player.currentSong?.album.artist &&
              player.currentSong.album.artist.trim().length > 0
                ? () =>
                    navigate(
                      `/artist/${encodeURIComponent(player.currentSong!.album.artist)}`,
                    )
                : undefined
            }
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
            onLyrics={() => player.toggleRail("lyrics")}
            lyricsActive={player.showLyrics}
            onQueue={() => player.toggleRail("queue")}
            queueActive={player.showQueue}
            airPlaySupported={player.airPlaySupported}
            onAirPlay={player.showAirPlayPicker}
            coverNode={dockCover}
            onExpand={() => player.setShowPlayer(true)}
          />
        </div>
      </div>

      {import.meta.env.DEV && id && (
        <DevOwnershipToggle albumId={id} isOwned={isOwned} />
      )}

      {buyEnabled && salesBeginLabel && album && (
        <SalesBeginArrivalModal
          albumId={album.id}
          albumTitle={album.title}
          artist={album.artist}
          salesBeginLabel={salesBeginLabel}
        />
      )}

      <AnimatePresence>
        {playlistPickerSong && (
          <PlaylistPickerSheet
            songId={playlistPickerSong.id}
            songTitle={playlistPickerSong.title}
            onClose={() => setPlaylistPickerSong(null)}
          />
        )}
      </AnimatePresence>

      {/* Task #1185 — desktop ⋯ menu GoodDeed sheet stack (mirrors mobile). */}
      <AnimatePresence>
        {showAlbumPlaylistPicker && album && (
          <PlaylistPickerSheet
            songIds={songs.map((s) => s.id)}
            songTitle={`${album.title} · ${songs.length} song${songs.length === 1 ? "" : "s"}`}
            heading="Add Album to Playlist"
            onClose={() => setShowAlbumPlaylistPicker(false)}
          />
        )}
      </AnimatePresence>

      {showCertPdf && pdfOrder && (
        <CertPdfViewerSheet
          orderId={pdfOrder.id}
          filename={`GoodDeed-${album?.title ?? "Certificate"}.pdf`}
          onClose={() => setShowCertPdf(false)}
        />
      )}

      {showCert && certAlbum && (
        <GoodDeedCertificate
          album={certAlbum}
          ownerName={user?.displayName || "GoodTunes Fan"}
          identities={{
            realName: user?.realName ?? null,
            displayName: user?.displayName || "GoodTunes Fan",
            username: user?.username || "you",
          }}
          certificateNumber={singleCertNum ?? ownedNums[0] ?? 1}
          certificateNumbers={singleCertNum !== null ? [singleCertNum] : ownedNums}
          isPreview={isPreviewAlbum}
          onClose={() => { setShowCert(false); setSingleCertNum(null); }}
        />
      )}

      {provenanceCertNum !== null && certAlbum && (
        <ProvenanceSheet
          onViewGoodDeed={(n) => { setProvenanceCertNum(null); setShowCert(true); setSingleCertNum(n); }}
          album={certAlbum}
          ownerName={user?.displayName || "GoodTunes Fan"}
          certNum={provenanceCertNum}
          onClose={() => setProvenanceCertNum(null)}
        />
      )}

      {showOwnership && certAlbum && (
        <OwnershipSheet
          album={certAlbum}
          ownerName={user?.displayName || "GoodTunes Fan"}
          onClose={() => setShowOwnership(false)}
          onSelectCert={(n) => { setShowOwnership(false); setProvenanceCertNum(n); }}
        />
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

      {showAlbumCredits && effectiveOwned && hasAnyCredits && album ? (
        <AlbumCreditsPage
          album={album as unknown as PlayerAlbum}
          albumTitle={album.title}
          artist={album.artist}
          credits={albumCredits ?? {}}
          onClose={() => setShowAlbumCredits(false)}
        />
      ) : creditsForSong && effectiveOwned && album ? (
        <AlbumCreditsPage
          album={album as unknown as PlayerAlbum}
          albumTitle={creditsForSong.title}
          artist={`${album.artist} · ${album.title}`}
          eyebrow="Song Credits"
          credits={scopedCreditsFor(creditsForSong.id)}
          songHeader={{
            artwork: album.artwork,
            songTitle: creditsForSong.title,
            artistName: album.artist,
            albumName: album.title,
            dateLabel: album.year ? String(album.year) : undefined,
            isPlaying:
              player.currentSong?.id === creditsForSong.id && player.isPlaying,
            onTogglePlay: () => {
              const sid = creditsForSong?.id;
              if (!sid) return;
              if (player.currentSong?.id === sid) {
                player.togglePlay();
                return;
              }
              const playable = playableSongs.find((p) => p.id === sid);
              if (playable) player.playSong(playable, [playable]);
            },
            onOpenAlbum: () => setCreditsForSong(null),
          }}
          onClose={() => setCreditsForSong(null)}
        />
      ) : null}

      {/* Bonus-video playback modal. Clicking an unlocked video card on the
          desktop album page opens this full-screen overlay, reusing the same
          BonusVideoPlayer the mobile bonus tile uses (autoStart so the click
          plays straight away). Only mounts for owned albums — the card never
          invokes onPlayVideo while locked. */}
      <AnimatePresence>
        {playingVideoId && (() => {
          const v = videos.find((x) => x.id === playingVideoId);
          if (!v) return null;
          return (
            <motion.div
              key="bonus-video-modal"
              className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/85"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
              onClick={() => setPlayingVideoId(null)}
              role="dialog"
              aria-modal="true"
              aria-label={v.title ?? "Bonus video"}
              data-testid="modal-bonus-video"
            >
              <div
                className="relative w-full max-w-5xl"
                onClick={(e) => e.stopPropagation()}
              >
                <IconButton
                  size="md"
                  variant="glass"
                  label="Close video"
                  onClick={() => setPlayingVideoId(null)}
                  className="absolute -top-12 right-0"
                  data-testid="button-close-bonus-video"
                >
                  <X strokeWidth={2.2} />
                </IconButton>
                {v.title && (
                  <p
                    className="absolute -top-10 left-0 text-fan-primary text-sm font-semibold truncate max-w-[calc(100%-3rem)]"
                    data-testid="text-bonus-video-title"
                  >
                    {v.title}
                  </p>
                )}
                <BonusVideoPlayer
                  key={v.id}
                  video={{
                    id: v.id,
                    albumId: v.albumId,
                    title: v.title ?? "Untitled",
                    posterUrl: v.posterUrl ?? null,
                    position: 0,
                  }}
                  autoStart
                />
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
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
      <span className="text-fan-secondary uppercase tracking-[0.1em] text-[10px]">DEV</span>
      <button
        type="button"
        onClick={() => setDevAlbumOwnership(albumId, !isOwned)}
        className={[
          "px-2.5 h-7 rounded-full transition-colors",
          isOwned ? "bg-[#319ED8] text-white" : "bg-white/10 text-fan-secondary hover:bg-white/15",
        ].join(" ")}
        data-testid="button-dev-ownership"
      >
        {isOwned ? "Owned" : "Not owned"}
      </button>
    </div>
  );
}
