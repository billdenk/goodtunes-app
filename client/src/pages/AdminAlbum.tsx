import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { normalizeAudioUrl } from "@shared/audioUrl";
import { normalizeShareSlug, validateShareSlug, shareUrlForSlugs, SHARE_LINK_HOST } from "@shared/shareSlug";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Link, useLocation, useRoute, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface LabelLite {
  id: string;
  name: string;
}
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  GripVertical,
  Pencil,
  Trash2,
  Plus,
  Play,
  Pause,
  Film,
  Music,
  Tag as TagIcon,
  AlertCircle,
  Upload,
  ImageIcon,
  ImagePlus,
  Link2,
  Copy,
  ExternalLink,
  X as XIcon,
  Circle,
  CheckCircle2,
  Ban,
  Lock,
  LockOpen,
  ChevronDown,
  ChevronUp,
  Disc3,
  Headphones,
  FileText,
  Users,
  Check,
  Loader2,
  ListChecks,
  RotateCcw,
  Info,
  MoreHorizontal,
  Search,
  Sparkles,
  ListPlus,
  UserPlus,
  Wand2,
  Download,
  PieChart,
  AlertTriangle,
} from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { LyricsGapDots } from "@/components/LyricsGapDots";
import { ProgressStrip } from "@/components/ui/ProgressStrip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SiSpotify, SiApplemusic } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AddEntityButton } from "@/components/admin/AddEntityButton";
import { AlbumPreviewCard } from "@/components/admin/previews/AlbumPreviewCard";
import { AlbumDesktopPreviewCard } from "@/components/admin/previews/AlbumDesktopPreviewCard";
import { EditablePanel } from "@/components/admin/EditablePanel";
import { AlbumNpoSplitPanel } from "@/components/admin/AlbumNpoSplitPanel";
import TrackCreditsPanel from "@/components/admin/TrackCreditsPanel";
import { SplitsImportSheet, TrackSplitsEditor } from "@/components/admin/SplitsPanels";
import { pushRecentPerson } from "@/hooks/usePersonCreditRecents";
import { anchorScrollToElement } from "@/lib/anchorScroll";
import { CreditsImportSheet } from "@/components/admin/CreditsImportSheet";
import { apiRequest, getAuthToken } from "@/lib/queryClient";
import { invalidateAdminEntity } from "@/lib/adminEntityInvalidation";
import Hls from "hls.js";
import {
  attachAdminAudio,
  useAdminTrackAudioSource,
  type AdminAudioReason,
} from "@/hooks/useAdminTrackAudioSource";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useExclusiveDisclosure } from "@/hooks/useExclusiveDisclosure";
import { ToastAction } from "@/components/ui/toast";
import { Switch } from "@/components/ui/switch";
import { PlayerDock } from "@/components/ui/PlayerDock";
import { SellPanel } from "@/components/admin/SellPanel";
import { PressPanel } from "@/components/admin/PressPanel";
import { ShopifyPanel } from "@/components/admin/ShopifyPanel";
import { AlbumCustomersPanel } from "@/components/admin/AlbumCustomersPanel";
import { NewAlbumModeDialog } from "@/components/admin/NewAlbumModeDialog";
import { PressingOrderStepper } from "@/components/admin/PressingOrderFlow";
import {
  PATH_TO_PRESS_NAVIGATE_EVENT,
  scrollAndFlash,
  type PathToPressNavigateDetail,
} from "@/lib/pathToPressNav";
import { ExplicitBadge } from "@/components/ui/ExplicitBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Admin · Single album. Wrapped in AdminFrame so it shares the top bar +
 * left entity sidebar with /admin/albums.
 *
 * Tabs:
 *   Overview · Tracks  — real data (Phase 2)
 *   Artwork · Masters · Bonus — Phase 3-5 placeholders that deep-link to
 *   the classic admin for now.
 *
 * Editing is still done in the classic admin — this surface is a clean
 * read view + jump-off. Each tab has a contextual "Edit in classic" button.
 */
interface AlbumFull {
  id: string;
  title: string;
  artist: string;
  primaryArtistId?: string | null;
  artwork: string;
  year: number | null;
  type: "Single" | "Duo" | "EP" | "LP";
  description: string | null;
  isHidden: boolean;
  isGoodTunesRelease: boolean;
  // Task #440 — "Prepping" lifecycle gate. Drives the LifecyclePill +
  // the Promote/Demote CTA next to it. New shells land here; admin
  // flips it off via "Mark as released" once the album is ready.
  isPrepping?: boolean;
  isExplicit?: boolean;
  // Task #799 — TEMPORARY admin-only "SPIN Promo (digital-only legacy)"
  // marker. No fan-facing effect.
  isSpinPromo?: boolean;
  // Task #965 — clean per-release share slug (get.goodtunes.music/<slug>).
  shareSlug?: string | null;
  genre?: string | null;
  labelId?: string | null;
  // Server-joined label row from AlbumWithLabel (storage.getAlbumById).
  label?: { id: string; name: string } | null;
  goodTunesReleaseDate?: string | null;
  streamingReleaseDate?: string | null;
  // Task #1078 — Apple-style album footer fields.
  originalReleaseDate?: string | null;
  copyrightLine?: string | null;
  // Task #1158 — per-album footer copyright symbol (℗ vs ©).
  copyrightSymbol?: string | null;
  appleMusicUrl?: string | null;
  spotifyUrl?: string | null;
  tidalUrl?: string | null;
  qobuzUrl?: string | null;
  deezerUrl?: string | null;
  pandoraUrl?: string | null;
  // Original credits-doc prose, captured verbatim by the credits importer
  // and saved here so a re-open of the album shows "saved from a previous
  // import" — no fan-side rendering yet.
  linerNotes?: string | null;
  // Bundle purchase price in cents — drives the consumer Buy Bundle CTA.
  // Null = not for sale yet, no CTA shown on /album/:id.
  priceCents?: number | null;
  // Task #429 — operator-entered track count used by the Publishing
  // line of the SellPanel breakdown before any masters are uploaded.
  // Null = no estimate; once songs exist the live count wins.
  anticipatedTrackCount?: number | null;
  // Task #79 — set the first time a paid order materializes for this
  // album. Non-null means the album is post-sale locked for partner
  // metadata edits; super-admin can still edit, or grant an unlock
  // override (see /admin/review).
  firstSoldAt?: string | null;
  // Task #335 — sell mode + physical format set in the two-step
  // creation modal. Null on freshly-created rows until the operator
  // picks. `sellQuoteLockedAt` non-null = the operator hit "Lock in
  // quote" on the Sell tab and the rest of the album tabs (Press,
  // Shopify, Bonus) unlock.
  sellMode?: "direct" | "shopify" | null;
  physicalFormat?: "single_lp" | "double_lp" | "seven_inch" | "cassette" | null;
  sellQuoteLockedAt?: string | null;
  // Task #541 — Vinyl cut format (12_33_single / 12_33_double / 12_45 /
  // 7_45). Picked on the Tracks → Vinyl-order view; independent of
  // physicalFormat (Sell-panel SKU choice). Null until the artist picks.
  vinylFormat?: string | null;
  songs: SongLite[];
}

interface SongLite {
  id: string;
  title: string;
  trackNumber: number;
  duration: number;
  lyrics: string | null;
  audioUrl: string | null;
  // Archival original — set when the upload pipeline transcoded the
  // master (e.g. 24-bit WAV → FLAC for browser playback). Null when
  // the upload was already playable in browsers. See server schema.
  audioSourceUrl?: string | null;
  syncedLyrics?: { timeMs: number; endMs?: number; text: string }[] | null;
  instrumental?: boolean | null;
  isExplicit?: boolean | null;
  previewStartMs?: number | null;
  previewEndMs?: number | null;
  // Artist-designated preview single — fan-facing Preview & Purchase
  // page renders this row "playable" pre-purchase. Default false.
  isPreviewable?: boolean | null;
  // Inverted preview gate (Task #326). Every track is previewable by
  // default; admin flips `previewHidden=true` to embargo a single track.
  // Optional `previewHiddenUntil` sunrise auto-unhides on schedule.
  previewHidden?: boolean | null;
  previewHiddenUntil?: string | null;
  // Mux ingest state — populated by the "Migrate to Mux" admin action.
  // `muxStatus` is `preparing` while encoding, `ready` once playable,
  // `errored` if Mux failed. Player swaps to signed HLS when ready.
  muxAssetId?: string | null;
  muxPlaybackId?: string | null;
  muxStatus?: string | null;
  // Pre-computed waveform peaks (0..1, ~200 numbers) for this master.
  // Server-generated by piping the master through ffmpeg at upload (or
  // via the admin "Regenerate waveform" action). When null, the preview
  // card falls back to decorative bars.
  waveform?: number[] | null;
  // Task #317 — master tech specs. `audio*` describe the as-served file
  // (what fans actually stream); `audioSource*` describe the archival
  // original (set when the upload pipeline transcoded a hi-res WAV/AIFF
  // master down to FLAC for browser playback). All nullable for legacy
  // rows that haven't been re-probed yet.
  audioFormat?: string | null;
  audioContainerExt?: string | null;
  audioSampleRate?: number | null;
  audioBitDepth?: number | null;
  audioChannels?: number | null;
  audioBytes?: number | null;
  audioSourceFormat?: string | null;
  audioSourceContainerExt?: string | null;
  audioSourceSampleRate?: number | null;
  audioSourceBitDepth?: number | null;
  audioSourceChannels?: number | null;
  audioSourceBytes?: number | null;
  // Task #541 — Vinyl-specific cut position. Null until the artist
  // touches the Vinyl-order view (we then seed from trackNumber).
  vinylSide?: "A" | "B" | "C" | "D" | null;
  vinylOrder?: number | null;
}

type Tab = "overview" | "tracks" | "sell" | "press" | "shopify" | "customers";
// Task #335 — the visible tab set is now driven by `sellMode` +
// `sellQuoteLockedAt`. Before the operator locks a quote we only show
// Overview/Tracks/Sell so the page stays focused on "decide what we're
// selling". Once locked, the fulfillment tabs unlock — Press for
// `direct`, Shopify for `shopify`, Bonus in both. The Press tab is
// NEVER shown in Shopify mode (the label fulfills the physical
// product themselves; there is no press to talk about).
function visibleTabsFor(
  album: {
    sellMode?: string | null;
    sellQuoteLockedAt?: string | null;
    isGoodTunesRelease?: boolean;
    isPrepping?: boolean;
    isSpinPromo?: boolean;
  },
  opts?: { hidePress?: boolean },
): { key: Tab; label: string }[] {
  // SPIN Promo albums are digital-only legacy releases. The Package /
  // Physical / Shopify manufacturing surfaces are irrelevant and are
  // dropped entirely — Overview + Digital only.
  if (album.isSpinPromo) {
    return [
      { key: "overview", label: "Overview" },
      { key: "tracks", label: "Digital" },
    ];
  }
  const base: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "sell", label: "Package" },
    { key: "tracks", label: "Digital" },
    // Task #645 — Splits used to live on its own tab here; the per-track
    // Splits tile inside each Tracks row replaced the matrix entirely.
    // The "Import from sheet" entry point moved to the Tracks tab's
    // Advanced menu. Any incoming `?tab=splits` URL falls back to the
    // default tab via the `allowed.has(tab)` guard in the render block.
  ];
  // Task #611 — Physical (direct) and Shopify (shopify) are always
  // visible regardless of `sellQuoteLockedAt` / Prepping state. Bill
  // runs the flow internally and demos at any point in an album's
  // life, so hiding the tab pre-lock created dead-clicks on the
  // Path-to-press strip (the `art` chip routed to a hidden tab and
  // did nothing). The panels themselves render their own pre-lock
  // empty/early states.
  // Task #1499 — Customers tab (per-album buyer roster) is operator-only,
  // hidden for artist/label partners (same gating as Physical, via
  // `hidePress`) and never for SPIN-promo (returned above). Appended after
  // the sell-mode-specific tabs so it always reads last in the bar.
  const withCustomers = (tabs: { key: Tab; label: string }[]) =>
    opts?.hidePress ? tabs : [...tabs, { key: "customers" as Tab, label: "Customers" }];
  if (album.sellMode === "direct") {
    // Artist and label partners don't manage manufacturing, so the Physical
    // tab (pressing plant + master preflight) is hidden for them for now.
    if (opts?.hidePress) return base;
    return withCustomers([...base, { key: "press", label: "Physical" }]);
  }
  if (album.sellMode === "shopify") {
    return withCustomers([...base, { key: "shopify", label: "Shopify" }]);
  }
  return withCustomers(base);
}

// Legacy "Migrate to Mux" admin action — removed 2026-05 once auto-ingest
// (POST/PUT/Dropbox-import hooks + boot-time backfill in server/routes.ts)
// made the migrate button entirely redundant. Per-row spinners on encoding

export function AdminAlbum() {
  const { user, isLoading: authLoading } = useAuth();
  const [, params] = useRoute<{ id: string }>("/admin/albums/:id");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Task #859 — an `artist` partner explores quotes only. The press
  // hand-off stepper is a production action that stays with operators,
  // so we hide it for the artist role (the server blocks it too).
  const { data: adminRoleInfo } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
    enabled: !!user?.isAdmin,
  });
  const isArtist = adminRoleInfo?.role === "artist";
  const isLabel = adminRoleInfo?.role === "label";
  // Hide the Physical/press section (pressing plant + master preflight) for
  // artist and label partners for now — manufacturing stays with operators.
  const hidePressSection = isArtist || isLabel;
  // Task #1250 / #1267 — artist *and* label partners get a single
  // (request-only) album-delete affordance: it routes to the sold-blocked
  // popup or the request-to-delete confirmation based on the album's sold
  // state, and queues a review request instead of deleting directly. The
  // direct-delete chrome (track multi-select, "delete all tracks") stays
  // operator-only for both partner kinds. The backend DELETE flow already
  // applies the sold-block / queue-a-request behavior to all partners.
  const partnerDelete = isArtist || isLabel;
  // Smart-back deep link: `/admin/albums/:id?track=<songId>` lands the
  // Tracks tab with that row already open + scrolled into view, so a
  // user returning from a credit-tapped Person page comes back to the
  // exact row they were inspecting. The param is read ONCE on mount
  // (and left in the URL so refreshes still work) — we don't fight
  // the user if they collapse the row afterwards.
  const search = useSearch();
  const initialTrackId = useMemo(() => {
    try {
      return new URLSearchParams(search).get("track");
    } catch {
      return null;
    }
    // Only honor the URL on first mount; subsequent search changes
    // (e.g. tab switches that may one day persist) shouldn't re-open
    // a row the user already closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Task #335 — `?onboarding=1` from "+ Add Album" lands the operator
  // on the Sell tab so the two-step mode modal opens directly over the
  // surface they're about to configure.
  const initialOnboarding = useMemo(() => {
    try {
      return new URLSearchParams(search).get("onboarding") === "1";
    } catch {
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Task #1007 / #1008 — smart-back target for the delete redirect, the
  // breadcrumb, and the not-found "Back to albums" link. Precedence:
  //   1. `?from=person&personId=…` → back to that Person (Task #468).
  //   2. `?from=albums&albumsReturn=<encoded list query>` → back to the Albums
  //      list with the operator's full view restored (tab + grid/list view +
  //      search + type/genre/date/explicit filters). `albumsTab=<tab>` is the
  //      legacy form (#1007) still honored for any in-flight links.
  //   3. Otherwise the canonical Albums list (Released default).
  const backToAlbumsHref = useMemo(() => {
    try {
      const sp = new URLSearchParams(search);
      if (sp.get("from") === "person") {
        const personId = sp.get("personId");
        if (personId) return `/admin/people/${personId}`;
      }
      if (sp.get("from") === "albums") {
        const ret = sp.get("albumsReturn");
        if (ret) return `/admin/albums?${ret}`;
        const t = sp.get("albumsTab");
        const valid = ["prepping", "staged", "live", "sunset"];
        if (t && valid.includes(t)) {
          return t === "live" ? "/admin/albums" : `/admin/albums?tab=${t}`;
        }
        return "/admin/albums";
      }
    } catch {
      /* malformed query string — fall through to the default */
    }
    return "/admin/albums";
  }, [search]);
  // Task #674 — Persist the active tab in the URL (`?tab=`) so a refresh
  // reopens the same tab instead of snapping back to Overview. Read once
  // on mount, AFTER the `track`/`onboarding` deep-link precedence above,
  // then fall back to Overview. Invalid/unknown values are ignored here;
  // a tab that isn't valid for the album's sell mode is corrected by the
  // re-pin effect + `safeTab` guard further down.
  const initialTab = useMemo(() => {
    try {
      const t = new URLSearchParams(search).get("tab");
      const valid: Tab[] = ["overview", "tracks", "sell", "press", "shopify", "customers"];
      return valid.includes(t as Tab) ? (t as Tab) : null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tab, setTab] = useState<Tab>(
    initialTrackId
      ? "tracks"
      : initialOnboarding
        ? "sell"
        : initialTab ?? "overview",
  );
  // Mode-picker modal state. Opens automatically when `sellMode` is
  // null (a fresh row), or when the operator clicks "Change mode" in
  // the Path-to-press strip. The album load is async, so the open
  // flag flips on the useEffect below once the row arrives.
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Task #1250 — Artist request-to-delete flow. Artists don't delete
  // directly: a sold album is blocked with a plain-language popup, and an
  // unsold album opens a "Request to delete" confirmation that fires a
  // review-queue request and shows a success state in place.
  const [artistDeleteSoldOpen, setArtistDeleteSoldOpen] = useState(false);
  const [artistDeleteRequestOpen, setArtistDeleteRequestOpen] = useState(false);
  const [artistDeleteRequested, setArtistDeleteRequested] = useState(false);
  // Task #1363 — when an album carries publishing data (mechanical-settlement
  // splits and/or a units-pressed figure), the delete-confirm dialog warns and
  // offers to move it onto another album first. `moveTargetId` is the picked
  // destination; the picker only opens once the operator chooses to move.
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState("");
  // Delete-options dropdown (replaces the standalone trashcan). The
  // dropdown can either delete the whole album, prime a multi-select
  // pass over the tracklist, or delete every track in one shot. The
  // multi-select pass renders checkboxes in the TrackRow (lifted state
  // so the trigger button up here knows the live selection count and
  // can re-label itself to "Delete N Tracks").
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Selection mode + its checkboxes only make sense on the Tracks tab. If
  // the operator wanders to Overview mid-selection, drop the mode so
  // the header reverts to the standalone delete-album trash button instead
  // of stranding a stale "Delete N Tracks" CTA on a tab that has no tracks
  // visible.
  useEffect(() => {
    if (tab !== "tracks" && selectionMode) {
      setSelectionMode(false);
      setSelectedTrackIds(new Set());
    }
  }, [tab, selectionMode]);

  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [deleteAllTracksOpen, setDeleteAllTracksOpen] = useState(false);
  // Artwork editor lives as a modal hanging off the page header thumbnail,
  // not as a dedicated panel on Overview. Operators rarely change cover
  // art — making it a hover-pencil → modal kills a whole inline card of
  // mostly-empty whitespace and removes the centered-then-flush-left
  // layout jump we had when toggling Edit on the old ArtworkPanel.
  const [artworkEditorOpen, setArtworkEditorOpen] = useState(false);
  const albumId = params?.id ?? "";

  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  const { data: album, isLoading, error } = useQuery<AlbumFull>({
    queryKey: ["/api/albums", albumId],
    enabled: !!user?.isAdmin && !!albumId,
    // While Mux is still encoding any track on this album (status is
    // `ingesting` or `preparing`), poll every 3s so the admin player and
    // the "Mux N/N" pill flip to `ready` the moment encoding finishes —
    // without the operator needing to click anything. Returns false once
    // every track with audio is `ready` (or has no audio), which stops
    // the interval.
    refetchInterval: (query) => {
      const songs = (query.state.data as AlbumFull | undefined)?.songs ?? [];
      const stillEncoding = songs.some(
        (s) =>
          !!s.audioUrl &&
          (s.muxStatus === "ingesting" || s.muxStatus === "preparing"),
      );
      return stillEncoding ? 3000 : false;
    },
  });

  const deleteAlbum = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/albums/${albumId}`);
    },
    onSuccess: () => {
      // Drop the stale detail cache entirely so the iframe doesn't re-show
      // an album that no longer exists.
      queryClient.removeQueries({ queryKey: ["/api/albums", albumId] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums"] });
      toast({ title: "Album deleted." });
      setDeleteConfirmOpen(false);
      // Task #468 — smart-back: when the operator arrived from a Person
      // page (`?from=person&personId=…`), return them to that Person
      // instead of dumping them on the global Albums list. Falls back
      // to `/admin/albums` for direct links + the canonical entry.
      navigate(backToAlbumsHref);
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't delete album",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  // Task #1363 — probe the publishing data the delete cascade would silently
  // take down (mechanical-settlement splits + units-pressed). Only runs while
  // the operator's delete-confirm dialog is open, so it's free for the common
  // case where there's nothing tied to the album.
  const { data: publishingImpact } = useQuery<{
    splitCount: number;
    songsWithSplits: number;
    unitsPressed: number;
    hasPublishingData: boolean;
  }>({
    queryKey: ["/api/admin/albums", albumId, "publishing-impact"],
    enabled: !!user?.isAdmin && !!albumId && deleteConfirmOpen,
  });

  // Candidate destinations for a move. Reuses the admin album list (every
  // release the operator can see), minus this album. Only fetched once the
  // operator opts into moving the data.
  const { data: moveCandidates } = useQuery<
    Array<{ id: string; title: string; artist: string | null }>
  >({
    queryKey: ["/api/albums"],
    enabled: !!user?.isAdmin && deleteConfirmOpen && showMovePicker,
  });

  const movePublishingData = useMutation({
    mutationFn: async (targetAlbumId: string) => {
      return await apiRequest(
        "POST",
        `/api/admin/albums/${albumId}/move-publishing-data`,
        { targetAlbumId },
      );
    },
    onSuccess: async (res: any) => {
      const data = await res.json().catch(() => ({}));
      const parts: string[] = [];
      if (data.movedSplits)
        parts.push(
          `${data.movedSplits} publishing ${data.movedSplits === 1 ? "split" : "splits"}`,
        );
      if (data.unitsMoved)
        parts.push(`${data.unitsMoved.toLocaleString()} units pressed`);
      toast({
        title: "Publishing data moved",
        description: parts.length
          ? `Moved ${parts.join(" and ")}. You can delete this album now.`
          : "You can delete this album now.",
      });
      // Re-probe so the warning clears and the dialog returns to a plain
      // delete; refresh both albums so the destination shows the moved tracks.
      setShowMovePicker(false);
      setMoveTargetId("");
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/albums", albumId, "publishing-impact"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId] });
      if (data.targetAlbumId)
        queryClient.invalidateQueries({
          queryKey: ["/api/albums", data.targetAlbumId],
        });
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't move publishing data",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  // Reset the move sub-flow whenever the delete dialog closes so a re-open
  // always starts from the plain warning, never a half-filled picker.
  useEffect(() => {
    if (!deleteConfirmOpen) {
      setShowMovePicker(false);
      setMoveTargetId("");
    }
  }, [deleteConfirmOpen]);

  // Task #1250 — Artist request-to-delete. Hits the same DELETE endpoint,
  // which (for partner callers) writes a review-queue request instead of
  // deleting. We DON'T navigate away — the album still exists until a
  // super-admin approves — and flip the dialog into its success state.
  const requestDeleteAlbum = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/albums/${albumId}`);
    },
    onSuccess: () => {
      setArtistDeleteRequested(true);
    },
    onError: (e: any) => {
      // A 403 with the sold reason means the album sold between render and
      // confirm — switch the artist to the blocked popup instead.
      const msg = e?.message || "";
      if (msg.includes("sold")) {
        setArtistDeleteRequestOpen(false);
        setArtistDeleteSoldOpen(true);
        return;
      }
      toast({
        title: "Couldn't send your request",
        description: msg || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  // Bulk-delete N songs. No dedicated bulk endpoint exists yet, so we
  // fan out parallel DELETEs against /api/admin/songs/:id. If any one
  // fails the whole mutation rejects — the cache invalidation in
  // onSettled still runs so the operator sees whatever made it through.
  const bulkDeleteSongs = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) => apiRequest("DELETE", `/api/admin/songs/${id}`)),
      );
      return ids.length;
    },
    onSuccess: (count) => {
      toast({
        title: `Deleted ${count} ${count === 1 ? "track" : "tracks"}.`,
      });
      setDeleteSelectedOpen(false);
      setDeleteAllTracksOpen(false);
      setSelectionMode(false);
      setSelectedTrackIds(new Set());
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't delete tracks",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
    },
  });

  // Task #335 — SKU feed for the top-of-page Path-to-press stepper so
  // its stage-completion mirrors real state (package / price / qty /
  // upload preflight). SellPanel queries the same key so both stay in
  // sync via the TanStack cache.
  const { data: albumSkus } = useQuery<{ skus: any[]; addons: any[] }>({
    queryKey: ["/api/admin/albums", albumId, "skus"],
    enabled: !!album?.sellMode,
  });

  // Task #454 — Path-to-press chip navigation. The chips live in
  // <PressingOrderStepper> above the tabs; they dispatch a window
  // CustomEvent and this listener routes the page to the right tab +
  // anchors the `art` chip on the album-header cover thumbnail. The
  // in-Sell anchors (package / price / quantity / submit) are handled
  // by SellPanel's own listener once we switch into the Sell tab — the
  // pending-key slot in pathToPressNav.ts bridges the gap on tabs that
  // haven't mounted SellPanel yet.
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent<PathToPressNavigateDetail>).detail?.key;
      if (!key) return;
      if (key === "art") {
        // "Upload art" in the Path-to-press strip means *press-ready*
        // jacket / label / hype-sticker files — not the digital cover
        // thumbnail in the page header. Task #611 — the Physical tab
        // is always visible in direct mode now, so we land on the
        // Press preflight dropzone. Shopify mode has no `press` tab
        // (label fulfills the physical product themselves; there is
        // no plant preflight to run) — route to the always-visible
        // Sell tab's cover-art editor instead, which is the closest
        // real-art surface the slim Shopify panel exposes.
        if (album?.sellMode === "shopify") {
          // Shopify mode has no `press` tab (label fulfills the
          // physical product themselves; there is no plant preflight
          // to run). The closest real "edit the art" surface is the
          // album-cover button in the page header, which is always
          // mounted regardless of which tab is active — just flash it.
          const el = document.querySelector(
            '[data-testid="button-edit-album-cover"]',
          ) as HTMLElement | null;
          if (el) scrollAndFlash(el, { focus: true });
          return;
        }
        setTab("press");
        const tryAnchor = (attempt: number) => {
          const panel = document.querySelector(
            '[data-testid="panel-upload-validations-art"]',
          ) as HTMLElement | null;
          if (panel) {
            // input-preflight-file is a hidden <input type="file">, so
            // focusing it scrolls to nothing. Prefer the visible upload
            // button; otherwise just flash the panel without stealing
            // focus.
            const button = panel.querySelector(
              '[data-testid="button-preflight-upload"]',
            ) as HTMLElement | null;
            scrollAndFlash(button ?? panel, { focus: !!button });
            return;
          }
          if (attempt < 8) window.setTimeout(() => tryAnchor(attempt + 1), 40);
        };
        requestAnimationFrame(() => tryAnchor(0));
        return;
      }
      // Slim Shopify variant: "Masters on file" jumps to the Tracks
      // tab; "Cover art" is handled above; "Live on Shopify" goes to
      // the Sell tab where the slim panel's publish CTA lives.
      const isShopify = album?.sellMode === "shopify";
      if (isShopify && key === "package") {
        setTab("tracks");
        // Wait for the tracks panel to mount, then flash + focus a
        // masters-related control inside it (not just the tab button).
        // Prefer the toggle that opens the Add-track / upload-masters
        // tray; fall back to the empty-state Add-first-track CTA, and
        // finally to the panel itself.
        const tryAnchor = (attempt: number) => {
          const focusable = document.querySelector(
            '[data-testid="button-toggle-add-track"], [data-testid="button-add-first-track"], [data-testid="button-bulk-add-tracks-empty"]',
          ) as HTMLElement | null;
          const panel =
            (document.querySelector('[data-testid="panel-tracks"]') ??
              document.querySelector(
                '[data-testid="panel-tracks-empty"]',
              )) as HTMLElement | null;
          if (focusable || panel) {
            scrollAndFlash(focusable ?? panel, { focus: !!focusable });
            return;
          }
          if (attempt < 8) window.setTimeout(() => tryAnchor(attempt + 1), 40);
        };
        requestAnimationFrame(() => tryAnchor(0));
        return;
      }
      // Everything else lives in the Sell tab.
      setTab("sell");
    };
    window.addEventListener(PATH_TO_PRESS_NAVIGATE_EVENT, handler);
    return () => window.removeEventListener(PATH_TO_PRESS_NAVIGATE_EVENT, handler);
  }, [album?.sellMode]);

  // Task #440 — Promote ("Mark as released") / Demote ("Move back to
  // prepping"). Rides the same PUT endpoint as every other album edit, so
  // partner-permissions + post-sale lock apply automatically (the gate
  // returns 403 for partners without `edit_metadata`; super-admins always
  // pass). Demote shows a confirm dialog because pulling a Released row
  // back is a meaningful state regression; promote is the happy path and
  // fires on click.
  const [demoteConfirmOpen, setDemoteConfirmOpen] = useState(false);
  const setPrepping = useMutation({
    mutationFn: async (next: boolean) => {
      const r = await apiRequest("PUT", `/api/admin/albums/${albumId}`, {
        isPrepping: next,
      });
      return r.json();
    },
    onSuccess: (_data, next) => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums"] });
      setDemoteConfirmOpen(false);
      toast({
        title: next ? "Moved back to Prepping." : "Album marked as released.",
      });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't update lifecycle",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Task #499 — pre-check whether the caller can save edits to this
  // album so the "Change mode" affordance can disable itself with a
  // tooltip BEFORE the operator clicks (instead of toasting a 403 on
  // submit). Same query key as AlbumEditAccessChip so this is a cache
  // hit. Super-admin / in-scope partners always pass; the chrome only
  // dims for out-of-scope partners or unrelaxed lock states.
  const { data: albumEditAccess } = useQuery<{
    canEdit: boolean;
    locked: boolean;
    hasActiveOverride: boolean;
    requiresApproval: boolean;
    missingPermissions: string[];
  }>({
    queryKey: ["/api/admin/albums", albumId, "edit-access"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/albums/${albumId}/edit-access`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });
  // Mode changes are operational (Task #499) — they bypass the
  // post-sale lock on the server but still require edit_metadata +
  // scope. Dim "Change mode" when the caller lacks either, so they
  // see the block reason BEFORE the click instead of toasting a 403.
  // A bare post-sale lock (with edit_metadata granted) is NOT a
  // reason to dim — the operational bypass means the save will land.
  const modeChangeBlocked =
    !!albumEditAccess &&
    (albumEditAccess.missingPermissions.includes("out_of_scope") ||
      albumEditAccess.missingPermissions.includes("edit_metadata"));
  const modeChangeBlockedReason = !modeChangeBlocked
    ? undefined
    : albumEditAccess?.missingPermissions.includes("out_of_scope")
      ? "This album isn't managed by your team"
      : "Your team doesn't have edit access on this album";

  // Task #335 — sell-mode + format + lock toggle live on the album
  // row. One mutation writes any subset; we use it for the modal
  // submit, the "Change mode" link in the Shopify slim panel, and the
  // Lock/Unlock CTA at the bottom of the direct Sell panel.
  const updateAlbumMode = useMutation({
    mutationFn: async (patch: {
      sellMode?: "direct" | "shopify";
      physicalFormat?: string | null;
      sellQuoteLockedAt?: boolean | null;
      anticipatedTrackCount?: number | null;
    }) => {
      const r = await apiRequest("PUT", `/api/admin/albums/${albumId}`, patch);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't update sell mode",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Task #335 — re-pin the active tab to "overview" whenever a mode/lock
  // change (or SPIN-promo toggle) drops the current tab from the allowed
  // set (e.g. operator is on Press, hits Change → Shopify; Press
  // disappears, so we send them back to Overview instead of leaving them
  // on a now-hidden tab). Must live below the `album` useQuery above to
  // avoid TDZ on `album` in the dependency array.
  useEffect(() => {
    if (!album) return;
    const allowed = visibleTabsFor(album, { hidePress: hidePressSection }).map((t) => t.key);
    if (!allowed.includes(tab)) setTab("overview");
  }, [album?.sellMode, album?.sellQuoteLockedAt, album?.isGoodTunesRelease, album?.isPrepping, album?.isSpinPromo, tab, album, hidePressSection]);

  // Task #674 — Mirror the active tab into the URL (`?tab=`) so a refresh
  // reopens the same tab. Uses `replace` so repeated tab clicks don't
  // stack history entries, and the early-return when the param already
  // matches keeps identical re-selections from looping the navigate.
  // Existing query params (e.g. the `track`/`onboarding` deep links) are
  // preserved so their first-mount precedence still works.
  useEffect(() => {
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(search);
    } catch {
      params = new URLSearchParams();
    }
    if (params.get("tab") === tab) return;
    params.set("tab", tab);
    const qs = params.toString();
    navigate(`/admin/albums/${albumId}${qs ? `?${qs}` : ""}`, { replace: true });
  }, [tab, albumId, search, navigate]);

  // Auto-open the mode picker once the row arrives without a sellMode.
  // Backfill ran on existing rows, so the modal really only fires for
  // freshly-created albums or rows that were manually NULL'd.
  useEffect(() => {
    if (album && !album.sellMode) {
      setModeDialogOpen(true);
    }
  }, [album?.sellMode, album?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openInClassicAdmin = () => {
    try {
      localStorage.setItem("gt:admin:entity", "albums");
      const raw = localStorage.getItem("gt:admin:selectedByEntity");
      const prev = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        "gt:admin:selectedByEntity",
        JSON.stringify({ ...prev, albums: albumId }),
      );
    } catch {
      /* localStorage unavailable — classic admin will fall back to default */
    }
    navigate("/admin");
  };

  if (authLoading || isLoading) {
    return (
      <AdminFrame active="albums">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }

  if (!user?.isAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <p className="text-slate-500 text-sm">Admin only.</p>
      </main>
    );
  }

  if (error || !album) {
    return (
      <AdminFrame active="albums">
        <div className="py-20 text-center space-y-3">
          <h1 className="text-slate-900 text-lg font-semibold">
            Album not found
          </h1>
          <Link
            href={backToAlbumsHref}
            className="text-[var(--brand-blue)] text-sm hover:underline inline-flex items-center gap-1"
            data-testid="link-back-to-albums"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to albums
          </Link>
        </div>
      </AdminFrame>
    );
  }

  // Lifecycle pill — derived from the same logic the Albums grid uses.
  // Task #440 — `isPrepping` is the canonical Prepping gate for curated
  // GoodTunes releases. Imported streaming rows (!isGoodTunesRelease) are
  // never shown on this page in practice, but we still render them as
  // Prepping for safety so the pill never goes blank.
  const lifecycle = album.isHidden
    ? { label: "Sunset", tone: "amber" as const }
    : !album.isGoodTunesRelease || album.isPrepping
      ? { label: "Prepping", tone: "slate" as const }
      : { label: "Released", tone: "mint" as const };

  return (
    <AdminFrame
      active="albums"
      contentWidth="narrow"
      preview={{
        phone: <AlbumPreviewCard album={album} />,
        tablet: <AlbumDesktopPreviewCard album={album} />,
      }}
    >
      <div className="space-y-6">
        {/* BREADCRUMB */}
        <div className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-medium">
          <Link
            href={backToAlbumsHref}
            className="hover:text-slate-700"
            data-testid="link-breadcrumb-albums"
          >
            Albums
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 font-semibold truncate max-w-[420px]">
            {album.title}
          </span>
        </div>

        {/* HEADER — pulled tight under the breadcrumb so the album
            content starts closer to the tab bar, matching the top
            rhythm of the other admin pages (the default space-y-6 left
            too much air between the thin breadcrumb and the title). */}
        <div className="flex items-start gap-5 justify-between -mt-3">
          <div className="flex items-start gap-5 min-w-0 flex-1">
          {/* Cover thumbnail doubles as the artwork editor trigger. The
              pencil chip reveals on hover (always on for keyboard focus
              + touch via focus-visible). Clicking opens the full editor
              modal — the same drop zone + paste-URL + remove flow we
              used to render inline as a dedicated panel. */}
          <button
            type="button"
            onClick={() => setArtworkEditorOpen(true)}
            className="group relative w-24 h-24 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2"
            aria-label="Edit album artwork"
            data-testid="button-edit-album-cover"
          >
            {album.artwork ? (
              <img
                src={album.artwork}
                alt=""
                className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]"
                data-testid="img-album-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">
                <ImagePlus className="w-7 h-7" strokeWidth={1.5} />
              </div>
            )}
            {/* Dim scrim + pencil chip on hover. Gray chip (slate-200)
                with a slate-700 pencil — softer than the previous white
                chip, and the deeper scrim makes the pill pop on any
                cover (bright or dark). */}
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 group-focus-visible:bg-black/40 transition-colors" />
            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
              <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 inline-flex items-center justify-center shadow-lg ring-1 ring-black/5">
                <Pencil className="w-4 h-4" />
              </span>
            </span>
          </button>
          <ArtworkPanel
            album={album}
            open={artworkEditorOpen}
            onOpenChange={setArtworkEditorOpen}
          />
          <div className="flex-1 min-w-0">
            <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-2 flex-wrap">
              <span>
                {album.type} ·{" "}
                {/* Artist name is a deep-link into the People CMS when the
                    album is bound to a Person row (primaryArtistId). Same
                    admin-chrome link treatment we want app-wide: inherits
                    the slate caps styling at rest, picks up the brand
                    blue + underline on hover/focus. When no Person is
                    linked yet, we render the snapshot string as plain
                    text — no broken link target. */}
                {album.primaryArtistId ? (
                  <Link
                    href={`/admin/people/${album.primaryArtistId}`}
                    className="text-slate-400 hover:text-[var(--brand-blue)] hover:underline underline-offset-2 focus-visible:text-[var(--brand-blue)] focus-visible:underline focus-visible:outline-none rounded-sm transition-colors"
                    data-testid={`link-album-artist-${album.primaryArtistId}`}
                  >
                    {album.artist}
                  </Link>
                ) : (
                  <span>{album.artist}</span>
                )}
              </span>
              {/* Album-level Explicit chip — read-only, derived from any
                  track being marked explicit on the Tracks tab. Lives
                  next to the lifecycle pill so the operator sees the
                  same "E" the fan will see, with no toggle to confuse
                  it with the per-track switch. Slate tone matches the
                  admin chrome (white card, slate text). */}
              {album.isExplicit && <ExplicitBadge tone="slate" />}
              <LifecyclePill {...lifecycle} />
              {/* Task #440 — Promote/Demote affordance lives next to the
                  lifecycle pill so the state + the action that mutates it
                  read as one unit. Hidden in Sunset (operator un-hides via
                  the existing Hidden toggle first). The button rides the
                  same PUT edit_metadata gate as every other field, so it
                  hides cleanly for partners who can't edit. */}
              {!album.isHidden && (
                album.isPrepping || !album.isGoodTunesRelease ? (
                  <button
                    type="button"
                    onClick={() => setPrepping.mutate(false)}
                    disabled={setPrepping.isPending}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/10 disabled:opacity-50 transition-colors"
                    data-testid="button-album-promote"
                    title="Promote this album from Prepping to Released"
                  >
                    Mark as released
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDemoteConfirmOpen(true)}
                    disabled={setPrepping.isPending}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 transition-colors"
                    data-testid="button-album-demote"
                    title="Move this album back to Prepping (hidden from fans)"
                  >
                    Move to prepping
                  </button>
                )
              )}
              {album.firstSoldAt && <AlbumLockChip album={album} />}
              <AlbumEditAccessChip albumId={album.id} />
              
              {album.isHidden && (
                <span
                  className="inline-flex items-center gap-1 text-amber-700 text-[10.5px] font-medium normal-case tracking-normal"
                  title="Pulled from sale — owners keep access"
                >
                  <EyeOff className="w-3 h-3" />
                  Hidden from store
                </span>
              )}
              {/* Task #799 — TEMPORARY admin-only "SPIN Promo" indicator.
                  Lit when the operator flags a digital-only legacy release
                  (toggle lives in the Overview tab). No fan-facing effect. */}
              {album.isSpinPromo && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold normal-case tracking-normal text-[color:var(--brand-purple)] bg-[color:var(--brand-purple)]/10"
                  title="SPIN Promo — digital-only legacy release (admin-only tag, no fan-facing effect)"
                  data-testid="badge-spin-promo-sheet"
                >
                  <Disc3 className="w-3 h-3" />
                  SPIN Promo
                </span>
              )}
              {/* Album-level Explicit toggle removed — now derived
                  server-side from per-song flags (any explicit song →
                  album reads explicit). The per-track toggle in the
                  Tracks tab is the single source of truth. The album's
                  `isExplicit` column survives as a manual override
                  path (no UI), should we ever need to advisory-mark a
                  record whose songs are all clean. */}
            </div>
            <h1
              className="text-slate-900 text-[26px] font-bold tracking-tight mt-0.5 truncate"
              data-testid="heading-album-title"
            >
              {album.title}
            </h1>
            <div className="text-slate-500 text-[13px] mt-0.5 flex items-center gap-3 flex-wrap">
              {album.year && <span>{album.year}</span>}
              <span className="inline-flex items-center gap-1">
                <Music className="w-3 h-3" />
                {album.songs.length}{" "}
                {album.songs.length === 1 ? "track" : "tracks"}
              </span>
              {album.label && <span>· {album.label.name}</span>}
            </div>
          </div>
          </div>
        </div>

        {/* Task #335 — Path-to-press strip lives ABOVE the tab bar so
            it's visible from every tab on the album page (not just
            Sell). The stepper adapts by mode — slim 3-stage strip
            for shopify, full 5-stage press flow for direct. Suppressed
            until the operator picks a sellMode in the modal.
            SPIN Promo albums are digital-only — no manufacturing flow. */}
        {album.sellMode && !isArtist && !album.isSpinPromo && (
          <div className="mt-2">
            <PressingOrderStepper
              albumId={album.id}
              skus={albumSkus?.skus ?? []}
              mode={album.sellMode === "shopify" ? "shopify" : "direct"}
              onChangeMode={() => setModeDialogOpen(true)}
            />
          </div>
        )}

        {/* TABS — Overview/Tracks/Bonus on the LEFT, gray trash icon
            on the RIGHT, both riding the same hairline. The trash hover
            reveals a "Delete" label on its left (Apple-Mac toolbar
            pattern). Opens a rose-tinted confirm sheet per replit.md. */}
        <div
          className="flex items-end justify-between gap-5 border-b border-slate-200"
          data-testid="tabs-admin-album"
        >
          <div className="flex items-center gap-5 overflow-x-auto min-w-0 scrollbar-hide">
            {visibleTabsFor(album, { hidePress: hidePressSection }).map((t) => (
              <button
                key={t.key}
                onClick={(e) =>
                  anchorScrollToElement(e.currentTarget, () => setTab(t.key))
                }
                className={[
                  "relative pb-2.5 text-[13.5px] font-semibold whitespace-nowrap transition-colors",
                  tab === t.key
                    ? "text-slate-900"
                    : "text-slate-400 hover:text-slate-700",
                ].join(" ")}
                data-testid={`tab-${t.key}`}
              >
                {t.label}
                {tab === t.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--brand-blue)] rounded-full" />
                )}
              </button>
            ))}
          </div>
          {/* Delete Options dropdown — replaces the standalone trashcan.
              Same visual chrome as the Tracks-tab "Advanced" menu so the
              two top-level actions on the album feel like a matched
              pair. In multi-select mode the trigger collapses into a
              "Delete N Tracks" call-to-action (rose-tinted when N>0,
              slate-100 when N=0) plus a Cancel-out-of-selection link. */}
          {partnerDelete ? (
            // Task #1250 / #1267 — Artists and labels get a single
            // album-delete affordance (no track multi-select / delete-all
            // chrome). The click routes to the sold-blocked popup or the
            // request-to-delete confirmation based on the album's sold state.
            <button
              type="button"
              onClick={() => {
                setArtistDeleteRequested(false);
                if (album.firstSoldAt) {
                  setArtistDeleteSoldOpen(true);
                } else {
                  setArtistDeleteRequestOpen(true);
                }
              }}
              aria-label="Delete album"
              className="group inline-flex items-center gap-1.5 h-7 px-1.5 mb-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 flex-shrink-0"
              data-testid="button-request-delete-album"
            >
              <span className="text-[12px] font-medium opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                Delete
              </span>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : selectionMode ? (
            <div className="flex items-center gap-2 mb-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedTrackIds(new Set());
                }}
                className="text-[12px] font-medium text-slate-500 hover:text-slate-800 px-1.5 py-1"
                data-testid="button-cancel-track-selection"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setDeleteSelectedOpen(true)}
                disabled={selectedTrackIds.size === 0}
                className={
                  "px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition-colors " +
                  (selectedTrackIds.size === 0
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-rose-600 text-white hover:bg-rose-700")
                }
                data-testid="button-delete-selected-tracks"
              >
                <Trash2 className="w-3 h-3" />
                Delete {selectedTrackIds.size}{" "}
                {selectedTrackIds.size === 1 ? "Track" : "Tracks"}
              </button>
            </div>
          ) : tab !== "tracks" ? (
            // Overview tab: the operator only needs the "nuke this
            // album" path; the multi-track delete options are scoped to
            // the Tracks tab where the checkboxes actually live.
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deleteAlbum.isPending}
              aria-label="Delete album"
              className="group inline-flex items-center gap-1.5 h-7 px-1.5 mb-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 flex-shrink-0"
              data-testid="button-delete-album"
            >
              <span className="text-[12px] font-medium opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                Delete
              </span>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="group inline-flex items-center gap-1.5 h-7 px-1.5 mb-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 data-[state=open]:text-rose-600 data-[state=open]:bg-rose-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 flex-shrink-0"
                data-testid="button-delete-options"
                aria-label="Delete options"
                disabled={deleteAlbum.isPending}
              >
                <span className="text-xs font-medium opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:opacity-100 transition-opacity">
                  Delete
                </span>
                <Trash2 className="w-3.5 h-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="min-w-[260px] p-1.5 bg-white text-slate-900 border border-slate-200 shadow-lg"
              >
                <DropdownMenuItem
                  onSelect={() => setDeleteConfirmOpen(true)}
                  data-testid="menu-delete-album"
                  className="gap-2.5 px-2.5 py-2 text-[12.5px] cursor-pointer focus:bg-rose-50 focus:text-rose-700"
                >
                  <Trash2 className="w-4 h-4 text-slate-500" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900">
                      Delete album
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Removes the album and every track on it.
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    // Auto-switch to Tracks so the checkboxes are
                    // visible the instant the operator picks them.
                    setTab("tracks");
                    setSelectedTrackIds(new Set());
                    setSelectionMode(true);
                  }}
                  disabled={album.songs.length === 0}
                  data-testid="menu-delete-selected-tracks"
                  className="gap-2.5 px-2.5 py-2 text-[12.5px] cursor-pointer focus:bg-slate-100 focus:text-slate-900 data-[disabled]:opacity-50"
                >
                  <ListChecks className="w-4 h-4 text-slate-500" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900">
                      Delete selected tracks…
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Pick individual tracks with checkboxes.
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setDeleteAllTracksOpen(true)}
                  disabled={album.songs.length === 0}
                  data-testid="menu-delete-all-tracks"
                  className="gap-2.5 px-2.5 py-2 text-[12.5px] cursor-pointer focus:bg-slate-100 focus:text-slate-900 data-[disabled]:opacity-50"
                >
                  <Trash2 className="w-4 h-4 text-slate-500" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900">
                      Delete all tracks
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Clears the tracklist; keeps the album.
                    </div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </>
          )}
        </div>

        {/* TAB CONTENT — gated on the same allowed-set the tab bar
            uses. When sellMode flips (e.g. Direct → Shopify via the
            "Change" affordance), Press disappears from the bar AND
            from the content area, so a stale `tab === "press"` value
            never renders the wrong panel. The useEffect below pins
            `tab` back to "sell" whenever the current tab leaves the
            allowed set. */}
        {(() => {
          const allowed = new Set(visibleTabsFor(album, { hidePress: hidePressSection }).map((t) => t.key));
          const safeTab: Tab = allowed.has(tab) ? tab : "overview";
          return (
            <>
              {safeTab === "overview" && allowed.has("overview") && (
                <OverviewPanel album={album} />
              )}
              {safeTab === "tracks" && allowed.has("tracks") && (
                <TracksPanel
                  album={album}
                  onEdit={openInClassicAdmin}
                  highlightTrackId={initialTrackId}
                  selectionMode={selectionMode}
                  selectedTrackIds={selectedTrackIds}
                  onToggleTrack={(id) =>
                    setSelectedTrackIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                />
              )}
              {safeTab === "sell" && allowed.has("sell") && (
                <SellPanel
                  albumId={album.id}
                  albumTitle={album.title}
                  artistName={album.artist}
                  primaryArtistId={album.primaryArtistId ?? null}
                  artworkUrl={album.artwork}
                  sellMode={album.sellMode ?? null}
                  physicalFormat={album.physicalFormat ?? null}
                  sellQuoteLockedAt={album.sellQuoteLockedAt ?? null}
                  trackCount={album.songs.length}
                  totalRuntimeSec={album.songs.reduce(
                    (sum, s) => sum + (s.duration ?? 0),
                    0,
                  )}
                  anticipatedTrackCount={album.anticipatedTrackCount ?? null}
                  onAnticipatedTrackCountChange={(next) =>
                    updateAlbumMode.mutate({ anticipatedTrackCount: next })
                  }
                  onLockToggle={(next) => updateAlbumMode.mutate({ sellQuoteLockedAt: next })}
                  onChangeMode={() => setModeDialogOpen(true)}
                  changeModeDisabled={modeChangeBlocked}
                  changeModeDisabledReason={modeChangeBlockedReason}
                  onEditArtwork={() => setArtworkEditorOpen(true)}
                />
              )}
              {safeTab === "press" && allowed.has("press") && (
                <PressPanel
                  albumId={album.id}
                  songs={album.songs}
                  physicalFormat={album.physicalFormat ?? null}
                  vinylFormat={(album.vinylFormat as any) ?? null}
                />
              )}
              {safeTab === "shopify" && allowed.has("shopify") && (
                <ShopifyPanel
                  albumId={album.id}
                  album={album}
                  onJumpToTab={(t) => {
                    if (t === "overview") setArtworkEditorOpen(true);
                    else setTab(t as Tab);
                  }}
                />
              )}
              {safeTab === "customers" && allowed.has("customers") && (
                <AlbumCustomersPanel albumId={album.id} />
              )}
            </>
          );
        })()}
      </div>

      {/* Destructive confirm sheet — names the album being destroyed
          and lists what goes with it (per replit.md rule). Rose-tinted
          primary button; Cancel sits on the left so the thumb defaults
          away from destruction. */}
      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(v) => !deleteAlbum.isPending && setDeleteConfirmOpen(v)}
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-delete-album"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-slate-900 pr-8">
              Delete <span className="italic">{album.title}</span>?
            </DialogTitle>
            <DialogDescription className="text-[13px] font-normal text-slate-500">
              This removes the album, all {album.songs.length}{" "}
              {album.songs.length === 1 ? "track" : "tracks"}, their masters,
              snippets, lyrics, credits, and any playlist references.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {/* Task #1363 — publishing-data guard. The soft-delete cascade
              silently takes down the mechanical-settlement splits (they ride
              on the album's songs) and the units-pressed figure. Surface what
              would be lost and offer to move it onto another album first. */}
          {publishingImpact?.hasPublishingData && (
            <div
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2"
              data-testid="warning-publishing-impact"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-900 space-y-1">
                  <p className="font-medium">
                    This album carries mechanical-settlement publishing data.
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
                    {publishingImpact.splitCount > 0 && (
                      <li data-testid="text-impact-splits">
                        {publishingImpact.splitCount} publishing{" "}
                        {publishingImpact.splitCount === 1 ? "split" : "splits"}{" "}
                        across {publishingImpact.songsWithSplits}{" "}
                        {publishingImpact.songsWithSplits === 1
                          ? "track"
                          : "tracks"}
                      </li>
                    )}
                    {publishingImpact.unitsPressed > 0 && (
                      <li data-testid="text-impact-units">
                        {publishingImpact.unitsPressed.toLocaleString()} units
                        pressed
                      </li>
                    )}
                  </ul>
                  <p className="text-amber-800">
                    Deleting removes it from payout runs. Move it to another
                    album to keep it.
                  </p>
                </div>
              </div>

              {!showMovePicker ? (
                <Button
                  type="button"
                  onClick={() => setShowMovePicker(true)}
                  disabled={deleteAlbum.isPending}
                  className="w-full bg-white text-amber-900 border border-amber-300 shadow-sm hover:bg-amber-100 h-9"
                  data-testid="button-move-publishing-open"
                >
                  Move publishing data to another album…
                </Button>
              ) : (
                <div className="space-y-2 pt-1">
                  <Select
                    value={moveTargetId}
                    onValueChange={setMoveTargetId}
                    disabled={movePublishingData.isPending}
                  >
                    <SelectTrigger
                      className="bg-white border-amber-300 text-slate-900 h-9"
                      data-testid="select-move-target"
                    >
                      <SelectValue placeholder="Choose destination album…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(moveCandidates ?? [])
                        .filter((a) => a.id !== albumId)
                        .map((a) => (
                          <SelectItem
                            key={a.id}
                            value={a.id}
                            data-testid={`option-move-target-${a.id}`}
                          >
                            {a.title}
                            {a.artist ? ` — ${a.artist}` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    onClick={() => movePublishingData.mutate(moveTargetId)}
                    disabled={!moveTargetId || movePublishingData.isPending}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white h-9"
                    data-testid="button-move-publishing-confirm"
                  >
                    {movePublishingData.isPending
                      ? "Moving…"
                      : "Move publishing data"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Cancel uses an explicit white/slate secondary because the
              global `outline` shadcn variant resolves to `bg-background`,
              which is the brand navy in this dark-mode-default theme —
              so without the override Cancel renders as a dark pill on
              the admin's white dialog. Breathing-room gap before the
              destructive button per the destructive-actions rule, so a
              thumb can't slide from Cancel into Delete. */}
          <DialogFooter className="gap-3 sm:gap-3">
            <Button
              type="button"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleteAlbum.isPending || movePublishingData.isPending}
              className="bg-white text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-50"
              data-testid="button-delete-album-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => deleteAlbum.mutate()}
              disabled={deleteAlbum.isPending || movePublishingData.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white ml-2"
              data-testid="button-delete-album-confirm"
            >
              {deleteAlbum.isPending
                ? "Deleting…"
                : publishingImpact?.hasPublishingData
                  ? "Delete anyway"
                  : "Delete album"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task #1250 — Artist sold-album blocked popup. No request is
          created; we simply explain a sold album can't be removed.
          Slate (informational) chrome, single dismiss action. */}
      <Dialog open={artistDeleteSoldOpen} onOpenChange={setArtistDeleteSoldOpen}>
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-album-sold-blocked"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-slate-900 pr-8">
              This album can’t be deleted
            </DialogTitle>
            <DialogDescription className="text-[13px] font-normal text-slate-500">
              <span className="italic">{album.title}</span> is sold, and cannot
              be deleted. Reach out to GoodTunes if you need help with this
              release.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => setArtistDeleteSoldOpen(false)}
              className="bg-white text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-50"
              data-testid="button-album-sold-dismiss"
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task #1250 — Artist request-to-delete confirmation. Unsold albums
          only. Confirming queues a review request (no immediate delete);
          the dialog flips to a success state in place rather than
          navigating away, because the album still exists until a
          super-admin approves. */}
      <Dialog
        open={artistDeleteRequestOpen}
        onOpenChange={(v) => {
          if (requestDeleteAlbum.isPending) return;
          setArtistDeleteRequestOpen(v);
          if (!v) setArtistDeleteRequested(false);
        }}
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-request-delete-album"
        >
          {artistDeleteRequested ? (
            <>
              <DialogHeader className="text-left space-y-1">
                <DialogTitle className="text-[17px] font-semibold text-slate-900 pr-8">
                  Request sent
                </DialogTitle>
                <DialogDescription className="text-[13px] font-normal text-slate-500">
                  Your request was sent to GoodTunes for review. We’ll let you
                  know once it’s been approved or declined — nothing has been
                  removed yet.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    setArtistDeleteRequestOpen(false);
                    setArtistDeleteRequested(false);
                  }}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                  data-testid="button-request-delete-done"
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader className="text-left space-y-1">
                <DialogTitle className="text-[17px] font-semibold text-slate-900 pr-8">
                  Request to delete{" "}
                  <span className="italic">{album.title}</span>?
                </DialogTitle>
                <DialogDescription className="text-[13px] font-normal text-slate-500">
                  This sends a deletion request to GoodTunes for review. The
                  album stays live until it’s approved. We’ll notify you with
                  the decision.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-3 sm:gap-3">
                <Button
                  type="button"
                  onClick={() => setArtistDeleteRequestOpen(false)}
                  disabled={requestDeleteAlbum.isPending}
                  className="bg-white text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-50"
                  data-testid="button-request-delete-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => requestDeleteAlbum.mutate()}
                  disabled={requestDeleteAlbum.isPending}
                  className="bg-rose-600 hover:bg-rose-700 text-white ml-2"
                  data-testid="button-request-delete-confirm"
                >
                  {requestDeleteAlbum.isPending
                    ? "Sending…"
                    : "Request to delete album"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Task #440 — Demote confirm. Pulling a Released album back to
          Prepping hides it from every fan-side surface (Collection,
          ArtistDetail, search), so we name what changes before flipping
          the gate. Slate tone — not destructive, but reversible-with-
          consequences. */}
      <Dialog
        open={demoteConfirmOpen}
        onOpenChange={(v) => !setPrepping.isPending && setDemoteConfirmOpen(v)}
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-demote-album"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-slate-900 pr-8">
              Move <span className="italic">{album.title}</span> back to Prepping?
            </DialogTitle>
            <DialogDescription className="text-[13px] font-normal text-slate-500">
              Fans will stop seeing this album in Collection, on the
              artist page, and in search. Purchases already made are not
              affected — owners keep access. You can mark it released
              again whenever it's ready.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-3 sm:gap-3">
            <Button
              type="button"
              onClick={() => setDemoteConfirmOpen(false)}
              disabled={setPrepping.isPending}
              className="bg-white text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-50"
              data-testid="button-demote-album-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => setPrepping.mutate(true)}
              disabled={setPrepping.isPending}
              className="bg-slate-900 hover:bg-slate-800 text-white ml-2"
              data-testid="button-demote-album-confirm"
            >
              {setPrepping.isPending ? "Moving…" : "Move to Prepping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete-selected-tracks confirm sheet. Mirrors the album-delete
          dialog: names the things being destroyed (truncated past 8),
          rose-tinted primary, breathing-room gap on Cancel. */}
      <Dialog
        open={deleteSelectedOpen}
        onOpenChange={(v) =>
          !bulkDeleteSongs.isPending && setDeleteSelectedOpen(v)
        }
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-delete-selected-tracks"
        >
          {(() => {
            const ids = Array.from(selectedTrackIds);
            const picked = album.songs
              .filter((s) => selectedTrackIds.has(s.id))
              .sort((a, b) => a.trackNumber - b.trackNumber);
            const previewNames = picked.slice(0, 8).map((s) => s.title);
            const overflow = picked.length - previewNames.length;
            return (
              <>
                <DialogHeader className="text-left space-y-1">
                  <DialogTitle className="text-[17px] font-semibold text-slate-900">
                    Delete {ids.length}{" "}
                    {ids.length === 1 ? "track" : "tracks"}?
                  </DialogTitle>
                  <DialogDescription className="text-[13px] font-normal text-slate-500">
                    This removes their masters, snippets, lyrics, credits,
                    and any playlist references. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                {previewNames.length > 0 && (
                  <ul
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-700 max-h-40 overflow-y-auto"
                    data-testid="list-delete-selected-names"
                  >
                    {previewNames.map((n) => (
                      <li
                        key={n}
                        className="truncate py-0.5"
                        title={n}
                      >
                        {n}
                      </li>
                    ))}
                    {overflow > 0 && (
                      <li className="text-slate-500 italic py-0.5">
                        + {overflow} more
                      </li>
                    )}
                  </ul>
                )}
                <DialogFooter className="gap-3 sm:gap-3">
                  <Button
                    type="button"
                    onClick={() => setDeleteSelectedOpen(false)}
                    disabled={bulkDeleteSongs.isPending}
                    className="bg-white text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-50"
                    data-testid="button-delete-selected-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => bulkDeleteSongs.mutate(ids)}
                    disabled={bulkDeleteSongs.isPending || ids.length === 0}
                    className="bg-rose-600 hover:bg-rose-700 text-white ml-2"
                    data-testid="button-delete-selected-confirm"
                  >
                    {bulkDeleteSongs.isPending
                      ? "Deleting…"
                      : `Delete ${ids.length} ${ids.length === 1 ? "track" : "tracks"}`}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete-all-tracks confirm sheet. Same shape as the selected
          variant; operates over every song on the album. Keeps the
          album shell intact (artwork, metadata, credits) so the
          operator can rebuild the tracklist from scratch. */}
      <Dialog
        open={deleteAllTracksOpen}
        onOpenChange={(v) =>
          !bulkDeleteSongs.isPending && setDeleteAllTracksOpen(v)
        }
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-delete-all-tracks"
        >
          {(() => {
            const all = [...album.songs].sort(
              (a, b) => a.trackNumber - b.trackNumber,
            );
            const ids = all.map((s) => s.id);
            const previewNames = all.slice(0, 8).map((s) => s.title);
            const overflow = all.length - previewNames.length;
            return (
              <>
                <DialogHeader className="text-left space-y-1">
                  <DialogTitle className="text-[17px] font-semibold text-slate-900">
                    Delete all {all.length}{" "}
                    {all.length === 1 ? "track" : "tracks"} from{" "}
                    <span className="italic">{album.title}</span>?
                  </DialogTitle>
                  <DialogDescription className="text-[13px] font-normal text-slate-500">
                    Removes every master, snippet, lyric, credit, and
                    playlist reference. The album shell stays — you can
                    rebuild the tracklist after. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                {previewNames.length > 0 && (
                  <ul
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-700 max-h-40 overflow-y-auto"
                    data-testid="list-delete-all-names"
                  >
                    {previewNames.map((n) => (
                      <li
                        key={n}
                        className="truncate py-0.5"
                        title={n}
                      >
                        {n}
                      </li>
                    ))}
                    {overflow > 0 && (
                      <li className="text-slate-500 italic py-0.5">
                        + {overflow} more
                      </li>
                    )}
                  </ul>
                )}
                <DialogFooter className="gap-3 sm:gap-3">
                  <Button
                    type="button"
                    onClick={() => setDeleteAllTracksOpen(false)}
                    disabled={bulkDeleteSongs.isPending}
                    className="bg-white text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-50"
                    data-testid="button-delete-all-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => bulkDeleteSongs.mutate(ids)}
                    disabled={bulkDeleteSongs.isPending || ids.length === 0}
                    className="bg-rose-600 hover:bg-rose-700 text-white ml-2"
                    data-testid="button-delete-all-confirm"
                  >
                    {bulkDeleteSongs.isPending
                      ? "Deleting…"
                      : `Delete ${ids.length} ${ids.length === 1 ? "track" : "tracks"}`}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Task #335 — two-step "how is this album sold?" modal. Opens
          automatically when the album has no sellMode (fresh-from-
          creation) and can be reopened via "Change mode" in the Sell
          panel. Non-dismissable while `sellMode` is still null so the
          operator can't escape to a half-configured page. */}
      <NewAlbumModeDialog
        open={modeDialogOpen}
        required={!album.sellMode}
        busy={updateAlbumMode.isPending}
        onClose={() => setModeDialogOpen(false)}
        onRequestDelete={() => setDeleteConfirmOpen(true)}
        onSubmit={({ sellMode, physicalFormat }) => {
          updateAlbumMode.mutate(
            { sellMode, physicalFormat },
            {
              onSuccess: () => setModeDialogOpen(false),
            },
          );
        }}
      />
    </AdminFrame>
  );
}

/* ─── Post-sale lock chip ──────────────────────────────────────────── */
//
// Task #79 — When `albums.firstSoldAt` is set, partner roles can no
// longer edit metadata directly; their PUTs land in the pending-changes
// queue. This chip surfaces the lock state to *any* admin so it's clear
// why a partner's edits are getting routed for review. Super-admin gets
// a click target that opens a small "Unlock for partner edits" dialog
// that posts an admin_overrides row (single-shot by default).
function AlbumLockChip({ album }: { album: AlbumFull }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: role } = useQuery<{ role: string }>({ queryKey: ["/api/me/role"] });
  const isSuperAdmin = role?.role === "super_admin";

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [windowed, setWindowed] = useState(false);

  const grant = useMutation({
    mutationFn: async () => {
      const expiresAt = windowed ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
      const r = await apiRequest("POST", `/api/admin/albums/${album.id}/overrides`, {
        reason: reason.trim(),
        expiresAt,
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/albums", album.id, "overrides"] });
      toast({ title: "Unlock granted.", description: "Partner can now apply one metadata edit." });
      setOpen(false);
      setReason("");
      setWindowed(false);
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't grant unlock",
        description: e?.message || "Try again.",
        variant: "destructive",
      });
    },
  });

  const soldAt = album.firstSoldAt ? new Date(album.firstSoldAt).toLocaleDateString() : "";
  const chip = (
    <span
      className={
        "inline-flex items-center gap-1 text-amber-700 text-[10.5px] font-medium normal-case tracking-normal" +
        (isSuperAdmin ? " cursor-pointer hover:text-amber-800" : "")
      }
      title={`Locked for partner edits — first sold ${soldAt}`}
      data-testid="badge-album-locked"
      onClick={isSuperAdmin ? () => setOpen(true) : undefined}
    >
      <Lock className="w-3 h-3" />
      Locked
    </span>
  );

  if (!isSuperAdmin) return chip;

  return (
    <>
      {chip}
      <Dialog open={open} onOpenChange={(v) => !grant.isPending && setOpen(v)}>
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-album-unlock"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-slate-900">
              Unlock <span className="italic">{album.title}</span> for partner edits
            </DialogTitle>
            <DialogDescription className="text-[13px] font-normal text-slate-500">
              This album is locked after its first paid sale. Granting an override lets a partner
              push one metadata edit directly; we'll record who, when, and why for audit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[12px] text-slate-700">Reason</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. fixing a typo in the track-3 title"
                className="mt-1 text-[13px]"
                data-testid="textarea-unlock-reason"
              />
            </div>
            <label className="flex items-center gap-2 text-[12.5px] text-slate-700">
              <input
                type="checkbox"
                checked={windowed}
                onChange={(e) => setWindowed(e.target.checked)}
                data-testid="checkbox-unlock-windowed"
              />
              Allow edits for 24 hours (instead of a single edit)
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              onClick={() => setOpen(false)}
              disabled={grant.isPending}
              className="bg-white text-slate-900 border border-slate-200 hover:bg-slate-50"
              data-testid="button-unlock-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => grant.mutate()}
              disabled={grant.isPending || !reason.trim()}
              className="bg-[var(--brand-blue)] text-white hover:opacity-90"
              data-testid="button-unlock-grant"
            >
              {grant.isPending ? "Granting…" : "Grant unlock"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Per-user edit-access affordance ──────────────────────────────── */
//
// Task #79 — a tiny chip the partner sees when their session can't
// directly edit this album. We render nothing for super-admins (they
// always canEdit) and nothing for partners who can save freely, so
// the header stays quiet in the happy path. The chip is a hint, not
// a gate — the server still has the final say via the PUT middleware.
function AlbumEditAccessChip({ albumId }: { albumId: string }) {
  const { data } = useQuery<{
    canEdit: boolean;
    locked: boolean;
    hasActiveOverride: boolean;
    requiresApproval: boolean;
    missingPermissions: string[];
  }>({
    queryKey: ["/api/admin/albums", albumId, "edit-access"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/albums/${albumId}/edit-access`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });
  if (!data) return null;
  if (data.canEdit && !data.requiresApproval) return null;
  const label = !data.canEdit
    ? data.locked && !data.hasActiveOverride
      ? "Locked — ask GoodTunes to unlock"
      : data.missingPermissions.includes("edit_metadata")
        ? "Read-only for your team"
        : data.missingPermissions.includes("out_of_scope")
          ? "View only"
          : "Read-only"
    : "Edits go to GoodTunes for review";
  return (
    <span
      className="inline-flex items-center gap-1 text-slate-600 text-[10.5px] font-medium normal-case tracking-normal bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5"
      data-testid="badge-album-edit-access"
      title={label}
    >
      {label}
    </span>
  );
}

/* ─── Overview tab ─────────────────────────────────────────────────── */

/**
 * Task #799 — TEMPORARY admin-only "SPIN Promo (digital-only legacy)"
 * toggle. Self-contained: flips `albums.isSpinPromo` via the shared album
 * PUT (same Save semantics + edit_metadata gate as every other album
 * boolean). Auto-saves on toggle, no separate Save button. ZERO fan-facing
 * behavior — purely a CMS tag the operator uses to mark older digital-only
 * releases while retiring their printing/pressing tabs. When the flag is
 * retired, delete this component, its render in OverviewPanel, the header
 * badge, the AdminAlbums tile/row badges, and the schema column together.
 */
function SpinPromoPanel({
  album,
  disabled,
  disabledReason,
}: {
  album: AlbumFull;
  disabled: boolean;
  disabledReason?: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const setSpinPromo = useMutation({
    mutationFn: async (next: boolean) => {
      const r = await apiRequest("PUT", `/api/admin/albums/${album.id}`, {
        isSpinPromo: next,
      });
      return r.json();
    },
    onSuccess: (_data, next) => {
      qc.invalidateQueries({ queryKey: ["/api/albums", album.id] });
      qc.invalidateQueries({ queryKey: ["/api/albums"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/albums"] });
      toast({
        title: next ? "Flagged as SPIN Promo." : "SPIN Promo flag cleared.",
      });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't update SPIN Promo",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4"
      data-testid="panel-spin-promo"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Disc3 className="w-4 h-4 text-[color:var(--brand-purple)]" />
            <span className="text-sm font-semibold text-slate-900">
              SPIN Promo (digital-only legacy)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-snug">
            Admin-only marker for older digital-only releases. Saves
            immediately. No fan-facing effect — Library, lifecycle, and
            playback are unchanged.
          </p>
          {disabled && disabledReason && (
            <p className="text-xs text-amber-700 mt-1">{disabledReason}</p>
          )}
        </div>
        <Switch
          checked={!!album.isSpinPromo}
          disabled={disabled || setSpinPromo.isPending}
          onCheckedChange={(v) => setSpinPromo.mutate(v)}
          data-testid="switch-spin-promo"
          aria-label="SPIN Promo (digital-only legacy)"
        />
      </div>
    </div>
  );
}

// Task #965 / Task #1310 — two-part artist/album share-link editor.
// Operator sets both the artist slug (shared across all of that artist's
// releases; stored on the person row) and the album slug (stored on the
// album row), each saving independently on blur/enter. Self-contained
// panel (EditablePanel has no two-field copy-button type). Album slug
// saves ride the standard PUT /api/admin/albums/:id edit_metadata gate +
// post-sale lock (so `disabled` freezes that input when the album is
// locked); artist slug always editable for admins.

// Robust copy: the async Clipboard API rejects (or silently hangs) in a
// cross-origin/unfocused iframe like the Replit workspace preview, which left
// the Copy button looking dead — no "Copied", no error. Try it, then fall back
// to a hidden-textarea execCommand so the copy + success feedback still fire.
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path below */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// Task #1310 — two-part artist/album share link panel.
// Artist part (first segment) is stored on the person row (artist-wide,
// affects all of that artist's releases). Album part (second segment) is
// stored on the album row. Both fields save independently on blur/enter.
function ShareLinkPanel({
  album,
  disabled,
  disabledReason,
}: {
  album: AlbumFull;
  disabled: boolean;
  disabledReason?: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Artist slug (person.artistShareSlug) ───────────────────────────────
  const artistId = album.primaryArtistId ?? null;
  // Single source of truth for the bound primary-artist record: use the
  // shared default fetcher (same queryFn every other observer of this key
  // uses) so there's no stale/wrong-shape cross-talk with the sibling
  // queries in AlbumLineupPanel / SellPanel. The server's person
  // projection now includes artistShareSlug, so the field reads back the
  // canonical persisted value after a save.
  const { data: personData } = useQuery<{ artistShareSlug?: string | null; name?: string } | null>({
    queryKey: ["/api/people", artistId],
    enabled: !!artistId,
  });
  // Task #1379 — read the album's post-sale "locked" signal so we can show a
  // soft caution (NOT a block) when an operator changes an already-saved
  // Artist URL on a release that has started selling. Same query key the
  // OverviewPanel/AlbumEditAccessChip use, so this is a cache hit.
  const { data: shareEditAccess } = useQuery<{ locked: boolean; requiresApproval?: boolean }>({
    queryKey: ["/api/admin/albums", album.id, "edit-access"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/albums/${album.id}/edit-access`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });
  const albumPostSale = !!shareEditAccess?.locked;
  // Don't silently auto-default when this session's edits would divert to the
  // GoodTunes review queue (approval-mode partner) — that would file a pending
  // change just for opening the page. Auto-defaulting is for the happy path.
  const autoDefaultBlocked = !!shareEditAccess?.requiresApproval;
  const savedArtistSlug = personData?.artistShareSlug ?? "";
  const [artistDraft, setArtistDraft] = useState(savedArtistSlug);
  const [artistSuggesting, setArtistSuggesting] = useState(false);
  useEffect(() => { setArtistDraft(savedArtistSlug); }, [savedArtistSlug]);

  const artistValidation = artistDraft.trim() === "" ? null : validateShareSlug(artistDraft);
  const artistLocalError = artistValidation && !artistValidation.ok ? artistValidation.reason : null;
  const artistNormalized = normalizeShareSlug(artistDraft);
  const artistIsDirty = artistNormalized !== savedArtistSlug;

  const saveArtist = useMutation({
    mutationFn: async (next: string | null) => {
      const r = await apiRequest("PUT", `/api/admin/people/${artistId}`, {
        artistShareSlug: next,
      });
      // apiRequest resolves on ANY 2xx, including the 202 the partner-edit
      // gate returns when an approval-mode edit is diverted to the review
      // queue (nothing written). Carry the status through so onSuccess can
      // tell a real write from a pending change.
      const body = await r.json().catch(() => null);
      return { status: r.status, body };
    },
    onSuccess: (result) => {
      if (result.status === 202) {
        // Diverted to the review queue — NOT persisted. Leave the draft
        // showing the still-unsaved value rather than claiming it saved.
        toast({
          title: "Sent for review",
          description:
            result.body?.message ||
            "Your artist URL change was sent to GoodTunes for review.",
        });
        return;
      }
      qc.invalidateQueries({ queryKey: ["/api/people", artistId] });
      toast({ title: "Artist URL saved." });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't save artist URL",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
      setArtistDraft(savedArtistSlug);
    },
  });

  const commitArtist = () => {
    if (!artistId || saveArtist.isPending) return;
    const trimmed = artistDraft.trim();
    if (trimmed === "") {
      if (savedArtistSlug !== "") saveArtist.mutate(null);
      return;
    }
    if (!artistValidation?.ok) return;
    if (artistValidation.slug === savedArtistSlug) { setArtistDraft(savedArtistSlug); return; }
    setArtistDraft(artistValidation.slug);
    saveArtist.mutate(artistValidation.slug);
  };

  const checkArtistAvailable = async (slug: string): Promise<boolean> => {
    if (!artistId) return false;
    try {
      const r = await apiRequest(
        "GET",
        `/api/admin/people/${artistId}/artist-share-slug-available?slug=${encodeURIComponent(slug)}`,
      );
      const data = await r.json();
      return !!data.available;
    } catch { return false; }
  };

  // Find an available artist slug derived from the artist's name. Returns the
  // first free candidate, or null when there's no name to suggest from.
  const findAvailableArtistSlug = async (): Promise<string | null> => {
    const v = validateShareSlug(personData?.name ?? album.artist ?? "");
    if (!v.ok) return null;
    for (let n = 1; n <= 9; n++) {
      const candidate = n === 1 ? v.slug : `${v.slug}-${n}`;
      const cv = validateShareSlug(candidate);
      if (!cv.ok) continue;
      if (await checkArtistAvailable(cv.slug)) return cv.slug;
    }
    return v.slug; // all taken — surface the base so the operator can tweak it
  };

  const suggestArtist = async () => {
    if (!artistId || disabled || saveArtist.isPending || artistSuggesting) return;
    setArtistSuggesting(true);
    try {
      const slug = await findAvailableArtistSlug();
      if (!slug) { toast({ title: "No artist name to suggest from." }); return; }
      setArtistDraft(slug);
    } finally { setArtistSuggesting(false); }
  };

  // Task #1314 — one-tap migration fix: an album with its own slug but no
  // artist slug has a dead share link (two-part links need both halves). This
  // suggests AND immediately saves the artist slug so the link goes live.
  const needsArtistMigration = !!(artistId && album.shareSlug && !savedArtistSlug);
  const suggestAndSaveArtist = async () => {
    if (!artistId || disabled || saveArtist.isPending || artistSuggesting) return;
    setArtistSuggesting(true);
    try {
      const slug = await findAvailableArtistSlug();
      if (!slug) { toast({ title: "No artist name to suggest from." }); return; }
      setArtistDraft(slug);
      saveArtist.mutate(slug);
    } finally { setArtistSuggesting(false); }
  };

  // ── Album slug (albums.shareSlug) ──────────────────────────────────────
  const [albumDraft, setAlbumDraft] = useState(album.shareSlug ?? "");
  const [albumSuggesting, setAlbumSuggesting] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setAlbumDraft(album.shareSlug ?? ""); }, [album.shareSlug]);

  const savedAlbumSlug = album.shareSlug ?? "";
  const albumValidation = albumDraft.trim() === "" ? null : validateShareSlug(albumDraft);
  const albumLocalError = albumValidation && !albumValidation.ok ? albumValidation.reason : null;
  const albumNormalized = normalizeShareSlug(albumDraft);
  const albumIsDirty = albumNormalized !== savedAlbumSlug;

  const saveAlbum = useMutation({
    mutationFn: async (next: string | null) => {
      const r = await apiRequest("PUT", `/api/admin/albums/${album.id}`, {
        shareSlug: next,
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/albums", album.id] });
      qc.invalidateQueries({ queryKey: ["/api/admin/albums"] });
      toast({ title: "Album URL saved." });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't save album URL",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
      setAlbumDraft(savedAlbumSlug);
    },
  });

  const commitAlbum = () => {
    if (disabled || saveAlbum.isPending) return;
    const trimmed = albumDraft.trim();
    if (trimmed === "") {
      if (savedAlbumSlug !== "") saveAlbum.mutate(null);
      return;
    }
    if (!albumValidation?.ok) return;
    if (albumValidation.slug === savedAlbumSlug) { setAlbumDraft(savedAlbumSlug); return; }
    setAlbumDraft(albumValidation.slug);
    saveAlbum.mutate(albumValidation.slug);
  };

  const checkAlbumAvailable = async (slug: string): Promise<boolean> => {
    try {
      const r = await apiRequest(
        "GET",
        `/api/admin/albums/${album.id}/share-slug-available?slug=${encodeURIComponent(slug)}`,
      );
      const data = await r.json();
      return !!data.available;
    } catch { return false; }
  };

  // Find an available album slug derived from the album's title (then
  // artist + title as a secondary base). Returns the first free candidate,
  // or null when there's no title to suggest from. Mirrors the manual
  // suggestAlbum() walk but returns the slug instead of setting the draft.
  const findAvailableAlbumSlug = async (): Promise<string | null> => {
    const bases: string[] = [];
    for (const raw of [album.title, `${album.artist} ${album.title}`]) {
      const v = validateShareSlug(raw ?? "");
      if (v.ok && !bases.includes(v.slug)) bases.push(v.slug);
    }
    if (bases.length === 0) return null;
    for (const base of bases) {
      for (let n = 1; n <= 9; n++) {
        const candidate = n === 1 ? base : `${base}-${n}`;
        const v = validateShareSlug(candidate);
        if (!v.ok) continue;
        if (await checkAlbumAvailable(v.slug)) return v.slug;
      }
    }
    return bases[0]; // all taken — surface the base so the operator can tweak it
  };

  const suggestAlbum = async () => {
    if (disabled || saveAlbum.isPending || albumSuggesting) return;
    const bases: string[] = [];
    for (const raw of [album.title, `${album.artist} ${album.title}`]) {
      const v = validateShareSlug(raw ?? "");
      if (v.ok && !bases.includes(v.slug)) bases.push(v.slug);
    }
    if (bases.length === 0) {
      toast({ title: "Couldn't suggest", description: "This release needs a title to suggest from." });
      return;
    }
    setAlbumSuggesting(true);
    try {
      let fallback = "";
      for (const base of bases) {
        if (!fallback) fallback = base;
        for (let n = 1; n <= 9; n++) {
          const candidate = n === 1 ? base : `${base}-${n}`;
          const v = validateShareSlug(candidate);
          if (!v.ok) continue;
          if (await checkAlbumAvailable(v.slug)) { setAlbumDraft(v.slug); return; }
        }
      }
      setAlbumDraft(fallback);
      toast({ title: "Suggestion may be taken", description: "Tweak it before saving." });
    } finally { setAlbumSuggesting(false); }
  };

  // ── Task #1379 — auto-default both URLs from the real names ────────────
  // When the panel opens for a release that has a primary artist but no
  // saved Artist URL, derive a URL-safe default from the real artist name
  // and save it — no manual "Suggest" click needed. Same for the Album URL
  // from the album title. Idempotent: each side is attempted at most once
  // per id (keyed by artistId / album.id), only fires when the value is
  // genuinely missing, never overwrites an operator's value, and won't run
  // while editing is frozen (post-sale lock / read-only). Reuses the same
  // availability + per-person/per-artist uniqueness checks "Suggest" uses,
  // falling back to a numbered variant when the base name is taken.
  const autoArtistAttemptedFor = useRef<string | null>(null);
  const autoAlbumAttemptedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!artistId || disabled || autoDefaultBlocked) return;
    if (personData === undefined) return; // person not loaded yet — don't assume "missing"
    if (savedArtistSlug) return;          // already has one — never overwrite
    if (saveArtist.isPending) return;
    if (autoArtistAttemptedFor.current === artistId) return;
    autoArtistAttemptedFor.current = artistId;
    (async () => {
      const slug = await findAvailableArtistSlug();
      if (slug && !savedArtistSlug) {
        setArtistDraft(slug);
        saveArtist.mutate(slug);
      }
    })();
  }, [artistId, disabled, autoDefaultBlocked, personData, savedArtistSlug, saveArtist.isPending]);

  useEffect(() => {
    if (!artistId || disabled || autoDefaultBlocked) return; // link needs an artist half
    if (savedAlbumSlug) return;           // already has one — never overwrite
    if (saveAlbum.isPending) return;
    if (autoAlbumAttemptedFor.current === album.id) return;
    autoAlbumAttemptedFor.current = album.id;
    (async () => {
      const slug = await findAvailableAlbumSlug();
      if (slug && !savedAlbumSlug) {
        setAlbumDraft(slug);
        saveAlbum.mutate(slug);
      }
    })();
  }, [album.id, artistId, disabled, autoDefaultBlocked, savedAlbumSlug, saveAlbum.isPending]);

  // ── Computed full URL + copy/open ─────────────────────────────────────
  const fullUrl = (savedArtistSlug && savedAlbumSlug)
    ? shareUrlForSlugs(savedArtistSlug, savedAlbumSlug)
    : "";
  const copyableArtist = savedArtistSlug || (artistValidation?.ok ? artistValidation.slug : "");
  const copyableAlbum = savedAlbumSlug || (albumValidation?.ok ? albumValidation.slug : "");
  const copyUrl = (copyableArtist && copyableAlbum)
    ? shareUrlForSlugs(copyableArtist, copyableAlbum)
    : "";

  const canPreview = !!(savedArtistSlug && savedAlbumSlug);
  const openPreview = () => {
    if (!canPreview) return;
    const win = window.open(`/${savedArtistSlug}/${savedAlbumSlug}`, "_blank");
    if (win) { try { win.opener = null; } catch { /* harmless */ } }
  };
  const copy = async () => {
    if (!copyUrl) return;
    const ok = await copyTextToClipboard(copyUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast({ title: "Couldn't copy", description: copyUrl, variant: "destructive" });
    }
  };

  const anyPending = saveArtist.isPending || saveAlbum.isPending;

  // Task #1379 — empty-field placeholders preview the actual release (the
  // normalized real artist name / album title), not the old hardcoded
  // "nightbirde" / "its-ok" strings.
  const artistPlaceholder = normalizeShareSlug(personData?.name ?? album.artist ?? "") || "artist";
  const albumPlaceholder = normalizeShareSlug(album.title ?? "") || "album";

  // Task #1379 — soft caution (NOT a block) when an operator changes an
  // already-saved Artist URL on a release that has started selling. The
  // artist URL is shared across every one of that artist's releases, so
  // changing it post-sale could break existing share links / affect
  // in-progress sales. We still let the save go through.
  const showArtistChangeWarning =
    !!savedArtistSlug && albumPostSale && artistIsDirty && !!artistNormalized;

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4"
      data-testid="panel-share-link"
    >
      <div className="flex items-center gap-1.5">
        <Link2 className="w-4 h-4 text-[color:var(--brand-blue)]" />
        <span className="text-sm font-semibold text-slate-900">Share link</span>
      </div>
      <p className="text-xs text-slate-500 mt-1 leading-snug">
        Two-part shareable URL: <span className="font-medium text-slate-700">{SHARE_LINK_HOST}/<em>artist</em>/<em>album</em></span>.
        Artist part is shared across all of that artist's releases.
      </p>
      {disabled && disabledReason && (
        <p className="text-xs text-amber-700 mt-1">{disabledReason}</p>
      )}

      {!artistId ? (
        <p className="text-xs text-amber-700 mt-3 p-2 bg-amber-50 rounded-md border border-amber-200">
          Set a primary artist on the Overview tab first to enable the share link.
        </p>
      ) : (
        <>
          {/* Task #1314 — migration banner: this album's slug is set but the
              artist slug is missing, so the two-part link is dead until fixed. */}
          {needsArtistMigration && (
            <div
              className="mt-3 p-2.5 bg-amber-50 rounded-md border border-amber-200"
              data-testid="banner-share-link-incomplete"
            >
              <p className="text-xs text-amber-800 leading-snug">
                This release has an album URL but no artist URL, so its share link
                won't work yet. Set an artist URL to finish the link.
              </p>
              <button
                type="button"
                onClick={suggestAndSaveArtist}
                disabled={disabled || saveArtist.isPending || artistSuggesting}
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--brand-blue)] hover:underline disabled:opacity-50 disabled:no-underline"
                data-testid="button-suggest-save-artist-slug"
              >
                {artistSuggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {artistSuggesting ? "Saving…" : "Suggest & save artist URL"}
              </button>
            </div>
          )}

          {/* Artist URL field */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-600">Artist URL</span>
              <button
                type="button"
                onClick={suggestArtist}
                disabled={disabled || saveArtist.isPending || artistSuggesting}
                className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand-blue)] hover:underline disabled:opacity-50 disabled:no-underline"
                data-testid="button-suggest-artist-slug"
              >
                {artistSuggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {artistSuggesting ? "Checking…" : "Suggest"}
              </button>
            </div>
            <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 focus-within:border-[color:var(--brand-blue)] overflow-hidden">
              <span className="pl-2.5 pr-1 text-xs text-slate-400 whitespace-nowrap select-none">
                {SHARE_LINK_HOST}/
              </span>
              <Input
                value={artistDraft}
                disabled={saveArtist.isPending}
                onChange={(e) => setArtistDraft(e.target.value)}
                onBlur={commitArtist}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                placeholder={artistPlaceholder}
                className="h-8 border-0 bg-transparent px-1 focus-visible:ring-0 shadow-none"
                data-testid="input-artist-share-slug"
              />
            </div>
            {artistLocalError ? (
              <p className="text-xs text-rose-600 mt-1" data-testid="text-artist-slug-error">{artistLocalError}</p>
            ) : artistIsDirty && artistNormalized ? (
              <p className="text-xs text-slate-500 mt-1">Saves as <span className="font-medium text-slate-700">{artistNormalized}</span></p>
            ) : savedArtistSlug ? (
              <p className="text-xs text-slate-500 mt-1">Affects all of {personData?.name ?? album.artist}'s releases.</p>
            ) : null}
            {/* Task #1379 — soft caution on changing an already-saved artist
                URL after this release has started selling. Not a block. */}
            {showArtistChangeWarning && (
              <p
                className="text-xs text-amber-700 mt-1.5 p-2 bg-amber-50 rounded-md border border-amber-200 leading-snug"
                data-testid="text-artist-slug-change-warning"
              >
                This release has started selling. The Artist URL is shared across
                every one of {personData?.name ?? album.artist}'s releases, so
                changing it can break existing share links and affect in-progress
                sales. You can still save.
              </p>
            )}
          </div>

          {/* Album URL field */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-600">Album URL</span>
              <button
                type="button"
                onClick={suggestAlbum}
                disabled={disabled || saveAlbum.isPending || albumSuggesting}
                className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand-blue)] hover:underline disabled:opacity-50 disabled:no-underline"
                data-testid="button-suggest-share-slug"
              >
                {albumSuggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {albumSuggesting ? "Checking…" : "Suggest"}
              </button>
            </div>
            <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 focus-within:border-[color:var(--brand-blue)] overflow-hidden">
              <span className="pl-2.5 pr-1 text-xs text-slate-400 whitespace-nowrap select-none">
                {savedArtistSlug ? `${savedArtistSlug}/` : "artist/"}
              </span>
              <Input
                value={albumDraft}
                disabled={disabled || saveAlbum.isPending}
                onChange={(e) => setAlbumDraft(e.target.value)}
                onBlur={commitAlbum}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                placeholder={albumPlaceholder}
                className="h-8 border-0 bg-transparent px-1 focus-visible:ring-0 shadow-none"
                data-testid="input-share-slug"
              />
            </div>
            {albumLocalError ? (
              <p className="text-xs text-rose-600 mt-1" data-testid="text-share-slug-error">{albumLocalError}</p>
            ) : albumIsDirty && albumNormalized ? (
              <p className="text-xs text-slate-500 mt-1">Saves as <span className="font-medium text-slate-700">{albumNormalized}</span></p>
            ) : null}
          </div>

          {/* Full URL + action buttons */}
          <div className="mt-3 flex items-center gap-2">
            {fullUrl ? (
              <p className="flex-1 text-xs text-slate-500 truncate" data-testid="text-share-link-url">
                {fullUrl}
              </p>
            ) : (
              <p className="flex-1 text-xs text-slate-400 italic">
                Set both fields to get the full link.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="h-8 shrink-0"
              disabled={!canPreview || anyPending}
              onMouseDown={(e) => e.preventDefault()}
              onClick={openPreview}
              data-testid="button-open-share-link"
              title="Open this page in a new tab using your admin session."
            >
              <ExternalLink className="w-4 h-4" />
              <span className="ml-1.5">Open</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-8 shrink-0"
              disabled={!copyUrl}
              onClick={copy}
              data-testid="button-copy-share-link"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span className="ml-1.5">{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

type ArtistLabelConflict = {
  personId: string;
  personName: string;
  fromLabelId: string;
  fromLabelName: string;
  toLabelId: string;
  toLabelName: string;
};

// Task #846 — re-run the Tidal/Deezer/Pandora resolver for an album that
// was imported before the resolver shipped (or where Odesli was
// rate-limited at import time). Only fills NULL link columns server-side;
// an operator's manual link is never overwritten.
//
// Task #856 — also show this for albums WITHOUT an Apple Music URL when
// their Spotify link is still blank: Spotify resolves off artist + title
// (not the Apple collection id), so it can be filled even though
// Tidal/Deezer/Pandora stay on search (those need Apple via Odesli).
function RefreshStreamingLinksButton({ album }: { album: AlbumFull }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const hasApple = !!(album.appleMusicUrl && /\/album\/[^/]+\/\d+/.test(album.appleMusicUrl));
  // Without an Apple album id, Spotify is the only thing we can resolve —
  // so the button is still useful as long as the Spotify link is blank.
  const spotifyOnly = !hasApple && !album.spotifyUrl;
  const mut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "POST",
        `/api/admin/albums/${album.id}/refresh-streaming-links`,
      );
      return (await r.json()) as { filledCount: number; attempted?: string[] };
    },
    onSuccess: async (data) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["/api/albums", album.id] }),
        qc.invalidateQueries({ queryKey: ["/api/albums"] }),
      ]);
      const spotifyOnlyAttempt =
        Array.isArray(data.attempted) &&
        data.attempted.length === 1 &&
        data.attempted[0] === "spotify";
      toast({
        title:
          data.filledCount > 0
            ? `Filled ${data.filledCount} streaming link${data.filledCount === 1 ? "" : "s"}`
            : "No new links found",
        description:
          data.filledCount > 0
            ? "Existing links were left untouched."
            : spotifyOnlyAttempt
              ? "Spotify either resolved already or has no confident match. (No Apple URL, so Tidal/Deezer/Pandora can't be resolved.)"
              : "Tidal/Deezer/Pandora/Spotify either resolved already or have no match.",
      });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't refresh streaming links",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });
  if (!hasApple && !spotifyOnly) return null;
  return (
    <button
      type="button"
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
      data-testid="button-refresh-streaming-links"
      title={
        hasApple
          ? "Re-resolve Tidal/Deezer/Pandora (+ Spotify) links from Apple Music (fills blanks only)"
          : "Resolve a Spotify link from artist + title (fills blank only; no Apple URL so Tidal/Deezer/Pandora stay on search)"
      }
      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 px-3 h-7 text-xs font-semibold transition-colors disabled:opacity-50"
    >
      {mut.isPending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <RotateCcw className="w-3.5 h-3.5" />
      )}
      Refresh links
    </button>
  );
}

function OverviewPanel({ album }: { album: AlbumFull }) {
  const invalidate: (readonly unknown[])[] = [
    ["/api/albums", album.id],
    ["/api/albums"],
  ];
  const endpoint = `/api/admin/albums/${album.id}`;
  const qc = useQueryClient();
  const { toast } = useToast();
  // Task #644 — when the server detects the album's primary artist is
  // already signed to a different label than the one we just stamped on
  // the album, it returns a structured `artistLabelConflict` payload on
  // the album-PUT response. We surface a confirm dialog (mirrors the
  // reassign dialog in AdminLabel) so the operator decides whether to
  // move the artist over. Cancel leaves the artist on their old label;
  // the album label change has already landed either way.
  const [reassign, setReassign] = useState<ArtistLabelConflict | null>(null);
  const reassignMut = useMutation({
    mutationFn: async (c: ArtistLabelConflict) => {
      await apiRequest("PUT", `/api/admin/people/${c.personId}`, {
        labelId: c.toLabelId,
      });
    },
    onSuccess: (_v, c) => {
      qc.invalidateQueries({ queryKey: ["/api/people"] });
      qc.invalidateQueries({ queryKey: ["/api/people", c.personId] });
      qc.invalidateQueries({ queryKey: ["/api/labels"] });
      toast({ title: `Moved ${c.personName} to ${c.toLabelName}` });
      setReassign(null);
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't reassign artist",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });
  const { data: labels = [] } = useQuery<LabelLite[]>({
    queryKey: ["/api/labels"],
  });
  // Task #79 — surface per-field read-only state when the session can't
  // edit. Same query key as AlbumEditAccessChip so this is a cache hit.
  const { data: editAccess } = useQuery<{
    canEdit: boolean;
    locked: boolean;
    hasActiveOverride: boolean;
    requiresApproval: boolean;
    missingPermissions: string[];
  }>({
    queryKey: ["/api/admin/albums", album.id, "edit-access"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/albums/${album.id}/edit-access`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });
  const disabled = editAccess ? !editAccess.canEdit : false;
  const disabledReason = !editAccess
    ? undefined
    : editAccess.locked && !editAccess.hasActiveOverride
      ? "Locked after first sale"
      : editAccess.missingPermissions.includes("edit_metadata")
        ? "Read-only for your team"
        : editAccess.missingPermissions.includes("out_of_scope")
          ? "This album isn't managed by your team"
          : undefined;
  // Build the dropdown options. Most-used label names first would be
  // nicer but the list is short — alphabetical is fine.
  const labelOptions = [
    { value: "", label: "Independent" },
    ...[...labels]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((l) => ({ value: l.id, label: l.name })),
  ];
  return (
    <div className="space-y-5">
      <EditablePanel
        title="Release"
        testId="panel-overview-release"
        endpoint={endpoint}
        columns={2}
        disabled={disabled}
        disabledReason={disabledReason}
        values={{
          goodTunesReleaseDate: album.goodTunesReleaseDate,
          streamingReleaseDate: album.streamingReleaseDate,
          originalReleaseDate: album.originalReleaseDate,
        }}
        invalidate={invalidate}
        fields={[
          {
            key: "goodTunesReleaseDate",
            label: "GoodTunes release date",
            type: "date",
          },
          // Task #1112 — the Sunset date (end of the GoodTunes exclusive
          // window) lives next to the GoodTunes release date (its sunrise)
          // so the start and end of the window sit together. Still stored on
          // the legacy `streamingReleaseDate` column and saved through the
          // same endpoint/gate/normalization as before — placement only.
          {
            key: "streamingReleaseDate",
            label: "Sunset date",
            type: "date",
            placeholder: "When this leaves GoodTunes for streaming",
          },
          {
            key: "originalReleaseDate",
            label: "Original release date",
            type: "date",
            placeholder: "First-ever release of this record",
          },
        ]}
      />
      {/* Task #1049 — "Streaming" is its own panel. The six service URLs feed
          the fan-facing "Listen on…" links; Refresh auto-fills them. Task
          #1112 moved the Sunset date (the day the release leaves its GoodTunes
          exclusive window) up into the Release panel so it sits next to the
          GoodTunes release date (its sunrise). */}
      <EditablePanel
        title="Streaming"
        testId="panel-overview-streaming"
        endpoint={endpoint}
        columns={4}
        disabled={disabled}
        disabledReason={disabledReason}
        headerAction={<RefreshStreamingLinksButton album={album} />}
        values={{
          appleMusicUrl: album.appleMusicUrl,
          spotifyUrl: album.spotifyUrl,
          tidalUrl: album.tidalUrl,
          qobuzUrl: album.qobuzUrl,
          deezerUrl: album.deezerUrl,
          pandoraUrl: album.pandoraUrl,
        }}
        invalidate={invalidate}
        fields={[
          {
            key: "appleMusicUrl",
            label: "Apple Music",
            type: "url",
            placeholder: "https://music.apple.com/…",
          },
          {
            key: "spotifyUrl",
            label: "Spotify",
            type: "url",
            placeholder: "https://open.spotify.com/album/…",
          },
          {
            key: "tidalUrl",
            label: "Tidal",
            type: "url",
            placeholder: "https://tidal.com/browse/album/…",
          },
          {
            key: "qobuzUrl",
            label: "Qobuz",
            type: "url",
            placeholder: "https://open.qobuz.com/album/…",
          },
          {
            key: "deezerUrl",
            label: "Deezer",
            type: "url",
            placeholder: "https://www.deezer.com/album/…",
          },
          {
            key: "pandoraUrl",
            label: "Pandora",
            type: "url",
            placeholder: "https://www.pandora.com/artist/…/album/…",
          },
        ]}
      />
      {/* Artwork editor is no longer a dedicated panel here — it lives
          as a modal hanging off the page-header cover thumbnail (hover
          → pencil). Killed the inline card so Overview is just the
          text-editing surfaces (Release + Metadata + Description). */}
      <EditablePanel
        title="Metadata"
        testId="panel-overview-metadata"
        endpoint={endpoint}
        columns={4}
        disabled={disabled}
        disabledReason={disabledReason}
        values={{
          title: album.title,
          artist: album.artist,
          primaryArtistId: album.primaryArtistId ?? "",
          type: album.type,
          year: album.year ? String(album.year) : "",
          genre: album.genre,
          labelId: album.labelId ?? "",
          copyrightLine: album.copyrightLine,
          // Task #1158 — default the picker to ℗ for albums with no explicit
          // choice. EditablePanel only sends dirty fields, so this default is
          // never stamped onto a null row by an unrelated save.
          copyrightSymbol: album.copyrightSymbol ?? "℗",
          description: album.description,
          // Stored in cents on the wire, edited as dollars (e.g. "19.99")
          // in the admin form — dollars-to-cents normalization happens in
          // EditablePanel's onSave below.
          priceCents:
            album.priceCents == null ? "" : (album.priceCents / 100).toFixed(2),
        }}
        invalidate={invalidate}
        fields={[
          { key: "title", label: "Title", type: "text", required: true },
          {
            key: "artist",
            label: "Artist",
            type: "artist-picker",
            required: true,
            idKey: "primaryArtistId",
          },
          {
            key: "type",
            label: "Type",
            type: "select",
            required: true,
            // "Single" stays in the option list only when the album already
            // is one — that way streaming-imported 1-track rows don't lose
            // their type label when the operator opens the editor, but the
            // GoodTunes picker for new/curated releases is the three-way
            // LP / EP / Duo set (no Single — minimum sold is two tracks).
            options: [
              { value: "LP", label: "LP (8+ tracks)" },
              { value: "EP", label: "EP (3–7 tracks)" },
              { value: "Duo", label: "Duo (2 tracks)" },
              ...(album.type === "Single"
                ? [{ value: "Single", label: "Single (legacy)" }]
                : []),
            ],
          },
          {
            key: "year",
            label: "Year",
            type: "number",
            placeholder: "2025",
          },
          {
            key: "genre",
            label: "Genre",
            type: "combobox",
            placeholder: "Search or add new…",
            optionsEndpoint: "/api/admin/albums/genres",
          },
          {
            key: "labelId",
            label: "Label",
            type: "entity-combobox",
            placeholder: "Search labels or add new…",
            // `options` drives the read-mode id→name lookup (incl. the
            // empty "Independent" row); the live picker fetches its own
            // list + create from these endpoints.
            options: labelOptions,
            entityListEndpoint: "/api/labels",
            entityCreateEndpoint: "/api/admin/labels",
            emptyOptionLabel: "Independent",
            // Smart copyright: when a label is picked/created and the
            // Copyright line is still blank, seed it "{year} {label}".
            autofillKey: "copyrightLine",
            autofillSiblingKey: "year",
          },
          {
            key: "copyrightSymbol",
            label: "Copyright symbol",
            type: "select",
            options: [
              { value: "℗", label: "℗ (sound recording)" },
              { value: "©", label: "© (copyright)" },
            ],
          },
          {
            key: "copyrightLine",
            label: "Copyright line",
            type: "text",
            placeholder: "2009 Brash Music",
          },
          {
            key: "description",
            label: "Description",
            type: "textarea",
            placeholder: "Liner-notes-style blurb shown on the album page.",
          },
          {
            key: "priceCents",
            label: "Bundle Price (USD)",
            type: "currency",
            placeholder: "19.99",
          },
        ]}
        onSaved={(resp) => {
          // Task #644 — server tells us when the album's primary artist
          // is on a different label and asks us to confirm the move.
          const c = resp?.artistLabelConflict as ArtistLabelConflict | undefined;
          if (c) setReassign(c);
        }}
      />
      {/* Task #799 — TEMPORARY admin-only "SPIN Promo (digital-only
          legacy)" toggle. Self-contained block: when this flag is retired,
          delete this single component + its render here and the schema
          column. No fan-facing effect whatsoever. */}
      <SpinPromoPanel
        album={album}
        disabled={disabled}
        disabledReason={disabledReason}
      />
      {/* Task #965 — clean per-release share link editor. */}
      <ShareLinkPanel
        album={album}
        disabled={disabled}
        disabledReason={disabledReason}
      />
      {/* Task #190 — per-album Lineup snapshot. Only meaningful when the
          album's primary artist is a group (band/duo/orchestra). Renders
          inside its own panel below Metadata. */}
      {album.primaryArtistId && (
        <AlbumLineupPanel album={album} disabled={disabled} disabledReason={disabledReason} />
      )}
      {/* Task #644 — artist reassign confirm. Mirrors the dialog in
          AdminLabel's "Add artist already on another label" flow. */}
      <Dialog
        open={!!reassign}
        onOpenChange={(v) => !reassignMut.isPending && !v && setReassign(null)}
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-reassign-album-artist"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-slate-900 pr-8">
              Reassign <span className="italic">{reassign?.personName}</span>?
            </DialogTitle>
            <DialogDescription className="text-[13px] font-normal text-slate-500">
              They're currently signed to{" "}
              <span className="font-semibold text-slate-700">
                {reassign?.fromLabelName}
              </span>
              . Continuing will move them to{" "}
              <span className="font-semibold text-slate-700">
                {reassign?.toLabelName}
              </span>
              {" "}— previous label loses the link. The album's label change has already been saved.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-1">
            <Button
              type="button"
              onClick={() => setReassign(null)}
              disabled={reassignMut.isPending}
              className="bg-white text-slate-900 border border-slate-200 shadow-sm hover:bg-slate-50"
              data-testid="button-reassign-album-artist-cancel"
            >
              Keep current label
            </Button>
            <Button
              type="button"
              onClick={() => reassign && reassignMut.mutate(reassign)}
              disabled={reassignMut.isPending}
              className="bg-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/90 text-white ml-2"
              data-testid="button-reassign-album-artist-confirm"
            >
              {reassignMut.isPending
                ? "Moving…"
                : `Move to ${reassign?.toLabelName ?? "new label"}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlbumNpoSplitPanel albumId={album.id} />
    </div>
  );
}

/* ─── Tracks tab ───────────────────────────────────────────────────── */

type AlbumCreditsMap = {
  bySongId: Record<
    string,
    {
      writers: {
        id: string;
        songId: string;
        personId: string | null;
        name: string;
        role: string;
        position: number;
        person: { id: string; name: string; photoUrl?: string | null } | null;
      }[];
      performers: {
        id: string;
        songId: string;
        personId: string | null;
        instrumentId: string | null;
        name: string;
        role: string;
        tuningNotes: string | null;
        position: number;
        person: { id: string; name: string; photoUrl?: string | null } | null;
        instrument: { id: string; name: string; category?: string | null } | null;
      }[];
    }
  >;
  // Album-wide production credits (Produced by / Mixed by / Mastered by /
  // engineering / A&R). Populated by the credits importer.
  production?: {
    id: string;
    albumId: string;
    personId: string | null;
    name: string;
    role: string;
    position: number;
    person: { id: string; name: string; photoUrl?: string | null } | null;
  }[];
};

type AdminPersonLite = {
  id: string;
  name: string;
  photoUrl?: string | null;
};
type AdminInstrumentLite = {
  id: string;
  name: string;
  category?: string | null;
};
type AdminCreditRole = {
  id: string;
  kind: "writer" | "performer";
  name: string;
};

function TracksPanel({
  album,
  onEdit,
  highlightTrackId,
  selectionMode,
  selectedTrackIds,
  onToggleTrack,
}: {
  album: AlbumFull;
  onEdit: () => void;
  // When the page was deep-linked with `?track=<id>` (e.g. the smart-back
  // crumb on a credit-tapped Person page, or the track detail page's
  // "Back to tracklist"), the matching row scrolls into view and pulses a
  // brief highlight. Rows are now tap-targets that navigate to the track
  // page — there is no inline expansion to seed any more.
  highlightTrackId: string | null;
  // Multi-select state lives at the page level so the Delete-Options
  // trigger up in the tab strip can re-label itself with the live
  // count. The panel just threads the props down to each TrackRow.
  selectionMode: boolean;
  selectedTrackIds: Set<string>;
  onToggleTrack: (id: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const sorted = [...album.songs].sort(
    (a, b) => a.trackNumber - b.trackNumber,
  );
  const { data: albumCredits } = useQuery<AlbumCreditsMap>({
    queryKey: ["/api/albums", album.id, "credits"],
  });
  // Task #616 — per-song splits totals for the per-track Splits tile.
  // One album-scoped query feeds every row's dot so we don't N+1 the
  // server on a 20-track album. Server returns per-song `totals`
  // ({ publishingBp, mechanicalBp }) so we don't re-sum client-side.
  const { data: albumSplits } = useQuery<{
    bySongId: Record<string, { totals?: { publishingBp: number; mechanicalBp: number } }>;
  }>({
    queryKey: ["/api/admin/albums", album.id, "splits"],
  });

  // Task #369 — pull the catalog-wide Mux pipeline status so each
  // errored track row can show its auto-retry state (next attempt in
  // Nm / retry cap reached). One query for the whole tracklist; refetch
  // every 60s so the countdown updates without a page reload.
  const { data: muxStatus } = useQuery<{
    retryState?: Record<
      string,
      {
        attempts: number;
        maxAttempts: number;
        lastAttemptAt: number;
        nextRetryAt: number | null;
        exhausted: boolean;
      }
    >;
    serverNow?: number;
  }>({
    queryKey: ["/api/admin/mux-status"],
    refetchInterval: 60 * 1000,
  });

  // Inline accordion controller — exactly one track row open at a time
  // (Stripe order-rows pattern). Seeded with the `?track=<id>` deep link
  // so a row arrived-at via the smart-back crumb or a shared link opens
  // expanded. See docs/design-system.md ("Expandable row lists").
  const disclosure = useExclusiveDisclosure<string>(highlightTrackId);

  // Drag-to-reorder state lives at the panel level so a row knows when
  // another row is being dragged over it. We pair an optimistic cache
  // rewrite with a server POST; on error we roll the cache back to the
  // snapshot taken before the mutation started.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropOnId, setDropOnId] = useState<string | null>(null);
  // Task #1370 — "Find a track…" filter. Narrows the rendered rows by
  // title (case-insensitive) so a long tracklist stays scannable now that
  // each row is a tap-target into the dedicated track page.
  const [trackQuery, setTrackQuery] = useState("");
  // Inline composer for new tracks. Stays open across saves so the user
  // can hammer through a tracklist without clicking "Add track" each time.
  const [adding, setAdding] = useState(false);
  // Tracks-tab "Advanced" menu — bulk-create N rows + album-wide GoodSync.
  // State lives here (not in the menu) so the dialogs survive the menu
  // close-on-select behavior and so `invalidateAlbum` can be passed in.
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [albumSyncOpen, setAlbumSyncOpen] = useState(false);
  const [lyricsImportOpen, setLyricsImportOpen] = useState(false);
  const [creditsImportOpen, setCreditsImportOpen] = useState(false);
  // Task #645 — Splits-from-sheet importer. Used to live on the
  // removed album-level Splits tab; re-homed here under Advanced so
  // operators still have a way to bulk-load splits from NightBirde-
  // style songsheets without resurrecting the tab.
  const [splitsImportOpen, setSplitsImportOpen] = useState(false);
  // Task #583 — the Digital/Vinyl segmented toggle has moved out of
  // this panel: the Digital tab is now strictly the digital tracklist,
  // and the Side A/B cut view lives on the Physical tab beside the
  // masters table where the cuts originate.

  // Album-wide lyrics lookup: walks every track missing lyrics and
  // asks LRCLIB first (plain + synced cues), then falls through to a
  // Genius scrape if LRCLIB has nothing. Never overwrites a track that
  // already has lyrics, so it's safe to fire-and-toast.
  const findMissingLyricsMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/admin/albums/${album.id}/find-missing-lyrics`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as any);
        throw new Error(body?.message ?? "Lookup failed");
      }
      return (await res.json()) as {
        scanned: number;
        matched: number;
        synced: number;
        plain: number;
        geniusMatched: number;
        instrumental: number;
        notFound: number;
        failed: number;
      };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["/api/albums", album.id] });
      qc.invalidateQueries({ queryKey: ["/api/admin/songs", album.id] });
      qc.invalidateQueries({ queryKey: ["/api/albums", album.id, "credits"] });
      if (r.matched === 0) {
        toast({
          title: "No lyrics found",
          description:
            r.scanned === 0
              ? "Every track already has lyrics — nothing to look up."
              : `Searched ${r.scanned} track${r.scanned === 1 ? "" : "s"}, no matches on LRCLIB or Genius.`,
        });
        return;
      }
      const parts: string[] = [];
      if (r.synced > 0) parts.push(`${r.synced} GoodSync-ready`);
      if (r.plain > 0) parts.push(`${r.plain} plain from LRCLIB`);
      if (r.geniusMatched > 0) parts.push(`${r.geniusMatched} from Genius`);
      if (r.notFound > 0) parts.push(`${r.notFound} not found`);
      if (r.instrumental > 0) parts.push(`${r.instrumental} instrumental`);
      if (r.failed > 0) parts.push(`${r.failed} errored`);
      toast({
        title: `Found lyrics for ${r.matched} of ${r.scanned}`,
        description: parts.join(" · "),
      });
    },
    onError: (e: Error) => {
      toast({
        title: "Couldn't look up lyrics",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  // ── Playback state for the floating PlayerDock ──────────────────────
  // One audio element drives the entire Tracks tab. Selecting a row sets
  // `currentSongId`; the effect below loads the master into the audio
  // element and starts playback. The dock owns the transport UI; this
  // panel owns the actual playback + queue stepping. Graduated from the
  // Seamless mockup's BottomDock (mock state) into real HTMLAudioElement
  // playback against `song.audioUrl` (Object Storage signed URLs).
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // hls.js instance for the admin Tracks-tab player. Kept in a ref so we
  // can tear it down between songs without re-running the effect on every
  // render. Non-Safari browsers route Mux HLS through this; Safari/iOS use
  // native HLS via `audio.src` directly.
  const hlsRef = useRef<Hls | null>(null);
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const currentSong =
    currentSongId != null
      ? sorted.find((s) => s.id === currentSongId) ?? null
      : null;

  // Epoch guard for play() promises. When the user clicks Track A then
  // immediately Track B, A's play() promise may still be pending —
  // resolving it would clobber B's state. We bump the epoch on every
  // selection and ignore stale resolutions. The audio element's own
  // `play` / `pause` events (subscribed below) are the source of truth
  // for the `playing` flag; the promise paths just absorb the rejection.
  const playEpochRef = useRef(0);

  // User-seek guard. `audio.currentTime = s` doesn't apply synchronously —
  // a stale `timeupdate` can fire with the OLD position right after a
  // manual scrub, briefly snapping the bar backward before the seek lands.
  // We flip this ref true on scrub and clear it on the `seeked` event;
  // while true, `onTimeUpdate` skips its setProgress so the optimistic
  // value from onSeek stays put.
  const userSeekingRef = useRef(false);

  // Load + play whenever the selected song changes. Browsers will reject
  // play() if it wasn't triggered by a user gesture — that's fine here
  // because the only path into this effect is the user clicking a row's
  // play button or hitting prev/next on the dock (both are gestures).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentSong) {
      audio.pause();
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch {}
        hlsRef.current = null;
      }
      audio.removeAttribute("src");
      audio.load();
      setProgress(0);
      return;
    }
    const epoch = ++playEpochRef.current;
    setProgress(0);
    (async () => {
      const res = await attachAdminAudio(audio, currentSong, {
        hlsRef,
        isStale: () => epoch !== playEpochRef.current,
      });
      if (epoch !== playEpochRef.current) return;
      if ("reason" in res) {
        setPlaying(false);
        // "stale" reasons mean a newer epoch superseded us; no UI.
        if (res.reason.message === "stale") return;
        if (res.reason.code === "mux-sign-failed") {
          toast({
            title: "Couldn't start playback",
            description: res.reason.message,
            variant: "destructive",
          });
        }
        // `encoding` + `no-master` are already visible elsewhere
        // (per-row encoding pill, missing-master state) — no toast.
        return;
      }
      audio.play().catch(() => {
        if (epoch === playEpochRef.current) setPlaying(false);
      });
    })();
  }, [
    currentSong?.id,
    currentSong?.audioUrl,
    currentSong?.muxPlaybackId,
    currentSong?.muxStatus,
  ]);

  // Tear down hls.js on unmount so we don't leak an MSE attachment when
  // the operator leaves the album page mid-playback.
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch {}
        hlsRef.current = null;
      }
    };
  }, []);

  // Keep our `playing` state in lock-step with the underlying element so
  // anything that pauses outside our togglePlay path (browser autoplay
  // policy, OS media keys, tab backgrounding) still flips the dock icon.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !currentSong) return;
    if (!currentSong.audioUrl && !currentSong.muxPlaybackId) return;
    if (audio.paused) {
      // If we ran off the end of the track (queue-end pause path), rewind
      // to the start so hitting Play actually restarts instead of being
      // a no-op against `currentTime === duration`.
      if (
        audio.ended ||
        (audio.duration > 0 && audio.currentTime >= audio.duration - 0.05)
      ) {
        audio.currentTime = 0;
      }
      playEpochRef.current++;
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  // A track is dock-navigable only when it has a master AND Mux isn't
  // still encoding it — otherwise prev/next would silently land on a row
  // that the play effect immediately pauses + clears, which looks like
  // playback "randomly stopped" to the operator. Encoding rows show the
  // spinner in the list and become navigable once Mux flips to ready.
  const isDockPlayable = (s: SongLite) =>
    (!!s.audioUrl || !!s.muxPlaybackId) &&
    s.muxStatus !== "ingesting" &&
    s.muxStatus !== "preparing";

  const playPrev = () => {
    if (!currentSongId) return;
    const idx = sorted.findIndex((s) => s.id === currentSongId);
    for (let i = idx - 1; i >= 0; i--) {
      if (isDockPlayable(sorted[i])) {
        setCurrentSongId(sorted[i].id);
        return;
      }
    }
  };
  const playNext = () => {
    const idx = currentSongId
      ? sorted.findIndex((s) => s.id === currentSongId)
      : -1;
    for (let i = idx + 1; i < sorted.length; i++) {
      if (isDockPlayable(sorted[i])) {
        setCurrentSongId(sorted[i].id);
        return;
      }
    }
    // End of queue — pause but keep the selection so the cover/title
    // stays in the dock and the user can hit Play to restart.
    if (audioRef.current) audioRef.current.pause();
  };

  const handleRowPlay = (songId: string) => {
    // Block plays on tracks Mux is still encoding — the row UI already
    // shows the spinner, but a fast-clicker can still slip a tap through.
    // Surface a one-shot toast so they know the wait is intentional and
    // playback will start automatically once Mux finishes.
    const target = sorted.find((s) => s.id === songId);
    if (
      target &&
      (target.muxStatus === "ingesting" || target.muxStatus === "preparing")
    ) {
      toast({
        title: "Preparing stream…",
        description: "Mux is still encoding this track. It'll play in a few seconds.",
      });
      return;
    }
    if (songId === currentSongId) {
      togglePlay();
      return;
    }
    setCurrentSongId(songId);
  };

  const invalidateAlbum = async () => {
    await qc.invalidateQueries({ queryKey: ["/api/albums", album.id] });
    await qc.invalidateQueries({ queryKey: ["/api/albums"] });
  };

  const reorderMut = useMutation({
    mutationFn: async (songIds: string[]) => {
      await apiRequest(
        "POST",
        `/api/admin/albums/${album.id}/tracks/reorder`,
        { songIds },
      );
    },
    onMutate: async (songIds: string[]) => {
      await qc.cancelQueries({ queryKey: ["/api/albums", album.id] });
      const prev = qc.getQueryData<AlbumFull>(["/api/albums", album.id]);
      if (prev) {
        const byId = new Map(prev.songs.map((s) => [s.id, s]));
        const nextSongs = songIds
          .map((id, i) => {
            const s = byId.get(id);
            return s ? { ...s, trackNumber: i + 1 } : null;
          })
          .filter((s): s is (typeof prev.songs)[number] => s !== null);
        qc.setQueryData<AlbumFull>(["/api/albums", album.id], {
          ...prev,
          songs: nextSongs,
        });
      }
      return { prev };
    },
    onError: (e: any, _songIds, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(["/api/albums", album.id], ctx.prev);
      }
      toast({
        title: "Couldn't reorder tracks",
        description: e?.message || "Order has been reverted.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["/api/albums", album.id] });
      qc.invalidateQueries({ queryKey: ["/api/albums"] });
    },
  });

  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", id);
    } catch {
      // Some browsers throw if setData is called too late; ignore.
    }
  };
  const handleDragOver = (id: string) => (e: React.DragEvent) => {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropOnId !== id) setDropOnId(id);
  };
  const handleDragEnd = () => {
    setDragId(null);
    setDropOnId(null);
  };
  const handleDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragId;
    setDragId(null);
    setDropOnId(null);
    if (!src || src === targetId) return;
    const ids = sorted.map((s) => s.id);
    const from = ids.indexOf(src);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = ids.slice();
    next.splice(from, 1);
    next.splice(from < to ? to - 1 : to, 0, src);
    if (next.every((id, i) => id === ids[i])) return;
    reorderMut.mutate(next);
  };

  // Shared bonus stack — Videos + Photos + deferred-assets footnote.
  // Folded into the Tracks tab (used to be its own Bonus tab) and rendered
  // in BOTH the empty and non-empty branches so operators on a fresh
  // album can still upload videos/photos before any tracks exist.
  const bonusStack = (
    <>
      <BonusVideos albumId={album.id} onEdit={onEdit} />
      <BonusPhotos albumId={album.id} onEdit={onEdit} />
      <p className="text-slate-400 text-[11px] leading-relaxed px-1">
        Liner notes, lyric sheets, commentary, and press-kit assets are
        deferred — see roadmap.
      </p>
    </>
  );

  if (sorted.length === 0 && !adding) {
    return (
      <div className="space-y-5">
      <Card
        className="rounded-2xl shadow-sm p-8"
        data-testid="panel-tracks-empty"
      >
        <div className="flex items-center gap-2 text-slate-500 text-[13px]">
          <AlertCircle className="w-4 h-4" />
          This album has no tracks yet. Pick a way to get started:
        </div>
        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          <button
            onClick={() => setAdding(true)}
            className="group text-left rounded-xl border border-slate-200 bg-white hover:border-[var(--brand-blue)] hover:bg-slate-50 transition-colors p-4 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/30"
            data-testid="button-add-first-track"
          >
            <div className="w-8 h-8 rounded-md bg-[var(--brand-blue)]/10 text-[var(--brand-blue)] inline-flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <div className="mt-2.5 text-[13px] font-semibold text-slate-900">
              Add one track
            </div>
            <div className="text-[11.5px] text-slate-500 mt-0.5">
              Type a title and keep going row-by-row.
            </div>
          </button>
          <button
            onClick={() => setBulkAddOpen(true)}
            className="group text-left rounded-xl border border-slate-200 bg-white hover:border-[var(--brand-blue)] hover:bg-slate-50 transition-colors p-4 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/30"
            data-testid="button-bulk-add-tracks-empty"
          >
            <div className="w-8 h-8 rounded-md bg-[var(--brand-blue)]/10 text-[var(--brand-blue)] inline-flex items-center justify-center">
              <ListPlus className="w-4 h-4" />
            </div>
            <div className="mt-2.5 text-[13px] font-semibold text-slate-900">
              Upload multiple tracks
            </div>
            <div className="text-[11.5px] text-slate-500 mt-0.5">
              Empty rows or a Dropbox folder of audio files.
            </div>
          </button>
        </div>
      </Card>
      {/* No lyrics-import dialog mount in the empty state — lyrics
          matching needs existing tracks to match against, so the
          entry point only lives on the Advanced menu once tracks
          exist. */}
      <AddMultipleTracksDialog
        open={bulkAddOpen}
        onOpenChange={setBulkAddOpen}
        albumId={album.id}
        nextTrackNumber={1}
        onSaved={invalidateAlbum}
      />
      {bonusStack}
      </div>
    );
  }

  const trackQueryTrimmed = trackQuery.trim().toLowerCase();
  const filtered = trackQueryTrimmed
    ? sorted.filter((s) =>
        (s.title ?? "").toLowerCase().includes(trackQueryTrimmed),
      )
    : sorted;

  return (
    <div className="space-y-5 mb-32">
    <Card
      className="relative rounded-2xl shadow-sm overflow-hidden"
      data-testid="panel-tracks"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <h2 className="text-slate-900 text-[14px] font-bold">Tracks</h2>
            <p className="text-slate-500 text-[11.5px] mt-0.5">
              {sorted.length === 0 ? (
                <>Add your first track below. Press Enter to add and keep going.</>
              ) : (
                <>Reorder, edit, and play right from the list.</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setAdding((v) => !v)}
            className={
              "px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold inline-flex items-center gap-1.5 " +
              (adding
                ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50")
            }
            data-testid="button-toggle-add-track"
            aria-expanded={adding}
          >
            <Plus className={"w-3 h-3 " + (adding ? "rotate-45" : "")} />
            {adding ? "Done" : "Add track"}
          </button>
          {/* Advanced menu — bulk-add N rows + album-wide GoodSync.
              Square h-9-style trigger keeps the admin chrome density;
              Sparkles signals the AI-assisted nature of the items. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 data-[state=open]:bg-slate-100"
              data-testid="button-tracks-advanced"
              aria-label="Advanced track actions"
            >
              <Sparkles className="w-3 h-3" />
              Advanced
              <ChevronDown className="w-3 h-3 -mr-0.5 text-slate-400" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              // The shared `--popover` CSS var is the dark brand bg
              // (#00062B) because the mobile player needs it. Admin
              // chrome lives on white, so override here at the call
              // site rather than fork the primitive globally.
              //
              // Section labels match the YEAR/LABEL small-caps used on
              // the album header — 10px, weight 600, slate-400, tracking
              // wide. They group the actions into TRACKS / LYRICS /
              // CREDITS / MASTERS so the operator can scan by intent
              // instead of reading every row.
              className="min-w-[280px] p-1.5 bg-white text-slate-900 border border-slate-200 shadow-lg"
            >
              <DropdownMenuLabel className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-[0.08em] uppercase text-slate-400">
                Tracks
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => setBulkAddOpen(true)}
                data-testid="menu-upload-multiple-tracks"
                className="gap-2.5 px-2.5 py-2 text-[12.5px] cursor-pointer focus:bg-slate-100 focus:text-slate-900"
              >
                <ListPlus className="w-4 h-4 text-slate-500" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900">
                    Upload multiple tracks
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Empty rows or a Dropbox folder of audio files.
                  </div>
                </div>
              </DropdownMenuItem>

              <DropdownMenuLabel className="px-2.5 pt-2.5 pb-1 text-[10px] font-semibold tracking-[0.08em] uppercase text-slate-400">
                Lyrics
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => setLyricsImportOpen(true)}
                data-testid="menu-import-lyrics"
                className="gap-2.5 px-2.5 py-2 text-[12.5px] cursor-pointer focus:bg-slate-100 focus:text-slate-900"
              >
                <FileText className="w-4 h-4 text-slate-500" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900">
                    Import lyrics from Dropbox
                  </div>
                  <div className="text-[11px] text-slate-500">
                    PDF, Word, or text files — matched to tracks.
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  // Keep the menu open while the request flies so the
                  // operator sees the row still highlighted; the toast
                  // does the heavy reporting on completion.
                  e.preventDefault();
                  findMissingLyricsMut.mutate();
                }}
                disabled={findMissingLyricsMut.isPending}
                data-testid="menu-find-missing-lyrics"
                className="gap-2.5 px-2.5 py-2 text-[12.5px] cursor-pointer focus:bg-slate-100 focus:text-slate-900 data-[disabled]:opacity-60"
              >
                <Sparkles className="w-4 h-4 text-slate-500" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900">
                    {findMissingLyricsMut.isPending
                      ? "Looking up lyrics…"
                      : "Find missing lyrics"}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Looks up lyrics online for every track missing them.
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setAlbumSyncOpen(true)}
                data-testid="menu-goodsync-album"
                className="gap-2.5 px-2.5 py-2 text-[12.5px] cursor-pointer focus:bg-slate-100 focus:text-slate-900"
              >
                <Wand2 className="w-4 h-4 text-slate-500" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900">
                    GoodSync™ your album
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Auto-sync lyrics on every eligible track.
                  </div>
                </div>
              </DropdownMenuItem>

              <DropdownMenuLabel className="px-2.5 pt-2.5 pb-1 text-[10px] font-semibold tracking-[0.08em] uppercase text-slate-400">
                Credits
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => setCreditsImportOpen(true)}
                data-testid="menu-import-credits"
                className="gap-2.5 px-2.5 py-2 text-[12.5px] cursor-pointer focus:bg-slate-100 focus:text-slate-900"
              >
                <UserPlus className="w-4 h-4 text-slate-500" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900">
                    Import credits
                  </div>
                  <div className="text-[11px] text-slate-500">
                    PDF, Word, or text liner notes — matched to tracks.
                  </div>
                </div>
              </DropdownMenuItem>

              {/* Task #583 — "Download all masters" lives on the Physical
                  tab now (single home for master bulk-actions). */}

              {/* Task #645 — Splits section. The album-level Splits tab is
                  gone; per-track Splits tiles cover the day-to-day editing.
                  The sheet importer (NightBirde songsheet → bulk-load) is
                  the one album-wide affordance worth keeping, so it lives
                  here under Advanced. */}
              <DropdownMenuLabel className="px-2.5 pt-2.5 pb-1 text-[10px] font-semibold tracking-[0.08em] uppercase text-slate-400">
                Splits
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => setSplitsImportOpen(true)}
                data-testid="menu-import-splits"
                className="gap-2.5 px-2.5 py-2 text-[12.5px] cursor-pointer focus:bg-slate-100 focus:text-slate-900"
              >
                <Upload className="w-4 h-4 text-slate-500" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900">
                    Import splits from sheet
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Google Sheet or CSV — matched to tracks by title.
                  </div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {albumCredits?.production && albumCredits.production.length > 0 && (
        <AlbumProductionCreditsPanel rows={albumCredits.production} albumId={album.id} />
      )}
      {/* Dock clearance lives as `mb-32` on the OUTER section (above) — a
          margin BELOW the white card, not padding inside it. Earlier the
          clearance was `pb-32` *inside* the card, which made the card
          stretch into a half-empty rectangle whenever the track list was
          short (Bill flagged it). Margin-below keeps the card hugging its
          content while still reserving scroll space so the fixed dock
          can't cover the last track or the AddTrackForm. */}
      {sorted.length > 0 && (
        <div className="px-5 pt-3.5 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={trackQuery}
              onChange={(e) => setTrackQuery(e.target.value)}
              placeholder="Find a track…"
              className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-200 text-slate-900 text-sm focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
              data-testid="input-track-search"
            />
            {trackQuery && (
              <button
                type="button"
                aria-label="Clear track search"
                title="Clear search"
                onClick={() => setTrackQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40"
                data-testid="button-clear-track-search"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
      <ol>
        {trackQueryTrimmed && filtered.length === 0 && (
          <li
            className="px-5 py-8 text-center text-slate-400 text-sm"
            data-testid="empty-track-search"
          >
            No tracks match “{trackQuery.trim()}”.
          </li>
        )}
        {filtered.map((song, i) => {
          const songCredits = albumCredits?.bySongId[song.id];
          return (
            <TrackRow
              key={song.id}
              song={song}
              albumId={album.id}
              withBorder={i !== filtered.length - 1}
              credits={songCredits ?? null}
              splitTotals={albumSplits?.bySongId?.[song.id]?.totals ?? null}
              isDragging={dragId === song.id}
              isDropTarget={dropOnId === song.id && dragId !== song.id}
              onDragStart={handleDragStart(song.id)}
              onDragOver={handleDragOver(song.id)}
              onDrop={handleDrop(song.id)}
              onDragEnd={handleDragEnd}
              isCurrent={currentSongId === song.id}
              isPlaying={playing && currentSongId === song.id}
              onPlay={handleRowPlay}
              selectionMode={selectionMode}
              selected={selectedTrackIds.has(song.id)}
              onToggleSelect={onToggleTrack}
              userExpanded={disclosure.isOpen(song.id)}
              onSetUserExpanded={(open) => disclosure.setOpen(song.id, open)}
              highlightOnMount={highlightTrackId === song.id}
              muxRetry={muxStatus?.retryState?.[song.id] ?? null}
              muxServerNow={muxStatus?.serverNow ?? null}
            />
          );
        })}
      </ol>
      {adding && (
        <AddTrackForm
          albumId={album.id}
          nextTrackNumber={sorted.length + 1}
          onSaved={invalidateAlbum}
          onClose={() => setAdding(false)}
        />
      )}
      {/* Single audio element drives the entire Tracks tab. Kept hidden;
          the PlayerDock above is the user-visible transport surface. */}
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) => {
          if (userSeekingRef.current) return;
          const el = e.currentTarget;
          if (el.duration > 0) {
            setProgress((el.currentTime / el.duration) * 100);
          }
        }}
        onSeeked={() => {
          userSeekingRef.current = false;
        }}
        onEnded={() => playNext()}
        className="hidden"
        data-testid="audio-tracks"
      />
      <PlayerDock
        track={{
          title: currentSong?.title ?? "",
          subtitle: `${album.artist} — ${album.title}`,
          playable: !!currentSong?.audioUrl,
        }}
        hasSelection={!!currentSong}
        playing={playing}
        progress={progress}
        totalSeconds={currentSong?.duration ?? 0}
        onTogglePlay={togglePlay}
        onPrev={playPrev}
        onNext={playNext}
        onSeek={(s) => {
          const audio = audioRef.current;
          if (!audio) return;
          // Mark a user-seek in flight so the next stale `timeupdate`
          // (which may still carry the pre-seek currentTime) doesn't
          // clobber the optimistic snap below. Cleared on `seeked`.
          userSeekingRef.current = true;
          audio.currentTime = s;
          // Snap the visible bar immediately instead of waiting for the
          // next `timeupdate` tick (~250ms). Bill felt the delay; this
          // eliminates it without changing how playback drives progress.
          if (audio.duration > 0) {
            setProgress((s / audio.duration) * 100);
          }
        }}
        onVolumeChange={(level, muted) => {
          if (!audioRef.current) return;
          audioRef.current.volume = muted ? 0 : level / 100;
          audioRef.current.muted = muted;
        }}
        coverNode={
          // Only show real artwork while a track is selected; idle state
          // falls through to the dock's slate placeholder so the empty
          // pill reads honestly (no art = no art shown).
          currentSong && album.artwork ? (
            <div className="w-10 h-10 rounded-md flex-shrink-0 overflow-hidden bg-slate-700">
              <img
                src={album.artwork}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          ) : undefined
        }
      />
      <AddMultipleTracksDialog
        open={bulkAddOpen}
        onOpenChange={setBulkAddOpen}
        albumId={album.id}
        // Use max(trackNumber)+1 rather than sorted.length+1 so deletes
        // that leave gaps don't cause new rows to collide with the
        // tail of an existing tracklist.
        nextTrackNumber={
          sorted.length === 0
            ? 1
            : Math.max(...sorted.map((s) => s.trackNumber ?? 0)) + 1
        }
        onSaved={invalidateAlbum}
      />
      <GoodSyncAlbumDialog
        open={albumSyncOpen}
        onOpenChange={setAlbumSyncOpen}
        songs={sorted}
        onSaved={invalidateAlbum}
      />
      <ImportLyricsFromDropboxDialog
        open={lyricsImportOpen}
        onOpenChange={setLyricsImportOpen}
        albumId={album.id}
        songs={sorted}
        onSaved={invalidateAlbum}
      />
      <CreditsImportSheet
        albumId={album.id}
        open={creditsImportOpen}
        onOpenChange={setCreditsImportOpen}
      />
      {splitsImportOpen && (
        <SplitsImportSheet
          albumId={album.id}
          songs={sorted.map((s) => ({
            id: s.id,
            title: s.title,
            trackNumber: s.trackNumber ?? 0,
          }))}
          onClose={() => setSplitsImportOpen(false)}
        />
      )}
    </Card>
    {bonusStack}
    </div>
  );
}

/* ─── Album-wide production credits (read-only display) ─────────────── */

// Tiny panel that lists "Produced by / Mixed by / Mastered by / etc."
// credits at the top of the Tracks tab. Pure display today — populated
// by the Credits Importer; manual editing happens on the People page
// (or via a future inline editor). Hidden when there are no rows.
function AlbumProductionCreditsPanel({
  rows,
  albumId,
}: {
  rows: NonNullable<AlbumCreditsMap["production"]>;
  albumId: string;
}) {
  // Group by role so duplicate roles ("Producer · Producer · Producer")
  // collapse into a single "Producer — A, B, C" row. Carry the person
  // payload through (id + photo) so each name renders as an avatar +
  // inline link into the admin Person sheet, matching how song-level
  // credits already cross-link.
  type CreditEntry = {
    key: string;
    name: string;
    personId: string | null;
    photoUrl: string | null;
  };
  const byRole = useMemo(() => {
    const m = new Map<string, CreditEntry[]>();
    for (const r of rows) {
      const name = r.person?.name ?? r.name;
      const list = m.get(r.role) ?? [];
      list.push({
        key: r.id,
        name,
        personId: r.person?.id ?? null,
        photoUrl: r.person?.photoUrl ?? null,
      });
      m.set(r.role, list);
    }
    return Array.from(m.entries());
  }, [rows]);

  const [expanded, setExpanded] = useState(false);
  const COLLAPSE_AT = 6;
  const overflow = byRole.length > COLLAPSE_AT;
  const visible = overflow && !expanded ? byRole.slice(0, COLLAPSE_AT) : byRole;

  return (
    <div
      className="px-5 py-3 border-b border-slate-100 bg-slate-50/60"
      data-testid="panel-album-production-credits"
    >
      <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-1.5">
        Album credits
      </div>
      <div className="grid gap-1">
        {visible.map(([role, entries]) => (
          <div
            key={role}
            className="flex items-baseline gap-2 text-[13px]"
            data-testid={`row-album-credit-role-${role.replace(/\s+/g, "-").toLowerCase()}`}
          >
            <span className="text-slate-500 min-w-[140px]">{role}</span>
            <span className="text-slate-800 font-medium flex flex-wrap items-center gap-x-1 gap-y-0.5">
              {entries.map((e, i) => (
                <span key={e.key} className="inline-flex items-center gap-1">
                  {e.personId && e.photoUrl && (
                    <img
                      src={e.photoUrl}
                      alt=""
                      className="w-4 h-4 rounded-full object-cover flex-shrink-0"
                      data-testid={`img-album-credit-avatar-${e.personId}`}
                    />
                  )}
                  {e.personId ? (
                    <Link
                      href={`/admin/people/${e.personId}?from=album&albumId=${albumId}`}
                      className="text-inherit hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
                      data-testid={`link-album-credit-person-${e.personId}`}
                    >
                      {e.name}
                    </Link>
                  ) : (
                    <span>{e.name}</span>
                  )}
                  {i < entries.length - 1 && <span aria-hidden>,</span>}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-[color:var(--brand-blue)] hover:underline underline-offset-2"
          data-testid="button-album-credits-expand"
        >
          {expanded ? "Show fewer" : `Show all credits (${byRole.length})`}
        </button>
      )}
    </div>
  );
}

/* ─── Inline composer for adding new tracks ──────────────────────────── */

// Parses a duration string the way an admin would type it: "3:30", "0:42",
// "210" (raw seconds), or "" (empty → fall back to the default). Returns
// the seconds value plus an error flag so the form can surface bad input
// inline without throwing.
function parseDurationInput(raw: string): { seconds: number; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { seconds: 180, error: null };
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (n > 0 && n < 36000) return { seconds: n, error: null };
    return { seconds: 180, error: "Pick a duration under 10 hours." };
  }
  const m = trimmed.match(/^(\d{1,2}):([0-5]?\d)$/);
  if (m) {
    const mins = Number(m[1]);
    const secs = Number(m[2]);
    const total = mins * 60 + secs;
    if (total > 0 && total < 36000) return { seconds: total, error: null };
    return { seconds: 180, error: "Pick a duration under 10 hours." };
  }
  return { seconds: 180, error: "Use mm:ss (e.g. 3:30) or whole seconds." };
}

// Filename → readable track title. Mirrors the server-side
// `deriveTitleFromFilename` in routes.ts but lighter — the server cleanup
// (suffix-token stripping, contraction restore, de-shout) reruns when the
// row is created via the Dropbox importer. For the inline single-file
// composer we only need a quick, predictable client preview: drop the
// extension, drop any leading track-number prefix, swap separators to
// spaces. Admin can edit the result before pressing Add.
function clientDeriveTitleFromFilename(name: string): string {
  let s = name.replace(/^.*[/\\]/, ""); // strip any path
  s = s.replace(/\.[^.]+$/, ""); // strip extension
  s = s.replace(/^\s*\d{1,3}\s*[-_.\s)]+\s*/, ""); // leading "01 - " / "02_"
  s = s.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

const AUDIO_EXT_RE = /\.(mp3|m4a|aac|wav|flac|ogg|aif|aiff)(\?|#|$)/i;

// Probe an audio source (File blob or URL) for its real duration via a
// hidden <audio> element. Best-effort — returns null if the browser
// can't decode the metadata fast enough. Used so the duration field
// fills itself in when an audio file is dropped onto the row.
//
// Chunked-transfer responses (most notably Dropbox direct downloads at
// `dl.dropboxusercontent.com`) arrive without a `Content-Length` header,
// which makes Chrome/Safari report `audio.duration === Infinity` on the
// initial `loadedmetadata` event. The well-known workaround is to seek
// past the end (`currentTime = 1e10`) — the browser walks to the real
// end of the stream, fires `durationchange`, and from then on
// `audio.duration` is the real, finite seconds count. Without this,
// every Dropbox single-file paste in the inline composer fell back to
// the server's 180s default (3:00).
function probeAudioDuration(src: File | string): Promise<number | null> {
  return new Promise((resolve) => {
    const a = document.createElement("audio");
    a.preload = "metadata";
    let objectUrl: string | null = null;
    if (typeof src === "string") {
      a.src = src;
    } else {
      objectUrl = URL.createObjectURL(src);
      a.src = objectUrl;
    }
    let settled = false;
    const cleanup = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    const finish = (d: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(d);
    };
    const timer = setTimeout(() => finish(null), 12000);
    a.addEventListener("loadedmetadata", () => {
      if (a.duration === Infinity) {
        // Chunked stream — force the browser to walk to the end so it
        // can compute real duration. `durationchange` fires once the
        // real value is known.
        const onDurationChange = () => {
          if (a.duration !== Infinity && isFinite(a.duration) && a.duration > 0) {
            a.removeEventListener("durationchange", onDurationChange);
            finish(Math.round(a.duration));
          }
        };
        a.addEventListener("durationchange", onDurationChange);
        try {
          a.currentTime = 1e10;
        } catch {
          // Some browsers throw on giant seeks against unseekable
          // sources — fall through to the timeout.
        }
        return;
      }
      const d = isFinite(a.duration) && a.duration > 0
        ? Math.round(a.duration)
        : null;
      finish(d);
    });
    a.addEventListener("error", () => finish(null));
  });
}

function formatSecondsAsMmSs(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// Capture a still frame from a picked video file so the album-video
// sheet can auto-fill the Thumbnail slot when the operator hasn't
// supplied one. We seek ~10% in (capped to 2s) to skip black fade-ins
// without burning time on long talking-head clips, then draw the
// `<video>` element into a canvas and export as JPEG. Returns null on
// any failure — the sheet falls back to "no thumbnail" gracefully and
// the operator can still upload one by hand.
// Draw the current frame of a live `<video>` element into a canvas and
// return it as a JPEG blob. Shared by both the off-DOM auto-capture on
// file pick AND the visible-preview "Use this frame" scrubber button.
function captureFrameFromVideoElement(v: HTMLVideoElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (!w || !h) return resolve(null);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(v, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
    } catch {
      resolve(null);
    }
  });
}

function captureVideoPosterFrame(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    let objectUrl: string | null = null;
    let settled = false;
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    (v as any).playsInline = true;
    v.crossOrigin = "anonymous";
    const finish = (b: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(b);
    };
    const timer = setTimeout(() => finish(null), 8000);
    try {
      objectUrl = URL.createObjectURL(file);
      v.src = objectUrl;
    } catch {
      return finish(null);
    }
    v.addEventListener("loadedmetadata", () => {
      const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      const target = dur > 0 ? Math.min(2, Math.max(0.1, dur * 0.1)) : 0.1;
      v.addEventListener(
        "seeked",
        async () => {
          finish(await captureFrameFromVideoElement(v));
        },
        { once: true },
      );
      try {
        v.currentTime = target;
      } catch {
        finish(null);
      }
    });
    v.addEventListener("error", () => finish(null));
  });
}

function AddTrackForm({
  albumId,
  nextTrackNumber,
  onSaved,
  onClose,
}: {
  albumId: string;
  nextTrackNumber: number;
  onSaved: () => Promise<void> | void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [durationText, setDurationText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Optional master audio attached to the new track. Set when the admin
  // drops a file onto the row, picks one via the file input, or pastes
  // an audio URL into the title field. Sent through to POST /api/admin/songs
  // alongside title + duration so the track lands fully wired.
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  // Set alongside `audioUrl` when the upload pipeline transcoded a
  // high-bit-depth master to FLAC for browser playback. Carries the
  // ORIGINAL bytes (24-bit WAV / 32-bit PCM / etc.) so we can persist
  // them in `audioSourceUrl` and offer a download link from the row.
  const [audioSourceUrl, setAudioSourceUrl] = useState<string | null>(null);
  // Task #317 — tech-spec readout for the file the operator just
  // attached, threaded into the createMut POST body so the new row
  // lands with its full spec sheet on first paint instead of waiting
  // on the backfill sweep.
  const [pendingServedSpecs, setPendingServedSpecs] = useState<AudioSpecsPayload | null>(null);
  const [pendingSourceSpecs, setPendingSourceSpecs] = useState<AudioSpecsPayload | null>(null);
  const [audioFilename, setAudioFilename] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Task #734 — "stream-elsewhere" track: a credits-bearing song
  // GoodTunes does NOT host. When on, the operator pastes a Spotify
  // track link (optionally an Apple Music link), we look it up to confirm
  // + prefill title/duration, and the row saves with no master. The fan
  // reaches it via the "Stream this" handoff instead of in-app playback.
  const [streamOnly, setStreamOnly] = useState(false);
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [appleMusicUrl, setAppleMusicUrl] = useState("");
  const [lookupResult, setLookupResult] = useState<{
    name: string;
    artistNames: string[];
    albumName: string | null;
    artworkUrl: string | null;
    spotifyUrl: string;
  } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Staleness guard for duration probes. Each new attach bumps the token;
  // probes that resolve after a newer attach (or after submit) are
  // discarded so a slow probe can't repopulate the duration field
  // after the row has already been cleared or replaced.
  const probeTokenRef = useRef(0);
  // Handle to the most-recent in-flight probe so `submit()` can await
  // it when the operator clicks Add before the probe has had a chance
  // to populate the duration field. Without this, pasting a Dropbox
  // URL and clicking Add quickly silently saves the track with the
  // 3:00 default (because `parseDurationInput("")` falls back to 180).
  const pendingProbeRef = useRef<Promise<number | null> | null>(null);

  // Focus the title field on first mount + after each successful save so
  // the admin can stay on the keyboard and rip through a tracklist.
  useEffect(() => {
    queueMicrotask(() => titleRef.current?.focus());
  }, []);

  const handleAudioFile = async (f: File) => {
    setError(null);
    if (
      !/^audio\//.test(f.type) &&
      !/\.(mp3|m4a|aac|wav|flac|ogg|aif|aiff)$/i.test(f.name)
    ) {
      setError("That's not an audio file. Use MP3, M4A/AAC, WAV, FLAC, or OGG.");
      return;
    }
    if (f.size > 150 * 1024 * 1024) {
      setError("File too large — keep masters under 150 MB.");
      return;
    }
    // Drop any previously-attached audio URL up front. Without this, a
    // failed re-attach could leave a stale URL silently committed to
    // state while the chip's filename gets cleared in the catch below.
    // Clear the archival source alongside it — the two travel as a
    // pair; otherwise a re-attach that fails (or a manual URL paste
    // afterwards) could ship a stale audioSourceUrl from the previous
    // upload to the server.
    setAudioUrl(null);
    setAudioSourceUrl(null);
    setPendingServedSpecs(null);
    setPendingSourceSpecs(null);
    // Pre-fill what we can BEFORE the upload finishes so the admin sees
    // the row populate instantly while the bytes stream up.
    if (!title.trim()) setTitle(clientDeriveTitleFromFilename(f.name));
    setAudioFilename(f.name);
    const token = ++probeTokenRef.current;
    const probe = probeAudioDuration(f);
    pendingProbeRef.current = probe;
    probe.then((secs) => {
      if (token !== probeTokenRef.current) return; // stale probe — discard
      if (secs != null) setDurationText(formatSecondsAsMmSs(secs));
    });
    setUploading(true);
    try {
      const result = await uploadAudioFile(f);
      setAudioUrl(result.url);
      setAudioSourceUrl(result.sourceUrl);
      // Task #317 — stash the just-probed specs so createMut can ship
      // them in the POST body alongside the URLs.
      setPendingServedSpecs(result.servedSpecs ?? null);
      setPendingSourceSpecs(result.sourceSpecs ?? null);
      // Server-side duration is canonical (works on 24-bit WAV / AIFF
      // which the browser <audio> probe can't decode). Apply it
      // whenever the duration field is still empty or still showing
      // the stale value from a previous attach — but don't clobber a
      // value the operator just typed by hand.
      if (result.duration && result.duration > 0) {
        probeTokenRef.current++;
        setDurationText((prev) => {
          const parsed = parseDurationInput(prev);
          return parsed.error || parsed.seconds === 0
            ? formatSecondsAsMmSs(result.duration!)
            : prev;
        });
      }
      if (result.transcoded) {
        toast({
          title: "Master converted for browser playback",
          description: `${result.sourceBitsPerSample ?? "high"}-bit WAV preserved as the archival original; a FLAC copy will stream in browsers.`,
        });
      }
    } catch (e: any) {
      setError(e?.message || "Upload failed");
      setAudioFilename(null);
    } finally {
      setUploading(false);
    }
  };

  // When the admin pastes (or types) an audio URL directly into the title
  // field we recognize it, hydrate the audio + duration fields from it,
  // and replace the title with a derived filename so the row isn't left
  // displaying the full URL.
  const tryAdoptPastedAudioUrl = async (raw: string) => {
    const trimmed = raw.trim();
    if (!/^https?:\/\//i.test(trimmed)) return false;
    // Validate the audio extension against the URL pathname only — a
    // querystring like `?file=foo.mp3` on an HTML page must NOT trip
    // the audio detection.
    let pathName: string;
    try {
      pathName = new URL(trimmed).pathname;
    } catch {
      return false;
    }
    if (!AUDIO_EXT_RE.test(pathName)) return false;
    const file = pathName.replace(/^.*\//, "");
    const derived = clientDeriveTitleFromFilename(file);
    const normalized = normalizeAudioUrl(trimmed);
    setAudioUrl(normalized);
    // A pasted URL didn't go through our transcode pipeline, so any
    // prior archival source from a previous upload is now stale —
    // drop it so we don't ship it to the server alongside an
    // unrelated playback URL.
    setAudioSourceUrl(null);
    // Same logic for specs — a pasted URL didn't come through our
    // probe pipeline, so any pending readout from a prior upload
    // no longer matches this URL. Server-side backfill will fill
    // them in on the next boot.
    setPendingServedSpecs(null);
    setPendingSourceSpecs(null);
    setAudioFilename(file);
    setTitle(derived);
    const token = ++probeTokenRef.current;
    const probe = probeAudioDuration(normalized);
    pendingProbeRef.current = probe;
    probe.then((secs) => {
      if (token !== probeTokenRef.current) return; // stale probe — discard
      if (secs != null) setDurationText(formatSecondsAsMmSs(secs));
    });
    return true;
  };

  const clearAttachedAudio = () => {
    // Invalidate any in-flight probe so its late resolution can't
    // re-fill the duration field after detach.
    probeTokenRef.current++;
    setAudioUrl(null);
    setAudioSourceUrl(null);
    setPendingServedSpecs(null);
    setPendingSourceSpecs(null);
    setAudioFilename(null);
  };

  // Task #734 — resolve a pasted Spotify track link (or, if the field
  // holds free text, a title search) into canonical track metadata so
  // the operator can confirm the right track and prefill title/duration.
  const lookupMut = useMutation({
    mutationFn: async () => {
      const raw = spotifyUrl.trim();
      const isUrl = /open\.spotify\.com\/.*track|spotify:track:/i.test(raw);
      const res = await apiRequest("POST", "/api/admin/spotify/track-lookup", {
        ...(isUrl ? { url: raw } : { query: raw }),
      });
      return res.json() as Promise<{ match: any | null; candidates: any[] }>;
    },
    onSuccess: (data) => {
      const m = data.match;
      if (!m) {
        setError("No Spotify track found. Paste the track link or refine your search.");
        return;
      }
      setError(null);
      setSpotifyUrl(m.spotifyUrl);
      setLookupResult({
        name: m.name,
        artistNames: m.artistNames ?? [],
        albumName: m.albumName ?? null,
        artworkUrl: m.artworkUrl ?? null,
        spotifyUrl: m.spotifyUrl,
      });
      if (!title.trim() && m.name) setTitle(m.name);
      if (!durationText.trim() && typeof m.durationMs === "number" && m.durationMs > 0) {
        setDurationText(formatSecondsAsMmSs(Math.round(m.durationMs / 1000)));
      }
    },
    onError: (e: any) =>
      setError(e?.message || "Spotify lookup failed. Try again in a moment."),
  });

  const createMut = useMutation({
    mutationFn: async (input: {
      title: string;
      duration: number;
      audioUrl: string | null;
      audioSourceUrl: string | null;
      servedSpecs: AudioSpecsPayload | null;
      sourceSpecs: AudioSpecsPayload | null;
      streamOnly: boolean;
      spotifyTrackUrl: string | null;
      appleMusicTrackUrl: string | null;
    }) => {
      const res = await apiRequest("POST", "/api/admin/songs", {
        albumId,
        title: input.title,
        trackNumber: nextTrackNumber,
        duration: input.duration,
        ...(input.audioUrl ? { audioUrl: input.audioUrl } : {}),
        ...(input.audioSourceUrl ? { audioSourceUrl: input.audioSourceUrl } : {}),
        // Task #317 — only send specs when we actually probed a file
        // for this row; a pasted-URL POST omits them and the row lands
        // with null spec columns until the backfill sweep catches up.
        ...(input.servedSpecs ? { servedSpecs: input.servedSpecs } : {}),
        ...(input.sourceSpecs ? { sourceSpecs: input.sourceSpecs } : {}),
        // Task #734 — stream-elsewhere fields. When on, no master ships;
        // the per-track links carry the fan handoff.
        ...(input.streamOnly
          ? {
              streamOnly: true,
              spotifyTrackUrl: input.spotifyTrackUrl,
              appleMusicTrackUrl: input.appleMusicTrackUrl,
            }
          : {}),
      });
      return res.json();
    },
    onSuccess: async () => {
      await onSaved();
      toast({ title: `Track ${nextTrackNumber} added` });
      // Clear and refocus so the user can keep adding without re-clicking.
      // Bump the probe token first so any duration probe still in flight
      // from this row's attached audio can't write back into the
      // now-empty duration field of the next row.
      probeTokenRef.current++;
      setTitle("");
      setDurationText("");
      setAudioUrl(null);
      setAudioSourceUrl(null);
      setPendingServedSpecs(null);
      setPendingSourceSpecs(null);
      setAudioFilename(null);
      // Task #734 — clear the stream-only fields too so the next row
      // starts clean. Keep the `streamOnly` toggle ON so Bill can rip
      // through a run of stream-elsewhere tracks without re-toggling.
      setSpotifyUrl("");
      setAppleMusicUrl("");
      setLookupResult(null);
      setError(null);
      queueMicrotask(() => titleRef.current?.focus());
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't add the track",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const submit = async () => {
    if (uploading) {
      setError("Hang on — the audio is still uploading.");
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required.");
      titleRef.current?.focus();
      return;
    }
    // Task #734 — stream-elsewhere path. No master, no probe; we just
    // need a Spotify link and (default) duration. The fan handoff routes
    // off the per-track links so a Spotify link is required.
    if (streamOnly) {
      const sp = spotifyUrl.trim();
      if (!sp) {
        setError("Paste a Spotify track link (or look one up) for a stream-elsewhere track.");
        return;
      }
      const parsed = parseDurationInput(durationText);
      if (parsed.error) {
        setError(parsed.error);
        return;
      }
      setError(null);
      createMut.mutate({
        title: trimmed,
        duration: parsed.seconds,
        audioUrl: null,
        audioSourceUrl: null,
        servedSpecs: null,
        sourceSpecs: null,
        streamOnly: true,
        spotifyTrackUrl: sp,
        appleMusicTrackUrl: appleMusicUrl.trim() || null,
      });
      return;
    }
    // Click-faster-than-probe guard. When audio is attached but the
    // duration field is still empty (the operator clicked Add before
    // the browser-side <audio> probe resolved — typical when pasting a
    // remote URL like a Dropbox direct link), await the in-flight
    // probe with a short timeout so we don't silently fall back to
    // the 3:00 default that `parseDurationInput("")` returns.
    let durationSeconds: number | null = null;
    if (!durationText.trim() && audioUrl && pendingProbeRef.current) {
      const probe = pendingProbeRef.current;
      setError(null);
      const secs = await Promise.race<number | null>([
        probe,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
      if (secs != null && secs > 0) {
        durationSeconds = secs;
        setDurationText(formatSecondsAsMmSs(secs));
      }
    }
    if (durationSeconds == null) {
      // Either there was no in-flight probe, or it returned null /
      // timed out. Parse whatever's in the field (which the probe may
      // have just filled in synchronously above, but the parser here
      // reads from `durationText` state — fall back to the parsed
      // value so manual entries and probe-filled values both work).
      if (!durationText.trim() && audioUrl) {
        // Audio is attached, duration field is still empty, and the
        // probe couldn't tell us how long the track is. Refuse to
        // silently save 3:00 — make the operator type the length.
        setError(
          "Couldn't read the track length automatically. Type the duration (e.g. 3:42) and try again.",
        );
        return;
      }
      const parsed = parseDurationInput(durationText);
      if (parsed.error) {
        setError(parsed.error);
        return;
      }
      durationSeconds = parsed.seconds;
    }
    setError(null);
    createMut.mutate({
      title: trimmed,
      duration: durationSeconds,
      audioUrl,
      audioSourceUrl,
      servedSpecs: pendingServedSpecs,
      sourceSpecs: pendingSourceSpecs,
      streamOnly: false,
      spotifyTrackUrl: null,
      appleMusicTrackUrl: null,
    });
  };

  return (
    <div
      className={[
        "border-t border-slate-200 px-5 py-3.5 transition-colors",
        dragOver
          ? "bg-[var(--brand-blue)]/15 ring-2 ring-inset ring-[var(--brand-blue)]/40"
          : "bg-[var(--brand-blue)]/5",
      ].join(" ")}
      data-testid="form-add-track"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (!createMut.isPending && !uploading) submit();
        } else if (e.key === "Escape" && !createMut.isPending) {
          e.preventDefault();
          onClose();
        }
      }}
      onDragEnter={(e) => {
        if (Array.from(e.dataTransfer?.types || []).includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer?.types || []).includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        // Only un-highlight when the cursor truly leaves the row, not when
        // it moves between child inputs (which fire dragleave too).
        if (
          e.currentTarget.contains(e.relatedTarget as Node | null) === false
        ) {
          setDragOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleAudioFile(f);
      }}
    >
      {/* Hidden file picker for the inline "upload" icon button. Same
          uploadAudioFile path the master-audio editor uses, so the
          dropped/picked file ends up at the same Object Storage URL. */}
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.aif,.aiff"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleAudioFile(f);
          e.target.value = "";
        }}
        data-testid="input-new-track-audio-file"
      />
      <div className="flex items-center gap-2">
        <span className="w-7 text-right text-slate-400 text-[12px] tabular-nums font-medium flex-shrink-0">
          {nextTrackNumber}
        </span>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => {
            const v = e.target.value;
            setTitle(v);
            if (error) setError(null);
          }}
          onPaste={(e) => {
            // Auto-detect when an admin pastes a direct audio URL into
            // the title field — pull the filename out, derive a clean
            // title from it, and probe the URL for duration. Mirrors
            // the "or paste a URL" behavior of the master-audio editor.
            const pasted = e.clipboardData.getData("text") || "";
            if (
              /^https?:\/\//i.test(pasted.trim()) &&
              AUDIO_EXT_RE.test(pasted.trim())
            ) {
              e.preventDefault();
              void tryAdoptPastedAudioUrl(pasted);
            }
          }}
          placeholder={
            audioFilename
              ? "Track title (edit if needed)"
              : "Track title — or drop an audio file"
          }
          disabled={createMut.isPending}
          className="flex-1 h-8 rounded-md border border-slate-300 bg-white px-2.5 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent disabled:opacity-50"
          data-testid="input-new-track-title"
        />
        <input
          type="text"
          value={durationText}
          onChange={(e) => {
            setDurationText(e.target.value);
            if (error) setError(null);
          }}
          placeholder="3:00"
          disabled={createMut.isPending}
          aria-label="Track duration in mm:ss"
          className="w-20 h-8 rounded-md border border-slate-300 bg-white px-2.5 text-[13.5px] text-slate-900 placeholder:text-slate-400 tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent disabled:opacity-50"
          data-testid="input-new-track-duration"
        />
        {/* Task #734 — stream-elsewhere toggle. On = no master; the row
            saves with Spotify/Apple links and the fan reaches it via the
            "Stream this" handoff. Off = normal hosted master flow. */}
        <button
          type="button"
          onClick={() => {
            setStreamOnly((v) => {
              const next = !v;
              if (next) {
                // Switching to stream-only — clear any attached master so
                // we never ship audio with a stream-elsewhere row.
                clearAttachedAudio();
              } else {
                setSpotifyUrl("");
                setAppleMusicUrl("");
                setLookupResult(null);
              }
              return next;
            });
            if (error) setError(null);
          }}
          disabled={createMut.isPending || uploading}
          aria-pressed={streamOnly}
          title="Stream-elsewhere track (not hosted by GoodTunes)"
          className={[
            "px-2 h-8 rounded-md border text-[11.5px] font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1",
            streamOnly
              ? "bg-[var(--brand-purple)]/10 border-[var(--brand-purple)]/40 text-[var(--brand-purple)]"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50",
          ].join(" ")}
          data-testid="button-toggle-stream-only"
        >
          <SiSpotify className="w-3.5 h-3.5" />
          Stream-only
        </button>
        {!streamOnly && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={createMut.isPending || uploading}
            aria-label="Attach audio file"
            title="Attach audio file"
            className="px-2 h-8 rounded-md bg-white border border-slate-200 text-slate-600 text-[11.5px] font-semibold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center"
            data-testid="button-attach-new-track-audio"
          >
            {uploading ? (
              <Spinner className="w-3.5 h-3.5 animate-spin text-[var(--brand-blue)]" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={createMut.isPending || uploading}
          className="px-3 h-8 rounded-md bg-[var(--brand-blue)] text-white text-[11.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1"
          data-testid="button-save-new-track"
        >
          {createMut.isPending ? (
            <Spinner className="w-3.5 h-3.5 animate-spin" />
          ) : (
            "Add"
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={createMut.isPending}
          className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-600 text-[11.5px] font-semibold hover:bg-slate-50"
          data-testid="button-close-add-track"
        >
          Done
        </button>
      </div>
      {/* Attached-audio chip: confirms what was picked up from drop / file
          picker / pasted URL so the admin can sanity-check (or detach)
          before pressing Add. */}
      {audioFilename && (
        <div
          className="mt-1.5 ml-9 inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600"
          data-testid="chip-new-track-audio"
        >
          <Music className="w-3 h-3 text-[var(--brand-blue)]" />
          <span className="truncate max-w-[260px]">{audioFilename}</span>
          {uploading ? (
            <span className="text-slate-400">· uploading…</span>
          ) : audioUrl ? (
            <span className="text-emerald-600">· ready</span>
          ) : null}
          <button
            type="button"
            onClick={clearAttachedAudio}
            disabled={uploading || createMut.isPending}
            className="ml-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-40"
            aria-label="Detach audio"
            data-testid="button-detach-new-track-audio"
          >
            <XIcon className="w-3 h-3" />
          </button>
        </div>
      )}
      {/* Task #734 — stream-elsewhere inputs. Only shown when the
          "Stream-only" toggle is on: paste a Spotify track link (or type a
          title to search), look it up to confirm + prefill, and optionally
          paste an Apple Music link. No master is uploaded for these. */}
      {streamOnly && (
        <div className="mt-2 ml-9 space-y-2" data-testid="section-stream-only-links">
          <div className="flex items-center gap-2">
            <SiSpotify className="w-4 h-4 text-[#1DB954] flex-shrink-0" />
            <input
              type="text"
              value={spotifyUrl}
              onChange={(e) => {
                setSpotifyUrl(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (spotifyUrl.trim() && !lookupMut.isPending) lookupMut.mutate();
                }
              }}
              placeholder="Spotify track link — or type a title to search"
              disabled={createMut.isPending}
              className="flex-1 h-8 rounded-md border border-slate-300 bg-white px-2.5 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent disabled:opacity-50"
              data-testid="input-new-track-spotify-url"
            />
            <button
              type="button"
              onClick={() => {
                if (spotifyUrl.trim()) lookupMut.mutate();
              }}
              disabled={createMut.isPending || lookupMut.isPending || !spotifyUrl.trim()}
              className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-600 text-[11.5px] font-semibold hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1"
              data-testid="button-lookup-spotify-track"
            >
              {lookupMut.isPending ? (
                <Spinner className="w-3.5 h-3.5 animate-spin text-[var(--brand-blue)]" />
              ) : (
                "Look up"
              )}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <SiApplemusic className="w-4 h-4 text-[#FA243C] flex-shrink-0" />
            <input
              type="text"
              value={appleMusicUrl}
              onChange={(e) => setAppleMusicUrl(e.target.value)}
              placeholder="Apple Music track link (optional)"
              disabled={createMut.isPending}
              className="flex-1 h-8 rounded-md border border-slate-300 bg-white px-2.5 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent disabled:opacity-50"
              data-testid="input-new-track-apple-url"
            />
          </div>
          {lookupResult && (
            <div
              className="flex items-center gap-2 rounded-md bg-white border border-slate-200 px-2 py-1.5"
              data-testid="card-stream-track-match"
            >
              {lookupResult.artworkUrl ? (
                <img
                  src={lookupResult.artworkUrl}
                  alt=""
                  className="w-8 h-8 rounded object-cover flex-shrink-0"
                />
              ) : (
                <Music className="w-4 h-4 text-slate-400 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-slate-900 truncate">
                  {lookupResult.name}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {[lookupResult.artistNames.join(", "), lookupResult.albumName]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] text-slate-500 mt-1.5 pl-9">
        {error ? (
          <span className="text-rose-600">{error}</span>
        ) : audioFilename ? (
          <>Title and duration filled from the file — edit either before pressing Add.</>
        ) : (
          <>
            Press Enter to add and keep going · Esc to close · Duration
            defaults to 3:00 if blank · Drop an audio file (or paste a
            direct URL) to autofill
          </>
        )}
      </p>
    </div>
  );
}

type TrackMode = "view" | "audio" | "preview" | "lyrics" | "synced" | "credits" | "splits";

type SongCreditsLite = AlbumCreditsMap["bySongId"][string];

/* ─── Track status meter ─────────────────────────────────────────────
   Three small dots that read at a glance how complete a track is.
   The master upload is the GATE — when there's no master, the meter
   collapses to a single amber "Upload master" CTA (clicking it opens
   the audio editor). Once a master is present, the three optional
   pieces (Preview · Lyrics · Credits) each get a dot. The Preview
   dot is informational — in v1 it's always "ready" when a master
   exists because the 30-second preview is auto-derived from the
   first 30s of the master. The slider + custom-clip upload land in
   a later iteration.

   Dot states use shape (not just color) so the meter remains
   readable for deuteranopic vision:
     · empty        — hollow grey ring (Circle)
     · done         — green disc + white check (CheckCircle2)
     · synced       — brand-blue disc + custom WaveArrowGlyph (GoodSync™)
     · custom       — gold disc + ClipGlyph (admin hand-picked preview)
     · partial      — solid amber disc (credits: some but not all)
     · instrumental — grey disc + Ban glyph (lyrics: none by design)
   ──────────────────────────────────────────────────────────────── */

/* ─── Bulk-create empty track rows ────────────────────────────────────
   Reached via the Tracks-tab "Advanced" menu. Bill wanted the option
   to stamp out N empty tracks at once for a brand-new album instead
   of clicking "Add track" N times. We POST sequentially (not in
   parallel) so trackNumber can't collide. Placeholder titles read
   "Track 4 (untitled)" — same column the manual flow uses, just
   suffixed to make it obvious they still need editing. */
/* ─── Upload multiple tracks ─────────────────────────────────────────
   Two modes share one dialog so the menu copy ("Upload multiple
   tracks") covers both Bill workflows:
     • Empty rows — stamps out N placeholder rows he'll fill later.
     • From Dropbox folder — paste a share URL, server downloads the
       folder as a ZIP, uploads every audio file into Object Storage
       and creates a Song row per file with title derived from the
       filename and duration parsed from the audio metadata.
   Same numbering rule as the empty-rows path: we keep `nextTrackNumber`
   off the parent state (max(trackNumber)+1) so deletions that leave
   gaps don't collide with the tail of the existing tracklist. */
type UploadMode = "empty" | "dropbox";
/* ─── Async import job polling ────────────────────────────────────────
   Long-running admin imports (Dropbox tracks today; lyrics/credits/etc.
   to follow) return a `{ jobId }` immediately instead of blocking the
   POST. This helper polls GET /api/admin/imports/:jobId until status is
   terminal, with two timeouts so the spinner can never hang forever:

   - `perRequestTimeoutMs` aborts a single stuck GET (default 10s).
   - `overallTimeoutMs` caps wall-clock for the whole poll loop. If we
     hit it, we throw — the dialog turns the spinner off and shows a
     toast. The job itself keeps running on the server; the audit-log
     row in `job_runs` will reflect what actually happened.

   Resolves to the job's `summary` payload (`{ created, errors, skipped }`
   for the tracks importer) on success/partial; throws on failed or
   timeout. Keep the loop body free of state setters other than
   `onProgress` so consumers control their own UI. */
async function pollImportJob(
  jobId: string,
  opts: {
    onProgress?: (p: { processed: number; total: number; phase?: "download" | "process" }) => void;
    pollIntervalMs?: number;
    perRequestTimeoutMs?: number;
    overallTimeoutMs?: number;
  } = {},
): Promise<any> {
  const pollIntervalMs = opts.pollIntervalMs ?? 1500;
  const perRequestTimeoutMs = opts.perRequestTimeoutMs ?? 10_000;
  const overallTimeoutMs = opts.overallTimeoutMs ?? 10 * 60 * 1000;
  const deadline = Date.now() + overallTimeoutMs;
  const token = getAuthToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // First poll happens almost immediately so a tiny import (one file)
  // doesn't sit on the spinner for a full interval before resolving.
  let firstTick = true;
  while (true) {
    if (Date.now() > deadline) {
      throw new Error("Import is taking longer than expected. It may still be running — check back in a minute.");
    }
    await new Promise((r) => setTimeout(r, firstTick ? 250 : pollIntervalMs));
    firstTick = false;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), perRequestTimeoutMs);
    let res: Response;
    try {
      res = await fetch(`/api/admin/imports/${jobId}`, {
        headers,
        credentials: "include",
        signal: ctrl.signal,
      });
    } catch {
      // A single stuck/aborted poll isn't fatal — try again on the next
      // tick. The overall deadline above eventually catches a truly
      // broken connection.
      clearTimeout(timer);
      continue;
    }
    clearTimeout(timer);

    if (res.status === 404) {
      // Job entry has aged out of the in-memory map (10 min after
      // completion) without us seeing the terminal state. Rare — only
      // if the tab was backgrounded long enough — but worth a clear
      // error rather than spinning forever.
      throw new Error("Lost track of the import. It likely finished — refresh the album to see the result.");
    }
    if (!res.ok) {
      const text = (await res.text()) || res.statusText;
      throw new Error(`${res.status}: ${text}`);
    }
    const state = await res.json();
    if (state.progress && opts.onProgress) opts.onProgress(state.progress);
    if (state.status === "running") continue;
    if (state.status === "failed") {
      throw new Error(state.errorMessage || "Import failed.");
    }
    // success | partial — both resolve with the summary so the caller
    // can render a "X added, Y failed" toast uniformly.
    return state.summary ?? {};
  }
}

function AddMultipleTracksDialog({
  open,
  onOpenChange,
  albumId,
  nextTrackNumber,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  albumId: string;
  nextTrackNumber: number;
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<UploadMode>("dropbox");
  const [countText, setCountText] = useState("5");
  const [folderUrl, setFolderUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [created, setCreated] = useState(0);

  useEffect(() => {
    if (open) {
      setMode("dropbox");
      setCountText("5");
      setFolderUrl("");
      setRunning(false);
      setCreated(0);
      setProgress(null);
    }
  }, [open]);

  const n = (() => {
    const parsed = Math.floor(Number(countText));
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(50, parsed));
  })();

  const handleConfirmEmpty = async () => {
    if (n <= 0 || running) return;
    setRunning(true);
    setCreated(0);
    let ok = 0;
    let firstError: string | null = null;
    for (let i = 0; i < n; i++) {
      try {
        await apiRequest("POST", "/api/admin/songs", {
          albumId,
          title: `Track ${nextTrackNumber + i} (untitled)`,
          trackNumber: nextTrackNumber + i,
          duration: 180,
        });
        ok++;
        setCreated(ok);
      } catch (e: any) {
        if (!firstError) firstError = e?.message || "Couldn't add a track";
      }
    }
    await onSaved();
    if (firstError && ok === 0) {
      toast({ title: "Couldn't add tracks", description: firstError, variant: "destructive" });
    } else {
      toast({
        title: `Added ${ok} ${ok === 1 ? "track" : "tracks"}`,
        description: firstError ? `One or more failed: ${firstError}` : undefined,
      });
    }
    setRunning(false);
    onOpenChange(false);
  };

  // Polling progress for the async import job. `processed/total` drives
  // the inline "Importing 3/12…" spinner; null while we're still
  // waiting for the first poll to come back.
  const [progress, setProgress] = useState<{ processed: number; total: number; phase?: "download" | "process" } | null>(null);

  const handleConfirmDropbox = async () => {
    if (!folderUrl.trim() || running) return;
    setRunning(true);
    setProgress(null);
    try {
      // POST kicks off the import in the background and returns a jobId
      // immediately (202). The actual import — Dropbox download, audio
      // upload, duration probe — runs on the server while we poll.
      const res = await apiRequest(
        "POST",
        `/api/admin/albums/${albumId}/import-tracks-from-dropbox`,
        { folderUrl: folderUrl.trim() },
      );
      const { jobId } = await res.json();
      if (!jobId) throw new Error("Server didn't return a job ID.");

      // Poll until terminal status, with a wall-clock cap so the spinner
      // can't hang forever (one stuck request, server crash, etc.).
      const data = await pollImportJob(jobId, {
        onProgress: (p) => setProgress(p),
        // 15 min — generous for a long album over slow Dropbox; longer
        // than this and something's wrong, not slow.
        overallTimeoutMs: 15 * 60 * 1000,
        // Per-poll: a single GET shouldn't sit longer than 10s.
        perRequestTimeoutMs: 10_000,
      });
      await onSaved();
      const ok = data.created?.length || 0;
      const errorList: Array<{ filename: string; error: string }> =
        Array.isArray(data.errors) ? data.errors : [];
      const failed = errorList.length;
      const skipped: string[] = Array.isArray(data.skipped) ? data.skipped : [];
      if (ok === 0 && failed === 0) {
        toast({ title: "No tracks created", variant: "destructive" });
        setRunning(false);
        setProgress(null);
        return;
      }
      // Success (even partial) — close the dialog and confirm with a toast.
      // Failed files are surfaced in the toast description rather than an
      // in-dialog summary so the import always ends with the sheet gone.
      // `skipped` = files the importer ignored (wrong extension, etc.) —
      // surfaced so "where did my tracks go?" answers itself from the toast.
      const parts: string[] = [];
      if (failed > 0) {
        // Roll up to the dominant cause across all failures so a 12-file
        // import doesn't surface only the first file's error and hide a
        // common pattern ("11 of 12 too large"). Bucket by the raw error
        // string, pick the most-frequent bucket, then quote one example
        // filename from that bucket.
        const buckets = new Map<string, string[]>();
        for (const item of errorList) {
          const key = item.error || "Failed to import";
          const list = buckets.get(key) ?? [];
          list.push(item.filename);
          buckets.set(key, list);
        }
        let dominantReason = errorList[0]?.error ?? "Failed to import";
        let dominantFiles: string[] = errorList[0] ? [errorList[0].filename] : [];
        for (const [reason, files] of Array.from(buckets.entries())) {
          if (files.length > dominantFiles.length) {
            dominantReason = reason;
            dominantFiles = files;
          }
        }
        const ratio = dominantFiles.length === failed
          ? `${failed} file${failed === 1 ? "" : "s"}`
          : `${dominantFiles.length} of ${failed} files`;
        const example = dominantFiles[0] ? ` — e.g. ${dominantFiles[0]}` : "";
        parts.push(`${ratio} couldn't be imported: ${dominantReason}${example}`);
      }
      if (skipped.length > 0) {
        const preview = skipped.slice(0, 3).join(", ");
        parts.push(`${skipped.length} skipped (not audio): ${preview}${skipped.length > 3 ? "…" : ""}`);
      }
      // Flag partial outcomes in the title itself — operators scan titles
      // first and were missing skip context when it lived only in the
      // description.
      const titleSuffix = skipped.length > 0 ? ` · ${skipped.length} skipped` : "";
      toast({
        title: `${ok} ${ok === 1 ? "track" : "tracks"} added${titleSuffix}`,
        description: parts.length > 0 ? parts.join(" · ") : undefined,
      });
      setRunning(false);
      setProgress(null);
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Dropbox import failed",
        description: e?.message || "Check the link and try again.",
        variant: "destructive",
      });
      setRunning(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4">
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-[17px] font-semibold text-slate-900 inline-flex items-center gap-2">
            Upload multiple tracks
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="How upload multiple tracks works"
                  className="w-5 h-5 rounded-full text-slate-400 hover:text-[var(--brand-blue)] hover:bg-slate-100 inline-flex items-center justify-center flex-shrink-0"
                  data-testid="button-tracks-info"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="start"
                className="w-72 text-[12px] leading-relaxed bg-white border border-slate-200 shadow-lg text-slate-700"
              >
                <p className="font-semibold text-slate-900 mb-1.5">
                  Two ways to bulk-add
                </p>
                <p>
                  <span className="font-medium text-slate-900">Empty rows</span>{" "}
                  stamps out N placeholder rows, numbered starting from the next
                  track number. No audio or lyrics — that's still on you.
                </p>
                <p className="mt-2">
                  <span className="font-medium text-slate-900">From Dropbox</span>{" "}
                  pulls audio from a folder (whole album) or a single file (one
                  track), shared as{" "}
                  <span className="font-medium text-slate-900">
                    Anyone with the link
                  </span>
                  . Numbered alphabetically. Audio formats: .mp3, .wav, .flac,
                  .m4a, .aac, .aif/.aiff, .ogg.
                </p>
              </PopoverContent>
            </Popover>
          </DialogTitle>
          <DialogDescription className="text-[13px] font-normal text-slate-500">
            Stamp out a batch of empty rows, or pull audio from a Dropbox
            folder (or a single file) in one go.
          </DialogDescription>
        </DialogHeader>

        {/* Mode segmented control — Apple-Mac-app density (slate-100 bg,
            slate-900 active pill) to match the rest of admin chrome. */}
        <div className="inline-flex bg-slate-100 rounded-lg p-0.5 self-start" role="tablist">
          {([
            { id: "dropbox", label: "From Dropbox" },
            { id: "empty", label: "Empty rows" },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={mode === opt.id}
              disabled={running}
              onClick={() => setMode(opt.id)}
              data-testid={`tab-upload-mode-${opt.id}`}
              className={cn(
                "h-7 px-3 rounded-md text-[12px] font-medium transition-colors",
                mode === opt.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {mode === "empty" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-track-count" className="text-[12.5px] font-medium text-slate-700">
                How many tracks?
              </Label>
              <Input
                id="bulk-track-count"
                type="number"
                min={1}
                max={50}
                value={countText}
                onChange={(e) => setCountText(e.target.value)}
                disabled={running}
                autoFocus
                data-testid="input-bulk-track-count"
                className="h-10 text-[14px] bg-white text-slate-900 border-slate-300 placeholder:text-slate-400"
              />
              <p className="text-[11.5px] text-slate-400">Up to 50 at a time.</p>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-dropbox-url" className="text-[12.5px] font-medium text-slate-700">
                Dropbox folder or file link
              </Label>
              <Input
                id="bulk-dropbox-url"
                type="url"
                placeholder="https://www.dropbox.com/scl/fo/… or /scl/fi/…"
                value={folderUrl}
                onChange={(e) => setFolderUrl(e.target.value)}
                disabled={running}
                autoFocus
                data-testid="input-bulk-dropbox-url"
                className="h-10 text-[14px] bg-white text-slate-900 border-slate-300 placeholder:text-slate-400"
              />
              <p className="text-[11.5px] text-slate-400">
                Folder links import every audio file inside; file links import that one track.
              </p>
            </div>
          </>
        )}

        {/* Live progress while the import runs. Lives ABOVE the footer so
            the action button itself stays compact — the bar is the
            primary "something is happening" signal, the button just
            confirms the operation can't be re-fired. Indeterminate
            shimmer for the Dropbox-download phase (before the server
            knows the file count), determinate fill once setProgress
            lands. Sibling label sits right under it so the operator
            gets both a visual rate AND an exact count. */}
        {running && mode === "dropbox" && (
          <div className="space-y-1.5 pt-1" data-testid="bulk-dropbox-progress">
            <ProgressStrip progress={progress} />
            <div className="flex items-center justify-between text-[11.5px] text-slate-500">
              <span data-testid="text-bulk-dropbox-progress">
                {!progress
                  ? "Connecting to Dropbox…"
                  : progress.phase === "process"
                    ? `Importing ${progress.processed} of ${progress.total}…`
                    : "Downloading from Dropbox…"}
              </span>
              {progress && progress.total > 0 && (
                <span className="tabular-nums">
                  {Math.min(100, Math.round((progress.processed / progress.total) * 100))}%
                </span>
              )}
            </div>
          </div>
        )}
        {running && mode === "empty" && (
          <div className="space-y-1.5 pt-1" data-testid="bulk-empty-progress">
            <ProgressStrip progress={{ processed: created, total: n }} />
            <div className="flex items-center justify-between text-[11.5px] text-slate-500">
              <span data-testid="text-bulk-empty-progress">
                Creating {created} of {n}…
              </span>
              <span className="tabular-nums">
                {n > 0 ? Math.min(100, Math.round((created / n) * 100)) : 0}%
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-row justify-end items-center gap-2 pt-2 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            data-testid="button-bulk-cancel"
            className="px-3.5 py-1.5 rounded-md text-[13px] font-medium text-slate-600 hover:bg-slate-100"
          >
            {running ? "Close" : "Cancel"}
          </button>
          {mode === "empty" ? (
            <button
              type="button"
              onClick={handleConfirmEmpty}
              disabled={running || n <= 0}
              data-testid="button-bulk-confirm"
              className="px-3.5 py-1.5 rounded-md text-[13px] font-semibold bg-[#319ED8] text-white hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-2"
            >
              {running ? (
                <>Creating…</>
              ) : (
                <>Create {n} {n === 1 ? "track" : "tracks"}</>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirmDropbox}
              disabled={running || !folderUrl.trim()}
              data-testid="button-bulk-dropbox-confirm"
              className="px-3.5 py-1.5 rounded-md text-[13px] font-semibold bg-[#319ED8] text-white hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-2"
            >
              {running ? <>Importing…</> : <>Import from Dropbox</>}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Import lyrics from Dropbox ──────────────────────────────────────
   Paste a Dropbox folder URL full of .pdf / .docx / .txt files; the
   server downloads the folder as a ZIP, extracts text from each
   document, and matches the filename to an existing track title (case-
   insensitive, punctuation-ignored, with a substring fallback). On
   match we set song.lyrics; on miss we surface the filename so Bill
   can rename and retry. */
function ImportLyricsFromDropboxDialog({
  open,
  onOpenChange,
  albumId,
  songs,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  albumId: string;
  songs: SongLite[];
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const songCount = songs.length;
  const songsRef = useRef(songs);
  useEffect(() => {
    songsRef.current = songs;
  }, [songs]);
  const [folderUrl, setFolderUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<
    null | {
      matched: Array<{ songId: string; title: string; filename: string; charCount: number }>;
      unmatched: Array<{ filename: string; suggestedTitle: string; charCount: number; reason?: string }>;
      errors: Array<{ filename: string; error: string }>;
      ranAt?: string;
      songCount?: number;
      syncDone?: {
        synced: number;
        failed: Array<{ title: string; error: string }>;
        chorusSet?: number;
        chorusByAi?: number;
      };
    }
  >(null);
  // GoodSync™ follow-up state — after a lyrics import lands, Bill wanted
  // the dialog to stay up and offer "Now align them to audio in one
  // pass" instead of making him reopen each track and hit Sync. We run
  // /auto-sync-lyrics serially over `summary.matched` (one ElevenLabs
  // call per track, ~5–15s each). Serial keeps backend load + ElevenLabs
  // rate-limit risk identical to the per-track button, just hands-off.
  // The run keeps going even if the dialog closes — `syncInFlightRef`
  // tells the open-effect to leave progress state alone on reopen.
  const [syncProgress, setSyncProgress] = useState<
    null | { current: number; total: number; currentTitle: string }
  >(null);
  const [syncDone, setSyncDone] = useState<
    null | {
      synced: number;
      failed: Array<{ title: string; error: string }>;
      chorusSet?: number;
      chorusByAi?: number;
    }
  >(null);
  // "ask-chorus" appears between clicking GoodSync™ and the serial run,
  // mirroring the standalone "GoodSync™ the whole album" wizard.
  const [chorusPhase, setChorusPhase] = useState<"idle" | "ask-chorus">("idle");
  const syncInFlightRef = useRef(false);

  // Sticky summary: persist the last result per album so reopening the
  // dialog shows what happened on the previous run instead of a blank
  // form. Bill explicitly chose this over a full notifications center.
  const storageKey = `gt:admin:job-summary:lyrics-import:${albumId}`;
  useEffect(() => {
    if (open) {
      // Don't trample a sync that's still running in the background.
      // The user closed the dialog mid-run; on reopen they should see
      // the live progress they left behind, not a reset form.
      if (syncInFlightRef.current) return;
      setFolderUrl("");
      setRunning(false);
      setSyncProgress(null);
      setSyncDone(null);
      setChorusPhase("idle");
      try {
        const stored = localStorage.getItem(storageKey);
        const parsed = stored ? JSON.parse(stored) : null;
        // Invalidate stale summaries: if the album's track count has
        // changed since the run, the matched/unmatched lists no longer
        // reflect reality. Safer to clear than to show a misleading
        // "Matched 9" against an album that now has different tracks.
        if (parsed && typeof parsed.songCount === "number" && parsed.songCount !== songCount) {
          localStorage.removeItem(storageKey);
          setSummary(null);
        } else {
          setSummary(parsed);
          // Restore the prior sync result card if the last run finished.
          if (parsed?.syncDone) setSyncDone(parsed.syncDone);
        }
      } catch {
        setSummary(null);
      }
    }
  }, [open, storageKey, songCount]);

  const handleConfirm = async () => {
    if (!folderUrl.trim() || running) return;
    setRunning(true);
    setSummary(null);
    try {
      const res = await apiRequest(
        "POST",
        `/api/admin/albums/${albumId}/import-lyrics-from-dropbox`,
        { folderUrl: folderUrl.trim() },
      );
      const data = await res.json();
      const nextSummary = {
        matched: data.matched || [],
        unmatched: data.unmatched || [],
        errors: data.errors || [],
        ranAt: new Date().toISOString(),
        songCount,
      };
      setSummary(nextSummary);
      setSyncDone(null);
      setChorusPhase("idle");
      try {
        localStorage.setItem(storageKey, JSON.stringify(nextSummary));
      } catch {}
      await onSaved();
      const ok = data.matched?.length || 0;
      const miss = (data.unmatched?.length || 0) + (data.errors?.length || 0);
      toast({
        title: `Matched ${ok} ${ok === 1 ? "song" : "songs"}`,
        description: miss > 0 ? `${miss} file${miss === 1 ? "" : "s"} didn't match a track.` : undefined,
      });
    } catch (e: any) {
      toast({
        title: "Couldn't import lyrics",
        description: e?.message || "Check the link and try again.",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  // GoodSync™ follow-up: iterate the matched songs serially and POST
  // /auto-sync-lyrics per track. Progress is exposed via syncProgress
  // so the dialog can render "GoodSyncing™ 3 of 12 · Storms…" inline;
  // the final tally lands in syncDone for the result card. Failures
  // don't abort the run — we collect them and surface a per-track list
  // so Bill can re-run individual tracks afterward.
  //
  // The serial run is intentionally decoupled from the dialog's open
  // state: once started it keeps going until completion, even if the
  // dialog is closed (Done / X / backdrop). The completion toast still
  // fires, and syncDone is mirrored into the sticky localStorage
  // summary so a reopen still shows the result card.
  //
  // `wantsChorus` is passed as an argument rather than read from state
  // so the chorus question can `setChorusPhase("idle"); goodSyncAll(t)`
  // in one tick without losing the choice to React batching — same
  // pattern the standalone wizard uses.
  const goodSyncAll = async (wantsChorus: boolean) => {
    if (!summary || syncProgress) return;
    const matched = summary.matched;
    if (matched.length === 0) return;
    syncInFlightRef.current = true;
    setSyncDone(null);
    const failed: Array<{ title: string; error: string }> = [];
    let synced = 0;
    // Chorus tally for the result card — how many previews we moved, and
    // how many of those came from the deterministic [Chorus] marker vs.
    // the AI fallback. Tracks we couldn't decide are left untouched.
    let chorusSet = 0;
    let chorusByAi = 0;
    for (let i = 0; i < matched.length; i++) {
      const m = matched[i];
      setSyncProgress({ current: i + 1, total: matched.length, currentTitle: m.title });
      try {
        const res = await apiRequest(
          "POST",
          `/api/admin/songs/${m.songId}/auto-sync-lyrics`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.message || `HTTP ${res.status}`);
        }
        synced++;
        // Chorus follow-up — reuses findChorusStartMs (same helper the
        // standalone "GoodSync™ the whole album" wizard uses). When the
        // user opted in and the freshly-synced cues have a chorus line,
        // PUT a 30s preview window starting at the chorus. Failures here
        // are non-fatal; the lyrics sync still counts as successful.
        if (wantsChorus) {
          try {
            const payload = await res.clone().json().catch(() => ({}));
            const updated = payload?.song;
            const cues: { timeMs: number; text: string }[] =
              updated?.syncedLyrics ?? [];
            const song = songsRef.current.find((s) => s.id === m.songId);
            const lyricsText = updated?.lyrics ?? song?.lyrics ?? null;
            if (cues.length > 0) {
              // Two-tier: deterministic [Chorus] marker first, then the AI
              // fallback for tracks whose lyrics carry no section labels.
              const found = await resolveChorusStartMs(
                m.songId,
                lyricsText,
                cues,
              );
              if (found != null) {
                const startMs = found.startMs;
                const durMs = (song?.duration || 0) * 1000;
                const endMs = Math.min(
                  startMs + 30_000,
                  durMs > 0 ? durMs - 1 : startMs + 30_000,
                );
                if (endMs > startMs) {
                  await apiRequest("PUT", `/api/admin/songs/${m.songId}`, {
                    previewStartMs: startMs,
                    previewEndMs: endMs,
                  });
                  chorusSet++;
                  if (found.method === "ai") chorusByAi++;
                }
              }
            }
          } catch {
            /* chorus assist failure is non-fatal */
          }
        }
      } catch (e: any) {
        failed.push({ title: m.title, error: e?.message || "Failed" });
      }
    }
    setSyncProgress(null);
    const doneState = {
      synced,
      failed,
      ...(wantsChorus ? { chorusSet, chorusByAi } : {}),
    };
    setSyncDone(doneState);
    syncInFlightRef.current = false;
    // Mirror the result into the sticky localStorage summary so a
    // reopen after a background-closed run still shows the result card.
    try {
      const stored = localStorage.getItem(storageKey);
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) {
        parsed.syncDone = doneState;
        localStorage.setItem(storageKey, JSON.stringify(parsed));
      }
    } catch {}
    await onSaved();
    toast({
      title:
        failed.length === 0
          ? `GoodSync™ complete · ${synced} ${synced === 1 ? "track" : "tracks"}`
          : `GoodSync™ done · ${synced} synced · ${failed.length} failed`,
      description:
        failed.length === 0
          ? "Open any track to scroll-test the alignment."
          : "Failed tracks left their lyrics intact — re-run from the track row.",
      variant: failed.length === 0 ? undefined : "destructive",
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !running && onOpenChange(v)}>
      <DialogContent className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4">
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-[17px] font-semibold text-slate-900 inline-flex items-center gap-2">
            Import lyrics from Dropbox
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="How to share the folder"
                  className="w-5 h-5 rounded-full text-slate-400 hover:text-[var(--brand-blue)] hover:bg-slate-100 inline-flex items-center justify-center flex-shrink-0"
                  data-testid="button-lyrics-import-info"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="start"
                className="w-72 text-[12px] leading-relaxed bg-white border border-slate-200 shadow-lg text-slate-700"
              >
                <p className="font-semibold text-slate-900 mb-1.5">
                  Sharing your folder
                </p>
                <p>
                  Share the folder (or file) as{" "}
                  <span className="font-medium text-slate-900">
                    Anyone with the link
                  </span>
                  . Supported formats: .pdf, .docx, .txt. Name each file after
                  the track (e.g.{" "}
                  <span className="font-medium text-slate-900">Storms.pdf</span>)
                  and I'll do the rest.
                </p>
                <p className="text-slate-500 mt-2 text-[11px]">
                  {songCount > 0
                    ? `This album has ${songCount} track${songCount === 1 ? "" : "s"} to match against.`
                    : "Add tracks first, then come back here."}
                </p>
              </PopoverContent>
            </Popover>
          </DialogTitle>
          <DialogDescription className="text-[13px] font-normal text-slate-500">
            Paste a Dropbox folder of lyric documents — or a single file
            for one track. I'll match each file to a track by filename
            and fill in the lyrics.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="lyrics-dropbox-url" className="text-[12.5px] font-medium text-slate-700">
            Dropbox folder or file link
          </Label>
          <Input
            id="lyrics-dropbox-url"
            type="url"
            placeholder="https://www.dropbox.com/scl/fo/… or /scl/fi/…"
            value={folderUrl}
            onChange={(e) => setFolderUrl(e.target.value)}
            disabled={running || songCount === 0}
            autoFocus
            data-testid="input-lyrics-dropbox-url"
            className="h-10 text-[14px] bg-white text-slate-900 border-slate-300 placeholder:text-slate-400"
          />
        </div>

        {summary && (
          <div className="space-y-2 max-h-[220px] overflow-auto rounded-lg border border-slate-200 p-2.5">
            {summary.matched.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11.5px] font-medium text-emerald-700">
                  Matched {summary.matched.length}:
                </div>
                {summary.matched.map((m) => (
                  <div key={m.songId} className="text-[11.5px] text-slate-600 truncate" data-testid={`row-lyrics-matched-${m.songId}`}>
                    <span className="font-medium text-slate-700">{m.title}</span>{" "}
                    <span className="text-slate-400">← {m.filename} · {m.charCount} chars</span>
                  </div>
                ))}
              </div>
            )}
            {summary.unmatched.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="text-[11.5px] font-medium text-amber-700">
                  No track match for {summary.unmatched.length}:
                </div>
                {summary.unmatched.map((u) => (
                  <div key={u.filename} className="text-[11.5px] text-slate-600 truncate">
                    {u.filename}{" "}
                    <span className="text-slate-400">
                      — {u.reason || `would set title to "${u.suggestedTitle}"`}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {summary.errors.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="text-[11.5px] font-medium text-rose-700">
                  Couldn't read {summary.errors.length}:
                </div>
                {summary.errors.map((e) => (
                  <div key={e.filename} className="text-[11.5px] text-slate-600 truncate">
                    {e.filename} <span className="text-slate-400">— {e.error}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* GoodSync™ follow-up — stays visible whenever we have matched
            tracks and we haven't already finished a sync run. Disappears
            once syncDone is set (results card takes over below). The
            chorus question slot mirrors the standalone "GoodSync™ the
            whole album" wizard so behavior matches between surfaces. */}
        {summary && summary.matched.length > 0 && !syncDone && (
          <div
            className="rounded-lg border border-[var(--brand-blue)]/30 bg-[var(--brand-blue)]/5 px-3 py-2.5 space-y-2"
            data-testid="card-goodsync-prompt"
          >
            {syncProgress ? (
              <div className="flex items-center gap-2 text-[12.5px] text-slate-700">
                <Spinner className="w-3.5 h-3.5 animate-spin text-[var(--brand-blue)] flex-shrink-0" />
                <span className="tabular-nums">
                  GoodSyncing™ {syncProgress.current} of {syncProgress.total}
                </span>
                <span className="text-slate-400 truncate">· {syncProgress.currentTitle}</span>
              </div>
            ) : chorusPhase === "ask-chorus" ? (
              <>
                <div className="text-[12.5px] text-slate-700">
                  <span className="font-medium text-slate-900">
                    One last question — set the preview to start at the chorus?
                  </span>{" "}
                  <span className="text-slate-500">
                    I'll do my best on tracks with a{" "}
                    <code className="px-1 py-0.5 rounded bg-white border border-slate-200 text-[11px] text-slate-700">
                      [Chorus]
                    </code>{" "}
                    marker; the rest keep their existing preview.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setChorusPhase("idle");
                      void goodSyncAll(true);
                    }}
                    data-testid="button-goodsync-find-chorus"
                    className="px-3 py-1 rounded-md text-[12.5px] font-semibold bg-[var(--brand-blue)] text-white hover:bg-[#2890c8] inline-flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Yes, find the chorus
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setChorusPhase("idle");
                      void goodSyncAll(false);
                    }}
                    data-testid="button-goodsync-just-sync"
                    className="px-2.5 py-1 rounded-md text-[12.5px] font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Just sync
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[12.5px] text-slate-700">
                  <span className="font-medium text-slate-900">Would you like to GoodSync™ these?</span>{" "}
                  <span className="text-slate-500">
                    Aligns each line to the audio using ElevenLabs (~5–15s per track).
                    You can close this dialog — I'll toast you when it's done.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setChorusPhase("ask-chorus")}
                    data-testid="button-goodsync-after-import"
                    className="px-3 py-1 rounded-md text-[12.5px] font-semibold bg-[var(--brand-blue)] text-white hover:bg-[#2890c8] inline-flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    GoodSync™ {summary.matched.length} {summary.matched.length === 1 ? "track" : "tracks"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncDone({ synced: 0, failed: [] })}
                    data-testid="button-goodsync-skip"
                    className="px-2.5 py-1 rounded-md text-[12.5px] font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Not now
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {syncDone && syncDone.synced + syncDone.failed.length > 0 && (
          <div
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12.5px] text-slate-700 space-y-1"
            data-testid="card-goodsync-result"
          >
            <div className="font-medium text-slate-900">
              GoodSync™ results · {syncDone.synced} synced
              {syncDone.failed.length > 0 ? ` · ${syncDone.failed.length} failed` : ""}
            </div>
            {syncDone.failed.length > 0 && (
              <div className="space-y-0.5">
                {syncDone.failed.map((f) => (
                  <div key={f.title} className="text-[11.5px] text-rose-600 truncate">
                    {f.title} <span className="text-slate-400">— {f.error}</span>
                  </div>
                ))}
              </div>
            )}
            {syncDone.chorusSet != null && (
              <div className="text-slate-600 pt-0.5">
                {syncDone.chorusSet > 0 ? (
                  <>
                    Chorus preview set on{" "}
                    <span className="font-medium text-slate-700">
                      {syncDone.chorusSet}
                    </span>{" "}
                    {syncDone.chorusSet === 1 ? "track" : "tracks"}
                    {syncDone.chorusByAi != null && syncDone.chorusByAi > 0 && (
                      <span className="text-slate-400">
                        {" "}
                        ({syncDone.chorusByAi} found by AI)
                      </span>
                    )}
                    {syncDone.chorusSet < syncDone.synced && (
                      <span className="text-slate-400">
                        {" "}
                        · the rest kept their existing preview
                      </span>
                    )}
                    .
                  </>
                ) : (
                  <span className="text-slate-400">
                    No chorus could be confidently found — previews left as-is.
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex flex-row justify-end items-center gap-2 pt-2 sm:gap-2">
          {summary ? (
            // After a run, the summary IS the result — no second action
            // to commit. One clear primary "Done" to close, plus a
            // ghost "Run again" if Bill wants to retry with a new link.
            <>
              <button
                type="button"
                onClick={() => {
                  try { localStorage.removeItem(storageKey); } catch {}
                  setSummary(null);
                  setFolderUrl("");
                  setSyncDone(null);
                  setChorusPhase("idle");
                }}
                disabled={!!syncProgress}
                data-testid="button-lyrics-import-run-again"
                className="px-3.5 py-1.5 rounded-md text-[13px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Run again
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                data-testid="button-lyrics-import-done"
                className="px-3.5 py-1.5 rounded-md text-[13px] font-semibold bg-[#319ED8] text-white hover:bg-[#2890c8]"
              >
                Done
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={running}
                data-testid="button-lyrics-import-cancel"
                className="px-3.5 py-1.5 rounded-md text-[13px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={running || !folderUrl.trim() || songCount === 0}
                data-testid="button-lyrics-import-confirm"
                className="px-3.5 py-1.5 rounded-md text-[13px] font-semibold bg-[#319ED8] text-white hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-2"
              >
                {running ? (
                  <>
                    <Spinner className="w-3.5 h-3.5 animate-spin" />
                    Importing lyrics…
                  </>
                ) : (
                  <>Import lyrics</>
                )}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── GoodSync™ the whole album ───────────────────────────────────────
   Two-step Apple-style wizard that runs ElevenLabs auto-sync against
   every eligible track on the album.
     Step 1 (intro):  Friendly framing ("we love this — saves you
                      time"). If any tracks already have hand-tuned
                      cues, a Skip/Re-sync radio appears inline so
                      the conflict question doesn't need its own
                      step. Otherwise the intro is a single Continue.
     Step 2 (chorus): "Want me to set the preview to start at the
                      chorus?" Yes/Just sync.
     Running:        Live per-track progress list.
     Done:           Summary card.
   Eligibility mirrors the per-track GoodSync rules: needs a master
   uploaded, lyrics typed in (so chorus markers can be found), and
   the track must not be flagged as instrumental. Anything that
   doesn't qualify is shown as Skipped in the summary, not as an
   error — Bill explicitly asked us to bypass tracks without a
   master rather than fail loudly. */
type GoodSyncStep = "intro" | "chorus" | "running" | "done";
type TrackRunState = "pending" | "syncing" | "synced" | "skipped" | "failed";
function GoodSyncAlbumDialog({
  open,
  onOpenChange,
  songs,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  songs: SongLite[];
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<GoodSyncStep>("intro");
  const [conflictMode, setConflictMode] = useState<"skip" | "resync">("skip");
  const [findChorus, setFindChorus] = useState(true);
  const [states, setStates] = useState<Record<string, TrackRunState>>({});
  // Per-track failure reason so the row can show a useful label
  // ("Sign-in invalid") instead of a generic "Failed", and the summary
  // can roll up a single banner when every track hit the same auth wall.
  const [failReasons, setFailReasons] = useState<Record<string, { code?: string; message?: string }>>({});
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [chorusSetIds, setChorusSetIds] = useState<Set<string>>(new Set());
  const [chorusAiIds, setChorusAiIds] = useState<Set<string>>(new Set());

  // Eligibility: master uploaded + not flagged instrumental. Lyrics are
  // NOT required — when a track has no Words yet, Scribe transcribes the
  // master and back-populates `song.lyrics` from the transcription, so
  // the operator can run GoodSync as a "pull lyrics off the audio" pass.
  const eligible = useMemo(
    () =>
      songs.filter(
        (s) =>
          !s.instrumental &&
          !!s.audioUrl,
      ),
    [songs],
  );
  const alreadySynced = useMemo(
    () => eligible.filter((s) => (s.syncedLyrics?.length ?? 0) > 0),
    [eligible],
  );
  const ineligible = songs.length - eligible.length;
  const hasConflict = alreadySynced.length > 0;

  useEffect(() => {
    if (open) {
      setStep("intro");
      setConflictMode("skip");
      setFindChorus(true);
      setStates({});
      setFailReasons({});
      setCurrentId(null);
      setChorusSetIds(new Set());
      setChorusAiIds(new Set());
    }
  }, [open]);

  // Note: takes `wantsChorus` as an arg rather than reading from state.
  // The chorus-step buttons fire `setFindChorus(...); runSync()` back
  // to back — React batches the state update, so a `runSync` that
  // reads `findChorus` from its closure sees the stale value. Passing
  // the choice explicitly is the only safe pattern here.
  const runSync = async (wantsChorus: boolean) => {
    setFindChorus(wantsChorus);
    const queue =
      conflictMode === "skip"
        ? eligible.filter((s) => (s.syncedLyrics?.length ?? 0) === 0)
        : eligible;
    const initialStates: Record<string, TrackRunState> = {};
    for (const s of eligible) {
      initialStates[s.id] =
        conflictMode === "skip" && (s.syncedLyrics?.length ?? 0) > 0
          ? "skipped"
          : "pending";
    }
    setStates(initialStates);
    setStep("running");
    const chorusSet = new Set<string>();
    const chorusAiSet = new Set<string>();
    for (const song of queue) {
      setCurrentId(song.id);
      setStates((prev) => ({ ...prev, [song.id]: "syncing" }));
      try {
        const res = await apiRequest(
          "POST",
          `/api/admin/songs/${song.id}/auto-sync-lyrics`,
          {},
        );
        const payload = await res.json().catch(() => ({}));
        const updated = payload?.song;
        const cues: { timeMs: number; text: string }[] =
          updated?.syncedLyrics ?? [];
        setStates((prev) => ({ ...prev, [song.id]: "synced" }));
        if (wantsChorus && cues.length > 0) {
          // Two-tier: deterministic [Chorus] marker first, then the AI
          // fallback for tracks whose lyrics carry no section labels.
          const found = await resolveChorusStartMs(
            song.id,
            updated?.lyrics ?? song.lyrics,
            cues,
          );
          if (found != null) {
            const startMs = found.startMs;
            const durMs = (song.duration || 0) * 1000;
            const endMs = Math.min(
              startMs + 30_000,
              durMs > 0 ? durMs - 1 : startMs + 30_000,
            );
            if (endMs > startMs) {
              try {
                await apiRequest("PUT", `/api/admin/songs/${song.id}`, {
                  previewStartMs: startMs,
                  previewEndMs: endMs,
                });
                chorusSet.add(song.id);
                if (found.method === "ai") chorusAiSet.add(song.id);
              } catch {
                /* preview update failure is non-fatal */
              }
            }
          }
        }
      } catch (err: any) {
        // apiRequest throws "<status>: <body>" on non-2xx — try to
        // tease the JSON back out so we can show a precise label.
        let code: string | undefined;
        let message: string | undefined;
        const raw = String(err?.message ?? "");
        const jsonStart = raw.indexOf("{");
        if (jsonStart >= 0) {
          try {
            const parsed = JSON.parse(raw.slice(jsonStart));
            code = parsed?.code;
            message = parsed?.message;
          } catch {}
        }
        setStates((prev) => ({ ...prev, [song.id]: "failed" }));
        setFailReasons((prev) => ({ ...prev, [song.id]: { code, message } }));
      }
    }
    setCurrentId(null);
    setChorusSetIds(chorusSet);
    setChorusAiIds(chorusAiSet);
    await onSaved();
    setStep("done");
  };

  const closeable = step !== "running";
  const trackById = useMemo(() => {
    const m = new Map<string, SongLite>();
    for (const s of songs) m.set(s.id, s);
    return m;
  }, [songs]);

  // Counts for the done summary.
  const syncedCount = Object.values(states).filter((v) => v === "synced").length;
  const skippedCount =
    Object.values(states).filter((v) => v === "skipped").length + ineligible;
  const failedCount = Object.values(states).filter((v) => v === "failed").length;

  return (
    <Dialog open={open} onOpenChange={(v) => closeable && onOpenChange(v)}>
      <DialogContent className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4">
        {step === "intro" && (
          <>
            <DialogHeader className="text-left space-y-1">
              <DialogTitle className="text-[17px] font-semibold text-slate-900 inline-flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-slate-700" />
                GoodSync™ your Album?
              </DialogTitle>
              <DialogDescription className="text-[13px] font-normal text-slate-500">
                Sit back — I'll line up the lyrics with the audio on
                every track. We love this one because it saves you a
                ton of time.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-[12.5px] leading-snug text-slate-600">
                <span className="font-medium text-slate-700">
                  {eligible.length}
                </span>{" "}
                {eligible.length === 1 ? "track is" : "tracks are"} ready to
                sync.
                {ineligible > 0 && (
                  <>
                    {" "}
                    <span className="text-slate-500">
                      {ineligible} will be skipped (no master yet, or
                      flagged instrumental).
                    </span>
                  </>
                )}
              </p>
            </div>
            {hasConflict && (
              <div className="space-y-2 pt-1">
                <p className="text-[12.5px] text-slate-700">
                  A few tracks are already in sync. What should I do
                  with the cues you've tuned?
                </p>
                <RadioGroup
                  value={conflictMode}
                  onValueChange={(v) =>
                    setConflictMode(v as "skip" | "resync")
                  }
                  className="space-y-1.5"
                >
                  <label
                    htmlFor="conflict-skip"
                    className="flex items-start gap-2.5 rounded-md border border-slate-200 hover:border-slate-300 px-3 py-2 cursor-pointer transition-colors has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50"
                  >
                    <RadioGroupItem
                      id="conflict-skip"
                      value="skip"
                      data-testid="radio-conflict-skip"
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium text-slate-900">
                        Skip them (keep my work)
                      </div>
                      <div className="text-[11.5px] text-slate-500">
                        Only sync tracks that have no cues yet.
                      </div>
                    </div>
                  </label>
                  <label
                    htmlFor="conflict-resync"
                    className="flex items-start gap-2.5 rounded-md border border-slate-200 hover:border-slate-300 px-3 py-2 cursor-pointer transition-colors has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50"
                  >
                    <RadioGroupItem
                      id="conflict-resync"
                      value="resync"
                      data-testid="radio-conflict-resync"
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium text-slate-900">
                        Re-sync everything
                      </div>
                      <div className="text-[11.5px] text-slate-500">
                        Overwrite existing cues with a fresh pass.
                      </div>
                    </div>
                  </label>
                </RadioGroup>
              </div>
            )}
            <DialogFooter className="flex flex-row justify-end items-center gap-2 pt-2 sm:gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                data-testid="button-goodsync-cancel"
                className="px-3.5 py-1.5 rounded-md text-[13px] font-medium text-slate-600 hover:bg-slate-100"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => setStep("chorus")}
                disabled={eligible.length === 0}
                data-testid="button-goodsync-continue"
                className="px-3.5 py-1.5 rounded-md text-[13px] font-semibold bg-[#319ED8] text-white hover:bg-[#2890c8] disabled:opacity-50"
              >
                Continue
              </button>
            </DialogFooter>
          </>
        )}

        {step === "chorus" && (
          <>
            <DialogHeader className="text-left space-y-1">
              <DialogTitle className="text-[17px] font-semibold text-slate-900">
                One last question
              </DialogTitle>
              <DialogDescription className="text-[13px] font-normal text-slate-500">
                Want me to set each track's 30-second preview to start
                at the chorus? I'll do my best — for tracks where I
                can't find one I'll leave the preview alone so you can
                drag the slider yourself.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-[12.5px] leading-snug text-slate-600">
                Works best when your lyrics have a{" "}
                <code className="px-1 py-0.5 rounded bg-white border border-slate-200 text-[11px] text-slate-700">
                  [Chorus]
                </code>{" "}
                marker. Tracks without one will keep their current
                preview.
              </p>
            </div>
            <DialogFooter className="flex flex-row justify-end items-center gap-2 pt-2 sm:gap-2">
              <button
                type="button"
                onClick={() => runSync(false)}
                data-testid="button-goodsync-just-sync"
                className="px-3.5 py-1.5 rounded-md text-[13px] font-medium text-slate-600 hover:bg-slate-100"
              >
                Just sync the lyrics
              </button>
              <button
                type="button"
                onClick={() => runSync(true)}
                data-testid="button-goodsync-find-chorus"
                className="px-3.5 py-1.5 rounded-md text-[13px] font-semibold bg-[#319ED8] text-white hover:bg-[#2890c8] inline-flex items-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Yes, find the chorus
              </button>
            </DialogFooter>
          </>
        )}

        {step === "running" && (
          <>
            <DialogHeader className="text-left space-y-1">
              <DialogTitle className="text-[17px] font-semibold text-slate-900">
                Syncing your album…
              </DialogTitle>
              <DialogDescription className="text-[13px] font-normal text-slate-500">
                Hang tight — this can take a minute per track. You
                can keep this open and watch.
              </DialogDescription>
            </DialogHeader>
            <ul className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {eligible.map((s) => {
                const state = states[s.id] ?? "pending";
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]"
                    data-testid={`goodsync-row-${s.id}`}
                  >
                    <span className="truncate text-slate-700">
                      <span className="text-slate-400 mr-2">
                        {s.trackNumber}
                      </span>
                      {s.title}
                    </span>
                    <TrackRunBadge state={state} reason={failReasons[s.id]} />
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {step === "done" && (
          <>
            <DialogHeader className="text-left space-y-1">
              <DialogTitle className="text-[17px] font-semibold text-slate-900 inline-flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                All done
              </DialogTitle>
              <DialogDescription className="text-[13px] font-normal text-slate-500">
                Here's how the album turned out. You can fine-tune any
                track from its row.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-2">
              <SummaryStat label="Synced" value={syncedCount} tone="ok" />
              <SummaryStat label="Skipped" value={skippedCount} tone="muted" />
              <SummaryStat label="Failed" value={failedCount} tone={failedCount > 0 ? "warn" : "muted"} />
            </div>
            {findChorus && (
              <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <Sparkles className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <p className="text-[12.5px] leading-snug text-slate-600">
                  {chorusSetIds.size > 0 ? (
                    <>
                      Chorus preview set on{" "}
                      <span className="font-medium text-slate-700">
                        {chorusSetIds.size}
                      </span>{" "}
                      {chorusSetIds.size === 1 ? "track" : "tracks"}
                      {chorusAiIds.size > 0 && (
                        <span className="text-slate-400">
                          {" "}
                          ({chorusAiIds.size} found by AI)
                        </span>
                      )}
                      .
                      {failedCount === 0 &&
                        syncedCount > 0 &&
                        chorusSetIds.size < syncedCount && (
                          <>
                            {" "}
                            The rest kept their existing preview — no chorus
                            could be confidently located.
                          </>
                        )}
                    </>
                  ) : (
                    <span className="text-slate-500">
                      No chorus could be confidently found — previews left
                      as-is.
                    </span>
                  )}
                </p>
              </div>
            )}
            <DialogFooter className="flex flex-row justify-end items-center gap-2 pt-2 sm:gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                data-testid="button-goodsync-done"
                className="px-3.5 py-1.5 rounded-md text-[13px] font-semibold bg-[#319ED8] text-white hover:bg-[#2890c8]"
              >
                Done
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TrackRunBadge({
  state,
  reason,
}: {
  state: TrackRunState;
  reason?: { code?: string; message?: string };
}) {
  if (state === "syncing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-slate-700">
        <Spinner className="w-3 h-3 animate-spin" />
        Syncing…
      </span>
    );
  }
  if (state === "synced") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-emerald-700">
        <CheckCircle2 className="w-3 h-3" />
        Synced
      </span>
    );
  }
  if (state === "skipped") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-slate-400">
        <Ban className="w-3 h-3" />
        Skipped
      </span>
    );
  }
  if (state === "failed") {
    const isAuth = reason?.code === "invalid_api_key";
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-rose-600"
        title={reason?.message ?? undefined}
      >
        <AlertCircle className="w-3 h-3" />
        {isAuth ? "Sign-in invalid" : "Failed"}
      </span>
    );
  }
  return (
    <span className="text-[11.5px] text-slate-400">Queued</span>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "muted" | "warn";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-rose-600"
        : "text-slate-700";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
      <div className={`text-[20px] font-semibold ${toneClass}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400 mt-0.5">
        {label}
      </div>
    </div>
  );
}

function WaveArrowGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="18" y="40" width="10" height="20" rx="2" fill="white" />
      <rect x="36" y="22" width="10" height="56" rx="2" fill="white" />
      <rect x="54" y="32" width="10" height="36" rx="2" fill="white" />
      <rect x="72" y="42" width="10" height="16" rx="2" fill="white" />
    </svg>
  );
}

/* Timeline-clip glyph for the gold "custom preview window" state.
   A wide rounded rectangle (the chosen slice) sitting on a thin
   baseline (the master's full timeline). Reads as "a window picked
   out of a longer thing" at 10–14px. */
function ClipGlyph({ className = "" }: { className?: string }) {
  // Just the slider thumb — a single chunky rounded rectangle.
  // Bill: "The Custom Preview should be a rounded rectangle like the
  // slider." Dropped the thin track behind it; at 10px the extra line
  // only added noise.
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="22" y="34" width="56" height="32" rx="10" fill="white" />
    </svg>
  );
}

type DotState =
  | "empty"
  | "done"
  | "synced"
  | "custom"
  | "partial"
  | "instrumental";

function dotHint(label: string, state: DotState): string {
  if (state === "synced") return `${label} · GoodSync™ ready`;
  if (state === "custom") return `${label} — custom 30-sec clip picked`;
  if (state === "done") return `${label} complete`;
  if (state === "partial") return `${label} partial — keep going`;
  if (state === "instrumental") return "Lyrics — instrumental (none by design)";
  return `${label} not started`;
}

/* ── StatusChip — P / L / C hover-only status pill ───────────────────
   Graduated from artifacts/mockup-sandbox/src/components/mockups/admin-track-status/Chips.tsx
   per Bill's pick. Replaces the always-on coloured dot meter (renderDot)
   in the tracklist row. Three states map cleanly from our existing
   DotState:
     · "auto"      — filled blue (done / synced / custom)
     · "manual"    — white with slate ring (partial — half-done)
     · "untouched" — slate-100, dim glyph (empty / instrumental)
   The row stays silent at rest; chips reveal on hover. Each chip is
   still a real button — click expands the row AND jumps to the editor,
   identical to the old dot meter. */
type ChipState = "untouched" | "manual" | "auto";
function dotToChip(state: DotState): ChipState {
  // "auto" = system-set / system-derived (default first-30s preview,
  //          GoodSync-ready lyrics, fully populated credits).
  // "manual" = user-set (custom 30-sec clip picked) or half-done
  //            (partial credits — keep going).
  // "untouched" = nothing there yet (empty), or "by design empty"
  //               (instrumental lyrics).
  if (state === "custom" || state === "partial") return "manual";
  if (state === "done" || state === "synced") return "auto";
  return "untouched";
}
function StatusChip({
  letter,
  state,
}: {
  letter: "P" | "L" | "C";
  state: ChipState;
}) {
  const tone =
    state === "auto"
      ? "bg-[var(--brand-blue)] text-white"
      : state === "manual"
        ? "bg-white text-slate-900 ring-1 ring-inset ring-slate-300"
        : "bg-slate-100 text-slate-300";
  return (
    <span
      className={[
        "inline-flex w-[20px] h-[20px] items-center justify-center rounded-[5px]",
        "font-mono text-[11px] font-bold leading-none",
        tone,
      ].join(" ")}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

/* ── ExpandedPanel ────────────────────────────────────────────────────
   The active state of a tile. When the user taps Preview / Lyrics /
   Credits / Master, the tile transforms into this panel: same icon +
   label header at top (acts as collapse trigger via chevron-up), and
   the editor body lives directly below — no separate boxed editor,
   no X close. One continuous rounded card with a brand-blue border
   so it reads as "this tile is now open."

   The header exposes a slot to the immediate **left** of the chevron
   via `ExpandedPanelHeaderSlotContext`. Editors rendered as children
   (e.g. PreviewTrim) can `createPortal` a small inline action into it
   — typically a quiet "Reset" / "Revert" link — so the action lives
   at a stable position next to the collapse caret and never moves
   when transient banners (Unsaved pill, etc.) mount or unmount below.
   The header is a div (not a button) so portal'd children stay valid
   HTML; an absolutely-positioned invisible button overlays the
   non-action area and carries the actual collapse click. */
export const ExpandedPanelHeaderSlotContext = createContext<HTMLSpanElement | null>(
  null,
);

function ExpandedPanel({
  icon: Icon,
  label,
  sublabel,
  onCollapse,
  testId,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  // Same widening as StatusBadge.subtitle — lets the Master panel
  // header stack the brand-blue summary string above the Task #317
  // MasterSpecLine.
  sublabel?: React.ReactNode;
  onCollapse: () => void;
  testId?: string;
  children: React.ReactNode;
}) {
  const [headerSlot, setHeaderSlot] = useState<HTMLSpanElement | null>(null);
  return (
    <div
      data-testid={testId}
      className="rounded-xl border border-[var(--brand-blue)]/50 bg-white shadow-sm overflow-hidden"
    >
      <div className="relative flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50">
        {/* Invisible click target covering the whole header. Sits
            behind the foreground elements so chevron + icon + labels
            all collapse on click, while the headerSlot in the
            foreground (z-10) can host its own clickable action. */}
        <button
          type="button"
          onClick={onCollapse}
          aria-label={`Collapse ${label}`}
          className="absolute inset-0 z-0 focus:outline-none focus:bg-slate-50/0"
          data-testid={testId ? `${testId}-collapse` : undefined}
        />
        <span className="relative z-0 w-8 h-8 rounded-md bg-[var(--brand-blue)]/10 inline-flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-[var(--brand-blue)]" />
        </span>
        <span className="relative z-0 flex-1 min-w-0 pointer-events-none">
          <span className="block text-[12.5px] font-semibold text-slate-900 leading-tight">
            {label}
          </span>
          {sublabel && (
            <span className="block text-[11px] text-slate-500 leading-tight min-w-0">
              {sublabel}
            </span>
          )}
        </span>
        {/* Header action slot — descendant editors portal small inline
            actions (e.g. Reset) here so they sit fixed next to the
            chevron regardless of editor body state. */}
        <span
          ref={setHeaderSlot}
          onClick={(e) => e.stopPropagation()}
          className="relative z-10 flex items-center gap-1 flex-shrink-0"
        />
        <ChevronUp className="relative z-0 w-4 h-4 text-slate-400 flex-shrink-0 pointer-events-none" />
      </div>
      <div className="border-t border-slate-100">
        <ExpandedPanelHeaderSlotContext.Provider value={headerSlot}>
          {children}
        </ExpandedPanelHeaderSlotContext.Provider>
      </div>
    </div>
  );
}

/* ── Status tile (expanded row, REQUIRED + 3-up OPTIONAL) ─────────────
   Graduated 1:1 from the Seamless mockup. Same two shapes:
     • emphasized = full-width REQUIRED tile (Master)
     • compact     = 3-up grid OPTIONAL tile (Preview / Lyrics / Credits)
   ok=true ⇒ emerald check badge on the icon; ok=false ⇒ amber for
   "required" severity and slate for "soft" severity. Hover reveals a
   pencil glyph so the affordance reads as "tap to edit." */
function StatusBadge({
  ok,
  icon: Icon,
  label,
  subtitle,
  severity = "soft",
  size = "default",
  compact = false,
  active = false,
  onClick,
  testId,
  buttonRef,
}: {
  ok: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  // ReactNode so callers can stack the brand-blue "Required to publish" /
  // "Uploaded · tap to replace" string with the Task #317 MasterSpecLine
  // beneath it without rebuilding the tile's typography.
  subtitle?: React.ReactNode;
  severity?: "required" | "soft";
  size?: "default" | "emphasized";
  compact?: boolean;
  /** True when this tile's editor is currently open. Adds a brand-blue
   *  ring + tinted surface so the active tile reads as "you are here,"
   *  matching Apple's segmented / selected-cell pattern. */
  active?: boolean;
  onClick?: () => void;
  testId?: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  // Single icon color per concept — same in collapsed AND expanded
  // states so tapping a tile doesn't make the glyph appear to swap
  // identities. Brand blue everywhere (Master / Preview / Lyrics /
  // Credits all read as "GoodTunes editor"); the only deviation is
  // amber for a still-required Master, which is a real warning.
  const notOkIcon =
    severity === "required"
      ? "bg-amber-50 text-amber-600"
      : "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]";
  const emphasized = size === "emphasized";
  // Active = "you've opened this tile's editor." Apple's pattern for
  // a selected cell: tinted background + brand-color ring, not just a
  // heavier border. Ring sits OUTSIDE the existing border so the
  // tile doesn't shift by 1px when it becomes active.
  const activeCls = active
    ? "border-[var(--brand-blue)] bg-[var(--brand-blue)]/5 ring-2 ring-[var(--brand-blue)]/30 hover:bg-[var(--brand-blue)]/5 hover:border-[var(--brand-blue)]"
    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50";
  if (compact) {
    // Compact tile = miniature of the ExpandedPanel header: icon on
    // the left, label + sublabel stacked to its right. Same shape,
    // smaller. Apple-style breathing room (px-3 py-3, gap-2.5) so the
    // three tiles don't read as a cramped strip.
    return (
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        data-testid={testId}
        aria-pressed={active}
        className={[
          "group/card flex items-center gap-2.5 px-3 py-3 rounded-lg bg-white border text-left w-full transition-all relative focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/40",
          activeCls,
        ].join(" ")}
      >
        <span
          className={[
            "w-8 h-8 rounded-md inline-flex items-center justify-center flex-shrink-0",
            notOkIcon,
          ].join(" ")}
        >
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-slate-900 truncate">
            {label}
          </div>
          {subtitle && (
            <div className="text-[10.5px] text-slate-500 leading-tight mt-0.5 min-w-0">
              {subtitle}
            </div>
          )}
        </div>
        <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
      </button>
    );
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={active}
      className={[
        "group/card flex items-center justify-between gap-2 rounded-lg bg-white border text-left w-full transition-all focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/40",
        emphasized ? "px-4 py-3" : "px-3 py-2",
        activeCls,
      ].join(" ")}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={[
            "rounded-md inline-flex items-center justify-center flex-shrink-0",
            emphasized ? "w-10 h-10" : "w-7 h-7",
            notOkIcon,
          ].join(" ")}
        >
          <Icon className={emphasized ? "w-5 h-5" : "w-3.5 h-3.5"} />
        </span>
        <div className="min-w-0">
          <div
            className={[
              "font-semibold text-slate-900 truncate",
              emphasized ? "text-[14px]" : "text-[12px]",
            ].join(" ")}
          >
            {label}
          </div>
          {subtitle && (
            <div
              className={[
                "text-slate-500 leading-tight min-w-0",
                emphasized ? "text-[11.5px] mt-0.5" : "text-[10px]",
              ].join(" ")}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <ChevronDown
        className={[
          "text-slate-400 flex-shrink-0",
          emphasized ? "w-4 h-4" : "w-3.5 h-3.5",
        ].join(" ")}
      />
    </button>
  );
}

/* Task #1370 — per-section status pill (Performance · Writers ·
   Mechanical) shown on each tap-target track row and on the track
   detail page. Diagnostic only — every section is optional. */
type TrackPillStatus = "ok" | "partial" | "empty" | "warn";

function trackPillClasses(status: TrackPillStatus): string {
  return status === "ok"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : status === "partial"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : status === "warn"
        ? "bg-rose-50 text-rose-700 border-rose-200"
        : "bg-white text-slate-300 border-slate-200";
}

function TrackStatusPill({
  letter,
  status,
}: {
  letter: "C" | "L" | "S" | "P";
  status: TrackPillStatus;
}) {
  const long =
    letter === "C"
      ? "Credits"
      : letter === "L"
        ? "Lyrics"
        : letter === "S"
          ? "Splits"
          : "Preview";
  return (
    <span
      className={`w-5 h-5 rounded-md border text-xs font-bold inline-flex items-center justify-center ${trackPillClasses(status)}`}
      title={`${long} · ${status}`}
      data-testid={`pill-${letter.toLowerCase()}-status-${status}`}
    >
      {letter}
    </span>
  );
}

/* Derive the four per-track section statuses (Credits · Lyrics · Splits ·
   Preview) from the loaded song + credit + splits data. Each status reuses
   the same logic the expanded section tiles render, so the collapsed-row
   chips, the row summary, and the expanded tiles never disagree.

   - Credits  = creative credits (writers + performers): filled when both
                sides are present, partial when only one, empty when neither.
   - Lyrics   = plain or GoodSync™ synced lyrics present.
   - Splits   = the publishing split ledger (publishing + mechanical basis
                points). This is the single consolidation of the old
                Performance / Writers / Mechanical pills — the detailed
                P/W/M breakdown still lives inside the expanded Splits
                editor. Filled when both ledgers total 100%, partial when
                anything is entered, empty when nothing is.
   - Preview  = an explicit preview start was set (auto first-30s otherwise). */
function trackSectionStatuses(
  song: SongLite,
  credits: SongCreditsLite | null,
  splitTotals: { publishingBp: number; mechanicalBp: number } | null,
): {
  credits: TrackPillStatus;
  lyrics: TrackPillStatus;
  splits: TrackPillStatus;
  preview: TrackPillStatus;
} {
  const performerCount = credits?.performers.length ?? 0;
  const writerCount = credits?.writers.length ?? 0;
  const creditsStatus: TrackPillStatus =
    performerCount > 0 && writerCount > 0
      ? "ok"
      : performerCount > 0 || writerCount > 0
        ? "partial"
        : "empty";
  const lyricsStatus: TrackPillStatus =
    song.lyrics || song.syncedLyrics ? "ok" : "empty";
  const pubBp = splitTotals?.publishingBp ?? 0;
  const mechBp = splitTotals?.mechanicalBp ?? 0;
  const splitsStatus: TrackPillStatus =
    pubBp === 10000 && mechBp === 10000
      ? "ok"
      : pubBp > 0 || mechBp > 0
        ? "partial"
        : "empty";
  const previewStatus: TrackPillStatus =
    song.previewStartMs != null ? "ok" : "empty";
  return {
    credits: creditsStatus,
    lyrics: lyricsStatus,
    splits: splitsStatus,
    preview: previewStatus,
  };
}

function TrackRow({
  song,
  albumId,
  withBorder,
  credits,
  splitTotals,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isCurrent,
  isPlaying,
  onPlay,
  selectionMode,
  selected,
  onToggleSelect,
  userExpanded,
  onSetUserExpanded,
  highlightOnMount,
  muxRetry,
  muxServerNow,
}: {
  song: SongLite;
  albumId: string;
  withBorder: boolean;
  credits: SongCreditsLite | null;
  splitTotals: { publishingBp: number; mechanicalBp: number } | null;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: (songId: string) => void;
  // Bulk-delete multi-select. When `selectionMode` is true the row
  // surfaces a checkbox in the drag-handle slot. Play still works —
  // selection is purely additive chrome.
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (songId: string) => void;
  // Exclusive-disclosure: open/closed state is owned by TracksPanel via
  // `useExclusiveDisclosure`, so opening this row collapses whichever
  // sibling was previously open. See docs/design-system.md ("Expandable
  // row lists").
  userExpanded: boolean;
  onSetUserExpanded: (open: boolean) => void;
  // True only for the row matched by the page's `?track=<id>` deep link on
  // initial mount (smart-back from a credit-tapped Person page, or the
  // track page's "Back to tracklist"). Scrolls the row into view AND pulses
  // a brief highlight so the user lands looking at the right row.
  highlightOnMount: boolean;
  // Task #369 — auto-retry state from /api/admin/mux-status for this song
  // (only present when the backfill sweep has touched it). The server clock
  // comes alongside so the countdown renders against the same `now` the
  // backoff was scheduled from, not the browser's.
  muxRetry: {
    attempts: number;
    maxAttempts: number;
    lastAttemptAt: number;
    nextRetryAt: number | null;
    exhausted: boolean;
  } | null;
  muxServerNow: number | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  // Inline accordion state. `mode` drives which sub-editor is open;
  // `userExpanded`/`onSetUserExpanded` is the exclusive-disclosure pair
  // owned by TracksPanel so only one row is open at a time. Any open
  // editor force-expands the row so the tile context stays visible.
  const [mode, setMode] = useState<TrackMode>("view");
  const setUserExpanded = onSetUserExpanded;
  // Expansion is owned SOLELY by the exclusive-disclosure controller so
  // opening a sibling row always collapses this one — even when this row
  // had a sub-editor open. The `mode` reset below keeps a stale editor
  // from re-expanding the row on the next render.
  const expanded = userExpanded;

  // When the controller collapses this row (sibling opened, chevron, or
  // header tap), drop any open sub-editor back to the tile view so the
  // row never lingers expanded via a non-"view" `mode`.
  useEffect(() => {
    if (!userExpanded && mode !== "view") setMode("view");
  }, [userExpanded, mode]);

  const inputRef = useRef<HTMLInputElement>(null);
  const masterChipRef = useRef<HTMLButtonElement>(null);
  const previewChipRef = useRef<HTMLButtonElement>(null);
  const lyricsChipRef = useRef<HTMLButtonElement>(null);
  const creditsChipRef = useRef<HTMLButtonElement>(null);
  const splitsChipRef = useRef<HTMLButtonElement>(null);

  // Open the row straight to a given section (used by the collapsed-row
  // P/W/M chips + the Upload-master CTA).
  const openSection = (m: TrackMode) => {
    setUserExpanded(true);
    setMode(m);
  };

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["/api/albums", albumId] });
    await qc.invalidateQueries({ queryKey: ["/api/albums"] });
  };

  // Title rename — fires from the inline title input's onBlur / Enter.
  // The title IS the editor when the row is expanded (Apple-Music-row
  // pattern): saves on blur/Enter, reverts on Escape.
  const renameMut = useMutation({
    mutationFn: async (title: string) =>
      apiRequest("PUT", `/api/admin/songs/${song.id}`, { title }),
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Track renamed" });
    },
    onError: (e: any) => {
      if (inputRef.current) inputRef.current.value = song.title;
      toast({
        title: "Couldn't rename the track",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/admin/songs/${song.id}`),
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Track deleted" });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't delete the track",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  // Task #369 — "Retry now" for an errored Mux ingest. Resets the
  // server-side backoff and re-ingests, then refreshes the album +
  // catalog-wide mux-status so the badge re-renders.
  const retryMuxMut = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/admin/songs/${song.id}/mux-ingest`),
    onSuccess: async () => {
      await invalidate();
      await qc.invalidateQueries({ queryKey: ["/api/admin/mux-status"] });
      toast({
        title: "Re-ingesting on Mux",
        description: "We'll update the badge as Mux processes it.",
      });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't retry Mux ingest",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  // Each sub-editor's close returns focus to the tile that opened it.
  const closeAudio = () => {
    setMode("view");
    queueMicrotask(() => masterChipRef.current?.focus());
  };
  const closePreview = () => {
    setMode("view");
    queueMicrotask(() => previewChipRef.current?.focus());
  };
  const closeLyrics = () => {
    setMode("view");
    queueMicrotask(() => lyricsChipRef.current?.focus());
  };
  // GoodSync™ is opened from the Lyrics tile, so collapsing it returns
  // focus there too.
  const closeSynced = () => {
    setMode("view");
    queueMicrotask(() => lyricsChipRef.current?.focus());
  };
  const closeCredits = () => {
    setMode("view");
    queueMicrotask(() => creditsChipRef.current?.focus());
  };
  const closeSplits = () => {
    setMode("view");
    queueMicrotask(() => splitsChipRef.current?.focus());
  };

  // Deep-link highlight: when the page was opened with `?track=<id>` and
  // this is the matched row, glide it into view + pulse a soft brand wash
  // for a couple seconds so the user lands looking at it.
  const rowRef = useRef<HTMLLIElement>(null);
  const [landed, setLanded] = useState(highlightOnMount);
  useEffect(() => {
    if (!highlightOnMount) return;
    const el = rowRef.current;
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    const fade = setTimeout(() => setLanded(false), 2400);
    return () => {
      clearTimeout(t);
      clearTimeout(fade);
    };
    // Mount-only by design — see prop comment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statuses = trackSectionStatuses(song, credits, splitTotals);
  const sectionStatuses = [
    statuses.credits,
    statuses.lyrics,
    statuses.splits,
    statuses.preview,
  ];
  // "Ready" only when every section is fully filled (ok); "Empty" only when
  // every section is empty. Anything in between is "N to fill", where N
  // counts both empty AND partial sections (a partial section still needs
  // filling to reach Ready).
  const okCount = sectionStatuses.filter((s) => s === "ok").length;
  const emptyCount = sectionStatuses.filter((s) => s === "empty").length;
  const toFill = sectionStatuses.length - okCount;
  const anyPartial = sectionStatuses.includes("partial");
  const allOk = okCount === sectionStatuses.length;
  const allEmpty = emptyCount === sectionStatuses.length;
  const summaryText = allOk ? "Ready" : allEmpty ? "Empty" : `${toFill} to fill`;
  const summaryCls = allOk
    ? "text-emerald-700"
    : anyPartial
      ? "text-amber-700"
      : "text-slate-400";

  const liCls = [
    "group relative flex flex-col transition-colors",
    withBorder && "border-b border-slate-100",
    expanded || landed ? "bg-[var(--brand-blue)]/5" : "",
    isDragging ? "opacity-40" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const muxEncoding =
    song.muxStatus === "ingesting" || song.muxStatus === "preparing";

  return (
    <li
      ref={rowRef}
      className={liCls}
      data-testid={`row-track-${song.id}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {isDropTarget && (
        <span
          aria-hidden="true"
          className="absolute left-0 right-0 -top-px h-0.5 bg-[var(--brand-blue)] z-10"
          data-testid={`indicator-drop-${song.id}`}
        />
      )}
      {/* Collapsed: whole row is the tap-target that expands the row inline.
          Nested controls (drag, play, mux retry, download, checkbox, the
          P/W/M chips) stopPropagation so they act on their own. When the
          row is expanded the header stops being a button — collapse is via
          the chevron, and the title becomes an editable input. */}
      <div
        role={!expanded ? "button" : undefined}
        tabIndex={!expanded ? 0 : undefined}
        onClick={!expanded ? () => setUserExpanded(true) : undefined}
        onKeyDown={
          !expanded
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setUserExpanded(true);
                }
              }
            : undefined
        }
        className={[
          "flex items-center gap-4 px-5 py-3",
          !expanded
            ? "cursor-pointer hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40 focus-visible:ring-inset"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-testid={`button-open-track-${song.id}`}
      >
        {/* Drag handle / multi-select checkbox */}
        {selectionMode ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(song.id);
            }}
            aria-label={selected ? "Deselect track" : "Select track"}
            aria-pressed={selected}
            className={[
              "w-4 h-4 -ml-1 inline-flex items-center justify-center rounded-[4px] border transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40",
              selected
                ? "bg-rose-600 border-rose-600 text-white hover:bg-rose-700"
                : "bg-white border-slate-300 hover:border-slate-500",
            ].join(" ")}
            data-testid={`checkbox-track-${song.id}`}
          >
            {selected && <Check className="w-3 h-3" strokeWidth={3} />}
          </button>
        ) : (
          <button
            type="button"
            draggable
            onDragStart={onDragStart}
            onClick={(e) => e.stopPropagation()}
            aria-label="Drag to reorder"
            title="Drag to reorder"
            className="w-3.5 h-5 -ml-1 inline-flex items-center justify-center text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40 rounded transition-opacity opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60"
            data-testid={`grip-track-${song.id}`}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Track-number cell doubles as play/pause (Apple-Music pattern). */}
        <div className="w-5 h-5 -ml-1.5 flex-shrink-0 relative">
          <span
            className={[
              "absolute inset-0 inline-flex items-center justify-center text-[12px] tabular-nums font-medium transition-opacity",
              isCurrent ? "text-[var(--brand-blue)]" : "text-slate-400",
              song.audioUrl
                ? isCurrent
                  ? "opacity-0"
                  : "group-hover:opacity-0"
                : "",
            ].join(" ")}
            aria-hidden={isCurrent ? true : undefined}
          >
            {song.trackNumber}
          </span>
          {song.audioUrl && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(song.id);
              }}
              aria-label={
                muxEncoding
                  ? "Stream preparing"
                  : isCurrent && isPlaying
                    ? "Pause track"
                    : "Play track"
              }
              title={
                muxEncoding
                  ? "Preparing stream…"
                  : isCurrent && isPlaying
                    ? "Pause"
                    : "Play"
              }
              data-testid={`button-play-track-${song.id}`}
              className={[
                "absolute inset-0 inline-flex items-center justify-center rounded-full transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40",
                muxEncoding
                  ? "opacity-100 text-slate-400 cursor-wait"
                  : isCurrent
                    ? "opacity-100 text-[var(--brand-blue)]"
                    : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-slate-700 hover:text-[var(--brand-blue)]",
              ].join(" ")}
            >
              {muxEncoding ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isCurrent && isPlaying ? (
                <Pause className="w-3 h-3 fill-current" />
              ) : (
                <Play className="w-3 h-3 fill-current ml-0.5" />
              )}
            </button>
          )}
        </div>

        {/* Title + explicit badge. Expanded → the title becomes an inline
            input (saves on blur/Enter, reverts on Escape). */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {expanded ? (
              <input
                ref={inputRef}
                type="text"
                defaultValue={song.title}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== song.title) renameMut.mutate(next);
                  else e.target.value = song.title;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).value = song.title;
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="flex-1 min-w-0 text-sm font-semibold bg-white border border-slate-300 rounded-md px-2 py-1 text-slate-900 focus:outline-none focus:border-[var(--brand-blue)] focus:ring-1 focus:ring-[var(--brand-blue)]/40"
                data-testid={`input-track-title-${song.id}`}
              />
            ) : (
              <div
                className={[
                  "text-[13.5px] font-semibold truncate",
                  isCurrent ? "text-[var(--brand-blue)]" : "text-slate-900",
                ].join(" ")}
                data-testid={`text-track-title-${song.id}`}
              >
                {song.title}
              </div>
            )}
            {song.isExplicit && <ExplicitBadge tone="slate" />}
          </div>
        </div>

        {/* Upload-master CTA — only when no master exists yet. Jumps
            straight to the Files tab of the track page. */}
        {!expanded && !song.audioUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openSection("audio");
            }}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400/40 flex-shrink-0"
            data-testid={`button-edit-master-${song.id}`}
          >
            <Upload className="w-3 h-3" />
            Upload master
          </button>
        )}

        {/* Hover-only operational cluster — Mux state pill + retry +
            per-row master download. Hidden at rest so the row reads
            cleanly; revealed on hover / focus-within (and always-faded
            on touch). Hidden once the row is expanded — the master tile
            below owns Mux state + download there. */}
        {!expanded && !!song.audioUrl && (
          <div
            className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-60 transition-opacity"
            data-testid={`cluster-mux-download-${song.id}`}
          >
            {(() => {
              const ready = song.muxStatus === "ready" && !!song.muxPlaybackId;
              const errored = song.muxStatus === "errored";
              const preparing =
                !ready &&
                !errored &&
                (!!song.muxAssetId ||
                  song.muxStatus === "preparing" ||
                  song.muxStatus === "ingesting");
              const label = ready
                ? "Mux"
                : errored
                  ? "Mux err"
                  : preparing
                    ? "Mux…"
                    : "No Mux";
              const cls = ready
                ? "bg-emerald-50 text-emerald-700"
                : errored
                  ? "bg-rose-50 text-rose-700"
                  : preparing
                    ? "bg-sky-50 text-sky-700"
                    : "bg-amber-50 text-amber-700";
              const title = ready
                ? "Streaming via Mux"
                : errored
                  ? `Mux ingest errored${(song as any).muxLastError ? ` — ${(song as any).muxLastError}` : ""}`
                  : preparing
                    ? "Mux is encoding this master"
                    : "Master not yet ingested to Mux";
              const showRetryNow = errored && !retryMuxMut.isPending;
              const retryLabel = (() => {
                if (!errored || !muxRetry) return null;
                if (muxRetry.exhausted)
                  return "retry cap reached — re-upload needed";
                if (muxRetry.nextRetryAt == null) return null;
                const nowMs = muxServerNow ?? Date.now();
                const remainingMs = Math.max(0, muxRetry.nextRetryAt - nowMs);
                if (remainingMs <= 0) return "next auto-retry pending";
                const mins = Math.round(remainingMs / 60_000);
                if (mins >= 60) {
                  const hrs = Math.round(mins / 60);
                  return `next auto-retry in ${hrs}h (attempt ${muxRetry.attempts + 1}/${muxRetry.maxAttempts})`;
                }
                return `next auto-retry in ${Math.max(1, mins)}m (attempt ${muxRetry.attempts + 1}/${muxRetry.maxAttempts})`;
              })();
              return (
                <span className="inline-flex items-center gap-1.5 flex-shrink-0">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${cls}`}
                    title={title}
                    data-testid={`badge-mux-${song.id}`}
                    data-mux-state={
                      ready
                        ? "ready"
                        : errored
                          ? "errored"
                          : preparing
                            ? "preparing"
                            : "not-ingested"
                    }
                  >
                    {label}
                  </span>
                  {retryLabel && (
                    <span
                      className={`hidden sm:inline text-xs ${muxRetry?.exhausted ? "text-rose-700 font-medium" : "text-slate-500"}`}
                      data-testid={`text-mux-retry-${song.id}`}
                      data-mux-retry-state={
                        muxRetry?.exhausted ? "exhausted" : "scheduled"
                      }
                    >
                      {retryLabel}
                    </span>
                  )}
                  {showRetryNow && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        retryMuxMut.mutate();
                      }}
                      disabled={retryMuxMut.isPending}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-rose-700 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-400/40 disabled:opacity-60"
                      title="Reset backoff and re-ingest this master on Mux now"
                      data-testid={`button-mux-retry-${song.id}`}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Retry now
                    </button>
                  )}
                </span>
              );
            })()}
            {(() => {
              const downloadHref = song.audioSourceUrl ?? song.audioUrl!;
              const downloadExt =
                downloadHref.match(/\.(\w+)(?:\?|$)/)?.[0] ?? ".mp3";
              const isOriginal = !!song.audioSourceUrl;
              return (
                <a
                  href={downloadHref}
                  download={`${String(song.trackNumber).padStart(2, "0")} ${song.title}${downloadExt}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 flex-shrink-0"
                  aria-label={`Download master for ${song.title}`}
                  title={
                    isOriginal
                      ? `Download original master (${downloadExt.slice(1).toUpperCase()})`
                      : "Download master"
                  }
                  data-testid={`button-download-master-${song.id}`}
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              );
            })()}
          </div>
        )}

        {/* Duration */}
        {!expanded && (
          <span
            className="text-slate-400 text-xs tabular-nums flex-shrink-0 w-12 text-right hidden sm:inline"
            data-testid={`text-track-duration-${song.id}`}
          >
            {formatDuration(song.duration)}
          </span>
        )}

        {/* C/L/S/P status chips. Each chip opens the row straight to its
            section: C → Credits, L → Lyrics, S → Splits (the publishing
            P/W/M detail), P → Preview. */}
        {!expanded && (
          <div
            className="flex items-center gap-1 flex-shrink-0"
            role="group"
            aria-label="Section status (Credits · Lyrics · Splits · Preview)"
            data-testid={`pills-status-${song.id}`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openSection("credits");
              }}
              className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40"
              aria-label={`Edit credits — ${statuses.credits}`}
              data-testid={`button-section-credits-${song.id}`}
            >
              <TrackStatusPill letter="C" status={statuses.credits} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openSection("lyrics");
              }}
              className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40"
              aria-label={`Edit lyrics — ${statuses.lyrics}`}
              data-testid={`button-section-lyrics-${song.id}`}
            >
              <TrackStatusPill letter="L" status={statuses.lyrics} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openSection("splits");
              }}
              className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40"
              aria-label={`Edit splits — ${statuses.splits}`}
              data-testid={`button-section-splits-${song.id}`}
            >
              <TrackStatusPill letter="S" status={statuses.splits} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openSection("preview");
              }}
              className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40"
              aria-label={`Edit preview — ${statuses.preview}`}
              data-testid={`button-section-preview-${song.id}`}
            >
              <TrackStatusPill letter="P" status={statuses.preview} />
            </button>
          </div>
        )}

        {/* Right-side summary */}
        {!expanded && (
          <span
            className={`text-xs font-medium tabular-nums w-[68px] text-right flex-shrink-0 hidden sm:inline ${summaryCls}`}
            data-testid={`text-track-summary-${song.id}`}
          >
            {summaryText}
          </span>
        )}

        {/* Destructive cluster — only while expanded. Delete confirms
            first (per the destructive-actions rule) before removing the
            track + its credits, splits, lyrics and master reference. */}
        {expanded && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (
                  window.confirm(
                    `Delete "${song.title}"? This removes the track, its credits, splits, lyrics and any uploaded master. This can't be undone.`,
                  )
                ) {
                  deleteMut.mutate();
                }
              }}
              disabled={deleteMut.isPending}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40 disabled:opacity-60"
              aria-label="Delete track"
              title="Delete track"
              data-testid={`button-delete-track-${song.id}`}
            >
              {deleteMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}

        {/* Chevron — toggles the inline disclosure. Down when collapsed,
            up when expanded; collapsing also resets the open sub-editor. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (expanded) {
              setMode("view");
              setUserExpanded(false);
            } else {
              setUserExpanded(true);
            }
          }}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-300 hover:text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/40 flex-shrink-0"
          aria-label={expanded ? "Collapse track" : "Expand track"}
          aria-expanded={expanded}
          title={expanded ? "Collapse" : "Expand"}
          data-testid={`button-toggle-track-${song.id}`}
        >
          <ChevronDown
            className={[
              "w-4 h-4 transition-transform",
              expanded ? "rotate-180" : "",
            ].join(" ")}
          />
        </button>
      </div>

      {/* ── Expanded body — REQUIRED Master tile + 2×2 OPTIONAL grid.
          Tapping a tile opens its editor in place; the active tile gets a
          brand-blue ring. All editors are the existing shared components —
          no rebuilds. ── */}
      {expanded && (
        <div className="px-5 pb-4 pt-1 space-y-3" data-testid={`panel-track-${song.id}`}>
          {/* REQUIRED — Master */}
          {mode === "audio" ? (
            <ExpandedPanel
              icon={Disc3}
              label="Master audio"
              onCollapse={closeAudio}
              testId={`editor-audio-${song.id}`}
            >
              <AudioEditor
                key={song.id}
                song={song}
                albumId={albumId}
                onClose={closeAudio}
                onSaved={invalidate}
              />
            </ExpandedPanel>
          ) : (
            <StatusBadge
              ok={!!song.audioUrl}
              icon={Disc3}
              label="Master audio"
              subtitle={
                <>
                  <span className="text-[var(--brand-blue)]">
                    {song.audioUrl
                      ? "Uploaded · tap to replace"
                      : "Required to publish"}
                  </span>
                  <MasterSpecLine song={song} />
                </>
              }
              severity="required"
              size="emphasized"
              active={false}
              onClick={() => setMode("audio")}
              buttonRef={masterChipRef}
              testId={`tile-audio-${song.id}`}
            />
          )}

          {/* OPTIONAL — 2×2 grid: Preview · Lyrics · Credits · Splits */}
          <div className="grid grid-cols-2 gap-2">
            {mode === "preview" ? (
              <div className="col-span-2">
                <ExpandedPanel
                  icon={Headphones}
                  label="Preview window"
                  onCollapse={closePreview}
                  testId={`editor-preview-${song.id}`}
                >
                  <PreviewWindowEditor
                    key={song.id}
                    song={song}
                    onClose={closePreview}
                    onSaved={invalidate}
                    standalone
                  />
                </ExpandedPanel>
              </div>
            ) : mode === "lyrics" || mode === "synced" ? (
              <div className="col-span-2">
                <ExpandedPanel
                  icon={FileText}
                  label="Lyrics"
                  onCollapse={mode === "synced" ? closeSynced : closeLyrics}
                  testId={`editor-lyrics-${song.id}`}
                >
                  {mode === "synced" ? (
                    <SyncedLyricsEditor
                      key={song.id}
                      song={song}
                      onClose={closeSynced}
                      onSaved={invalidate}
                    />
                  ) : (
                    <LyricsEditor
                      key={song.id}
                      song={song}
                      onClose={closeLyrics}
                      onSaved={invalidate}
                      onUpgradeSync={() => setMode("synced")}
                    />
                  )}
                </ExpandedPanel>
              </div>
            ) : mode === "credits" ? (
              <div className="col-span-2">
                <ExpandedPanel
                  icon={Users}
                  label="Credits"
                  onCollapse={closeCredits}
                  testId={`editor-credits-${song.id}`}
                >
                  <TrackCreditsPanel
                    songId={song.id}
                    albumId={albumId}
                    credits={credits as any}
                  />
                </ExpandedPanel>
              </div>
            ) : mode === "splits" ? (
              <div className="col-span-2">
                <ExpandedPanel
                  icon={PieChart}
                  label="Mechanical splits"
                  onCollapse={closeSplits}
                  testId={`editor-splits-${song.id}`}
                >
                  <TrackSplitsEditor
                    songId={song.id}
                    songTitle={song.title}
                    albumId={albumId}
                  />
                </ExpandedPanel>
              </div>
            ) : (
              <>
                <StatusBadge
                  ok={song.previewStartMs != null}
                  icon={Headphones}
                  label="Preview"
                  subtitle={
                    song.previewStartMs != null ? "Set" : "Auto (first 30s)"
                  }
                  compact
                  onClick={() => setMode("preview")}
                  buttonRef={previewChipRef}
                  testId={`tile-preview-${song.id}`}
                />
                <StatusBadge
                  ok={!!song.lyrics || !!song.syncedLyrics}
                  icon={FileText}
                  label="Lyrics"
                  subtitle={
                    song.syncedLyrics
                      ? "Synced"
                      : song.lyrics
                        ? "Plain"
                        : "None"
                  }
                  compact
                  onClick={() => setMode("lyrics")}
                  buttonRef={lyricsChipRef}
                  testId={`tile-lyrics-${song.id}`}
                />
                <StatusBadge
                  ok={statuses.credits === "ok"}
                  icon={Users}
                  label="Credits"
                  subtitle={
                    statuses.credits === "ok"
                      ? "Set"
                      : statuses.credits === "partial"
                        ? "Partial"
                        : "None"
                  }
                  compact
                  onClick={() => setMode("credits")}
                  buttonRef={creditsChipRef}
                  testId={`tile-credits-${song.id}`}
                />
                <StatusBadge
                  ok={statuses.splits === "ok"}
                  icon={PieChart}
                  label="Splits"
                  subtitle={
                    statuses.splits === "ok"
                      ? "100%"
                      : statuses.splits === "partial"
                        ? "Partial"
                        : "None"
                  }
                  compact
                  onClick={() => setMode("splits")}
                  buttonRef={splitsChipRef}
                  testId={`tile-splits-${song.id}`}
                />
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}


/* ─── Instrumental toggle (lives inside the Lyrics editor) ───────────
   A single switch the admin flips when a track has no lyrics by
   design — an interlude, a guitar solo, an outro. Saves immediately
   on toggle so the row's Lyrics status dot updates without the admin
   having to touch the textarea or click Save below. */

/* ─── Explicit toggle (paired with Instrumental in the master-tile
   footer) ────────────────────────────────────────────────────────────
   Apple Music model: each track carries its own E flag. The album-level
   `isExplicit` column survives as a manual override path (no UI today)
   for the rare case of a clean tracklist with an explicit cover/title;
   in normal use, any song.isExplicit being true is enough to light
   the consumer album card's "E" badge — the server derives it. Saves
   immediately on toggle — no Save button — to match the rest of the
   master tile's autosave behavior. */
function ExplicitTrackToggle({ song, albumId }: { song: SongLite; albumId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const checked = !!song.isExplicit;

  const toggleMut = useMutation({
    mutationFn: async (next: boolean) =>
      apiRequest("PUT", `/api/admin/songs/${song.id}`, { isExplicit: next }),
    onSuccess: async (_data, next) => {
      // Invalidate both the list (Albums grid E chip) and the detail
      // (AdminAlbum header + AlbumPreviewCard album.isExplicit + per-
      // track E in the preview tracklist). Prefix-match would catch
      // both, but being explicit guards against any future change to
      // exact:true defaults and keeps the preview reactive even when
      // HMR has invalidated AdminAlbum mid-session.
      await qc.invalidateQueries({ queryKey: ["/api/albums"] });
      if (albumId) {
        await qc.invalidateQueries({ queryKey: ["/api/albums", albumId] });
      }
      toast({
        title: next ? "Marked as explicit" : "Explicit flag removed",
      });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't update the explicit flag",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  return (
    <div
      className="flex items-center justify-center gap-3.5 w-full"
      data-testid={`toggle-explicit-${song.id}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <ExplicitBadge tone="slate" />
        <span className="text-[11.5px] text-slate-600 font-medium">
          Explicit
        </span>
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="What Explicit means"
                  className="w-4 h-4 rounded-full text-slate-400 hover:text-[var(--brand-blue)] hover:bg-slate-100 inline-flex items-center justify-center flex-shrink-0"
                  data-testid={`info-explicit-${song.id}`}
                >
                  <Info className="w-3 h-3" aria-hidden="true" />
                  <span className="sr-only">What Explicit means</span>
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              shows an E next to the title
            </TooltipContent>
          </Tooltip>
          <PopoverContent
            side="top"
            align="center"
            className="w-56 text-xs leading-relaxed bg-white border border-slate-200 shadow-lg text-slate-700"
          >
            shows an E next to the title
          </PopoverContent>
        </Popover>
      </div>
      <Switch
        checked={checked}
        disabled={toggleMut.isPending}
        onCheckedChange={(next) => toggleMut.mutate(next)}
        aria-label="Mark this track as explicit"
        className="data-[state=unchecked]:bg-[#E9E9EB] data-[state=checked]:bg-[#34C759] [&>span]:!bg-white [&>span]:!shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

/* ─── Previewable single toggle ─────────────────────────────────────
   Opts a track into the fan-facing Preview & Purchase track row's
   "playable" state on a not-yet-owned album. Off by default — the
   operator hand-picks the 1–3 singles per release that fans get to
   sample. Matches Apple Music's "Days We Left Behind"-style preview
   on pre-release pages. */
function PreviewableTrackToggle({ song }: { song: SongLite }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const hidden = !!song.previewHidden;
  const sunriseIso = song.previewHiddenUntil ?? null;
  // <input type="datetime-local"> wants a `YYYY-MM-DDTHH:mm` local-time
  // string (no timezone suffix). Server stores UTC; convert by stripping
  // the offset out via toLocaleString-style rebuild.
  const sunriseLocal = useMemo(() => {
    if (!sunriseIso) return "";
    const d = new Date(sunriseIso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [sunriseIso]);
  const [sunriseDraft, setSunriseDraft] = useState(sunriseLocal);
  const [sunriseError, setSunriseError] = useState<string | null>(null);
  useEffect(() => {
    setSunriseDraft(sunriseLocal);
    setSunriseError(null);
  }, [sunriseLocal]);

  const updateMut = useMutation({
    mutationFn: async (body: { previewHidden?: boolean; previewHiddenUntil?: string | null }) =>
      apiRequest("PUT", `/api/admin/songs/${song.id}`, body),
    onSuccess: async (_data, body) => {
      await qc.invalidateQueries({ queryKey: ["/api/albums"] });
      if (body.previewHidden === true && body.previewHiddenUntil === undefined) {
        toast({ title: "Preview hidden" });
      } else if (body.previewHidden === false) {
        toast({ title: "Preview restored" });
      } else if (body.previewHiddenUntil === null) {
        toast({ title: "Sunrise cleared" });
      } else if (body.previewHiddenUntil) {
        toast({ title: "Sunrise set" });
      }
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't update preview",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const handleToggle = (next: boolean) => {
    // Flipping the switch back OFF (preview visible again) also clears
    // any stored sunrise — the server does this too, but doing it on
    // the client keeps the UI consistent during the in-flight mutation.
    if (!next) {
      setSunriseDraft("");
      setSunriseError(null);
      updateMut.mutate({ previewHidden: false, previewHiddenUntil: null });
    } else {
      updateMut.mutate({ previewHidden: true });
    }
  };

  const handleSunriseChange = (raw: string) => {
    setSunriseDraft(raw);
    setSunriseError(null);
  };

  const commitSunrise = () => {
    if (!sunriseDraft) {
      // Empty input = clear sunrise. Only fire the mutation if there was
      // actually a stored sunrise to clear.
      if (sunriseIso) updateMut.mutate({ previewHiddenUntil: null });
      return;
    }
    const dt = new Date(sunriseDraft);
    if (Number.isNaN(dt.getTime())) {
      setSunriseError("Pick a valid date and time.");
      return;
    }
    if (dt.getTime() <= Date.now()) {
      setSunriseError("Sunrise must be in the future.");
      return;
    }
    setSunriseError(null);
    updateMut.mutate({ previewHiddenUntil: dt.toISOString() });
  };

  const clearSunrise = () => {
    setSunriseDraft("");
    setSunriseError(null);
    if (sunriseIso) updateMut.mutate({ previewHiddenUntil: null });
  };

  const caption = hidden
    ? sunriseIso
      ? `Preview hidden — will return on ${new Date(sunriseIso).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`
      : "Preview hidden — until manually re-enabled"
    : "Previewable by default";

  return (
    <div className="flex flex-col items-stretch gap-1.5 w-full">
      <div
        className="flex items-center justify-center gap-3.5 w-full"
        data-testid={`toggle-previewable-${song.id}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Play className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 fill-current" aria-hidden="true" />
          <span className="text-xs text-slate-600 font-medium whitespace-nowrap">Hide preview</span>
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="What Hide preview means"
                    className="w-4 h-4 rounded-full text-slate-400 hover:text-[var(--brand-blue)] hover:bg-slate-100 inline-flex items-center justify-center flex-shrink-0"
                    data-testid={`info-previewable-${song.id}`}
                  >
                    <Info className="w-3 h-3" aria-hidden="true" />
                    <span className="sr-only">What Hide preview means</span>
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                flip ON to hide the pre-purchase preview
              </TooltipContent>
            </Tooltip>
            <PopoverContent
              side="top"
              align="center"
              className="w-64 text-xs leading-relaxed bg-white border border-slate-200 shadow-lg text-slate-700"
            >
              Every track is previewable by default. Flip this ON to hide this track's
              pre-purchase preview from fans (e.g. an unreleased bonus). Optionally set a
              sunrise date and the preview will come back on its own.
            </PopoverContent>
          </Popover>
        </div>
        <Switch
          checked={hidden}
          disabled={updateMut.isPending}
          onCheckedChange={handleToggle}
          aria-label="Hide this track's pre-purchase preview"
          className="data-[state=unchecked]:bg-[#E9E9EB] data-[state=checked]:bg-[#34C759] [&>span]:!bg-white [&>span]:!shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>
      {hidden && (
        <div className="flex flex-col items-stretch gap-1 mt-0.5 pt-1.5 border-t border-slate-200/70">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="whitespace-nowrap">Show preview again on</span>
            <input
              type="datetime-local"
              value={sunriseDraft}
              onChange={(e) => handleSunriseChange(e.target.value)}
              onBlur={commitSunrise}
              disabled={updateMut.isPending}
              className="flex-1 min-w-0 text-xs px-1 py-0.5 rounded border border-slate-200 bg-white text-slate-700 disabled:opacity-50"
              data-testid={`input-preview-sunrise-${song.id}`}
            />
            {sunriseDraft && (
              <button
                type="button"
                onClick={clearSunrise}
                disabled={updateMut.isPending}
                className="text-xs text-slate-400 hover:text-rose-500 disabled:opacity-50"
                data-testid={`button-clear-preview-sunrise-${song.id}`}
              >
                Clear
              </button>
            )}
          </label>
          {sunriseError && (
            <span
              className="text-xs text-rose-500"
              data-testid={`error-preview-sunrise-${song.id}`}
            >
              {sunriseError}
            </span>
          )}
          <span
            className="text-xs text-slate-500"
            data-testid={`status-preview-${song.id}`}
          >
            {caption}
          </span>
        </div>
      )}
    </div>
  );
}

function InstrumentalToggle({ song }: { song: SongLite }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const checked = !!song.instrumental;
  // Guard: don't let the admin flip Instrumental ON while lyrics already
  // exist — the flag implies "no lyrics by design," and turning it on
  // would suggest the saved lyrics were never meant to be there. We
  // still allow turning it OFF (in case it was legacy-on with lyrics
  // somehow attached). The Lyrics editor's Clear/Trash flow is the
  // intentional path to remove lyrics first.
  const hasLyrics = !!(song.lyrics && song.lyrics.trim().length > 0);
  const lockedOn = hasLyrics && !checked;

  const toggleMut = useMutation({
    mutationFn: async (next: boolean) =>
      apiRequest("PUT", `/api/admin/songs/${song.id}`, { instrumental: next }),
    onSuccess: async (_data, next) => {
      await qc.invalidateQueries({ queryKey: ["/api/albums"] });
      toast({
        title: next
          ? "Marked as instrumental"
          : "Instrumental flag removed",
      });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't update the instrumental flag",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  return (
    <div
      className="flex items-center justify-center gap-3.5 w-full"
      data-testid={`toggle-instrumental-${song.id}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Ban
          className="w-3.5 h-3.5 text-slate-400 flex-shrink-0"
          aria-hidden="true"
        />
        <span className="text-[11.5px] text-slate-600 font-medium">
          Instrumental
        </span>
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="What Instrumental means"
                  className="w-4 h-4 rounded-full text-slate-400 hover:text-[var(--brand-blue)] hover:bg-slate-100 inline-flex items-center justify-center flex-shrink-0"
                  data-testid={`info-instrumental-${song.id}`}
                >
                  <Info className="w-3 h-3" aria-hidden="true" />
                  <span className="sr-only">What Instrumental means</span>
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {lockedOn
                ? "clear the lyrics first to mark instrumental"
                : "no lyrics or singer credits"}
            </TooltipContent>
          </Tooltip>
          <PopoverContent
            side="top"
            align="center"
            className="w-60 text-xs leading-relaxed bg-white border border-slate-200 shadow-lg text-slate-700"
          >
            {lockedOn
              ? "clear the lyrics first to mark instrumental"
              : "no lyrics or singer credits"}
          </PopoverContent>
        </Popover>
      </div>
      {/* Apple HIG Switch — pinned explicitly because shadcn's
          defaults pull `bg-input` (our dark-navy player token) for the
          track and `bg-background` (also dark navy) for the thumb,
          which renders black-on-blue on this white admin card.
          iOS Switch is a universal convention:
            · OFF — #E9E9EB track, white thumb
            · ON  — #34C759 (system green) track, white thumb
          We use green even though our brand is blue because Apple
          uses green for *every* switch in iOS regardless of app
          brand — the affordance reads as "on" instantly. */}
      <Switch
        checked={checked}
        disabled={toggleMut.isPending || lockedOn}
        onCheckedChange={(next) => {
          if (lockedOn) {
            toast({
              title: "Lyrics are already saved for this track",
              description:
                "Clear the lyrics first if this is actually an instrumental — that keeps us from accidentally hiding real lyrics.",
            });
            return;
          }
          toggleMut.mutate(next);
        }}
        aria-label="Mark this track as instrumental"
        title={lockedOn ? "Clear the lyrics first to mark instrumental" : undefined}
        className="data-[state=unchecked]:bg-[#E9E9EB] data-[state=checked]:bg-[#34C759] [&>span]:!bg-white [&>span]:!shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

/* ─── Section-header detection ─────────────────────────────────────────
   Songwriters mark structure in two ways:
     · Bracketed:  [Verse 1], [Chorus], [Bridge] — bracketed always wins,
                   any case.
     · Shorthand:  V1, V2, PRE, CHORUS, BRIDGE, INTRO, OUTRO — only when
                   written in ALL-CAPS as a standalone line. A lyric line
                   that says "Hook" or "Bridge" (normal-cased) will NOT
                   be caught, only the songwriter convention of an
                   all-caps marker.
   Either form is an authoring annotation, NOT a sung line. They must
   be skipped when distributing timing (Bill: "V1 and PRE wouldn't be
   in the song") and hidden from the synced-lyrics preview. */
const SECTION_HEADER_RE =
  /^(\[.*\]|V\d+|VERSE(?:\s+\d+)?|PRE(?:-?\s*CHORUS)?|POST(?:-?\s*CHORUS)?|CHORUS|BRIDGE|INTRO|OUTRO)$/;
function isSectionHeaderLine(text: string): boolean {
  return SECTION_HEADER_RE.test(text.trim());
}

/* Find the millisecond timestamp of the first sung line inside a
   [Chorus] / CHORUS section. Used by the album-wide GoodSync wizard
   to auto-set `previewStartMs` to the chorus. Two-strategy match so
   it survives Scribe occasionally rewording a line:
     1) Exact text match (case-insensitive trim) — preferred.
     2) Positional fallback — count sung lines up to the chorus and
        return the cue at that index.
   Returns `null` if there's no [Chorus] marker, no sung line after
   it, or no cue we can confidently map to. The caller must treat
   null as "leave preview alone." */
function findChorusStartMs(
  lyricsText: string | null | undefined,
  cues: { timeMs: number; text: string }[] | null | undefined,
): number | null {
  if (!lyricsText || !cues || cues.length === 0) return null;
  // Match "Chorus" but NOT "Pre-Chorus" / "Post-Chorus" / "Prechorus".
  // We strip wrapping brackets/parens then require chorus to start the
  // section name (allowing things like "Chorus 2", "Chorus (final)").
  const isChorusHeader = (line: string) => {
    if (!isSectionHeaderLine(line)) return false;
    const inner = line
      .trim()
      .replace(/^[\[\(]/, "")
      .replace(/[\]\)]$/, "")
      .trim();
    return /^chorus\b/i.test(inner);
  };
  const lines = lyricsText.split("\n");
  let chorusIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (isChorusHeader(t)) {
      chorusIdx = i;
      break;
    }
  }
  if (chorusIdx === -1) return null;
  let firstSungText: string | null = null;
  let firstSungIdx = -1;
  for (let i = chorusIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || isSectionHeaderLine(t)) continue;
    firstSungText = t;
    firstSungIdx = i;
    break;
  }
  if (firstSungText === null || firstSungIdx === -1) return null;
  // Positional index = how many sung lines appear BEFORE the chorus's
  // first sung line. Used both as the direct-match starting point
  // (so a repeated lyric earlier in the song doesn't steal the cue)
  // and as the positional fallback if no text match lands.
  let sungCount = 0;
  for (let i = 0; i < firstSungIdx; i++) {
    const t = lines[i].trim();
    if (t && !isSectionHeaderLine(t)) sungCount++;
  }
  const norm = (s: string) => s.trim().toLowerCase();
  const target = norm(firstSungText);
  // Search a small window starting at the positional index — allow ±2
  // cues of drift since Scribe occasionally splits/merges a long line.
  const lo = Math.max(0, sungCount - 2);
  const hi = Math.min(cues.length - 1, sungCount + 2);
  for (let i = lo; i <= hi; i++) {
    if (norm(cues[i].text) === target) return cues[i].timeMs;
  }
  if (sungCount < cues.length) return cues[sungCount].timeMs;
  return null;
}

type ChorusMethod = "marker" | "ai";

// Two-tier chorus resolver shared by every "set the preview to the chorus"
// surface (the inline GoodSync™ follow-up, the album-wide wizard, and the
// per-track "Find the chorus" action). Tier 1 is the cheap, deterministic
// `[Chorus]`-marker match (no AI cost). Only when that returns null do we
// fall back to the server's AI chorus finder, which reads the time-aligned
// cues even when the lyrics carry no section labels. Returns null (and the
// caller leaves the preview untouched) when neither tier can decide.
async function resolveChorusStartMs(
  songId: string,
  lyricsText: string | null | undefined,
  cues: { timeMs: number; text: string }[] | null | undefined,
): Promise<{ startMs: number; method: ChorusMethod } | null> {
  const marker = findChorusStartMs(lyricsText, cues);
  if (marker != null) return { startMs: marker, method: "marker" };
  if (!cues || cues.length === 0) return null;
  try {
    const res = await apiRequest("POST", `/api/admin/songs/${songId}/find-chorus`, {
      cues,
      lyrics: lyricsText ?? null,
    });
    const body = await res.json().catch(() => null);
    const ms = body?.previewStartMs;
    if (typeof ms === "number" && Number.isFinite(ms)) {
      return { startMs: ms, method: "ai" };
    }
  } catch {
    /* best-effort — AI fallback failure leaves the preview alone */
  }
  return null;
}

/* Auto-distribute draft lyrics across the master's duration. Skips
   section headers + empty lines. Lead-in 1.5s, tail 2s — same as the
   player's `buildSyncedLines` fallback so admin-side preview and
   fan-side playback line up identically. */
function distributeLyrics(
  draft: string,
  durationSec: number,
): { timeMs: number; text: string }[] {
  const lines = draft.split("\n");
  const timeable: number[] = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t || isSectionHeaderLine(t)) return;
    timeable.push(i);
  });
  const dur = Math.max(30, durationSec);
  const lead = 1.5;
  const tail = 2;
  const usable = Math.max(1, dur - lead - tail);
  const denom = Math.max(1, timeable.length - 1);
  const out: { timeMs: number; text: string }[] = [];
  timeable.forEach((idx, k) => {
    const t = lead + (k / denom) * usable;
    out.push({ timeMs: Math.round(t * 1000), text: lines[idx] });
  });
  return out;
}

// LyricsGapDots now lives in client/src/components/LyricsGapDots.tsx
// so the fan player and the admin preview render the exact same
// instrumental indicator.

/* ─── GoodSync™ side-panel — lives inside LyricsEditor ──────────────────
   Companion column to the Words textarea. Heading-above-box matches
   the Words pane structure. Inside the box: an Apple-Music-style cue
   list whose active line bolds and scales as the master plays, with
   the Play button floating bottom-center.

   No manual Generate / Re-generate button — the live preview is
   derived from the current draft in real time. The outer Save
   button (LyricsEditor footer) persists both the lyrics text AND
   the derived sync cues in one call. Cancel throws them away. */

function GoodSyncPanel({
  song,
  draftLyrics,
  onSyncWithAudio,
  syncing,
  onSaved,
}: {
  song: SongLite;
  draftLyrics: string;
  /** Trigger a real ElevenLabs forced alignment. The LyricsEditor owns
   *  the flow (save draft → POST /auto-sync-lyrics → close). */
  onSyncWithAudio?: () => void;
  /** True while alignment is in flight — disables the button + shows
   *  a spinner. */
  syncing?: boolean;
  /** Called after a successful cue-text edit save so the parent can
   *  re-fetch and refresh the song record. */
  onSaved?: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  // Sync-with-audio uses ElevenLabs Speech-to-Text — it transcribes the
  // master directly, so typed lyrics are no longer required to run the
  // sync. The Plain pane is purely a reference for the admin to spot
  // mishears once cues come back.
  const canSync = !song.instrumental && !!song.audioUrl;
  const savedCues = song.syncedLyrics ?? [];
  const hasSynced = canSync && savedCues.length > 0;

  // ── Re-sync confirm gate ──────────────────────────────────────────
  // First-time Sync runs immediately (nothing to lose). Re-sync after
  // cues exist is destructive: it throws away the saved timings AND
  // any per-cue text fixes the operator made via the ✏️ pencil. Per
  // replit.md "destructive actions always confirm", we pop an
  // AlertDialog named for the action before re-running.
  const [confirmResync, setConfirmResync] = useState(false);
  const handleSyncClick = () => {
    if (hasSynced) {
      setConfirmResync(true);
      return;
    }
    onSyncWithAudio?.();
  };

  // ── Inline cue-text edit mode ─────────────────────────────────────
  // Admin clicks the pencil → cue list swaps to text inputs (timings
  // are read-only). Save persists via PUT /api/admin/songs/:id with the
  // updated syncedLyrics. Cancel discards the draft. Timestamps and
  // endMs are preserved untouched — STT got the timing right, we're
  // only fixing what it misheard.
  const [editing, setEditing] = useState(false);
  const [cueDraft, setCueDraft] = useState<
    { timeMs: number; endMs?: number; text: string }[]
  >([]);
  const enterEdit = () => {
    setCueDraft(savedCues.map((c) => ({ ...c })));
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setCueDraft([]);
  };
  const saveCueEdits = useMutation({
    mutationFn: async () =>
      apiRequest("PUT", `/api/admin/songs/${song.id}`, {
        syncedLyrics: cueDraft,
      }),
    onSuccess: async () => {
      await onSaved?.();
      toast({ title: "GoodSync™ cues saved" });
      setEditing(false);
      setCueDraft([]);
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save cue edits",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });
  // Keep the old `canPlay` name for the audio-element render block —
  // play UI is gated on having real cues now, not on typed lyrics.
  const canPlay = hasSynced;

  const previewCues = useMemo(() => {
    if (!hasSynced) return [];
    // Filter section headers (bracketed or all-caps shorthand) just
    // in case older auto-distributed data is still around — STT cues
    // are clean already.
    return savedCues.filter(
      (c) => c.text.trim() && !isSectionHeaderLine(c.text),
    );
  }, [hasSynced, savedCues]);

  // Shared admin-audio source attacher — picks Mux HLS (signed URL +
  // retry, hls.js / native HLS) when the asset is `ready`, falls back
  // to the raw `audioUrl` otherwise. This is the same chain the dock
  // uses, so anything the dock can play GoodSync can play too —
  // including 24-bit WAV / FLAC masters that bare <audio src=…> would
  // reject with NotSupportedError. The hook exposes a callback ref
  // (`setAudio`) so remounts auto-rewire, plus a `reason` we render
  // inline when no playable source exists.
  const {
    setAudio,
    audio,
    reason: audioReason,
  } = useAdminTrackAudioSource(song);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Active cue = the last cue whose start time has passed. -1 means
  // we're in the intro before any sung lyric.
  const activeIdx = (() => {
    if (!previewCues.length) return -1;
    let idx = -1;
    for (let i = 0; i < previewCues.length; i++) {
      if (previewCues[i].timeMs / 1000 <= currentTime + 0.05) idx = i;
      else break;
    }
    return idx;
  })();

  // Auto-scroll the active line — or the upcoming first line during
  // the intro gap — into the middle of the panel.
  useEffect(() => {
    if (!listRef.current || previewCues.length === 0) return;
    const target = activeIdx >= 0 ? activeIdx : 0;
    const el = listRef.current.querySelector(
      `[data-cue-idx="${target}"]`,
    ) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIdx, previewCues.length]);

  // Wire the hidden audio element to local state. Keyed on the audio
  // node so it re-runs whenever the element mounts/unmounts.
  useEffect(() => {
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onPlayEv = () => setPlaying(true);
    const onPauseEv = () => setPlaying(false);
    // Seed initial state in case events fired before listeners were on.
    setCurrentTime(audio.currentTime);
    setPlaying(!audio.paused);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlayEv);
    audio.addEventListener("pause", onPauseEv);
    // Force-start buffering. Dropbox hot-link URLs (dl.dropboxusercontent.com)
    // often ignore preload="auto" — the element sits at readyState 0 until
    // the first explicit load(). Without this, the first tap of the header
    // play triangle calls audio.play() on an unbuffered element, the promise
    // rejects silently, and the triangle "does nothing" until the admin
    // interacts with the visible Master <audio> first.
    if (audio.readyState < 2) {
      try {
        audio.load();
      } catch {
        /* swallow — load() can throw on detached elements */
      }
    }
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlayEv);
      audio.removeEventListener("pause", onPauseEv);
    };
  }, [audio]);

  // Stop playback on unmount so navigating away doesn't leave audio running.
  useEffect(() => {
    return () => {
      audio?.pause();
    };
  }, [audio]);

  const togglePlay = () => {
    if (!audio || !song.audioUrl) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    // Try to play immediately. If metadata hasn't arrived yet (Dropbox /
    // slow CDN), .play() rejects with a "no supported source" / aborted
    // error — in that case kick a load() and retry once canplay fires, so
    // the first tap doesn't feel dead.
    audio.play().catch(() => {
      const onReady = () => {
        audio.removeEventListener("canplay", onReady);
        audio.play().catch(() => {});
      };
      audio.addEventListener("canplay", onReady, { once: true });
      try {
        audio.load();
      } catch {
        /* ignore */
      }
    });
  };

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  /* Heading rendered ABOVE the box (matches the Words pane's
     heading-above-textarea layout per Bill's mock). The box itself
     is rendered separately below this header row. */
  const header = (
    <div className="flex items-center justify-between gap-2 h-7">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-5 h-5 rounded-full bg-[var(--brand-blue)] inline-flex items-center justify-center flex-shrink-0">
          <WaveArrowGlyph className="w-3 h-3" />
        </span>
        <h4 className="text-[13px] font-semibold text-slate-800 truncate">
          GoodSync™
        </h4>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="What is GoodSync™?"
              className="w-5 h-5 rounded-full text-slate-400 hover:text-[var(--brand-blue)] hover:bg-slate-100 inline-flex items-center justify-center flex-shrink-0"
              data-testid={`button-goodsync-info-${song.id}`}
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            className="w-72 text-[12px] leading-relaxed bg-white border border-slate-200 shadow-lg text-slate-700"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-[var(--brand-blue)] inline-flex items-center justify-center">
                <WaveArrowGlyph className="w-3.5 h-3.5" />
              </span>
              <p className="font-semibold text-slate-900">
                What is GoodSync™?
              </p>
            </div>
            <p className="text-slate-700">
              Line-timed lyrics that scroll with the master. We
              auto-align your typed words to the audio so you don't
              have to stopwatch every line.
            </p>
            <p className="text-slate-500 mt-2 text-[11px]">
              Edit the words in <span className="font-medium text-slate-700">Lyrics</span>;
              GoodSync handles the timing. Cues aren't edited directly.
            </p>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Edit mode shows Cancel + Save and hides the play/sync
            controls. Cue count was moved to a footer below the box. */}
        {editing ? (
          <>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saveCueEdits.isPending}
              className="h-6 px-2 rounded-md text-[11px] font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              data-testid={`button-cancel-cue-edit-${song.id}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => saveCueEdits.mutate()}
              disabled={saveCueEdits.isPending}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-[var(--brand-blue)] text-white text-[11px] font-semibold hover:bg-[var(--brand-blue)]/90 disabled:opacity-50"
              data-testid={`button-save-cue-edit-${song.id}`}
            >
              {saveCueEdits.isPending ? (
                <Spinner className="w-3 h-3 animate-spin" />
              ) : null}
              {saveCueEdits.isPending ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <>
            {/* First-time sync: labeled pill on the left so the action
                is obvious before any cues exist. Once we have cues,
                this pill collapses into a compact circular icon that
                sits to the LEFT of the pencil — same visual rhythm as
                pencil + play. */}
            {canSync && onSyncWithAudio && !hasSynced && (
              <button
                type="button"
                onClick={handleSyncClick}
                disabled={syncing}
                title="Sync with audio — uses ElevenLabs to time each line to the master"
                className="inline-flex items-center gap-1 h-6 pl-1.5 pr-2 rounded-md border border-[var(--brand-blue)]/40 bg-white text-[var(--brand-blue)] text-[10.5px] font-semibold hover:bg-[var(--brand-blue)]/10 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid={`button-sync-audio-${song.id}`}
              >
                {syncing ? (
                  <Spinner className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {syncing ? "Syncing…" : "Sync with audio"}
              </button>
            )}
            {/* Re-sync icon — only shown once cues already exist.
                Compact circular button matching the pencil + play
                rhythm. Replaces the existing cues with a fresh
                alignment (use after fixing wrong lyrics, typos, etc.). */}
            {canSync && onSyncWithAudio && hasSynced && (
              <button
                type="button"
                onClick={handleSyncClick}
                disabled={syncing}
                aria-label="Re-sync with audio"
                title="Re-sync with audio — replaces the existing GoodSync cues with a fresh alignment"
                className="w-6 h-6 rounded-full text-slate-400 hover:text-[var(--brand-blue)] hover:bg-slate-100 inline-flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid={`button-sync-audio-${song.id}`}
              >
                {syncing ? (
                  <Spinner className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
              </button>
            )}
            {/* Pencil — enters cue-text edit mode. Sits LEFT of the
                play button per Bill's spec. Only meaningful once cues
                exist; we hide it pre-sync so the row doesn't get noisy. */}
            {hasSynced && (
              <button
                type="button"
                onClick={enterEdit}
                aria-label="Edit cue text"
                title="Edit cue text — fix words STT misheard. Timings stay put."
                className="w-6 h-6 rounded-full text-slate-400 hover:text-[var(--brand-blue)] hover:bg-slate-100 inline-flex items-center justify-center"
                data-testid={`button-edit-cues-${song.id}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {/* Header play/pause — the ONLY play control. */}
            {hasSynced && (
              <button
                type="button"
                onClick={togglePlay}
                disabled={previewCues.length === 0}
                aria-label={playing ? "Pause preview" : "Play preview"}
                title={playing ? "Pause preview" : "Play preview"}
                className="w-6 h-6 rounded-full text-slate-400 hover:text-[var(--brand-blue)] hover:bg-slate-100 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid={`button-play-goodsync-header-${song.id}`}
              >
                {playing ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5 translate-x-[1px] fill-current" />
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
    <div
      className="flex flex-col gap-2 min-w-0"
      data-testid={`panel-goodsync-${song.id}`}
    >
      {header}

      {/* The box. Same height + border treatment as the Words textarea
          so the two panes read as siblings. */}
      <div
        className="relative rounded-md border border-slate-200 bg-slate-50 overflow-hidden flex flex-col"
        style={{ height: 200 }}
      >
        {song.instrumental ? (
          <div className="flex-1 flex items-center justify-center text-center text-[12px] text-slate-400 px-4 py-10">
            Instrumental track — no lyrics to sync.
          </div>
        ) : !song.audioUrl ? (
          <div className="flex-1 flex items-center justify-center text-center text-[12px] text-slate-500 px-4 py-10">
            Upload a master first — GoodSync™ needs audio to line the
            words up against.
          </div>
        ) : syncing ? (
          <div
            className="flex-1 flex flex-col items-center justify-center text-center text-[12px] text-slate-500 px-4 py-10 gap-2"
            data-testid={`status-syncing-${song.id}`}
          >
            <Spinner className="w-5 h-5 text-[var(--brand-blue)] animate-spin" />
            <span>
              Listening to the master and lining up every word…
              <br />
              <span className="text-[11px] text-slate-400">
                Usually 20–30 seconds.
              </span>
            </span>
          </div>
        ) : !hasSynced ? (
          <div
            className="flex-1 flex items-center justify-center text-center text-[12px] text-slate-500 px-4 py-10"
            data-testid={`status-not-synced-${song.id}`}
          >
            Tap{" "}
            <span className="font-semibold text-[var(--brand-blue)] mx-1">
              Sync with audio
            </span>{" "}
            and we'll transcribe the master line-by-line.
          </div>
        ) : (
          <>
            <audio
              ref={setAudio}
              preload="auto"
              className="hidden"
              data-testid={`audio-goodsync-${song.id}`}
            />
            {audioReason && audioReason.code !== "no-master" && (
              <div
                className="px-3 pt-2 text-xs text-amber-700"
                data-testid={`status-goodsync-audio-${song.id}`}
              >
                {audioReason.code === "encoding" || audioReason.code === "unplayable"
                  ? "This master is still encoding — try the play button again in a moment."
                  : audioReason.message}
              </div>
            )}

            {/* Scrolling cue list. Bottom padding clears the floating
                Play button so the last line stays readable. */}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto px-4 pt-3 pb-14 space-y-1.5"
              data-testid={`list-cues-${song.id}`}
            >
              {previewCues.length === 0 ? (
                <div className="text-center text-[12px] text-slate-400 py-6">
                  No cues — re-run Sync with audio.
                </div>
              ) : editing ? (
                /* Edit mode: one row per cue with a read-only timestamp
                   chip on the left and an editable text input on the
                   right. Timing is intentionally not editable here —
                   admins fix words STT misheard, not the timings. */
                cueDraft.map((cue, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2"
                    data-testid={`row-cue-edit-${song.id}-${i}`}
                  >
                    <span className="text-[10px] tabular-nums text-slate-400 w-12 flex-shrink-0">
                      {fmt(cue.timeMs / 1000)}
                    </span>
                    <input
                      type="text"
                      value={cue.text}
                      onChange={(e) => {
                        const next = cueDraft.slice();
                        next[i] = { ...next[i], text: e.target.value };
                        setCueDraft(next);
                      }}
                      disabled={saveCueEdits.isPending}
                      aria-label={`Cue at ${fmt(cue.timeMs / 1000)} — edit text`}
                      className="flex-1 min-w-0 h-7 rounded-md border border-slate-200 bg-white px-2 text-[12.5px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed"
                      data-testid={`input-cue-text-${song.id}-${i}`}
                    />
                  </div>
                ))
              ) : (
                previewCues.map((cue, i) => {
                  const isActive = i === activeIdx;
                  const isPast = i < activeIdx;
                  // Apple-Music-style three-dot pulse for *real*
                  // instrumental gaps. We measure the silence AFTER
                  // the previous line ends (endMs from STT) — not
                  // from when it started — so the dots no longer
                  // start counting up while the previous line is
                  // still being sung. Threshold is 3s of actual
                  // silence; ordinary line breathing (≤2s) stays
                  // dot-free. Intro gap counts: prevEnd is 0 for
                  // the first cue. If endMs is missing (older synced
                  // data), fall back to a short fixed estimate so
                  // dots still appear during obvious instrumentals.
                  const prevCue = i === 0 ? null : previewCues[i - 1];
                  const cueTime = cue.timeMs / 1000;
                  const prevEnd = !prevCue
                    ? 0
                    : prevCue.endMs != null
                      ? prevCue.endMs / 1000
                      : Math.min(
                          cueTime - 0.3,
                          prevCue.timeMs / 1000 + 3,
                        );
                  const silence = cueTime - prevEnd;
                  // Show dots whenever there's a meaningful gap before
                  // this line. They scroll with the rest of the cues
                  // (upcoming → active → past) instead of mount/unmount.
                  const showDots = silence >= 3;
                  const dotState: "upcoming" | "active" | "past" =
                    currentTime >= cueTime
                      ? "past"
                      : currentTime >= prevEnd
                        ? "active"
                        : "upcoming";
                  const gapProgress =
                    dotState === "active"
                      ? Math.max(
                          0,
                          Math.min(1, (currentTime - prevEnd) / silence),
                        )
                      : 0;
                  return (
                    <div key={i}>
                      {showDots && (
                        <LyricsGapDots
                          state={dotState}
                          progress={gapProgress}
                        />
                      )}
                      <div
                        data-cue-idx={i}
                        onClick={() => {
                          if (audio) {
                            audio.currentTime = cue.timeMs / 1000;
                            if (audio.paused) audio.play().catch(() => {});
                          }
                        }}
                        // Apple-Music feel: keep a single font size +
                        // weight (so the row's flow height never
                        // changes), and animate scale + color/opacity
                        // with a longer ease so lines glide between
                        // states instead of snapping.
                        style={{
                          transform: isActive ? "scale(1.06)" : "scale(1)",
                          transformOrigin: "left center",
                          transitionProperty: "transform, color, opacity",
                          transitionDuration: "400ms",
                          transitionTimingFunction:
                            "cubic-bezier(0.22, 1, 0.36, 1)",
                        }}
                        className={[
                          "cursor-pointer leading-[1.35] text-[13px] font-semibold will-change-transform",
                          isActive
                            ? "text-slate-900"
                            : isPast
                              ? "text-slate-300"
                              : "text-slate-500",
                        ].join(" ")}
                      >
                        {cue.text}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Mini progress bar — sole transport indicator at the
                bottom. Brand blue fill, slate track. Click anywhere on
                the bar to seek. Hidden during edit mode so the input
                rows have room to breathe. */}
            {!editing && (
            <div className="absolute inset-x-0 bottom-0 pointer-events-none">
              <div className="h-6 bg-gradient-to-t from-slate-50 via-slate-50/85 to-transparent" />
              <div className="pointer-events-auto relative bg-slate-50 px-3 pb-1.5 pt-1 flex items-center gap-2">
                <span
                  className="text-[10px] tabular-nums text-slate-400 w-8 text-left"
                  data-testid={`text-time-current-${song.id}`}
                >
                  {fmt(currentTime)}
                </span>
                <div
                  role="slider"
                  aria-label="Seek"
                  aria-valuemin={0}
                  aria-valuemax={song.duration ?? 0}
                  aria-valuenow={currentTime}
                  onClick={(e) => {
                    if (!audio || !song.duration) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(
                      0,
                      Math.min(1, (e.clientX - rect.left) / rect.width),
                    );
                    audio.currentTime = pct * song.duration;
                  }}
                  className="flex-1 h-1 rounded-full bg-slate-200 overflow-hidden cursor-pointer relative"
                  data-testid={`progress-goodsync-${song.id}`}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-[var(--brand-blue)] rounded-full"
                    style={{
                      width: `${
                        song.duration
                          ? Math.max(
                              0,
                              Math.min(
                                100,
                                (currentTime / song.duration) * 100,
                              ),
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <span
                  className="text-[10px] tabular-nums text-slate-400 w-8 text-right"
                  data-testid={`text-time-total-${song.id}`}
                >
                  {fmt(song.duration ?? 0)}
                </span>
              </div>
            </div>
            )}
          </>
        )}
      </div>

      {/* Cue-count footer — moved out of the header so the toolbar can
          fit the pencil + play (or Cancel + Save) without crowding. */}
      <div className="flex items-center justify-end h-4">
        {hasSynced && (
          <span
            className="text-[10px] text-slate-400 tabular-nums"
            data-testid={`text-cue-count-${song.id}`}
          >
            {(editing ? cueDraft.length : previewCues.length)} cues
          </span>
        )}
      </div>
    </div>
    <AlertDialog open={confirmResync} onOpenChange={setConfirmResync}>
      <AlertDialogContent data-testid={`dialog-confirm-resync-${song.id}`}>
        <AlertDialogHeader>
          <AlertDialogTitle>Re-sync GoodSync™ cues?</AlertDialogTitle>
          <AlertDialogDescription>
            This re-runs ElevenLabs speech-to-text against the master and
            replaces the existing cues. Whatever you've typed in the editor
            is kept and used as the source of truth — but if the editor is
            empty, the lyrics get re-transcribed from the audio. Either way,
            any per-cue text fixes you made with the ✏️ pencil — and all
            current timings — will be overwritten.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid={`button-cancel-resync-${song.id}`}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setConfirmResync(false);
              onSyncWithAudio?.();
            }}
            data-testid={`button-confirm-resync-${song.id}`}
          >
            Re-sync
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

/* ─── Per-track lyrics editor ────────────────────────────────────────── */

/**
 * Strip writers' shorthand from a raw lyric paste so the displayed
 * "Editable Lyrics" reads like a fan would see it. Removes:
 *   - section labels on their own line: V1, V2, PRE1, CHORUS, CHORUS x2,
 *     BRIDGE, INTRO, OUTRO, HOOK, TAG, VERSE 2, etc.
 *   - decoration-only lines: rows of dots / dashes / bullets
 * Collapses runs of 3+ blank lines down to 2 so the result reads
 * cleanly without leaving big gaps where labels used to be.
 */
function cleanLyricsForEditor(raw: string): string {
  if (!raw) return "";
  const headerRe = /^(v|pre|chorus|bridge|verse|intro|outro|hook|tag)\s*\d*(\s*x\s*\d+)?\s*$/i;
  const decorRe = /^[\s.…\-_·•]+$/;
  const kept: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) { kept.push(""); continue; }
    if (headerRe.test(t)) continue;
    if (decorRe.test(t)) continue;
    kept.push(line);
  }
  // Collapse 3+ consecutive blank lines down to a single blank.
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function LyricsEditor({
  song,
  onClose,
  onSaved,
  onUpgradeSync,
}: {
  song: SongLite;
  onClose: () => void;
  onSaved: () => Promise<void>;
  /** Switch the row out of "lyrics" mode and into the GoodSync™ editor
   *  (synced lyrics + upload .vtt/.lrc/.srt). Drives both the "Upgrade
   *  to GoodSync™" CTA and the "Import" entry inside this editor. */
  onUpgradeSync?: () => void;
}) {
  const { toast } = useToast();
  // The artist's original paste — frozen at mount time. Used by the
  // "View original" popover so the writers' shorthand (V1 / PRE1 /
  // CHORUS x2 / decorative dots) is never lost, even though the
  // editable view below strips those for clarity.
  //
  // Demo-stage simplification: once the user saves, the cleaned text
  // overwrites `song.lyrics`, so "original" only survives this
  // session. Post-demo: split into `lyrics` + `originalLyrics`
  // columns so the original is preserved permanently.
  const originalRef = useRef<string>(song.lyrics ?? "");
  const [draft, setDraft] = useState<string>(() =>
    cleanLyricsForEditor(song.lyrics ?? ""),
  );
  const [showOriginal, setShowOriginal] = useState(false);
  // Autosave guard: only persist after the writer actively edits
  // the textarea. Without this, simply opening the editor on a song
  // with shorthand (V1 / PRE1 / etc.) would silently overwrite
  // `song.lyrics` with the cleaned version 800ms later — destroying
  // the artist's original paste even if they made no changes.
  const userEditedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Single-file lyric upload affordances — drag/drop, click-to-pick,
  // or paste a URL (Dropbox file share or any public https). Mirrors
  // the per-album folder importer but for one track. Triggers a
  // refetch so the server-stripped/cleaned text shows up in the
  // textarea, and clears any existing GoodSync cues server-side so
  // "Re-sync with audio" can re-run against the new words.
  const lyricFileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [lyricUrl, setLyricUrl] = useState("");

  // Seed the draft + focus the textarea only on first mount.
  // Anti-clobber: a background refetch of `song.lyrics` won't wipe the
  // in-progress edit because we don't depend on it after mount.
  useEffect(() => {
    queueMicrotask(() => {
      textareaRef.current?.focus();
      const el = textareaRef.current;
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);

  const normalized = draft.trim() ? draft : "";
  const dirty = (normalized || null) !== (song.lyrics ?? null);

  // Silent autosave — Bill: "we auto save like the preview". Writes
  // ONLY the words. We never touch syncedLyrics here so a typo fix or
  // any other small edit can't accidentally wipe an expensive
  // ElevenLabs alignment. Only the explicit "Sync with audio" button
  // (alignMut) overwrites the saved cues. If the words drift far
  // enough that the cues no longer fit, the writer re-runs Sync.
  const saveMut = useMutation({
    mutationFn: async () =>
      apiRequest("PUT", `/api/admin/songs/${song.id}`, {
        lyrics: normalized || null,
      }),
    onSuccess: async () => {
      await onSaved();
      // No toast, no close — this is silent autosave.
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save lyrics",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  // Debounced autosave: 800ms after the writer stops typing, persist
  // the current draft if it differs from what's on the server. No
  // save-while-pending — react-query's mutate is fine to call back-to-
  // back; we just gate with isPending so we don't queue a redundant
  // round-trip on every keystroke after the debounce fires.
  useEffect(() => {
    if (song.instrumental) return;
    if (!dirty) return;
    if (!userEditedRef.current) return; // never save without a real edit
    if (saveMut.isPending) return;
    const t = setTimeout(() => saveMut.mutate(), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, song.instrumental, song.lyrics]);

  // Real ElevenLabs forced alignment. Two-step flow so the alignment
  // is always run against what the user just typed (not the previously-
  // saved lyrics): 1) PUT the draft lyrics (so the server route can
  // read song.lyrics from storage), 2) POST /auto-sync-lyrics which
  // calls ElevenLabs and saves real `syncedLyrics` server-side.
  const alignMut = useMutation({
    mutationFn: async () => {
      // Step 1 — persist the current draft (if any) and trash the existing
      // cues. Re-sync is intentionally a clean redo: per Bill, when the
      // writer hits Re-sync they want to throw the old cues away and let
      // Scribe paint a fresh alignment.
      //
      // Empty draft is allowed — Scribe transcribes the master and the
      // server back-populates `song.lyrics` from the transcription. This
      // is the path Bill uses when LRCLIB/Genius returned wrong lyrics:
      // clear the Words box and let GoodSync pull the real ones off the
      // master.
      await apiRequest("PUT", `/api/admin/songs/${song.id}`, {
        lyrics: normalized,
        syncedLyrics: null,
      });
      // Step 2 — Scribe STT + cue grouping. Saves syncedLyrics server-side
      // and (when Words was empty) writes the transcription into
      // `song.lyrics` so the editor refreshes with a real first draft.
      const res = await apiRequest(
        "POST",
        `/api/admin/songs/${song.id}/auto-sync-lyrics`,
      );
      return (await res.json()) as {
        lineCount: number;
        wordCount: number;
        song?: { lyrics?: string | null };
        sourceBytes?: number;
        transcodedBytes?: number | null;
        transcodeMs?: number | null;
        sttMs?: number;
      };
    },
    onSuccess: async (data) => {
      // If Words started empty, the server back-populated `song.lyrics`
      // from the Scribe transcription. Adopt that into the editor's
      // draft so the operator sees the extracted lyrics immediately,
      // and reset originalRef so the autosave doesn't see a fake "dirty"
      // diff against the previous (empty) text.
      const serverLyrics = data.song?.lyrics ?? null;
      const backfilled = !normalized && !!serverLyrics && serverLyrics.trim().length > 0;
      if (backfilled) {
        const next = serverLyrics!;
        originalRef.current = next;
        setDraft(cleanLyricsForEditor(next));
        userEditedRef.current = false;
      }
      await onSaved();
      // Editor stays open — Bill: "After it syncs the 'sync with...'
      // has served its purposes and is replaced with a play button."
      // The header swap is automatic once the refetched song has the
      // new syncedLyrics.
      // Live-test instrumentation (Task #95): when the server reports
      // transcode + STT timings, append a compact footer so the operator
      // can sanity-check shrink ratio + wall-clock without tailing logs.
      const stats: string[] = [];
      if (typeof data.sourceBytes === "number") {
        const srcMB = (data.sourceBytes / 1024 / 1024).toFixed(1);
        if (data.transcodedBytes && data.transcodeMs != null) {
          const outMB = (data.transcodedBytes / 1024 / 1024).toFixed(2);
          stats.push(`${srcMB}MB → ${outMB}MB in ${(data.transcodeMs / 1000).toFixed(1)}s`);
        } else {
          stats.push(`${srcMB}MB passthrough`);
        }
      }
      if (typeof data.sttMs === "number") {
        stats.push(`STT ${(data.sttMs / 1000).toFixed(1)}s`);
      }
      const base = backfilled
        ? `${data.lineCount} lines transcribed · review the Words for any STT mishears.`
        : `${data.lineCount} lines · ${data.wordCount} words aligned`;
      toast({
        title: backfilled
          ? "Lyrics pulled from the master"
          : "Synced with audio",
        description: stats.length ? `${base} · ${stats.join(" · ")}` : base,
      });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't sync with audio",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  // Single-file lyric import — multipart upload OR pasted URL.
  // Server replaces `song.lyrics` AND clears `syncedLyrics`, so after a
  // refetch the textarea shows the new text and the GoodSync pane drops
  // back to "Sync with audio" (Re-sync if Bill wants to keep tuning).
  const uploadLyricMut = useMutation({
    mutationFn: async (payload: { file?: File; url?: string }) => {
      let res: Response;
      if (payload.file) {
        const fd = new FormData();
        fd.append("file", payload.file);
        const token = getAuthToken();
        res = await fetch(
          `/api/admin/songs/${song.id}/import-lyric-file`,
          {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: fd,
            credentials: "include",
          },
        );
      } else {
        res = await apiRequest(
          "POST",
          `/api/admin/songs/${song.id}/import-lyric-file`,
          { sourceUrl: payload.url },
        );
      }
      if (!res.ok) {
        const msg = await res
          .json()
          .then((b: any) => b?.message)
          .catch(() => null);
        throw new Error(msg || `Couldn't import (HTTP ${res.status})`);
      }
      return (await res.json()) as { song: { lyrics: string }; charCount: number; filename: string };
    },
    onSuccess: async (data) => {
      // Reset the draft to the cleaned server text and mark the editor
      // as untouched so the autosave debounce won't immediately
      // re-write it.
      const next = data.song.lyrics ?? "";
      originalRef.current = next;
      setDraft(cleanLyricsForEditor(next));
      userEditedRef.current = false;
      setShowUrlInput(false);
      setLyricUrl("");
      // Drop the read-only "View original" swap if it was open — the
      // user just replaced the content; show them the editable result.
      setShowOriginal(false);
      await onSaved();
      // Offer a one-tap GoodSync follow-up. Only show the action when
      // the track is eligible (master uploaded + not instrumental);
      // otherwise the alignment route returns 400 and the toast button
      // would just look broken.
      const canGoodSync = !!song.audioUrl && !song.instrumental;
      toast({
        title: `Imported lyrics · ${data.charCount} chars`,
        description: data.filename
          ? `From ${data.filename}. Existing GoodSync cues cleared.`
          : "Existing GoodSync cues cleared.",
        action: canGoodSync ? (
          <ToastAction
            altText="GoodSync these lyrics now"
            onClick={() => {
              // Guard against double-tap — alignMut takes several seconds
              // (ElevenLabs forced alignment) and the toast stays
              // dismissible for the duration.
              if (!alignMut.isPending) alignMut.mutate();
            }}
          >
            GoodSync now
          </ToastAction>
        ) : undefined,
      });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't import lyrics",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  // LRCLIB lookup — free, no key. Pulls plain + synced lyrics from
  // https://lrclib.net for tracks the artist didn't supply lyrics for.
  // On success: replaces draft lyrics and lights up GoodSync cues if
  // the LRC was available.
  const fetchLrclibMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/admin/songs/${song.id}/fetch-lyrics-from-lrclib`,
        {},
      );
      if (!res.ok) {
        const msg = await res
          .json()
          .then((b: any) => b?.message)
          .catch(() => null);
        throw new Error(msg || `Couldn't fetch (HTTP ${res.status})`);
      }
      return (await res.json()) as {
        song: { lyrics: string };
        source: "LRCLIB" | "GENIUS";
        hasSynced: boolean;
        cueCount: number;
        charCount: number;
      };
    },
    onSuccess: async (data) => {
      const next = data.song.lyrics ?? "";
      originalRef.current = next;
      setDraft(cleanLyricsForEditor(next));
      userEditedRef.current = false;
      // Same reset as the upload path: a fresh fetch replaces the
      // content, so flip back to the editable view automatically.
      setShowOriginal(false);
      await onSaved();
      // Toast copy varies by source. LRCLIB synced → highlights the
      // GoodSync-ready badge; LRCLIB plain → suggests Sync with audio;
      // Genius → mentions the source so the operator knows where the
      // text came from and that running GoodSync is the next step.
      const fromGenius = data.source === "GENIUS";
      toast({
        title: data.hasSynced
          ? `Lyrics fetched · GoodSync ready (${data.cueCount} lines)`
          : `Lyrics fetched · ${data.charCount} chars`,
        description: data.hasSynced
          ? "Synced timestamps from LRCLIB — open the player to scroll-test."
          : fromGenius
            ? "Plain lyrics from Genius. Run \u201CSync with audio\u201D to add timestamps."
            : "Plain lyrics from LRCLIB. Run \u201CSync with audio\u201D to add timestamps.",
      });
    },
    onError: (e: any) =>
      toast({
        title: "No lyrics found online",
        description:
          e?.message ||
          "LRCLIB and Genius both came back empty. Try Upload or Paste URL.",
        variant: "destructive",
      }),
  });

  const handleLyricFile = (f: File) => {
    if (!/\.(pdf|docx?|txt)$/i.test(f.name)) {
      toast({
        title: "Unsupported file",
        description: "Use a .pdf, .docx, or .txt file.",
        variant: "destructive",
      });
      return;
    }
    uploadLyricMut.mutate({ file: f });
  };

  const lineCount = draft ? draft.split("\n").length : 0;

  return (
    <div
      className="px-5 pt-3 pb-4"
      onKeyDown={(e) => {
        // Escape closes the editor. Save shortcut is unnecessary —
        // we autosave 800ms after typing stops.
        if (e.key === "Escape" && !saveMut.isPending) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-4 space-y-2.5">
        {/* Two-column layout: typed Words on the left, GoodSync™ on
            the right (Bill's spec). On narrow viewports they stack so
            admin-on-mobile still works. The outer ExpandedPanel header
            already announces "Lyrics" globally — we call the left pane
            "Plain" inside so the two siblings ("Plain" / "GoodSync™")
            each have a unique label and the section title doesn't
            duplicate itself. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT — typed words (a.k.a. the master lyric text) */}
          <div className="flex flex-col gap-2 min-w-0">
            {/* Header row is locked to h-7 so it matches the GoodSync™
                header (which carries a taller "Sync with audio" pill).
                Without this, the right box starts ~6px lower than the
                left and the two panes don't visually align. */}
            <div className="flex items-center justify-between gap-2 h-7">
              <div className="flex items-center gap-1.5 min-w-0">
                <h4 className="text-[13px] font-semibold text-slate-800">
                  Editable Lyrics
                </h4>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      title="What is Editable Lyrics?"
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/40"
                      data-testid={`button-editable-lyrics-info-${song.id}`}
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="start"
                    className="w-72 text-[12px] leading-relaxed bg-white border border-slate-200 shadow-lg text-slate-700"
                  >
                    <p className="font-semibold text-slate-900 mb-1.5">
                      Editable Lyrics
                    </p>
                    <p className="text-slate-700">
                      A cleaned-up copy of the typed lyrics — section
                      labels like <span className="font-mono text-[11px]">V1</span>,
                      {" "}<span className="font-mono text-[11px]">PRE1</span>,
                      {" "}<span className="font-mono text-[11px]">CHORUS</span> and
                      decorative marks are stripped so it reads like a
                      fan would see it.
                    </p>
                    <p className="text-slate-500 mt-2 text-[11px]">
                      Your original paste is preserved — tap{" "}
                      <span className="font-medium text-slate-700">View original</span>{" "}
                      to see it.
                    </p>
                  </PopoverContent>
                </Popover>
              </div>
              {/* Collapsed into a single "Lyric options" dropdown so the
                  toolbar stays readable on narrow breakpoints. The
                  individual actions used to wrap and crowd the header
                  against the GoodSync™ pane. */}
              {!song.instrumental && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="inline-flex items-center gap-1 text-[10.5px] text-[var(--brand-blue)] hover:text-[var(--brand-blue)]/80 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/40 rounded data-[state=open]:underline disabled:opacity-50 flex-shrink-0"
                    disabled={uploadLyricMut.isPending || fetchLrclibMut.isPending}
                    data-testid={`button-lyric-options-${song.id}`}
                    aria-label="Lyric options"
                  >
                    {fetchLrclibMut.isPending
                      ? "Looking up…"
                      : uploadLyricMut.isPending
                        ? "Importing…"
                        : "Lyric options"}
                    <ChevronDown className="w-3 h-3 -mr-0.5 text-[var(--brand-blue)]/70" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={6}
                    className="min-w-[220px] p-1.5 bg-white text-slate-900 border border-slate-200 shadow-lg"
                  >
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        fetchLrclibMut.mutate();
                      }}
                      disabled={fetchLrclibMut.isPending || uploadLyricMut.isPending}
                      data-testid={`menu-fetch-lrclib-${song.id}`}
                      className="gap-2 px-2.5 py-2 text-[12.5px] cursor-pointer focus:bg-slate-100 data-[disabled]:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-slate-500" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900">Find lyrics</div>
                        <div className="text-[11px] text-slate-500">
                          Look up LRCLIB by title · artist · album.
                        </div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        lyricFileInputRef.current?.click();
                      }}
                      disabled={uploadLyricMut.isPending || fetchLrclibMut.isPending}
                      data-testid={`menu-upload-lyric-file-${song.id}`}
                      className="gap-2 px-2.5 py-2 text-[12.5px] cursor-pointer focus:bg-slate-100 data-[disabled]:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-500" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900">Upload file</div>
                        <div className="text-[11px] text-slate-500">
                          .pdf, .docx, or .txt — replaces these lyrics.
                        </div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setShowUrlInput((v) => !v);
                      }}
                      disabled={uploadLyricMut.isPending || fetchLrclibMut.isPending}
                      data-testid={`menu-paste-lyric-url-${song.id}`}
                      className="gap-2 px-2.5 py-2 text-[12.5px] cursor-pointer focus:bg-slate-100 data-[disabled]:opacity-50"
                    >
                      <Link2 className="w-3.5 h-3.5 text-slate-500" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900">Paste URL</div>
                        <div className="text-[11px] text-slate-500">
                          Dropbox link or any direct .pdf / .docx / .txt.
                        </div>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Hidden file input drives the Upload button + drag-and-drop
                wrapper below. Accepts the same extensions as the
                folder-import path. */}
            <input
              ref={lyricFileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleLyricFile(f);
                e.target.value = "";
              }}
              data-testid={`input-lyric-file-${song.id}`}
            />

            {/* Inline URL input — only visible when the writer clicks
                "Paste URL". Submits on Enter or the inline arrow. */}
            {showUrlInput && !song.instrumental && (
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
                <Link2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <input
                  type="url"
                  value={lyricUrl}
                  onChange={(e) => setLyricUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && lyricUrl.trim() && !uploadLyricMut.isPending && !fetchLrclibMut.isPending) {
                      e.preventDefault();
                      uploadLyricMut.mutate({ url: lyricUrl.trim() });
                    } else if (e.key === "Escape") {
                      setShowUrlInput(false);
                    }
                  }}
                  placeholder="https://www.dropbox.com/scl/fi/…?dl=1"
                  className="flex-1 min-w-0 text-[12px] bg-transparent outline-none placeholder:text-slate-400 text-slate-800"
                  autoFocus
                  disabled={uploadLyricMut.isPending || fetchLrclibMut.isPending}
                  data-testid={`input-lyric-url-${song.id}`}
                />
                <button
                  type="button"
                  onClick={() =>
                    lyricUrl.trim() && uploadLyricMut.mutate({ url: lyricUrl.trim() })
                  }
                  disabled={!lyricUrl.trim() || uploadLyricMut.isPending || fetchLrclibMut.isPending}
                  className="text-[11px] font-semibold text-[var(--brand-blue)] hover:underline disabled:opacity-40"
                  data-testid={`button-fetch-lyric-url-${song.id}`}
                >
                  {uploadLyricMut.isPending ? "Fetching…" : "Fetch"}
                </button>
              </div>
            )}

            {song.instrumental ? (
              <div
                className="rounded-md bg-white border border-slate-200 px-3 py-3 text-[12px] text-slate-600 flex items-start gap-2 min-h-[280px]"
                data-testid={`text-lyrics-disabled-${song.id}`}
              >
                <Ban className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                <span>
                  This track is marked{" "}
                  <span className="font-semibold">Instrumental</span> in
                  the Master editor — lyrics aren't applicable. Uncheck
                  Instrumental on the master to add lyrics.
                </span>
              </div>
            ) : (
              <div
                className="relative"
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  // Only clear when leaving the wrapper itself, not the
                  // textarea inside it.
                  if (e.currentTarget === e.target) setDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleLyricFile(f);
                }}
                data-testid={`dropzone-lyric-${song.id}`}
              >
                {showOriginal ? (
                  // Read-only swap-in of the artist's raw paste (with V1
                  // / PRE1 / CHORUS x2 / etc.) — toggled from the
                  // bottom-row "View original" link. Sits in the same
                  // box as the textarea so the editable draft is never
                  // overwritten or hidden mid-edit.
                  <pre
                    className="w-full h-[200px] overflow-y-auto rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-[12.5px] leading-relaxed text-slate-700 font-mono whitespace-pre-wrap"
                    data-testid={`text-original-lyrics-${song.id}`}
                  >
                    {originalRef.current || "(empty)"}
                  </pre>
                ) : (
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => {
                      userEditedRef.current = true;
                      setDraft(e.target.value);
                    }}
                    rows={8}
                    placeholder={
                      "V1\nFirst line of the verse\nSecond line of the verse\n\nCHORUS\nFirst line of the chorus\n\n— or drop a .pdf / .docx / .txt here —"
                    }
                    className="w-full h-[200px] rounded-md border border-slate-300 bg-white px-3 py-2 text-[12.5px] leading-relaxed text-slate-900 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
                    data-testid={`textarea-lyrics-${song.id}`}
                  />
                )}
                {/* Drag-over overlay — only visible while a file is
                    being dragged across the textarea. Sits above the
                    textarea so the drop target is unambiguous. */}
                {dragOver && (
                  <div className="pointer-events-none absolute inset-0 rounded-md border-2 border-dashed border-[var(--brand-blue)] bg-[var(--brand-blue)]/10 flex items-center justify-center text-[12px] font-semibold text-[var(--brand-blue)]">
                    Drop to import lyrics
                  </div>
                )}
                {/* Spinner overlay while the upload/extract is in
                    flight — gives the writer obvious feedback that
                    something is happening. */}
                {uploadLyricMut.isPending && (
                  <div className="pointer-events-none absolute inset-0 rounded-md bg-white/70 flex items-center justify-center gap-2 text-[12px] text-slate-600">
                    <Spinner className="w-4 h-4 animate-spin text-[var(--brand-blue)]" />
                    Importing lyrics…
                  </div>
                )}
              </div>
            )}
            {/* Bottom row: "View original" toggle pinned far-left, line
                count pinned far-right. Toggle swaps the editor pane for
                a read-only view of the original paste so the writer can
                compare without fear of overwriting their edits. */}
            <div className="flex items-center justify-between h-4">
              {!song.instrumental &&
              (showOriginal ||
                (originalRef.current && originalRef.current !== draft)) ? (
                <button
                  type="button"
                  onClick={() => setShowOriginal((v) => !v)}
                  aria-pressed={showOriginal}
                  className="text-[10.5px] text-[var(--brand-blue)] hover:text-[var(--brand-blue)]/80 hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/40 rounded inline-flex items-center gap-1"
                  data-testid={`button-view-original-lyrics-${song.id}`}
                >
                  <span
                    className={
                      "inline-block w-3.5 h-3.5 rounded-full border " +
                      (showOriginal
                        ? "bg-[var(--brand-blue)] border-[var(--brand-blue)]"
                        : "border-[var(--brand-blue)]/60 bg-white")
                    }
                    aria-hidden="true"
                  />
                  {showOriginal ? "Viewing original" : "View original"}
                </button>
              ) : (
                <span />
              )}
              {!song.instrumental && (
                <span
                  className="text-[10px] text-slate-400 tabular-nums"
                  data-testid={`text-lyrics-line-count-${song.id}`}
                >
                  {lineCount} {lineCount === 1 ? "line" : "lines"}
                </span>
              )}
            </div>
          </div>

          {/* RIGHT — GoodSync™ live preview */}
          <GoodSyncPanel
            song={song}
            draftLyrics={draft}
            onSyncWithAudio={() => alignMut.mutate()}
            syncing={alignMut.isPending}
            onSaved={onSaved}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Per-track synced lyrics editor (WebVTT) ──────────────────────── */

function SyncedLyricsEditor({
  song,
  onClose,
  onSaved,
}: {
  song: SongLite;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<{ timeMs: number; text: string }[] | null>(
    song.syncedLyrics ?? null,
  );
  const [rawText, setRawText] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autofocus the textarea on mount so the editor's own keydown handlers
  // (Escape to close) take effect immediately without an extra click.
  useEffect(() => {
    queueMicrotask(() => textareaRef.current?.focus());
  }, []);

  const cueCount = draft?.length ?? 0;
  const origCount = song.syncedLyrics?.length ?? 0;
  const dirty =
    JSON.stringify(draft ?? null) !== JSON.stringify(song.syncedLyrics ?? null);

  const parseAndSet = async (text: string, sourceLabel: string) => {
    setLocalError(null);
    setParsing(true);
    try {
      const { parseVtt } = await import("@/lib/vttParser");
      const cues = parseVtt(text);
      if (cues.length === 0) {
        setLocalError(
          `No cues found in ${sourceLabel}. Make sure it's a WebVTT file (header line "WEBVTT" + cues like "00:00:12.000 --> 00:00:15.000").`,
        );
        return;
      }
      setDraft(cues);
    } catch (e: any) {
      setLocalError(e?.message || `Couldn't parse ${sourceLabel}.`);
    } finally {
      setParsing(false);
    }
  };

  const handleFile = async (f: File) => {
    setLocalError(null);
    if (!/\.vtt$/i.test(f.name) && f.type && f.type !== "text/vtt") {
      setLocalError("That doesn't look like a .vtt file.");
      return;
    }
    try {
      const text = await f.text();
      setRawText(text);
      await parseAndSet(text, "the file");
    } catch (e: any) {
      setLocalError(e?.message || "Couldn't read the file.");
    }
  };

  const saveMut = useMutation({
    mutationFn: async () =>
      apiRequest("PUT", `/api/admin/songs/${song.id}`, {
        syncedLyrics: draft && draft.length > 0 ? draft : null,
      }),
    onSuccess: async () => {
      await onSaved();
      toast({
        title:
          draft && draft.length > 0
            ? `Synced lyrics saved · ${draft.length} cue${draft.length === 1 ? "" : "s"}`
            : "Synced lyrics cleared",
      });
      onClose();
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save synced lyrics",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const fmtTimestamp = (ms: number) =>
    `${Math.floor(ms / 60000)
      .toString()
      .padStart(2, "0")}:${Math.floor((ms % 60000) / 1000)
      .toString()
      .padStart(2, "0")}.${(ms % 1000).toString().padStart(3, "0")}`;

  return (
    <div
      className="px-5 pb-4"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !parsing && !saveMut.isPending) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={[
          "rounded-xl border-2 border-dashed px-4 py-3 space-y-3 transition-colors",
          dragOver
            ? "border-[var(--brand-blue)] bg-[var(--brand-blue)]/10"
            : "border-slate-200 bg-slate-50/60",
        ].join(" ")}
        data-testid={`dropzone-vtt-${song.id}`}
      >
        <div className="flex items-center justify-end gap-2">
          <span className="text-[10.5px] text-slate-400 tabular-nums">
            {cueCount > 0 ? (
              <>
                {cueCount} cue{cueCount === 1 ? "" : "s"}
                {dirty && origCount !== cueCount && (
                  <span className="text-[var(--brand-blue)]">
                    {" "}
                    (was {origCount})
                  </span>
                )}
              </>
            ) : (
              "No cues yet"
            )}
            {parsing && (
              <span className="ml-1.5 text-slate-400 font-normal normal-case tracking-normal">
                · parsing…
              </span>
            )}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".vtt,text/vtt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
            data-testid={`input-vtt-file-${song.id}`}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={parsing || saveMut.isPending}
            className="text-[12px] text-[var(--brand-blue)] hover:underline disabled:opacity-40 font-semibold"
            data-testid={`button-choose-vtt-${song.id}`}
          >
            {cueCount > 0 ? "Replace .vtt" : "Upload .vtt"}
          </button>
          {cueCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setRawText("");
                setLocalError(null);
              }}
              disabled={parsing || saveMut.isPending}
              className="text-[12px] text-slate-500 hover:text-slate-700 hover:underline disabled:opacity-40"
              data-testid={`button-clear-vtt-${song.id}`}
            >
              Clear
            </button>
          )}
        </div>

        <textarea
          ref={textareaRef}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          onBlur={() => {
            // parseVtt tolerates a missing WEBVTT header, so attempt to
            // parse anything non-empty and let the parser decide.
            if (rawText.trim()) {
              parseAndSet(rawText, "the pasted text");
            }
          }}
          rows={4}
          placeholder={
            "Or paste WebVTT text here:\nWEBVTT\n\n00:00:12.000 --> 00:00:15.500\nFirst line of lyric"
          }
          disabled={parsing || saveMut.isPending}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[11.5px] leading-relaxed text-slate-900 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent disabled:opacity-50"
          data-testid={`textarea-vtt-raw-${song.id}`}
        />

        {draft && draft.length > 0 ? (
          <div className="rounded-md bg-white border border-slate-200 px-3 py-2">
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">
              Preview · first {Math.min(draft.length, 5)} cue
              {Math.min(draft.length, 5) === 1 ? "" : "s"}
            </div>
            <ul
              className="text-[11.5px] font-mono text-slate-700 space-y-0.5"
              data-testid={`list-vtt-preview-${song.id}`}
            >
              {draft.slice(0, 5).map((c, i) => (
                <li key={i} className="flex gap-2 items-baseline">
                  <span className="text-slate-400 tabular-nums flex-shrink-0">
                    {fmtTimestamp(c.timeMs)}
                  </span>
                  <span className="truncate">{c.text}</span>
                </li>
              ))}
              {draft.length > 5 && (
                <li className="text-slate-400 italic">
                  + {draft.length - 5} more cue{draft.length - 5 === 1 ? "" : "s"}…
                </li>
              )}
            </ul>
          </div>
        ) : (
          <p className="text-[10.5px] text-slate-400 leading-snug">
            No file loaded. The player will fall back to even auto-distributed
            timing across the song's duration.
          </p>
        )}

        {localError && (
          <p
            className="text-[11px] text-rose-600"
            data-testid={`text-vtt-error-${song.id}`}
          >
            {localError}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={parsing || saveMut.isPending}
            className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-600 text-[11.5px] font-semibold hover:bg-slate-50 disabled:opacity-50"
            data-testid={`button-cancel-vtt-${song.id}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={!dirty || parsing || saveMut.isPending}
            className="px-3 h-8 rounded-md bg-[var(--brand-blue)] text-white text-[11.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1.5"
            data-testid={`button-save-vtt-${song.id}`}
          >
            {saveMut.isPending && (
              <Spinner className="w-3.5 h-3.5 animate-spin" />
            )}
            Save sync
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Per-track credits editor (inline add / edit / delete) ─────────── */

function CreditsEditor({
  songId,
  albumId,
  credits,
  onClose,
}: {
  songId: string;
  albumId: string;
  credits: SongCreditsLite | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: people = [] } = useQuery<AdminPersonLite[]>({
    queryKey: ["/api/people"],
  });
  const { data: instruments = [] } = useQuery<AdminInstrumentLite[]>({
    queryKey: ["/api/instruments"],
  });
  const { data: roles = [] } = useQuery<AdminCreditRole[]>({
    queryKey: ["/api/admin/credit-roles"],
  });
  const [adding, setAdding] = useState<null | "writer" | "performer">(null);

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: ["/api/albums", albumId, "credits"],
    });

  const writers = credits?.writers ?? [];
  const performers = credits?.performers ?? [];
  const total = writers.length + performers.length;

  return (
    <div
      className="px-5 pb-4"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !adding) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 space-y-3">
        {/* ExpandedPanel already shows the Credits icon + "Credits"
            label at the top. We keep just the quiet stats line on
            the right. */}
        {total > 0 && (
          <div className="flex items-center justify-end">
            <span className="text-[10.5px] text-slate-400">
              {writers.length} writer{writers.length === 1 ? "" : "s"} ·{" "}
              {performers.length} performer
              {performers.length === 1 ? "" : "s"}
            </span>
          </div>
        )}

        {total === 0 && !adding && (
          <p className="text-[12px] text-slate-500 leading-snug">
            No credits on this track yet. Add writers (composer / lyricist /
            producer) and performers (with the specific instrument used on
            this track) to enable the SuperCredits badge.
          </p>
        )}

        {writers.length > 0 && (
          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">
              Writers
            </div>
            <ul className="space-y-1" data-testid="list-credits-writers">
              {writers.map((w) => (
                <CreditRowItem
                  key={`writer-${w.id}`}
                  kind="writer"
                  row={w}
                  songId={songId}
                  people={people}
                  instruments={instruments}
                  roles={roles}
                  onInvalidate={invalidate}
                />
              ))}
            </ul>
          </div>
        )}
        {performers.length > 0 && (
          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">
              Performers
            </div>
            <ul className="space-y-1" data-testid="list-credits-performers">
              {performers.map((p) => (
                <CreditRowItem
                  key={`performer-${p.id}`}
                  kind="performer"
                  row={p}
                  songId={songId}
                  people={people}
                  instruments={instruments}
                  roles={roles}
                  onInvalidate={invalidate}
                />
              ))}
            </ul>
          </div>
        )}

        {adding && (
          <AddCreditForm
            kind={adding}
            songId={songId}
            people={people}
            instruments={instruments}
            roles={roles}
            onCancel={() => setAdding(null)}
            onSaved={async () => {
              await invalidate();
              setAdding(null);
            }}
          />
        )}

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAdding("writer")}
              disabled={!!adding}
              className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-700 text-[11.5px] font-semibold hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1"
              data-testid="button-add-writer"
            >
              <Plus className="w-3 h-3" />
              Writer
            </button>
            <button
              type="button"
              onClick={() => setAdding("performer")}
              disabled={!!adding}
              className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-700 text-[11.5px] font-semibold hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1"
              data-testid="button-add-performer"
            >
              <Plus className="w-3 h-3" />
              Performer
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 h-8 rounded-md bg-white border border-slate-200 text-slate-600 text-[11.5px] font-semibold hover:bg-slate-50"
            data-testid="button-close-credits"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

type WriterRow = SongCreditsLite["writers"][number];
type PerformerRow = SongCreditsLite["performers"][number];

function CreditRowItem({
  kind,
  row,
  songId,
  people,
  instruments,
  roles,
  onInvalidate,
}: {
  kind: "writer" | "performer";
  row: WriterRow | PerformerRow;
  songId: string;
  people: AdminPersonLite[];
  instruments: AdminInstrumentLite[];
  roles: AdminCreditRole[];
  onInvalidate: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);

  // Edit-mode draft (one piece of state, anti-clobber resync on entry).
  const [eKind, setEKind] = useState<"writer" | "performer">(kind);
  const [personId, setPersonId] = useState<string | null>(row.personId);
  const [name, setName] = useState<string>(row.name);
  const [role, setRole] = useState<string>(row.role);
  const [instrumentId, setInstrumentId] = useState<string | null>(
    "instrumentId" in row ? row.instrumentId : null,
  );
  const [tuningNotes, setTuningNotes] = useState<string>(
    "tuningNotes" in row ? row.tuningNotes ?? "" : "",
  );
  const editPersonRef = useRef<HTMLSelectElement>(null);

  // Reset on entry to edit mode only — keeps a background refetch from
  // wiping in-progress edits. `row` intentionally NOT in deps.
  useEffect(() => {
    if (editing) {
      setEKind(kind);
      setPersonId(row.personId);
      setName(row.name);
      setRole(row.role);
      setInstrumentId("instrumentId" in row ? row.instrumentId : null);
      setTuningNotes("tuningNotes" in row ? row.tuningNotes ?? "" : "");
      // Move focus into the row so the editor's own Escape handler is
      // active immediately and keyboard users can start changing fields
      // without an extra click.
      queueMicrotask(() => editPersonRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const save = useMutation({
    mutationFn: async () => {
      const sameKind = eKind === kind;
      const trimmedTuning = tuningNotes.trim() || null;
      const effectiveName = (() => {
        if (personId) {
          const p = people.find((pp) => pp.id === personId);
          return p?.name ?? name;
        }
        return name;
      })();
      if (sameKind) {
        const url =
          kind === "writer"
            ? `/api/admin/writers/${row.id}`
            : `/api/admin/performers/${row.id}`;
        const body: any = { personId, name: effectiveName, role };
        if (kind === "performer") {
          body.instrumentId = instrumentId;
          body.tuningNotes = trimmedTuning;
        }
        await apiRequest("PUT", url, body);
      } else {
        // Cross-kind flip — non-atomic on the server. Create on the new
        // table first, then delete the old row. If the delete fails we
        // roll back by deleting the row we just created so the user
        // never ends up with a duplicate credit.
        const createUrl =
          eKind === "writer"
            ? `/api/admin/songs/${songId}/writers`
            : `/api/admin/songs/${songId}/performers`;
        const createBody: any = {
          personId,
          name: effectiveName,
          role,
        };
        if (eKind === "performer") {
          createBody.instrumentId = instrumentId;
          createBody.tuningNotes = trimmedTuning;
        }
        const createRes = await apiRequest("POST", createUrl, createBody);
        const created = (await createRes.json()) as { id: string };
        const delUrl =
          kind === "writer"
            ? `/api/admin/writers/${row.id}`
            : `/api/admin/performers/${row.id}`;
        try {
          await apiRequest("DELETE", delUrl);
        } catch (e) {
          // Best-effort compensation: remove the row we just created so
          // we don't leave the track with duplicate credits. If the
          // rollback itself fails we surface the original error.
          const rollbackUrl =
            eKind === "writer"
              ? `/api/admin/writers/${created.id}`
              : `/api/admin/performers/${created.id}`;
          try {
            await apiRequest("DELETE", rollbackUrl);
          } catch {
            // Rollback failed too — surface the original delete error.
          }
          throw e;
        }
      }
    },
    onSuccess: async () => {
      // Feed the session-scoped recents store consumed by the rail in
      // the per-track AddPicker, the Gear "Credit a person" picker, and
      // the legacy /admin song-row credits sheet. Touching a credit
      // here counts as "just credited them" for that session.
      if (personId) {
        const p = people.find((pp) => pp.id === personId);
        if (p) {
          pushRecentPerson({
            id: p.id,
            name: p.name,
            photoUrl: p.photoUrl ?? null,
          });
        }
      }
      await onInvalidate();
      setEditing(false);
      toast({ title: "Credit saved" });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save credit",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const del = useMutation({
    mutationFn: async () => {
      const url =
        kind === "writer"
          ? `/api/admin/writers/${row.id}`
          : `/api/admin/performers/${row.id}`;
      await apiRequest("DELETE", url);
    },
    onSuccess: async () => {
      await onInvalidate();
      toast({ title: "Credit deleted" });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't delete credit",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  if (editing) {
    return (
      <li
        className="rounded-md bg-white border border-[var(--brand-blue)]/40 px-2.5 py-2 space-y-1.5"
        data-testid={`row-credit-edit-${row.id}`}
        onKeyDown={(e) => {
          // Escape cancels the row edit. Stop propagation so the parent
          // CreditsEditor doesn't also close the whole panel.
          if (e.key === "Escape" && !save.isPending) {
            e.preventDefault();
            e.stopPropagation();
            setEditing(false);
          }
        }}
      >
        <div className="grid grid-cols-[1fr_1fr] gap-1.5">
          <PersonSelect
            people={people}
            value={personId}
            onChange={(id) => {
              setPersonId(id);
              if (id) {
                const p = people.find((pp) => pp.id === id);
                if (p) setName(p.name);
              }
            }}
            selectRef={editPersonRef}
            testId={`select-person-${row.id}`}
          />
          <RoleSelect
            roles={roles}
            kind={eKind}
            role={role}
            onChange={(k, r) => {
              setEKind(k);
              setRole(r);
            }}
            testId={`select-role-${row.id}`}
          />
        </div>
        {eKind === "performer" && (
          <div className="grid grid-cols-[1fr_1fr] gap-1.5">
            <InstrumentSelect
              instruments={instruments}
              value={instrumentId}
              onChange={setInstrumentId}
              testId={`select-instrument-${row.id}`}
            />
            <input
              type="text"
              value={tuningNotes}
              onChange={(e) => setTuningNotes(e.target.value)}
              placeholder="Tuning / setup notes…"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[12px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
              data-testid={`input-tuning-${row.id}`}
            />
          </div>
        )}
        <div className="flex items-center justify-end gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={save.isPending}
            className="px-2 h-7 rounded-md bg-white border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-50"
            data-testid={`button-cancel-credit-${row.id}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || !role}
            className="px-2.5 h-7 rounded-md bg-[var(--brand-blue)] text-white text-[11px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1"
            data-testid={`button-save-credit-${row.id}`}
          >
            {save.isPending && <Spinner className="w-3 h-3 animate-spin" />}
            Save
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className="group flex items-center gap-2 text-[12.5px] hover:bg-slate-100/50 rounded px-1 py-0.5"
      data-testid={`item-credit-${kind}-${row.id}`}
    >
      <PersonAvatar
        name={row.person?.name ?? row.name}
        photoUrl={row.person?.photoUrl ?? null}
      />
      <span className="text-slate-900 font-medium truncate flex-shrink-0">
        {row.person?.name ?? row.name}
      </span>
      <span className="text-slate-400">·</span>
      <span className="text-slate-500 truncate">{row.role}</span>
      {kind === "performer" && (row as PerformerRow).instrument && (
        <>
          <span className="text-slate-300">on</span>
          <span className="text-slate-700 truncate">
            {(row as PerformerRow).instrument!.name}
          </span>
        </>
      )}
      {kind === "performer" && (row as PerformerRow).tuningNotes && (
        <span className="text-slate-400 italic truncate">
          ({(row as PerformerRow).tuningNotes})
        </span>
      )}
      <span className="flex-1" />
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit credit"
          title="Edit"
          className="w-6 h-6 rounded text-slate-400 hover:bg-slate-200 hover:text-slate-900 inline-flex items-center justify-center"
          data-testid={`button-edit-credit-${row.id}`}
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                `Delete this credit (${row.person?.name ?? row.name} · ${row.role})?`,
              )
            ) {
              del.mutate();
            }
          }}
          disabled={del.isPending}
          aria-label="Delete credit"
          title="Delete"
          className="w-6 h-6 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 inline-flex items-center justify-center disabled:opacity-50"
          data-testid={`button-delete-credit-${row.id}`}
        >
          {del.isPending ? (
            <Spinner className="w-3 h-3 animate-spin" />
          ) : (
            <Trash2 className="w-3 h-3" />
          )}
        </button>
      </div>
    </li>
  );
}

function AddCreditForm({
  kind,
  songId,
  people,
  instruments,
  roles,
  onCancel,
  onSaved,
}: {
  kind: "writer" | "performer";
  songId: string;
  people: AdminPersonLite[];
  instruments: AdminInstrumentLite[];
  roles: AdminCreditRole[];
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const defaultRole =
    roles.find((r) => r.kind === kind)?.name ??
    (kind === "writer" ? "Composer" : "Performer");
  const [personId, setPersonId] = useState<string | null>(null);
  const [role, setRole] = useState<string>(defaultRole);
  const [instrumentId, setInstrumentId] = useState<string | null>(null);
  const [tuningNotes, setTuningNotes] = useState<string>("");

  const personSelectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    queueMicrotask(() => personSelectRef.current?.focus());
  }, []);

  const create = useMutation({
    mutationFn: async () => {
      const url =
        kind === "writer"
          ? `/api/admin/songs/${songId}/writers`
          : `/api/admin/songs/${songId}/performers`;
      const person = personId ? people.find((p) => p.id === personId) : null;
      const body: any = {
        personId,
        name: person?.name ?? "",
        role,
      };
      if (kind === "performer") {
        body.instrumentId = instrumentId;
        body.tuningNotes = tuningNotes.trim() || null;
      }
      await apiRequest("POST", url, body);
    },
    onSuccess: async () => {
      // See EditCreditRow.save — same rail-feeding rationale.
      if (personId) {
        const p = people.find((pp) => pp.id === personId);
        if (p) {
          pushRecentPerson({
            id: p.id,
            name: p.name,
            photoUrl: p.photoUrl ?? null,
          });
        }
      }
      await onSaved();
      toast({ title: `${kind === "writer" ? "Writer" : "Performer"} added` });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't add credit",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  return (
    <div
      className="rounded-md bg-white border border-[var(--brand-blue)]/40 px-2.5 py-2 space-y-1.5"
      data-testid={`form-add-credit-${kind}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !create.isPending) {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--brand-blue)]">
        Add {kind}
      </div>
      <div className="grid grid-cols-[1fr_1fr] gap-1.5">
        <PersonSelect
          people={people}
          value={personId}
          onChange={setPersonId}
          selectRef={personSelectRef}
          testId={`select-person-new-${kind}`}
        />
        <RoleSelect
          roles={roles}
          kind={kind}
          role={role}
          onChange={(_, r) => setRole(r)}
          lockKind
          testId={`select-role-new-${kind}`}
        />
      </div>
      {kind === "performer" && (
        <div className="grid grid-cols-[1fr_1fr] gap-1.5">
          <InstrumentSelect
            instruments={instruments}
            value={instrumentId}
            onChange={setInstrumentId}
            testId={`select-instrument-new-${kind}`}
          />
          <input
            type="text"
            value={tuningNotes}
            onChange={(e) => setTuningNotes(e.target.value)}
            placeholder="Tuning / setup notes…"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[12px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
            data-testid={`input-tuning-new-${kind}`}
          />
        </div>
      )}
      <div className="flex items-center justify-end gap-1.5 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={create.isPending}
          className="px-2 h-7 rounded-md bg-white border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-50"
          data-testid={`button-cancel-add-${kind}`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending || !personId || !role}
          className="px-2.5 h-7 rounded-md bg-[var(--brand-blue)] text-white text-[11px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1"
          data-testid={`button-save-add-${kind}`}
        >
          {create.isPending && <Spinner className="w-3 h-3 animate-spin" />}
          Add
        </button>
      </div>
    </div>
  );
}

/* ─── Credit pickers (simple selects backed by /api/people, /api/instruments,
       /api/admin/credit-roles). Searchable comboboxes + inline-create
       live in classic admin — admins can add people / instruments there
       and they appear here on next refetch.

       Intentionally NOT wired to the shared `RecentsRail` /
       `usePersonCreditRecents` pattern: these are native `<select>`s,
       not search-driven comboboxes. The rail's contract — "rail on
       empty state, dropdown only when typing" — only makes sense for a
       text-input picker. A native select already shows the full list
       on tap; layering a rail on top would just add noise. The save
       handlers above DO push to the recents store so the rail in the
       per-track AddPicker still benefits when admins use this surface. */

function PersonSelect({
  people,
  value,
  onChange,
  selectRef,
  testId,
}: {
  people: AdminPersonLite[];
  value: string | null;
  onChange: (id: string | null) => void;
  selectRef?: React.RefObject<HTMLSelectElement>;
  testId?: string;
}) {
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <select
      ref={selectRef}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[12px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
      data-testid={testId}
    >
      <option value="">— Pick a person —</option>
      {sorted.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

function InstrumentSelect({
  instruments,
  value,
  onChange,
  testId,
}: {
  instruments: AdminInstrumentLite[];
  value: string | null;
  onChange: (id: string | null) => void;
  testId?: string;
}) {
  const sorted = [...instruments].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[12px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
      data-testid={testId}
    >
      <option value="">— No gear —</option>
      {sorted.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
        </option>
      ))}
    </select>
  );
}

function RoleSelect({
  roles,
  kind,
  role,
  onChange,
  lockKind = false,
  testId,
}: {
  roles: AdminCreditRole[];
  kind: "writer" | "performer";
  role: string;
  onChange: (kind: "writer" | "performer", role: string) => void;
  lockKind?: boolean;
  testId?: string;
}) {
  const writerRoles = roles.filter((r) => r.kind === "writer");
  const performerRoles = roles.filter((r) => r.kind === "performer");
  // Encode as "kind:role" so flipping kinds via the same select works
  // without a second dropdown. The edit-row save path picks up the kind
  // change and triggers delete-then-create on the server.
  const value = `${kind}:${role}`;
  return (
    <select
      value={value}
      onChange={(e) => {
        const [k, ...rest] = e.target.value.split(":");
        onChange(k as "writer" | "performer", rest.join(":"));
      }}
      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[12px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
      data-testid={testId}
    >
      {(lockKind ? kind === "writer" : true) && writerRoles.length > 0 && (
        <optgroup label="Writer">
          {writerRoles.map((r) => (
            <option key={r.id} value={`writer:${r.name}`}>
              {r.name}
            </option>
          ))}
        </optgroup>
      )}
      {(lockKind ? kind === "performer" : true) && performerRoles.length > 0 && (
        <optgroup label="Performer">
          {performerRoles.map((r) => (
            <option key={r.id} value={`performer:${r.name}`}>
              {r.name}
            </option>
          ))}
        </optgroup>
      )}
      {/* Always include the current role even if it's not in the canonical
          list (legacy data, custom role added via classic admin, etc.). */}
      {!roles.some((r) => r.kind === kind && r.name === role) && role && (
        <option value={value}>{role}</option>
      )}
    </select>
  );
}

function PersonAvatar({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl: string | null;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className="w-5 h-5 rounded-full object-cover flex-shrink-0 bg-slate-200"
      />
    );
  }
  return (
    <span className="w-5 h-5 rounded-full bg-[var(--brand-blue)]/15 text-[var(--brand-blue)] text-[10px] font-bold inline-flex items-center justify-center flex-shrink-0">
      {initial}
    </span>
  );
}

/* ─── Preview window editor (v0 of the GoodTunes Preview Slider™) ─────
   30-second in-app preview. Two paths today:
     · Auto (default) → first 30s of the master · Preview dot is green
     · Custom         → admin typed a start MM:SS · Preview dot is gold

   This is the typed-input precursor to the visual slider. Same data
   path: `previewStartMs` + `previewEndMs` on the song row. When the
   waveform slider lands it will replace this MM:SS input and write to
   the same two fields, so the gold-disc + dot meter already work.
   ──────────────────────────────────────────────────────────────────── */

function formatTimeMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseTimeStr(s: string): number | null {
  // Forgiving M:S / M:SS / MM:SS. Single-digit seconds (e.g. "1:5")
  // is accepted and treated as "1:05" — admins type fast.
  const m = s.trim().match(/^(\d{1,3}):(\d{1,2})$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  if (!Number.isFinite(min) || !Number.isFinite(sec) || sec >= 60) return null;
  return (min * 60 + sec) * 1000;
}

/* Quiet "Reset" link that portals into the surrounding ExpandedPanel's
   header slot (just left of the collapse chevron). When the panel
   isn't an ancestor (e.g. PreviewTrim nested under the Master editor),
   `headerSlot` is null and nothing renders — caller can fall back to
   an inline button if needed. */
function PreviewResetAction({
  visible,
  disabled,
  onReset,
  testId,
}: {
  visible: boolean;
  disabled: boolean;
  onReset: () => void;
  testId: string;
}) {
  const headerSlot = useContext(ExpandedPanelHeaderSlotContext);
  if (!visible || !headerSlot) return null;
  return createPortal(
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onReset();
      }}
      disabled={disabled}
      title="Reset to auto-pick (first 30 seconds)"
      className="text-[11px] text-slate-500 hover:text-slate-700 hover:underline font-medium disabled:opacity-40 px-1.5 py-0.5 rounded"
      data-testid={testId}
    >
      Reset
    </button>,
    headerSlot,
  );
}

/* ─── Pinpoint Lyrics — jump-to-cue picker for the preview window ─────
   Only shown when a track has GoodSync™ cues. Opens a popover with a
   search field + scrollable cue list. Picking a line moves the preview
   window so it starts at that cue (and unlocks the window so the move
   takes effect visually). Apple-style "find the hook line" instead of
   dragging through the waveform. */

function PinpointLyricsButton({
  cues,
  onPick,
  songId,
}: {
  cues: { timeMs: number; text: string }[];
  onPick: (timeSec: number) => void;
  songId: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Filter out section headers + empty lines from the picker, then
  // narrow by the search query. Headers are decoration in this mode —
  // there's nothing to "pinpoint to" on a [Chorus] marker.
  const filtered = cues
    .map((c, idx) => ({ ...c, idx }))
    .filter((c) => {
      const t = c.text.trim();
      if (!t) return false;
      if (/^\[.*\]$/.test(t)) return false;
      if (!query.trim()) return true;
      return t.toLowerCase().includes(query.trim().toLowerCase());
    });

  const q = query.trim();

  // Portals a small search icon into the ExpandedPanel header slot
  // (immediately to the LEFT of the existing "Reset" link). Click opens
  // the same Pinpoint search popover. When the panel isn't an ancestor
  // (e.g. nested mode), `headerSlot` is null and we render nothing —
  // the search icon only belongs in the header.
  const headerSlot = useContext(ExpandedPanelHeaderSlotContext);
  if (!headerSlot) return null;

  return createPortal(
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          title="Search lyrics — jump the preview window to a line"
          className="inline-flex items-center justify-center w-6 h-6 rounded-md text-slate-500 hover:text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/40"
          data-testid={`button-pinpoint-lyrics-${songId}`}
        >
          <Search className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-[380px] p-0 bg-white border-slate-200 text-slate-900"
      >
          <div className="px-3 pt-3 pb-2 border-b border-slate-100">
            <div className="flex items-baseline gap-1.5 mb-1.5">
              <span className="text-[12.5px] font-semibold text-slate-900">
                Search GoodSync<sup className="text-[8px] font-medium">™</sup>
              </span>
            </div>
            <p className="text-[11.5px] text-slate-500 mb-2 leading-snug">
              Search a word or scroll to a line — the preview window
              jumps to that moment.
            </p>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search lyrics…"
              autoFocus
              className="w-full h-8 rounded-md border border-slate-300 bg-white px-2.5 text-[12.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
              data-testid={`input-pinpoint-search-${songId}`}
            />
          </div>
          <div
            className="max-h-[280px] overflow-y-auto py-1"
            data-testid={`list-pinpoint-${songId}`}
          >
            {filtered.length === 0 ? (
              <p className="text-center text-[11.5px] text-slate-400 px-4 py-6">
                {q ? `No lines match "${q}".` : "No lyrics to pinpoint."}
              </p>
            ) : (
              filtered.map((cue) => {
                const sec = cue.timeMs / 1000;
                let body: React.ReactNode = cue.text;
                if (q) {
                  const lower = cue.text.toLowerCase();
                  const idx = lower.indexOf(q.toLowerCase());
                  if (idx >= 0) {
                    body = (
                      <>
                        {cue.text.slice(0, idx)}
                        <mark className="bg-[var(--brand-blue)]/20 text-slate-900 rounded px-0.5">
                          {cue.text.slice(idx, idx + q.length)}
                        </mark>
                        {cue.text.slice(idx + q.length)}
                      </>
                    );
                  }
                }
                return (
                  <button
                    key={cue.idx}
                    type="button"
                    onClick={() => {
                      onPick(sec);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="w-full flex items-baseline gap-3 px-3 py-1.5 hover:bg-slate-50 text-left"
                    data-testid={`button-pinpoint-cue-${songId}-${cue.idx}`}
                  >
                    <span className="text-[10.5px] tabular-nums text-slate-400 w-9 flex-shrink-0">
                      {fmt(sec)}
                    </span>
                    <span className="text-[12.5px] text-slate-700 leading-snug">
                      {body}
                    </span>
                  </button>
                );
              })
            )}
          </div>
      </PopoverContent>
    </Popover>,
    headerSlot,
  );
}

/* ─── Find the chorus — per-track on-demand chorus locator ───────────
   Portals a small wand into the ExpandedPanel header (left of the
   Pinpoint search). Runs the same two-tier resolver the GoodSync
   surfaces use: deterministic [Chorus] marker first, AI fallback for
   unlabeled lyrics. On a hit it moves + saves the preview window via
   the editor's `onFind`; on a miss it leaves the preview untouched and
   says so honestly. Only mounts when the track has GoodSync™ cues. */
function FindChorusButton({
  songId,
  onFind,
}: {
  songId: string;
  onFind: () => Promise<ChorusMethod | null>;
}) {
  const { toast } = useToast();
  const [finding, setFinding] = useState(false);
  const headerSlot = useContext(ExpandedPanelHeaderSlotContext);
  if (!headerSlot) return null;

  const run = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (finding) return;
    setFinding(true);
    try {
      const method = await onFind();
      if (method === "marker") {
        toast({
          title: "Chorus found",
          description: "Preview moved to the labeled chorus.",
        });
      } else if (method === "ai") {
        toast({
          title: "Chorus found by AI",
          description: "Preview moved to the detected chorus — give it a listen.",
        });
      } else {
        toast({
          title: "Couldn't find the chorus",
          description:
            "Preview left as-is — drag the window or pinpoint a line instead.",
        });
      }
    } finally {
      setFinding(false);
    }
  };

  return createPortal(
    <button
      type="button"
      onClick={run}
      disabled={finding}
      title="Find the chorus — move the preview to the hook"
      className="inline-flex items-center justify-center w-6 h-6 rounded-md text-slate-500 hover:text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/40 disabled:opacity-50"
      data-testid={`button-find-chorus-${songId}`}
    >
      {finding ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Wand2 className="w-3.5 h-3.5" />
      )}
    </button>,
    headerSlot,
  );
}

function RichPreviewEditor({
  song,
  onSaved,
}: {
  song: SongLite;
  onSaved: () => Promise<void>;
}) {
  // Rich waveform-driven editor — graduated from the Tracks-tab Interactive
  // mockup. Stable-height status row (icon + title + sub), draggable amber
  // window, ghost emerald box showing committed position while dirty,
  // floating editable start-time chip, padlock = save+lock when dirty /
  // toggle-lock when clean, revert icon throws the draft away.
  //
  // Now embedded inside an ExpandedPanel: no outer card chrome, no X,
  // no confirm sheet. Collapse is owned by the panel header and the
  // editor auto-saves on unmount if dirty (Apple Photos behavior).
  // Fed by the real `song.waveform` (200 peaks 0–1) we ship server-side
  // from ffmpeg, and the real `song.duration`.
  const { toast } = useToast();
  const qc = useQueryClient();

  const TOTAL_SEC = Math.max(30, song.duration ?? 240);
  const WINDOW_SEC = 30;
  const widthPct = (WINDOW_SEC / TOTAL_SEC) * 100;
  const maxLeftPct = 100 - widthPct;
  const hasCustom = song.previewStartMs != null;
  const initialPct = hasCustom
    ? Math.min(
        maxLeftPct,
        (song.previewStartMs! / 1000 / TOTAL_SEC) * 100,
      )
    : 0;

  const [committedLeft, setCommittedLeft] = useState(initialPct);
  const [draftLeft, setDraftLeft] = useState(initialPct);
  const [locked, setLocked] = useState(true);

  const wfRef = useRef<HTMLDivElement | null>(null);
  // Drag bookkeeping. `moved` distinguishes a true drag (audio scrub +
  // commit) from a quick tap on the nudge zones at the window edges.
  const dragRef = useRef<
    { startX: number; startLeft: number; moved: boolean } | null
  >(null);

  const isDirty = Math.abs(draftLeft - committedLeft) > 0.1;
  const draftSec = (draftLeft / 100) * TOTAL_SEC;
  const committedSec = (committedLeft / 100) * TOTAL_SEC;
  const fmt = (s: number) => {
    const total = Math.max(0, Math.round(s));
    const m = Math.floor(total / 60);
    const sec = total % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };
  const draftStartLabel = fmt(draftSec);
  const draftEndLabel = fmt(draftSec + WINDOW_SEC);
  const committedStartLabel = fmt(committedSec);
  const committedEndLabel = fmt(committedSec + WINDOW_SEC);

  // Nudge the window by `delta` seconds (clamped). Used by the left/right
  // tap zones inside the yellow window. Shift-modifier gives 0.1-sec
  // word-boundary precision.
  const nudgeSec = (delta: number) => {
    const next = Math.max(
      0,
      Math.min(TOTAL_SEC - WINDOW_SEC, draftSec + delta),
    );
    setDraftLeft((next / TOTAL_SEC) * 100);
  };

  // Real waveform peaks (200 values, 0..1). Fallback to a flat decorative
  // pattern for songs that haven't been generated yet (legacy rows pre-
  // ffmpeg-pipeline). 80 bars renders well at this size.
  const bars = (() => {
    const peaks = (song.waveform as number[] | null) ?? null;
    // 120 thin bars reads as a finer-grained waveform — matches Apple
    // Music's preview-editor density and the reference Bill pasted.
    const COUNT = 120;
    if (!peaks || peaks.length === 0) {
      return Array.from({ length: COUNT }, (_, i) =>
        Math.round(20 + 60 * Math.abs(Math.sin(i * 0.6) * Math.cos(i * 0.13))),
      );
    }
    // Downsample 200 → 80 by averaging buckets, then scale to 12–96% height.
    const out: number[] = [];
    const ratio = peaks.length / COUNT;
    for (let i = 0; i < COUNT; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.floor((i + 1) * ratio);
      let sum = 0;
      let n = 0;
      for (let j = start; j < end; j++) {
        sum += peaks[j] ?? 0;
        n++;
      }
      const avg = n > 0 ? sum / n : 0;
      out.push(Math.round(12 + 84 * Math.min(1, avg)));
    }
    return out;
  })();

  // Time-axis ticks — 5 evenly spaced labels across real duration.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => fmt(t * TOTAL_SEC));

  const saveMut = useMutation({
    mutationFn: async (next: { startMs: number; endMs: number } | null) =>
      apiRequest(
        "PUT",
        `/api/admin/songs/${song.id}`,
        next
          ? { previewStartMs: next.startMs, previewEndMs: next.endMs }
          : { previewStartMs: null, previewEndMs: null },
      ),
    onSuccess: async (_d, next) => {
      await qc.invalidateQueries({ queryKey: ["/api/albums"] });
      await onSaved();
      toast({
        title: next ? "Custom preview saved" : "Preview reset to auto",
      });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save the preview window",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const saveAndLock = () => {
    setCommittedLeft(draftLeft);
    setLocked(true);
    const startMs = Math.round(draftSec * 1000);
    if (startMs === 0) {
      saveMut.mutate(null);
    } else {
      saveMut.mutate({ startMs, endMs: startMs + 30000 });
    }
  };

  const revertDraft = () => setDraftLeft(committedLeft);

  const onPadlockClick = () => {
    if (isDirty) saveAndLock();
    else setLocked((v) => !v);
  };

  // No close button + no confirm sheet: this editor is now embedded
  // inside an ExpandedPanel whose header is the collapse trigger.
  // The padlock is the explicit save; revert is the explicit discard.
  //
  // Apple-Photos-style auto-save on collapse: if the admin drags the
  // window and then taps the panel header to close (which unmounts
  // this editor) without tapping padlock, we still commit the edit
  // for them. Two refs keep the cleanup effect free of dependencies
  // so it only fires on actual unmount, never on re-render.
  const dirtyRef = useRef(false);
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => {
    dirtyRef.current = isDirty;
    flushRef.current = () => {
      const startMs = Math.round(draftSec * 1000);
      if (startMs === 0) saveMut.mutate(null);
      else saveMut.mutate({ startMs, endMs: startMs + 30000 });
    };
  });
  useEffect(() => {
    return () => {
      if (dirtyRef.current) flushRef.current();
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (locked) return;
    dragRef.current = {
      startX: e.clientX,
      startLeft: draftLeft,
      moved: false,
    };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !wfRef.current) return;
    const rect = wfRef.current.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 3) dragRef.current.moved = true;
    const dxPct = (dx / rect.width) * 100;
    const next = Math.max(
      0,
      Math.min(maxLeftPct, dragRef.current.startLeft + dxPct),
    );
    setDraftLeft(next);

    // ── Scrubber audio ─────────────────────────────────────────────
    // While the artist is actively dragging the window, sync the
    // hidden <audio> element's currentTime to wherever the window's
    // start has landed and start playback. That gives them the same
    // "hear it as you move it" feel as Apple Music's preview editor
    // and Logic's marquee — much easier to dial a chorus in by ear
    // than by eye on the waveform alone.
    const audio = audioRef.current;
    if (audio && song.audioUrl && dragRef.current.moved) {
      const sec = (next / 100) * TOTAL_SEC;
      audio.currentTime = sec;
      if (audio.paused) {
        audio.play().then(() => setPlaying(true)).catch(() => {});
      }
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const ref = dragRef.current;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {}
    // End the scrub: pause so we don't run on past the chosen start.
    // (A subsequent tap of the Play button replays from the new spot.)
    if (ref?.moved) {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        audio.pause();
        setPlaying(false);
      }
    }
  };

  // ─── Window-scoped audio playback ──────────────────────────────────
  // A second, hidden <audio> element scoped to this editor. Plays the
  // master from draftSec, auto-stops at draftSec + 30s. If the artist
  // drags the window mid-playback, the next timeupdate snaps the
  // playhead back to the new draftSec so what they hear matches what
  // the window shows.
  //
  // Source selection goes through the shared admin-audio hook — same
  // Mux-HLS-first chain the dock uses, so 24-bit WAV / FLAC masters
  // that bare <audio src=…> would reject as "operation is not
  // supported" actually play here too.
  const {
    setAudio: setAudioEl,
    audio: audioEl,
    reason: audioReason,
  } = useAdminTrackAudioSource(song);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Mirror the hook's audio element into a ref so the existing
  // pointer-move scrub code (`audioRef.current.currentTime = …`) keeps
  // working without an effect-keyed wrapper.
  audioRef.current = audioEl;
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioEl;
    if (!audio || !playing) return;
    const onTime = () => {
      if (audio.currentTime >= draftSec + WINDOW_SEC) {
        audio.pause();
        audio.currentTime = draftSec;
        setPlaying(false);
      } else if (
        audio.currentTime < draftSec - 0.5 ||
        audio.currentTime > draftSec + WINDOW_SEC + 0.5
      ) {
        // Window was dragged out from under the playhead — snap back.
        audio.currentTime = draftSec;
      }
    };
    audio.addEventListener("timeupdate", onTime);
    return () => audio.removeEventListener("timeupdate", onTime);
  }, [playing, draftSec]);

  // Stop playback if the song's master URL changes or the component unmounts.
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, []);

  const togglePlay = () => {
    const audio = audioEl;
    if (!audio) {
      toast({
        title: "No master uploaded yet",
        description: "Add the audio file first, then preview-play will light up.",
        variant: "destructive",
      });
      return;
    }
    if (audioReason) {
      // Helper already picked the right reason — surface it verbatim
      // instead of the generic "operation is not supported" decode
      // error. `no-master` shouldn't fire here (button is wired even
      // without audio so we still toast), but it's covered by the
      // earlier branch above; encoding / sign-failed / unplayable get
      // the precise text from the helper.
      toast({
        title:
          audioReason.code === "encoding" || audioReason.code === "unplayable"
            ? "Master is still encoding"
            : "Couldn't play preview",
        description: audioReason.message,
        variant: "destructive",
      });
      return;
    }
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.currentTime = draftSec;
      audio
        .play()
        .then(() => setPlaying(true))
        .catch((err: any) => {
          toast({
            title: "Couldn't play preview",
            description: err?.message || "Browser blocked autoplay — try again.",
            variant: "destructive",
          });
        });
    }
  };

  return (
    <div
      data-testid={`preview-window-${song.id}`}
      className="relative space-y-3"
    >
      {/* Find the chorus — portals a wand into the header (LEFT of the
          Pinpoint search). Runs the two-tier resolver (labeled [Chorus]
          marker, then AI fallback) for this one track and, on a hit,
          moves + saves the preview window to the chorus start. */}
      {(song.syncedLyrics?.length ?? 0) > 0 && (
        <FindChorusButton
          songId={song.id}
          onFind={async () => {
            const found = await resolveChorusStartMs(
              song.id,
              song.lyrics ?? null,
              song.syncedLyrics ?? [],
            );
            if (found == null) return null;
            // Snap the window to the chorus, clamped to the track, then
            // persist exactly like a manual edit (start → +30s, with the
            // start-of-track === auto-pick null convention preserved).
            const startSec = Math.max(
              0,
              Math.min(TOTAL_SEC - WINDOW_SEC, found.startMs / 1000),
            );
            const nextLeft = (startSec / TOTAL_SEC) * 100;
            setLocked(true);
            setDraftLeft(nextLeft);
            setCommittedLeft(nextLeft);
            const startMs = Math.round(startSec * 1000);
            if (startMs === 0) saveMut.mutate(null);
            else saveMut.mutate({ startMs, endMs: startMs + 30000 });
            return found.method;
          }}
        />
      )}

      {/* Pinpoint Lyrics — portals a small search icon into the
          ExpandedPanel header (immediately LEFT of the Reset link
          below — portal order = DOM order). Click opens the search
          popover that jumps the preview window to a chosen line. */}
      {(song.syncedLyrics?.length ?? 0) > 0 && song.audioUrl && (
        <PinpointLyricsButton
          cues={song.syncedLyrics!}
          songId={song.id}
          onPick={(timeSec) => {
            const startSec = Math.max(
              0,
              Math.min(TOTAL_SEC - WINDOW_SEC, timeSec),
            );
            setLocked(false);
            setDraftLeft((startSec / TOTAL_SEC) * 100);
          }}
        />
      )}

      {/* Reset action — portals into the ExpandedPanel header slot
          (just left of the collapse chevron) so it sits at a stable
          position regardless of what mounts/unmounts in the editor
          body below. Visible only once the preview is unlocked AND a
          custom start time has been saved (Bill: "should just say
          'Reset' and only happen after you unlock"). */}
      <PreviewResetAction
        visible={!locked && hasCustom && committedLeft >= 0.5}
        disabled={saveMut.isPending}
        onReset={() => {
          setCommittedLeft(0);
          setDraftLeft(0);
          setLocked(true);
          saveMut.mutate(null);
        }}
        testId={`button-preview-reset-${song.id}`}
      />

      {/* Hidden window-scoped <audio> element — same master as the player,
          but its currentTime is constrained to [draftSec, draftSec + 30]. */}
      {/* preload="auto" so the master is buffered upfront — the Play
          button and the scrub-while-drag stay responsive instead of
          stalling on first interaction (Bill: "make the audio more
          responsive"). */}
      <audio
        ref={setAudioEl}
        preload="auto"
        className="hidden"
        data-testid={`audio-preview-${song.id}`}
      />
      {audioReason && audioReason.code !== "no-master" && (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          data-testid={`status-preview-audio-${song.id}`}
        >
          {audioReason.code === "encoding" || audioReason.code === "unplayable"
            ? "This master is still encoding — preview-play will light up once Mux finishes (usually under a minute)."
            : audioReason.message}
        </div>
      )}

      {/* Trim row: play · waveform · padlock — Apple iMovie pattern */}
      <div className="flex items-center gap-3 px-1">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={
            playing ? "Pause preview window" : "Play preview window"
          }
          title={
            playing
              ? "Pause preview"
              : `Play preview from ${draftStartLabel}`
          }
          className={[
            "w-11 h-11 rounded-full inline-flex items-center justify-center flex-shrink-0 transition-colors",
            playing
              ? "bg-[var(--brand-blue)] text-white hover:bg-[var(--brand-blue)]/90"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200",
          ].join(" ")}
          data-testid={`button-preview-play-${song.id}`}
        >
          {playing ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 translate-x-[1px] fill-current" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div
            ref={wfRef}
            className="relative h-20 rounded-md bg-slate-50 border border-slate-200 overflow-hidden touch-none select-none"
          >
            <div className="absolute inset-1 flex items-center justify-between gap-px">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 max-w-[3px] bg-slate-300 rounded-full"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>

            {/* Ghost — committed (live) window while dirty */}
            {isDirty && !locked && (
              <div
                aria-hidden
                className="absolute top-1 bottom-1 rounded-md border border-emerald-500/40 bg-emerald-500/5 pointer-events-none"
                style={{
                  left: `${committedLeft}%`,
                  width: `${widthPct}%`,
                }}
                title={`Fans currently hear ${
                  committedLeft < 0.5
                    ? "0:00–0:30"
                    : `${committedStartLabel}–${committedEndLabel}`
                }`}
              />
            )}

            {/* 30-sec window — draggable when unlocked.
                Inline start / end labels sit in the corners and stay
                readable against the amber/emerald tint. They update
                live while sliding so Bill can see the exact times
                without looking down at the axis or up at the chip. */}
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={[
                "absolute top-0 bottom-0 rounded-md border-2 transition-colors",
                locked
                  ? "border-emerald-500/70 bg-emerald-500/20 cursor-default"
                  : "border-amber-400 bg-amber-400/30 cursor-grab active:cursor-grabbing shadow-[0_0_0_3px_rgba(251,191,36,0.18)]",
              ].join(" ")}
              style={{ left: `${draftLeft}%`, width: `${widthPct}%` }}
              data-testid={`preview-window-handle-${song.id}`}
            >
              {/* Window content — start time top-left (big), end time
                  top-right (smaller, no leading arrow). Both nudge
                  chevrons live in a single bottom row at the SAME y
                  and SAME size, so they read as a matched pair rather
                  than staggered satellites of each label. The body
                  between them stays a clean drag handle. */}
              <div
                className={[
                  "absolute inset-0 pointer-events-none select-none",
                  locked ? "text-emerald-900/90" : "text-amber-900/95",
                ].join(" ")}
                data-testid={`label-preview-start-${song.id}`}
              >
                {/* Top row — times */}
                <div className="absolute left-2 right-2 top-1.5 flex items-start justify-between gap-2">
                  <span className="text-[22px] leading-none font-bold tabular-nums tracking-tight drop-shadow-sm">
                    {draftStartLabel}
                  </span>
                  <span
                    className={[
                      "text-[11px] font-medium tabular-nums leading-[1.6]",
                      locked ? "text-emerald-900/55" : "text-amber-900/65",
                    ].join(" ")}
                  >
                    {draftEndLabel}
                  </span>
                </div>

                {/* Bottom row — matched-pair nudge chevrons. Same size,
                    same y. Hidden when locked since you can't drag a
                    locked window. */}
                {!locked && (
                  <div className="absolute left-1 right-1 bottom-1 flex items-center justify-between">
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        nudgeSec(e.shiftKey ? -0.1 : -1);
                      }}
                      aria-label="Nudge start earlier (Shift = 0.1 sec)"
                      title="Earlier · Shift-click for 0.1 sec"
                      className="pointer-events-auto w-6 h-6 rounded-md inline-flex items-center justify-center text-amber-900/75 hover:text-amber-900 hover:bg-amber-400/30 transition-colors"
                      data-testid={`button-nudge-back-${song.id}`}
                    >
                      <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        nudgeSec(e.shiftKey ? 0.1 : 1);
                      }}
                      aria-label="Nudge start later (Shift = 0.1 sec)"
                      title="Later · Shift-click for 0.1 sec"
                      className="pointer-events-auto w-6 h-6 rounded-md inline-flex items-center justify-center text-amber-900/75 hover:text-amber-900 hover:bg-amber-400/30 transition-colors"
                      data-testid={`button-nudge-forward-${song.id}`}
                    >
                      <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Time axis — derived from real duration */}
          <div className="flex justify-between text-[9px] tabular-nums text-slate-400 mt-2 mb-1 px-1">
            {ticks.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>

        </div>

        {/* Revert — only rendered when there are unsaved changes so
            the padlock sits flush against the waveform in the clean
            state (Bill: "big gap with the lock and the wave"). */}
        {isDirty && (
          <button
            type="button"
            onClick={revertDraft}
            disabled={saveMut.isPending}
            aria-label="Revert to saved preview"
            title="Revert to what fans hear now"
            className="w-9 h-9 rounded-full inline-flex items-center justify-center flex-shrink-0 text-slate-500 hover:bg-slate-100"
            data-testid={`button-preview-revert-${song.id}`}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={onPadlockClick}
          disabled={saveMut.isPending}
          aria-label={
            locked
              ? "Unlock preview — allow sliding"
              : isDirty
                ? "Save and lock preview"
                : "Lock preview in"
          }
          title={
            locked
              ? "Unlock to slide again"
              : isDirty
                ? "Lock Preview — commits your edit"
                : "Lock in when done"
          }
          className={[
            "w-11 h-11 rounded-full inline-flex items-center justify-center flex-shrink-0 transition-colors hover:bg-slate-100 disabled:opacity-50",
            locked ? "text-emerald-600" : "text-amber-600",
          ].join(" ")}
          data-testid={`button-preview-padlock-${song.id}`}
        >
          {saveMut.isPending ? (
            <Spinner className="w-4 h-4 animate-spin" />
          ) : locked ? (
            <Lock className="w-4 h-4" />
          ) : (
            <LockOpen className="w-4 h-4" />
          )}
        </button>
      </div>

    </div>
  );
}

function PreviewWindowEditor({
  song,
  onSaved,
  onClose,
  standalone = false,
}: {
  song: SongLite;
  onSaved: () => Promise<void>;
  onClose?: () => void;
  /** True when the Preview tile opens this on its own (not nested under
   *  the Master/audio editor). Adds a header + Done button so the
   *  surface reads as a focused editor rather than a sub-row. */
  standalone?: boolean;
}) {
  // Standalone mode (Tracks-tab Preview tile) gets the rich waveform-driven
  // editor — fed by real song.waveform + song.duration. The nested mode
  // (still rendered inside the legacy AudioEditor) keeps the simple inline
  // form below to avoid breaking that surface during the demo push.
  if (standalone) {
    return <RichPreviewEditor song={song} onSaved={onSaved} />;
  }

  const { toast } = useToast();
  const qc = useQueryClient();
  const hasCustom = song.previewStartMs != null;
  // When opened standalone we skip the collapsed "summary row" state
  // entirely — admin tapped the tile *to* edit, so jump straight into
  // the input form.
  const [open, setOpen] = useState<boolean>(standalone);
  const [draft, setDraft] = useState<string>(
    hasCustom ? formatTimeMs(song.previewStartMs!) : "0:00",
  );

  const durationMs = (song.duration ?? 0) * 1000;
  const maxStartMs = Math.max(0, durationMs - 30000);

  const saveMut = useMutation({
    mutationFn: async (
      next: { startMs: number; endMs: number } | null,
    ) =>
      apiRequest(
        "PUT",
        `/api/admin/songs/${song.id}`,
        next
          ? { previewStartMs: next.startMs, previewEndMs: next.endMs }
          : { previewStartMs: null, previewEndMs: null },
      ),
    onSuccess: async (_d, next) => {
      await qc.invalidateQueries({ queryKey: ["/api/albums"] });
      await onSaved();
      toast({
        title: next ? "Custom preview saved" : "Preview reset to auto",
      });
      if (standalone) {
        onClose?.();
      } else {
        setOpen(false);
      }
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save the preview window",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  const handleSave = () => {
    const startMs = parseTimeStr(draft);
    if (startMs == null) {
      toast({
        title: "Enter a time like 1:05",
        variant: "destructive",
      });
      return;
    }
    if (durationMs > 0 && startMs > maxStartMs) {
      toast({
        title: `Start can't be past ${formatTimeMs(maxStartMs)}`,
        description: `Master ends at ${formatTimeMs(durationMs)} — leave at least 30 seconds.`,
        variant: "destructive",
      });
      return;
    }
    saveMut.mutate({ startMs, endMs: startMs + 30000 });
  };

  // Status row — dot + label/subtitle. Reused in both nested + standalone.
  const statusRow = (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="w-3.5 h-3.5 rounded-full inline-flex items-center justify-center flex-shrink-0"
        style={
          hasCustom
            ? {
                background:
                  "linear-gradient(180deg, #F2C94C 0%, #D4A017 60%, #B8860B 100%)",
                boxShadow: "inset 0 0.5px 0 rgba(255,255,255,0.55)",
              }
            : undefined
        }
      >
        {hasCustom ? (
          <ClipGlyph className="w-2 h-2" />
        ) : (
          <CheckCircle2
            className="w-3.5 h-3.5 text-emerald-500"
            fill="currentColor"
            stroke="white"
            strokeWidth={2.25}
          />
        )}
      </span>
      <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
        <span className="text-[11.5px] text-slate-600 font-medium">
          {hasCustom ? "Custom preview" : "Auto preview"}
        </span>
        <span className="text-[10.5px] text-slate-400">
          ·{" "}
          {hasCustom
            ? `${formatTimeMs(song.previewStartMs!)} – ${formatTimeMs(
                song.previewEndMs ?? song.previewStartMs! + 30000,
              )}`
            : "first 30 sec"}
        </span>
      </div>
      {!standalone && !open && (
        <button
          type="button"
          onClick={() => {
            setDraft(
              hasCustom ? formatTimeMs(song.previewStartMs!) : "0:00",
            );
            setOpen(true);
          }}
          className="text-[11.5px] text-[var(--brand-blue)] hover:underline font-semibold"
          data-testid={`button-edit-preview-${song.id}`}
        >
          {hasCustom ? "Edit" : "Pick custom"}
        </button>
      )}
    </div>
  );

  // Input form — shared between nested ("open" toggles it) + standalone.
  const inputForm = (
    <div className="flex flex-wrap items-center gap-2">
      <label
        htmlFor={`input-preview-start-${song.id}`}
        className="text-[11px] text-slate-500 font-semibold"
      >
        Start
      </label>
      <input
        id={`input-preview-start-${song.id}`}
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="0:00"
        autoFocus={standalone}
        disabled={saveMut.isPending}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSave();
          } else if (e.key === "Escape") {
            e.preventDefault();
            // Stop the row-level keydown handler from also catching this
            // Escape (it has its own collapse-row behavior) so focus
            // hand-back to the Preview tile via previewChipRef wins.
            e.stopPropagation();
            if (standalone) onClose?.();
            else setOpen(false);
          }
        }}
        className="w-16 h-7 rounded-md border border-slate-300 bg-white px-2 text-[12.5px] text-slate-900 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
        data-testid={`input-preview-start-${song.id}`}
      />
      <span className="text-[10.5px] text-slate-400">→ ends 30s later</span>
      <div className="flex-1" />
      {hasCustom && (
        <button
          type="button"
          onClick={() => saveMut.mutate(null)}
          disabled={saveMut.isPending}
          className="text-[11px] text-slate-500 hover:text-slate-700 hover:underline font-medium disabled:opacity-40"
          data-testid={`button-reset-preview-${song.id}`}
        >
          Reset to auto
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          if (standalone) onClose?.();
          else setOpen(false);
        }}
        disabled={saveMut.isPending}
        className="text-[11px] text-slate-500 hover:text-slate-700 hover:underline font-medium disabled:opacity-40"
      >
        {standalone ? "Done" : "Cancel"}
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={saveMut.isPending}
        className="px-2.5 h-7 rounded-md bg-[var(--brand-blue)] text-white text-[11.5px] font-semibold hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-1"
        data-testid={`button-save-preview-${song.id}`}
      >
        {saveMut.isPending ? (
          <Spinner className="w-3 h-3 animate-spin" />
        ) : (
          <Lock className="w-3 h-3" />
        )}
        Save &amp; lock
      </button>
    </div>
  );

  if (standalone) {
    // Section-styled surface that visually rhymes with the
    // REQUIRED / OPTIONAL groups above. Header label + hairline,
    // then the status row, then the input form.
    return (
      <div data-testid={`preview-window-${song.id}`}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Preview Window
          </span>
          <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 space-y-2.5">
          {statusRow}
          {inputForm}
        </div>
      </div>
    );
  }

  return (
    <div
      className="px-1 space-y-1.5"
      data-testid={`preview-window-${song.id}`}
    >
      {statusRow}
      {open && (
        <div className="pt-2 border-t border-slate-100">{inputForm}</div>
      )}
    </div>
  );
}

/* ─── Master tech-spec readout (Task #317) ──────────────────────────────
   Single-line, view-only summary of what the file actually IS — format,
   sample rate, bit depth, channels, file size, duration. Renders once
   on the collapsed Master tile, once on the expanded panel header, and
   once inside the AudioEditor near the URL field. When the upload
   pipeline transcoded a hi-res master we surface both the served file
   (e.g. FLAC) and the archival source (e.g. 24-bit/96 kHz WAV) on
   separate lines so the operator can see what's streaming AND what's
   going to press. Admin-only by virtue of where it's mounted (Master
   tile lives inside the admin track row); no extra gate needed. */
type AudioSpecsPayload = {
  format: string | null;
  containerExt: string | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
  bytes: number | null;
  duration: number | null;
};
function formatBytesHuman(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function formatChannelsHuman(ch: number | null | undefined): string | null {
  if (!ch || ch <= 0) return null;
  if (ch === 1) return "mono";
  if (ch === 2) return "stereo";
  return `${ch}-ch`;
}
function formatSampleRateHuman(sr: number | null | undefined): string | null {
  if (!sr || sr <= 0) return null;
  const khz = sr / 1000;
  return Number.isInteger(khz) ? `${khz} kHz` : `${khz.toFixed(1)} kHz`;
}
function extFromUrl(url: string | null | undefined): string | null {
  // Pull `.flac` etc. off the URL pathname so we can still label legacy
  // rows whose spec columns are null because the backfill sweep
  // hasn't run yet (or failed). Querystring is ignored.
  if (!url) return null;
  try {
    const p = new URL(url, "http://x").pathname;
    const m = p.match(/\.(\w+)$/);
    return m ? `.${m[1].toLowerCase()}` : null;
  } catch {
    const m = url.match(/\.(\w+)(?:\?|$)/);
    return m ? `.${m[1].toLowerCase()}` : null;
  }
}
function formatFormatLabel(
  format: string | null | undefined,
  containerExt: string | null | undefined,
  fallbackUrl?: string | null,
): string | null {
  // Prefer the ffprobe codec name (always present on a successful probe),
  // upper-cased; fall back to the container extension stripped of its
  // leading dot; finally fall back to the URL extension so legacy rows
  // missing every probe field can still show "FLAC" etc. "pcm_s24le"
  // reads as gibberish to a human, so collapse PCM variants to plain
  // "PCM" — bit depth is its own field elsewhere on the line.
  if (format) {
    const f = format.toLowerCase();
    if (f.startsWith("pcm")) return "PCM";
    return format.toUpperCase();
  }
  const ext = (containerExt || extFromUrl(fallbackUrl) || "").replace(/^\./, "");
  return ext ? ext.toUpperCase() : null;
}
function buildSpecsParts(
  s: {
    format?: string | null;
    containerExt?: string | null;
    sampleRate?: number | null;
    bitDepth?: number | null;
    channels?: number | null;
    bytes?: number | null;
  },
  fallbackUrl?: string | null,
): string[] {
  const parts: string[] = [];
  const fmt = formatFormatLabel(s.format, s.containerExt, fallbackUrl);
  if (fmt) parts.push(fmt);
  const sr = formatSampleRateHuman(s.sampleRate);
  if (sr) {
    parts.push(s.bitDepth ? `${s.bitDepth}-bit · ${sr}` : sr);
  } else if (s.bitDepth) {
    parts.push(`${s.bitDepth}-bit`);
  }
  const ch = formatChannelsHuman(s.channels);
  if (ch) parts.push(ch);
  const sz = formatBytesHuman(s.bytes);
  if (sz) parts.push(sz);
  return parts;
}
function MasterSpecLine({ song }: { song: SongLite }) {
  // Served segment — what fans actually stream. URL extension is the
  // last-resort fallback so legacy rows still get at least a format
  // chip (e.g. "FLAC") before the backfill sweep has touched them.
  const servedParts = buildSpecsParts(
    {
      format: song.audioFormat,
      containerExt: song.audioContainerExt,
      sampleRate: song.audioSampleRate,
      bitDepth: song.audioBitDepth,
      channels: song.audioChannels,
      bytes: song.audioBytes,
    },
    song.audioUrl,
  );
  // Source segment — only when the pipeline transcoded
  // (audioSourceUrl set). Same URL-extension fallback as served.
  const sourceParts = song.audioSourceUrl
    ? buildSpecsParts(
        {
          format: song.audioSourceFormat,
          containerExt: song.audioSourceContainerExt,
          sampleRate: song.audioSourceSampleRate,
          bitDepth: song.audioSourceBitDepth,
          channels: song.audioSourceChannels,
          bytes: song.audioSourceBytes,
        },
        song.audioSourceUrl,
      )
    : [];
  // Duration is shared (one file, one length) — tag it onto the
  // single rendered line so the operator can cross-check the "3:42"
  // row label without scrolling.
  let durationStr: string | null = null;
  if (song.duration && song.duration > 0) {
    const mm = Math.floor(song.duration / 60);
    const ss = String(song.duration % 60).padStart(2, "0");
    durationStr = `${mm}:${ss}`;
  }
  if (
    servedParts.length === 0 &&
    sourceParts.length === 0 &&
    !durationStr
  ) {
    return null;
  }
  // Compose ONE line. On a transcoded master we render the archival
  // source first, an arrow, then the served file, then duration —
  // mirrors what the operator actually wants to know: "raw bytes
  // they uploaded → bytes that go down the wire to fans · length."
  // On a non-transcoded upload we drop the arrow and prefix.
  const tooltipBits: string[] = [];
  const segments: React.ReactNode[] = [];
  if (sourceParts.length > 0) {
    tooltipBits.push(`Source: ${sourceParts.join(" · ")}`);
    segments.push(
      <span key="src">
        <span className="text-slate-400">Source · </span>
        {sourceParts.join(" · ")}
      </span>,
      <span key="arrow" className="text-slate-400">{" → "}</span>,
      <span key="srv">
        <span className="text-slate-400">Served · </span>
        {servedParts.length > 0 ? servedParts.join(" · ") : "—"}
      </span>,
    );
    tooltipBits.push(`Served: ${servedParts.length > 0 ? servedParts.join(" · ") : "—"}`);
  } else if (servedParts.length > 0) {
    segments.push(<span key="srv">{servedParts.join(" · ")}</span>);
    tooltipBits.push(servedParts.join(" · "));
  }
  if (durationStr) {
    segments.push(
      <span key="dur">
        {segments.length > 0 ? " · " : ""}
        {durationStr}
      </span>,
    );
    tooltipBits.push(durationStr);
  }
  return (
    <span
      className="block text-[10.5px] text-slate-500 leading-tight font-mono tabular-nums truncate select-text"
      title={tooltipBits.join(" · ")}
      data-testid={`text-master-specs-${song.id}`}
    >
      {segments}
    </span>
  );
}

/* ─── Per-track audio editor (drag-drop, file picker, paste URL) ─────── */

function AudioEditor({
  song,
  albumId,
  onClose,
  onSaved,
}: {
  song: SongLite;
  albumId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();

  // Seed from `song.audioUrl` through the normalizer so editors opened
  // against an existing track with a raw share URL (saved before this
  // rewrite shipped, or imported from elsewhere) self-heal on open —
  // the user sees the direct-stream URL in the field, the audio tag
  // gets a playable src, and the debounced autosave persists the
  // rewritten URL back to the DB. Without this, only fresh keystrokes
  // trigger normalization and stale rows keep showing "Preview failed
  // to load…" in prod.
  const [draftUrl, setDraftUrl] = useState<string>(() =>
    normalizeAudioUrl(song.audioUrl ?? ""),
  );
  // Tracks the archival original URL alongside `draftUrl`. Set when a
  // freshly-uploaded master was transcoded (e.g. 24-bit WAV → FLAC);
  // also seeded from any persisted `song.audioSourceUrl` on mount so
  // a re-open of the editor doesn't drop the existing original. When
  // the operator clears the playback URL we clear this too — the
  // original only makes sense as a companion to the playback file.
  const [draftSourceUrl, setDraftSourceUrl] = useState<string | null>(
    () => song.audioSourceUrl ?? null,
  );
  // Task #317 — specs travel as a pair with the URL. We only POST a
  // non-undefined value when the operator just uploaded a fresh file
  // (handleFile sets this); a plain URL paste or a Clear leaves them
  // undefined so the saveMut body omits them and the server's
  // "clear-specs-when-URL-clears" logic does the right thing on its
  // own.
  const [pendingServedSpecs, setPendingServedSpecs] = useState<
    AudioSpecsPayload | null | undefined
  >(undefined);
  const [pendingSourceSpecs, setPendingSourceSpecs] = useState<
    AudioSpecsPayload | null | undefined
  >(undefined);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty =
    (draftUrl || null) !== (song.audioUrl ?? null) ||
    (draftSourceUrl ?? null) !== (song.audioSourceUrl ?? null);

  const handleFile = async (f: File) => {
    setLocalError(null);
    if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|wav|flac|ogg)$/i.test(f.name)) {
      setLocalError("That's not an audio file. Use MP3, M4A/AAC, WAV, FLAC, or OGG.");
      return;
    }
    if (f.size > 150 * 1024 * 1024) {
      setLocalError("File too large — keep masters under 150 MB.");
      return;
    }
    setUploading(true);
    try {
      const result = await uploadAudioFile(f);
      setDraftUrl(result.url);
      setDraftSourceUrl(result.sourceUrl);
      // Task #317 — stash the just-probed specs so saveMut can ship
      // them alongside the URL. `null` for source on a passthrough
      // upload is meaningful (server clears any leftover source specs);
      // we explicitly null it rather than leaving undefined.
      setPendingServedSpecs(result.servedSpecs ?? null);
      setPendingSourceSpecs(result.sourceSpecs ?? null);
      // Backfill duration when the row is still on the schema default
      // (180s = 3:00) or 0, and the server's music-metadata probe
      // returned a real value. Critical for 24-bit WAV / AIFF where
      // the browser's <audio> probe at row-creation time returned
      // null and we'd otherwise keep showing "3:00" forever.
      if (
        result.duration &&
        result.duration > 0 &&
        (!song.duration || song.duration === 180)
      ) {
        try {
          await apiRequest("PUT", `/api/admin/songs/${song.id}`, {
            duration: result.duration,
          });
          await onSaved();
        } catch { /* non-fatal; the master URL save below still runs */ }
      }
      if (result.transcoded) {
        toast({
          title: "Master converted for browser playback",
          description: `${result.sourceBitsPerSample ?? "high"}-bit WAV preserved as the archival original; a FLAC copy will stream in browsers.`,
        });
      }
    } catch (e: any) {
      setLocalError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // Silent autosave — Bill: if Preview + Instrumental save themselves,
  // why does the master file need a Save button? Removed the footer
  // CTA; the URL field, file picker, drag-drop, and Clear all flow
  // through `setDraftUrl`, and the effect below persists the change
  // 600ms after the writer stops touching it. No toast on the happy
  // path so the editor stays calm.
  const saveMut = useMutation({
    mutationFn: async () =>
      apiRequest("PUT", `/api/admin/songs/${song.id}`, {
        audioUrl: draftUrl || null,
        // Clear the archival original whenever the playback URL is
        // cleared — they're a pair. Otherwise persist whatever the
        // transcode pipeline returned.
        audioSourceUrl: draftUrl ? draftSourceUrl : null,
        // Task #317 — ship the upload-probed specs in lock-step with
        // the URL. `undefined` means "leave whatever's in the DB" (URL
        // paste / Clear path); `null` means "clear" (only used for
        // source when the new upload was a passthrough); an object
        // means "persist these values."
        ...(pendingServedSpecs !== undefined ? { servedSpecs: pendingServedSpecs } : {}),
        ...(pendingSourceSpecs !== undefined ? { sourceSpecs: pendingSourceSpecs } : {}),
      }),
    onSuccess: async () => {
      // Specs landed in the DB; reset the pending bag so a follow-up
      // edit (e.g. just clearing the URL) doesn't re-send stale specs.
      setPendingServedSpecs(undefined);
      setPendingSourceSpecs(undefined);
      await onSaved();
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save the master",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      }),
  });

  // Debounced autosave. We compare against the live `song.audioUrl`
  // each tick so the effect goes quiet once the server matches the
  // draft. Skip while we're mid-upload — `draftUrl` only changes
  // after the upload resolves, but the guard makes the intent
  // explicit.
  useEffect(() => {
    if (uploading) return;
    if (!dirty) return;
    if (saveMut.isPending) return;
    const t = setTimeout(() => saveMut.mutate(), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftUrl, draftSourceUrl, song.audioUrl, song.audioSourceUrl, uploading]);

  return (
    <div
      className="px-5 pt-4 pb-4"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !uploading && !saveMut.isPending) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {/* File tile — drag-target + file picker + URL input + audio
          preview, all in one Apple-clean block. The verbs ("Replace
          file", "Clear", "Choose file") used to float to the right of
          a separate label row, which left a wide empty gap between the
          tag and its buttons. Now the only controls live next to the
          content they act on: file ••• menu sits inline with the URL
          field, dropzone copy lives inside the empty-state tile. */}
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
        data-testid={`input-audio-file-${song.id}`}
      />

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={[
          "rounded-xl px-3.5 py-3 transition-colors",
          draftUrl
            ? "border border-slate-200 bg-white space-y-2.5"
            : dragOver
              ? "border-2 border-dashed border-[var(--brand-blue)] bg-[var(--brand-blue)]/10"
              : "border-2 border-dashed border-slate-200 bg-slate-50/60",
        ].join(" ")}
        data-testid={`dropzone-audio-${song.id}`}
      >
        {!draftUrl ? (
          // Empty state — single centered dropzone tile. One verb
          // ("Choose"), one secondary affordance ("paste a URL"),
          // no floating buttons.
          <div className="flex flex-col items-center gap-1.5 py-4 text-center">
            <Music
              className="w-6 h-6 text-slate-400"
              aria-hidden="true"
            />
            <p className="text-[12.5px] text-slate-600">
              Drop a master file here, or{" "}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || saveMut.isPending}
                className="text-[var(--brand-blue)] font-semibold hover:underline disabled:opacity-40"
                data-testid={`button-choose-audio-${song.id}`}
              >
                choose one
              </button>
              {uploading && (
                <span className="text-slate-400"> · uploading…</span>
              )}
            </p>
            <p className="text-[10.5px] text-slate-400">
              MP3, M4A, AAC, WAV, FLAC, OGG
            </p>
            <input
              type="text"
              value={draftUrl}
              onChange={(e) => {
                setDraftUrl(normalizeAudioUrl(e.target.value));
                // A manually-typed URL replaces whatever the transcode
                // pipeline produced — the previous archival original
                // no longer corresponds to this playback file.
                setDraftSourceUrl(null);
                // Same logic for the just-probed specs — they belong
                // to the prior upload, not to this manually-pasted
                // URL. Reset so saveMut doesn't ship stale specs
                // against a different file.
                setPendingServedSpecs(undefined);
                setPendingSourceSpecs(undefined);
                setLocalError(null);
              }}
              placeholder="or paste a URL"
              disabled={uploading || saveMut.isPending}
              className="mt-1.5 w-full max-w-sm h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] text-slate-900 placeholder:text-slate-400 text-center focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent disabled:opacity-50"
              data-testid={`input-audio-url-${song.id}`}
            />
          </div>
        ) : (
          // Filled state — URL field with file actions tucked into a
          // single ••• menu so Replace / Clear stop hogging chrome.
          <>
            <div className="flex items-center gap-2">
              <Music
                className="w-4 h-4 text-slate-400 flex-shrink-0"
                aria-hidden="true"
              />
              <input
                type="text"
                value={draftUrl}
                onChange={(e) => {
                  setDraftUrl(normalizeAudioUrl(e.target.value));
                  // Manually-typed URL ⇒ drop any transcode-paired
                  // archival original (no longer corresponds), and
                  // discard the just-probed specs (they belong to
                  // the prior upload, not this URL).
                  setDraftSourceUrl(null);
                  setPendingServedSpecs(undefined);
                  setPendingSourceSpecs(undefined);
                  setLocalError(null);
                }}
                disabled={uploading || saveMut.isPending}
                className="flex-1 min-w-0 h-8 rounded-md border border-slate-300 bg-white px-2.5 text-[12.5px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent disabled:opacity-50"
                data-testid={`input-audio-url-${song.id}`}
              />
              {/* Quiet download anchor — same pattern as the per-row
                  Tracks-tab download (mirrors lines ~3486–3501). The
                  big play/pause overlay on the track number + the
                  Apple-style BottomDock cover playback; an inline
                  <audio controls> here was redundant chrome. The
                  download fires the browser save dialog without
                  opening a tab. */}
              {song.audioUrl && (() => {
                const href = song.audioSourceUrl ?? song.audioUrl!;
                const ext = href.match(/\.(\w+)(?:\?|$)/)?.[0] ?? ".mp3";
                const isOriginal = !!song.audioSourceUrl;
                return (
                  <a
                    href={href}
                    download={`${String(song.trackNumber).padStart(2, "0")} ${song.title}${ext}`}
                    className="w-8 h-8 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center flex-shrink-0"
                    aria-label="Download master"
                    title={isOriginal ? `Download original master (${ext.slice(1).toUpperCase()})` : "Download master"}
                    data-testid={`button-download-master-inline-${song.id}`}
                  >
                    <Download className="w-4 h-4" />
                  </a>
                );
              })()}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="File actions"
                    disabled={uploading || saveMut.isPending}
                    className="w-8 h-8 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                    data-testid={`button-audio-actions-${song.id}`}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-44 p-1 bg-white border border-slate-200 text-slate-900 shadow-lg rounded-lg"
                >
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full flex items-center gap-2 px-2.5 h-8 rounded-md text-[12.5px] text-slate-700 hover:bg-slate-100"
                    data-testid={`button-replace-audio-${song.id}`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Replace file
                  </button>
                  {/* Hairline + breathing room before the destructive
                      action — design-system rule: trash/delete buttons
                      keep gap + divider from neighbors so a thumb can't
                      slide between them. */}
                  <div className="my-1 h-px bg-slate-100" />
                  <button
                    type="button"
                    onClick={() => {
                      setDraftUrl("");
                      setDraftSourceUrl(null);
                      // Cleared file ⇒ null specs (saveMut will ship
                      // them as explicit `null` so the DB columns
                      // clear in lock-step with the URL).
                      setPendingServedSpecs(null);
                      setPendingSourceSpecs(null);
                      setLocalError(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 h-8 rounded-md text-[12.5px] text-rose-600 hover:bg-rose-50"
                    data-testid={`button-clear-audio-${song.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear
                  </button>
                </PopoverContent>
              </Popover>
            </div>

            {/* Task #317 — single-line tech-spec readout for the file
                in the URL field above. Anchored to the URL row so the
                readout sits with the file it describes. Renders empty
                for a legacy row with no probed specs yet. */}
            <MasterSpecLine song={song} />

            {uploading && (
              <p className="text-[11px] text-slate-400">Uploading…</p>
            )}

            {/* Instrumental flag — pulled INSIDE the master tile so it
                doesn't orphan below as a single floating row (Bill:
                "it looks kind of lost"). A hairline divider keeps it
                visually grouped with the file but reads as a separate
                concern. Only shows once a master exists — there's
                nothing to be instrumental about otherwise. */}
            {song.audioUrl && (
              <div className="-mx-3 mt-1 pt-2.5 px-3 border-t border-slate-100 grid grid-cols-3 gap-2 items-stretch">
                {/* Instrumental · Explicit · Preview — each wrapped in
                    its own slate-50 chip so the icon + label + switch
                    read as a single grouped control. */}
                <div className="rounded-lg bg-slate-50 px-2.5 py-2 flex items-center">
                  <InstrumentalToggle song={song} />
                </div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-2 flex items-center">
                  <ExplicitTrackToggle song={song} albumId={albumId} />
                </div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-2 flex items-center">
                  <PreviewableTrackToggle song={song} />
                </div>
              </div>
            )}
          </>
        )}

        {localError && (
          <p
            className="text-[11px] text-rose-600 mt-2"
            data-testid={`text-audio-error-${song.id}`}
          >
            {localError}
          </p>
        )}
      </div>

      {/* Footer — only renders while a write is in-flight. There's no
          Save and no Done: autosave persists changes, and the tile
          header already says "tap to collapse" so the writer has a
          way out (Bill: "isn't Done redundant if it saves
          automatically?"). The `onClose` prop still wires up via the
          header tap upstream. */}
      {(saveMut.isPending || uploading) && (
        <div
          className="flex items-center gap-1.5 pt-3 text-[10.5px] text-slate-400"
          data-testid={`text-audio-autosave-${song.id}`}
        >
          <Spinner className="w-3 h-3 animate-spin" aria-hidden="true" />
          <span>Saving…</span>
        </div>
      )}
    </div>
  );
}

function TrackChip({
  ok,
  label,
  testId,
  interactive,
}: {
  ok: boolean;
  label: string;
  testId?: string;
  interactive?: boolean;
}) {
  return (
    <span
      data-testid={testId}
      className={[
        "inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-semibold uppercase tracking-wide",
        ok
          ? "bg-[var(--brand-mint)]/15 text-emerald-700"
          : "bg-slate-100 text-slate-400",
        interactive && "hover:ring-1 hover:ring-[var(--brand-blue)]/40 transition-shadow",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={[
          "w-1 h-1 rounded-full",
          ok ? "bg-emerald-500" : "bg-slate-300",
        ].join(" ")}
      />
      {label}
    </span>
  );
}

/* ─── Artwork tab ──────────────────────────────────────────────────── */

async function uploadImageFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const token = getAuthToken();
  if (!token) {
    throw new Error("Sign out and back in — your session token is missing.");
  }
  const res = await fetch("/api/admin/upload", {
    method: "POST",
    body: fd,
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Upload failed (${res.status})`);
  }
  const { url } = await res.json();
  return url as string;
}

/**
 * ArtworkPanel — read/edit chrome that matches every other panel on
 * AdminAlbum (Release, Metadata, etc.).
 *
 * Read view: single panel containing just the album cover, with a
 *   hover-revealed pencil in the top-right header (same `group-hover`
 *   pattern EditablePanel uses). No "Current cover" label, no dropzone,
 *   no permanent UI competing for attention.
 *
 * Edit view: the *current* cover on the left (so the artist never feels
 *   like their art vanished), a drag/drop/browse dropzone on the right,
 *   and Cancel / Remove cover / Save controls in the panel footer.
 *
 *   Save behavior: dropping/picking a file uploads immediately (same as
 *   before — that's what the artist expects from an upload control) and
 *   on success the panel auto-exits edit mode. The Save button is shown
 *   while idle to signal "you can also just close the editor" — clicking
 *   it without picking a file simply exits. Cancel discards any
 *   in-flight preview and exits.
 *
 *   "Remove cover" is destructive and confirms (per the destructive-
 *   action rule in replit.md). Only rendered when a cover exists.
 */
function ArtworkPanel({
  album,
  open,
  onOpenChange,
}: {
  album: AlbumFull;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  // Used to be a self-contained inline panel with a read view + edit
  // view. Now it's purely the editor — the page header thumbnail owns
  // the trigger affordance, and this component renders inside a Dialog
  // when `open` is true. Reset local state every time the modal closes
  // so the next open starts clean.
  const exitEdit = () => {
    onOpenChange(false);
    setPreviewUrl(null);
    setConfirmRemove(false);
    setUrlInput("");
  };

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      setPreviewUrl(URL.createObjectURL(file));
      const url = await uploadImageFile(file);
      await apiRequest("PUT", `/api/admin/albums/${album.id}`, {
        artwork: url,
      });
      return url;
    },
    onSuccess: async () => {
      await invalidateAdminEntity(qc, "album", album.id);
      toast({ title: "Cover updated" });
      exitEdit();
    },
    onError: (e: any) => {
      setPreviewUrl(null);
      toast({
        title: "Couldn't update the cover",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const removeMut = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/admin/albums/${album.id}`, {
        artwork: null,
      });
    },
    onSuccess: async () => {
      await invalidateAdminEntity(qc, "album", album.id);
      toast({ title: "Cover removed" });
      exitEdit();
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't remove the cover",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  // Paste-from-URL — proxies the fetch through our server so cross-origin
  // CORS (which blocks Dropbox / Cloudinary / Imgur in the browser) is a
  // non-issue, and the image ends up in our own object storage instead of
  // being hot-linked to a source that could rotate the URL.
  const urlMut = useMutation({
    mutationFn: async (rawUrl: string) => {
      let trimmed = rawUrl.trim();
      if (!trimmed) throw new Error("Paste a URL first.");
      // Friendly autofix: if they forgot the scheme, assume https.
      // Stops Safari's cryptic "The string did not match the expected
      // pattern" from ever surfacing.
      if (!/^https?:\/\//i.test(trimmed)) trimmed = `https://${trimmed}`;
      setPreviewUrl(trimmed);
      const res = await apiRequest("POST", "/api/admin/fetch-image-from-url", {
        url: trimmed,
      });
      const { url } = (await res.json()) as { url: string };
      await apiRequest("PUT", `/api/admin/albums/${album.id}`, {
        artwork: url,
      });
      return url;
    },
    onSuccess: async () => {
      await invalidateAdminEntity(qc, "album", album.id);
      toast({ title: "Cover updated" });
      exitEdit();
    },
    onError: (e: any) => {
      setPreviewUrl(null);
      toast({
        title: "Couldn't use that URL",
        description: e?.message || "Try a different image.",
        variant: "destructive",
      });
    },
  });

  const acceptFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast({
        title: "That's not an image",
        description: "Cover art needs to be a JPG, PNG, or WebP file.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Keep covers under 8 MB.",
        variant: "destructive",
      });
      return;
    }
    uploadMut.mutate(file);
  };

  const busy = uploadMut.isPending || removeMut.isPending || urlMut.isPending;
  const shownUrl = previewUrl || album.artwork;
  const hasCover = !!album.artwork;

  /* ─── Editor modal ───────────────────────────────────────────── */
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : exitEdit())}>
      <DialogContent
        className="max-w-3xl bg-white rounded-2xl border-slate-200 shadow-xl p-6 gap-5"
        data-testid="panel-artwork"
        data-mode="edit"
      >
      {/* Header — just the title. The dialog primitive already renders
          the canonical close X (top-right, slate, hover-darken) so no
          need for a duplicate "EDITING" eyebrow next to it. */}
      <DialogHeader className="flex-row items-center justify-between space-y-0">
        <DialogTitle className="text-slate-900 text-[14px] font-bold">
          Artwork
        </DialogTitle>
        <DialogDescription className="sr-only">
          Replace, paste, or remove the cover art for {album.title}.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Current cover — kept visible during edit so the artist sees
            what they're replacing. Shows the in-flight preview the
            moment a file is picked. */}
        <div>
          <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-2">
            Current cover
          </div>
          <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 ring-1 ring-slate-200">
            {shownUrl ? (
              <img
                src={shownUrl}
                alt={album.title}
                className="w-full h-full object-cover"
                data-testid="img-artwork-current"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                <ImageIcon className="w-10 h-10" />
              </div>
            )}
            {uploadMut.isPending && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                <Spinner className="w-6 h-6 text-[var(--brand-blue)] animate-spin" />
                <span className="text-[12px] text-slate-700 font-semibold">
                  Uploading…
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Dropzone */}
        <div className="flex flex-col">
          <div className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-wider mb-2">
            {hasCover ? "Replace cover" : "Upload cover"}
          </div>
          <button
            type="button"
            onClick={() => !busy && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (busy) return;
              acceptFile(e.dataTransfer.files?.[0]);
            }}
            disabled={busy}
            data-testid="dropzone-artwork"
            className={[
              "flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors px-6 py-10 text-center",
              dragging
                ? "border-[var(--brand-blue)] bg-[var(--brand-blue)]/5"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
              busy && "opacity-60 cursor-not-allowed",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <Upload
              className={[
                "w-7 h-7",
                dragging ? "text-[var(--brand-blue)]" : "text-slate-400",
              ].join(" ")}
            />
            <div className="text-slate-700 text-[13px] font-semibold">
              {dragging
                ? "Drop to upload"
                : "Drag an image here, or click to pick"}
            </div>
            <div className="text-slate-400 text-[11.5px]">
              JPG, PNG, or WebP · up to 8 MB
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              acceptFile(e.target.files?.[0]);
              e.target.value = "";
            }}
            data-testid="input-artwork-file"
          />
          {/* Paste-from-URL — sits below the dropzone so it doesn't compete
              with drag-and-drop as the primary affordance. We download the
              image into our object storage rather than hot-linking. */}
          <div className="mt-3 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            or paste a URL
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (busy || !urlInput.trim()) return;
              urlMut.mutate(urlInput);
            }}
            className="mt-2 flex items-center gap-2"
            data-testid="form-artwork-url"
          >
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/cover.jpg"
              disabled={busy}
              className="flex-1 h-9 px-3 rounded-md border border-slate-200 bg-white text-[12.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20 disabled:opacity-60"
              data-testid="input-artwork-url"
            />
            <button
              type="submit"
              disabled={busy || !urlInput.trim()}
              className="h-9 px-3 rounded-md bg-[var(--brand-blue)] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
              data-testid="button-artwork-url-fetch"
            >
              {urlMut.isPending ? (
                <>
                  <Spinner className="w-3.5 h-3.5 animate-spin" />
                  Fetching…
                </>
              ) : (
                <>Use URL</>
              )}
            </button>
          </form>
          <p className="mt-3 text-[11.5px] text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-700">Recommended:</span>{" "}
            square, at least 3000×3000 px. New cover goes live everywhere
            — store grid, player Now Playing, playlist mosaics — as soon
            as the upload finishes.
          </p>
        </div>
      </div>

      {/* Footer — Cancel + (Remove cover, if one exists) on the left,
          Done on the right. Save is implicit (a file pick uploads
          immediately); "Done" closes the editor when there's nothing
          else to do. */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
        {hasCover ? (
          confirmRemove ? (
            <div
              className="flex items-center gap-2 text-[12px]"
              data-testid="confirm-remove-artwork"
            >
              <span className="text-slate-700">
                Remove <span className="font-semibold">{album.title}</span>'s
                cover?
              </span>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                disabled={busy}
                className="h-7 px-2.5 rounded-md text-slate-600 text-[12px] font-semibold hover:bg-slate-100"
                data-testid="button-remove-artwork-cancel"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => removeMut.mutate()}
                disabled={busy}
                className="h-7 px-2.5 rounded-md bg-[var(--brand-pink)] text-white text-[12px] font-semibold hover:bg-[#e64863] inline-flex items-center gap-1.5 disabled:opacity-60"
                data-testid="button-remove-artwork-confirm"
              >
                {removeMut.isPending ? (
                  <Spinner className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              disabled={busy}
              className="h-8 px-3 rounded-md text-[var(--brand-pink)] text-[12px] font-semibold hover:bg-[var(--brand-pink)]/8 inline-flex items-center gap-1.5"
              data-testid="button-remove-artwork"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove cover
            </button>
          )
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exitEdit}
            disabled={busy}
            className="h-8 px-3 rounded-md bg-white border border-slate-200 text-slate-700 text-[12px] font-semibold hover:bg-slate-50 inline-flex items-center gap-1.5"
            data-testid="button-cancel-artwork"
          >
            <XIcon className="w-3.5 h-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={exitEdit}
            disabled={busy}
            className="h-8 px-3 rounded-md bg-[var(--brand-blue)] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5 disabled:opacity-60"
            data-testid="button-done-artwork"
          >
            <Check className="w-3.5 h-3.5" />
            Done
          </button>
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Masters tab ──────────────────────────────────────────────────── */

async function uploadAudioFile(
  file: File,
): Promise<{
  url: string;
  // Set when the server transcoded the master to a browser-friendly
  // FLAC (24-bit/32-bit/32-float PCM WAV → FLAC). Points at the
  // ORIGINAL bytes the operator uploaded, preserved for archival
  // and future streaming-service mastering. Null when the upload
  // was already playable in browsers (16-bit WAV, FLAC, MP3, …).
  sourceUrl: string | null;
  transcoded: boolean;
  sourceBitsPerSample?: number;
  // Server-side duration probe via music-metadata. Set whenever the
  // server could read the audio header (any bit depth). The client's
  // own probe via HTMLAudioElement can't decode 24-bit WAV / AIFF —
  // this is the fallback so hi-res masters don't land at the 3:00
  // schema default.
  duration?: number | null;
  // Task #317 — full ffprobe readout for the served + (when
  // transcoded) source file. Passed back into POST/PUT /api/admin/songs
  // so the admin track row can show format, sample rate, bit depth,
  // channels, and file size without re-probing on read.
  servedSpecs?: AudioSpecsPayload | null;
  sourceSpecs?: AudioSpecsPayload | null;
}> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Sign out and back in — your session token is missing.");
  }
  // Direct-to-Object-Storage flow (sign → PUT to GCS → finalize). The
  // legacy multipart POST to `/api/admin/upload-audio` still works for
  // server-side ZIP imports, but browser uploads have to bypass
  // Replit's ~32MB inbound proxy cap, which 413s a CD-quality WAV
  // master long before our handler runs. Finalize returns the same
  // shape the legacy route returned, so nothing downstream changes.
  const contentType = file.type || "audio/mpeg";
  const signRes = await fetch("/api/admin/upload-audio/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({ contentType }),
  });
  if (!signRes.ok) {
    const errBody = await signRes.json().catch(() => ({}));
    throw new Error(errBody.message || `Upload failed (${signRes.status})`);
  }
  const { uploadUrl, finalPath, contentType: signedType } =
    (await signRes.json()) as {
      uploadUrl: string;
      finalPath: string;
      contentType: string;
    };

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", signedType);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — network error"));
    xhr.send(file);
  });

  const finRes = await fetch("/api/admin/upload-audio/finalize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({ finalPath, contentType: signedType }),
  });
  if (!finRes.ok) {
    const errBody = await finRes.json().catch(() => ({}));
    throw new Error(errBody.message || `Upload finalize failed (${finRes.status})`);
  }
  const body = (await finRes.json()) as {
    url: string;
    sourceUrl: string | null;
    transcoded: boolean;
    sourceBitsPerSample?: number;
    duration?: number | null;
    servedSpecs?: AudioSpecsPayload | null;
    sourceSpecs?: AudioSpecsPayload | null;
  };
  return body;
}


/* ─── Bonus tab (videos + photos) ──────────────────────────────────── */

interface AlbumVideo {
  id: string;
  albumId: string;
  title: string;
  description: string | null;
  videoUrl: string;
  posterUrl: string | null;
  sourceUrl: string | null;
  position: number;
  // Mux pipeline state — admins get the full row (fans get a stripped
  // payload). Surfaced so the tile can flag rows that will never play:
  // a sourceless placeholder (empty videoUrl + no Mux asset) or a row
  // whose encode errored.
  muxAssetId?: string | null;
  muxPlaybackId?: string | null;
  muxStatus?: string | null;
  muxLastError?: string | null;
}
interface AlbumPhoto {
  id: string;
  albumId: string;
  photoUrl: string;
  caption: string | null;
  position: number;
}

// Three-step direct-to-GCS upload (sign → PUT → finalize) so files past
// Replit's ~32MB inbound proxy cap still work, with optional progress.
async function uploadVideoFile(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<{ url: string; posterUrl: string | null }> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Sign out and back in — your session token is missing.");
  }
  const signRes = await fetch("/api/admin/upload-video/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({ contentType: file.type || "video/mp4" }),
  });
  if (!signRes.ok) {
    const body = await signRes.json().catch(() => ({}));
    throw new Error(body.message || `Upload failed (${signRes.status})`);
  }
  const { uploadUrl, finalPath, contentType } = (await signRes.json()) as {
    uploadUrl: string;
    finalPath: string;
    contentType: string;
  };
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — network error"));
    xhr.send(file);
  });
  const finRes = await fetch("/api/admin/upload-video/finalize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({ finalPath }),
  });
  if (!finRes.ok) {
    const body = await finRes.json().catch(() => ({}));
    throw new Error(body.message || `Upload finalize failed (${finRes.status})`);
  }
  const { url, posterUrl } = (await finRes.json()) as {
    url: string;
    posterUrl?: string | null;
  };
  return { url, posterUrl: posterUrl ?? null };
}

function friendlyVideoError(raw: string): string {
  let msg = raw || "";
  const jsonMatch = msg.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.message) msg = String(parsed.message);
    } catch {}
  }
  if (/larger than the 500MB/i.test(msg) || /exceeded 500MB/i.test(msg)) {
    return "Sorry, this video is larger than the 500MB import limit.";
  }
  if (/unsupported|mime|content[- ]type/i.test(msg)) {
    return "That link doesn't look like an MP4, MOV, or WebM video.";
  }
  if (/fetch|network|timed? ?out|enotfound|econnrefused/i.test(msg)) {
    return "We couldn't reach that link. Double-check the URL and try again.";
  }
  return msg || "Upload failed.";
}

type VideoSheetMode =
  | { kind: "closed" }
  // `initialFile` / `initialUrl` let the empty-state inline dropzone
  // open the sheet with the drag/drop file (or pasted URL) already
  // primed — Bill just confirms the title and clicks Add.
  | { kind: "new"; initialFile?: File; initialUrl?: string }
  | { kind: "edit"; video: AlbumVideo };

type PhotoSheetMode =
  | { kind: "closed" }
  | { kind: "new"; initialFile?: File }
  | { kind: "edit"; photo: AlbumPhoto };

function BonusVideos({
  albumId,
  onEdit: _onEdit,
}: {
  albumId: string;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<VideoSheetMode>({ kind: "closed" });
  // Bulk Dropbox-folder import — mirrors the Tracks-tab Advanced flow.
  const [bulkOpen, setBulkOpen] = useState(false);

  const { data: videos = [], isLoading } = useQuery<AlbumVideo[]>({
    queryKey: ["/api/albums", albumId, "videos"],
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/album-videos/${id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["/api/albums", albumId, "videos"],
      });
      toast({ title: "Video removed" });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't remove the video",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card
      className="rounded-2xl shadow-sm overflow-hidden"
      data-testid="panel-bonus-videos"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <div>
          <h2 className="text-slate-900 text-[14px] font-bold inline-flex items-center gap-2">
            <Film className="w-4 h-4 text-slate-400" />
            Videos
          </h2>
          <p className="text-slate-400 text-[11.5px]">
            {videos.length} {videos.length === 1 ? "video" : "videos"} ·
            MP4 / MOV / WebM · up to 500 MB
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Primary add — uses the shared `AddEntityButton` so the
              chrome matches "Add Person" / "Add Gear" / "Add Label"
              across admin (white outline, slate text). Don't reinvent
              the button here — the design system has one. */}
          <AddEntityButton
            label="Add Video"
            onClick={() => setSheet({ kind: "new" })}
            testId="button-add-video"
          />
          {/* Advanced menu — same visual treatment as the Tracks tab. Only
              one item today (bulk import from Dropbox), but the menu shape
              leaves room for future bulk video actions without rewiring
              the header. */}
          <BulkBonusAdvancedMenu
            label="Upload multiple videos"
            description="Dropbox folder of .mp4 / .mov / .webm files."
            onPick={() => setBulkOpen(true)}
          />
        </div>
      </div>
      <div className="p-5">
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Spinner className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        ) : videos.length === 0 ? (
          // Empty state — full-width rich dropzone with drag/drop, click-to-
          // browse, and URL ingest. Dropping a file (or pasting a URL) opens
          // the sheet primed with the file/URL so the user just confirms
          // the title and clicks Add.
          <BonusVideoDropzone
            onPickFile={(f) => setSheet({ kind: "new", initialFile: f })}
            onPickUrl={(u) => setSheet({ kind: "new", initialUrl: u })}
          />
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
            data-testid="grid-bonus-videos"
          >
            {videos
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((v) => (
                <VideoTile
                  key={v.id}
                  video={v}
                  onDelete={() => {
                    if (confirm(`Remove "${v.title}"?`)) {
                      deleteMut.mutate(v.id);
                    }
                  }}
                  onEdit={() => setSheet({ kind: "edit", video: v })}
                  busy={deleteMut.isPending}
                />
              ))}
          </div>
        )}
      </div>
      {sheet.kind !== "closed" && (
        <AlbumVideoSheet
          mode={sheet}
          albumId={albumId}
          onClose={() => setSheet({ kind: "closed" })}
          onSaved={async (created) => {
            // Keep the sheet open in Edit mode for newly-created rows
            // so Bill can immediately tweak the title / thumbnail
            // without hunting for the tile and re-opening the dialog.
            // Edits close as before.
            if (sheet.kind === "edit" || !created) {
              setSheet({ kind: "closed" });
            } else {
              setSheet({ kind: "edit", video: created });
            }
            await qc.invalidateQueries({
              queryKey: ["/api/albums", albumId, "videos"],
            });
            toast({
              title: sheet.kind === "edit" ? "Video updated" : "Video added",
            });
          }}
          onRequestDelete={(v) => {
            if (confirm(`Remove "${v.title}"?`)) {
              deleteMut.mutate(v.id);
              setSheet({ kind: "closed" });
            }
          }}
        />
      )}
      <BulkBonusFromDropboxDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        kind="video"
        endpoint={`/api/admin/albums/${albumId}/import-videos-from-dropbox`}
        onImported={() =>
          qc.invalidateQueries({ queryKey: ["/api/albums", albumId, "videos"] })
        }
      />
    </Card>
  );
}

function BonusPhotos({
  albumId,
  onEdit: _onEdit,
}: {
  albumId: string;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<PhotoSheetMode>({ kind: "closed" });
  const [bulkOpen, setBulkOpen] = useState(false);

  const { data: photos = [], isLoading } = useQuery<AlbumPhoto[]>({
    queryKey: ["/api/albums", albumId, "photos"],
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/album-photos/${id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["/api/albums", albumId, "photos"],
      });
      toast({ title: "Photo removed" });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't remove the photo",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card
      className="rounded-2xl shadow-sm overflow-hidden"
      data-testid="panel-bonus-photos"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <div>
          <h2 className="text-slate-900 text-[14px] font-bold inline-flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-slate-400" />
            Photos
          </h2>
          <p className="text-slate-400 text-[11.5px]">
            {photos.length} {photos.length === 1 ? "photo" : "photos"} ·
            JPG / PNG / WebP · up to 8 MB
          </p>
        </div>
        <BulkBonusAdvancedMenu
          label="Upload multiple photos"
          description="Dropbox folder of .jpg / .png / .webp files."
          onPick={() => setBulkOpen(true)}
        />
      </div>
      <div className="p-5">
        {isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Spinner className="w-5 h-5 text-slate-400 animate-spin" />
          </div>
        ) : photos.length === 0 ? (
          // Empty state — full-width rich dropzone (drag/drop + browse).
          // Dropping a file opens the sheet with the upload already in
          // flight; the user just adds an optional caption and saves.
          <BonusPhotoDropzone
            onPickFile={(f) => setSheet({ kind: "new", initialFile: f })}
          />
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
            data-testid="grid-bonus-photos"
          >
            {photos
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((p) => (
                <PhotoTile
                  key={p.id}
                  photo={p}
                  onDelete={() => {
                    if (confirm("Remove this photo?")) {
                      deleteMut.mutate(p.id);
                    }
                  }}
                  onEdit={() => setSheet({ kind: "edit", photo: p })}
                />
              ))}
            <AddTile
              busy={false}
              label="Add photo"
              onClick={() => setSheet({ kind: "new" })}
              testId="button-add-photo"
            />
          </div>
        )}
      </div>
      {sheet.kind !== "closed" && (
        <AlbumPhotoSheet
          mode={sheet}
          albumId={albumId}
          onClose={() => setSheet({ kind: "closed" })}
          onSaved={async () => {
            setSheet({ kind: "closed" });
            await qc.invalidateQueries({
              queryKey: ["/api/albums", albumId, "photos"],
            });
            toast({
              title: sheet.kind === "edit" ? "Photo updated" : "Photo added",
            });
          }}
          onRequestDelete={(p) => {
            if (confirm("Remove this photo?")) {
              deleteMut.mutate(p.id);
              setSheet({ kind: "closed" });
            }
          }}
        />
      )}
      <BulkBonusFromDropboxDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        kind="photo"
        endpoint={`/api/admin/albums/${albumId}/import-photos-from-dropbox`}
        onImported={() =>
          qc.invalidateQueries({ queryKey: ["/api/albums", albumId, "photos"] })
        }
      />
    </Card>
  );
}

/**
 * Bonus-section Advanced trigger. Mirrors the Tracks-tab Advanced
 * button at line ~1082 — same px-2.5 py-1.5 pill, Sparkles + ChevronDown
 * glyph, slate-100 open-state — so the operator's eye doesn't have to
 * relearn the affordance per section. Only one item today, but the
 * menu shape leaves room to add more bulk actions later (e.g. reorder,
 * delete-all) without re-styling the section header.
 */
function BulkBonusAdvancedMenu({
  label,
  description,
  onPick,
}: {
  label: string;
  description: string;
  onPick: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 data-[state=open]:bg-slate-100"
        data-testid="button-bonus-advanced"
        aria-label="Advanced bonus actions"
      >
        <Sparkles className="w-3 h-3" />
        Advanced
        <ChevronDown className="w-3 h-3 -mr-0.5 text-slate-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="min-w-[280px] p-1.5 bg-white text-slate-900 border border-slate-200 shadow-lg"
      >
        <DropdownMenuItem
          onSelect={() => onPick()}
          data-testid="menu-bonus-bulk-dropbox"
          className="gap-2.5 px-2.5 py-2 text-[12.5px] cursor-pointer focus:bg-slate-100 focus:text-slate-900"
        >
          <ListPlus className="w-4 h-4 text-slate-500" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-900">{label}</div>
            <div className="text-[11px] text-slate-500">{description}</div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Bulk-from-Dropbox dialog for the Bonus tab. Same chrome as
 * UploadMultipleTracksDialog's Dropbox half (slate-100 segmented
 * control omitted — there's only one mode here), so the visual
 * vocabulary stays identical to the Tracks bulk importer.
 *
 * Hits a kind-specific endpoint that returns the same
 * { created, errors, skipped } envelope as import-tracks-from-dropbox,
 * so toast composition is shared.
 */
function BulkBonusFromDropboxDialog({
  open,
  onOpenChange,
  kind,
  endpoint,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "video" | "photo";
  endpoint: string;
  onImported: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [folderUrl, setFolderUrl] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) {
      setFolderUrl("");
      setRunning(false);
    }
  }, [open]);

  const noun = kind === "video" ? "video" : "photo";
  const nounPlural = kind === "video" ? "videos" : "photos";
  const supportedHint =
    kind === "video"
      ? ".mp4, .mov, .webm, .m4v"
      : ".jpg, .jpeg, .png, .webp, .gif";

  const handleConfirm = async () => {
    if (!folderUrl.trim() || running) return;
    setRunning(true);
    try {
      const res = await apiRequest("POST", endpoint, { folderUrl: folderUrl.trim() });
      const data = await res.json();
      await onImported();
      const ok = data.created?.length || 0;
      const errorList: Array<{ filename: string; error: string }> =
        Array.isArray(data.errors) ? data.errors : [];
      const failed = errorList.length;
      const skipped: string[] = Array.isArray(data.skipped) ? data.skipped : [];
      // `transcoded` only comes back from the video importer — .mov/.m4v
      // uploads are converted to .mp4 server-side so they play in every
      // browser. Surface the count so the operator knows their files
      // were rewritten on the way in.
      const transcoded: Array<{ filename: string; action: "remux" | "transcode" }> =
        Array.isArray(data.transcoded) ? data.transcoded : [];
      if (ok === 0 && failed === 0) {
        toast({ title: `No ${nounPlural} created`, variant: "destructive" });
        setRunning(false);
        return;
      }
      const parts: string[] = [];
      if (failed > 0) {
        // Surface the first failure's reason — same pattern as the
        // tracks importer. Without this, "5 files couldn't be imported"
        // gave the operator no way to tell a size-cap rejection from
        // an ffmpeg crash.
        const first = errorList[0];
        const why = first ? ` — ${first.filename}: ${first.error}` : "";
        parts.push(
          `${failed} file${failed === 1 ? "" : "s"} couldn't be imported${why}${failed > 1 ? ` (+${failed - 1} more)` : ""}`,
        );
      }
      if (skipped.length > 0) {
        const preview = skipped.slice(0, 3).join(", ");
        parts.push(
          `${skipped.length} skipped (not ${noun}): ${preview}${skipped.length > 3 ? "…" : ""}`,
        );
      }
      if (transcoded.length > 0) {
        parts.push(
          `${transcoded.length} converted to MP4 for playback`,
        );
      }
      const titleSuffix = skipped.length > 0 ? ` · ${skipped.length} skipped` : "";
      toast({
        title: `${ok} ${ok === 1 ? noun : nounPlural} added${titleSuffix}`,
        description: parts.length > 0 ? parts.join(" · ") : undefined,
      });
      setRunning(false);
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Dropbox import failed",
        description: e?.message || "Check the link and try again.",
        variant: "destructive",
      });
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4">
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-[17px] font-semibold text-slate-900">
            Upload multiple {nounPlural}
          </DialogTitle>
          <DialogDescription className="text-[13px] font-normal text-slate-500">
            Pull every {noun} from a Dropbox folder (or a single file) in one go.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <p className="text-[12.5px] leading-snug text-slate-600">
            Share a Dropbox{" "}
            <span className="font-medium text-slate-700">folder</span> for many{" "}
            {nounPlural}, or a single{" "}
            <span className="font-medium text-slate-700">file</span> for one — both as{" "}
            <span className="font-medium text-slate-700">Anyone with the link</span>.{" "}
            {kind === "video" ? "Video" : "Photo"} formats: {supportedHint}.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor={`bulk-bonus-${kind}-url`}
            className="text-[12.5px] font-medium text-slate-700"
          >
            Dropbox folder or file link
          </Label>
          <Input
            id={`bulk-bonus-${kind}-url`}
            type="url"
            placeholder="https://www.dropbox.com/scl/fo/… or /scl/fi/…"
            value={folderUrl}
            onChange={(e) => setFolderUrl(e.target.value)}
            disabled={running}
            autoFocus
            data-testid={`input-bulk-bonus-${kind}-url`}
            className="h-10 text-[14px] bg-white text-slate-900 border-slate-300 placeholder:text-slate-400"
          />
          <p className="text-[11.5px] text-slate-400">
            Folder links import every {noun} inside; file links import that one.
          </p>
        </div>

        <DialogFooter className="flex flex-row justify-end items-center gap-2 pt-2 sm:gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            data-testid={`button-bulk-bonus-${kind}-cancel`}
            className="px-3.5 py-1.5 rounded-md text-[13px] font-medium text-slate-600 hover:bg-slate-100"
          >
            {running ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={running || !folderUrl.trim()}
            data-testid={`button-bulk-bonus-${kind}-confirm`}
            className="px-3.5 py-1.5 rounded-md text-[13px] font-semibold bg-[#319ED8] text-white hover:bg-[#2890c8] disabled:opacity-50 inline-flex items-center gap-2"
          >
            {running ? (
              <>
                <Spinner className="w-3.5 h-3.5 animate-spin" />
                Importing from Dropbox…
              </>
            ) : (
              <>Import from Dropbox</>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VideoTile({
  video,
  onDelete,
  onEdit,
  busy,
}: {
  video: AlbumVideo;
  onDelete: () => void;
  onEdit: () => void;
  busy: boolean;
}) {
  // Primary click on the tile plays the video in place. Edit + Delete
  // remain reachable as discrete affordances in TileActions (separate
  // focus stops, keyboard-accessible). If the file genuinely can't
  // play, surface an inline error instead of a dead click.
  const [playing, setPlaying] = useState(false);
  const [errored, setErrored] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Flag rows that fans can never play so the operator notices before a
  // listener does. Two unrecoverable shapes:
  //   • sourceless placeholder — no source file AND no Mux asset, so no
  //     ingest can ever heal it (the fan sees "Video unavailable").
  //   • errored encode — Mux gave up on the source.
  const hasSource = !!(video.videoUrl && video.videoUrl.trim());
  const noMux = !video.muxAssetId && !video.muxPlaybackId;
  const sourceless = !hasSource && noMux;
  const encodeFailed = video.muxStatus === "errored";
  const flag = sourceless
    ? { label: "No source file", title: "This video has no source file and no Mux asset — fans see “Video unavailable.” Re-upload the video file." }
    : encodeFailed
      ? { label: "Encoding failed", title: video.muxLastError ? `Mux encoding failed: ${video.muxLastError}` : "Mux encoding failed for this video. Re-upload or replace the source file." }
      : null;

  return (
    <div
      className="group relative aspect-video rounded-xl overflow-hidden bg-slate-900 ring-1 ring-slate-200 shadow-sm"
      data-testid={`tile-video-${video.id}`}
    >
      {flag && (
        <div
          className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-900 shadow-sm"
          title={flag.title}
          data-testid={`badge-video-flag-${video.id}`}
        >
          <AlertTriangle className="w-3 h-3 text-amber-700" />
          {flag.label}
        </div>
      )}
      {playing && !errored ? (
        <video
          ref={videoRef}
          src={video.videoUrl}
          poster={video.posterUrl || undefined}
          controls
          autoPlay
          playsInline
          preload="metadata"
          className="w-full h-full object-contain bg-black"
          onError={() => {
            setErrored(true);
            setPlaying(false);
          }}
          data-testid={`video-player-${video.id}`}
        />
      ) : (
        <>
          {video.posterUrl ? (
            <img
              src={video.posterUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            /* No poster — use the first frame of the video as a thumbnail.
               pointer-events-none + disablePictureInPicture + controlsList
               ensure the browser never renders its native control chrome
               (PiP button, fullscreen expand, native play square). */
            <video
              src={video.videoUrl}
              preload="metadata"
              className="w-full h-full object-cover pointer-events-none"
              muted
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          {errored ? (
            <div className="absolute inset-0 flex items-center justify-center p-3">
              <div
                className="text-center text-white text-xs font-medium drop-shadow"
                data-testid={`text-video-error-${video.id}`}
              >
                Couldn't play this video —{" "}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  className="underline underline-offset-2 hover:text-[var(--brand-blue)]"
                  data-testid={`button-video-error-edit-${video.id}`}
                >
                  open to edit
                </button>
                .
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setErrored(false);
                setPlaying(true);
              }}
              aria-label={`Play ${video.title}`}
              className="absolute inset-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-inset"
              data-testid={`button-play-video-${video.id}`}
            >
              {/* Dark pill gives the play icon a consistent backdrop so it
                  reads clearly over both light and dark artwork. */}
              <span className="flex items-center justify-center w-12 h-12 rounded-full bg-black/55 backdrop-blur-[2px] shadow-lg ring-1 ring-white/20">
                <Play className="w-5 h-5 text-white fill-white translate-x-px" />
              </span>
            </button>
          )}
        </>
      )}
      <div
        className="absolute bottom-2 left-2 right-2 text-white text-xs font-semibold truncate drop-shadow pointer-events-none"
        data-testid={`text-video-title-${video.id}`}
      >
        {video.title}
      </div>
      <TileActions onEdit={onEdit} onDelete={onDelete} disabled={busy} />
    </div>
  );
}

function PhotoTile({
  photo,
  onDelete,
  onEdit,
}: {
  photo: AlbumPhoto;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className="group relative aspect-square rounded-xl overflow-hidden bg-slate-100 ring-1 ring-slate-200 shadow-sm"
      data-testid={`tile-photo-${photo.id}`}
    >
      <img
        src={photo.photoUrl}
        alt={photo.caption || ""}
        className="w-full h-full object-cover"
      />
      {photo.caption && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
          <div
            className="absolute bottom-2 left-2 right-2 text-white text-[11.5px] font-medium truncate drop-shadow"
            data-testid={`text-photo-caption-${photo.id}`}
          >
            {photo.caption}
          </div>
        </>
      )}
      <TileActions onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function TileActions({
  onEdit,
  onDelete,
  disabled,
}: {
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity duration-150">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        disabled={disabled}
        aria-label="Edit"
        title="Edit"
        className="w-8 h-8 rounded-full bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 inline-flex items-center justify-center shadow-md disabled:opacity-50"
      >
        <Pencil className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={disabled}
        aria-label="Delete"
        title="Delete"
        className="w-8 h-8 rounded-full bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700 inline-flex items-center justify-center shadow-md disabled:opacity-50"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * Rich empty-state dropzone for the Bonus → Videos panel.
 *
 * Three ingest paths, all flowing into the same sheet (which already
 * handles upload progress, URL ingest, title/poster/description):
 *   1. Drag and drop a video file onto the zone.
 *   2. Click anywhere on the zone to open the OS file picker.
 *   3. Paste a video URL (Dropbox/Drive share link or direct MP4/MOV/WebM).
 *
 * The selected file or URL is handed to BonusVideos which opens the
 * sheet with that value pre-primed — Bill just confirms the title and
 * clicks Add.
 */
function BonusVideoDropzone({
  onPickFile,
  onPickUrl,
}: {
  onPickFile: (f: File) => void;
  onPickUrl: (u: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [url, setUrl] = useState("");
  return (
    <div data-testid="bonus-video-empty">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files?.[0]) onPickFile(e.dataTransfer.files[0]);
        }}
        className={[
          "w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center px-6 py-12 transition-colors",
          dragActive
            ? "border-[var(--brand-blue)] bg-[var(--brand-blue)]/5"
            : "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300",
        ].join(" ")}
        data-testid="dropzone-bonus-video"
      >
        <Film
          className={[
            "w-9 h-9 mb-3 transition-colors",
            dragActive ? "text-[var(--brand-blue)]" : "text-slate-400",
          ].join(" ")}
          strokeWidth={1.5}
        />
        <p className="text-slate-700 text-[13.5px] font-semibold">
          Drop a video here, or click to browse
        </p>
        <p className="text-slate-500 text-[11.5px] mt-1">
          MP4 / MOV / WebM · up to 500 MB
        </p>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) onPickFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {/* Or paste a URL — Dropbox, Drive, direct MP4, etc. */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
          or paste a link
        </span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <form
        className="mt-3 flex items-stretch gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = url.trim();
          if (trimmed) onPickUrl(trimmed);
        }}
      >
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.dropbox.com/scl/… or https://…/video.mp4"
            className="w-full h-9 pl-9 pr-3 text-[13px] bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[var(--brand-blue)] focus:ring-1 focus:ring-[var(--brand-blue)]/30"
            data-testid="input-bonus-video-url"
          />
        </div>
        <button
          type="submit"
          disabled={!url.trim()}
          className="h-9 px-4 rounded-lg bg-[var(--brand-blue)] text-white text-[13px] font-semibold hover:bg-[#2a8ac0] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
          data-testid="button-bonus-video-import"
        >
          Import
        </button>
      </form>
    </div>
  );
}

/**
 * Rich empty-state dropzone for the Bonus → Photos panel.
 *
 * Two ingest paths (no URL ingest for photos — the photo sheet is
 * file-only today):
 *   1. Drag and drop an image onto the zone.
 *   2. Click anywhere on the zone to open the OS file picker.
 */
function BonusPhotoDropzone({
  onPickFile,
}: {
  onPickFile: (f: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  return (
    <div data-testid="bonus-photo-empty">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files?.[0]) onPickFile(e.dataTransfer.files[0]);
        }}
        className={[
          "w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center px-6 py-12 transition-colors",
          dragActive
            ? "border-[var(--brand-blue)] bg-[var(--brand-blue)]/5"
            : "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300",
        ].join(" ")}
        data-testid="dropzone-bonus-photo"
      >
        <ImagePlus
          className={[
            "w-9 h-9 mb-3 transition-colors",
            dragActive ? "text-[var(--brand-blue)]" : "text-slate-400",
          ].join(" ")}
          strokeWidth={1.5}
        />
        <p className="text-slate-700 text-[13.5px] font-semibold">
          Drop a photo here, or click to browse
        </p>
        <p className="text-slate-500 text-[11.5px] mt-1">
          JPG / PNG / WebP · up to 8 MB
        </p>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) onPickFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function AddTile({
  busy,
  label,
  onClick,
  testId,
}: {
  busy: boolean;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-testid={testId}
      className={[
        "aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 text-slate-400 transition-colors",
        busy
          ? "border-slate-200 bg-slate-50 cursor-not-allowed"
          : "border-slate-200 hover:border-[var(--brand-blue)] hover:text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/5",
      ].join(" ")}
    >
      {busy ? (
        <Spinner className="w-5 h-5 animate-spin" />
      ) : (
        <Plus className="w-6 h-6" />
      )}
      <span className="text-[11.5px] font-semibold">{label}</span>
    </button>
  );
}

/* ─── (No more phase placeholders — all five tabs are real) ────────── */


/* ─── Bits ─────────────────────────────────────────────────────────── */

function LifecyclePill({
  label,
  tone,
}: {
  label: string;
  tone: "slate" | "amber" | "mint";
}) {
  const cls =
    tone === "mint"
      ? "bg-[var(--brand-mint)]/15 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";
  return (
    <span
      className={[
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider normal-case",
        cls,
      ].join(" ")}
      data-testid="badge-lifecycle"
    >
      {label}
    </span>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ─── Add/Edit video sheet ─────────────────────────────────────────── */

function AlbumVideoSheet({
  mode,
  albumId,
  onClose,
  onSaved,
  onRequestDelete,
}: {
  mode:
    | { kind: "new"; initialFile?: File; initialUrl?: string }
    | { kind: "edit"; video: AlbumVideo };
  albumId: string;
  onClose: () => void;
  onSaved: (created?: AlbumVideo) => void;
  onRequestDelete: (v: AlbumVideo) => void;
}) {
  const isEdit = mode.kind === "edit";
  const existing = isEdit ? mode.video : null;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [posterUrl, setPosterUrl] = useState<string | null>(
    existing?.posterUrl ?? null,
  );
  // True when `posterUrl` was filled in by `captureVideoPosterFrame`
  // rather than by an explicit operator upload. We use this so that
  // replacing the picked video re-generates the thumbnail, but a poster
  // the operator picked by hand (or the existing one on an edit) is
  // never overwritten by the auto-capture.
  const [posterAutoGenerated, setPosterAutoGenerated] = useState(false);
  const [posterCapturing, setPosterCapturing] = useState(false);
  // Staleness guard for auto-capture. Each new `handlePickFile` (and any
  // operator action that should invalidate an in-flight capture — manual
  // poster upload, poster removal) bumps the token. When the async
  // capture+upload settles, we only apply the result if our token is
  // still the latest. Without this, a slow capture could clobber a
  // poster the operator picked in the meantime, or an older video's
  // frame could overwrite a newer pick.
  const posterCaptureTokenRef = useRef(0);

  const [source, setSource] = useState<"upload" | "url">("upload");
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [pickedFilePreview, setPickedFilePreview] = useState<string | null>(
    null,
  );
  const [importUrl, setImportUrl] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);
  // Ref to the visible preview <video> so the "Use this frame" scrubber
  // button can grab the operator's chosen frame instead of the default
  // auto-pick (~10% in).
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    return () => {
      if (pickedFilePreview) URL.revokeObjectURL(pickedFilePreview);
    };
  }, [pickedFilePreview]);

  function prettyTitleFromName(name: string): string {
    // "tiny-desk_take.2.mov" → "Tiny Desk Take 2"
    const stem = name.replace(/\.[^.]+$/, "");
    const spaced = stem.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
    return spaced
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ") || "Untitled video";
  }

  function handlePickFile(file: File) {
    if (pickedFilePreview) URL.revokeObjectURL(pickedFilePreview);
    setPickedFile(file);
    setPickedFilePreview(URL.createObjectURL(file));
    // Title autofill — prefer the prettifier (handles `tiny-desk.mov`
    // → `Tiny Desk`) over a bare stem.
    if (!title) setTitle(prettyTitleFromName(file.name));
    // Auto-grab a still frame for the Thumbnail slot when the operator
    // hasn't supplied one (or only has an earlier auto-generated frame
    // from a previously picked file). Best-effort: any failure leaves
    // the slot empty so the operator can still upload by hand.
    if (!posterUrl || posterAutoGenerated) {
      const token = ++posterCaptureTokenRef.current;
      void autoCaptureThumbnail(file, token);
    } else {
      // Operator already has a manual poster — invalidate any
      // still-pending capture from a previous pick so its late result
      // can't sneak in.
      posterCaptureTokenRef.current++;
    }
  }

  async function autoCaptureThumbnail(file: File, token: number) {
    setPosterCapturing(true);
    try {
      const blob = await captureVideoPosterFrame(file);
      // Bail if a newer pick (or a manual poster upload / removal)
      // happened while we were capturing — its token would have
      // bumped past ours.
      if (token !== posterCaptureTokenRef.current) return;
      if (!blob) return;
      // Always derive the JPEG name from the video filename so the
      // operator can recognize it in object storage.
      const base = file.name.replace(/\.[^.]+$/, "") || "frame";
      const posterFile = new File([blob], `${base}.jpg`, { type: "image/jpeg" });
      const url = await uploadImageFile(posterFile);
      // Re-check after the upload too — operator could have acted
      // between the capture and the upload completing.
      if (token !== posterCaptureTokenRef.current) return;
      setPosterUrl(url);
      setPosterAutoGenerated(true);
    } catch {
      // Silent — the manual Thumbnail upload still works.
    } finally {
      // Only the latest capture owns the "Capturing…" UI state.
      if (token === posterCaptureTokenRef.current) setPosterCapturing(false);
    }
  }

  // Pick up a file or URL primed by the inline empty-state dropzone, so
  // dragging a video onto the panel flows straight into the sheet with
  // the file already attached.
  useEffect(() => {
    if (mode.kind !== "new") return;
    if (mode.initialFile) {
      handlePickFile(mode.initialFile);
    } else if (mode.initialUrl) {
      setSource("url");
      setImportUrl(mode.initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Operator scrubbed the picked video to a frame they like and tapped
  // "Use this frame." Captures the current frame from the visible
  // preview, uploads it as the poster, and marks it auto-generated so
  // re-picking the video file will overwrite it (but a manual upload
  // from the Thumbnail row still wins).
  async function handleUseCurrentFrame() {
    const v = previewVideoRef.current;
    if (!v) return;
    posterCaptureTokenRef.current++; // invalidate any in-flight auto-capture
    const token = posterCaptureTokenRef.current;
    setPosterCapturing(true);
    try {
      const blob = await captureFrameFromVideoElement(v);
      if (!blob || token !== posterCaptureTokenRef.current) return;
      const base = (pickedFile?.name || "frame").replace(/\.[^.]+$/, "") || "frame";
      const posterFile = new File([blob], `${base}.jpg`, { type: "image/jpeg" });
      const url = await uploadImageFile(posterFile);
      if (token !== posterCaptureTokenRef.current) return;
      setPosterUrl(url);
      setPosterAutoGenerated(true);
    } catch (e: any) {
      setErr(e?.message || "Couldn't capture that frame — try another spot.");
    } finally {
      if (token === posterCaptureTokenRef.current) setPosterCapturing(false);
    }
  }

  // Title autofill for the URL flow: as Bill pastes/types a URL, derive
  // a pretty title from the URL's last path segment whenever the title
  // is still empty. He can edit before save. We only run this when the
  // form-side title is empty so we never clobber a manual edit.
  useEffect(() => {
    if (isEdit || source !== "url") return;
    if (title.trim()) return;
    const trimmed = importUrl.trim();
    if (!trimmed) return;
    try {
      const u = new URL(trimmed);
      const lastSeg = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
      if (lastSeg) setTitle(prettyTitleFromName(lastSeg));
    } catch {
      /* not a parseable URL yet — leave title alone */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importUrl, source]);

  async function handlePickPoster(file: File) {
    // Invalidate any in-flight auto-capture so its late result can't
    // clobber the operator's manual pick.
    posterCaptureTokenRef.current++;
    setPosterCapturing(false);
    try {
      setErr(null);
      const url = await uploadImageFile(file);
      setPosterUrl(url);
      // Operator picked this by hand — don't let a subsequent video
      // re-pick overwrite it.
      setPosterAutoGenerated(false);
    } catch (e: any) {
      setErr(e?.message || "Poster upload failed");
    }
  }

  const canSubmit = isEdit
    ? title.trim().length > 0
    : (source === "upload" && !!pickedFile && title.trim().length > 0) ||
      (source === "url" && importUrl.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    setProgress(null);
    try {
      if (isEdit && existing) {
        await apiRequest("PUT", `/api/admin/album-videos/${existing.id}`, {
          title: title.trim(),
          description: description.trim() || null,
          posterUrl,
        });
      } else {
        let videoUrl = "";
        // Resolve title + poster in locals so the create POST sees the
        // server-extracted values for URL imports — `setTitle` /
        // `setPosterUrl` here would only update state for the *next*
        // render, not the request body we're about to send.
        let resolvedTitle = title.trim();
        let resolvedPosterUrl = posterUrl;
        let resolvedSourceUrl: string | null = null;
        if (source === "upload" && pickedFile) {
          setProgress(0);
          const uploaded = await uploadVideoFile(pickedFile, (f) =>
            setProgress(Math.min(0.99, f)),
          );
          videoUrl = uploaded.url;
          // The client tries a canvas capture on pick, but it fails on
          // codecs the browser can't decode (e.g. HEVC .mov). Fall back to
          // the server-extracted still so the tile always has a real poster.
          if (!resolvedPosterUrl && uploaded.posterUrl) {
            resolvedPosterUrl = uploaded.posterUrl;
            setPosterUrl(resolvedPosterUrl);
          }
        } else if (source === "url") {
          const pastedUrl = importUrl.trim();
          resolvedSourceUrl = pastedUrl;
          // Defensive title derive — the [importUrl, source] autofill
          // useEffect normally fires before submit, but if Bill pastes
          // and clicks Add fast enough, or pastes into a freshly
          // primed sheet where the effect's render hasn't committed,
          // we still want a real title in the POST body. Same logic
          // as the autofill effect, run once more right at submit.
          if (!resolvedTitle && pastedUrl) {
            try {
              const u = new URL(pastedUrl);
              const lastSeg = decodeURIComponent(
                u.pathname.split("/").filter(Boolean).pop() || "",
              );
              if (lastSeg) resolvedTitle = prettyTitleFromName(lastSeg);
            } catch { /* leave empty — server suggestion fills in */ }
          }
          const res = await apiRequest(
            "POST",
            "/api/admin/upload-video/from-url",
            { url: pastedUrl },
          );
          const data = await res.json();
          videoUrl = data.url;
          if (!resolvedTitle && data.suggestedTitle) {
            resolvedTitle = prettyTitleFromName(String(data.suggestedTitle));
            setTitle(resolvedTitle);
          }
          // Pick up the server-extracted poster only if Bill hasn't
          // already chosen one for this sheet session.
          if (!resolvedPosterUrl && data.posterUrl) {
            resolvedPosterUrl = String(data.posterUrl);
            setPosterUrl(resolvedPosterUrl);
          }
        }
        const finalTitle =
          resolvedTitle ||
          (source === "url" ? "Imported video" : "Untitled video");
        const created = await apiRequest(
          "POST",
          `/api/admin/albums/${albumId}/videos`,
          {
            videoUrl,
            title: finalTitle,
            description: description.trim() || null,
            posterUrl: resolvedPosterUrl,
            sourceUrl: resolvedSourceUrl,
          },
        );
        // Pass the just-saved row back to the parent so the sheet can
        // transition into Edit mode instead of slamming shut — Bill
        // wanted to be able to tweak the title / thumbnail right after
        // a URL import without having to find the tile and re-open
        // the sheet.
        try {
          const savedRow = await created.json();
          onSaved(savedRow as AlbumVideo);
          return;
        } catch { /* fall through to no-arg onSaved below */ }
      }
      onSaved();
    } catch (e: any) {
      console.error("[AlbumVideoSheet] submit failed", e);
      setErr(friendlyVideoError(e?.message || ""));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (busy) return;
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="!bg-white !border-slate-200 !rounded-2xl !shadow-xl !p-0 !gap-0 max-w-2xl max-h-[90vh] overflow-hidden flex flex-col [&>button]:!text-slate-400 [&>button]:hover:!text-slate-700"
        data-testid="dialog-album-video-sheet"
      >
        <DialogHeader className="px-5 py-4 border-b border-slate-100 flex-shrink-0 space-y-0">
          <DialogTitle className="text-slate-900 text-[17px] font-semibold">
            {isEdit ? "Edit video" : "Add a video"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit
              ? "Update the video's title, description, or thumbnail."
              : "Pick a video file or paste a link, then give it a title and an optional description."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 pb-4">
            {isEdit ? (
              <>
                {/* Real inline player — the previous edit preview was a
                    poster image with an "open in new tab" overlay,
                    which made it impossible to confirm the video
                    actually plays without leaving the dialog. Native
                    controls let Bill check playback right here. */}
                <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-slate-200">
                  <video
                    src={existing?.videoUrl}
                    poster={existing?.posterUrl || undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain bg-black"
                    data-testid="video-preview-album-video"
                  />
                </div>
                {existing?.sourceUrl && (
                  <div className="mt-2 flex items-center gap-2 text-[11.5px] text-slate-500">
                    <span className="font-medium uppercase tracking-wide text-slate-400">
                      Imported from
                    </span>
                    <a
                      href={existing.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-slate-600 hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
                      data-testid="link-album-video-source-url"
                    >
                      {(() => {
                        try { return new URL(existing.sourceUrl).hostname.replace(/^www\./, ""); }
                        catch { return existing.sourceUrl; }
                      })()}
                    </a>
                  </div>
                )}
              </>
            ) : pickedFile || pickedFilePreview ? (
              <>
                <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-200">
                  {pickedFilePreview ? (
                    <video
                      ref={previewVideoRef}
                      src={pickedFilePreview}
                      className="w-full h-full object-contain bg-black"
                      muted
                      playsInline
                      controls
                      data-testid="video-preview-picked"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Play
                        className="w-10 h-10 text-slate-600"
                        strokeWidth={1.5}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    className="absolute top-3 right-3 text-xs font-medium px-2.5 py-1.5 rounded-md bg-white/95 backdrop-blur-md text-slate-700 hover:text-[var(--brand-blue)] shadow-sm border border-black/5 disabled:opacity-50"
                    data-testid="button-replace-video-file"
                  >
                    Replace video
                  </button>
                </div>
                {/* Scrub the preview to the frame the operator wants and
                    promote it to the Thumbnail slot. Beats "we picked
                    one for you" when the auto-grab landed on a black
                    intro or a closed eye. */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleUseCurrentFrame}
                    disabled={busy || posterCapturing}
                    className="text-xs font-medium px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                    data-testid="button-use-current-frame-as-thumbnail"
                  >
                    <ImagePlus className="w-3.5 h-3.5" strokeWidth={1.75} />
                    {posterCapturing ? "Capturing…" : "Use this frame as thumbnail"}
                  </button>
                  <p className="text-[11px] text-slate-400">
                    Scrub the video, then tap to make that frame the thumbnail.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="inline-flex p-0.5 rounded-lg bg-slate-100 mb-3 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setSource("upload")}
                    className={
                      "px-3 py-1.5 rounded-md transition-colors " +
                      (source === "upload"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700")
                    }
                    data-testid="tab-source-upload"
                  >
                    Upload file
                  </button>
                  <button
                    type="button"
                    onClick={() => setSource("url")}
                    className={
                      "px-3 py-1.5 rounded-md transition-colors " +
                      (source === "url"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700")
                    }
                    data-testid="tab-source-url"
                  >
                    Import from URL
                  </button>
                </div>

                {source === "upload" ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      if (e.dataTransfer.files?.[0])
                        handlePickFile(e.dataTransfer.files[0]);
                    }}
                    className={
                      "w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-colors " +
                      (dragActive
                        ? "border-[var(--brand-blue)] bg-blue-50"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300")
                    }
                    data-testid="button-video-dropzone"
                  >
                    <svg
                      className={
                        "w-8 h-8 mb-3 transition-colors " +
                        (dragActive ? "text-[var(--brand-blue)]" : "text-slate-400")
                      }
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                      <path d="M12 12v9" />
                      <path d="m16 16-4-4-4 4" />
                    </svg>
                    <p className="text-sm font-medium text-slate-700">
                      Drop a video here, or click to browse
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      MP4, MOV, or WebM · up to 500MB
                    </p>
                  </button>
                ) : (
                  <div className="w-full aspect-video rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-6">
                    <svg
                      className="w-7 h-7 text-slate-400 mb-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
                      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    <p className="text-sm font-medium text-slate-700 mb-3">
                      Paste a video link
                    </p>
                    <input
                      type="url"
                      autoFocus
                      placeholder="https://www.dropbox.com/scl/fi/… or https://…/video.mp4"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      className="w-full max-w-md text-sm bg-white border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[var(--brand-blue)] focus:ring-1 focus:ring-[var(--brand-blue)]/30"
                      data-testid="input-video-import-url"
                    />
                    <p className="text-[11px] text-slate-400 mt-2 text-center">
                      We'll pull the file straight into storage — no need to
                      download it first.
                    </p>
                  </div>
                )}
              </>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handlePickFile(e.target.files[0]);
              }}
            />
          </div>

          <div className="px-5 pb-2 space-y-4">
            <div>
              <label
                htmlFor="album-video-title"
                className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide"
              >
                Title
              </label>
              <input
                id="album-video-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Live at the Troubadour — 2019"
                className="w-full text-sm text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--brand-blue)] focus:ring-1 focus:ring-[var(--brand-blue)]/30"
                data-testid="input-album-video-title"
              />
            </div>

            <div>
              <label
                htmlFor="album-video-description"
                className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide"
              >
                Description
                <span className="ml-2 normal-case tracking-normal text-slate-400 text-[11px] font-normal">
                  optional
                </span>
              </label>
              <textarea
                id="album-video-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short note that shows under the video on the album page."
                rows={2}
                className="w-full text-sm text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--brand-blue)] focus:ring-1 focus:ring-[var(--brand-blue)]/30 resize-none"
                data-testid="input-album-video-description"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">
                Thumbnail
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => posterInputRef.current?.click()}
                  className="aspect-video w-28 rounded-lg border-2 border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                  title="Upload custom thumbnail"
                  data-testid="button-upload-album-video-poster"
                >
                  <Plus className="w-5 h-5" />
                </button>
                {posterUrl ? (
                  <div className="relative aspect-video w-28 rounded-lg overflow-hidden border-2 border-[var(--brand-blue)] flex-shrink-0">
                    <img
                      src={posterUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        // Cancel any in-flight auto-capture too, so a
                        // late result can't refill the slot the
                        // operator just emptied.
                        posterCaptureTokenRef.current++;
                        setPosterCapturing(false);
                        setPosterUrl(null);
                        setPosterAutoGenerated(false);
                      }}
                      className="absolute top-1 right-1 p-0.5 rounded-full bg-white/90 hover:bg-white text-slate-600 hover:text-red-600 shadow-sm"
                      title="Remove thumbnail"
                      aria-label="Remove thumbnail"
                      data-testid="button-remove-album-video-poster"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="aspect-video w-28 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center text-slate-300 flex-shrink-0">
                    <ImagePlus className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                )}
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="aspect-video w-28 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50 opacity-40 flex items-center justify-center flex-shrink-0"
                    title="Frames from video (coming soon)"
                  >
                    <Play
                      className="w-4 h-4 text-slate-400 ml-0.5"
                      strokeWidth={1.5}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {posterCapturing
                  ? "Grabbing a frame from your video…"
                  : posterAutoGenerated
                    ? "Pulled from your video — upload a still to replace it (16:9 · 1280×720 or 1920×1080 · JPG/PNG/WebP)."
                    : "Upload a still (16:9 · 1280×720 or 1920×1080 retina · JPG/PNG/WebP). When you pick a video file we'll auto-grab a frame for you."}
              </p>
              <input
                ref={posterInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handlePickPoster(e.target.files[0]);
                }}
              />
            </div>

            {err && (
              <div
                role="alert"
                className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-[13px] leading-snug"
                data-testid="banner-album-video-error"
              >
                {err}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-slate-100 flex items-center !justify-between bg-slate-50/50 flex-shrink-0 gap-2 sm:gap-2">
          <div>
            {isEdit && existing && (
              <button
                type="button"
                onClick={() => onRequestDelete(existing)}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors disabled:opacity-50"
                data-testid="button-delete-from-sheet"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete video
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              data-testid="button-cancel-album-video-sheet"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || busy}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--brand-blue)] hover:bg-[#2a8ac0] disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              data-testid="button-submit-album-video-sheet"
            >
              {busy ? (
                <>
                  <Spinner className="w-3.5 h-3.5 animate-spin" />
                  {progress !== null
                    ? `Uploading ${Math.round(progress * 100)}%`
                    : isEdit
                      ? "Saving…"
                      : "Adding…"}
                </>
              ) : (
                <>{isEdit ? "Save" : "Add video"}</>
              )}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Add/Edit photo sheet ─────────────────────────────────────────── */

function AlbumPhotoSheet({
  mode,
  albumId,
  onClose,
  onSaved,
  onRequestDelete,
}: {
  mode: { kind: "new" } | { kind: "edit"; photo: AlbumPhoto };
  albumId: string;
  onClose: () => void;
  onSaved: () => void;
  onRequestDelete: (p: AlbumPhoto) => void;
}) {
  const isEdit = mode.kind === "edit";
  const existing = isEdit ? mode.photo : null;

  const [caption, setCaption] = useState(existing?.caption ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(
    existing?.photoUrl ?? null,
  );
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Mirrors the video sheet — segmented control swaps the dropzone for a
  // URL field. Posts to /api/admin/fetch-image-from-url which validates
  // the MIME (JPG/PNG/WebP/GIF/AVIF), enforces the 8 MB cap, and uploads
  // to object storage. Dropbox share links are auto-normalized server-side.
  const [source, setSource] = useState<"upload" | "url">("upload");
  const [importUrl, setImportUrl] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePickFile(file: File) {
    setErr(null);
    setUploadingImage(true);
    try {
      const url = await uploadImageFile(file);
      setPhotoUrl(url);
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleImportUrl() {
    let trimmed = importUrl.trim();
    if (!trimmed) {
      setErr("Paste a URL first.");
      return;
    }
    // Friendly autofix: assume https if the operator pasted a bare host.
    if (!/^https?:\/\//i.test(trimmed)) trimmed = `https://${trimmed}`;
    setErr(null);
    setUploadingImage(true);
    try {
      const res = await apiRequest("POST", "/api/admin/fetch-image-from-url", {
        url: trimmed,
      });
      const { url } = (await res.json()) as { url: string };
      setPhotoUrl(url);
    } catch (e: any) {
      // apiRequest throws with a "<status>: <body>" string. Strip the
      // status prefix and try to pull a clean `message` out of the JSON
      // payload so we render "Image is larger than 8 MB." instead of
      // `413: {"message":"Image is larger than 8 MB."}`.
      const raw = String(e?.message || "");
      const jsonStart = raw.indexOf("{");
      if (jsonStart >= 0) {
        try {
          const parsed = JSON.parse(raw.slice(jsonStart));
          if (parsed?.message) {
            setErr(String(parsed.message));
            return;
          }
        } catch {
          /* fall through */
        }
      }
      setErr(raw.replace(/^\d+:\s*/, "") || "Couldn't fetch that image.");
    } finally {
      setUploadingImage(false);
    }
  }

  // Reset transient mode-specific state when the operator flips the
  // segmented control so a stale error or drag-hover doesn't leak from
  // one mode into the other.
  function handleSourceChange(next: "upload" | "url") {
    if (next === source) return;
    setSource(next);
    setErr(null);
    setDragActive(false);
  }

  // Mirror the video sheet: if the empty-state dropzone primed us with
  // a file, kick off the upload immediately on mount.
  useEffect(() => {
    if (mode.kind === "new" && mode.initialFile) {
      handlePickFile(mode.initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = !!photoUrl && !uploadingImage && !busy;

  async function handleSubmit() {
    if (!canSubmit || !photoUrl) return;
    setBusy(true);
    setErr(null);
    try {
      const trimmed = caption.trim();
      if (isEdit && existing) {
        await apiRequest("PUT", `/api/admin/album-photos/${existing.id}`, {
          photoUrl,
          caption: trimmed || null,
        });
      } else {
        await apiRequest("POST", `/api/admin/albums/${albumId}/photos`, {
          photoUrl,
          caption: trimmed || null,
        });
      }
      onSaved();
    } catch (e: any) {
      console.error("[AlbumPhotoSheet] submit failed", e);
      setErr(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (busy || uploadingImage) return;
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="!bg-white !border-slate-200 !rounded-2xl !shadow-xl !p-0 !gap-0 max-w-2xl max-h-[90vh] overflow-hidden flex flex-col [&>button]:!text-slate-400 [&>button]:hover:!text-slate-700"
        data-testid="dialog-album-photo-sheet"
      >
        <DialogHeader className="px-5 py-4 border-b border-slate-100 flex-shrink-0 space-y-0">
          <DialogTitle className="text-slate-900 text-[17px] font-semibold">
            {isEdit ? "Edit photo" : "Add a photo"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit
              ? "Update the photo or its caption."
              : "Pick an image, then add an optional caption."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 pb-4">
            {photoUrl ? (
              <div className="relative w-full max-w-sm mx-auto aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                <img
                  src={photoUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
                {uploadingImage && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <Spinner className="w-5 h-5 text-[var(--brand-blue)] animate-spin" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage || busy}
                  className="absolute bottom-3 right-3 text-xs font-medium px-2.5 py-1.5 rounded-md bg-white/95 backdrop-blur-md text-slate-700 hover:text-[var(--brand-blue)] shadow-sm border border-black/5 disabled:opacity-50"
                  data-testid="button-replace-album-photo"
                >
                  Replace photo
                </button>
              </div>
            ) : (
              <div className="w-full max-w-sm mx-auto">
                {/* Segmented control matches the video sheet — Upload vs.
                    Paste a link. Photos are typically small enough that
                    a URL import is the faster path (Dropbox previews,
                    Wikipedia images, press kits, etc.). */}
                <div className="inline-flex p-0.5 rounded-lg bg-slate-100 mb-3 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => handleSourceChange("upload")}
                    className={
                      "px-3 py-1.5 rounded-md transition-colors " +
                      (source === "upload"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700")
                    }
                    data-testid="tab-photo-source-upload"
                  >
                    Upload file
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSourceChange("url")}
                    className={
                      "px-3 py-1.5 rounded-md transition-colors " +
                      (source === "url"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700")
                    }
                    data-testid="tab-photo-source-url"
                  >
                    Paste a link
                  </button>
                </div>

                {source === "upload" ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      if (e.dataTransfer.files?.[0])
                        handlePickFile(e.dataTransfer.files[0]);
                    }}
                    disabled={uploadingImage}
                    className={
                      "w-full block aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-colors disabled:opacity-50 " +
                      (dragActive
                        ? "border-[var(--brand-blue)] bg-blue-50"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300")
                    }
                    data-testid="button-photo-dropzone"
                  >
                    {uploadingImage ? (
                      <>
                        <Spinner className="w-7 h-7 text-[var(--brand-blue)] animate-spin mb-3" />
                        <p className="text-sm font-medium text-slate-700">
                          Uploading…
                        </p>
                      </>
                    ) : (
                      <>
                        <ImagePlus
                          className={
                            "w-8 h-8 mb-3 transition-colors " +
                            (dragActive ? "text-[var(--brand-blue)]" : "text-slate-400")
                          }
                          strokeWidth={1.75}
                        />
                        <p className="text-sm font-medium text-slate-700">
                          Drop a photo here, or click to browse
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Square · 1200×1200 px recommended · JPG, PNG, WebP, or GIF
                        </p>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="w-full aspect-square rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-6">
                    {uploadingImage ? (
                      <>
                        <Spinner className="w-7 h-7 text-[var(--brand-blue)] animate-spin mb-3" />
                        <p className="text-sm font-medium text-slate-700">
                          Fetching…
                        </p>
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-7 h-7 text-slate-400 mb-3"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 17H7A5 5 0 0 1 7 7h2" />
                          <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
                          <line x1="8" y1="12" x2="16" y2="12" />
                        </svg>
                        <p className="text-sm font-medium text-slate-700 mb-3">
                          Paste a photo link
                        </p>
                        <input
                          type="url"
                          autoFocus
                          placeholder="https://www.dropbox.com/scl/fi/… or https://…/photo.jpg"
                          value={importUrl}
                          onChange={(e) => setImportUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleImportUrl();
                            }
                          }}
                          className="w-full max-w-md text-sm bg-white border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[var(--brand-blue)] focus:ring-1 focus:ring-[var(--brand-blue)]/30"
                          data-testid="input-photo-import-url"
                        />
                        <button
                          type="button"
                          onClick={handleImportUrl}
                          disabled={!importUrl.trim() || uploadingImage}
                          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--brand-blue)] text-white text-xs font-semibold hover:bg-[var(--brand-blue)]/90 disabled:opacity-50 disabled:cursor-not-allowed"
                          data-testid="button-photo-import-url-submit"
                        >
                          Fetch image
                        </button>
                        <p className="text-[11px] text-slate-400 mt-2 text-center">
                          JPG, PNG, WebP, GIF, or AVIF · up to 8 MB. Dropbox links work too.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handlePickFile(e.target.files[0]);
              }}
            />
          </div>

          <div className="px-5 pb-2 space-y-4">
            <div>
              <label
                htmlFor="album-photo-caption"
                className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide"
              >
                Caption
                <span className="ml-2 normal-case tracking-normal text-slate-400 text-[11px] font-normal">
                  optional
                </span>
              </label>
              <input
                id="album-photo-caption"
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="e.g. Nick on stage — Brooklyn Steel, 2024"
                className="w-full text-sm text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--brand-blue)] focus:ring-1 focus:ring-[var(--brand-blue)]/30"
                data-testid="input-album-photo-caption"
              />
            </div>

            {err && (
              <div
                role="alert"
                className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-[13px] leading-snug"
                data-testid="banner-album-photo-error"
              >
                {err}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-slate-100 flex items-center !justify-between bg-slate-50/50 flex-shrink-0 gap-2 sm:gap-2">
          <div>
            {isEdit && existing && (
              <button
                type="button"
                onClick={() => onRequestDelete(existing)}
                disabled={busy || uploadingImage}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors disabled:opacity-50"
                data-testid="button-delete-photo-from-sheet"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete photo
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy || uploadingImage}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              data-testid="button-cancel-album-photo-sheet"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--brand-blue)] hover:bg-[#2a8ac0] disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              data-testid="button-submit-album-photo-sheet"
            >
              {busy ? (
                <>
                  <Spinner className="w-3.5 h-3.5 animate-spin" />
                  {isEdit ? "Saving…" : "Adding…"}
                </>
              ) : (
                <>{isEdit ? "Save" : "Add photo"}</>
              )}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Task #190 — AlbumLineupPanel ────────────────────────────────────
// Per-album snapshot of who played on this record. Defaults to "use
// band's current roster" when empty — admin can then add/remove/order
// to capture the actual session lineup (which may differ from the
// touring lineup of the year).
type LineupRow = {
  id: string;
  albumId: string;
  memberId: string;
  roles: string[] | null;
  displayOrder: number;
  memberName: string;
  memberPhotoUrl: string | null;
};
type BandMemberLite = {
  id: string;
  bandId: string;
  memberId: string;
  roles: string[] | null;
  leftYear: number | null;
  displayOrder: number;
  person: { id: string; name: string; photoUrl: string | null } | null;
};

function AlbumLineupPanel({
  album,
  disabled,
  disabledReason,
}: {
  album: AlbumFull;
  disabled: boolean;
  disabledReason?: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const lineupKey = ["/api/admin/albums", album.id, "lineup"] as const;
  const { data: lineup = [], isLoading } = useQuery<LineupRow[]>({
    queryKey: lineupKey,
    queryFn: async () => {
      const r = await fetch(`/api/admin/albums/${album.id}/lineup`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });
  // Resolve the primary artist's Person so we can tell whether the
  // bound artist is actually a group; only groups get the "Use band's
  // lineup" default + member picker that draws from the band roster.
  // Share the default fetcher (not a bespoke queryFn) so this observer of
  // ["/api/people", id] stays in lock-step with ShareLinkPanel / SellPanel
  // instead of racing them under the app-wide staleTime: Infinity.
  const { data: primaryArtist } = useQuery<{
    id: string;
    name: string;
    isGroup?: boolean;
    artistShareSlug?: string | null;
  }>({
    queryKey: ["/api/people", album.primaryArtistId],
    enabled: !!album.primaryArtistId,
  });
  const { data: bandRoster = [] } = useQuery<BandMemberLite[]>({
    queryKey: ["/api/people", album.primaryArtistId, "members"],
    queryFn: async () => {
      const r = await fetch(`/api/people/${album.primaryArtistId}/members`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!album.primaryArtistId && !!primaryArtist?.isGroup,
  });

  // Task #193 — distinct performers rolled up from per-track SuperCredits.
  // The query refreshes whenever credits are re-imported (callers
  // invalidate ["/api/admin/albums", album.id, "lineup"]), so the
  // panel surfaces "we just learned about these people" without an
  // extra click.
  type LineupSuggestion = {
    memberId: string;
    personName: string;
    photoUrl: string | null;
    roles: string[];
    trackCount: number;
  };
  const suggestKey = ["/api/admin/albums", album.id, "lineup", "suggest"] as const;
  const { data: suggestion = [] } = useQuery<LineupSuggestion[]>({
    queryKey: suggestKey,
    queryFn: async () => {
      const r = await fetch(`/api/admin/albums/${album.id}/lineup/suggest`, {
        credentials: "include",
      });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (members: Array<{ memberId: string; roles: string[] | null; displayOrder: number }>) =>
      apiRequest("PUT", `/api/admin/albums/${album.id}/lineup`, { members }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lineupKey });
      qc.invalidateQueries({ queryKey: ["/api/albums", album.id, "lineup"] });
      toast({ title: "Lineup saved" });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't save lineup",
        description: String(e?.message ?? e),
        variant: "destructive",
      }),
  });
  const clearMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/admin/albums/${album.id}/lineup`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lineupKey });
      qc.invalidateQueries({ queryKey: ["/api/albums", album.id, "lineup"] });
    },
  });

  // Local draft — admin edits the whole list, then hits Save which PUTs
  // the entire snapshot (full-replace semantics on the server).
  const [draft, setDraft] = useState<
    Array<{ memberId: string; roles: string[] | null; displayOrder: number; personName: string; photoUrl: string | null }>
  >([]);
  const [hydrated, setHydrated] = useState(false);

  // Task #448 — inline Add member affordance. Typeahead over /api/people
  // (same source the per-track Credits picker uses) with a "+ Create
  // new" fallback that mints a Person row via POST /api/admin/people
  // and then appends + persists immediately. Operator never leaves
  // the album page.
  const [adding, setAdding] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  // Styled confirm for the destructive "Clear" action (replaces the
  // raw window.confirm). Only actually clears on confirm.
  const [confirmClear, setConfirmClear] = useState(false);
  const { data: allPeople = [] } = useQuery<
    Array<{ id: string; name: string; photoUrl: string | null }>
  >({
    queryKey: ["/api/people"],
    queryFn: async () => {
      const r = await fetch(`/api/people`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: adding,
  });
  const createPersonMut = useMutation({
    mutationFn: async (name: string) => {
      const r = await apiRequest("POST", "/api/admin/people", { name });
      return (await r.json()) as { id: string; name: string; photoUrl: string | null };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/people"] });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't create person",
        description: String(e?.message ?? e),
        variant: "destructive",
      }),
  });

  // Append a member to the draft and persist via PUT immediately so
  // the row is live for the per-track Credits picker (same album-wide
  // roster, both directions). We push the full ordered draft so the
  // server replaces atomically.
  const commitAddMember = (m: {
    id: string;
    name: string;
    photoUrl: string | null;
  }) => {
    if (draft.some((d) => d.memberId === m.id)) {
      toast({ title: `${m.name} is already in the lineup` });
      setAdding(false);
      setAddQuery("");
      return;
    }
    const nextDraft = [
      ...draft,
      {
        memberId: m.id,
        roles: null,
        displayOrder: draft.length,
        personName: m.name,
        photoUrl: m.photoUrl,
      },
    ];
    setDraft(nextDraft);
    saveMutation.mutate(
      nextDraft.map((d, i) => ({
        memberId: d.memberId,
        roles: d.roles,
        displayOrder: i,
      })),
    );
    setAdding(false);
    setAddQuery("");
  };

  const addMatches = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    if (!q) return [] as typeof allPeople;
    const usedSet = new Set(draft.map((d) => d.memberId));
    return allPeople
      .filter((p) => !usedSet.has(p.id) && p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [allPeople, addQuery, draft]);
  const exactExists = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    if (!q) return false;
    return allPeople.some((p) => p.name.toLowerCase() === q);
  }, [allPeople, addQuery]);
  useEffect(() => {
    if (!isLoading) {
      setDraft(
        lineup.map((r) => ({
          memberId: r.memberId,
          roles: r.roles,
          displayOrder: r.displayOrder,
          personName: r.memberName ?? "(unknown)",
          photoUrl: r.memberPhotoUrl ?? null,
        })),
      );
      setHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, lineup]);

  const dirty = useMemo(() => {
    if (!hydrated) return false;
    if (draft.length !== lineup.length) return true;
    for (let i = 0; i < draft.length; i++) {
      const a = draft[i];
      const b = lineup[i];
      if (!b) return true;
      if (a.memberId !== b.memberId) return true;
      if (a.displayOrder !== b.displayOrder) return true;
      const ar = (a.roles ?? []).join("|");
      const br = (b.roles ?? []).join("|");
      if (ar !== br) return true;
    }
    return false;
  }, [draft, lineup, hydrated]);

  const usedIds = new Set(draft.map((d) => d.memberId));
  const rosterCandidates = bandRoster.filter(
    (m) => m.person && !usedIds.has(m.memberId),
  );

  if (!album.primaryArtistId) return null;
  if (!primaryArtist) return null;
  // Task #448 — the Lineup panel always renders for any album with an
  // editable primary artist (group or solo). When the album is truly
  // empty (no draft, no pinned rows, no roll-up) the empty state below
  // offers the inline Add affordance instead of telling the operator
  // to go elsewhere.

  // Suggested members not already in the draft — these power the
  // "Add ___ (5 tracks)" chips below the roster picker. We compute it
  // here so the button bar can also know whether anything's new.
  const suggestionToAdd = suggestion.filter((s) => !usedIds.has(s.memberId));

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 shadow-sm"
      data-testid="panel-album-lineup"
    >
      <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">Lineup</h2>
          <p className="text-[12.5px] text-slate-500 mt-0.5">
            Who played on this record. Rolls up live from per-track
            credits; anyone you add here is available on every track's
            Credits picker.
            {primaryArtist.isGroup
              ? ` Leave empty and the fan page falls back to ${primaryArtist.name}'s current band roster.`
              : ""}
          </p>
          {disabled && disabledReason && (
            <p className="text-[11px] text-amber-600 mt-1">{disabledReason}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              setAdding((v) => !v);
              setAddQuery("");
            }}
            disabled={disabled}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            data-testid="button-add-lineup-member"
          >
            {adding ? "Cancel" : "Add member"}
          </button>
          {dirty && (
            <button
              type="button"
              onClick={() =>
                saveMutation.mutate(
                  draft.map((d, i) => ({
                    memberId: d.memberId,
                    roles: d.roles,
                    displayOrder: i,
                  })),
                )
              }
              disabled={disabled || saveMutation.isPending}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 whitespace-nowrap"
              data-testid="button-save-lineup"
            >
              Save lineup
            </button>
          )}
          {draft.length === 0 && bandRoster.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDraft(
                  bandRoster
                    .filter((m) => m.person && m.leftYear === null)
                    .sort((a, b) => a.displayOrder - b.displayOrder)
                    .map((m, i) => ({
                      memberId: m.memberId,
                      roles: m.roles,
                      displayOrder: i,
                      personName: m.person!.name,
                      photoUrl: m.person!.photoUrl,
                    })),
                );
              }}
              disabled={disabled}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              data-testid="button-prefill-lineup"
            >
              Use band's current roster
            </button>
          )}
          {/* Task #193 — one-click accept of the SuperCredits-derived
              proposal. Replaces the draft so the operator sees exactly
              what they're about to save; they can still edit roles or
              remove rows before hitting Save. */}
          {draft.length === 0 && suggestion.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDraft(
                  suggestion.map((s, i) => ({
                    memberId: s.memberId,
                    roles: s.roles.length > 0 ? s.roles : null,
                    displayOrder: i,
                    personName: s.personName,
                    photoUrl: s.photoUrl,
                  })),
                );
              }}
              disabled={disabled}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 disabled:opacity-50 whitespace-nowrap"
              data-testid="button-suggest-lineup"
            >
              Use {suggestion.length} from credits
            </button>
          )}
          {draft.length > 0 && (
            <>
              {/* Destructive-action breathing room — hairline divider +
                  gap so a thumb can't slide from a safe button onto the
                  demoted Clear. */}
              <span
                className="w-px h-5 bg-slate-200 mx-1"
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                disabled={disabled || clearMutation.isPending}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 whitespace-nowrap"
                data-testid="button-clear-lineup"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>
      {/* Styled confirm for clearing the per-album lineup (replaces the
          old window.confirm). Plain-English consequence + rose primary. */}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent data-testid="dialog-confirm-clear-lineup">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Clear this album's lineup?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the album-specific lineup you set here. {primaryArtist.name}'s
              fan page will then just show the band's default member list
              instead of this custom one. You can rebuild it any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-clear-lineup">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDraft([]);
                clearMutation.mutate();
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white"
              data-testid="button-confirm-clear-lineup"
            >
              Clear lineup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {adding && (
        <div
          className="px-5 py-4 border-b border-slate-100 bg-slate-50"
          data-testid="picker-add-lineup-member"
        >
          <input
            type="text"
            autoFocus
            value={addQuery}
            onChange={(e) => setAddQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setAdding(false);
                setAddQuery("");
              }
            }}
            placeholder="Search a person or type a new name…"
            className="w-full px-3 py-2 rounded-md border border-[var(--brand-blue)]/30 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/30"
            data-testid="input-add-lineup-member"
          />
          {addQuery.trim() && (
            <div className="mt-2 rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
              {addMatches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    commitAddMember({
                      id: p.id,
                      name: p.name,
                      photoUrl: p.photoUrl,
                    })
                  }
                  disabled={saveMutation.isPending}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  data-testid={`button-pick-lineup-person-${p.id}`}
                >
                  <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                    {p.photoUrl ? (
                      <img
                        src={p.photoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      p.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="flex-1">{p.name}</span>
                </button>
              ))}
              {!exactExists && (
                <button
                  type="button"
                  onClick={async () => {
                    const name = addQuery.trim();
                    if (!name) return;
                    const created = await createPersonMut.mutateAsync(name);
                    commitAddMember({
                      id: created.id,
                      name: created.name,
                      photoUrl: created.photoUrl ?? null,
                    });
                  }}
                  disabled={createPersonMut.isPending || saveMutation.isPending}
                  className="flex w-full items-center gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/5 disabled:opacity-50"
                  data-testid="button-create-lineup-person"
                >
                  <span className="text-sm">+</span>
                  <span>
                    Create new person:{" "}
                    <span className="font-semibold">"{addQuery.trim()}"</span>
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {draft.length === 0 && (
          <p
            className="px-5 py-6 text-[13px] text-slate-500"
            data-testid="empty-album-lineup"
          >
            {suggestion.length > 0
              ? `Per-track credits name ${suggestion.length} ${
                  suggestion.length === 1 ? "player" : "players"
                } on this album — click "Use ${
                  suggestion.length
                } from credits" to pin them, or add anyone else below.`
              : bandRoster.length === 0
                ? `No one credited yet. Use "Add member" to pin the first player, or save performer credits on a track and they'll roll up here.`
                : `No one credited yet. Add a member, pull from ${primaryArtist.name}'s roster below, or save performer credits on a track.`}
          </p>
        )}
        {draft.map((d, i) => (
          <div
            key={d.memberId}
            className="px-5 py-3 grid grid-cols-12 gap-3 items-center"
            data-testid={`row-album-lineup-${d.memberId}`}
          >
            <div className="col-span-4 flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-slate-100 overflow-hidden flex-shrink-0">
                {d.photoUrl && (
                  <img src={d.photoUrl} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <p className="text-[13px] text-slate-900 truncate">{d.personName}</p>
            </div>
            <div className="col-span-6">
              <input
                type="text"
                value={(d.roles ?? []).join(", ")}
                onChange={(e) => {
                  const next = [...draft];
                  next[i] = {
                    ...d,
                    roles: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter((s) => s.length > 0),
                  };
                  setDraft(next);
                }}
                placeholder="lead vocals, rhythm guitar"
                className="w-full px-2 py-1.5 rounded-md border border-slate-200 text-[12.5px]"
                data-testid={`input-lineup-roles-${d.memberId}`}
                disabled={disabled}
              />
            </div>
            <div className="col-span-2 flex justify-end gap-1">
              <button
                type="button"
                onClick={() => {
                  if (i === 0) return;
                  const next = [...draft];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  setDraft(next.map((r, idx) => ({ ...r, displayOrder: idx })));
                }}
                disabled={disabled || i === 0}
                className="text-[12px] px-2 py-1 rounded border border-slate-200 disabled:opacity-30"
                data-testid={`button-lineup-up-${d.memberId}`}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => {
                  if (i === draft.length - 1) return;
                  const next = [...draft];
                  [next[i + 1], next[i]] = [next[i], next[i + 1]];
                  setDraft(next.map((r, idx) => ({ ...r, displayOrder: idx })));
                }}
                disabled={disabled || i === draft.length - 1}
                className="text-[12px] px-2 py-1 rounded border border-slate-200 disabled:opacity-30"
                data-testid={`button-lineup-down-${d.memberId}`}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                disabled={disabled}
                className="text-[12px] px-2 py-1 rounded border border-slate-200 text-slate-600 disabled:opacity-30"
                data-testid={`button-lineup-remove-${d.memberId}`}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
      {suggestionToAdd.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-100 bg-purple-50/50">
          <p className="text-[10.5px] uppercase tracking-wide font-semibold text-purple-500 mb-2">
            From SuperCredits™
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestionToAdd.map((s) => (
              <button
                key={s.memberId}
                type="button"
                onClick={() => {
                  setDraft([
                    ...draft,
                    {
                      memberId: s.memberId,
                      roles: s.roles.length > 0 ? s.roles : null,
                      displayOrder: draft.length,
                      personName: s.personName,
                      photoUrl: s.photoUrl,
                    },
                  ]);
                }}
                disabled={disabled}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-full border border-purple-200 bg-white text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                data-testid={`button-add-suggested-${s.memberId}`}
                title={s.roles.join(", ")}
              >
                + {s.personName}
                <span className="text-purple-400 font-normal">
                  {" "}
                  ({s.trackCount} {s.trackCount === 1 ? "track" : "tracks"})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {rosterCandidates.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
          <p className="text-[10.5px] uppercase tracking-wide font-semibold text-slate-400 mb-2">
            Add from band roster
          </p>
          <div className="flex flex-wrap gap-2">
            {rosterCandidates.map((m) => (
              <button
                key={m.memberId}
                type="button"
                onClick={() => {
                  setDraft([
                    ...draft,
                    {
                      memberId: m.memberId,
                      roles: m.roles,
                      displayOrder: draft.length,
                      personName: m.person!.name,
                      photoUrl: m.person!.photoUrl,
                    },
                  ]);
                }}
                disabled={disabled}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                data-testid={`button-add-lineup-${m.memberId}`}
              >
                + {m.person!.name}
                {m.leftYear !== null && (
                  <span className="text-amber-600"> (former)</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
