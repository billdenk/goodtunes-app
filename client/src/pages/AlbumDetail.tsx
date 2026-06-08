import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlbumDetailMobileSurface } from "@/components/ui/AlbumDetailMobileSurface";
import { AlbumDetailMobileSkeleton, AlbumNotFound } from "@/components/ui/AlbumDetailSkeleton";
import { AlbumCreditsSheet, SongCreditsSheet, buildAlbumCreditGroups, type SongRig } from "@/components/ui/AlbumCreditsSheet";
import type { AlbumCreditsPayload, AlbumCreditsRow } from "@/components/ui/AlbumCreditsSheet";
import { BonusPlayBadge } from "@/components/ui/BonusPlayBadge";
import { BonusVideoPlayer, type BonusVideo } from "@/components/ui/BonusVideoPlayer";
// Re-exported so existing importers (and the bonusVideoPlayer test that pins
// the tap-to-play contract) keep resolving it from this module after the
// player moved to a shared component reused by the desktop Music-Videos
// lightbox.
export { BonusVideoPlayer } from "@/components/ui/BonusVideoPlayer";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePlayer, PREVIEW_CAP_SECONDS } from "@/context/PlayerContext";
import { useAlbumOwnership } from "@/hooks/useAlbumOwnership";
import { useFullPlaybackAccess } from "@/hooks/useFullPlaybackAccess";
import { FanPreviewProvider, useFanPreview } from "@/hooks/useFanPreview";
import { useAuth } from "@/hooks/useAuth";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";
import { GoodDeedCertificate } from "@/components/GoodDeedCertificate";
import { CertPdfViewerSheet } from "@/components/ui/CertPdfViewerSheet";
import { BuySheet } from "@/components/checkout/BuySheet";
import { PlaylistPickerSheet } from "@/components/PlaylistPickerSheet";
import { StreamServicePickerSheet } from "@/components/StreamServicePickerSheet";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { sheetOpen, sheetClose, scrimFade } from "@/lib/motion";
import {
  SheetClose,
  SheetBack,
  SheetDismissProvider,
  useSheetDismiss,
  SHEET_SAFE_TOP,
  SHEET_TOP_FADE,
} from "@/components/ui/SheetChrome";
import {
  getFavoriteStreamingService,
  setFavoriteStreamingService,
  handoffUrlForService,
  openStreamLink,
  STREAMING_SERVICES,
  type StreamingServiceId,
  type StreamLinks,
} from "@/lib/streamingService";
import { useFavoriteSongs } from "@/hooks/useFavorites";
import { toast } from "@/hooks/use-toast";
import { IconButton } from "@/components/ui/IconButton";
import { ExplicitBadge } from "@/components/ui/ExplicitBadge";
import { GearDetailBody, type GearArtist, type GearArtistNote } from "@/components/gear/GearDetailBody";
import { ChevronLeft, Share, MoreHorizontal, Lock, ShieldCheck, Music2, ArrowRight, Eye } from "lucide-react";
import { buyEnabled, nativeDownloadsEnabled, streamingHandoffEnabled } from "@/lib/platform";
import { isPurchaseFunnelHost } from "@/hooks/useAuthKind";
import { LockedOfferModal } from "@/components/ui/LockedOfferModal";
import { hasPreviewPass } from "@/lib/previewPass";
import { downloadSong, removeDownload, listDownloadedSongs } from "@/lib/nativeDownloads";
import { track } from "@/lib/analytics";
import Hls from "hls.js";
import { useScrollHideNav } from "@/hooks/useNavVisibility";
import { useRecordRecent } from "@/hooks/useRecents";
import { ALBUMS, getSongsByAlbum, getCreditsForSong, PEOPLE, INSTRUMENTS, type Song, type Album, type Person, type Instrument, type InstrumentVendor, type TrackPerformer, type TrackCredits } from "@/data/musicData";

// Enriched credits as returned by GET /api/songs/:id/credits and
// GET /api/albums/:id/credits. Person/instrument joins are already done
// server-side so the fan-side credits surface renders from a single fetch.
type ApiPerson = { id: string; name: string; photoUrl?: string | null; bio?: string | null };
type ApiVendor = { id: string; instrumentId: string; vendorId: string; name: string; domain?: string; affiliateUrl: string; aboutUrl?: string | null; homeUrl?: string | null; logoUrl?: string | null; tagline?: string | null; bio?: string | null; location?: string | null; coverUrl?: string | null; position: number };
type ApiInstrument = { id: string; name: string; category: string; shortCategory?: string | null; photoUrl?: string | null; photoUrls?: string[] | null; about?: string | null; artistNote?: string | null; vendors: ApiVendor[] };
type ApiSongCredits = {
  writers: Array<{ id: string; songId: string; personId: string | null; name: string; role: string; position: number; person: ApiPerson | null }>;
  performers: Array<{ id: string; songId: string; personId: string | null; instrumentId: string | null; name: string; role: string; tuningNotes: string | null; position: number; person: ApiPerson | null; instrument: ApiInstrument | null }>;
  rigs?: SongRig[];
};

// API rows use `string | null` for optional columns; the static types use
// `string | undefined`. These tiny coercions keep TS happy and match the
// static-seed shapes already used by the credits sheets.
const nu = <T,>(v: T | null | undefined): T | undefined => v ?? undefined;
function normalizePerson(p: ApiPerson): Person {
  return { id: p.id, name: p.name, photoUrl: nu(p.photoUrl), bio: nu(p.bio) };
}
function normalizeInstrument(i: ApiInstrument): Instrument {
  return {
    id: i.id,
    name: i.name,
    category: i.category,
    shortCategory: nu(i.shortCategory),
    photoUrl: nu(i.photoUrl),
    photoUrls: nu(i.photoUrls),
    about: nu(i.about),
    artistNote: nu(i.artistNote),
    vendors: i.vendors.map((v) => ({
      // Static-shape fields the static seed data also fills in.
      name: v.name,
      affiliateUrl: v.affiliateUrl,
      aboutUrl: nu(v.aboutUrl),
      logoUrl: nu(v.logoUrl),
      tagline: nu(v.tagline),
      bio: nu(v.bio),
      location: nu(v.location),
      coverUrl: nu(v.coverUrl),
      // API-only fields needed by VendorSheet (profile fetch + bookmark
      // keying). Static seed rows leave these undefined and fall back
      // gracefully.
      id: v.id,
      vendorId: v.vendorId,
      instrumentId: v.instrumentId,
      homeUrl: v.homeUrl ?? undefined,
      domain: v.domain,
    })),
  };
}

// Adapt a single song's `TrackCredits` (the static-seed-inclusive shape used
// throughout the mobile credits flow) into the one-song `AlbumCreditsPayload`
// the shared CreditsSlider consumes, resolving each row's photo via the
// people map so avatars render. No album-level production rows — this is the
// per-song "Song Credits" surface, so `buildAlbumCreditGroups` yields just
// this track's Performing Artists / Composition & Lyrics groups.
function songCreditsPayload(
  tc: TrackCredits | undefined,
  songId: string,
  peopleById: Map<string, Person>,
): AlbumCreditsPayload {
  const toRow = (
    name: string | undefined,
    role: string,
    personId: string | undefined,
    idx: number,
    prefix: string,
  ): AlbumCreditsRow => {
    const p = personId ? peopleById.get(personId) : undefined;
    return {
      id: personId ?? `${prefix}-${idx}`,
      personId: personId ?? null,
      name: name ?? p?.name ?? "",
      role,
      person: p ? { id: p.id, name: p.name, photoUrl: p.photoUrl ?? null } : null,
    };
  };
  return {
    bySongId: {
      [songId]: {
        writers: (tc?.writers ?? []).map((w, i) => toRow(w.name, w.role, w.personId, i, "w")),
        performers: (tc?.performers ?? []).map((p, i) => toRow(p.name, p.role, p.personId, i, "p")),
      },
    },
  };
}

import { useMediaQuery } from "@/hooks/useMediaQuery";
import { AlbumDetailDesktop } from "@/pages/AlbumDetailDesktop";
import { shareAlbum } from "@/lib/shareAlbum";
import { isSunrisePending, formatSalesBeginDate } from "@shared/albumStage";
import { SalesBeginArrivalModal } from "@/components/ui/SalesBeginArrivalModal";
import { goBack } from "@/lib/navHistory";

/**
 * Fan-facing album route. Switches between the Apple-Music-style mobile
 * shell (`AlbumDetailMobile`, the original surface) and the
 * sidebar + hero + tracklist shell (`AlbumDetailDesktop`, graduated
 * from the mockup sandbox) at the 768px breakpoint.
 *
 * The breakpoint sits at 768 — not 1024 — so real tablets in portrait
 * (iPad mini 744 ≈, iPad 810, iPad Pro 11" 834) get the desktop-style
 * surface rather than the phone column stretched across an 800px wide
 * screen. DesktopAlbumView itself reflows internally between md
 * (768–1023) and lg (≥1024): tighter padding, smaller cover, smaller
 * title at md; lyrics side panel only mounts at lg where it fits.
 * Both branches consume the same `/api/albums/:id` cache so there's no
 * double fetch on resize.
 */
// Task #1185 — trimmed order shape for resolving a downloadable GoodDeed
// cert (mirrors AlbumCard's OrderLite). Keyed off the shared `/api/orders`
// cache; we only read the fields the ⋯ menu's PDF download needs.
type OrderLite = {
  id: string;
  albumId: string;
  goodDeedNumber: number | null;
  refundedAt: string | null;
  cert?: { id: string } | null;
};

// Task #1631 — Post-purchase thank-you modal. Pops once when a fan lands on the
// album after a sale (the buy funnel appends `?gtwelcome=1`, or the cross-host
// handoff in main.tsx restores it from the URL fragment). Confirms the music /
// videos / photos are unlocked now and points at the free, personalized,
// numbered GoodDeed certificate download behind the ⋯ menu. Self-contained so a
// single mount in the parent covers both the mobile and desktop surfaces.
//
// "Show once" is enforced two ways: we strip `gtwelcome` from the URL the
// instant we read it (a refresh / back never re-pops it) AND we stamp a
// per-album localStorage key so a shared / bookmarked URL that still carries
// the flag won't nag a fan who already dismissed it.
function PurchaseThankYouModal({ albumId: albumIdProp }: { albumId?: string }) {
  const { user } = useAuth();
  // The bare `/album/:id` route mounts <AlbumDetail /> with no prop, so fall
  // back to the route param (same resolution the surface uses) — otherwise the
  // localStorage "seen" key collapses to a single global value and the modal
  // would only ever show for the first album a fan opens.
  const params = useParams<{ id: string }>();
  const albumId = albumIdProp ?? params.id;
  const [open, setOpen] = useState(false);
  const armed = useRef(false);

  useEffect(() => {
    if (armed.current) return;
    let flagged = false;
    try {
      flagged = new URLSearchParams(window.location.search).get("gtwelcome") === "1";
    } catch {}
    if (!flagged) return;
    // Strip the flag from the URL + history so a refresh or back-navigation
    // never re-pops the modal.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("gtwelcome");
      window.history.replaceState({}, "", url.toString());
    } catch {}
    const key = `gt:welcome-seen:${albumId ?? "x"}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {}
    armed.current = true;
    setOpen(true);
  }, [albumId]);

  // Best-effort personalization — pull the GoodDeed number for this album off
  // the shared /api/orders cache (already warmed by the album page). If it
  // isn't resolved yet the copy gracefully omits the number.
  const { data: orders } = useQuery<OrderLite[]>({
    queryKey: ["/api/orders"],
    enabled: open && !!user,
  });
  const certNum =
    (orders ?? []).find(
      (o) => o.albumId === albumId && !o.refundedAt && o.goodDeedNumber != null,
    )?.goodDeedNumber ?? null;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Purchase complete"
      data-testid="modal-purchase-thankyou"
    >
      <div
        className="absolute inset-0 bg-black/70"
        onClick={() => setOpen(false)}
        data-testid="overlay-purchase-thankyou"
      />
      <div
        className="relative w-full max-w-[400px] rounded-3xl border border-white/10 shadow-2xl p-7"
        style={{ background: "var(--brand-bg)" }}
      >
        <div className="absolute right-4 top-4">
          <SheetClose onClick={() => setOpen(false)} data-testid="button-close-thankyou" />
        </div>

        <div
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(74,255,202,0.14)" }}
        >
          <Music2 className="h-6 w-6" style={{ color: "var(--brand-mint)" }} />
        </div>

        <p
          className="mt-5 text-xs font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--brand-mint)" }}
          data-testid="text-thankyou-eyebrow"
        >
          Purchase complete
        </p>
        <h2 className="mt-1.5 text-2xl font-bold text-fan-primary" data-testid="text-thankyou-title">
          It’s all yours.
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-fan-secondary" data-testid="text-thankyou-body">
          Your music, videos, and photos are unlocked right now — press play and enjoy.
        </p>

        <div className="mt-5 flex gap-3 rounded-2xl bg-white/[0.04] p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--brand-mint)" }} />
          <p className="text-sm leading-relaxed text-fan-secondary" data-testid="text-thankyou-cert">
            Your free, personalized GoodDeed® certificate
            {certNum != null ? (
              <>
                {" "}
                <span className="font-semibold text-fan-primary">#{certNum}</span>
              </>
            ) : null}{" "}
            is ready to download — open the{" "}
            <MoreHorizontal className="inline h-4 w-4 align-text-bottom" aria-label="more menu" /> menu
            on this album anytime.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold"
          style={{ backgroundColor: "var(--brand-mint)", color: "var(--brand-bg)" }}
          data-testid="button-start-listening"
        >
          Start listening
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function AlbumDetail({
  albumId,
  notifyOnly = false,
  publicPreview,
}: {
  albumId?: string;
  notifyOnly?: boolean;
  // Task #1784 — the pre-launch preview surfaces. "notify" = /hope (fan early
  // access, email capture); "buy" = /staging (family review, walks the buy
  // flow to the Stripe card screen). Undefined elsewhere so normal owned/store
  // album views are untouched.
  publicPreview?: "notify" | "buy";
} = {}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  // /hope leads with the notify (email-capture) flow; /staging stays buy-
  // enabled. Fold the notify preview into the existing notifyOnly path so the
  // child surfaces keep their current notify wiring.
  const effectiveNotifyOnly = notifyOnly || publicPreview === "notify";
  // Surface choice is width-only so an iPad running the native app gets the
  // SAME desktop chrome (left rail + hero + tracklist) it gets in a desktop
  // browser. This mirrors `useDesktopShell`, which already lets the
  // storefront/Collection rail show on native iPad — without this the iPad
  // app dropped to the phone shell the instant a fan opened an album, even
  // though every other tab kept the rail ("it's like I'm going to the
  // iPhone"). App Review 3.1.1 stays satisfied because the desktop surface
  // hides every purchase CTA when `buyEnabled` is false (native), exactly
  // like the mobile shell: the Buy pill is gated on `onBuyBundle`, the
  // signed-cert add-on chip on `signedCertPriceCents`, and BuySheet on
  // `buyEnabled`. Native iPhone keeps the mobile shell purely on width
  // (<768px), TARGETED_DEVICE_FAMILY="1,2" notwithstanding.
  const surface = isDesktop ? (
    <AlbumDetailDesktop
      albumId={albumId}
      notifyOnly={effectiveNotifyOnly}
      publicPreview={publicPreview}
    />
  ) : (
    <AlbumDetailMobile
      albumId={albumId}
      notifyOnly={effectiveNotifyOnly}
      publicPreview={publicPreview}
    />
  );
  // FanPreviewProvider keeps the fan-preview lens wiring intact (read via
  // useFanPreview, still toggleable through the `?fan=1` URL flag); the visible
  // floating toggle pill has been removed.
  return (
    <FanPreviewProvider>
      <PreviewModeBanner />
      {surface}
      <PurchaseThankYouModal albumId={albumId} />
    </FanPreviewProvider>
  );
}

// Task #1766 — staged-launch review banner. When the operator's "See Preview
// Flow" link planted a preview pass (sessionStorage, via #previewpass=), the
// reviewer is walking the real buyer experience on a not-yet-live release.
// Make that unmistakable and remind them checkout is disabled — the server
// also hard-rejects any checkout that carries the pass, so this is purely a UX
// signal, never the enforcement.
function PreviewModeBanner() {
  if (!hasPreviewPass()) return null;
  return (
    <div
      className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 px-3 py-1.5 text-center text-xs font-semibold"
      style={{ backgroundColor: "var(--brand-mint)", color: "var(--brand-bg)" }}
      data-testid="banner-preview-mode"
    >
      <Eye className="w-3.5 h-3.5 shrink-0" />
      <span>Preview mode — this release isn’t live yet. Checkout is disabled.</span>
    </div>
  );
}

// `albumId` lets a host-aware caller (the store launch storefront) render a
// specific release without the id living in the URL; deep links via
// /album/:id keep flowing through useParams.
function AlbumDetailMobile({
  albumId,
  notifyOnly = false,
  publicPreview,
}: { albumId?: string; notifyOnly?: boolean; publicPreview?: "notify" | "buy" }) {
  const params = useParams<{ id: string }>();
  const id = albumId ?? params.id;
  const _recordRecent = useRecordRecent();
  const [, navigate] = useLocation();
  const { playSong, currentSong, isPlaying, togglePlay, playNext, playLast, addToQueue, queue, currentIndex, previewMode, setPreviewMode, currentTime } = usePlayer();
  const isOwnedRaw = useAlbumOwnership(id);
  // Task #909 — is this album an *active* admin-granted preview (vs a real
  // owned/comp copy)? Drives the [Demo] GoodDeed cert. Server already
  // excludes expired previews from /api/my-albums.
  const { data: myAlbumsForPreview } = useQuery<Array<{ albumId: string; isPreview?: boolean }> | null>({
    queryKey: ["/api/my-albums"],
  });
  const isPreviewAlbum = !!id && (myAlbumsForPreview ?? []).some((a) => a.albumId === id && a.isPreview);
  // Bill's own accounts (admin sessions + a small email allowlist) are
  // exempted from preview-first "for now" so they hear full-length tracks
  // on every album — including ones shared to an account that doesn't own
  // them. Temporary until the real ownership pipeline lands (Phase 4).
  const fullPlaybackAccessRaw = useFullPlaybackAccess();
  // On web (buyEnabled) the album is in preview-first mode when the fan
  // hasn't bought it yet — every play triggers the 30s-per-track preview
  // session instead of full-track playback (matching the AlbumDetail-
  // Desktop branch). On iOS native (buyEnabled=false) we keep the in-app
  // behavior since IAP isn't wired and the player is for owned content.
  // Full-playback accounts are treated like owners here.
  // "View as a fan" lens: when a privileged operator flips it on, force the
  // page to render exactly as a non-owner visitor would see it.
  const { fanView } = useFanPreview();
  const isOwned = fanView ? false : isOwnedRaw;
  const fullPlaybackAccess = fanView ? false : fullPlaybackAccessRaw;
  const previewFirst = buyEnabled && !isOwned && !fullPlaybackAccess;
  // Task #1734 — purchase-funnel "locked unlock" presentation (get./store.
  // host, web only, not owned). The MY player never sets this so it stays
  // 100% unchanged.
  const lockedPreview = previewFirst && isPurchaseFunnelHost();
  const queueHasUpcoming = queue.length - currentIndex - 1 > 0;
  const { user, updateProfile } = useAuth();
  const favSongs = useFavoriteSongs();
  const [showCert, setShowCert] = useState(false);
  // Task #44 — opens the Buy bottom sheet (format picker + signed-cert
  // add-on + embedded Stripe Checkout). `?buy=1` in the URL auto-opens
  // it so the Login bounce-back lands directly on the format picker.
  const [showBuySheet, setShowBuySheet] = useState(() => { if (!buyEnabled) return false;
    // Task #1755 — the campaign fan link is notify-only: never auto-open the
    // Buy sheet from a stray ?buy=1 marker, there's no checkout for fans.
    if (notifyOnly) return false;
    if (typeof window === "undefined") return false;
    return new URL(window.location.href).searchParams.get("buy") === "1";
  });
  // Task #1816 — the campaign offer flow can pre-select the signed-cert upgrade
  // before handing off to the Buy sheet. (Quantity/gift selections are
  // editorial only and are re-collected on the Stripe screen by design.)
  const [buySheetSignedDefault, setBuySheetSignedDefault] = useState(false);
  // Task #1766 — the offer modal is the on-demand "Get Notified" capture
  // (opened from the transport's Get Notified CTA). Task #1784 — on the public
  // preview surfaces (/hope, /staging) it auto-opens on arrival so the page
  // reads like the real player with the offer fronting it.
  const [showOfferModal, setShowOfferModal] = useState(!!publicPreview);
  const [singleCertNum, setSingleCertNum] = useState<number | null>(null);
  const [provenanceCertNum, setProvenanceCertNum] = useState<number | null>(null);
  const [showOwnership, setShowOwnership] = useState(false);
  const [shareToast, setShareToast] = useState("");
  const [showPlaylistPicker, setShowPlaylistPicker] = useState<Song | null>(null);
  const [showAlbumPlaylistPicker, setShowAlbumPlaylistPicker] = useState(false);
  // Task #734 — stream-elsewhere handoff. When a fan taps a "Stream this"
  // control and hasn't chosen a service yet, we stash the candidate links +
  // a search query (artist + title) + subtitle and open the picker. Every
  // service can always hand off: a stored deep link when we have one, a
  // per-service search otherwise (Task #861).
  const [streamPicker, setStreamPicker] = useState<{
    links: StreamLinks;
    searchQuery: string;
    subtitle?: string;
  } | null>(null);
  const [songMenuFor, setSongMenuFor] = useState<{ song: Song; rect: DOMRect } | null>(null);
  const [creditsForSong, setCreditsForSong] = useState<Song | null>(null);
  const [showAlbumCredits, setShowAlbumCredits] = useState(false);
  const [instrumentSheet, setInstrumentSheet] = useState<{ instrument: Instrument; tuningNotes?: string; attribution?: { personId: string; songId: string } } | null>(null);
  const [inAppBrowser, setInAppBrowser] = useState<{ url: string; title: string; logoUrl?: string } | null>(null);
  // Wrap setInAppBrowser so every in-app browser open from a vendor row
  // also fires gear_vendor_clicked. Centralising it here keeps the two
  // call-sites (Gear tab + Vendor profile) in sync and prevents drift
  // if a third entry point is added later.
  const openVendorInAppBrowser = (b: { url: string; title: string; logoUrl?: string }) => {
    try {
      const domain = new URL(b.url).hostname.replace(/^www\./, "");
      track("gear_vendor_clicked", { vendorName: b.title, vendorDomain: domain, url: b.url });
    } catch {}
    setInAppBrowser(b);
  };
  const [showDescription, setShowDescription] = useState(false);
  const [vendorSheet, setVendorSheet] = useState<{ vendor: InstrumentVendor; instrument: Instrument } | null>(null);
  const [bookmarkedInstruments, setBookmarkedInstruments] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("gt:bookmarked-instruments");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const toggleBookmarkInstrument = (id: string) => {
    setBookmarkedInstruments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { window.localStorage.setItem("gt:bookmarked-instruments", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };
  // Mirrors the instrument-bookmark store. Persisted client-only via
  // localStorage — same pattern as favorites/downloads/instruments.
  const [bookmarkedVendors, setBookmarkedVendors] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("gt:bookmarked-vendors");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const toggleBookmarkVendor = (id: string) => {
    setBookmarkedVendors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { window.localStorage.setItem("gt:bookmarked-vendors", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };
  const [downloadedSongs, setDownloadedSongs] = useState<Set<string>>(new Set());

  // Source-of-truth for base album + tracklist is the API (so CMS edits and
  // newly-created albums show up here, including inside the /admin live
  // preview iframe). Static `musicData` is used only as enrichment for
  // fields the DB schema doesn't store yet (videos/photos/owned-cert numbers
  // /credits — those land when their CMS UIs do).
  type ApiAlbum = {
    id: string;
    title: string;
    artist: string;
    artwork: string;
    year: number | null;
    type: "Single" | "Duo" | "EP" | "LP";
    description: string | null;
    isExplicit: boolean;
    goodTunesReleaseDate: string | null;
    streamingReleaseDate: string | null;
    // Task #1078 — Apple-style album footer fields.
    originalReleaseDate: string | null;
    copyrightLine: string | null;
    // Task #1158 — per-album footer copyright symbol (℗ vs ©).
    copyrightSymbol: string | null;
    // Album-level streaming handoff links (Task #734 / #816).
    spotifyUrl: string | null;
    appleMusicUrl: string | null;
    tidalUrl: string | null;
    qobuzUrl: string | null;
    deezerUrl: string | null;
    pandoraUrl: string | null;
    // Task #970 — clean per-release share slug (get.goodtunes.music/<slug>).
    shareSlug: string | null;
    // Denormalized record-label entity (or null). Comes from the album's
    // LEFT JOIN on `labels` so we render name/logo without a second fetch.
    label: {
      id: string;
      name: string;
      logoUrl: string | null;
      websiteUrl: string | null;
    } | null;
    songs: {
      id: string;
      albumId: string;
      title: string;
      trackNumber: number;
      duration: number;
      lyrics: string | null;
      audioUrl: string | null;
      // WebVTT-derived per-line timing uploaded via Admin. When present,
      // Player.tsx uses these timestamps instead of auto-distributing the
      // plain-text `lyrics` field across `duration`.
      syncedLyrics: { timeMs: number; text: string }[] | null;
      isExplicit: boolean;
      // Task #734 — stream-elsewhere track + handoff links.
      streamOnly: boolean;
      spotifyTrackUrl: string | null;
      appleMusicTrackUrl: string | null;
    }[];
  };
  const { data: apiAlbum, isLoading: isAlbumLoading } = useQuery<ApiAlbum>({
    queryKey: ["/api/albums", id],
    enabled: !!id,
    // The global default is `staleTime: Infinity`, so once a fan client loads
    // an album it never refetches and never sees later admin edits (e.g. a
    // rename). Force a fresh read on every visit to this page so a normal
    // navigation back reflects the current admin title/metadata without a
    // hard reload. Scoped to this query — the global default is unchanged.
    //
    // Task #1784 — EXCEPT on the public preview surfaces (/hope, /staging).
    // There the route's by-slug resolve already primed this exact cache key
    // with the full payload; an "always" refetch fires a fresh GET that
    // returns null on a 401 (logged-out reviewer) for a beat, flashing the
    // "couldn't find that album" screen before the cache wins. Trust the
    // primed payload: no stale read, no refetch, no flash.
    staleTime: publicPreview ? Infinity : 0,
    refetchOnMount: publicPreview ? false : "always",
  });
  // Task #1766 — the Buy CTA price must read from the active SKU/buy-options
  // (e.g. a 7" single at $25.00), NOT the legacy albums.price_cents column,
  // which can be a stale placeholder (Hope's is 25¢). Mirrors the desktop
  // page's buy-options fetch; shares the same cache key.
  const { data: buyOptions } = useQuery<{ skus?: { priceCents: number }[] }>({
    queryKey: ["/api/albums", id, "buy-options"],
    enabled: !!id && buyEnabled && !isOwned,
    staleTime: 60_000,
  });
  const buyPriceCents = ((): number | null => {
    const prices = (buyOptions?.skus ?? [])
      .map((s) => s.priceCents)
      .filter((n): n is number => typeof n === "number" && n > 0);
    return prices.length ? Math.min(...prices) : ((apiAlbum as any)?.priceCents ?? null);
  })();
  const staticAlbum = ALBUMS.find((a) => a.id === id);
  // Task #530 — stamp the album into fan recents whenever the
  // resolved record changes (mount, switch albums via internal links,
  // back/forward). Fire-and-forget; failure does not block render.
  useEffect(() => {
    if (!apiAlbum?.id) return;
    _recordRecent({
      entityKind: "album",
      entityId: apiAlbum.id,
      title: apiAlbum.title,
      subtitle: apiAlbum.artist,
      thumbUrl: apiAlbum.artwork ?? null,
      href: `/album/${apiAlbum.id}`,
    });
  }, [apiAlbum?.id, apiAlbum?.title, apiAlbum?.artist, apiAlbum?.artwork, _recordRecent]);
  const album: Album | undefined = useMemo(() => {
    if (apiAlbum) {
      return {
        ...(staticAlbum ?? ({} as Album)),
        id: apiAlbum.id,
        title: apiAlbum.title,
        artist: apiAlbum.artist,
        artwork: apiAlbum.artwork,
        year: apiAlbum.year ?? staticAlbum?.year ?? 0,
        type: apiAlbum.type,
        description: apiAlbum.description ?? staticAlbum?.description ?? "",
        isExplicit: apiAlbum.isExplicit,
        spotifyUrl: apiAlbum.spotifyUrl ?? staticAlbum?.spotifyUrl ?? null,
        appleMusicUrl: apiAlbum.appleMusicUrl ?? staticAlbum?.appleMusicUrl ?? null,
        // Task #816 — the static musicData catalog has no entries for the new
        // four services, so these come from the API row only.
        tidalUrl: apiAlbum.tidalUrl ?? null,
        qobuzUrl: apiAlbum.qobuzUrl ?? null,
        deezerUrl: apiAlbum.deezerUrl ?? null,
        pandoraUrl: apiAlbum.pandoraUrl ?? null,
        shareSlug: apiAlbum.shareSlug ?? null,
      };
    }
    return staticAlbum;
  }, [apiAlbum, staticAlbum]);
  const songs: Song[] = useMemo(() => {
    if (apiAlbum) {
      return apiAlbum.songs
        .slice()
        .sort((a, b) => a.trackNumber - b.trackNumber)
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
          streamOnly: !!s.streamOnly,
          spotifyTrackUrl: s.spotifyTrackUrl ?? null,
          appleMusicTrackUrl: s.appleMusicTrackUrl ?? null,
        }));
    }
    return album ? getSongsByAlbum(id) : [];
  }, [apiAlbum, album, id]);

  // SuperCredits™ — fetch every song's credits for this album in one round-trip.
  // SongCreditsSheet + the album credits sheet render from the resolved maps below;
  // the static `TRACK_CREDITS` / `PEOPLE` / `INSTRUMENTS` seed is kept as a
  // graceful fallback for songs that haven't been migrated into the DB yet.
  type ApiAlbumProductionCredit = {
    id: string;
    albumId: string;
    personId: string | null;
    name: string;
    role: string;
    position: number;
    person: ApiPerson | null;
  };
  const { data: apiAlbumCredits } = useQuery<{
    bySongId: Record<string, ApiSongCredits>;
    production?: ApiAlbumProductionCredit[];
  }>({
    queryKey: ["/api/albums", id, "credits"],
    enabled: !!id,
  });
  const productionCredits = apiAlbumCredits?.production ?? [];
  // Apple's three broad credit groups (performers + writers + production)
  // aggregated from the full payload — drives both the album-credits sheet
  // and whether it has anything to show.
  const albumCreditGroups = useMemo(
    () => buildAlbumCreditGroups(apiAlbumCredits),
    [apiAlbumCredits],
  );
  const { creditsBySongId, peopleById, instrumentsById } = useMemo(() => {
    const peopleById = new Map<string, Person>();
    const instrumentsById = new Map<string, Instrument>();
    // Seed with the static rosters first so API-supplied rows override.
    for (const [pid, p] of Object.entries(PEOPLE)) peopleById.set(pid, p);
    for (const [iid, i] of Object.entries(INSTRUMENTS)) instrumentsById.set(iid, i);

    const creditsBySongId = new Map<string, TrackCredits>();
    if (apiAlbumCredits) {
      for (const r of apiAlbumCredits.production ?? []) {
        if (r.person) peopleById.set(r.person.id, normalizePerson(r.person));
      }
      for (const [songId, api] of Object.entries(apiAlbumCredits.bySongId)) {
        for (const w of api.writers) {
          if (w.person) peopleById.set(w.person.id, normalizePerson(w.person));
        }
        for (const p of api.performers) {
          if (p.person) peopleById.set(p.person.id, normalizePerson(p.person));
          if (p.instrument) instrumentsById.set(p.instrument.id, normalizeInstrument(p.instrument));
        }
        creditsBySongId.set(songId, {
          writers: api.writers.map((w) => ({ name: w.name, role: w.role, personId: w.personId ?? undefined })),
          performers: api.performers.map((p) => ({
            personId: p.personId ?? undefined,
            name: p.name,
            creditId: p.id,
            role: p.role,
            instrumentId: p.instrumentId ?? undefined,
            tuningNotes: p.tuningNotes ?? undefined,
          })),
        });
      }
    }
    return { creditsBySongId, peopleById, instrumentsById };
  }, [apiAlbumCredits]);
  // Helper: live API credits for a song, falling back to the static seed.
  const getCredits = (songId: string): TrackCredits | undefined =>
    creditsBySongId.get(songId) ?? getCreditsForSong(songId);

  // Task #734 — gating. The SuperCredits badge + per-track handoff only show
  // on albums that actually carry credits (any album-production credit, or
  // any writer/performer on any track). Albums with no credits get a single
  // album-level "open whole album on Spotify" handoff instead.
  const albumHasSuperCredits = useMemo(() => {
    if (productionCredits.length > 0) return true;
    for (const c of Array.from(creditsBySongId.values())) {
      if (c.writers.length > 0 || c.performers.length > 0) return true;
    }
    // Fall back to the static seed for songs not yet migrated into the DB.
    return songs.some((s) => {
      const c = getCreditsForSong(s.id);
      return !!c && ((c.writers?.length ?? 0) > 0 || (c.performers?.length ?? 0) > 0);
    });
  }, [productionCredits, creditsBySongId, songs]);
  // Every track is stream-only → GoodTunes hosts no master, so the primary
  // control becomes "Stream this".
  const isStreamOnlyAlbum =
    songs.length > 0 && songs.every((s) => !!s.streamOnly);


  // Hand the fan off to their chosen streaming service. If they've picked a
  // favorite, open it straight away — the exact release when we have a deep
  // link for that service, otherwise a per-service search built from the
  // artist + title (Task #861). With no saved favorite, open the picker
  // (first tap) which saves the choice for next time.
  const handleStreamHandoff = (
    links: StreamLinks,
    searchQuery: string,
    subtitle?: string,
  ) => {
    const fav =
      (user?.favoriteStreamingService as StreamingServiceId | undefined) ??
      getFavoriteStreamingService();
    if (fav) {
      openStreamLink(handoffUrlForService(fav, links, searchQuery));
      return;
    }
    setStreamPicker({ links, searchQuery, subtitle });
  };
  const handleStreamSong = (song: Song) => {
    handleStreamHandoff(
      { spotify: song.spotifyTrackUrl, apple: song.appleMusicTrackUrl },
      `${album?.artist ?? ""} ${song.title}`.trim(),
      song.title,
    );
  };
  const handleStreamAlbum = () => {
    // Prefer album-level links; fall back to the first stream-only track so a
    // credited album with only per-track links still has a working primary
    // control.
    const firstStream = songs.find((s) => s.streamOnly);
    handleStreamHandoff(
      {
        spotify: (album as any)?.spotifyUrl ?? firstStream?.spotifyTrackUrl ?? null,
        apple: (album as any)?.appleMusicUrl ?? firstStream?.appleMusicTrackUrl ?? null,
        // Task #816 — album-level only (no per-track columns for the new four).
        tidal: (album as any)?.tidalUrl ?? null,
        qobuz: (album as any)?.qobuzUrl ?? null,
        deezer: (album as any)?.deezerUrl ?? null,
        pandora: (album as any)?.pandoraUrl ?? null,
      },
      `${album?.artist ?? ""} ${album?.title ?? ""}`.trim(),
      album?.title,
    );
  };
  // Picker pick → save favorite (localStorage + customer profile) and stream
  // the exact release (deep link) or a per-service search fallback.
  const handlePickStreamService = (id: StreamingServiceId) => {
    setFavoriteStreamingService(id);
    if (user?.kind === "customer") {
      updateProfile({ favoriteStreamingService: id }).catch(() => {});
    }
    const picker = streamPicker;
    setStreamPicker(null);
    if (picker) {
      openStreamLink(handoffUrlForService(id, picker.links, picker.searchQuery));
    }
  };
  // Helper: every track on this album where this performer is credited.
  // Matches by personId when available, falling back to creditId so a
  // single unlinked snapshot row still resolves. Unlinked performers won't
  // cross-link across tracks (no shared identity), but they at least
  // resolve to their own track.
  const getTracksForPerformer = (sel: { personId?: string; creditId?: string }): Array<{ song: Song; performer: TrackPerformer }> => {
    // Defensive: with neither id supplied we'd match the first performer on
    // every song (because `undefined === undefined`), so bail early.
    if (!sel.personId && !sel.creditId) return [];
    const out: Array<{ song: Song; performer: TrackPerformer }> = [];
    for (const song of songs) {
      const c = getCredits(song.id);
      if (!c) continue;
      const perf = c.performers.find((p) =>
        sel.personId ? p.personId === sel.personId : p.creditId === sel.creditId,
      );
      if (perf) out.push({ song, performer: perf });
    }
    return out.sort((a, b) => a.song.trackNumber - b.song.trackNumber);
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollHideNav(scrollRef);
  const tint = "#00062B";
  const ownedNums = album?.ownedCertificates ?? (album?.certificateNumber ? [album.certificateNumber] : []);
  const isMulti = ownedNums.length > 1;

  // Task #1185 — resolve the fan's owning order(s) for this album so the
  // ⋯ menu can offer "Download GoodDeed PDF" (unsigned fan cert) when the
  // fan owns a downloadable GoodDeed. Mirrors the AlbumCard pattern; the
  // download hits the existing GET /api/orders/:orderId/cert/pdf endpoint.
  const { data: certOrdersData } = useQuery<OrderLite[]>({
    queryKey: ["/api/orders"],
    enabled: !!user,
  });
  const certOrders = (certOrdersData ?? []).filter(
    (o) => o.albumId === album?.id && !o.refundedAt && (o.cert || o.goodDeedNumber != null),
  );
  const pdfOrder = certOrders[0] ?? null;
  const [showCertPdf, setShowCertPdf] = useState(false);
  const openCertPdf = () => {
    if (!pdfOrder) return;
    setShowCertPdf(true);
  };

  const moreByArtist = album
    ? ALBUMS.filter((a) => a.artist === album.artist && a.id !== album.id)
    : [];

  // Mirror the Desktop preview-end → Buy prompt. When the fan
  // auditioned every preview track in sequence and the player ran out
  // of queue at the 30-sec cap, pop BuySheet so the moment closes with
  // a clear CTA. Pausing manually mid-preview does NOT trigger this —
  // the currentTime ≥ cap check filters that case out.
  const wasPlayingRef = useRef(isPlaying);
  useEffect(() => {
    const was = wasPlayingRef.current;
    wasPlayingRef.current = isPlaying;
    if (!buyEnabled || isOwned) return;
    // Task #1628 — during a "Sales Begin" locked preview the page is read-only;
    // never auto-open the Buy sheet when a preview ends.
    if (isSunrisePending(apiAlbum?.goodTunesReleaseDate)) return;
    if (!previewMode) return;
    if (!was || isPlaying) return;
    if (queue.length === 0) return;
    if (currentIndex !== queue.length - 1) return;
    if (currentTime < PREVIEW_CAP_SECONDS - 0.5) return;
    setShowBuySheet(true);
  }, [isPlaying, previewMode, queue.length, currentIndex, currentTime, isOwned, apiAlbum?.goodTunesReleaseDate]);

  // Leaving the album shouldn't leave preview-mode armed on whatever
  // the fan plays next (a downloaded album from their library, a
  // playlist, etc.) — clear it on unmount so the global player goes
  // back to full-track playback.
  const setPreviewModeRef = useRef(setPreviewMode);
  setPreviewModeRef.current = setPreviewMode;
  useEffect(() => {
    return () => {
      setPreviewModeRef.current(false);
    };
  }, []);

  useEffect(() => {
    if (album?.id) {
      track("album_viewed", { albumId: album.id, albumTitle: album.title, artistId: undefined });
    }
    setShowOwnership(false);
    setProvenanceCertNum(null);
    setSongMenuFor(null);
    setCreditsForSong(null);
    setInstrumentSheet(null);
    setShowDescription(false);
    if (album) {
      setDownloadedSongs(listDownloadedSongs(album.id));
    }
  }, [id, album]);

  // Tear down the whole SuperCredits sheet stack at once. The X on a
  // drill-down sheet (instrument / vendor / in-app browser) routes here so
  // it dismisses all the way back to the album, while the back chevron only
  // pops one level via each sheet's own onClose.
  const closeAllSheets = useCallback(() => {
    setInAppBrowser(null);
    setVendorSheet(null);
    setInstrumentSheet(null);
    setCreditsForSong(null);
  }, []);

  const toggleSongDownload = async (songId: string) => {
    if (!album) return;
    const wasDownloaded = downloadedSongs.has(songId);
    const song = songs.find((s) => s.id === songId);
    try {
      if (wasDownloaded) {
        await removeDownload(album.id, songId, song?.audioUrl ?? undefined);
      } else {
        await downloadSong(album.id, songId, song?.audioUrl ?? undefined);
      }
      setDownloadedSongs(listDownloadedSongs(album.id));
    } catch (e) {
      toast({ title: "Download failed", description: (e as Error).message });
    }
  };

  // Task #1628 — single source-of-truth lock: the Buy sheet must never stay
  // open during a "Sales Begin" locked preview, no matter how it was opened
  // (the `?buy=1` deep link initializes showBuySheet before the album data has
  // loaded, an in-flight sheet when a date is set, etc.). Force it closed.
  // MUST run before the loading / not-found guards below so the hook count
  // stays stable across the loading→loaded transition (otherwise React #310:
  // "rendered more hooks than during the previous render").
  useEffect(() => {
    // Task #1784 — the /staging dry-run keeps the Buy sheet open through to the
    // Stripe card screen even while the release is prepping (sunrise pending);
    // don't force it closed there.
    if (publicPreview === "buy") return;
    const pending =
      !isOwned && isSunrisePending(apiAlbum?.goodTunesReleaseDate);
    if (pending && showBuySheet) setShowBuySheet(false);
  }, [isOwned, apiAlbum?.goodTunesReleaseDate, showBuySheet, publicPreview]);

  // Task #1766 — the get-host preview/purchase page now renders the full rich
  // album layout (hero, metadata, tracklist, Videos) instead of fronting it
  // with an auto-opening offer modal. The offer modal stays mounted purely as
  // the on-demand "Get Notified" capture (opened from the transport row); it is
  // never auto-opened, so fans land on the real album page with a Buy / Get
  // Notified CTA.

  if (!album && isAlbumLoading) {
    return <AlbumDetailMobileSkeleton />;
  }

  if (!album) {
    return <AlbumNotFound variant="mobile" />;
  }

  const albumSongs = songs.map((s) => ({ ...s, album }));
  // Preview-first surfaces only the songs the artist marked as
  // previewable; full-ownership playback walks the entire tracklist.
  // A track the operator hid (isPreviewable === false) is treated as
  // unreleased for EVERYONE — even owners. It never enters the playback
  // queue, so Play / Shuffle skip straight to the next released track
  // (Apple's pre-release pattern). previewFirst still governs preview MODE
  // (30-sec auditions) via beginPlay, but no longer changes the track set.
  const playableAlbumSongs = albumSongs.filter(
    (s) => (s as any).isPreviewable !== false,
  );

  const beginPlay = (
    song: typeof albumSongs[0],
    list: typeof albumSongs,
  ) => {
    if (previewFirst) setPreviewMode(true);
    else if (previewMode) setPreviewMode(false);
    playSong(song, list);
  };

  const handlePlaySong = (song: typeof albumSongs[0]) => {
    const isCurrentSong = currentSong?.id === song.id;
    if (isCurrentSong) togglePlay();
    else beginPlay(song, playableAlbumSongs);
  };

  const handlePlayAll = () => {
    if (playableAlbumSongs.length > 0)
      beginPlay(playableAlbumSongs[0], playableAlbumSongs);
  };

  const handleShuffle = () => {
    if (playableAlbumSongs.length === 0) return;
    const shuffled = [...playableAlbumSongs].sort(() => Math.random() - 0.5);
    beginPlay(shuffled[0], shuffled);
  };

  const totalDuration = songs.reduce((acc, s) => acc + s.duration, 0);
  const totalMin = Math.floor(totalDuration / 60);
  const totalSec = totalDuration % 60;
  const runtime = `${totalMin} min${totalSec > 0 ? ` ${totalSec} sec` : ""}`;
  const hasMoreBy = moreByArtist.length > 0;

  const handleShare = async () => {
    // Task #1702 — shared native-first / copy-fallback share handler so the
    // phone, iPad, and desktop surfaces stay in lock-step (same link, share
    // text, and analytics). See client/src/lib/shareAlbum.ts.
    await shareAlbum(album, {
      onCopied: () => {
        setShareToast("Link copied");
        setTimeout(() => setShareToast(""), 2000);
      },
    });
  };
  const handleToggleAlbumDownload = async () => {
    const allDownloaded = songs.length > 0 && songs.every((s) => downloadedSongs.has(s.id));
    try {
      for (const s of songs) {
        if (allDownloaded) await removeDownload(album.id, s.id, s.audioUrl ?? undefined);
        else if (!downloadedSongs.has(s.id)) await downloadSong(album.id, s.id, s.audioUrl ?? undefined);
      }
      setDownloadedSongs(listDownloadedSongs(album.id));
    } catch (e) {
      toast({ title: "Download failed", description: (e as Error).message });
    }
  };
  const handleViewProvenance = () => {
    if (isMulti) setShowOwnership(true);
    else setProvenanceCertNum(ownedNums[0] ?? album.certificateNumber ?? 1);
  };
  const editorialPanel = hasMoreBy ? (
    <div
      className="mt-8 pt-7 pb-4"
      style={{
        background: "rgba(255,255,255,0.03)",
        borderTop: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {hasMoreBy && (
        <div>
          <button
            type="button"
            onClick={() => navigate(`/artist/${encodeURIComponent(album.artist)}`)}
            className="flex items-center gap-1 px-5 mb-3 active:opacity-70"
            data-testid="link-more-by-artist"
          >
            <h2 className="text-fan-primary text-xl font-bold tracking-tight">More By {album.artist}</h2>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-fan-secondary">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide px-5 pb-2" data-testid="section-more-by">
            {moreByArtist.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`/album/${a.id}`)}
                className="flex-shrink-0 flex flex-col text-left active:scale-[0.97] transition-transform"
                style={{ width: 130 }}
                data-testid={`more-by-${a.id}`}
              >
                <div className="w-full aspect-square rounded-2xl overflow-hidden" style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
                  <img src={a.artwork} alt={a.title} className="w-full h-full object-cover" />
                </div>
                <p className="text-fan-primary text-xs font-semibold leading-tight truncate mt-2">{a.title}</p>
                <p className="text-fan-secondary text-[11px] truncate mt-0.5">{a.year}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : null;

  // Task #1628 — staged release whose sales-begin (sunrise) date hasn't
  // arrived yet. Drives the disabled "Sales Begin {date}" buy pill + the
  // arrival modal. Owners never see the locked state. Date-driven, so the
  // page flips to live buy behavior automatically the day sales begin.
  const salesPending =
    !isOwned && isSunrisePending(apiAlbum?.goodTunesReleaseDate);
  // When sales are pending the locked pill MUST render even if the date can't
  // be formatted: a malformed-but-lexically-future ISO string makes
  // isSunrisePending() true while formatSalesBeginDate() returns null, which
  // would otherwise drop us back to the live Buy pill while onOpenBuy is a
  // no-op (salesPending early-return). Fall back to a generic "soon" so the
  // staged surface stays internally consistent.
  const salesBeginLabel = salesPending
    ? formatSalesBeginDate(apiAlbum?.goodTunesReleaseDate) ?? "soon"
    : null;

  return (
    <main className="h-screen w-full flex justify-center overflow-hidden relative">
      <section className="relative w-full h-screen text-fan-primary flex flex-col">
        <AlbumDetailMobileSurface
          scrollRef={scrollRef}
          album={{
            id: album.id,
            title: album.title,
            artist: album.artist,
            artwork: album.artwork,
            year: album.year,
            type: album.type,
            description: album.description,
            isExplicit: album.isExplicit,
            genre: album.genre,
            priceCents: buyPriceCents,
            originalReleaseDate: apiAlbum?.originalReleaseDate ?? null,
            copyrightLine: apiAlbum?.copyrightLine ?? null,
            copyrightSymbol: apiAlbum?.copyrightSymbol ?? null,
          }}
          songs={songs.map((s) => ({
            id: s.id,
            title: s.title,
            trackNumber: s.trackNumber,
            duration: s.duration,
            isExplicit: s.isExplicit,
            streamOnly: s.streamOnly,
            spotifyTrackUrl: s.spotifyTrackUrl,
            appleMusicTrackUrl: s.appleMusicTrackUrl,
            isPreviewable: (s as any).isPreviewable,
          }))}
          label={apiAlbum?.label ?? null}
          ownedNums={ownedNums}
          isOwned={isOwned}
          currentSongId={currentSong?.id ?? null}
          isPlaying={isPlaying}
          downloadedSongIds={downloadedSongs}
          favoriteSongIds={favSongs.set}
          nativeDownloadsEnabled={nativeDownloadsEnabled}
          hasAlbumCredits={productionCredits.length > 0}
          onOpenAlbumCredits={() => setShowAlbumCredits(true)}
          hasSuperCredits={albumHasSuperCredits}
          isStreamOnlyAlbum={isStreamOnlyAlbum}
          onStreamSong={(s) => {
            const full = songs.find((x) => x.id === s.id);
            if (full) handleStreamSong(full);
          }}
          onStreamAlbum={handleStreamAlbum}
          bonusSlot={<AlbumBonusContent albumId={album.id} locked={!isOwned} artist={album.artist} />}
          lineupSlot={<AlbumLineupRail albumId={album.id} onPickMember={(name) => navigate(`/artist/${encodeURIComponent(name)}`)} />}
          onBack={() => goBack(navigate)}
          onShare={handleShare}
          onOpenAlbumMenu={() => setSongMenuFor(null)}
          onPlayAll={handlePlayAll}
          onShuffle={handleShuffle}
          onPlaySong={(s) => {
            const full = songs.find((x) => x.id === s.id);
            if (full) handlePlaySong({ ...full, album });
          }}
          onOpenBuy={buyEnabled ? () => setShowBuySheet(true) : undefined}
          salesBeginLabel={salesBeginLabel}
          lockedPreview={lockedPreview}
          notifyOnly={notifyOnly}
          publicPreview={publicPreview}
          onGetNotified={() => setShowOfferModal(true)}
          onGetDetails={() => setShowOfferModal(true)}
          onToggleAlbumDownload={handleToggleAlbumDownload}
          onToggleSongDownload={(id) => toggleSongDownload(id)}
          onOpenSongMenu={(s, rect) => {
            const full = songs.find((x) => x.id === s.id);
            if (full) setSongMenuFor({ song: full, rect });
          }}
          onArtistClick={() => navigate(`/artist/${encodeURIComponent(album.artist)}`)}
          onExpandDescription={() => setShowDescription(true)}
          onViewCertificate={() => setShowCert(true)}
          onViewProvenance={handleViewProvenance}
          onAddAlbumToPlaylist={() => setShowAlbumPlaylistPicker(true)}
          onDownloadCert={pdfOrder ? openCertPdf : undefined}
        >
          {editorialPanel}
        </AlbumDetailMobileSurface>
        {/* legacy chrome removed — see AlbumDetailMobileSurface above */}

        {buyEnabled && salesBeginLabel && (
          <SalesBeginArrivalModal
            albumId={album.id}
            albumTitle={album.title}
            artist={album.artist}
            salesBeginLabel={salesBeginLabel}
          />
        )}

        <MiniPlayer />
        <BottomNav />

        {showBuySheet && !notifyOnly && (
          <BuySheet
            albumId={album.id}
            signedCertDefault={buySheetSignedDefault}
            onClose={() => {
              setShowBuySheet(false);
              setBuySheetSignedDefault(false);
              // Strip the ?buy=1 marker so a refresh doesn't keep
              // popping the sheet open after the fan closes it.
              try {
                const url = new URL(window.location.href);
                if (url.searchParams.get("buy") === "1") {
                  url.searchParams.delete("buy");
                  window.history.replaceState({}, "", url.toString());
                }
              } catch {}
            }}
          />
        )}

        {lockedPreview && (
          <LockedOfferModal
            open={showOfferModal}
            onClose={() => setShowOfferModal(false)}
            albumId={album.id}
            title={album.title}
            artist={album.artist}
            artworkUrl={album.artwork}
            priceCents={buyPriceCents}
            salesPending={salesPending}
            notifyOnly={notifyOnly}
            salesBeginLabel={salesBeginLabel}
            forceBuy={publicPreview === "buy"}
            accentMint={!!publicPreview}
            dismissLabel={publicPreview ? "Preview the Music" : undefined}
            onBuy={(opts) => {
              setShowOfferModal(false);
              setBuySheetSignedDefault(!!opts?.signedCert);
              setShowBuySheet(true);
            }}
            prefilledEmail={user?.email ?? null}
            source="get"
          />
        )}

        {showCertPdf && pdfOrder && (
          <CertPdfViewerSheet
            orderId={pdfOrder.id}
            filename={`GoodDeed-${album.title}.pdf`}
            onClose={() => setShowCertPdf(false)}
          />
        )}

        {showCert && (
          <GoodDeedCertificate
            album={album}
            ownerName={user?.displayName || "GoodTunes Fan"}
            identities={{
              realName: user?.realName ?? null,
              displayName: user?.displayName || "GoodTunes Fan",
              username: user?.username || "you",
            }}
            certificateNumber={singleCertNum ?? album.certificateNumber ?? 1}
            certificateNumbers={singleCertNum !== null ? [singleCertNum] : album.ownedCertificates}
            isPreview={isPreviewAlbum}
            onClose={() => { setShowCert(false); setSingleCertNum(null); }}
          />
        )}

        <AnimatePresence>
          {showPlaylistPicker && (
            <PlaylistPickerSheet
              songId={showPlaylistPicker.id}
              songTitle={showPlaylistPicker.title}
              onClose={() => setShowPlaylistPicker(null)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAlbumPlaylistPicker && (
            <PlaylistPickerSheet
              songIds={songs.map((s) => s.id)}
              songTitle={`${album.title} · ${songs.length} song${songs.length === 1 ? "" : "s"}`}
              heading="Add Album to Playlist"
              onClose={() => setShowAlbumPlaylistPicker(false)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {streamPicker && streamingHandoffEnabled && (
            <StreamServicePickerSheet
              available={STREAMING_SERVICES.map((s) => s.id)}
              subtitle={streamPicker.subtitle}
              onPick={handlePickStreamService}
              onClose={() => setStreamPicker(null)}
            />
          )}
        </AnimatePresence>

        {showDescription && album.description && (
          <AlbumDescriptionSheet
            album={album}
            onClose={() => setShowDescription(false)}
          />
        )}

        {provenanceCertNum !== null && (
          <ProvenanceSheet
            onViewGoodDeed={(n) => { setProvenanceCertNum(null); setShowCert(true); setSingleCertNum(n); }}
            album={album}
            ownerName={user?.displayName || "GoodTunes Fan"}
            certNum={provenanceCertNum}
            onClose={() => setProvenanceCertNum(null)}
          />
        )}

        {showOwnership && (
          <OwnershipSheet
            album={album}
            ownerName={user?.displayName || "GoodTunes Fan"}
            onClose={() => setShowOwnership(false)}
            onSelectCert={(n) => { setShowOwnership(false); setProvenanceCertNum(n); }}
          />
        )}

        {songMenuFor && (() => {
          const s = songMenuFor.song;
          return (
            <SongActionPopover
              song={s}
              album={album}
              anchorRect={songMenuFor.rect}
              isFavorite={favSongs.has(s.id)}
              onToggleFavorite={() => favSongs.toggle(s.id)}
              onShare={async () => {
                const url = `${window.location.origin}/album/${album.id}`;
                try {
                  if (navigator.share) await navigator.share({ title: s.title, text: `${s.title} — ${album.artist}`, url });
                  else {
                    await navigator.clipboard.writeText(url);
                    setShareToast("Link copied");
                    setTimeout(() => setShareToast(""), 2000);
                  }
                } catch {}
              }}
              onAddToPlaylist={() => { setSongMenuFor(null); setShowPlaylistPicker(s); }}
              onPlayNext={() => { playNext({ ...s, album }); setShareToast("Playing next"); setTimeout(() => setShareToast(""), 1600); }}
              onAddToQueue={() => { addToQueue({ ...s, album }); setShareToast("Added to Queue"); setTimeout(() => setShareToast(""), 1600); }}
              onPlayLast={() => { playLast({ ...s, album }); setShareToast("Added to queue"); setTimeout(() => setShareToast(""), 1600); }}
              queueHasUpcoming={queueHasUpcoming}
              onViewCredits={() => {
                setSongMenuFor(null);
                setCreditsForSong(s);
                track("credits_opened", { songId: s.id, albumId: album.id });
              }}
              hasCredits={!!getCredits(s.id)}
              onClose={() => setSongMenuFor(null)}
            />
          );
        })()}

        {/* Only one SuperCredits sheet is mounted at a time (instrument > performer > credits)
            so we don't stack multiple aria-modal dialogs simultaneously. */}
        {inAppBrowser ? (
          <InAppBrowserSheet
            url={inAppBrowser.url}
            title={inAppBrowser.title}
            logoUrl={inAppBrowser.logoUrl}
            onClose={() => setInAppBrowser(null)}
            onCloseAll={closeAllSheets}
          />
        ) : vendorSheet ? (
          <VendorSheet
            vendor={vendorSheet.vendor}
            instrument={vendorSheet.instrument}
            isBookmarked={!!vendorSheet.vendor.vendorId && bookmarkedVendors.has(vendorSheet.vendor.vendorId)}
            onToggleBookmark={() => vendorSheet.vendor.vendorId && toggleBookmarkVendor(vendorSheet.vendor.vendorId)}
            onOpenInAppBrowser={openVendorInAppBrowser}
            onOpenInstrument={(inst) => {
              // Close the vendor sheet and swap in the InstrumentSheet for
              // the tapped gear row. The vendor stays in scope (no
              // attribution shown) because we're navigating *from* a
              // vendor profile rather than a song credit.
              setVendorSheet(null);
              setInstrumentSheet({ instrument: inst });
            }}
            onClose={() => setVendorSheet(null)}
            onCloseAll={closeAllSheets}
          />
        ) : instrumentSheet ? (
          <InstrumentSheet
            instrument={instrumentSheet.instrument}
            tuningNotes={instrumentSheet.tuningNotes}
            attribution={instrumentSheet.attribution}
            isBookmarked={bookmarkedInstruments.has(instrumentSheet.instrument.id)}
            onToggleBookmark={() => toggleBookmarkInstrument(instrumentSheet.instrument.id)}
            onOpenInAppBrowser={openVendorInAppBrowser}
            onOpenVendor={(vendor) => setVendorSheet({ vendor, instrument: instrumentSheet.instrument })}
            onClose={() => setInstrumentSheet(null)}
            onCloseAll={closeAllSheets}
          />
        ) : creditsForSong ? (
          <SongCreditsSheet
            songId={creditsForSong.id}
            songTitle={creditsForSong.title}
            albumId={album.id}
            albumTitle={album.title}
            artist={album.artist}
            credits={songCreditsPayload(getCredits(creditsForSong.id), creditsForSong.id, peopleById)}
            rigs={apiAlbumCredits?.bySongId?.[creditsForSong.id]?.rigs}
            album={album}
            resolveInstrument={(iid) => (iid ? instrumentsById.get(iid) : undefined)}
            songHeader={{
              artwork: album.artwork,
              songTitle: creditsForSong.title,
              artistName: album.artist,
              albumName: album.title,
              dateLabel: album.year ? String(album.year) : undefined,
              isPlaying: currentSong?.id === creditsForSong.id && isPlaying,
              onTogglePlay: () => {
                if (currentSong?.id === creditsForSong.id) {
                  togglePlay();
                } else {
                  const s = { ...creditsForSong, album };
                  playSong(s, [s]);
                }
              },
              onOpenAlbum: () => setCreditsForSong(null),
            }}
            resolvePersonContext={(personId, role) => {
              const person = peopleById.get(personId);
              if (!person) return null;
              // The contextual song is always the track the credits were
              // opened from, so the person profile leads with what they
              // played on THIS song.
              const lookupId = person.id.startsWith("unlinked-") ? undefined : person.id;
              return {
                person,
                role,
                song: creditsForSong,
                currentSongCredits: getCredits(creditsForSong.id),
                otherTracks: getTracksForPerformer({ personId: lookupId }).filter(
                  ({ song: s }) => s.id !== creditsForSong.id,
                ),
              };
            }}
            onClose={() => setCreditsForSong(null)}
          />
        ) : null}

        {showAlbumCredits && albumCreditGroups.length > 0 && (
          <AlbumCreditsSheet
            albumId={album.id}
            albumTitle={album.title}
            artist={album.artist}
            credits={apiAlbumCredits ?? {}}
            album={album}
            resolveInstrument={(iid) => (iid ? instrumentsById.get(iid) : undefined)}
            resolvePersonContext={(personId, role) => {
              const person = peopleById.get(personId);
              if (!person) return null;
              // Lead with the song this person actually performs/writes on so
              // the profile opens with context. Production-only credits
              // (Mastered by, A&R, …) won't match any track — those open from
              // album + person alone, leading with About and the role as the
              // subtitle, instead of dead-ending.
              const ctxSong = songs.find((s) => {
                const c = getCredits(s.id);
                return (
                  c?.performers.some((p) => p.personId === personId) ||
                  c?.writers.some((w) => w.personId === personId)
                );
              });
              const lookupId = person.id.startsWith("unlinked-") ? undefined : person.id;
              return {
                person,
                role,
                song: ctxSong,
                currentSongCredits: ctxSong ? getCredits(ctxSong.id) : undefined,
                otherTracks: ctxSong
                  ? getTracksForPerformer({ personId: lookupId }).filter(
                      ({ song: s }) => s.id !== ctxSong.id,
                    )
                  : [],
              };
            }}
            onClose={() => setShowAlbumCredits(false)}
          />
        )}

        {shareToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-full text-white text-sm font-medium" style={{ background: "rgba(20,22,30,0.95)", backdropFilter: "blur(20px)", boxShadow: "0 12px 32px rgba(0,0,0,0.5)" }}>
            {shareToast}
          </div>
        )}
      </section>
    </main>
  );
}

export function ProvenanceSheet({ album, ownerName, certNum, onClose, onViewGoodDeed }: { album: Album; ownerName: string; certNum: number; onClose: () => void; onViewGoodDeed?: (n: number) => void }) {
  const events = [
    { date: "2025-11-21", actor: ownerName, action: "Acquired via secondary transfer", color: "#4AFFCA" },
    { date: "2024-08-04", actor: "Original Owner", action: `Purchased from ${album.artist}`, color: "#319ED8" },
    { date: "2024-03-12", actor: "GoodTunes® Created", action: "Certificate #" + certNum + " created", color: "#7F10A7" },
  ];
  return (
    <SheetShell ariaLabel={`Provenance for ${album.title} certificate ${certNum}`} testId="sheet-provenance" onClose={onClose}>
        <div className="flex items-center justify-between px-5 mb-4 flex-shrink-0">
          <div>
            <p className="text-fan-faint text-[10px] font-bold uppercase tracking-widest">Digital Provenance</p>
            <h3 className="text-fan-primary font-semibold text-base mt-0.5">{album.title}</h3>
          </div>
          <SheetClose data-testid="button-close-provenance" />
        </div>

        <div className="px-5 mb-4 flex-shrink-0">
          <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: "rgba(74,255,202,0.08)", border: "1px solid rgba(74,255,202,0.2)" }}>
            <img src={album.artwork} alt={album.title} className="w-12 h-12 rounded-xl object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-fan-primary text-sm font-semibold truncate">Certificate #{certNum}</p>
              <p className="text-fan-secondary text-xs mt-0.5 truncate">Currently held by {ownerName}</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: "rgba(74,255,202,0.18)", color: "#4AFFCA" }}>VERIFIED</span>
          </div>
          {onViewGoodDeed && (
            <button
              type="button"
              onClick={() => onViewGoodDeed(certNum)}
              className="w-full mt-2.5 flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold text-white active:opacity-70 transition-opacity"
              style={{ background: "rgba(49,158,216,0.14)", border: "1px solid rgba(49,158,216,0.28)" }}
              data-testid="button-view-this-gooddeed"
            >
              <span>View GoodDeed® No. {certNum.toString().padStart(2, "0")}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2.2" strokeLinecap="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-5">
          <p className="text-fan-faint text-[10px] font-bold uppercase tracking-widest mb-3">Ownership chain</p>
          <div className="relative pl-5">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />
            {events.map((e, i) => (
              <div key={i} className="relative pb-5 last:pb-0">
                <div className="absolute -left-[18px] top-1 w-3 h-3 rounded-full" style={{ background: e.color, boxShadow: `0 0 0 3px rgba(0,6,43,1), 0 0 12px ${e.color}55` }} />
                <p className="text-fan-faint text-[11px]">{e.date}</p>
                <p className="text-fan-primary text-sm font-semibold mt-0.5">{e.actor}</p>
                <p className="text-fan-secondary text-xs mt-0.5">{e.action}</p>
              </div>
            ))}
          </div>
        </div>
    </SheetShell>
  );
}

export function OwnershipSheet({
  album,
  ownerName,
  onClose,
  onSelectCert,
}: {
  album: Album;
  ownerName: string;
  onClose: () => void;
  onSelectCert: (n: number) => void;
}) {
  const owned = album.ownedCertificates ?? [];
  const purchasesByNum = new Map((album.purchases ?? []).map((p) => [p.num, p]));
  return (
    <SheetShell ariaLabel="Ownership" testId="sheet-ownership" onClose={onClose}>
        <div className="flex items-center justify-between px-5 mb-1 flex-shrink-0">
          <div>
            <p className="text-fan-faint text-[10px] font-bold uppercase tracking-widest">Ownership</p>
            <h3 className="text-fan-primary font-semibold text-base mt-0.5">{album.title}</h3>
          </div>
          <SheetClose data-testid="button-close-ownership" />
        </div>
        <p className="px-5 text-fan-secondary text-xs mb-4">Held by {ownerName} · {owned.length} cop{owned.length === 1 ? "y" : "ies"}</p>

        <div className="px-5 mb-2 flex items-center text-[10px] font-bold uppercase tracking-widest text-fan-faint">
          <div className="w-16">No.</div>
          <div className="flex-1">Price</div>
          <div className="w-24 text-right">Date</div>
          <div className="w-5" />
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-3">
          {owned.map((num, i) => {
            const p = purchasesByNum.get(num);
            return (
              <button
                key={num}
                type="button"
                onClick={() => onSelectCert(num)}
                className="w-full flex items-center px-2 py-3.5 rounded-xl text-left active:bg-white/5 transition-colors"
                style={{ background: i % 2 === 0 ? "rgba(49,158,216,0.07)" : "transparent" }}
                data-testid={`row-cert-${num}`}
              >
                <div className="w-16 text-fan-primary text-sm font-semibold">#{num}</div>
                <div className="flex-1 text-fan-primary text-sm">{p ? `$${p.price.toFixed(2)}` : "—"}</div>
                <div className="w-24 text-right text-fan-secondary text-xs">{p?.date ?? "—"}</div>
                <div className="w-5 flex justify-end text-fan-faint">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>

        <p className="px-5 mt-3 text-fan-faint text-[11px] text-center">Tap a row to view that copy's provenance.</p>
    </SheetShell>
  );
}

// ────────────────────── Song ⋯ popover (Apple-style) ──────────────────────
// Light glass popover anchored to the tapped ⋯ button. Opens to the left
// of the trigger and chooses up/down placement based on available space,
// matching iOS's Apple Music context menu.

function SongActionPopover({
  song,
  album,
  anchorRect,
  isFavorite,
  onToggleFavorite,
  onShare,
  onAddToPlaylist,
  onPlayNext,
  onAddToQueue,
  onPlayLast,
  onViewCredits,
  onClose,
  queueHasUpcoming,
  hasCredits,
}: {
  song: Song;
  album: Album;
  anchorRect: DOMRect;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onShare: () => void;
  onAddToPlaylist: () => void;
  onPlayNext: () => void;
  onAddToQueue: () => void;
  onPlayLast: () => void;
  onViewCredits: () => void;
  onClose: () => void;
  queueHasUpcoming: boolean;
  hasCredits: boolean;
}) {
  const POP_W = 244;
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; placement: "below" | "above" } | null>(null);

  // Animate in once mounted (so transform-origin → scale feels anchored).
  const [shown, setShown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id); }, []);

  // Esc-to-close + dismiss on any scroll (anchorRect is captured at click
  // time, so once the underlying list scrolls the popover would detach from
  // its trigger — Apple closes its context menu on scroll for the same
  // reason).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onScroll = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true); // capture to catch nested scrollers
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  // Position after layout — needs the panel's measured height.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const GAP = 8;
    const SAFE = 12;
    // Right-edge aligned with trigger's right edge, but kept inside the viewport.
    const rawLeft = anchorRect.right - POP_W;
    const left = Math.max(SAFE, Math.min(rawLeft, vw - POP_W - SAFE));
    // Prefer below; flip above if it would clip.
    const fitsBelow = anchorRect.bottom + GAP + h + SAFE <= vh;
    const top = fitsBelow ? anchorRect.bottom + GAP : Math.max(SAFE, anchorRect.top - GAP - h);
    setPos({ top, left, placement: fitsBelow ? "below" : "above" });
  }, [anchorRect]);

  const close = (run?: () => void) => () => { run?.(); onClose(); };

  // Apple-style row: black icon on left, label right. Tight spacing.
  const Row = ({ label, icon, onClick, testId, disabled }: { label: string; icon: ReactNode; onClick: () => void; testId: string; disabled?: boolean }) => (
    <button
      type="button"
      role="menuitem"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 ${disabled ? "opacity-40" : "active:bg-black/[0.06]"}`}
      data-testid={testId}
    >
      <span className="text-[15px] text-black truncate">{label}</span>
      <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-black">{icon}</span>
    </button>
  );

  const Divider = () => <div className="h-px bg-black/10 mx-3" />;

  // transform-origin so the scale-in feels rooted near the trigger
  const originY = pos?.placement === "above" ? "bottom" : "top";

  return (
    <div
      className="fixed inset-0 z-[75]"
      role="presentation"
      data-testid="popover-song-actions"
      onClick={onClose}
    >
      {/* Subtle scrim — Apple barely dims; keeps the row context visible. */}
      <div className="absolute inset-0 bg-black/15" />
      <div
        ref={panelRef}
        role="menu"
        aria-label={`Options for ${song.title}`}
        onClick={(e) => e.stopPropagation()}
        className="absolute"
        style={{
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          width: POP_W,
          background: "rgba(245, 245, 247, 0.82)",
          backdropFilter: "blur(28px) saturate(180%)",
          WebkitBackdropFilter: "blur(28px) saturate(180%)",
          borderRadius: 14,
          boxShadow: "0 12px 40px rgba(0,0,0,0.32), 0 1px 0 rgba(255,255,255,0.4) inset",
          overflow: "hidden",
          transformOrigin: `right ${originY}`,
          transform: shown ? "scale(1)" : "scale(0.92)",
          opacity: shown ? 1 : 0,
          transition: "transform 160ms cubic-bezier(0.2, 0.9, 0.3, 1.2), opacity 120ms ease-out",
          visibility: pos ? "visible" : "hidden",
        }}
      >
        {/* Top: Favorite + Share — Apple's two-up icon-over-label header */}
        <div className="flex items-stretch">
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={isFavorite}
            onClick={() => { onToggleFavorite(); }}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-3 active:bg-black/[0.06]"
            data-testid="button-popover-favorite"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill={isFavorite ? "rgba(0,0,0,0.55)" : "none"} stroke={isFavorite ? "rgba(0,0,0,0.55)" : "#000"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span className="text-[12px] text-black">{isFavorite ? "Favorited" : "Favorite"}</span>
          </button>
          <div className="w-px bg-black/10 my-2" />
          <button
            type="button"
            role="menuitem"
            onClick={close(onShare)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-3 active:bg-black/[0.06]"
            data-testid="button-popover-share"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4" />
              <path d="M8 8l4-4 4 4" />
              <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
            <span className="text-[12px] text-black">Share</span>
          </button>
        </div>
        <Divider />
        <Row
          label="Add to Playlist"
          testId="row-popover-add-playlist"
          onClick={close(onAddToPlaylist)}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="14" y2="6" />
              <line x1="3" y1="12" x2="14" y2="12" />
              <line x1="3" y1="18" x2="10" y2="18" />
              <line x1="18" y1="9" x2="18" y2="21" />
              <line x1="12" y1="15" x2="24" y2="15" />
            </svg>
          }
        />
        <Divider />
        <Row
          label="Play Next"
          testId="row-popover-play-next"
          onClick={close(onPlayNext)}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="14" y2="6" />
              <line x1="3" y1="12" x2="14" y2="12" />
              <line x1="3" y1="18" x2="14" y2="18" />
              <polygon points="18,7 22,12 18,17" fill="currentColor" stroke="none" />
            </svg>
          }
        />
        {/* Apple shows "Add to Queue" only after an Up Next list exists.
            We mirror that: render it when the user has staged at least one
            song after the current track. */}
        {queueHasUpcoming && (
          <Row
            label="Add to Queue"
            testId="row-popover-add-to-queue"
            onClick={close(onAddToQueue)}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="14" y2="6" />
                <line x1="3" y1="12" x2="14" y2="12" />
                <line x1="3" y1="18" x2="14" y2="18" />
                <line x1="19" y1="9" x2="19" y2="15" />
                <line x1="16" y1="12" x2="22" y2="12" />
              </svg>
            }
          />
        )}
        <Row
          label="Play Last"
          testId="row-popover-play-last"
          onClick={close(onPlayLast)}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="14" y2="12" />
              <line x1="3" y1="18" x2="14" y2="18" />
              <polygon points="18,15 22,18 18,21" fill="currentColor" stroke="none" />
            </svg>
          }
        />
        <Divider />
        <Row
          label="View Credits"
          testId="row-popover-credits"
          disabled={!hasCredits}
          onClick={close(onViewCredits)}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v.01M11 12h1v4h1" />
            </svg>
          }
        />
      </div>
    </div>
  );
}

// ──────────────────────────── SuperCredits™ ────────────────────────────

function PersonAvatar({ person, size = 44 }: { person: Person; size?: number }) {
  const initials = person.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  if (person.photoUrl) {
    return (
      <img
        src={person.photoUrl}
        alt={person.name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold"
      style={{
        width: size,
        height: size,
        background: "#319ED8",
        fontSize: Math.round(size * 0.38),
      }}
      aria-hidden="true"
    >
      {initials || "•"}
    </div>
  );
}

// Apple-Music-style 2-line clamp on the album description with an inline
// "...more" affordance that fades into the truncated last line. Tapping
// either the text or the "...more" pill opens AlbumDescriptionSheet with
// the full copy. Overflow is detected with a layout effect (compares
// scrollHeight to clientHeight) and re-checked whenever the text or
// container width changes, so the pill never appears for short copy.
function ClampedDescription({ text, onExpand }: { text: string; onExpand: () => void }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const check = () => {
      // rAF to defer until after layout — avoids a stale measurement on the
      // initial paint in some Safari builds. Tracked so unmount can cancel
      // the pending callback and avoid a state update on a dead component.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!ref.current) return;
        setOverflowing(ref.current.scrollHeight - ref.current.clientHeight > 1);
      });
    };
    check();
    // ResizeObserver isn't on older Safari/WebKit. Guard + fall back to
    // window resize so we still recompute when the viewport rotates.
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(check);
      ro.observe(el);
      return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    }
    window.addEventListener("resize", check);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", check); };
  }, [text]);

  // The whole truncated paragraph is a button when it overflows so keyboard
  // users get the same affordance as the visible "…more" pill. When the
  // copy fits in 2 lines we render a plain <p> so there's no fake button.
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
        {/* "more" affordance — sits on the trailing edge of the
            clamped paragraph. The gradient fully opaques about 30px
            before the label so the underlying text never bleeds INTO
            the word "more" (no "amore" / "ymore" collisions). Label
            uses the brand blue — same color the artist name uses on
            the album header. */}
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

function AlbumDescriptionSheet({ album, onClose }: { album: Album; onClose: () => void }) {
  return (
    <SheetShell ariaLabel={`${album.title} — about`} testId="sheet-album-description" onClose={onClose}>
      <SheetHeader eyebrow="About" title={album.title} subtitle={album.artist} onClose={onClose} />
      <div className="px-5 pb-2">
        <p className="text-fan-primary text-[15px] leading-relaxed whitespace-pre-wrap" data-testid="text-album-description-full">
          {album.description}
        </p>
      </div>
    </SheetShell>
  );
}

export function SheetShell({
  ariaLabel,
  testId,
  onClose,
  variant = "bottom",
  contained = false,
  children,
}: {
  ariaLabel: string;
  testId: string;
  onClose: () => void;
  variant?: "bottom" | "full" | "fixed";
  /* When true, a `full` sheet renders as an in-card slide-in pane —
     `absolute` to its positioned ancestor (the desktop credits card)
     instead of `fixed` to the viewport, sliding in horizontally like the
     person view rather than up from the bottom. The fan rails + dimmed
     album page stay visible behind the card. Only meaningful with
     `variant="full"`; ignored otherwise. */
  contained?: boolean;
  children: ReactNode;
}) {
  const reduce = !!useReducedMotion();
  const [closing, setClosing] = useState(false);
  // Drill-down sheets pass a `final` action to the X so it tears the whole
  // sheet stack down once the slide-out finishes; everything else just runs
  // the sheet's own `onClose` (pop one level).
  const finalRef = useRef<(() => void) | null>(null);

  // Self-managed close: every dismiss path (X, back chevron, Escape,
  // backdrop tap) flips `closing`, which retargets the slide + scrim fade.
  // `onAnimationComplete` then runs the real unmount callback. This lets
  // call sites keep their plain `{cond && <Sheet/>}` mount — no per-site
  // AnimatePresence needed — while still animating the close.
  const dismiss = useCallback((final?: () => void) => {
    finalRef.current = final ?? null;
    setClosing(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    // Lock the underlying page from scrolling while the sheet is open.
    // Without this, iOS passes touch-drag through to the AlbumDetail page
    // beneath the sheet, and the blurred peek at the top of the viewport
    // visibly shifts as the body scrolls under the user's thumb.
    const prevOverflow = document.body.style.overflow;
    const prevTouch = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouch;
    };
  }, [dismiss]);

  const isFull = variant === "full";
  const isFixed = variant === "fixed";

  // Container classes per variant.
  // - `full`   : edge-to-edge full-viewport sheet, child manages scroll.
  // - `fixed`  : bottom sheet with locked outer height (`h-[88vh]`), child
  //              manages its own internal scroll. Used by the performer
  //              sheet so the sheet's outline doesn't jump between tabs.
  // - `bottom` : classic bottom sheet, the container itself scrolls.
  let containerClass: string;
  if (isFull) {
    containerClass = "relative w-full z-10 h-full flex flex-col overflow-hidden";
  } else if (isFixed) {
    containerClass = "relative w-full max-w-[390px] z-10 rounded-t-3xl pt-3 h-[88vh] flex flex-col overflow-hidden";
  } else {
    containerClass = "relative w-full max-w-[390px] z-10 rounded-t-3xl pt-3 pb-8 max-h-[88vh] overflow-y-auto scrollbar-hide";
  }

  // In-card mode: pin to the positioned ancestor (the credits card) and
  // slide horizontally so the gear stack reads like the person drill-down,
  // not a bottom sheet. Otherwise the sheet is fixed to the viewport.
  const offscreen = contained ? { x: "100%" } : { y: "100%" };
  const onscreen = contained ? { x: 0 } : { y: 0 };

  return (
    <SheetDismissProvider value={dismiss}>
      <div
        className={`${contained ? "absolute inset-0 z-30" : "fixed inset-0 z-[78]"} flex justify-center ${isFull ? "items-stretch" : "items-end"}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-testid={testId}
      >
        {/* Backdrop dim — only behind a bottom-sheet. Full-screen sheets cover
            the entire viewport edge-to-edge, Apple-style, so no backdrop is
            needed. A solid dim (no live blur) — backdrop-filter re-samples on
            every paint frame, which made the visible peek above the sheet
            wobble during touch-drag on iOS. The sheet background below is
            already ~98% opaque so the underlying page barely shows through. */}
        {!isFull && (
          <motion.div
            className="absolute inset-0 bg-black/70"
            onClick={() => dismiss()}
            initial={{ opacity: 0 }}
            animate={{ opacity: closing ? 0 : 1 }}
            transition={scrimFade(reduce)}
          />
        )}
        <motion.div
          className={containerClass}
          style={{ background: "rgb(20, 24, 48)", boxShadow: isFull ? "none" : "0 -16px 40px rgba(0,0,0,0.6)" }}
          initial={offscreen}
          animate={closing ? offscreen : onscreen}
          transition={closing ? sheetClose(reduce) : sheetOpen(reduce)}
          onAnimationComplete={() => { if (closing) (finalRef.current ?? onClose)(); }}
        >
          {!isFull && <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />}
          {children}
        </motion.div>
      </div>
    </SheetDismissProvider>
  );
}

export function SheetHeader({ eyebrow, title, subtitle, onClose }: { eyebrow?: string; title: string; subtitle?: string; onClose: () => void }) {
  const dismiss = useSheetDismiss();
  return (
    <div className="flex items-start gap-3 px-5 pt-1 pb-4">
      <div className="flex-1 min-w-0">
        {eyebrow && <p className="text-[color:var(--brand-blue)] text-xs font-semibold uppercase tracking-wider mb-1">{eyebrow}</p>}
        <h2 className="text-fan-primary text-[22px] font-bold leading-tight tracking-tight">{title}</h2>
        {subtitle && <p className="text-[15px] mt-1 leading-snug" style={{ color: "rgba(235,235,245,0.55)" }}>{subtitle}</p>}
      </div>
      <SheetClose
        onClick={dismiss ? () => dismiss() : onClose}
        className="-m-1.5"
        data-testid="button-sheet-close-x"
      />
    </div>
  );
}

// Drop Apple Music's boilerplate "Listen to music by … on Apple Music."
// sentence wherever it appears. The scraper used to capture this as a "bio";
// the server now strips it at import and a one-time backfill nulls existing
// rows, but this is a defensive render-time guard so any boilerplate that
// slips through never shows on the fan sheet. Returns "" when nothing of
// substance survives. (Task #1710)
export function stripAppleMusicBoilerplate(s: string | null | undefined): string {
  if (!s) return "";
  const out = s
    .replace(/listen to music by .+? on apple music\.?/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return /[a-z0-9]/i.test(out) ? out : "";
}

// A credited *instrument* role — guitar, bass, drums, keys, horns, … — as
// opposed to vocals or production/engineering credits, which aren't gear.
// Drives both the unlinked-instrument list on the person sheet and the
// "is this profile worth opening" richness check. (Task #1710)
export function roleIsInstrumentCredit(role: string | null | undefined): boolean {
  if (!role) return false;
  const r = role.trim().toLowerCase();
  if (!r) return false;
  // Vocals are a performance but not an instrument we'd open a gear page for.
  if (/vocal|\bvox\b|backing vocal|lead vocal|\bsing(s|er|ing)?\b|choir|harmon(y|ies)\b/.test(r)) return false;
  // Production / engineering / writing credits — not instruments.
  if (/produc|engineer|mixed|mixing|master(ed|ing)\b|programming|arrang|\ba&r\b|recording|composer|composit|songwrit|writ|lyric|featuring|remix|edit\b|technician|assistant|director|management|manager|design|photograph|artwork|liner/.test(r)) return false;
  if (/^(other|misc|miscellaneous|performer|musician|instruments?)$/.test(r)) return false;
  return true;
}

// A short category label for an unlinked instrument *role* (we have no
// linked Instrument record, so we infer it from the role text). Falls back
// to null when nothing matches — callers default to "Instrument". (Task #1710)
export function shortCategoryForRole(role: string | null | undefined): string | null {
  if (!role) return null;
  const r = role.toLowerCase();
  if (/bass/.test(r)) return "Bass";
  if (/guitar|guitarra/.test(r)) return "Guitar";
  if (/drum/.test(r)) return "Drums";
  if (/percussion|congas|bongos|tambourine|shaker|timbales|cajon|vibraphone|marimba|glockenspiel/.test(r)) return "Percussion";
  if (/piano|keyboard|organ|synth|rhodes|wurlitzer|mellotron|clavinet|accordion|harpsichord/.test(r)) return "Keys";
  if (/violin|viola|cello|fiddle|double bass|upright bass|\bstrings?\b/.test(r)) return "Strings";
  if (/banjo|mandolin|ukulele|harp\b|sitar|dulcimer|lap steel|pedal steel|dobro|lute|oud/.test(r)) return "Strings";
  if (/sax|trumpet|trombone|\bhorn|flute|clarinet|oboe|bassoon|brass|woodwind|harmonica|cornet|tuba|flugelhorn/.test(r)) return "Horns";
  return null;
}

export function PerformerProfileContent({
  person,
  song,
  album,
  contextLabel,
  selectedCreditId,
  currentSongCredits,
  otherTracks,
  resolveInstrument,
  onOpenInstrument,
}: {
  person: Person;
  // The song we're focused on — drives "instruments on this song". Optional:
  // production-only credits (Mastered by / A&R) and the desktop credits sheet
  // open this from album + person alone, with no track context.
  song?: Song;
  album: Album;
  // Subtitle shown under the name when there's no song context — e.g. the
  // credited role ("Mastered by"). Ignored when a song is present (the song
  // title leads instead).
  contextLabel?: string;
  // Stable credit-row id of the originally-clicked row. Required to match
  // unlinked (personId === null) snapshot performers; ignored when the
  // resolved person has a real id.
  selectedCreditId?: string;
  currentSongCredits: TrackCredits | undefined;
  // Other tracks on this album where this performer is credited (already filtered, sorted by parent).
  otherTracks: Array<{ song: Song; performer: TrackPerformer }>;
  resolveInstrument: (instrumentId?: string) => Instrument | undefined;
  onOpenInstrument: (instrument: Instrument, tuningNotes?: string, attribution?: { personId: string; songId: string }) => void;
}) {
  // Apple-Music single-scroll profile: no tab strip. The bio sits inline,
  // collapsed to a few lines, and tapping the avatar or name expands it.
  const [bioExpanded, setBioExpanded] = useState(false);

  // What this performer played on the CURRENT song. Match by personId when
  // we have a real one; otherwise fall back to the credit row id so unlinked
  // snapshot rows still resolve to their own performance.
  const isSynthetic = person.id.startsWith("unlinked-");
  const onThisSong = (currentSongCredits?.performers ?? []).filter((p) =>
    isSynthetic ? p.creditId === selectedCreditId : p.personId === person.id,
  );

  // Catalog-wide credits for this person — backs the Music tab's "Other
  // albums" section and the Gear tab's distinct-instruments list. Disabled
  // for synthetic snapshot rows (no real personId), in which case the sheet
  // falls back to current-album-only data already in props.
  type PersonProfile = {
    person: { id: string; name: string; photoUrl: string | null; bio: string | null };
    tracks: Array<{
      performerId: string;
      songId: string; songTitle: string; trackNumber: number;
      albumId: string; albumTitle: string; albumArtwork: string;
      albumArtist: string; albumYear: number | null;
      role: string; tuningNotes: string | null;
      instrumentId: string | null; instrumentName: string | null;
      instrumentShortCategory: string | null; instrumentCategory: string | null;
      instrumentPhotoUrl: string | null;
    }>;
  };
  const { data: profile } = useQuery<PersonProfile>({
    queryKey: ["/api/people", person.id, "profile"],
    enabled: !isSynthetic,
  });

  // Group catalog tracks by album for the Music tab. Current album is
  // intentionally surfaced first (as a dedicated "On this album" block)
  // so the contextual info from props still leads the view.
  const otherAlbums = (() => {
    if (!profile) return [] as Array<{
      albumId: string; albumTitle: string; albumArtwork: string;
      albumYear: number | null;
      tracks: PersonProfile["tracks"];
    }>;
    const byAlbum = new Map<string, { albumId: string; albumTitle: string; albumArtwork: string; albumYear: number | null; tracks: PersonProfile["tracks"] }>();
    for (const t of profile.tracks ?? []) {
      if (t.albumId === album.id) continue;
      const entry = byAlbum.get(t.albumId) ?? {
        albumId: t.albumId,
        albumTitle: t.albumTitle,
        albumArtwork: t.albumArtwork,
        albumYear: t.albumYear,
        tracks: [],
      };
      entry.tracks.push(t);
      byAlbum.set(t.albumId, entry);
    }
    return Array.from(byAlbum.values());
  })();

  // Distinct gear this person has played. Prefers the catalog-wide profile
  // payload when available; falls back to current-album data (this song +
  // other tracks on this album) for synthetic/unlinked snapshot rows that
  // don't have a real personId to look up. Same shape either way so the
  // render path is identical.
  const gear = (() => {
    // `tappable` rows link to a real Instrument (gear page); unlinked
    // instrument *credits* (a named role like "Pedal Steel" with no linked
    // Instrument record) still surface, named with their category, but as a
    // plain non-tappable row. (Task #1710)
    type GearEntry = { id: string; name: string; shortCategory: string | null; category: string | null; photoUrl: string | null; tappable: boolean; tracks: Set<string> };
    const byInstrument = new Map<string, GearEntry>();
    // De-dupe an unlinked instrument credit by its role text.
    const addRole = (role: string | null | undefined, songId: string) => {
      if (!roleIsInstrumentCredit(role)) return;
      const name = role!.trim();
      const key = `role:${name.toLowerCase()}`;
      if (byInstrument.has(key) && byInstrument.get(key)!.tappable) return;
      const entry = byInstrument.get(key) ?? {
        id: key,
        name,
        shortCategory: shortCategoryForRole(name) ?? "Instrument",
        category: null,
        photoUrl: null,
        tappable: false,
        tracks: new Set<string>(),
      };
      entry.tracks.add(songId);
      byInstrument.set(key, entry);
    };
    if (profile) {
      for (const t of profile.tracks ?? []) {
        if (!t.instrumentId) continue;
        const entry = byInstrument.get(t.instrumentId) ?? {
          id: t.instrumentId,
          name: t.instrumentName ?? "Gear",
          shortCategory: t.instrumentShortCategory,
          category: t.instrumentCategory,
          photoUrl: t.instrumentPhotoUrl,
          tappable: true,
          tracks: new Set<string>(),
        };
        entry.tracks.add(t.songId);
        byInstrument.set(t.instrumentId, entry);
      }
      // Unlinked instrument credits — named roles with no linked Instrument.
      for (const t of profile.tracks ?? []) {
        if (t.instrumentId) continue;
        addRole(t.role, t.songId);
      }
    } else {
      // Fallback: this album only. Combine onThisSong (current song) +
      // otherTracks (other tracks on this album), de-duped by instrumentId.
      const add = (instrumentId: string | null | undefined, songId: string) => {
        if (!instrumentId) return;
        const inst = resolveInstrument(instrumentId);
        if (!inst) return;
        const entry = byInstrument.get(instrumentId) ?? {
          id: instrumentId,
          name: inst.name,
          shortCategory: inst.shortCategory ?? null,
          category: inst.category ?? null,
          photoUrl: inst.photoUrl ?? null,
          tappable: true,
          tracks: new Set<string>(),
        };
        entry.tracks.add(songId);
        byInstrument.set(instrumentId, entry);
      };
      for (const p of onThisSong) add(p.instrumentId, song?.id ?? "");
      for (const { song: s, performer } of otherTracks) add(performer.instrumentId, s.id);
      // Unlinked instrument credits from the same album-scoped performers.
      for (const p of onThisSong) if (!p.instrumentId) addRole(p.role, song?.id ?? "");
      for (const { song: s, performer } of otherTracks) if (!performer.instrumentId) addRole(performer.role, s.id);
    }
    return Array.from(byInstrument.values())
      .map(({ tracks, ...rest }) => ({ ...rest, trackCount: tracks.size }))
      // Linked (tappable) gear leads, then by track count, then name.
      .sort((a, b) => Number(b.tappable) - Number(a.tappable) || b.trackCount - a.trackCount || a.name.localeCompare(b.name));
  })();

  // Open an instrument by id, even when it lives on an album outside the
  // current page's static instrument map. Falls back to a minimal synthetic
  // Instrument built from the profile-row metadata so cross-album rows in
  // Music + Gear stay tappable. `songId` lets the InstrumentSheet anchor
  // its "played on" context to the right track.
  const openByIdWithFallback = (
    instrumentId: string,
    fallback: { name: string; category: string | null; shortCategory: string | null; photoUrl: string | null },
    tuningNotes: string | null | undefined,
    songIdForContext: string,
  ) => {
    const resolved = resolveInstrument(instrumentId);
    if (resolved) {
      onOpenInstrument(resolved, tuningNotes ?? undefined, { personId: person.id, songId: songIdForContext });
      return;
    }
    // The fan-side Instrument interface (musicData.ts) uses optional
    // `string | undefined` fields, while the profile payload comes through
    // as `string | null` from the DB — coerce nulls to undefined.
    const synthetic: Instrument = {
      id: instrumentId,
      name: fallback.name,
      category: fallback.category ?? "Gear",
      shortCategory: fallback.shortCategory ?? undefined,
      photoUrl: fallback.photoUrl ?? undefined,
    };
    onOpenInstrument(synthetic, tuningNotes ?? undefined, { personId: person.id, songId: songIdForContext });
  };

  const bio = stripAppleMusicBoilerplate(profile?.person.bio ?? person.bio) || null;
  // Discography lower down: this album's other tracks + other albums.
  const hasDiscography = otherTracks.length > 0 || otherAlbums.length > 0;

  return (
    <>
      {/* HERO — centered avatar + name + contextual subtitle. Tapping
              the avatar or the name reveals/expands the bio inline. */}
          <div className="flex flex-col items-center text-center px-5 pt-3 pb-4">
            <button
              type="button"
              onClick={() => bio && setBioExpanded((v) => !v)}
              aria-expanded={bio ? bioExpanded : undefined}
              className={`rounded-full ${bio ? "active:opacity-80 transition-opacity" : "cursor-default"}`}
              data-testid="button-performer-avatar"
            >
              <PersonAvatar person={person} size={120} />
            </button>
            <button
              type="button"
              onClick={() => bio && setBioExpanded((v) => !v)}
              aria-expanded={bio ? bioExpanded : undefined}
              className={`mt-4 max-w-full ${bio ? "active:opacity-80 transition-opacity" : "cursor-default"}`}
              data-testid="text-performer-name"
            >
              <h2 className="text-fan-primary text-[26px] font-bold leading-tight tracking-tight">{person.name}</h2>
            </button>
            {(song || contextLabel) && (
              <p className="text-fan-secondary text-[14px] mt-1.5 truncate max-w-full" data-testid="text-performer-context">
                {song ? <>On &ldquo;{song.title}&rdquo;</> : contextLabel}
              </p>
            )}
          </div>

          {/* BIO — inline, Apple-style. Collapsed to a few lines by default;
              tapping the avatar/name (or the text) expands it. */}
          {bio && (
            <div className="px-5 pb-1">
              <p
                onClick={() => setBioExpanded((v) => !v)}
                className={`text-fan-secondary text-[15px] leading-[1.55] whitespace-pre-line ${bioExpanded ? "" : "line-clamp-3"}`}
                data-testid="text-performer-bio"
              >
                {bio}
              </p>
            </div>
          )}

          {/* GEAR — distinct instruments this person played, as tappable
              cards with a very faint translucent fill (no bright outlines).
              Each opens the InstrumentSheet (maker + resellers). */}
          {gear.length > 0 && (
            <section className="pt-4">
              <h3 className="px-5 pb-2 text-fan-primary text-[22px] font-bold leading-tight tracking-tight">Gear</h3>
              <div className="px-5 space-y-2">
                {gear.map((g) => {
                  // Shared row contents. Tappable (linked-Instrument) rows
                  // get the trailing chevron + open the gear page; unlinked
                  // instrument credits render the same row, named with their
                  // category, but with no chevron and no tap. (Task #1710)
                  const inner = (
                    <>
                      <div
                        className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                        style={{ background: "rgba(255,255,255,0.06)" }}
                      >
                        {g.photoUrl ? (
                          <img src={g.photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="text-fan-faint" aria-hidden="true">
                            <path d="M9 18V5l12-2v13" />
                            <circle cx="6" cy="18" r="3" />
                            <circle cx="18" cy="16" r="3" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-fan-primary text-[15px] font-medium truncate">{g.name}</p>
                        <p className="text-fan-secondary text-[12px] truncate">
                          {g.shortCategory ?? g.category ?? "Gear"}
                        </p>
                      </div>
                      {g.tappable && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-fan-faint flex-shrink-0" aria-hidden="true">
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      )}
                    </>
                  );
                  return g.tappable ? (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => openByIdWithFallback(
                        g.id,
                        { name: g.name, category: g.category, shortCategory: g.shortCategory, photoUrl: g.photoUrl },
                        null,
                        song?.id ?? "",
                      )}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors active:bg-white/[0.08]"
                      style={{ background: "rgba(255,255,255,0.04)" }}
                      data-testid={`button-performer-gear-${g.id}`}
                    >
                      {inner}
                    </button>
                  ) : (
                    <div
                      key={g.id}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left"
                      style={{ background: "rgba(255,255,255,0.04)" }}
                      data-testid={`text-performer-gear-${g.id}`}
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* DISCOGRAPHY — quieter section lower down: this person's other
              tracks on this album, then other albums from the catalog. */}
          {otherTracks.length > 0 && (
            <section className="pt-5">
              <h3 className="px-5 pb-2 text-fan-primary text-[18px] font-bold leading-tight tracking-tight">Also on {album.title}</h3>
              <div className="pb-1">
                {otherTracks.map(({ song: s, performer }) => {
                  const instrument = resolveInstrument(performer.instrumentId);
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 px-5 py-3 active:bg-white/5"
                      data-testid={`row-performer-track-${s.id}`}
                    >
                      {/* Track number color matches the album track-list (rgba(255,255,255,0.32)) */}
                      <span className="w-6 text-[15px] tabular-nums text-right flex-shrink-0" style={{ color: "rgba(255,255,255,0.32)" }}>{s.trackNumber}</span>
                      <p className="flex-1 min-w-0 text-fan-primary text-[15px] truncate">{s.title}</p>
                      {instrument && (
                        <button
                          type="button"
                          onClick={() => onOpenInstrument(instrument, performer.tuningNotes, { personId: performer.personId ?? person.id, songId: s.id })}
                          className="flex items-center gap-1 pl-2 -mr-1 active:opacity-70 flex-shrink-0"
                          data-testid={`button-performer-track-instrument-${s.id}`}
                        >
                          <span className="text-fan-secondary text-[14px]">{instrument.shortCategory ?? instrument.category}</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-fan-faint" aria-hidden="true">
                            <path d="M9 6l6 6-6 6" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Other albums — from the catalog-wide profile fetch. Each album
              renders as a header (cover + title + year) followed by its
              track list, mirroring the album-page track row style. */}
          {otherAlbums.map((alb) => (
            <div key={alb.albumId} className="pt-3">
              <div className="flex items-center gap-3 px-5 pt-2 pb-2">
                <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 bg-white/5">
                  {alb.albumArtwork ? (
                    <img src={alb.albumArtwork} alt="" className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-fan-primary text-[15px] font-semibold truncate">{alb.albumTitle}</p>
                  <p className="text-fan-secondary text-[12px] truncate">
                    {alb.albumYear ? `${alb.albumYear} · ` : ""}{alb.tracks.length} track{alb.tracks.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              {alb.tracks.map((t) => (
                <div
                  key={t.performerId}
                  className="flex items-center gap-3 px-5 py-2.5 active:bg-white/5"
                  data-testid={`row-performer-other-track-${t.performerId}`}
                >
                  <span className="w-6 text-[15px] tabular-nums text-right flex-shrink-0" style={{ color: "rgba(255,255,255,0.32)" }}>{t.trackNumber}</span>
                  <p className="flex-1 min-w-0 text-fan-primary text-[15px] truncate">{t.songTitle}</p>
                  {t.instrumentId && (
                    <button
                      type="button"
                      onClick={() => openByIdWithFallback(
                        t.instrumentId!,
                        { name: t.instrumentName ?? "Gear", category: t.instrumentCategory, shortCategory: t.instrumentShortCategory, photoUrl: t.instrumentPhotoUrl },
                        t.tuningNotes,
                        t.songId,
                      )}
                      className="flex items-center gap-1 pl-2 -mr-1 active:opacity-70 flex-shrink-0"
                      data-testid={`button-performer-other-track-instrument-${t.performerId}`}
                    >
                      <span className="text-fan-secondary text-[14px]">{t.instrumentShortCategory ?? t.instrumentCategory}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-fan-faint" aria-hidden="true">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}

          {/* Empty state — only when there's truly nothing to show. */}
          {!bio && gear.length === 0 && !hasDiscography && (
            <p className="px-5 py-6 text-fan-secondary text-sm">No detailed credits yet for {person.name}.</p>
          )}
    </>
  );
}

// Returns true when this person has a real profile worth opening — a bio,
// any gear, or a track on another album. People who are only a name + photo
// (session players, assistant engineers) resolve to `false` so the credits
// list can render them as plain, non-tappable rows instead of dead-ending on
// an empty page (matching Apple Music, where such credits aren't links).
export function personProfileIsRich(
  profile: { person?: { bio?: string | null } | null; tracks?: Array<{ instrumentId?: string | null; albumId?: string | null; role?: string | null }> } | undefined,
  currentAlbumId: string | undefined,
): boolean {
  if (!profile) return false;
  // A bio counts only if it survives the Apple-Music-boilerplate strip.
  if (stripAppleMusicBoilerplate(profile.person?.bio)) return true;
  const tracks = profile.tracks ?? [];
  // Linked gear, an unlinked instrument credit, or a track on another album.
  return tracks.some((t) => !!t.instrumentId || roleIsInstrumentCredit(t.role) || (!!t.albumId && t.albumId !== currentAlbumId));
}

// Resolves a static instrument from the in-code seed map. Used by surfaces
// (the desktop credits modal) that host PerformerProfileContent without their
// own album-scoped instrument index.
export function resolveStaticInstrument(instrumentId?: string): Instrument | undefined {
  return instrumentId ? INSTRUMENTS[instrumentId] : undefined;
}

// The mobile SuperCredits performer sheet — wraps PerformerProfileContent in a
// bottom-sheet shell with its own pinned X. The desktop credits modal renders
// PerformerProfileContent inline instead (no shell), so the content had to be
// extracted out of this shell.
function PerformerSheet({
  person,
  song,
  album,
  contextLabel,
  selectedCreditId,
  currentSongCredits,
  otherTracks,
  resolveInstrument,
  onOpenInstrument,
  onClose,
}: {
  person: Person;
  song?: Song;
  album: Album;
  contextLabel?: string;
  selectedCreditId?: string;
  currentSongCredits: TrackCredits | undefined;
  otherTracks: Array<{ song: Song; performer: TrackPerformer }>;
  resolveInstrument: (instrumentId?: string) => Instrument | undefined;
  onOpenInstrument: (instrument: Instrument, tuningNotes?: string, attribution?: { personId: string; songId: string }) => void;
  onClose: () => void;
}) {
  return (
    <SheetShell ariaLabel={song ? `${person.name} on ${song.title}` : person.name} testId="sheet-performer" variant="fixed" onClose={onClose}>
      {/* Single Apple-Music-style scrollable profile. The X stays pinned
          top-right over the scroll; everything else lives in one column. */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        <SheetClose
          className="absolute top-1 right-4 z-10"
          data-testid="button-performer-close"
        />
        <div
          className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pt-16 pb-10"
          style={{ WebkitMaskImage: SHEET_TOP_FADE, maskImage: SHEET_TOP_FADE }}
          data-testid="region-performer-content"
        >
          <PerformerProfileContent
            person={person}
            song={song}
            album={album}
            contextLabel={contextLabel}
            selectedCreditId={selectedCreditId}
            currentSongCredits={currentSongCredits}
            otherTracks={otherTracks}
            resolveInstrument={resolveInstrument}
            onOpenInstrument={onOpenInstrument}
          />
        </div>
      </div>
    </SheetShell>
  );
}

// Self-contained instrument → vendor → in-app-browser drill-down stack with
// bookmark persistence. Extracted from PersonDetailSheet so both the mobile
// person sheet and the desktop credits modal can host PerformerProfileContent
// and share one gear sub-stack. `onCloseAll` is what the X inside any sub-sheet
// fires (it returns past the whole stack to wherever the host opened from);
// the back chevron in each sub-sheet still pops a single level.
//
// Returns `openInstrument` (wire to PerformerProfileContent's onOpenInstrument)
// and `overlay` — the currently-open sub-sheet, or null. The overlay must be
// rendered OUTSIDE any framer-transformed ancestor (a transform turns the
// sub-sheets' `position: fixed` into absolute), so the desktop modal renders it
// as a top-level sibling of its animated box.
export function usePersonGearDrilldown(
  onCloseAll: () => void,
  /* When `contained` is true the gear stack (instrument / vendor / in-app
     browser) renders as in-card slide-in panes for the desktop credits card
     instead of full-viewport overlays. The mobile album page omits it, so it
     defaults to the existing full-screen presentation. */
  opts?: { contained?: boolean },
): {
  openInstrument: (instrument: Instrument, tuningNotes?: string, attribution?: { personId: string; songId: string }) => void;
  overlay: React.ReactNode;
} {
  const contained = !!opts?.contained;
  const [instrumentSheet, setInstrumentSheet] = useState<{ instrument: Instrument; tuningNotes?: string; attribution?: { personId: string; songId: string } } | null>(null);
  const [vendorSheet, setVendorSheet] = useState<{ vendor: InstrumentVendor; instrument: Instrument } | null>(null);
  const [inAppBrowser, setInAppBrowser] = useState<{ url: string; title: string; logoUrl?: string } | null>(null);
  const openVendorInAppBrowser = (b: { url: string; title: string; logoUrl?: string }) => {
    try {
      const domain = new URL(b.url).hostname.replace(/^www\./, "");
      track("gear_vendor_clicked", { vendorName: b.title, vendorDomain: domain, url: b.url });
    } catch {}
    setInAppBrowser(b);
  };
  const [bookmarkedInstruments, setBookmarkedInstruments] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("gt:bookmarked-instruments");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const toggleBookmarkInstrument = (instrumentId: string) => {
    setBookmarkedInstruments((prev) => {
      const next = new Set(prev);
      if (next.has(instrumentId)) next.delete(instrumentId); else next.add(instrumentId);
      try { window.localStorage.setItem("gt:bookmarked-instruments", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };
  const [bookmarkedVendors, setBookmarkedVendors] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("gt:bookmarked-vendors");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const toggleBookmarkVendor = (vendorId: string) => {
    setBookmarkedVendors((prev) => {
      const next = new Set(prev);
      if (next.has(vendorId)) next.delete(vendorId); else next.add(vendorId);
      try { window.localStorage.setItem("gt:bookmarked-vendors", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  // Close-all dismisses the whole drill-down stack AND calls the host's
  // onCloseAll, so the X always returns past everything (back chevron still
  // pops one level).
  const closeAllSheets = () => {
    setInAppBrowser(null);
    setVendorSheet(null);
    setInstrumentSheet(null);
    onCloseAll();
  };

  const openInstrument = (instrument: Instrument, tuningNotes?: string, attribution?: { personId: string; songId: string }) =>
    setInstrumentSheet({ instrument, tuningNotes, attribution });

  let overlay: React.ReactNode = null;
  if (inAppBrowser) {
    overlay = (
      <InAppBrowserSheet
        url={inAppBrowser.url}
        title={inAppBrowser.title}
        logoUrl={inAppBrowser.logoUrl}
        onClose={() => setInAppBrowser(null)}
        onCloseAll={closeAllSheets}
        contained={contained}
      />
    );
  } else if (vendorSheet) {
    overlay = (
      <VendorSheet
        vendor={vendorSheet.vendor}
        instrument={vendorSheet.instrument}
        isBookmarked={!!vendorSheet.vendor.vendorId && bookmarkedVendors.has(vendorSheet.vendor.vendorId)}
        onToggleBookmark={() => vendorSheet.vendor.vendorId && toggleBookmarkVendor(vendorSheet.vendor.vendorId)}
        onOpenInAppBrowser={openVendorInAppBrowser}
        onOpenInstrument={(inst) => {
          setVendorSheet(null);
          setInstrumentSheet({ instrument: inst });
        }}
        onClose={() => setVendorSheet(null)}
        onCloseAll={closeAllSheets}
        contained={contained}
      />
    );
  } else if (instrumentSheet) {
    overlay = (
      <InstrumentSheet
        instrument={instrumentSheet.instrument}
        tuningNotes={instrumentSheet.tuningNotes}
        attribution={instrumentSheet.attribution}
        isBookmarked={bookmarkedInstruments.has(instrumentSheet.instrument.id)}
        onToggleBookmark={() => toggleBookmarkInstrument(instrumentSheet.instrument.id)}
        onOpenInAppBrowser={openVendorInAppBrowser}
        onOpenVendor={(vendor) => setVendorSheet({ vendor, instrument: instrumentSheet.instrument })}
        onClose={() => setInstrumentSheet(null)}
        onCloseAll={closeAllSheets}
        contained={contained}
      />
    );
  }

  return { openInstrument, overlay };
}

// Self-contained person sheet for surfaces that have no SuperCredits sheet
// stack of their own (today: the mobile album view's credits flow). Opens
// straight to a person — no song context — leading with About and the
// credited role as the subtitle. Manages its own instrument/vendor/in-app
// browser sub-stack + bookmark persistence so the Gear/Music tabs stay fully
// interactive without the caller wiring any of it.
export function PersonDetailSheet({
  person,
  album,
  contextLabel,
  onClose,
}: {
  person: Person;
  album: Album;
  contextLabel?: string;
  onClose: () => void;
}) {
  const { openInstrument, overlay } = usePersonGearDrilldown(onClose);
  if (overlay) return <>{overlay}</>;
  return (
    <PerformerSheet
      person={person}
      album={album}
      contextLabel={contextLabel}
      currentSongCredits={undefined}
      otherTracks={[]}
      resolveInstrument={resolveStaticInstrument}
      onOpenInstrument={openInstrument}
      onClose={onClose}
    />
  );
}

// Parses an `about` blob into { prose, specs }.
// A line counts as a spec when it looks like a short "Label: Value" pair —
// label starts with an uppercase letter, value is ≤ 80 chars and doesn't end
// in a sentence period (so prose with a colon, e.g. "Note: this guitar sings.",
// stays in the prose bucket). Consecutive non-matching lines are joined as
// paragraphs. Order is preserved; we don't try to merge non-contiguous prose.
function parseInstrumentAbout(about: string): { prose: string; specs: { label: string; value: string }[] } {
  const lines = about.split(/\r?\n/);
  const proseLines: string[] = [];
  const specs: { label: string; value: string }[] = [];
  const specLine = /^\s*([A-Z][A-Za-z0-9 /()&'.-]{0,40}):\s+(.{1,80})\s*$/;
  for (const raw of lines) {
    const m = raw.match(specLine);
    // Treat anything that reads as a sentence — multi-sentence or
    // terminal-punctuation — as prose, not a spec. Catches both mid-sentence
    // ("Note: this is great. And…") and trailing ("Note: this guitar sings.")
    // shapes so prose with an incidental colon doesn't get pulled into the
    // spec grid.
    const looksProse = m && (/[.!?]\s+\S/.test(m[2]) || /[.!?]["')\]]?\s*$/.test(m[2]));
    if (m && !looksProse) {
      specs.push({ label: m[1].trim(), value: m[2].trim() });
    } else {
      proseLines.push(raw);
    }
  }
  // Collapse runs of blank lines, trim outer whitespace.
  const prose = proseLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { prose, specs };
}

// About / Specs section with an Apple-Music-style segmented pill control.
// - If the about field has no extractable specs, renders prose as before
//   (no tab chrome — keeps simple instruments visually quiet).
// - If specs exist but no prose, defaults to Specs (no empty About tab).
// - Otherwise: two tabs, default About. Specs are hidden until tapped, so
//   the rest of the sheet (artist note, vendors) stays near the top.
function InstrumentAboutSection({ category, about }: { category: string; about: string }) {
  const { prose, specs } = useMemo(() => parseInstrumentAbout(about), [about]);
  const hasProse = prose.length > 0;
  const hasSpecs = specs.length > 0;
  const [tab, setTab] = useState<"about" | "specs">(hasProse ? "about" : "specs");

  // No specs detected → original render, unchanged.
  if (!hasSpecs) {
    return (
      <section className="px-5 pt-3 pb-5">
        <h3 className="text-fan-primary text-[22px] font-bold leading-tight tracking-tight mb-2">About this {category.toLowerCase()}</h3>
        <p className="text-[16px] leading-relaxed whitespace-pre-line" style={{ color: "rgba(235,235,245,0.72)" }}>{prose || about}</p>
      </section>
    );
  }

  const showBoth = hasProse && hasSpecs;
  const SegBtn = ({ value, label }: { value: "about" | "specs"; label: string }) => {
    const active = tab === value;
    return (
      <button
        type="button"
        onClick={() => setTab(value)}
        aria-pressed={active}
        className="flex-1 h-9 rounded-full text-[14px] font-semibold transition-colors active:opacity-80"
        style={{
          background: active ? "rgba(255,255,255,0.14)" : "transparent",
          color: active ? "#ffffff" : "rgba(235,235,245,0.55)",
        }}
        data-testid={`tab-instrument-${value}`}
      >
        {label}
      </button>
    );
  };

  return (
    <section className="px-5 pt-3 pb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-fan-primary text-[22px] font-bold leading-tight tracking-tight">About this {category.toLowerCase()}</h3>
      </div>

      {showBoth && (
        <div
          className="flex items-center gap-1 p-1 rounded-full mb-3"
          style={{ background: "rgba(255,255,255,0.06)" }}
          role="tablist"
          aria-label="About or specs"
        >
          <SegBtn value="about" label="About" />
          <SegBtn value="specs" label="Specs" />
        </div>
      )}

      {tab === "about" && hasProse && (
        <p className="text-[16px] leading-relaxed whitespace-pre-line" style={{ color: "rgba(235,235,245,0.72)" }} data-testid="text-instrument-about">
          {prose}
        </p>
      )}

      {tab === "specs" && (
        // Two-column dl: label dim, value white. Subtle hairline rows so the
        // grid reads cleanly even with a long list — matches the dense spec
        // sheets fans expect to see on Reverb / Carter Vintage listings.
        <dl className="text-[15px] leading-snug" data-testid="list-instrument-specs">
          {specs.map((s, i) => (
            <div
              key={`${s.label}-${i}`}
              className="grid grid-cols-[40%_60%] gap-3 py-2"
              style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}
            >
              <dt style={{ color: "rgba(235,235,245,0.55)" }}>{s.label}</dt>
              <dd className="text-fan-primary">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function InstrumentSheet({
  instrument,
  tuningNotes,
  attribution,
  isBookmarked,
  onToggleBookmark,
  onOpenInAppBrowser,
  onOpenVendor,
  onClose,
  onCloseAll,
  contained = false,
}: {
  instrument: Instrument;
  tuningNotes?: string;
  attribution?: { personId: string; songId: string };
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onOpenInAppBrowser: (b: { url: string; title: string; logoUrl?: string }) => void;
  onOpenVendor: (vendor: InstrumentVendor) => void;
  onClose: () => void;
  onCloseAll: () => void;
  /* Render as an in-card slide-in pane (desktop credits card) instead of a
     full-viewport overlay. Forwarded to SheetShell. */
  contained?: boolean;
}) {
  // SuperCredits-derived list of artists who've played this instrument on
  // a track. Anchored on instrument.id (not vendor.id), so it works for
  // both demo instruments and real DB rows. Empty list → section hidden.
  // GET /api/instruments/:id/profile — drives the "Played by" rail plus the
  // headline maker (eyebrow + 96×96 brand chip) and the scraped source link.
  type InstrumentProfile = {
    instrument: {
      id: string;
      sourceUrl?: string | null;
      maker?: { id: string; name: string; domain?: string | null; logoUrl: string | null } | null;
    };
    artists: Array<{ id: string; name: string; photoUrl: string | null; bio: string | null; trackCount: number }>;
  };
  const { data: instrumentProfile } = useQuery<InstrumentProfile>({
    queryKey: ["/api/instruments", instrument.id, "profile"],
    enabled: !!instrument.id,
  });
  const playedBy: GearArtist[] = (instrumentProfile?.artists ?? []).map((a) => ({
    id: a.id, name: a.name, photoUrl: a.photoUrl,
  }));
  const maker = instrumentProfile?.instrument?.maker ?? null;
  const sourceUrl = instrumentProfile?.instrument?.sourceUrl ?? null;

  // Resolve attribution → who wrote the note + which song it's about, so a
  // bookmarked instrument still reads "this note was from X on Y".
  const noteFromPerson = attribution ? PEOPLE[attribution.personId] : undefined;
  const noteFromSong = attribution
    ? ALBUMS.flatMap((a) => getSongsByAlbum(a.id)).find((s) => s.id === attribution.songId)
    : undefined;
  const artistNote: GearArtistNote | null = instrument.artistNote
    ? {
        quote: instrument.artistNote,
        person: noteFromPerson ? { name: noteFromPerson.name, photoUrl: noteFromPerson.photoUrl } : undefined,
        albumNote: noteFromSong ? `on "${noteFromSong.title}"` : undefined,
      }
    : null;

  const handleShare = async () => {
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    const shareText = `${instrument.name} — featured on GoodTunes Credits`;
    try {
      if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share) {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: instrument.name,
          text: shareText,
          url: shareUrl,
        });
        return;
      }
    } catch { /* user cancelled or share unavailable */ }
    try {
      await navigator.clipboard.writeText(`${shareText} — ${shareUrl}`);
      toast({ title: "Link copied", description: instrument.name });
    } catch {
      toast({ title: "Share unavailable", description: "Couldn't copy link in this browser." });
    }
  };

  return (
    <SheetShell ariaLabel={instrument.name} testId="sheet-instrument" variant="full" contained={contained} onClose={onClose}>
      <GearDetailBody
        instrument={instrument}
        maker={maker}
        vendors={instrument.vendors ?? []}
        artistNote={artistNote}
        playedBy={playedBy}
        sourceUrl={sourceUrl}
        tuningNote={tuningNotes ?? null}
        isBookmarked={isBookmarked}
        onToggleBookmark={onToggleBookmark}
        onShare={handleShare}
        onBack={onClose}
        onOpenMaker={maker ? () => onOpenVendor({ name: maker.name, vendorId: maker.id, logoUrl: maker.logoUrl ?? undefined, affiliateUrl: maker.domain ? (maker.domain.startsWith("http") ? maker.domain : `https://${maker.domain}`) : "" } as InstrumentVendor) : undefined}
        onOpenVendor={(v) => onOpenVendor(v as InstrumentVendor)}
        onOpenBuy={(v) => { const iv = v as InstrumentVendor; if (iv.affiliateUrl) onOpenInAppBrowser({ url: iv.affiliateUrl, title: iv.name, logoUrl: iv.logoUrl ?? undefined }); }}
      />
    </SheetShell>
  );
}

/**
 * VendorSheet — Apple Music artist-page-style profile for an instrument vendor.
 * Hero cover photo with the vendor name overlaid, About copy, location/web contact,
 * Share + Chat actions, and a concept "Artists who use them" rail. Tapping the primary
 * "Visit website" button opens the in-app browser.
 */
function VendorSheet({
  vendor,
  instrument,
  isBookmarked,
  onToggleBookmark,
  onOpenInAppBrowser,
  onOpenInstrument,
  onClose,
  onCloseAll,
  contained = false,
}: {
  vendor: InstrumentVendor;
  instrument: Instrument;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onOpenInAppBrowser: (b: { url: string; title: string; logoUrl?: string }) => void;
  onOpenInstrument: (instrument: Instrument) => void;
  onClose: () => void;
  onCloseAll: () => void;
  /* Render as an in-card slide-in pane instead of a full-viewport overlay. */
  contained?: boolean;
}) {
  const [tab, setTab] = useState<"about" | "instruments" | "artists">("about");

  // One-shot fetch of the vendor profile bundle (vendor entity + all
  // non-hidden instruments attached to it + SuperCredits-derived artists
  // who've played those instruments). The InstrumentVendor row passed in
  // is just one specific attachment — the profile pulls the full picture.
  type VendorProfile = {
    vendor: {
      id: string; name: string; domain: string;
      homeUrl: string | null; aboutUrl: string | null;
      logoUrl: string | null; tagline: string | null; bio: string | null;
      location: string | null; coverUrl: string | null;
    };
    instruments: Array<{
      id: string; name: string; category: string;
      shortCategory: string | null; photoUrl: string | null;
      about: string | null; artistNote: string | null;
    }>;
    artists: Array<{
      id: string; name: string; photoUrl: string | null;
      bio: string | null;
      trackCount: number;
    }>;
    // Task #237 — when this vendor is a sub-brand (Epiphone, Kramer),
    // the server returns the parent vendor so we can render
    // "Owned by Gibson" under the vendor name.
    parent?: {
      id: string; name: string; domain: string; logoUrl: string | null;
    } | null;
  };
  const { data: profile, isError: profileError } = useQuery<VendorProfile>({
    queryKey: ["/api/vendors", vendor.vendorId, "profile"],
    // Static-seed vendors (older demo data) have no vendorId — skip the
    // fetch entirely so we don't 404 on `/api/vendors//profile`. The
    // Instruments tab will show an empty hint and Artists falls back to
    // the static `usedByPersonIds` rail.
    enabled: !!vendor.vendorId,
  });

  // The globe / "Web" link always points at the vendor's BRAND domain
  // (e.g. prsguitars.com), never a gear-specific product page — anything
  // featuring a specific instrument deep-links to that gear's own URL via
  // the InstrumentSheet "Available at" row instead.
  const domain = vendor.domain
    ?? (() => {
      try { return new URL(vendor.homeUrl ?? vendor.aboutUrl ?? vendor.affiliateUrl).hostname.replace(/^www\./, ""); }
      catch { return ""; }
    })();
  // Prefer real SuperCredits-derived artists from the profile endpoint;
  // fall back to the static stub `usedByPersonIds` so this still looks
  // populated on demo vendors with no track_performers wired up yet.
  const usedBy: Person[] = profile?.artists?.length
    ? profile.artists.map((a) => ({
        id: a.id,
        name: a.name,
        photoUrl: a.photoUrl ?? undefined,
      } as Person))
    : ((vendor.usedByPersonIds ?? Object.keys(PEOPLE).slice(0, 4))
        .map((pid) => PEOPLE[pid])
        .filter(Boolean) as Person[]);

  const bio = vendor.bio
    ?? `${vendor.name} is one of the trusted shops we link out to from GoodTunes Credits. Tap the globe icon to visit their full catalog.`;
  const tagline = vendor.tagline ?? domain;
  const websiteUrl = vendor.homeUrl ?? vendor.aboutUrl ?? vendor.affiliateUrl;

  const handleShare = async () => {
    const shareUrl = vendor.aboutUrl ?? vendor.affiliateUrl;
    try {
      if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share) {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: vendor.name,
          text: `${vendor.name} on GoodTunes`,
          url: shareUrl,
        });
        return;
      }
    } catch { /* user cancelled */ }
    try {
      await navigator.clipboard.writeText(`${vendor.name} — ${shareUrl}`);
      toast({ title: "Link copied", description: vendor.name });
    } catch {
      toast({ title: "Share unavailable" });
    }
  };

  return (
    <SheetShell ariaLabel={vendor.name} testId="sheet-vendor" variant="full" contained={contained} onClose={onClose}>
      {/* Top bar: floating back chevron + actions over the hero (Apple Music artist page).
          NOTE: `overflow-x-hidden` is intentional — when only overflow-y is set
          the browser computes overflow-x as `auto` too, which let the whole
          vendor page slide horizontally when any descendant (e.g. the action
          row when chat is enabled) measured even a hair wider than the
          viewport. Pin x-scroll off so this stays a vertical-only page. */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide pb-10 relative">
        {/* Toolbar + tab strip share a single sticky container so the tabs
            always sit immediately under the toolbar regardless of the
            device safe-area inset (a hardcoded `top-[60px]` would overlap
            on notched devices with large insets). */}
        <div
          className="sticky top-0 z-20 flex items-center justify-between px-3 pb-2"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          {/* 44px IconButton (glass) so the chrome matches the rest of the
              player shell (the gear sheet's back chevron uses the same
              primitive + variant). 44px is the Apple HIG floor and the
              design-system rule; the glass chip stays legible over both
              dark and bright hero covers where a black `dimmed` chip
              vanished. This is now the ONLY dismiss/return control. */}
          <SheetBack data-testid="button-vendor-close" />
          <div className="flex items-center gap-2">
            {/* Bookmark — saves the vendor to the user's bookmark list
                (localStorage). Filled when active. */}
            <IconButton
              variant="dimmed"
              label={isBookmarked ? "Remove bookmark" : "Bookmark vendor"}
              aria-pressed={isBookmarked}
              onClick={onToggleBookmark}
              data-testid="button-vendor-bookmark"
            >
              <svg viewBox="0 0 24 24" fill={isBookmarked ? "#4AFFCA" : "none"} stroke={isBookmarked ? "#4AFFCA" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </IconButton>
            <IconButton
              variant="dimmed"
              label="Share"
              onClick={handleShare}
              data-testid="button-vendor-share"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12" />
                <path d="M7 8l5-5 5 5" />
                <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
              </svg>
            </IconButton>
            {/* Website — opens in-app browser to the vendor homepage.
                Replaces the old "Visit website" pill so we don't compete
                with the tabs below for vertical space. */}
            <IconButton
              variant="dimmed"
              label={`Visit ${vendor.name} website`}
              onClick={() => onOpenInAppBrowser({ url: websiteUrl, title: vendor.name, logoUrl: vendor.logoUrl })}
              data-testid="button-vendor-website"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18" />
                <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
              </svg>
            </IconButton>
          </div>
        </div>

        {/* Hero — full-bleed cover with vendor name overlay (gradient fade for legibility).
            Pulled up under the sticky bar with a negative margin so the bar floats
            over it. The pull-up MUST match the toolbar's real height, which
            includes the device safe-area inset (`env(safe-area-inset-top) + 12px`
            padding-top + 44px IconButton + 8px padding-bottom = inset + 64px). A
            hardcoded constant left a visible navy strip above the hero on notched
            iPhones where the inset is ~50px. */}
        <div className="relative w-full" style={{ aspectRatio: "1 / 1.05", marginTop: "calc((env(safe-area-inset-top, 0px) + 64px) * -1)" }}>
          {vendor.coverUrl ? (
            <img src={vendor.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(135deg, #1a1f4a 0%, #2a1156 50%, #00062B 100%)` }}
            >
              {vendor.logoUrl && (
                <>
                  {/* Blurred large logo as backdrop (Apple-Music album style) */}
                  <img
                    src={vendor.logoUrl}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ filter: "blur(40px) saturate(160%)", transform: "scale(1.3)", opacity: 0.85 }}
                  />
                  {/* Sharp logo on top — translucent tile so the blur bleeds through */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-40 h-40 rounded-full flex items-center justify-center overflow-hidden" style={{ background: "rgba(255,255,255,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
                      <img src={vendor.logoUrl} alt="" className="w-full h-full object-cover" style={{ opacity: 0.92 }} />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {/* Bottom gradient — softens the hero so the avatar overlap sits
              clean against page bg. Less aggressive than before because the
              vendor name no longer lives inside the hero. */}
          <div className="absolute inset-x-0 bottom-0 h-1/3" style={{ background: "linear-gradient(to bottom, rgba(0,6,43,0) 0%, #00062B 100%)" }} />
        </div>

        {/* Instagram-style profile row: circular logo with brand-gradient
            ring overlapping the hero, then name + tagline beside it.
            Stats (posts/followers/friends in IG) are intentionally absent —
            we'll wire them in once we have something to count. */}
        <div className="px-5 -mt-12 relative flex items-end gap-4">
          <div
            className="flex-shrink-0 w-[88px] h-[88px] rounded-full p-[3px]"
            style={{ background: "linear-gradient(135deg, #4AFFCA 0%, #319ED8 50%, #7F10A7 100%)" }}
            data-testid="vendor-avatar"
          >
            <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center" style={{ background: "#fff" }}>
              {vendor.logoUrl ? (
                <img src={vendor.logoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[32px] font-bold" style={{ color: "#00062B" }}>
                  {vendor.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h2 className="text-fan-primary text-[24px] font-bold leading-tight tracking-tight truncate" data-testid="text-vendor-name">{vendor.name}</h2>
            {/* Task #237 — sub-brand attribution. Shown under the vendor
                name so fans browsing an Epiphone gear page see "Owned by
                Gibson" without leaving the sheet. */}
            {profile?.parent && (
              <p
                className="text-[12.5px] mt-0.5 truncate"
                style={{ color: "rgba(235,235,245,0.55)" }}
                data-testid="text-vendor-parent"
              >
                Owned by{" "}
                <span className="font-semibold" style={{ color: "rgba(235,235,245,0.8)" }}>
                  {profile.parent.name}
                </span>
              </p>
            )}
            {tagline && <p className="text-[14px] mt-0.5 truncate" style={{ color: "rgba(235,235,245,0.7)" }}>{tagline}</p>}
          </div>
        </div>

        {/* Tabs — Apple Music artist-page style: text labels with an
            underline that animates under the active tab. Three sections:
            • About: hero copy + contact meta (the old default view).
            • Instruments: every instrument this vendor is attached to,
              regardless of which one opened the sheet.
            • Artists: SuperCredits-derived list of people who've played
              one of the vendor's instruments on a credited track. */}
        {/* Tab strip scrolls with content (Apple Music's actual artist-page
            behavior) — pinning it under a safe-area-aware toolbar requires
            a measured offset which we'd otherwise hardcode and risk overlap
            on notched devices. */}
        <div className="px-5 pt-5 pb-0" style={{ background: "#00062B" }}>
          <div className="flex gap-6 border-b border-white/10">
            {(["about", "instruments", "artists"] as const).map((t) => {
              const active = tab === t;
              // "Gear" is the public-facing name for the Instruments bucket
              // — see the Admin "Gear" nav entry. Internally we keep the key
              // `instruments` so the schema/storage names don't have to change.
              // "Gear" is the public name for instruments. "Artists" stays
              // (over "People") because you only reach a vendor sheet through
              // gear, so the only people who land in this tab are performers
              // who actually played a vendor's instrument — producers and
              // lyricists don't get tagged on a gear-driven page.
              const label = t === "about" ? "About" : t === "instruments" ? "Gear" : "Artists";
              const count = t === "instruments" ? profile?.instruments?.length : t === "artists" ? usedBy.length : undefined;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  aria-pressed={active}
                  className="relative pb-2.5 text-[15px] font-semibold active:opacity-80"
                  style={{ color: active ? "#fff" : "rgba(235,235,245,0.55)" }}
                  data-testid={`tab-vendor-${t}`}
                >
                  {label}
                  {typeof count === "number" && count > 0 && (
                    <span className="ml-1.5 text-[13px] font-medium" style={{ color: "rgba(235,235,245,0.45)" }}>
                      {count}
                    </span>
                  )}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full"
                      style={{ background: "#319ED8" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {tab === "about" && (
          <>
            <section className="px-5 pt-5 pb-2">
              <h3 className="text-fan-primary text-[22px] font-bold leading-tight tracking-tight mb-2">About {vendor.name}</h3>
              <p className="text-[16px] leading-relaxed" style={{ color: "rgba(235,235,245,0.72)" }}>{bio}</p>
            </section>

            <section className="px-5 pt-5 grid grid-cols-1 gap-4">
              {vendor.location && (
                <div>
                  <p className="text-[13px] mb-0.5" style={{ color: "rgba(235,235,245,0.55)" }}>Location</p>
                  <p className="text-fan-primary text-[16px]">{vendor.location}</p>
                </div>
              )}
              {domain && (
                <div>
                  <p className="text-[13px] mb-0.5" style={{ color: "rgba(235,235,245,0.55)" }}>Web</p>
                  <button
                    type="button"
                    onClick={() => onOpenInAppBrowser({ url: websiteUrl, title: vendor.name, logoUrl: vendor.logoUrl })}
                    className="text-[16px] active:opacity-70"
                    style={{ color: "#319ED8" }}
                    data-testid="button-vendor-domain"
                  >
                    {domain}
                  </button>
                </div>
              )}
              <div>
                <p className="text-[13px] mb-0.5" style={{ color: "rgba(235,235,245,0.55)" }}>Featured instrument</p>
                <p className="text-fan-primary text-[16px]">{instrument.name}</p>
                <p className="text-[12px] mt-0.5" style={{ color: "rgba(235,235,245,0.45)" }}>The instrument that opened this page — tap the Gear tab to see the rest.</p>
              </div>
            </section>
          </>
        )}

        {tab === "instruments" && (
          <section className="px-5 pt-5">
            {!vendor.vendorId ? (
              <p className="text-[14px]" style={{ color: "rgba(235,235,245,0.5)" }}>Instrument list isn't available for this demo vendor.</p>
            ) : profileError ? (
              <p className="text-[14px]" style={{ color: "rgba(235,235,245,0.5)" }}>Couldn't load instruments. Try again later.</p>
            ) : !profile ? (
              <p className="text-[14px]" style={{ color: "rgba(235,235,245,0.5)" }}>Loading…</p>
            ) : (profile.instruments?.length ?? 0) === 0 ? (
              <p className="text-[14px]" style={{ color: "rgba(235,235,245,0.5)" }}>No instruments attached yet.</p>
            ) : (
              <ul className="flex flex-col">
                {(profile.instruments ?? []).map((inst, idx) => {
                  // Build a fan-side Instrument from the profile payload so
                  // tapping the row can hand off straight to InstrumentSheet
                  // without a second fetch. Nulls → undefined to match the
                  // musicData Instrument shape (same pattern as the
                  // PerformerSheet synthetic at line ~1808).
                  const fullInst: Instrument = {
                    id: inst.id,
                    name: inst.name,
                    category: inst.category,
                    shortCategory: inst.shortCategory ?? undefined,
                    photoUrl: inst.photoUrl ?? undefined,
                    about: inst.about ?? undefined,
                    artistNote: inst.artistNote ?? undefined,
                  } as Instrument;
                  return (
                  <li
                    key={inst.id}
                    className={`flex items-center gap-3 py-3 ${idx > 0 ? "border-t border-white/8" : ""}`}
                    data-testid={`vendor-instrument-${inst.id}`}
                  >
                    {/* Tap thumbnail or text → open this instrument's sheet.
                        Same UX as song rows / discography rows elsewhere in
                        the app: the row itself is the primary action. */}
                    <button
                      type="button"
                      onClick={() => onOpenInstrument(fullInst)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-80"
                      data-testid={`button-vendor-instrument-open-${inst.id}`}
                    >
                      <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}>
                        {inst.photoUrl ? (
                          <img src={inst.photoUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-fan-faint text-[20px]">♪</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-fan-primary text-[15px] font-medium leading-tight truncate">{inst.name}</p>
                        <p className="text-[13px] mt-0.5 truncate" style={{ color: "rgba(235,235,245,0.55)" }}>{inst.shortCategory ?? inst.category}</p>
                      </div>
                    </button>
                    {/* Chevron — Apple-style "this row is tappable" indicator. */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-fan-faint flex-shrink-0" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </li>
                  );
                })}
              </ul>
            )}
            <p className="pt-4 text-[11px] leading-relaxed" style={{ color: "rgba(235,235,245,0.45)" }}>
              Everything {vendor.name} is currently attached to across the GoodTunes catalog.
            </p>
          </section>
        )}

        {tab === "artists" && (
          <section className="px-5 pt-5">
            {usedBy.length === 0 ? (
              <p className="text-[14px]" style={{ color: "rgba(235,235,245,0.5)" }}>No artists credited with this vendor's instruments yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-x-4 gap-y-5">
                {usedBy.map((person) => (
                  <div key={person.id} className="flex flex-col items-center" data-testid={`vendor-artist-${person.id}`}>
                    <PersonAvatar person={person} size={88} />
                    <p className="text-fan-primary text-[13px] font-medium mt-2 text-center leading-tight line-clamp-2">{person.name}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="pt-5 text-[11px] leading-relaxed" style={{ color: "rgba(235,235,245,0.45)" }}>
              From Credits — artists who've credited one of {vendor.name}'s instruments on a track. Official sponsorships will badge here once that admin field lands.
            </p>
          </section>
        )}
      </div>
    </SheetShell>
  );
}

/**
 * Instagram-style in-app browser. Loads `url` in an iframe so users stay inside GoodTunes;
 * the top bar shows the vendor logo + domain, with an "open in system browser" arrow on
 * the right. Many vendor sites block iframing via X-Frame-Options/CSP — when that happens
 * the iframe stays blank, so we surface a fallback CTA after a short delay so the user can
 * still escape to their browser.
 */
function InAppBrowserSheet({
  url,
  title,
  logoUrl,
  onClose,
  onCloseAll,
  contained = false,
}: {
  url: string;
  title: string;
  logoUrl?: string;
  onClose: () => void;
  onCloseAll: () => void;
  /* Render as an in-card slide-in pane instead of a full-viewport overlay. */
  contained?: boolean;
}) {
  const dismiss = useSheetDismiss();
  // Validate https. We refuse to render anything we can't safely embed/open.
  const safeUrl = (() => {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") return null;
      return u;
    } catch { return null; }
  })();

  const domain = safeUrl ? safeUrl.hostname.replace(/^www\./, "") : url;

  const openExternal = () => {
    if (!safeUrl) return;
    window.open(safeUrl.toString(), "_blank", "noopener,noreferrer");
  };

  return (
    <SheetShell ariaLabel={`${title} — in-app browser`} testId="sheet-inapp-browser" variant="full" contained={contained} onClose={onClose}>
      {/* Top bar — close on left, vendor logo + domain center, "open in browser" on right */}
      <div
        className="sticky top-0 z-20 flex items-center gap-2 px-3 py-2 border-b border-white/8"
        style={{ background: "rgba(20,24,48,0.92)", backdropFilter: "blur(20px) saturate(180%)" }}
      >
        <SheetBack data-testid="button-inapp-close" />

        <div className="flex-1 flex items-center gap-2 min-w-0">
          {logoUrl && (
            <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.92)" }}>
              <img src={logoUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-fan-primary text-[14px] font-semibold truncate leading-tight">{title}</p>
            <p className="text-fan-secondary text-[11px] truncate leading-tight">{domain}</p>
          </div>
        </div>

        <IconButton
          variant="glass"
          label="Open in browser"
          onClick={openExternal}
          data-testid="button-inapp-open-external"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6" />
            <path d="M20 4l-9 9" />
            <path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
          </svg>
        </IconButton>

        <SheetClose
          onClick={() => (dismiss ? dismiss(onCloseAll) : onCloseAll())}
          data-testid="button-inapp-closeall"
        />
      </div>

      {/* Preview card. Virtually every vendor site (Fender, Reverb, Sweetwater,
          Martin, etc.) blocks framing via X-Frame-Options / CSP frame-ancestors,
          which left the iframe painting blank white over our placeholder. Apple
          Music and Replit's own in-app browser take the honest approach: show
          a rich preview card with brand identity + a single primary CTA to open
          in the system browser. That's what this renders now. */}
      <div className="flex-1 min-h-0 relative overflow-hidden" style={{ background: "#00062B" }}>
        {safeUrl ? (
          <>
            {/* Blurred logo as ambient backdrop (Apple Music style). */}
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: "blur(60px) saturate(160%)", transform: "scale(1.3)", opacity: 0.45 }}
              />
            )}
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(180deg, rgba(0,6,43,0.4) 0%, rgba(0,6,43,0.7) 60%, #00062B 100%)" }}
            />

            <div className="relative h-full flex flex-col items-center justify-center px-8 text-center">
              {logoUrl ? (
                <div className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center mb-5" style={{ background: "rgba(255,255,255,0.95)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                  <img src={logoUrl} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5" style={{ background: "rgba(49,158,216,0.16)" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
              )}
              <p className="text-fan-primary text-[22px] font-bold mb-1 tracking-tight">{title}</p>
              <p className="text-fan-secondary text-[13px] mb-7">{domain}</p>

              <button
                type="button"
                onClick={openExternal}
                className="flex items-center gap-2 px-6 py-3 rounded-full text-white text-[15px] font-semibold active:opacity-80"
                style={{ background: "#319ED8", boxShadow: "0 6px 24px rgba(49,158,216,0.45)" }}
                data-testid="button-inapp-primary-open"
              >
                <span>Open in browser</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 4h6v6" />
                  <path d="M20 4l-9 9" />
                  <path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
                </svg>
              </button>

              <p className="mt-6 text-fan-faint text-[11px] leading-relaxed max-w-[280px]">
                Most shops don't allow being shown inside another app. You'll land directly on the page above.
              </p>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <p className="text-fan-primary text-[15px] font-semibold mb-1">Can't open this link</p>
            <p className="text-fan-secondary text-[13px] break-all">{url}</p>
          </div>
        )}
      </div>

    </SheetShell>
  );
}


// ----- Bonus content (admin-uploaded videos + photos) ---------------------
// Mounted between the tracklist and the metadata footer. Each subsection
// self-hides when its array is empty so a fresh album keeps the original
// "tracks → metadata" rhythm. Fetched here (not via the parent useQuery on
// /api/albums/:id) so we keep one round-trip per surface rather than
// bloating the album payload that every other surface (search, library,
// playlist hydration) already loads.
interface BonusPhoto { id: string; albumId: string; photoUrl: string; caption: string | null; position: number; }

// Task #190 — fan-side per-album lineup rail. Reads the snapshot the
// admin captured on the album's Overview → Lineup panel. Renders
// nothing when the album has no lineup (solo records and ungrouped
// bands), so adding this is a no-op for the existing catalog.
export function AlbumLineupRail({
  albumId,
  onPickMember,
}: {
  albumId: string;
  onPickMember: (memberName: string) => void;
}) {
  type LineupRow = {
    id: string;
    memberId: string;
    roles: string[] | null;
    displayOrder: number;
    person: { id: string; name: string; photoUrl: string | null } | null;
  };
  const { data: lineup = [] } = useQuery<LineupRow[]>({
    queryKey: ["/api/albums", albumId, "lineup"],
    queryFn: async () => {
      const r = await fetch(`/api/albums/${albumId}/lineup`);
      if (!r.ok) return [];
      return r.json();
    },
  });
  if (lineup.length === 0) return null;
  return (
    <div className="px-5 mt-7" data-testid="section-album-lineup">
      <h2 className="text-fan-primary text-xl font-bold tracking-tight mb-3">Lineup</h2>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
        {lineup
          .filter((m) => m.person)
          .map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onPickMember(m.person!.name)}
              className="flex-shrink-0 flex flex-col items-center text-center w-[88px] active:opacity-80"
              data-testid={`album-lineup-member-${m.memberId}`}
            >
              <div className="w-[72px] h-[72px] rounded-full overflow-hidden bg-white/5">
                {m.person!.photoUrl && (
                  <img
                    src={m.person!.photoUrl}
                    alt={m.person!.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
              </div>
              <p className="text-fan-primary text-[12px] font-semibold mt-2 leading-tight line-clamp-2">
                {m.person!.name}
              </p>
              {m.roles && m.roles.length > 0 && (
                <p className="text-fan-secondary text-[10.5px] leading-tight mt-0.5 line-clamp-2">
                  {m.roles.join(", ")}
                </p>
              )}
            </button>
          ))}
      </div>
    </div>
  );
}

// Map a served display-derivative URL to its full-resolution ".orig"
// sibling. Admin uploads keep the original next to the downsized display
// image (see server/imageProcessing.ts); the zoom lightbox pulls it for a
// crisp close-up and falls back to the display image if no original exists.
function originalUploadUrl(url: string): string | null {
  const m = /^\/objects\/uploads\/([a-zA-Z0-9._-]+)$/.exec(url);
  if (!m) return null;
  const id = m[1];
  if (id.includes(".orig.")) return url;
  const dot = id.lastIndexOf(".");
  if (dot <= 0) return null;
  return `/objects/uploads/${id.slice(0, dot)}.orig${id.slice(dot)}`;
}

// A single photo slide inside PhotoLightbox. Renders the lightweight display
// image by default; the moment its slide is the active one AND the fan zooms
// in, it swaps to the full-resolution original (only the active slide ever
// loads its original, so memory stays bounded) and reverts to the display
// image when zoom is released or another photo becomes active. Falls back to
// the display image if no original exists (404).
function LightboxSlide({
  photo,
  active,
  zoomed,
}: {
  photo: BonusPhoto;
  active: boolean;
  zoomed: boolean;
}) {
  const displayUrl = photo.photoUrl;
  const originalUrl = originalUploadUrl(displayUrl);
  const wantOriginal = active && zoomed && !!originalUrl;
  const [src, setSrc] = useState(displayUrl);

  useEffect(() => {
    setSrc(wantOriginal && originalUrl ? originalUrl : displayUrl);
  }, [wantOriginal, originalUrl, displayUrl]);

  return (
    <div className="w-full h-full flex-shrink-0 flex items-center justify-center px-4">
      <img
        src={src}
        alt={photo.caption ?? ""}
        draggable={false}
        className="max-w-full max-h-full object-contain select-none transition-transform duration-200"
        style={{ transform: active && zoomed ? "scale(2)" : "scale(1)" }}
        onError={() => {
          if (src !== displayUrl) setSrc(displayUrl);
        }}
        data-testid={`img-album-photo-${photo.id}`}
      />
    </div>
  );
}

export function AlbumBonusContent({ albumId, locked = false, artist }: { albumId: string; locked?: boolean; artist?: string }) {
  const { data: videos = [] } = useQuery<BonusVideo[]>({
    queryKey: ["/api/albums", albumId, "videos"],
  });
  const { data: photos = [] } = useQuery<BonusPhoto[]>({
    queryKey: ["/api/albums", albumId, "photos"],
  });
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  // "See all" overlay for the videos shelf. We cap the inline shelf at
  // VIDEO_SHELF_LIMIT tiles (Apple-style); anything past that lives in a
  // full-screen sheet opened via the Videos > header. Album shelves cap
  // at 10 because covers are square; video tiles are ~16:9 and roughly
  // twice as wide as an album cover, so 5 fills the same horizontal
  // budget on the same device.
  const VIDEO_SHELF_LIMIT = 5;
  const [showAllVideos, setShowAllVideos] = useState(false);
  const hasOverflow = videos.length > VIDEO_SHELF_LIMIT;
  const shelfVideos = hasOverflow ? videos.slice(0, VIDEO_SHELF_LIMIT) : videos;

  // Escape dismisses the "See all" sheet — Apple/standard a11y behavior.
  useEffect(() => {
    if (!showAllVideos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAllVideos(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAllVideos]);

  if (videos.length === 0 && photos.length === 0) return null;

  return (
    <>
      {videos.length > 0 && (
        <div className="mt-8 px-5">
          {hasOverflow ? (
            <button
              type="button"
              onClick={() => setShowAllVideos(true)}
              className="flex items-center gap-1 mb-3 active:opacity-70"
              data-testid="link-all-album-videos"
            >
              <h3 className="text-fan-primary text-[22px] font-bold tracking-tight" data-testid="heading-album-videos">
                Videos
              </h3>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-fan-secondary">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ) : (
            <h3 className="text-fan-primary text-[22px] font-bold tracking-tight mb-3" data-testid="heading-album-videos">
              Videos
            </h3>
          )}
          <div className="-mx-5 px-5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <div className="flex gap-3 pb-2" style={{ width: "max-content" }}>
              {shelfVideos.map((v) => (
                <div
                  key={v.id}
                  className="w-[260px] flex-shrink-0"
                  data-testid={`tile-album-video-${v.id}`}
                >
                  <BonusVideoPlayer video={v} locked={locked} />
                  <p className="mt-2 text-[14px] text-fan-primary font-medium truncate">{v.title}</p>
                  {artist && (
                    <p className="text-xs text-fan-secondary truncate">{artist}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* "See all" sheet — fullscreen overlay listing every video for this
          album in a single vertical scroll. Tap the chevron next to the
          Videos header to open it, tap × to close. Mirrors the album
          More-By overflow pattern. */}
      {showAllVideos && (
        <div
          className="fixed inset-0 z-[120] bg-[#00062B] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="All videos"
          data-testid="overlay-all-album-videos"
        >
          <div className="flex items-center justify-between px-4 pt-12 pb-3">
            <h3 className="text-fan-primary text-[22px] font-bold tracking-tight">Videos</h3>
            <SheetClose
              onClick={() => setShowAllVideos(false)}
              data-testid="button-close-all-album-videos"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-10">
            <div className="flex flex-col gap-5">
              {videos.map((v) => (
                <div key={v.id} data-testid={`tile-all-album-video-${v.id}`}>
                  <BonusVideoPlayer video={v} locked={locked} />
                  <p className="mt-2 text-sm text-fan-primary font-medium truncate">{v.title}</p>
                  {artist && (
                    <p className="text-xs text-fan-secondary truncate">{artist}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {photos.length > 0 && (
        <div className="mt-8 px-5">
          <h3 className="text-fan-primary text-[22px] font-bold tracking-tight mb-3" data-testid="heading-album-photos">
            Photos
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  if (locked) return;
                  setActivePhotoIndex(i);
                }}
                className="relative rounded-md overflow-hidden bg-white/5 active:opacity-80"
                style={{ aspectRatio: "1 / 1", cursor: locked ? "default" : "pointer" }}
                data-locked={locked ? "true" : "false"}
                data-testid={`button-album-photo-${p.id}`}
              >
                <img
                  src={p.photoUrl}
                  alt={p.caption ?? ""}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  style={
                    locked
                      ? {
                          filter: "brightness(0.55) saturate(0.85) blur(14px)",
                          transform: "scale(1.2)",
                        }
                      : undefined
                  }
                />
                {locked && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-black/55 flex items-center justify-center">
                      <Lock className="w-3.5 h-3.5 text-fan-primary" strokeWidth={2.2} />
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {activePhotoIndex !== null && photos[activePhotoIndex] && (
        <PhotoLightbox
          photos={photos}
          index={activePhotoIndex}
          onIndexChange={setActivePhotoIndex}
          onClose={() => setActivePhotoIndex(null)}
        />
      )}
    </>
  );
}

/**
 * Full-screen photo viewer for an album's Photos shelf. Opens at the tapped
 * index and pages across the entire `photos` array:
 *  - touch swipe left/right with edge resistance + snap (transition only on
 *    release, never during the drag, so it stays buttery)
 *  - "X of Y" counter + pagination dots that track the current photo
 *  - desktop chevron buttons (disabled at the first/last photo) + arrow keys
 *  - captions render for photos that have them
 *  - X / tap-out / Escape all dismiss
 *  - double-tap / double-click toggles a 2× zoom (paging is suspended while
 *    zoomed so a pan doesn't accidentally change photos)
 */
function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: BonusPhoto[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const count = photos.length;
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const active = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const maxMove = useRef(0);
  const axis = useRef<"h" | "v" | null>(null);
  const lastTap = useRef(0);

  const go = useCallback(
    (i: number) => onIndexChange(Math.max(0, Math.min(count - 1, i))),
    [count, onIndexChange],
  );

  // Reset zoom whenever we move to a different photo.
  useEffect(() => {
    setZoomed(false);
  }, [index]);

  // Escape closes; arrow keys page through (ignored while zoomed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (zoomed) return;
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "ArrowRight") go(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, zoomed, go, onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    maxMove.current = 0;
    axis.current = null;
    active.current = true;
    setDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!active.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    maxMove.current = Math.max(maxMove.current, Math.abs(dx), Math.abs(dy));
    if (zoomed) return;
    if (axis.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (axis.current === "h") {
      let d = dx;
      if ((index === 0 && dx > 0) || (index === count - 1 && dx < 0)) d = dx / 3;
      setDragX(d);
    }
  };

  const onTouchEnd = () => {
    if (!active.current) return;
    active.current = false;
    setDragging(false);
    // Double-tap (within 300ms, negligible movement) toggles zoom.
    if (maxMove.current < 10) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        setZoomed((z) => !z);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
    if (axis.current === "h") {
      if (dragX < -60) go(index + 1);
      else if (dragX > 60) go(index - 1);
    }
    setDragX(0);
    axis.current = null;
  };

  const current = photos[index];

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/95 flex flex-col"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Album photo"
      data-testid="overlay-album-photo"
    >
      <div className="flex items-center justify-between p-4">
        <span
          className="text-fan-secondary text-xs font-medium tabular-nums"
          data-testid="text-album-photo-position"
        >
          {index + 1} of {count}
        </span>
        <SheetClose
          variant="dimmed"
          onClick={onClose}
          data-testid="button-close-album-photo"
        />
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div
          className="flex h-full"
          style={{
            transform: `translate3d(calc(${-index * 100}% + ${dragX}px), 0, 0)`,
            transition: dragging ? "none" : "transform 320ms cubic-bezier(0.22,0.61,0.36,1)",
            touchAction: "pan-y",
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={() => setZoomed((z) => !z)}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {photos.map((p, i) => (
            <LightboxSlide
              key={p.id}
              photo={p}
              active={i === index}
              zoomed={zoomed}
            />
          ))}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              disabled={index === 0}
              onClick={(e) => {
                e.stopPropagation();
                go(index - 1);
              }}
              className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              data-testid="button-prev-album-photo"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Next photo"
              disabled={index === count - 1}
              onClick={(e) => {
                e.stopPropagation();
                go(index + 1);
              }}
              className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              data-testid="button-next-album-photo"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </>
        )}
      </div>

      {current?.caption && (
        <p className="text-center text-fan-secondary text-xs px-6 pt-4">{current.caption}</p>
      )}

      {count > 1 && (
        <div
          className="flex items-center justify-center gap-1.5 pt-4 pb-8"
          onClick={(e) => e.stopPropagation()}
          data-testid="dots-album-photo"
        >
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-label={`Go to photo ${i + 1}`}
              onClick={() => go(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-5 bg-white" : "w-1.5 bg-white/35"
              }`}
              data-testid={`dot-album-photo-${i}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

