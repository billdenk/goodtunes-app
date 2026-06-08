// SellPanel — the "Sell this album" admin panel (Task #44, step 4).
//
// Lets the operator enable/disable each format, set per-format prices,
// and configure the signed-cert add-on (artist price + live profit
// readout against the platform's certificate cost — Task #119).
//
// Mounted as the Sell tab on `AdminAlbum.tsx`.
//
// Visual: Stripe-style neutral row. Save is a quiet ghost-link sitting
// at the row's right edge — it activates (brand blue) only when the row
// has unsaved edits. A row of 5 enabled formats no longer reads as 5
// loud blue pills; only the dirty one calls for attention.
//
// Task #194 — each format row now ships the same Price/Cost/Profit
// vs. Sold/Profit/Total two-column layout the signed_cert addon uses
// (mirrors Task #121). Cost is the sum of a four-line per-format
// breakdown (manufacturing + publishing + payment processing +
// GoodTunes margin) snapshotted at save time; an ⓘ popover surfaces
// that breakdown so artists can see where the cost number comes from.
// A new Presses panel above Formats surfaces the pressing-plant
// directory (MRP, PMP, Hellbender …) as info cards — per-press RFQ
// pricing plumbing is tracked separately on the roadmap.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatUsdCents } from "@shared/money";
import { useExclusiveDisclosure } from "@/hooks/useExclusiveDisclosure";
import { anchorScrollToElement } from "@/lib/anchorScroll";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { Plus, X, Info, MapPin, Clock, ChevronDown, Pencil, Eye, EyeOff, Trash2, Lock, LockOpen, Award, BookOpen, Disc3, Loader2, Copy, Share, Gift } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { uploadImageFile as uploadAdminImage } from "@/lib/adminUpload";
import { pressTurnaroundLabel } from "@/lib/pressTurnaround";
import { useToast } from "@/hooks/use-toast";
import {
  PATH_TO_PRESS_NAVIGATE_EVENT,
  consumePendingPathToPressKey,
  scrollAndFlash,
  type PathToPressKey,
  type PathToPressNavigateDetail,
} from "@/lib/pathToPressNav";
import { AddEntityButton } from "@/components/admin/AddEntityButton";
import { ShareQuoteWithArtist } from "@/components/admin/ShareQuoteWithArtist";
import { AddonDialog, type CustomAddon } from "@/pages/AdminCustomAddons";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Switch } from "@/components/ui/switch";
import {
  ALBUM_FORMATS,
  ALBUM_FORMAT_LABEL,
  ALBUM_FORMAT_TO_PHYSICAL_FORMAT,
  BOOKLET_ELIGIBLE_FORMATS,
  PHYSICAL_FORMAT_TO_ALBUM_FORMAT,
  type AlbumFormat,
  type AlbumSku,
  type AlbumAddon,
  type PayoutSettings,
  type PayoutFormatCost,
  type PressingOrderRequest,
} from "@shared/schema";
import {
  VINYL_COLORS,
  VINYL_COLOR_BY_ID,
  VINYL_COLOR_TIER_LABEL,
  VINYL_COLOR_TIER_ORDER,
  VINYL_QUANTITY_TIERS,
  JACKET_UPGRADE_LABEL,
  DEFAULT_VINYL_COLOR_ID,
  DEFAULT_VINYL_QUANTITY,
  DEFAULT_JACKET_UPGRADE,
  isVinylFormat,
  snapToQuantityTier,
  fitForFormat,
  VINYL_PER_SIDE_MAX_SECONDS,
  type JacketUpgrade,
  type VinylColorOption,
} from "@shared/pressing";
import { VinylPreview } from "@/components/VinylPreview";
import { PressingOrderStepper } from "@/components/admin/PressingOrderFlow";
import { CertSaleWindowPanel } from "@/components/admin/CertSaleWindowPanel";
import { ChangeFormatDialog } from "@/components/admin/ChangeFormatDialog";
import { adaptSkuToFormat, type SkuPicks } from "@/lib/skuFormatAdapt";
import { Package } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

// Intl-based currency formatter with thousands separators and proper
// negative handling. `dollars(123456)` → "$1,234.56", `dollars(-50)` → "-$0.50".
// Routed through the shared formatter (shared/money.ts).
const dollars = (c: number) => formatUsdCents(c);
const parseDollars = (v: string): number | null => {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

// Task #423 — single source of truth for the mechanicals rate used by
// the Publishing line in the SellPanel breakdown. $0.127/track × 2
// covers vinyl + digital mechanicals (industry standard), i.e. 25.4¢
// per track. Centralised so the snapshot path and the live-preview
// path can't drift the way they used to (the comment said 0.254 but
// the literal was 25.7).
const MECH_RATE_CENTS_PER_TRACK = 25.4;

type SellResponse = { skus: AlbumSku[]; addons: AlbumAddon[] };

type Manufacturer = {
  id: string;
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
  turnaroundDays: number | null;
  turnaroundWeeksMin: number | null;
  turnaroundWeeksMax: number | null;
  specialties: string[];
  // Task #624 — broker / wholesale discount we've negotiated with
  // this press. Surfaced in the admin-only cost tooltip so super-
  // admins can see what GoodTunes pockets per unit; never shown to
  // artists.
  brokerDiscountPct?: number;
};

// Task #199 — response from /api/admin/albums/:id/invited-press.
// `press` is null when the album's artist + label both have no
// invited-by-press stamp; in that case `formatCosts` mirrors the
// platform defaults so callers can fall through to one source.
// Task #218 — `catalog` is the press's formats → tiers → colors tree.
// Empty `formats` (or absent press) means the SellPanel falls back to
// the legacy Hellbender-matrix picker for back-compat.
type CatalogColor = {
  id: string;
  name: string;
  swatchHex: string | null;
  swatchImageUrl: string | null;
  position: number;
};
type CatalogTier = {
  id: string;
  name: string;
  position: number;
  // Task #624 — rungs carry an optional `confirmed` flag; legacy /
  // unseeded rungs come back without it (treated as confirmed=true
  // for non-admin consumers). The admin catalog editor renders
  // confirmed===false cells in yellow with a "TBD — awaiting quote"
  // hint.
  priceLadder: { qty: number; unitCents: number; confirmed?: boolean }[];
  colors: CatalogColor[];
};
type CatalogFormatRow = {
  format: AlbumFormat;
  position: number;
  tiers: CatalogTier[];
};
type Catalog = { formats: CatalogFormatRow[] };

type InvitedPressResponse = {
  press: Manufacturer | null;
  hasShippedFirst: boolean;
  scopeKind?: "artist" | "label" | null;
  scopeId?: string | null;
  formatCosts: PayoutFormatCost[];
  catalog?: Catalog;
  // Task #656 — when no press is invited, the server returns MRP's
  // catalog here as the platform-default manufacturing source so the
  // cost breakdown stops reading $0 on vinyl. We deliberately keep
  // this separate from `catalog` so MRP doesn't take over the picker
  // UI (tier/color dropdowns, format scope) — it's purely a cost
  // fallback consumed by the breakdown branch in SkuRow.
  mrpDefaults?: Catalog | null;
  // Task #736 — resolved press mode (artist → label → "dedicated").
  // "all" unlocks the press picker + cross-press bid comparison;
  // "dedicated" (or absent) locks the panel to the single resolved plant.
  pressMode?: "dedicated" | "all";
  // Task #1830 — catalogs for any presses referenced by saved SKUs that
  // differ from the invited press. The /catalog endpoint has requirePressScope
  // so artists can't fetch them directly; the server embeds them here.
  skuPressCatalogs?: Record<string, Catalog>;
  // Task #1837 — plant chosen per-SKU when no invited-by-press stamp
  // exists. `press` stays null (keeps MRP cost-math fallback intact);
  // partner/artist-admin roles read this field for a read-only display.
  effectivePress?: { id: string; name: string; logoUrl?: string | null } | null;
};

// Mirrors `snapToCatalogQuantityTier` server-side. Walks an ordered
// ladder and returns the matched rung + a `requiresQuote` flag when
// the typed quantity exceeds the top rung.
function snapCatalogLadder(
  ladder: { qty: number; unitCents: number; confirmed?: boolean }[],
  n: number,
): { qty: number; unitCents: number; requiresQuote: boolean } | null {
  if (!Array.isArray(ladder) || ladder.length === 0) return null;
  // Task #624 — unconfirmed rungs (TBD placeholders) MUST NOT resolve
  // as $0 manufacturing in the SellPanel preview. Filter them out
  // here so the snap behaves as if the rung weren't there at all.
  // Above the top confirmed rung the preview surfaces `requiresQuote`
  // (custom-quote prompt) instead of pricing against a stub.
  const sorted = [...ladder]
    .filter((r) => r.confirmed !== false)
    .sort((a, b) => a.qty - b.qty);
  if (sorted.length === 0) return null;
  const q = Math.max(1, Math.floor(n));
  for (const r of sorted) if (q <= r.qty) return { qty: r.qty, unitCents: r.unitCents, requiresQuote: false };
  const top = sorted[sorted.length - 1];
  return { qty: top.qty, unitCents: top.unitCents, requiresQuote: true };
}

// Task #533 — Gate #2. The artist's per-album opt-in to having their
// masters cut early once the per-sale funding pool covers the press's
// minimum-run floor. Default OFF. The popover explains the deal: fans
// fund it, GoodTunes fronts nothing, and the artist + admin both still
// have to say yes. The consent is snapshotted against the live tier +
// format, so re-picking either silently invalidates it.
function EarlyCutOptIn({ albumId }: { albumId: string }) {
  const { toast } = useToast();
  type EarlyCutState = {
    tier: { tierName: string; format: string; minRun: number; unitPriceCents: number; mastersPrepCents: number; perSaleEarmarkCents: number } | null;
    unitsSold: number;
    pressFloorTotalCents: number;
    poolAccruedCents: number;
    poolReleasedCents: number;
    poolAvailableCents: number;
    poolReady: boolean;
    mastersTriggeredAt: string | null;
    artistConsent: { at: string | null; tierName: string | null; format: string | null; appliesToCurrentTier: boolean };
  };
  const { data } = useQuery<EarlyCutState>({
    queryKey: ["/api/admin/albums", albumId, "early-cut"],
    enabled: !!albumId,
  });
  const consent = useMutation({
    mutationFn: async (next: boolean) => {
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/early-cut-consent`, { consent: next });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b?.message ?? "Couldn't update");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "early-cut"] });
    },
    onError: (e: Error) => toast({ title: "Couldn't opt in", description: e.message, variant: "destructive" }),
  });
  const dollars = (c: number) => formatUsdCents(Math.max(0, c), { maximumFractionDigits: 0 });
  if (!data?.tier) return null;
  const t = data.tier;
  const checked = data.artistConsent.appliesToCurrentTier;
  const pct = data.pressFloorTotalCents > 0
    ? Math.min(100, Math.round((data.poolAvailableCents / data.pressFloorTotalCents) * 100))
    : 0;
  return (
    <Card className="rounded-2xl shadow-sm overflow-hidden mb-8" data-testid="panel-early-cut-optin">
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="early-cut-optin"
            checked={checked}
            disabled={consent.isPending || !!data.mastersTriggeredAt}
            onCheckedChange={(v) => consent.mutate(v === true)}
            className="mt-0.5"
            data-testid="checkbox-early-cut-optin"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <label htmlFor="early-cut-optin" className="text-slate-900 text-sm font-bold cursor-pointer">
                Start my masters cut early once fans fund it
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="text-slate-400 hover:text-slate-600" aria-label="How pool-funded early cuts work" data-testid="button-early-cut-info">
                    <Info className="w-3.5 h-3.5" />
                    <span className="sr-only">How pool-funded early cuts work</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 text-xs" data-testid="popover-early-cut">
                  <div className="font-semibold text-slate-900 mb-1">How pool-funded early cuts work</div>
                  <p className="text-slate-600 mb-2">
                    A slice of every paid sale is set aside into a funding pool for this
                    release. The moment the pool covers the press's minimum-run floor,
                    we can start your masters cut early — GoodTunes fronts no money, and
                    nothing happens without your opt-in and an admin's approval.
                  </p>
                  <dl className="space-y-1">
                    <div className="flex justify-between"><dt className="text-slate-500">Tier</dt><dd className="text-slate-800 font-medium" data-testid="text-early-cut-tier">{t.tierName} · {t.format}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Min run</dt><dd className="text-slate-800">{t.minRun}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Set aside / sale</dt><dd className="text-slate-800">{dollars(t.perSaleEarmarkCents)}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Floor to clear</dt><dd className="text-slate-800 font-medium">{dollars(data.pressFloorTotalCents)}</dd></div>
                  </dl>
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-slate-500 text-xs mt-0.5">
              {data.mastersTriggeredAt
                ? "Masters cut already started for this release."
                : checked
                  ? "You're opted in. We'll cut as soon as the pool clears the floor and an admin approves."
                  : "Off by default. Turn on to let fans fund an early cut of your masters."}
            </p>
            <div className="mt-2">
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                  data-testid="bar-early-cut-pool"
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span data-testid="text-early-cut-pool">{dollars(data.poolAvailableCents)} pooled</span>
                <span>{dollars(data.pressFloorTotalCents)} floor · {pct}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function SellPanel({
  albumId,
  albumTitle = "",
  artistName = "",
  primaryArtistId = null,
  artworkUrl = null,
  sellMode = "direct",
  physicalFormat = null,
  sellQuoteLockedAt = null,
  onLockToggle,
  onChangeMode,
  changeModeDisabled = false,
  changeModeDisabledReason,
  onEditArtwork,
  trackCount = 0,
  totalRuntimeSec = 0,
  anticipatedTrackCount = null,
  onAnticipatedTrackCountChange,
}: {
  albumId: string;
  // Task #397 — threaded into the GoodDeed cert preview tile so the
  // mock the artist sees in the Sell panel matches what fans get
  // (album art on top + blue footer band with title + artist + photo).
  albumTitle?: string;
  artistName?: string;
  primaryArtistId?: string | null;
  artworkUrl?: string | null;
  // Task #393 — number of songs on this album. Threaded into the vinyl
  // card's cost breakdown so Publishing reads `trackCount × $0.257`
  // (industry standard: $0.127/track each for vinyl + digital). Caller
  // (AdminAlbum) derives from `album.songs.length`.
  trackCount?: number;
  // Task #619 — total runtime (seconds) of all uploaded masters on
  // this album. Drives the per-format fit check + "View Suggestion"
  // bump CTA inside each vinyl SkuRow. 0 = no audio yet → no warning.
  totalRuntimeSec?: number;
  // Task #429 — operator-typed estimate for use BEFORE any masters
  // have been uploaded. When the album has 0 songs the Sell-panel
  // Publishing line uses this number; once songs.length > 0 the live
  // count wins and this field becomes read-only on the UI.
  anticipatedTrackCount?: number | null;
  onAnticipatedTrackCountChange?: (next: number | null) => void;
  // Task #335 — mode + format come from the album row (set in the
  // creation modal). When "shopify" we render the slim panel below
  // (digital + GoodDeed addon only). Defaults stay "direct" so callers
  // that haven't been migrated yet still get the legacy full panel.
  sellMode?: "direct" | "shopify" | null;
  physicalFormat?: "single_lp" | "double_lp" | "seven_inch" | "cassette" | null;
  sellQuoteLockedAt?: string | null;
  /** Called by the "Lock in quote" / "Unlock quote" button at the bottom
   *  of the direct panel. Toggles `sellQuoteLockedAt` on the album. */
  onLockToggle?: (next: boolean) => void;
  /** Called by the "Change mode" affordance in the slim Shopify panel
   *  so the operator can re-open the two-step picker without leaving. */
  onChangeMode?: () => void;
  /** Task #499 — pre-disable the "Change mode" link when GET
   *  /api/admin/albums/:id/edit-access says the caller can't save (e.g.
   *  out-of-scope partner). The lock itself no longer blocks mode
   *  changes — they're operational/routing — so this only fires for
   *  scope/permission gaps, not first-sale lock. */
  changeModeDisabled?: boolean;
  changeModeDisabledReason?: string;
  /** Task #390 — opens the album cover-art editor modal. Wired from
   *  AdminAlbum so the per-format card's preview hover-pencil opens
   *  the same drop-zone the page header thumbnail does. */
  onEditArtwork?: () => void;
}) {
  const { toast } = useToast();
  // Task #429 — keep a local mirror of `anticipatedTrackCount` so the
  // Publishing line of every format card's breakdown re-prices on each
  // keystroke. The PUT to /api/admin/albums fires on blur (see
  // `handleAnticipatedCommit` below); without this local state the
  // breakdown would only refresh after the mutation + refetch round
  // trip, breaking Bill's "type 12 → Publishing updates" expectation.
  const [localAnticipated, setLocalAnticipated] = useState<number | null>(
    anticipatedTrackCount ?? null,
  );
  useEffect(() => {
    setLocalAnticipated(anticipatedTrackCount ?? null);
  }, [anticipatedTrackCount]);
  const handleAnticipatedCommit = (next: number | null) => {
    setLocalAnticipated(next);
    if (next !== (anticipatedTrackCount ?? null)) {
      onAnticipatedTrackCountChange?.(next);
    }
  };
  // Task #1025 — the SKU snapshot + invited-press catalog can be edited
  // by another admin (or re-imported by the press) while this panel is
  // open. The default queryClient pins staleTime: Infinity with no
  // remount/focus refetch, so a stale catalog silently mis-resolves a
  // saved color. Opt these two into refetch-on-mount/focus so reopening
  // or tabbing back always reconciles against the live catalog identity.
  const { data, isLoading, error } = useQuery<SellResponse>({
    queryKey: ["/api/admin/albums", albumId, "skus"],
    // "always" (not `true`) — the app pins staleTime: Infinity, so a plain
    // `true` would treat the data as fresh and skip the focus refetch.
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  // Live platform-cost feed — used for the "You earn" readout the first
  // time an addon is configured (before a snapshot is written), and as
  // the source of truth for what re-saving will lock in.
  const { data: payoutSettings } = useQuery<PayoutSettings>({
    queryKey: ["/api/admin/payout-settings"],
  });
  // Task #194 — per-format cost breakdown defaults. Powers the Cost
  // readout (+ tooltip) on draft SKU rows before the artist first
  // saves; saved rows use the snapshot on the SKU itself.
  const { data: formatCosts } = useQuery<PayoutFormatCost[]>({
    queryKey: ["/api/admin/payout-format-costs"],
  });
  // Task #199 — if this album's primary artist (or label) was invited
  // by a specific press, prefer that press's cost overrides for the
  // calculator. Falls back to platform defaults format-by-format when
  // the press hasn't filled in its own numbers yet, so artists always
  // see a usable readout. Also drives the Presses panel hard-lock.
  const { data: invitedPress } = useQuery<InvitedPressResponse>({
    queryKey: ["/api/admin/albums", albumId, "invited-press"],
    // Task #1025 — see the skus query above; the catalog this drives can
    // drift under us, so reconcile on mount/focus. "always" (not `true`)
    // because the app's staleTime: Infinity would otherwise skip focus.
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  // Task #1837 — role check so PrinterAndPressPanel can gate the full
  // directory picker to super-admin / admin and show a read-only
  // effective-press label to partner/artist-admin roles.
  const { data: sellRoleInfo } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
  });
  const sellIsSuperAdmin =
    sellRoleInfo?.role === "super_admin" || sellRoleInfo?.role === "admin";
  // Task #635 — full press list powers the collapsed-header press-
  // switcher popover. Display-only: shows which presses are qualified
  // to quote this format (and marks the currently-invited one). Swap
  // semantics route through the album-level invited-press flow and
  // aren't wired here, so this list informs without re-binding.
  const { data: allPresses } = useQuery<Manufacturer[]>({
    queryKey: ["/api/manufacturers"],
  });
  // Task #635 — `(pressId, format)` index used by the collapsed-
  // header press-switcher popover to filter to presses that have
  // actually opted into this format (not the full vendor list).
  const { data: pressFormatRows } = useQuery<{ pressId: string; format: string }[]>({
    queryKey: ["/api/admin/press-formats"],
  });
  const pressFormatsByPress = useMemo<Map<string, Set<string>>>(() => {
    const m = new Map<string, Set<string>>();
    for (const r of pressFormatRows ?? []) {
      let s = m.get(r.pressId);
      if (!s) {
        s = new Set();
        m.set(r.pressId, s);
      }
      s.add(r.format);
    }
    return m;
  }, [pressFormatRows]);
  // Task #397 — pull the primary artist's photoUrl so the GoodDeed
  // cert preview tile shows the same round artist headshot fans get
  // on the printed certificate. Disabled when the album has no
  // primary artist linked yet (string-only `artist` field).
  const { data: primaryArtist } = useQuery<{ photoUrl: string | null } | null>({
    queryKey: ["/api/people", primaryArtistId ?? "__none__"],
    enabled: !!primaryArtistId,
  });
  const artistPhotoUrl = primaryArtist?.photoUrl ?? null;
  const costByFormat = useMemo(() => {
    const m = new Map<string, PayoutFormatCost>();
    const source = invitedPress?.press ? invitedPress.formatCosts : formatCosts;
    (source ?? []).forEach((c) => m.set(c.format, c));
    return m;
  }, [formatCosts, invitedPress]);

  const upsertSku = useMutation({
    mutationFn: async (body: {
      format: AlbumFormat;
      priceCents: number;
      stock: number | null;
      active: boolean;
      plannedQuantity: number | null;
      vinylColor: string | null;
      jacketUpgrade: JacketUpgrade | null;
      pressTierId?: string | null;
      pressColorId?: string | null;
      displayName?: string | null;
      // Task #423 — snapshotted track count on Save.
      trackCount?: number | null;
      // Task #433 — per-row Lock toggle. Omitted on field-edit saves
      // (preserves the existing lock state); set true/false from the
      // header's Lock/Unlock icon.
      locked?: boolean;
    }) => {
      const r = await apiRequest("PUT", `/api/admin/albums/${albumId}/skus/${body.format}`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "skus"] });
      // Task #533 — tier/format change can move the resolved press tier the
      // early-cut consent was snapshotted against; refresh the opt-in state.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "early-cut"] });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });
  const deleteSku = useMutation({
    mutationFn: async (format: AlbumFormat) => apiRequest("DELETE", `/api/admin/albums/${albumId}/skus/${format}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "skus"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "early-cut"] });
    },
  });
  // Task #654 — Format swap via the album-jacket "change format" icon.
  // Carries the row's adapted picks over to the new format, persists
  // the new SKU (when the row has a price), then deletes the old SKU
  // (saved rows) or removes the draft. Disclosure is transferred so
  // the row stays open through the swap. Single mutation so toast +
  // invalidation fire once per swap, not twice.
  const swapSkuFormat = useMutation({
    mutationFn: async (args: {
      oldFormat: AlbumFormat;
      target: AlbumFormat;
      isDraft: boolean;
      // Adjustments the adapter made carrying picks across. NOT sent
      // to the server — surfaced in the success toast so the operator
      // sees exactly what snapped (color, qty, jacket) instead of
      // discovering it on the next render.
      changes: string[];
      body: {
        format: AlbumFormat;
        priceCents: number;
        stock: number | null;
        active: boolean;
        plannedQuantity: number | null;
        vinylColor: string | null;
        jacketUpgrade: JacketUpgrade | null;
        pressTierId?: string | null;
        pressColorId?: string | null;
        displayName?: string | null;
        trackCount?: number | null;
      };
    }) => {
      await apiRequest(
        "PUT",
        `/api/admin/albums/${albumId}/skus/${args.target}`,
        args.body,
      );
      if (!args.isDraft) {
        await apiRequest(
          "DELETE",
          `/api/admin/albums/${albumId}/skus/${args.oldFormat}`,
        );
      }
      // Task #1360 — keep `albums.physicalFormat` in lock-step with a
      // VINYL format swap so the Tracklist / Side-length panel (which
      // reads `albums.physicalFormat`, NOT the SKU row) re-derives the
      // side count + per-side limit (e.g. Single LP → Double LP gives
      // it four sides A/B/C/D). Only vinyl targets drive the sync:
      //  - cassette / CD targets are non-vinyl with no side layout, so
      //    we deliberately DON'T touch `physicalFormat`. That keeps a
      //    multi-SKU album safe — swapping/adding a non-vinyl SKU must
      //    never clobber the vinyl side layout the operator set up.
      //  - across multiple VINYL SKUs the most-recently-swapped vinyl
      //    format wins (last write tracks the operator's latest pick).
      const nextPhysical = isVinylFormat(args.target)
        ? ALBUM_FORMAT_TO_PHYSICAL_FORMAT[args.target]
        : null;
      if (nextPhysical && nextPhysical !== physicalFormat) {
        await apiRequest("PUT", `/api/admin/albums/${albumId}`, {
          physicalFormat: nextPhysical,
        });
      }
      return args;
    },
    onSuccess: (args) => {
      if (args.isDraft) {
        setDraftFormats((prev) => prev.filter((d) => d !== args.oldFormat));
      }
      const currentKey = args.isDraft ? `draft-${args.oldFormat}` : args.oldFormat;
      skuDisclosure.setOpen(currentKey, false);
      skuDisclosure.open(args.target);
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/albums", albumId, "skus"],
      });
      // Task #1360 — also invalidate the album DETAIL query so the
      // Tracklist / Side-length (vinyl-order) panel re-renders with the
      // freshly-synced `albums.physicalFormat` and re-derives the side
      // layout without a manual reload.
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId] });
      // Task #654 — only confirm success AFTER the PUT/DELETE pair
      // resolved; the row also bullet-lists each adjustment the
      // adapter made so the carry-over is never silent.
      toast({
        title: `Format changed to ${ALBUM_FORMAT_LABEL[args.target]}`,
        description:
          args.changes.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {args.changes.map((c) => (
                <li key={c}>• {c}</li>
              ))}
            </ul>
          ) : (
            "Everything carried over."
          ),
      });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't change format", description: e?.message, variant: "destructive" }),
  });
  const upsertAddon = useMutation({
    mutationFn: async (body: {
      priceCents: number;
      active: boolean;
      minPriceCents: number;
      plannedQuantity: number | null;
    }) => {
      const r = await apiRequest("PUT", `/api/admin/albums/${albumId}/addons/signed_cert`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "skus"] });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });
  // Task #579 — Booklet add-on mirrors signed_cert's upsert but with a
  // separate body shape (artworkUrl is booklet-specific — signed_cert
  // inherits the album jacket via the existing edit-artwork dialog).
  const upsertBookletAddon = useMutation({
    mutationFn: async (body: {
      priceCents: number;
      active: boolean;
      minPriceCents: number;
      plannedQuantity: number | null;
      artworkUrl?: string | null;
      bundlePriceCents?: number | null;
    }) => {
      const r = await apiRequest("PUT", `/api/admin/albums/${albumId}/addons/booklet`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "skus"] });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  // In-progress draft rows — picked from the "+ Add physical good" menu
  // but not yet saved. We hold them locally and only persist when the
  // operator clicks Save on the row, so a stray menu click can't push
  // a $0 active SKU to the Buy sheet.
  const [draftFormats, setDraftFormats] = useState<AlbumFormat[]>([]);
  // Exclusive-disclosure controller for the per-format SKU rows. With
  // multi-format albums the editor was a wall of expanded blocks; now
  // opening one collapses whichever sibling was previously open. Keyed
  // by AlbumFormat. See docs/design-system.md ("Expandable row lists").
  const skuDisclosure = useExclusiveDisclosure<string>();

  // Task #452 — When the New Album dialog set `physicalFormat` (direct
  // mode), the operator already told us what they want to sell. Landing
  // on the Estimate tab to a "No physical formats yet" empty card and
  // forcing them to re-pick the same format is busywork. Seed a single
  // draft row for that format on first render (once SKU data has loaded
  // and only if no SKUs/drafts exist yet) and pop the disclosure open
  // so the row arrives expanded. The one-shot ref prevents re-seeding
  // after the operator dismisses or deletes the row.
  const seededPhysicalFormatRef = useRef(false);
  useEffect(() => {
    if (seededPhysicalFormatRef.current) return;
    if (!data) return;
    if (sellMode === "shopify") return;
    if (!physicalFormat) return;
    if (data.skus.length > 0) return;
    if (draftFormats.length > 0) return;
    // Honor a press catalog if one scopes this album — don't seed an
    // off-catalog draft the row editor can't actually price.
    const catalogFormats = invitedPress?.catalog?.formats ?? [];
    const catalogScopedHere = !!invitedPress?.press && catalogFormats.length > 0;
    // Task #456 — the New Album dialog stores `physicalFormat` in its
    // own vocabulary (`seven_inch` / `single_lp` / `double_lp` /
    // `cassette`) which doesn't line up with `ALBUM_FORMATS`
    // (`7_inch` / `12_lp` / `12_double` / `cassette` / `cd`). Cast it
    // through the shared mapping or the draft row lands with a key
    // SkuRow can't recognise (`isVinylFormat("seven_inch")` is false →
    // legacy non-vinyl chrome).
    const albumFormat = PHYSICAL_FORMAT_TO_ALBUM_FORMAT[
      physicalFormat as keyof typeof PHYSICAL_FORMAT_TO_ALBUM_FORMAT
    ];
    if (!albumFormat) return;
    if (catalogScopedHere && !catalogFormats.some((f) => f.format === albumFormat)) return;
    seededPhysicalFormatRef.current = true;
    setDraftFormats([albumFormat]);
    skuDisclosure.open(`draft-${albumFormat}`);
  }, [data, physicalFormat, sellMode, invitedPress, draftFormats.length, skuDisclosure]);

  // Task #635 — localStorage collapse memory per album+press. On
  // first mount (per album+invited-press), restore whichever row the
  // operator last had open. Default collapsed for albums that are
  // already configured (saved tier + ≥1 saved qty) so a page with N
  // formats doesn't land as a wall of expanded cards. Draft rows
  // still auto-open from their own mount effect — we only restore
  // configured-row state here.
  const collapseStorageKey = useMemo(() => {
    const pressKey = invitedPress?.press?.id ?? "no-press";
    return `gt:sellpanel:open:${albumId}:${pressKey}`;
  }, [albumId, invitedPress]);
  const collapseRestoredRef = useRef<string | null>(null);
  useEffect(() => {
    if (collapseRestoredRef.current === collapseStorageKey) return;
    if (!data) return;
    collapseRestoredRef.current = collapseStorageKey;
    try {
      const saved = window.localStorage.getItem(collapseStorageKey);
      if (!saved) return;
      // Task #642 — only auto-restore an OPEN row if the saved SKU is
      // genuinely "fully configured" (persisted tier OR legacy color
      // pick + persisted plannedQuantity). A row that's missing
      // either is still mid-setup and should land collapsed regardless
      // of stale localStorage from earlier sessions, so a page full of
      // configured cards doesn't paint as a wall of expanded blocks.
      const skuRow = data.skus.find((s) => (s.format as string) === saved);
      if (!skuRow) return;
      const hasTier = !!skuRow.pressTierId || !!skuRow.vinylColor;
      const hasQty = (skuRow.plannedQuantity ?? 0) > 0;
      if (hasTier && hasQty) {
        skuDisclosure.open(saved);
      }
    } catch {
      // localStorage can throw under private-mode / SSR; ignore.
    }
  }, [collapseStorageKey, data, skuDisclosure]);
  useEffect(() => {
    try {
      const open = skuDisclosure.openId;
      if (open && !open.startsWith("draft-")) {
        window.localStorage.setItem(collapseStorageKey, open);
      } else if (!open) {
        window.localStorage.removeItem(collapseStorageKey);
      }
    } catch {
      // ignore
    }
  }, [collapseStorageKey, skuDisclosure.openId]);

  // Task #218 — when this album is invited by a press that has built
  // its catalog, restrict the Add-Physical menu to the formats that
  // catalog offers. Free / non-invited albums keep the full
  // ALBUM_FORMATS list so the SellPanel still works without a press.
  // NOTE: This hook MUST run unconditionally on every render — keep it
  // above the loading/error early-returns below, or the hook count
  // changes between renders and React throws #310 (Task #321).
  const catalogByFormat = useMemo(() => {
    const m = new Map<AlbumFormat, CatalogFormatRow>();
    (invitedPress?.catalog?.formats ?? []).forEach((f) => m.set(f.format, f));
    return m;
  }, [invitedPress]);

  // Task #1012 — selected Printer chip (All-Presses mode). Owned here so
  // the per-row vinyl color picker can re-point at the selected press's
  // catalog when the operator clicks a different chip. In
  // dedicated/locked mode there's only the single invited chip, so this
  // stays pinned to it and the picker behaves exactly as before.
  // NOTE: keep these hooks above the loading/error early-returns below
  // (same rule as catalogByFormat) so the hook count never changes.
  const pressChips = useMemo(
    () =>
      computePressChips(
        invitedPress ?? null,
        allPresses ?? null,
        pressFormatsByPress,
      ),
    [invitedPress, allPresses, pressFormatsByPress],
  );
  const defaultPressChipId = pressChips[0]?.id ?? "";
  // Task #1025 — the press a SAVED catalog SKU was pinned to (its
  // `album_skus.press_id`). This is the source of truth for which press
  // catalog a saved color must resolve against. The Printer-chip default
  // below honors it so EVERY admin reconciles saved colors against the
  // SAME press catalog on load/refresh — regardless of their own
  // per-admin localStorage chip (Task #1012) or "All Presses" god-view
  // state. Without this, two admins with different chips resolved the
  // same saved SKU against different catalogs (the cross-admin drift Bill
  // hit). Albums are single-press, so the first pinned SKU wins; we only
  // honor a pin that maps to a live chip. Null ⇒ no saved catalog SKU yet
  // (draft) ⇒ fall back to the invited/localStorage default.
  const pinnedChipId = useMemo(() => {
    for (const s of data?.skus ?? []) {
      const pid = s.pressId ?? null;
      if (!pid) continue;
      const chip = pressChips.find((c) => c.press?.id === pid);
      if (chip) return chip.id;
    }
    return null;
  }, [data, pressChips]);
  // Task #1025 — an explicit, in-session operator chip switch (god-view
  // press comparison) wins over the pinned default until the next reload.
  // On reload the ref resets, so load/refresh is always deterministic to
  // the pinned press — exactly the cross-admin stability the fix needs.
  const userSwitchedPressRef = useRef(false);
  // Task #1012 — persist the operator's Printer-chip pick per album so a
  // refresh restores the last-selected press instead of snapping back to
  // the invited default. Lazy-init from localStorage; validated against
  // the live chip list once it loads by the sync effect below.
  const pressSelectStorageKey = `gt:sellpanel:press:${albumId}`;
  const [selectedPressChipId, setSelectedPressChipId] = useState<string>(() => {
    try {
      return window.localStorage.getItem(pressSelectStorageKey) ?? "";
    } catch {
      return "";
    }
  });
  // Re-sync when the chip list arrives / changes and the current pick is
  // no longer valid (data loaded, press mode flipped, etc.). Guard on a
  // non-empty chip list so we don't clobber a restored pick to the
  // default during the brief window before chips load.
  useEffect(() => {
    if (pressChips.length === 0) return;
    if (!pressChips.some((c) => c.id === selectedPressChipId)) {
      setSelectedPressChipId(defaultPressChipId);
    }
  }, [pressChips, selectedPressChipId, defaultPressChipId]);
  // Persist a valid, non-empty pick. Skip the empty loading-window value
  // so we never erase a previously-saved selection.
  useEffect(() => {
    if (!selectedPressChipId) return;
    try {
      window.localStorage.setItem(pressSelectStorageKey, selectedPressChipId);
    } catch {
      // localStorage can throw under private-mode / SSR; ignore.
    }
  }, [pressSelectStorageKey, selectedPressChipId]);
  // Task #1025 — once the saved SKUs + chip list have loaded, snap the
  // Printer chip to the press the saved color was pinned to, unless the
  // operator explicitly switched presses this session. This is what makes
  // saved-color resolution deterministic across admins: the catalog the
  // per-row picker reads (`selectedCatalogByFormat`) becomes the pinned
  // press's catalog, so id-first (then name-within-this-press) resolution
  // always reconciles against the same catalog the SKU was saved against —
  // it no longer floats with each admin's localStorage chip. Runs after
  // the validity-sync effect above so it wins over the invited default.
  useEffect(() => {
    if (userSwitchedPressRef.current) return;
    if (!pinnedChipId) return;
    if (selectedPressChipId === pinnedChipId) return;
    setSelectedPressChipId(pinnedChipId);
  }, [pinnedChipId, selectedPressChipId]);
  const selectedPressChip =
    pressChips.find((c) => c.id === selectedPressChipId) ?? pressChips[0] ?? null;
  const selectedPress = selectedPressChip?.press ?? null;

  // The selected press's catalog. When the invited press is selected
  // (the only option in dedicated mode) we already have its catalog
  // inline; for any other press we lazily load it through the same
  // /catalog endpoint the cross-press comparison cards use, so the query
  // cache is shared. While a foreign catalog loads we fall back to the
  // invited catalog to avoid flashing the legacy (non-catalog) picker.
  const invitedPressId = invitedPress?.press?.id ?? null;
  const selectedRealPressId = selectedPress?.id ?? null;
  const isInvitedPressSelected =
    !selectedRealPressId || selectedRealPressId === invitedPressId;
  const { data: selectedPressCatalog } = useQuery<Catalog>({
    queryKey: ["/api/admin/manufacturers", selectedRealPressId, "catalog"],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/admin/manufacturers/${selectedRealPressId}/catalog`,
      );
      return r.json() as Promise<Catalog>;
    },
    enabled: !!selectedRealPressId && !isInvitedPressSelected,
  });
  const activeCatalog: Catalog | null = isInvitedPressSelected
    ? invitedPress?.catalog ?? null
    : selectedPressCatalog ?? invitedPress?.catalog ?? null;
  // The per-row color picker reads from this map (the SELECTED press).
  // The invited-press `catalogByFormat` above still drives format
  // scoping + cost-default plumbing, so those stay stable across chip
  // switches; only the swatches re-point.
  const selectedCatalogByFormat = useMemo(() => {
    const m = new Map<AlbumFormat, CatalogFormatRow>();
    (activeCatalog?.formats ?? []).forEach((f) => m.set(f.format, f));
    return m;
  }, [activeCatalog]);

  // Task #1830 — The saved SKU may reference a press that differs from the
  // artist's (or label's) invited press. This happens when an operator
  // configured a catalog color in god-view from a press the artist is not
  // directly invited to. In that case `selectedCatalogByFormat` resolves
  // against the wrong plant's catalog, breaking tier/color resolution and
  // silently reverting the artist's view to Black + a different Artist Net.
  //
  // Fix: the server now embeds the extra catalogs in the invited-press
  // response as `skuPressCatalogs` (bypassing requirePressScope that would
  // block artists from the /catalog endpoint). Here we derive which press
  // id is "extra" and build a by-format map for those SkuRows.
  // Albums are single-press so there is at most one extra press in practice.
  const extraSkuPressIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of data?.skus ?? []) {
      if (s.pressId && s.pressId !== invitedPressId) ids.add(s.pressId);
    }
    return [...ids];
  }, [data?.skus, invitedPressId]);
  const firstExtraSkuPressId = extraSkuPressIds[0] ?? null;
  // Map the extra catalog by format so each SkuRow gets the correct
  // CatalogFormatRow for the press it was actually saved against.
  const extraSkuPressCatalogByFormat = useMemo(() => {
    const m = new Map<AlbumFormat, CatalogFormatRow>();
    const catalog = firstExtraSkuPressId
      ? (invitedPress?.skuPressCatalogs?.[firstExtraSkuPressId] ?? null)
      : null;
    (catalog?.formats ?? []).forEach((f) => m.set(f.format, f));
    return m;
  }, [firstExtraSkuPressId, invitedPress]);

  // Task #454 — Listen for Path-to-press chip navigation. Chips dispatch
  // via `dispatchPathToPressNavigate`; AdminAlbum flips into the Sell
  // tab when needed (and stashes the key in the pending slot) so this
  // panel can resolve `package` / `price` / `quantity` / `submit` to
  // the matching anchor here. We register the live listener AND drain
  // the pending key on every mount/data update — the live event fires
  // when we're already on Sell, the pending slot covers the case where
  // we just mounted because AdminAlbum switched tabs.
  useEffect(() => {
    if (!data) return;
    const skusNow = data.skus;
    const skuByFormatNow = new Map(
      skusNow.map((s) => [s.format as AlbumFormat, s]),
    );
    const configuredNow = ALBUM_FORMATS.filter((f) => skuByFormatNow.has(f));
    const liveDraftsNow = draftFormats.filter((f) => !skuByFormatNow.has(f));
    const firstFormat: AlbumFormat | null =
      configuredNow[0] ?? liveDraftsNow[0] ?? null;
    const firstDisclosureKey = firstFormat
      ? skuByFormatNow.has(firstFormat)
        ? (firstFormat as string)
        : `draft-${firstFormat}`
      : null;

    // Resolve the SKU row a price/quantity chip should jump to. Prefer
    // whichever row the operator currently has expanded — that's the
    // row they're editing. Fall back to the first configured/draft row
    // only when nothing is open.
    const resolveActiveTarget = (): {
      format: AlbumFormat;
      disclosureKey: string;
    } | null => {
      const openId = skuDisclosure.openId;
      if (openId) {
        const draftMatch = openId.startsWith("draft-")
          ? (openId.slice("draft-".length) as AlbumFormat)
          : null;
        if (draftMatch && liveDraftsNow.includes(draftMatch)) {
          return { format: draftMatch, disclosureKey: openId };
        }
        const cfgMatch = configuredNow.find((f) => (f as string) === openId);
        if (cfgMatch) return { format: cfgMatch, disclosureKey: openId };
      }
      if (firstFormat && firstDisclosureKey) {
        return { format: firstFormat, disclosureKey: firstDisclosureKey };
      }
      return null;
    };

    const handle = (key: PathToPressKey) => {
      // Defer to next frame so any tab/state flip above has rendered.
      requestAnimationFrame(() => {
        if (key === "package") {
          // Spec: when SKU rows exist, jump to the first row and land
          // focus on an actionable control inside it (the row-summary
          // expand button when collapsed, or the first input — Price —
          // when already expanded). The "+ Add physical good" affordance
          // is only the empty-state fallback for albums with nothing
          // configured yet.
          if (firstFormat && firstDisclosureKey) {
            const rowTestid = skuByFormatNow.has(firstFormat)
              ? `row-sku-${firstFormat}`
              : `row-sku-draft-${firstFormat}`;
            const row = document.querySelector(
              `[data-testid="${rowTestid}"]`,
            ) as HTMLElement | null;
            scrollAndFlash(row, { focus: false });
            const focusInside = (attempt: number) => {
              const isOpen = skuDisclosure.isOpen(firstDisclosureKey);
              const selector = isOpen
                ? `[data-testid="input-price-${firstFormat}"]`
                : `[data-testid="button-row-collapsed-${firstFormat}"]`;
              const el = document.querySelector(selector) as HTMLElement | null;
              if (el) {
                try { el.focus({ preventScroll: true }); } catch { el.focus(); }
              } else if (attempt < 6) {
                window.setTimeout(() => focusInside(attempt + 1), 40);
              }
            };
            requestAnimationFrame(() => focusInside(0));
            return;
          }
          const panel = document.querySelector(
            '[data-testid="panel-formats"]',
          ) as HTMLElement | null;
          if (panel) {
            scrollAndFlash(panel, { focus: false });
            const addBtn = panel.querySelector(
              'button[data-testid^="button-add-physical"]',
            ) as HTMLElement | null;
            if (addBtn) {
              requestAnimationFrame(() => {
                try {
                  addBtn.focus({ preventScroll: true });
                } catch {
                  addBtn.focus();
                }
              });
            }
          }
          return;
        }
        if (key === "submit") {
          // Task #611 — direct-mode submit fires the pressing-order
          // mutation directly from the chip (see PressingOrderStepper),
          // so SellPanel only handles the Shopify slim panel's "Live
          // on Shopify" anchor here. Direct-mode submit events never
          // reach this branch in practice, but we still no-op safely
          // if they do (no dead `button-go-to-press` lookup any more).
          if (sellMode === "shopify") {
            const el = document.querySelector(
              '[data-testid="anchor-shopify-live"]',
            ) as HTMLElement | null;
            scrollAndFlash(el);
          }
          return;
        }
        if (key === "price" || key === "quantity") {
          const target = resolveActiveTarget();
          if (!target) {
            // No SKU row to focus — fall back to the Formats panel.
            const panel = document.querySelector(
              '[data-testid="panel-formats"]',
            ) as HTMLElement | null;
            scrollAndFlash(panel, { focus: false });
            return;
          }
          if (!skuDisclosure.isOpen(target.disclosureKey)) {
            skuDisclosure.setOpen(target.disclosureKey, true);
          }
          // The disclosure body needs a paint to mount its inputs.
          const tryFocus = (attempt: number) => {
            const selector =
              key === "price"
                ? `[data-testid="input-price-${target.format}"]`
                : `[data-testid="select-sku-quantity-${target.format}"], [data-testid="input-sku-quantity-${target.format}"]`;
            const el = document.querySelector(selector) as HTMLElement | null;
            if (el) {
              scrollAndFlash(el);
            } else if (attempt < 6) {
              window.setTimeout(() => tryFocus(attempt + 1), 40);
            }
          };
          requestAnimationFrame(() => tryFocus(0));
        }
      });
    };

    // Drain any key dispatched while this panel was still mounting
    // (the AdminAlbum listener flipped to the Sell tab a tick ago).
    const pending = consumePendingPathToPressKey();
    if (pending && pending !== "art") {
      handle(pending);
    }

    const listener = (e: Event) => {
      const detail = (e as CustomEvent<PathToPressNavigateDetail>).detail;
      if (!detail?.key) return;
      if (detail.key === "art") return; // AdminAlbum owns the cover anchor.
      handle(detail.key);
    };
    window.addEventListener(PATH_TO_PRESS_NAVIGATE_EVENT, listener);
    return () =>
      window.removeEventListener(PATH_TO_PRESS_NAVIGATE_EVENT, listener);
  }, [data, draftFormats, skuDisclosure]);

  // Honest loading/error/empty gates so a future schema-drift regression
  // surfaces as a visible message instead of an infinite spinner
  // (Task #288). An empty payload (`{skus:[], addons:[]}`) is a valid
  // success state — the "No physical formats yet" empty card below
  // handles it. Only fall back to the error state on a real fetch
  // failure.
  if (isLoading) return <div className="text-slate-500 text-sm py-6" data-testid="sell-loading">Loading…</div>;
  if (error || !data) {
    return (
      <div
        className="my-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        data-testid="sell-error"
      >
        <div className="font-semibold mb-0.5">Couldn't load Sell settings</div>
        <div className="text-rose-800/90">
          {(error as any)?.message ?? "Unknown error"} — refresh the page; if it persists, ping #goodtunes-eng.
        </div>
      </div>
    );
  }

  const skuByFormat = new Map(data.skus.map((s) => [s.format as AlbumFormat, s]));
  const signedAddon = data.addons.find((a) => a.kind === "signed_cert");
  // Task #579 — PMP 16-page booklet add-on. Only one row per album,
  // so we anchor its pill to the first eligible (7" vinyl or
  // cassette) SkuRow — same pattern as primaryVinylFormat for the
  // GoodDeed pill, so two eligible rows can't race-overwrite each
  // other's planned quantity.
  const bookletAddon = data.addons.find((a) => a.kind === "booklet");

  const catalogScoped = !!invitedPress?.press && catalogByFormat.size > 0;
  const offeredFormats = catalogScoped
    ? ALBUM_FORMATS.filter((f) => catalogByFormat.has(f))
    : ALBUM_FORMATS;

  // Once a draft becomes a real SKU (visible in `data.skus`), drop it
  // from the local draft list — the saved row takes over rendering.
  const liveDrafts = draftFormats.filter((f) => !skuByFormat.has(f));
  // Formats actually configured on this album — these are the rows we
  // render. The "+ Add Physical Good" picker handles the rest.
  const configuredFormats = ALBUM_FORMATS.filter((f) => skuByFormat.has(f));
  // Task #619 — Set form for the bump CTA's collision guard.
  const configuredFormatSet = new Set<AlbumFormat>(configuredFormats);
  // Task #619 — after a bump, open the new format's disclosure so the
  // row is mounted, then (for "Accept & adjust price") focus its Price
  // input. The DOM may not be painted yet — retry briefly.
  const handleAfterBump = (newFormat: AlbumFormat, { adjustPrice }: { adjustPrice: boolean }) => {
    skuDisclosure.open(newFormat);
    if (!adjustPrice) return;
    const tryFocus = (attempt: number) => {
      const el = document.querySelector(
        `[data-testid="input-price-${newFormat}"]`,
      ) as HTMLInputElement | null;
      if (el) {
        try { el.focus({ preventScroll: false }); } catch { el.focus(); }
        el.select?.();
      } else if (attempt < 20) {
        window.setTimeout(() => tryFocus(attempt + 1), 60);
      }
    };
    window.setTimeout(() => tryFocus(0), 80);
  };
  const availableFormats = offeredFormats.filter(
    (f) => !skuByFormat.has(f) && !liveDrafts.includes(f),
  );
  // Task #393 — `signed_cert` is a single album-level addon; render
  // the GoodDeed pill on exactly one vinyl row so multiple vinyl
  // formats (e.g. 7" + 12"LP on the same release) don't race-overwrite
  // each other's `plannedQuantity` on autosave. The "primary" vinyl
  // is just the first vinyl format in the configured/draft order.
  const primaryVinylFormat: AlbumFormat | null =
    [...configuredFormats, ...liveDrafts].find((f) => isVinylFormat(f)) ?? null;
  // Task #579 — Booklet anchors on the first eligible format (7" vinyl
  // OR cassette) in the configured/draft order. Both `7_inch` and
  // `cassette` qualify; CDs and 10"/12" do not. Null = booklet pill
  // hidden across all rows on this release.
  const primaryBookletFormat: AlbumFormat | null =
    [...configuredFormats, ...liveDrafts].find((f) =>
      (BOOKLET_ELIGIBLE_FORMATS as readonly AlbumFormat[]).includes(f),
    ) ?? null;
  // Task #1423 — the GoodDeed certificate is offered on cassette exactly
  // like vinyl. It anchors on the primary vinyl row when any vinyl
  // exists (so vinyl releases are byte-for-byte unchanged), and falls
  // back to the first cassette row on a cassette-only release so the
  // pill still has a home. Mirrors the single-anchor pattern that keeps
  // multiple eligible rows from racing on the addon's plannedQuantity.
  const primaryGoodDeedFormat: AlbumFormat | null =
    primaryVinylFormat ??
    [...configuredFormats, ...liveDrafts].find((f) => f === "cassette") ??
    null;

  return (
    <div className="py-6">
      {/* Task #427 — No inner max-w wrapper here. The album page is
          already constrained by AdminFrame (narrow = 960px), and the
          Path-to-press strip above the tabs uses that full column.
          A second max-w-3xl inside the Sell tab made every card here
          (Formats, SKU rows, Printer/Press) visibly narrower than the
          strip above it on iPad. Inheriting the page column keeps the
          right edges aligned across the whole album page. */}
      <div>
        {/* Task #335 — Path-to-press lives at the top of the album
            page now (above the tabs), not inside SellPanel. The
            artist sees it from every tab, not just Sell. */}

        {/* Task #335 — Shopify mode: slim panel. No press path, no
            per-format SKU grid. The label fulfills the physical
            product themselves; GoodTunes only sells digital + an
            optional GoodDeed certificate addon. */}
        {sellMode === "shopify" ? (
          <ShopifySlimPanel
            albumId={albumId}
            payoutSettings={payoutSettings ?? null}
            signedAddon={signedAddon ?? null}
            sellQuoteLockedAt={sellQuoteLockedAt ?? null}
            onLockToggle={onLockToggle}
            onChangeMode={onChangeMode}
            changeModeDisabled={changeModeDisabled}
            changeModeDisabledReason={changeModeDisabledReason}
            onUpsertAddon={upsertAddon.mutate}
          />
        ) : (
        <>
        {/* Task #335 / #373 — Printer chips + a single press detail
            card for the selected chip. Replaces the old horizontal
            press directory carousel: chips do the choosing, one calm
            card explains the press. MRP + PMP stay "Soon" until we
            wire their catalogs. */}
        <PrinterAndPressPanel
          invited={invitedPress ?? null}
          allPresses={allPresses ?? null}
          pressFormatsByPress={pressFormatsByPress}
          selectedId={selectedPressChipId}
          isSuperAdmin={sellIsSuperAdmin}
          onSelectId={(id) => {
            // Task #1025 — an explicit operator press switch (god-view
            // comparison) wins over the pinned default until reload.
            userSwitchedPressRef.current = true;
            setSelectedPressChipId(id);
          }}
        />

        {/* Task #533 — Gate #2 artist opt-in for pool-funded early cut. */}
        <EarlyCutOptIn albumId={albumId} />

        {/* SKUs */}
        <Card
          className="relative rounded-2xl shadow-sm overflow-hidden mb-8"
          data-testid="panel-formats"
        >
          <div className="flex items-start justify-between gap-10 px-5 py-3.5 border-b border-slate-100">
            <div className="min-w-0 pr-2">
              <h2 className="text-slate-900 text-[14px] font-bold">Design your Package</h2>
              <p className="text-slate-500 text-[11.5px] mt-0.5">
                The plan here is to determine what you'd like your package to look like: 12{"\""} LP? Booklet? Printed GoodDeed? It's all up to you. The calculator is for you to see what you could earn. But, in the end it's up to the fans. So, have fun, pick your package, vinyl color, save it. Then, let's get your offering to your fans!
              </p>
            </div>
            {availableFormats.length > 0 && (
              <div className="flex-shrink-0">
                <AddPhysicalGoodButton
                  availableFormats={availableFormats}
                  onAdd={(format) =>
                    setDraftFormats((prev) => (prev.includes(format) ? prev : [...prev, format]))
                  }
                />
              </div>
            )}
          </div>
          <div className="px-5 py-4">
          {configuredFormats.length === 0 && liveDrafts.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-white p-8 text-center">
              <div className="text-slate-700 text-[13.5px] font-medium">No physical formats yet</div>
              <div className="text-slate-500 text-xs mt-1">
                Add a vinyl, cassette, or CD to start selling.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                // Task #390 — Format dropdown inside each card needs to
                // know every format the artist could pivot to. We thread
                // the same `offeredFormats` list every card uses, plus a
                // single switcher that promotes a not-yet-configured
                // format into a draft and routes the disclosure to it.
                const switchFormat = (currentFormat: AlbumFormat, currentKey: string) =>
                  (target: AlbumFormat) => {
                    if (target === currentFormat) return;
                    const isExisting = skuByFormat.has(target);
                    const isDraftAlready = draftFormats.includes(target);
                    if (!isExisting && !isDraftAlready) {
                      setDraftFormats((prev) => [...prev, target]);
                    }
                    const targetKey = isExisting ? target : `draft-${target}`;
                    skuDisclosure.setOpen(currentKey, false);
                    skuDisclosure.setOpen(targetKey, true);
                  };
                return (
                  <>
                    {configuredFormats.map((f) => {
                      const existing = skuByFormat.get(f)!;
                      // Task #1830 — supply the catalog for the press the SKU
                      // was actually saved against. When the saved pressId is
                      // an "extra" press (differs from the invited press),
                      // always resolve color+tier from the server-embedded
                      // skuPressCatalogs entry (extraSkuPressCatalogByFormat)
                      // rather than from selectedCatalogByFormat.
                      //
                      // Why unconditional (no "selectedRealPressId !== extra"
                      // gate): pinnedChipId auto-snaps the chip to the extra
                      // press when it's visible in the chips list (god-view
                      // "All Presses" mode). That snap sets selectedRealPressId
                      // === firstExtraSkuPressId, which was defeating the guard
                      // and falling through to selectedCatalogByFormat. For an
                      // artist, the lazy /catalog endpoint is blocked by
                      // requirePressScope, so selectedPressCatalog never loads
                      // and activeCatalog falls back to the invited-press
                      // catalog — wrong press, wrong color, silent revert to
                      // Black. The embedded catalog always arrives with the
                      // invited-press response and is never gated, so prefer
                      // it unconditionally for saved extra-press SKU rows.
                      // When the embedded catalog has no entry for this format
                      // we fall back to selectedCatalogByFormat as before.
                      const skuSavedPressId = existing.pressId ?? null;
                      const catalogFormat =
                        skuSavedPressId && skuSavedPressId === firstExtraSkuPressId
                          ? extraSkuPressCatalogByFormat.get(f) ?? selectedCatalogByFormat.get(f) ?? null
                          : selectedCatalogByFormat.get(f) ?? null;
                      return (
                        <SkuRow
                          key={f}
                          format={f}
                          existing={existing}
                          liveCost={costByFormat.get(f) ?? null}
                          catalogFormat={catalogFormat}
                          artworkUrl={artworkUrl}
                          offeredFormats={offeredFormats}
                          onSwitchFormat={switchFormat(f, f)}
                          onEditArtwork={onEditArtwork}
                          onSave={upsertSku.mutate}
                          onDelete={() => deleteSku.mutate(f)}
                          onChangeFormat={(args) =>
                            swapSkuFormat.mutate({ ...args, oldFormat: f, isDraft: false })
                          }
                          swapBusy={swapSkuFormat.isPending}
                          expanded={skuDisclosure.isOpen(f)}
                          onSetExpanded={(open) => skuDisclosure.setOpen(f, open)}
                          trackCount={trackCount || (localAnticipated ?? 0)}
                          liveTrackCount={trackCount}
                          anticipatedTrackCount={localAnticipated}
                          persistedAnticipatedTrackCount={anticipatedTrackCount ?? null}
                          onAnticipatedTrackLocalChange={setLocalAnticipated}
                          onAnticipatedTrackCountChange={handleAnticipatedCommit}
                          albumId={albumId}
                          signedAddon={signedAddon ?? null}
                          livePlatformCostCents={payoutSettings?.certCostCents ?? null}
                          onSaveAddon={upsertAddon.mutate}
                          isPrimaryVinyl={primaryVinylFormat === f}
                          isPrimaryGoodDeed={primaryGoodDeedFormat === f}
                          bookletAddon={bookletAddon ?? null}
                          isBookletAnchor={primaryBookletFormat === f}
                          bookletEligibleExists={primaryBookletFormat !== null}
                          onSaveBookletAddon={upsertBookletAddon.mutate}
                          albumTitle={albumTitle}
                          artistName={artistName}
                          artistPhotoUrl={artistPhotoUrl}
                          primaryArtistId={primaryArtistId}
                          albumQuoteLockedAt={sellQuoteLockedAt ?? null}
                          totalRuntimeSec={totalRuntimeSec}
                          costByFormat={costByFormat}
                          catalogByFormat={catalogByFormat}
                          configuredFormats={configuredFormatSet}
                          onAfterBump={handleAfterBump}
                          allPresses={allPresses ?? null}
                          invitedPressItself={invitedPress?.press ?? null}
                          pressFormatsByPress={pressFormatsByPress}
                          allPlannedQuantities={data.skus
                            .map((s) => s.plannedQuantity ?? 0)
                            .filter((q) => q > 0)}
                        />
                      );
                    })}
                    {liveDrafts.map((f) => (
                      <SkuRow
                        key={`draft-${f}`}
                        format={f}
                        existing={null}
                        liveCost={costByFormat.get(f) ?? null}
                        catalogFormat={selectedCatalogByFormat.get(f) ?? null}
                        artworkUrl={artworkUrl}
                        offeredFormats={offeredFormats}
                        onSwitchFormat={switchFormat(f, `draft-${f}`)}
                        onEditArtwork={onEditArtwork}
                        onSave={(body) => {
                          upsertSku.mutate(body, {
                            onSuccess: () => {
                              // Transfer the disclosure open state from the
                              // draft key onto the now-configured key BEFORE
                              // we drop the draft. Otherwise the row re-keys
                              // (`draft-${f}` → `${f}`) and the disclosure
                              // lookup misses, collapsing the row mid-edit —
                              // which is what was closing the panel as soon
                              // as the operator typed their first price.
                              if (skuDisclosure.isOpen(`draft-${f}`)) {
                                skuDisclosure.open(f);
                              }
                              setDraftFormats((prev) => prev.filter((d) => d !== f));
                            },
                          });
                        }}
                        onDelete={() => setDraftFormats((prev) => prev.filter((d) => d !== f))}
                        onChangeFormat={(args) =>
                          swapSkuFormat.mutate({ ...args, oldFormat: f, isDraft: true })
                        }
                        swapBusy={swapSkuFormat.isPending}
                        expanded={skuDisclosure.isOpen(`draft-${f}`)}
                        onSetExpanded={(open) => skuDisclosure.setOpen(`draft-${f}`, open)}
                        trackCount={trackCount || (localAnticipated ?? 0)}
                        liveTrackCount={trackCount}
                        anticipatedTrackCount={localAnticipated}
                        persistedAnticipatedTrackCount={anticipatedTrackCount ?? null}
                        onAnticipatedTrackLocalChange={setLocalAnticipated}
                        onAnticipatedTrackCountChange={handleAnticipatedCommit}
                        albumId={albumId}
                        signedAddon={signedAddon ?? null}
                        livePlatformCostCents={payoutSettings?.certCostCents ?? null}
                        onSaveAddon={upsertAddon.mutate}
                        isPrimaryVinyl={primaryVinylFormat === f}
                        isPrimaryGoodDeed={primaryGoodDeedFormat === f}
                        bookletAddon={bookletAddon ?? null}
                        isBookletAnchor={primaryBookletFormat === f}
                        bookletEligibleExists={primaryBookletFormat !== null}
                        onSaveBookletAddon={upsertBookletAddon.mutate}
                        albumTitle={albumTitle}
                        artistName={artistName}
                        artistPhotoUrl={artistPhotoUrl}
                        primaryArtistId={primaryArtistId}
                        albumQuoteLockedAt={sellQuoteLockedAt ?? null}
                        totalRuntimeSec={totalRuntimeSec}
                        costByFormat={costByFormat}
                        catalogByFormat={catalogByFormat}
                        configuredFormats={configuredFormatSet}
                        onAfterBump={handleAfterBump}
                        allPresses={allPresses ?? null}
                        invitedPressItself={invitedPress?.press ?? null}
                        pressFormatsByPress={pressFormatsByPress}
                        allPlannedQuantities={data.skus
                          .map((s) => s.plannedQuantity ?? 0)
                          .filter((q) => q > 0)}
                      />
                    ))}
                  </>
                );
              })()}
            </div>
          )}
          </div>
        </Card>

        {/* Task #397 — the duplicate "Printed & Signed GoodDeed®"
            section that used to live here (AddonForm + vendor panel +
            sale-window panel) was a stale second source of truth for
            the same signed_cert addon now configured inline on the
            primary vinyl row via <GoodDeedPill> above. Removed for
            direct-mode; the Shopify-mode equivalent (slim panel below)
            keeps its own version since that branch has no vinyl row
            to host the pill on. */}

        {/* Album-level "Lock in quote" banner removed — per-row Lock
            on each vinyl SKU (Task #433) is the new affordance, so this
            second source of truth went away. */}

        {/* Task #611 — Bottom "Ready to press this record? → Go to
            Press!" banner removed. The Path-to-press strip's `submit`
            chip is the single Go-to-Press affordance now (it fires the
            same POST directly on click). */}

        {/* Task #706 — turn the built quotes into a shareable artist
            invite. Quotes already persist as album_skus; this mints an
            identity invite pre-flighted to this album so the recipient
            lands on the album editor with the saved quotes waiting. */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800">
              Share these quotes with the artist
            </div>
            <div className="text-xs text-slate-500">
              {primaryArtistId
                ? configuredFormats.length > 0
                  ? `Send ${artistName || "the artist"} a link — they sign in and land here with your saved quotes waiting.`
                  : "Save at least one format to share it."
                : "Link this album to a primary artist to share quotes."}
            </div>
          </div>
          <ShareQuoteWithArtist
            albumId={albumId}
            albumTitle={albumTitle}
            primaryArtistId={primaryArtistId}
            artistName={artistName}
            savedQuoteCount={configuredFormats.length}
            unsavedDraftCount={liveDrafts.length}
          />
        </div>
        </>
        )}
      </div>
    </div>
  );
}

/* ─── Task #335 / #373 / #389 — Compact printer selector ──────────── */
/* The printer is usually already decided (GoodTunes routes the run, or
 * the partner was invited by a specific press), so the picker sits as a
 * small inline row above the quote controls — selected press name + an
 * Info button that opens the press detail in a popover. When more than
 * one printer is selectable the other options render inline as small
 * chips next to the selected name; when only one is selectable (locked
 * invited press, or only Hellbender live) the row is read-only with no
 * chips. The invited-press hard lock from task #199 still surfaces, as
 * a muted caption under the row.                                      */
type PressChip = {
  id: string;
  label: string;
  status: "live" | "coming-soon";
  press: Manufacturer | null;
};

// Task #1012 — cross-press tier/color re-resolution. Presses name the
// same conceptual tier differently — Hellbender ships "Opaque Colors"
// where Memphis ships "Opaque" — so an exact-name match drops the
// operator onto the wrong (often empty "Black") tier when they switch
// the Printer chip. Normalize a trailing " Color"/" Colors" word so the
// equivalents line up, then fall back to the first tier that actually
// HAS colors before the raw tiers[0], so a swap never lands on an empty
// swatch grid.
function normalizeTierName(s: string): string {
  return s.toLowerCase().replace(/\s+colors?$/, "").trim();
}
function resolveTierByName(
  tiers: CatalogTier[],
  name: string | null,
): CatalogTier | null {
  if (tiers.length === 0) return null;
  const want = name ? normalizeTierName(name) : "";
  if (want) {
    const exact = tiers.find((t) => normalizeTierName(t.name) === want);
    if (exact) return exact;
  }
  return tiers.find((t) => t.colors.length > 0) ?? tiers[0];
}
function resolveColorByName(
  tier: CatalogTier | null,
  name: string | null,
): CatalogColor | null {
  if (!tier || tier.colors.length === 0) return null;
  if (name) {
    const want = name.toLowerCase().trim();
    const hit = tier.colors.find((c) => c.name.toLowerCase().trim() === want);
    if (hit) return hit;
  }
  return tier.colors[0] ?? null;
}

// Task #1012 — chip computation lifted out of PrinterAndPressPanel so
// the parent SellPanel can resolve the operator-selected press and
// re-point the per-row vinyl color picker at that press's catalog,
// while the panel itself stays a thin controlled renderer (selection
// now lives in SellPanel).
//
// Task #597 — MRP is hidden from the Printer chip row pre-meeting
// (mirrors the Press-tab preflight hide); reference rates still drive
// cost math under the hood, only the user-facing chip is suppressed.
// Task #736 — in "all" mode the super-admin shops the live press
// directory: every press that publishes at least one format becomes a
// selectable chip (invited press first when present). Dedicated/locked
// modes keep the pre-meeting single-press behavior. Works with no
// invited stamp. No fabricated fallback: with nothing resolved the
// chip list is empty and the panel renders nothing.
function computePressChips(
  invited: InvitedPressResponse | null,
  allPresses?: Manufacturer[] | null,
  pressFormatsByPress?: Map<string, Set<string>>,
  // Task #1837 — partners see their chosen plant read-only; only super-admin
  // / admin gets the full directory picker in "all" mode.
  isSuperAdmin = true,
): PressChip[] {
  const invitedPress = invited?.press ?? null;
  const allMode = (invited?.pressMode ?? "dedicated") === "all";
  const locked = !!invitedPress && !invited?.hasShippedFirst && !allMode;
  const liveDirectoryChips: PressChip[] = (() => {
    if (!allMode) return [];
    // Partners don't get the full directory picker — they'll see the
    // effective press as a read-only label below instead.
    if (!isSuperAdmin) return [];
    const seen = new Set<string>();
    const out: PressChip[] = [];
    if (invitedPress) {
      seen.add(invitedPress.id);
      out.push({ id: invitedPress.id, label: invitedPress.name, status: "live", press: invitedPress });
    }
    for (const p of allPresses ?? []) {
      if (seen.has(p.id)) continue;
      const formats = pressFormatsByPress?.get(p.id);
      if (formats && formats.size > 0) {
        seen.add(p.id);
        out.push({ id: p.id, label: p.name, status: "live", press: p });
      }
    }
    return out;
  })();
  return allMode && liveDirectoryChips.length > 0
    ? liveDirectoryChips
    : locked
      ? [{ id: "invited", label: invitedPress!.name, status: "live", press: invitedPress }]
      : [];
}

function PrinterAndPressPanel({
  invited,
  allPresses,
  pressFormatsByPress,
  selectedId,
  onSelectId,
  isSuperAdmin = true,
}: {
  invited: InvitedPressResponse | null;
  allPresses?: Manufacturer[] | null;
  pressFormatsByPress?: Map<string, Set<string>>;
  // Task #1012 — selection is owned by SellPanel so the color picker
  // can react to it. In dedicated/locked mode there's only the single
  // invited chip, so this is effectively inert there.
  selectedId: string;
  onSelectId: (id: string) => void;
  // Task #1837 — gates the full directory picker to operator roles only.
  isSuperAdmin?: boolean;
}) {
  const invitedPress = invited?.press ?? null;
  // Task #736 — in "all" mode the super-admin wants to shop every press,
  // so the invited-press hard lock is lifted even though the provenance
  // stamp is still present. "dedicated" (or inherit) keeps the lock.
  const allMode = (invited?.pressMode ?? "dedicated") === "all";
  const locked = !!invitedPress && !invited?.hasShippedFirst && !allMode;

  const chips = computePressChips(invited, allPresses, pressFormatsByPress, isSuperAdmin);
  const selectedChip = chips.find((c) => c.id === selectedId) ?? chips[0];
  const selectedPress = selectedChip?.press ?? null;

  // Only one printer truly selectable → no chip row at all (just the
  // selected label + Info). "Selectable" means live; coming-soon chips
  // don't count for this decision (otherwise the disabled MRP/PMP would
  // force chips to render in the free flow even though the operator can
  // only pick Hellbender today).
  // No press resolved → render nothing rather than a fabricated default.
  // Task #1837 — for partner roles with no invited stamp, check for an
  // effective press derived from saved SKUs and show it read-only.
  if (!selectedChip) {
    const effectivePress = invited?.effectivePress ?? null;
    if (effectivePress && !isSuperAdmin) {
      return (
        <div className="mb-4" data-testid="panel-printer-and-press">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Printer</span>
            <span className="font-semibold text-slate-900" data-testid="text-selected-printer">
              {effectivePress.name}
            </span>
            <span className="text-xs text-slate-400">chosen plant</span>
          </div>
        </div>
      );
    }
    return null;
  }

  const otherLiveChips = chips.filter((c) => c.id !== selectedChip.id && c.status === "live");
  const otherComingSoonChips = chips.filter((c) => c.id !== selectedChip.id && c.status !== "live");
  const showChips = otherLiveChips.length > 0;

  return (
    <div className="mb-4" data-testid="panel-printer-and-press">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Printer</span>
        <span
          className="font-semibold text-slate-900"
          data-testid="text-selected-printer"
        >
          {selectedChip.label}
        </span>
        {selectedPress && <PressInfoPopover press={selectedPress} />}
        {showChips && (
          <div className="flex flex-wrap items-center gap-1.5 ml-1" data-testid="printer-chips">
            <span className="text-slate-300">·</span>
            {otherLiveChips.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={false}
                data-testid={`printer-${c.id}`}
                onClick={() => onSelectId(c.id)}
                className="rounded-full px-2 py-0.5 text-xs font-semibold border bg-white text-slate-700 border-slate-200 hover:border-slate-300 transition-colors"
                title={c.label}
              >
                {c.label}
              </button>
            ))}
            {otherComingSoonChips.map((c) => (
              <span
                key={c.id}
                data-testid={`printer-${c.id}`}
                className="rounded-full px-2 py-0.5 text-xs font-semibold border bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                title="Coming soon"
              >
                {c.label}
                <span className="ml-1 opacity-80 font-normal">Soon</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {locked && (
        <p className="text-xs text-slate-500 mt-1" data-testid="text-printer-lock-note">
          You were invited by {invitedPress!.name}. The full pressing-plant directory
          unlocks once your first run ships — message GoodTunes if you need to switch
          sooner.
        </p>
      )}
    </div>
  );
}

/* Task #389 — press detail moved out of the always-on PressCard and
 * into an on-demand popover triggered by an `i` button next to the
 * selected printer name. Preserves every data-testid the old card
 * exposed so any selectors keep resolving.                            */
function PressInfoPopover({ press }: { press: Manufacturer }) {
  const turnaroundLabel = pressTurnaroundLabel(press);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`About ${press.name}`}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-slate-400 hover:text-[color:var(--brand-blue)] transition-colors"
          data-testid={`button-press-info-${press.id}`}
        >
          <Info className="w-4 h-4" />
          <span className="sr-only">Printer details</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-4"
        align="start"
        data-testid={`card-press-${press.id}`}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            {press.logoUrl ? (
              <img
                src={press.logoUrl}
                alt=""
                className="w-10 h-10 rounded-md object-cover border border-slate-200 shrink-0"
                data-testid={`img-press-logo-${press.id}`}
              />
            ) : (
              <div className="w-10 h-10 rounded-md bg-slate-100 border border-slate-200 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <div
                  className="text-[13.5px] font-semibold text-slate-900 truncate"
                  data-testid={`text-press-name-${press.id}`}
                >
                  {press.name}
                </div>
                <span
                  className="text-[9.5px] uppercase tracking-wider font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-sm px-1 py-[1px] shrink-0"
                  title="Today every vinyl Cost uses Hellbender Vinyl's published rate sheet as the default. Per-plant quotes wire in next."
                  data-testid={`pill-press-source-${press.id}`}
                >
                  Hellbender reference rates
                </span>
              </div>
              {press.location && (
                <div
                  className="text-xs text-slate-500 inline-flex items-center gap-1 mt-0.5"
                  data-testid={`text-press-location-${press.id}`}
                >
                  <MapPin className="w-3 h-3" />
                  {press.location}
                </div>
              )}
            </div>
          </div>
          {press.bio && (
            <div
              className="text-xs text-slate-600 leading-relaxed"
              data-testid={`text-press-bio-${press.id}`}
            >
              {press.bio}
            </div>
          )}
          {turnaroundLabel && (
            <div
              className="text-xs text-slate-500 inline-flex items-center gap-1"
              data-testid={`text-press-turnaround-${press.id}`}
            >
              <Clock className="w-3 h-3" />
              {turnaroundLabel}
            </div>
          )}
          {press.specialties.length > 0 && (
            <div
              className="flex flex-wrap gap-1"
              data-testid={`chips-press-specialties-${press.id}`}
            >
              {press.specialties.map((s, i) => (
                <span
                  key={`${press.id}-spec-${i}`}
                  className="text-[11px] rounded-full bg-slate-100 text-slate-700 px-2 py-0.5"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          {press.websiteUrl && (
            <div className="pt-2 border-t border-slate-100">
              <a
                href={press.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-slate-700 hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
                data-testid={`link-press-website-${press.id}`}
              >
                Visit website ↗
              </a>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ─── Task #335 — Shopify slim panel ───────────────────────────────── */
/* Shopify-mode albums skip the entire press path. We sell the digital
 * album (configured in Overview) + an optional Printed & Signed
 * GoodDeed addon — the same addon the direct flow sells. The label
 * handles every physical product on Shopify themselves and pushes the
 * GoodTunes digital + addon through the Shopify tab.                   */
function ShopifySlimPanel({
  albumId,
  payoutSettings,
  signedAddon,
  sellQuoteLockedAt,
  onLockToggle,
  onChangeMode,
  changeModeDisabled = false,
  changeModeDisabledReason,
  onUpsertAddon,
}: {
  albumId: string;
  payoutSettings: PayoutSettings | null;
  signedAddon: any | null;
  sellQuoteLockedAt: string | null;
  onLockToggle?: (next: boolean) => void;
  onChangeMode?: () => void;
  changeModeDisabled?: boolean;
  changeModeDisabledReason?: string;
  onUpsertAddon: (body: { priceCents: number; active: boolean; minPriceCents: number; plannedQuantity: number | null }) => void;
}) {
  return (
    <div data-testid="sell-panel-shopify">
      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-slate-900">Selling through Shopify</div>
          <div className="text-xs text-slate-500 mt-0.5">
            You fulfill the physical product on your Shopify store. GoodTunes sells the
            digital album + (optional) Printed &amp; Signed GoodDeed certificate.
          </div>
        </div>
        {onChangeMode && (
          <button
            type="button"
            onClick={onChangeMode}
            disabled={changeModeDisabled}
            title={changeModeDisabled ? changeModeDisabledReason : undefined}
            data-testid="button-change-sell-mode"
            className="text-xs font-semibold text-[color:var(--brand-blue)] hover:underline shrink-0 disabled:text-slate-400 disabled:hover:no-underline disabled:cursor-not-allowed"
          >
            Change mode
          </button>
        )}
      </div>
      <div className="mb-8">
        <h2 className="text-[15px] font-semibold text-slate-900 mb-1">Printed &amp; Signed GoodDeed®</h2>
        <p className="text-sm text-slate-500 mb-4">
          Optional addon. Fans see a single toggle on the Buy sheet; your earnings are
          computed live against the platform's certificate cost.
        </p>
        <div
          className="rounded-md border border-slate-200 bg-white p-4"
          data-testid="anchor-shopify-live"
        >
          <AddonForm
            albumId={albumId}
            existing={signedAddon ?? null}
            livePlatformCostCents={payoutSettings?.certCostCents ?? null}
            onSave={onUpsertAddon}
          />
        </div>
        {/* Task #471 — per-album printing/hologram/insertion vendor
            routing moved off the album to platform-level defaults on
            AdminPlatformPricing. The Sell panel now just shows the
            live Cost (live) readout against those defaults. */}
        <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
          <CertSaleWindowPanel albumId={albumId} />
        </div>
      </div>

      {/* Album-level lock banner removed in favor of per-row Lock
          affordance (Task #433). */}
    </div>
  );
}

// Shared form-control styling so every input on this panel matches
// the admin token set (hairline border, brand-blue focus ring).
const fieldClass =
  "h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 " +
  "focus:outline-none focus:border-[color:var(--brand-blue)] focus:ring-1 focus:ring-[color:var(--brand-blue)]";

// Focusable controls used to compute the Tab target when we intercept the
// browser's native Tab on a price/SKU text field (see handlePriceFieldKeyDown).
const SELL_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"])';

// Safari treats Tab out of a text input that sits next to a custom control
// (our Qty <Select> trigger and disclosure buttons aren't plain form fields)
// as a cue to jump focus to the address bar and pop the URL/Suggestions sheet
// instead of moving to the next field. To keep focus inside the panel, we
// intercept Tab/Shift+Tab on every "$" price / SKU box: move focus to the
// adjacent focusable control ourselves and preventDefault so Safari can't
// escape. Blurring the field this way still fires its onBlur-commit / debounced
// autosave, so no edit is lost. Enter mirrors the existing blur-to-commit
// pattern used throughout this panel. Chrome and mobile are unaffected — they
// already keep Tab inside the document, and this just makes the move explicit.
function handlePriceFieldKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.currentTarget.blur();
    return;
  }
  if (e.key !== "Tab") return;
  const current = e.currentTarget;
  const focusable = Array.from(
    current.ownerDocument.querySelectorAll<HTMLElement>(SELL_FOCUSABLE_SELECTOR),
  ).filter((el) => el === current || el.offsetParent !== null);
  const idx = focusable.indexOf(current);
  if (idx === -1) return;
  const next = focusable[e.shiftKey ? idx - 1 : idx + 1];
  if (!next) return;
  e.preventDefault();
  try {
    next.focus({ preventScroll: false });
  } catch {
    next.focus();
  }
}

// Quiet "Save" affordance. At rest: slate-500 link. When the row has
// unsaved edits: brand-blue link + faint pill. No bouncy fill.
function SaveLink({
  dirty,
  onClick,
  testId,
}: {
  dirty: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!dirty}
      className={
        "h-8 px-2.5 rounded-md text-xs font-medium transition-colors " +
        (dirty
          ? "text-[color:var(--brand-blue)] hover:bg-[color:var(--brand-blue-soft)]"
          : "text-slate-400 cursor-default")
      }
      data-testid={testId}
    >
      Save
    </button>
  );
}

// Task #429 — small numeric input used on each vinyl format card to
// capture an Anticipated track count BEFORE any masters are uploaded.
// While `liveTrackCount === 0` the field is editable and seeded from
// the album row's `anticipatedTrackCount`; once songs exist the input
// disables and shows the live count with a "from tracklist" helper.
// Saves on blur (and Enter) through the supplied `onChange` callback
// — empty string clears back to null so Publishing falls to $0.
function AnticipatedTracksInput({
  format,
  liveTrackCount,
  anticipatedTrackCount,
  persistedAnticipatedTrackCount,
  lockedValue,
  onLocalChange,
  onChange,
}: {
  format: AlbumFormat;
  liveTrackCount: number;
  // Local mirror (updates on every keystroke). Drives the input's
  // displayed value and the live Publishing re-price.
  anticipatedTrackCount: number | null;
  // Last value the album row was saved with. The blur/Enter commit
  // dedupes against THIS, not the local mirror — otherwise typing a
  // new value updates the mirror, and by the time commit fires the
  // "did it change?" check sees no diff and skips the PUT.
  persistedAnticipatedTrackCount: number | null;
  // Task #446 — when supplied, the input renders that value disabled
  // and never fires `onChange` / `onLocalChange`. 7" passes 2 here so
  // the operator can't edit a single's mechanical track count. Live
  // masters still win once songs are uploaded.
  lockedValue?: number | null;
  // Fires on every keystroke with the parsed/clamped value (or null
  // for empty input). Used to drive the live Publishing re-price
  // before the PUT round-trips. See SellPanel's `localAnticipated`.
  onLocalChange?: (next: number | null) => void;
  // Fires on blur / Enter — this is the one that persists.
  onChange?: (next: number | null) => void;
}) {
  const hasLive = liveTrackCount > 0;
  const locked = lockedValue != null && !hasLive;
  const initial = hasLive
    ? String(liveTrackCount)
    : locked
      ? String(lockedValue)
      : anticipatedTrackCount != null
        ? String(anticipatedTrackCount)
        : "";
  const [value, setValue] = useState<string>(initial);
  useEffect(() => {
    setValue(
      hasLive
        ? String(liveTrackCount)
        : locked
          ? String(lockedValue)
          : anticipatedTrackCount != null
            ? String(anticipatedTrackCount)
            : "",
    );
  }, [hasLive, liveTrackCount, locked, lockedValue, anticipatedTrackCount]);

  // Parse a raw input string into the clamped 0–99 value (or null
  // for empty / unparseable). Shared by the live keystroke path and
  // the blur/Enter commit path so they always agree.
  const parse = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number.parseInt(trimmed.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.min(99, n);
  };

  const handleType = (raw: string) => {
    if (locked) return;
    setValue(raw);
    if (hasLive) return;
    const parsed = parse(raw);
    // Empty input = null (clears anticipated count). Unparseable
    // input (e.g. "abc") is ignored — we leave the breakdown on the
    // last good value until the user fixes the text.
    if (raw.trim() === "" || parsed !== null) {
      onLocalChange?.(parsed);
    }
  };

  const commit = () => {
    if (locked || hasLive || !onChange) return;
    const parsed = parse(value);
    if (parsed === null && value.trim() !== "") return; // junk text — leave as-is
    if (parsed !== persistedAnticipatedTrackCount) onChange(parsed);
    setValue(parsed != null ? String(parsed) : "");
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
          {hasLive ? "Tracks" : "Anticipated tracks"}
        </span>
        <InfoTip
          label={hasLive ? "About tracks" : "About anticipated tracks"}
          testId={`info-anticipated-tracks-${format}`}
          text={
            hasLive
              ? "The total number of tracks on this release, taken from your uploaded tracklist. This drives Publishing = N × $0.254 (mechanicals × 2 for vinyl + digital)."
              : "Type the number of tracks you expect this album to have so the Publishing estimate is realistic before you upload masters. Publishing = N × $0.254 (mechanicals × 2 for vinyl + digital). Used until you upload masters — once songs are uploaded this switches to the live tracklist count."
          }
        />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => handleType(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={hasLive || locked}
        readOnly={locked}
        inputMode="numeric"
        placeholder="0"
        className="w-full h-8 px-2 rounded-md border border-slate-200 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]"
        data-testid={`input-anticipated-tracks-${format}`}
      />
    </div>
  );
}

// Task #390 — small (i) popover used next to Retail Price, Select Qty,
// Total and Profit·Per unit sold. Click or hover-equivalent (popover
// trigger) opens a calm slate caption with the explanatory copy. Same
// shadcn Popover the CostTooltip uses, just stripped down.
function InfoTip({ label, text, testId }: { label: string; text: string; testId: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-[color:var(--brand-blue)] transition-colors"
          data-testid={testId}
        >
          <Info className="w-3.5 h-3.5" />
          <span className="sr-only">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3 text-xs text-slate-600 leading-relaxed"
        align="start"
        data-testid={`${testId}-content`}
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}

function AddPhysicalGoodButton({
  availableFormats,
  onAdd,
}: {
  availableFormats: AlbumFormat[];
  onAdd: (f: AlbumFormat) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <AddEntityButton
        label="Add physical good"
        onClick={() => setOpen((v) => !v)}
        testId="button-add-physical-good"
      />
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            className="absolute right-0 top-full mt-1 z-20 w-52 rounded-md border border-slate-200 bg-white shadow-lg py-1"
            data-testid="menu-add-physical-good"
          >
            {availableFormats.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  onAdd(f);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
                data-testid={`menu-item-add-${f}`}
              >
                <Plus className="w-3 h-3 text-slate-400" />
                {ALBUM_FORMAT_LABEL[f]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CostTooltip({
  format,
  breakdown,
  brokerDiscountPct,
  isSuperAdmin,
}: {
  format: AlbumFormat;
  breakdown: {
    manufacturingCents: number;
    publishingCents: number;
    publishingTrackCount: number;
    paymentProcessingCents: number;
    goodtunesCents: number;
    source?: "hellbender" | "placeholder" | "catalog" | "mrp-default";
  };
  // Task #624 — admin-only broker-discount preview. When > 0 and the
  // current user is super_admin, the tooltip adds an "Internal mfg
  // (−N%)" line showing the discounted cost (= what we actually pay
  // the press) and the GoodTunes broker-margin delta. Artists never
  // see this; their breakdown is the retail stack above.
  brokerDiscountPct?: number;
  isSuperAdmin?: boolean;
}) {
  const total =
    breakdown.manufacturingCents +
    breakdown.publishingCents +
    breakdown.paymentProcessingCents +
    breakdown.goodtunesCents;
  const Row = ({ label, cents, bold }: { label: string; cents: number; bold?: boolean }) => (
    <div
      className={[
        "flex items-center justify-between gap-6 text-xs",
        bold ? "text-slate-900 font-semibold pt-1.5 border-t border-slate-100 mt-1" : "text-slate-600",
      ].join(" ")}
    >
      <span>{label}</span>
      <span className="tabular-nums">{dollars(cents)}</span>
    </div>
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Cost breakdown for ${ALBUM_FORMAT_LABEL[format]}`}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-[color:var(--brand-blue)] transition-colors"
          data-testid={`button-cost-breakdown-${format}`}
        >
          <Info className="w-3.5 h-3.5" />
          <span className="sr-only">Cost breakdown</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-3"
        align="start"
        data-testid={`tooltip-cost-${format}`}
      >
        <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
          Cost breakdown
        </div>
        <Row label="Manufacturing" cents={breakdown.manufacturingCents} />
        <Row
          label={`${breakdown.publishingTrackCount} tracks × $0.254`}
          cents={breakdown.publishingCents}
        />
        <Row label="Payment processing" cents={breakdown.paymentProcessingCents} />
        <Row label="GoodTunes" cents={breakdown.goodtunesCents} />
        <Row label="Total" cents={total} bold />
        {isSuperAdmin && brokerDiscountPct && brokerDiscountPct > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
              Internal — GoodTunes only
            </div>
            <Row
              label={`Discounted mfg (−${brokerDiscountPct}%)`}
              cents={Math.floor((breakdown.manufacturingCents * (100 - brokerDiscountPct)) / 100)}
            />
            <Row
              label="Broker margin to GoodTunes"
              cents={breakdown.manufacturingCents - Math.floor((breakdown.manufacturingCents * (100 - brokerDiscountPct)) / 100)}
            />
          </div>
        )}
        {breakdown.source && (
          <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
            {breakdown.source === "hellbender"
              ? "Source: Hellbender Vinyl reference matrix"
              : breakdown.source === "mrp-default"
                ? "Source: MRP catalog (platform default — no press invited yet)"
                : "Placeholder — per-plant matrix pending"}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Task #700 — Keep package collapse from jumping the page. Collapsing a
// SKU row unmounts its tall expanded body; the exclusive-disclosure
// behaviour also unmounts a sibling's body. Either way the page reflows
// upward and, because the cursor stays put, the trashcan can slide under
// the pointer (one stray click from deleting the format). We anchor on the
// element the user actually clicked via the shared `anchorScrollToElement`
// helper in `@/lib/anchorScroll` (lifted there in Task #709 so the album
// tab bar can reuse the exact same behaviour).

function SkuRow({
  format,
  existing,
  liveCost,
  catalogFormat,
  artworkUrl,
  offeredFormats,
  onSwitchFormat,
  onEditArtwork,
  onSave,
  onDelete,
  onChangeFormat,
  swapBusy = false,
  expanded,
  onSetExpanded,
  trackCount,
  liveTrackCount,
  anticipatedTrackCount,
  persistedAnticipatedTrackCount,
  onAnticipatedTrackLocalChange,
  onAnticipatedTrackCountChange,
  albumId,
  signedAddon,
  livePlatformCostCents,
  onSaveAddon,
  isPrimaryVinyl,
  isPrimaryGoodDeed,
  bookletAddon,
  isBookletAnchor,
  bookletEligibleExists,
  onSaveBookletAddon,
  albumTitle,
  artistName,
  artistPhotoUrl,
  primaryArtistId = null,
  albumQuoteLockedAt = null,
  totalRuntimeSec = 0,
  costByFormat,
  catalogByFormat,
  configuredFormats,
  onAfterBump,
  allPresses,
  invitedPressItself,
  pressFormatsByPress,
  allPlannedQuantities,
}: {
  format: AlbumFormat;
  existing: AlbumSku | null;
  liveCost: PayoutFormatCost | null;
  // Task #619 — total runtime of uploaded masters (seconds), plus
  // sibling maps so the row can compute the suggested format's cost
  // when previewing a bump. Maps are owned by SellPanel.
  totalRuntimeSec?: number;
  costByFormat?: Map<string, PayoutFormatCost>;
  catalogByFormat?: Map<AlbumFormat, CatalogFormatRow>;
  // Task #619 — formats that already have a saved SKU. The bump CTA
  // is suppressed when the suggested format is already configured
  // (so accepting wouldn't silently clobber the existing row), and
  // the inline warning surfaces a pointer instead.
  configuredFormats?: Set<AlbumFormat>;
  // Task #619 — parent callback fired after a successful bump so the
  // disclosure system can pop the new format's row open and (for
  // "Accept & adjust price") focus its Price input deterministically
  // once the SKUs query has refreshed.
  onAfterBump?: (newFormat: AlbumFormat, opts: { adjustPrice: boolean }) => void;
  // Task #218 — when present, the picker switches from the legacy
  // Hellbender matrix to the invited press's catalog (tier → color →
  // quantity ladder). Null = free / non-invited flow.
  catalogFormat: CatalogFormatRow | null;
  artworkUrl: string | null;
  // Task #390 — Format dropdown at the top of the expanded card lets
  // the artist pivot to any other offered format from inside the
  // current card. `offeredFormats` is the same list "+ Add physical
  // good" uses (catalog-restricted for invited presses; full list
  // otherwise). `onSwitchFormat` flips the disclosure and creates a
  // draft for not-yet-configured formats.
  offeredFormats: readonly AlbumFormat[];
  onSwitchFormat: (target: AlbumFormat) => void;
  onEditArtwork?: () => void;
  onSave: (b: {
    format: AlbumFormat;
    priceCents: number;
    stock: number | null;
    active: boolean;
    plannedQuantity: number | null;
    vinylColor: string | null;
    jacketUpgrade: JacketUpgrade | null;
    pressTierId?: string | null;
    pressColorId?: string | null;
    displayName?: string | null;
    // Task #423 — snapshotted track count so Publishing math stays
    // stable when songs are added / removed after Save.
    trackCount?: number | null;
    // Task #433 — per-row Lock toggle. Set true/false to flip the
    // row's lock; omit on every other Save so existing lock state is
    // preserved.
    locked?: boolean;
  }) => void;
  onDelete: () => void;
  // Task #654 — "Change the physical format" dialog (launched from the
  // album-jacket overlay icon) calls this with the adapted body for
  // the NEW format. Parent owns the PUT-new + DELETE-old swap so the
  // disclosure can be transferred cleanly. Optional — when absent the
  // overlay icon is hidden.
  onChangeFormat?: (args: {
    target: AlbumFormat;
    changes: string[];
    body: {
      format: AlbumFormat;
      priceCents: number;
      stock: number | null;
      active: boolean;
      plannedQuantity: number | null;
      vinylColor: string | null;
      jacketUpgrade: JacketUpgrade | null;
      pressTierId?: string | null;
      pressColorId?: string | null;
      displayName?: string | null;
      trackCount?: number | null;
    };
  }) => void;
  swapBusy?: boolean;
  // Exclusive-disclosure: owned by SellPanel via `useExclusiveDisclosure`.
  // Draft rows auto-open on mount so the operator can start editing
  // immediately; existing rows open on click. See docs/design-system.md
  // ("Expandable row lists").
  expanded: boolean;
  onSetExpanded: (open: boolean) => void;
  // Task #393 — vinyl-only props powering the live cost breakdown and
  // the in-card OPTIONAL GoodDeed pill. Non-vinyl rows ignore them.
  trackCount?: number;
  // Task #429 — split the live song count from the operator-typed
  // anticipated count so the input UI can decide which to show and
  // whether to disable. Math (`trackCount`) uses the effective value
  // already resolved by the caller.
  liveTrackCount?: number;
  anticipatedTrackCount?: number | null;
  // Last persisted value from the album row. The blur commit dedupes
  // against this (not the locally mirrored value) so a normal edit
  // still triggers the PUT.
  persistedAnticipatedTrackCount?: number | null;
  onAnticipatedTrackLocalChange?: (next: number | null) => void;
  onAnticipatedTrackCountChange?: (next: number | null) => void;
  albumId?: string;
  signedAddon?: AlbumAddon | null;
  livePlatformCostCents?: number | null;
  onSaveAddon?: (b: {
    priceCents: number;
    active: boolean;
    minPriceCents: number;
    plannedQuantity: number | null;
  }) => void;
  // Task #393 — `signed_cert` is a single album-level addon, so the
  // GoodDeed pill renders on the canonical vinyl row only (the first
  // configured vinyl format). Without this gate, multiple vinyl rows
  // would race-overwrite the same addon's plannedQuantity. SellPanel
  // sets this true on whichever vinyl row is first in the offered list.
  isPrimaryVinyl?: boolean;
  // Task #1423 — GoodDeed anchor that falls back to cassette when the
  // release has no vinyl at all. Equals isPrimaryVinyl whenever any
  // vinyl format exists (so vinyl releases are unchanged); on a
  // cassette-only release it points at the primary cassette row so the
  // GoodDeed certificate add-on is still offered, exactly like vinyl.
  isPrimaryGoodDeed?: boolean;
  // Task #579 — Booklet add-on parallel to signed_cert. The pill is
  // mounted only on the *anchor* SKU row (first 7" vinyl or cassette
  // in the configured-then-draft order), so two booklet-eligible rows
  // on the same album can't race-overwrite each other's plannedQuantity.
  bookletAddon?: AlbumAddon | null;
  isBookletAnchor?: boolean;
  // Task #687 — true when the album already has a booklet-eligible
  // SKU (7" vinyl or cassette), so the functional BookletPill renders
  // on its anchor row. When false on a vinyl release (e.g. 12"-only),
  // the primary-vinyl row instead surfaces a "request a quote" booklet
  // placeholder so the booklet option is never missing from the menu.
  bookletEligibleExists?: boolean;
  onSaveBookletAddon?: (b: {
    priceCents: number;
    active: boolean;
    minPriceCents: number;
    plannedQuantity: number | null;
    artworkUrl?: string | null;
    bundlePriceCents?: number | null;
  }) => void;
  // Task #397 — forwarded into the GoodDeed cert preview tile.
  albumTitle?: string;
  artistName?: string;
  artistPhotoUrl?: string | null;
  // Task #987 — primary artist (person) id, threaded through so the
  // inline "Custom" add-on tile can scope a new add-on to just this
  // artist (attach-on-create) or all artists.
  primaryArtistId?: string | null;
  // Task #433 — album-level Quote lock cascades to the row: when the
  // bigger Lock-in-quote CTA is engaged, every row is locked too
  // (visual + behavioural) so the album lock and per-row lock can't
  // disagree.
  albumQuoteLockedAt?: string | null;
  // Task #635 — full press list + the album's currently-invited
  // press, threaded in for the collapsed-header press-switcher
  // popover. Display-only: shows other presses qualified to quote
  // this format with a "Currently quoting" pill on the invited one.
  allPresses?: Manufacturer[] | null;
  invitedPressItself?: Manufacturer | null;
  // Task #635 — `(pressId → Set<format>)` index so the popover can
  // narrow `allPresses` down to those actually offering this format.
  pressFormatsByPress?: Map<string, Set<string>>;
  // Task #642 — saved plannedQuantity from every SKU on the album
  // (any format). Feeds the Estimates table's column union so the
  // operator can compare Artist Net at every pressing volume already
  // committed to elsewhere on the album, not just the rungs of this
  // row's own ladder.
  allPlannedQuantities?: number[];
}) {
  const isDraft = existing === null;
  const isVinyl = isVinylFormat(format);
  // Task #446 — 7" is the constrained Single format: jacket is fixed at
  // Standard Full-Color, tracks are mechanically 2 (one per side), and
  // the color picker is pared to Black + Opaque. Used throughout this
  // row to lock format/jacket/tracks/color picks for 7" while leaving
  // 12" / 10" / cassette / CD untouched.
  const sevenInch = format === "7_inch";
  const SEVEN_INCH_VISIBLE_TIERS: ReadonlyArray<import("@shared/pressing").VinylColorTier> = [
    "black",
    "opaque",
  ];
  const SEVEN_INCH_TRACK_COUNT = 2;
  // Detect rows saved before Task #446 with a now-hidden jacket / color
  // tier. We snap the in-memory pick to the allowed value (so the row
  // doesn't crash on render) and surface a one-line note so the next
  // save isn't silent. Pricing in the breakdown reads the snapshot
  // until the user actively edits the row (see dirty calc below).
  const sevenInchHiddenJacket =
    sevenInch && !!existing?.jacketUpgrade && existing.jacketUpgrade !== "none";
  const existingColorTier = existing?.vinylColor
    ? VINYL_COLOR_BY_ID[existing.vinylColor]?.tier ?? null
    : null;
  const sevenInchHiddenColor =
    sevenInch &&
    existingColorTier !== null &&
    !SEVEN_INCH_VISIBLE_TIERS.includes(existingColorTier);
  // Draft rows auto-open on first mount — the operator just picked the
  // format from the "+ Add" menu and clearly wants to start editing.
  useEffect(() => {
    if (isDraft && !expanded) onSetExpanded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Task #624 — admin-only broker discount preview in the cost
  // tooltip. Both queries are keyed identically to existing fetches
  // elsewhere in the page so TanStack Query dedupes them for free.
  const { data: roleInfo } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
  });
  const isSuperAdmin = roleInfo?.role === "super_admin" || roleInfo?.role === "admin";
  // Task #859 — an `artist` partner sees Artist Net and quantity
  // estimates, but never the vendor cost stack, platform margin,
  // never-lose-money ladder, or the operator-only PDF export.
  const isArtist = roleInfo?.role === "artist";
  const { data: invitedPressRow } = useQuery<InvitedPressResponse>({
    queryKey: ["/api/admin/albums", albumId, "invited-press"],
  });
  const brokerDiscountPct = invitedPressRow?.press?.brokerDiscountPct ?? 0;
  // Task #656 — MRP catalog row for this format, surfaced by the
  // server when no press has been invited. The breakdown's no-catalog
  // vinyl branch reads its manufacturing rung from here so the Profit
  // card stops showing $0 manufacturing on un-invited albums. Stays
  // null on albums that have an invited press (the catalog flow above
  // already owns the cost lookup) and on non-vinyl rows.
  const mrpDefaultFormat = useMemo<CatalogFormatRow | null>(() => {
    if (catalogFormat) return null; // invited-press catalog owns this format
    if (!isVinyl) return null;
    const formats = invitedPressRow?.mrpDefaults?.formats ?? [];
    return formats.find((f) => f.format === format) ?? null;
  }, [catalogFormat, isVinyl, format, invitedPressRow?.mrpDefaults]);
  const [active, setActive] = useState(existing?.active ?? true);
  // Task #705 — sensible per-format defaults on a fresh (unsaved) card so
  // the artist lands on a real price + run size instead of an empty field.
  // Saved rows always re-open at their stored values.
  const FRESH_CARD_DEFAULTS: Record<string, { qty: number; priceCents: number }> = {
    "12_lp": { qty: 500, priceCents: 3500 },
    "12_double": { qty: 500, priceCents: 5000 },
    "7_inch": { qty: 500, priceCents: 2500 },
  };
  const [priceStr, setPriceStr] = useState(
    existing
      ? (existing.priceCents / 100).toFixed(2)
      : FRESH_CARD_DEFAULTS[format]
        ? (FRESH_CARD_DEFAULTS[format].priceCents / 100).toFixed(2)
        : "",
  );
  // Task #397 — inline-editable row label (Tracks-row pattern). Empty
  // string serialises to NULL server-side and the read path falls
  // back to the format label, so the header never renders as
  // "Untitled". Autosaves through the same debounced submit() the
  // rest of the vinyl card uses.
  const [displayNameStr, setDisplayNameStr] = useState<string>(
    existing?.displayName ?? "",
  );
  // Task #385 — vinyl rows lose Stock + the unlimited radio. Non-vinyl
  // rows (CD / cassette / merch) keep the legacy fixed/unlimited mode
  // and the Stock input untouched (out of scope for #385).
  const [stockStr, setStockStr] = useState(existing?.stock?.toString() ?? "");
  const initialQtyMode: "fixed" | "unlimited" =
    existing?.plannedQuantity != null ? "fixed" : "unlimited";
  const [qtyMode, setQtyMode] = useState<"fixed" | "unlimited">(initialQtyMode);
  const [qtyInput, setQtyInput] = useState<string>(
    existing?.plannedQuantity != null
      ? String(existing.plannedQuantity)
      : String(DEFAULT_VINYL_QUANTITY),
  );
  const legacyParsedQty = useMemo(() => {
    const n = Number.parseInt(qtyInput.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [qtyInput]);
  // Task #654 — open state for the "Change the physical format" modal
  // launched from the album-jacket overlay icon. Modal renders + adapts
  // picks at confirm time; the parent owns the actual PUT/DELETE swap.
  const [changeFormatOpen, setChangeFormatOpen] = useState(false);
  // Task #708 — the Optional · Upsells block lays its tiles side-by-side
  // in a responsive row; only one editor body is open at a time, rendered
  // BELOW the row via a portal into `upsellBodyEl`. `openUpsell` holds the
  // key of the active tile (or null when all are collapsed).
  const [openUpsell, setOpenUpsell] = useState<string | null>(null);
  const [upsellBodyEl, setUpsellBodyEl] = useState<HTMLDivElement | null>(
    null,
  );
  const { toast } = useToast();
  // Task #707 — Quote PDF export in-flight flag (per row). Disables the
  // export affordance + swaps in a spinner while the server renders.
  const [exportingPdf, setExportingPdf] = useState(false);
  // Task #200 — vinyl picks. Initialised from the SKU snapshot (when
  // present) so a saved row re-opens with the picks the artist locked
  // in. New / non-vinyl rows fall back to platform defaults.
  const [vinylColorId, setVinylColorId] = useState<string>(
    sevenInchHiddenColor
      ? DEFAULT_VINYL_COLOR_ID
      : existing?.vinylColor && VINYL_COLOR_BY_ID[existing.vinylColor]
        ? existing.vinylColor
        : DEFAULT_VINYL_COLOR_ID,
  );
  const vinylColor: VinylColorOption = VINYL_COLOR_BY_ID[vinylColorId] ?? VINYL_COLOR_BY_ID[DEFAULT_VINYL_COLOR_ID];
  // Task #385 — legacy color "section" (tier). Picking a section
  // filters the swatch row to that tier and auto-selects its first
  // color.
  // Task #446 — for 7" we trim the tier list to Black + Opaque; if the
  // current color belongs to a hidden tier (back-compat snap), start
  // on Black so the picker stays in a visible state.
  const [legacyColorTier, setLegacyColorTier] = useState<import("@shared/pressing").VinylColorTier>(
    sevenInch && !SEVEN_INCH_VISIBLE_TIERS.includes(vinylColor.tier) ? "black" : vinylColor.tier,
  );
  // Task #390 — when the section changes, snap to the first swatch in
  // that tier (the old behavior lived in VinylPicksBlock, which the
  // new layout no longer renders for vinyl rows).
  useEffect(() => {
    if (vinylColor.tier === legacyColorTier) return;
    const first = VINYL_COLORS.find((c) => c.tier === legacyColorTier);
    if (first) setVinylColorId(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyColorTier]);
  // Task #385 — 12"LP always ships with the standard jacket.
  // Task #446 — 7" is also locked to the Standard Full-Color Jacket
  // (the only 7" jacket we currently offer); the upgrade picker is
  // hidden for both formats.
  const jacketDropdownAllowed = isVinyl && format !== "12_lp" && format !== "7_inch";
  const [jacketUpgrade, setJacketUpgrade] = useState<JacketUpgrade>(
    jacketDropdownAllowed
      ? ((existing?.jacketUpgrade as JacketUpgrade | null | undefined) ?? DEFAULT_JACKET_UPGRADE)
      : DEFAULT_JACKET_UPGRADE,
  );

  // Task #218 — catalog picks (only when an invited press's catalog
  // covers this format). Initial tier defaults to the first one; if
  // the saved SKU's `vinylColorTier` matches a tier name, re-pick it.
  // Same trick for color via `vinylColor` (snapshotted as the color's
  // display name on save).
  const tiers = catalogFormat?.tiers ?? [];
  // Task #1025 — a color WAS saved on this row if either the exact
  // catalog id (new snapshots) or the legacy display-name snapshot is
  // present. Drives the "unresolved" state below so we never silently
  // overwrite a saved-but-now-unmatchable color with the first swatch.
  const hadSavedColor = !!(existing?.pressColorId || existing?.vinylColor);
  // Task #1025 — resolve the saved tier id-first (exact catalog row),
  // then by name for legacy rows, then the existing first-with-colors
  // fallback so an empty grid never shows.
  const initialTier = useMemo(
    () => {
      if (existing?.pressTierId) {
        const byId = tiers.find((t) => t.id === existing.pressTierId);
        if (byId) return byId;
      }
      return resolveTierByName(tiers, existing?.vinylColorTier ?? null);
    },
    [tiers, existing?.pressTierId, existing?.vinylColorTier],
  );
  const [pressTierId, setPressTierId] = useState<string | null>(initialTier?.id ?? null);
  const pickedTier = tiers.find((t) => t.id === pressTierId) ?? initialTier ?? null;
  // Task #1025 — resolve the saved color id-first, then by display name
  // (legacy rows). If a color WAS saved but resolves against neither the
  // live catalog id nor name, leave it UNRESOLVED (null) instead of
  // snapping to the first swatch — the bug Bill hit where reopening a row
  // under a re-imported catalog silently overwrote his pick. Fresh draft
  // rows (no saved color) still default to the first swatch.
  const initialColorId = useMemo(
    () => {
      if (!pickedTier || pickedTier.colors.length === 0) return null;
      if (existing?.pressColorId) {
        const byId = pickedTier.colors.find((c) => c.id === existing.pressColorId);
        if (byId) return byId.id;
      }
      if (existing?.vinylColor) {
        const want = existing.vinylColor.toLowerCase().trim();
        const byName = pickedTier.colors.find(
          (c) => c.name.toLowerCase().trim() === want,
        );
        if (byName) return byName.id;
      }
      if (hadSavedColor) return null;
      return pickedTier.colors[0]?.id ?? null;
    },
    [pickedTier, existing?.pressColorId, existing?.vinylColor, hadSavedColor],
  );
  const [pressColorId, setPressColorId] = useState<string | null>(initialColorId);
  // Task #1025 — a saved color that no longer resolves against the live
  // catalog. Surfaces an explicit "Previously X — choose a color" banner
  // and suppresses autosave so the row can't silently re-snapshot a
  // fallback color over the operator's intent.
  const colorUnresolved =
    !!catalogFormat &&
    !!pickedTier &&
    pickedTier.colors.length > 0 &&
    hadSavedColor &&
    pressColorId === null;
  // When tier changes, reset color to the first one in the new tier.
  // Task #1025 — skip the first run (mount, or catalog arriving after
  // mount) so the deliberate unresolved (null) initial color isn't
  // immediately clobbered by the first-swatch fallback. Only genuine
  // operator-driven tier changes after mount snap the color.
  const tierResetMountRef = useRef(true);
  useEffect(() => {
    if (tierResetMountRef.current) {
      tierResetMountRef.current = false;
      return;
    }
    if (!pickedTier) {
      if (pressColorId !== null) setPressColorId(null);
      return;
    }
    const stillThere = pickedTier.colors.find((c) => c.id === pressColorId);
    if (!stillThere) setPressColorId(pickedTier.colors[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedTier?.id]);

  // Task #1012 — when the operator switches the Printer chip in
  // "All Presses" mode, SellPanel re-points `catalogFormat` at the
  // newly-selected press's catalog (different tier/color ids). Re-resolve
  // the picked tier + color by NAME against the new catalog so the
  // operator's choice carries over when the press offers a match,
  // falling back to that press's first tier/color otherwise — mirroring
  // the cross-press comparison-row color matching. `pressTierId` /
  // `pressColorId` are id-keyed, so they go stale on a catalog swap;
  // this effect re-keys them. Declared AFTER the tier-change reset above
  // so, in the single swap commit where both fire, this one's color
  // write wins (the reset would otherwise snap to the first color).
  const pickedColorName =
    pickedTier?.colors.find((c) => c.id === pressColorId)?.name ?? null;
  const pickedTierName = pickedTier?.name ?? null;
  const catalogSig = useMemo(
    () => (catalogFormat ? catalogFormat.tiers.map((t) => t.id).join("|") : ""),
    [catalogFormat],
  );
  const lastCatalogPicksRef = useRef<{
    sig: string;
    tierName: string | null;
    colorName: string | null;
  }>({ sig: catalogSig, tierName: pickedTierName, colorName: pickedColorName });
  // While the catalog identity is unchanged, keep the remembered picks
  // current so a later swap re-maps from the operator's latest choice
  // (not a stale snapshot). On a swap render `catalogSig` differs, so we
  // intentionally skip the update and preserve the pre-swap names for the
  // effect below to consume.
  if (catalogSig === lastCatalogPicksRef.current.sig) {
    lastCatalogPicksRef.current.tierName = pickedTierName;
    lastCatalogPicksRef.current.colorName = pickedColorName;
  }
  useEffect(() => {
    if (catalogSig === lastCatalogPicksRef.current.sig) return;
    const tiersNow = catalogFormat?.tiers ?? [];
    if (tiersNow.length > 0) {
      const { tierName, colorName } = lastCatalogPicksRef.current;
      // Task #1025 — if this swap landed us on the press the SKU was
      // SAVED against (its pinned tier id exists in this catalog), restore
      // Bill's exact saved tier + color identity (id-first; leave the
      // color unresolved if its id is gone) rather than re-matching by
      // name. This is what makes the programmatic snap-to-pinned-press
      // (and any admin whose chip differs from the pin) reconcile to the
      // SAME saved color instead of a name collision or first-swatch
      // fallback. For a deliberate switch to any OTHER press we keep
      // Task #1012's name-based carry-over so the operator's pick follows
      // them across presses in god-view.
      const pinnedTier = existing?.pressTierId
        ? tiersNow.find((t) => t.id === existing.pressTierId) ?? null
        : null;
      if (pinnedTier) {
        setPressTierId(pinnedTier.id);
        setPressColorId(
          existing?.pressColorId
            ? pinnedTier.colors.find((c) => c.id === existing.pressColorId)?.id ??
                null
            : resolveColorByName(pinnedTier, colorName)?.id ?? null,
        );
      } else {
        const nextTier = resolveTierByName(tiersNow, tierName);
        const nextColor = resolveColorByName(nextTier, colorName);
        if (nextTier) {
          setPressTierId(nextTier.id);
          setPressColorId(nextColor?.id ?? null);
        }
      }
    }
    lastCatalogPicksRef.current.sig = catalogSig;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogSig]);

  const usingCatalog = !!catalogFormat && !!pickedTier;
  // Task #1423 — a catalog-priced (MRP) cassette renders through the rich
  // "Design your Package" card that vinyl uses (Tracks · Pricing options ·
  // Profit · Artist Net · Duplicate · Export quote · GoodDeed), not the
  // legacy Stock/∞ + estimated-sold-chips branch. The legacy branch stays
  // for genuinely un-catalog-priced non-vinyl rows (e.g. a CD with no
  // invited-press pricing). Vinyl rows are unaffected (isVinyl ⊂ useRichCard).
  const useRichCard = isVinyl || usingCatalog;
  // Task #1311 — true when an artist's plant is set but its catalog does
  // NOT include this format (e.g. Hellbender set while wanting cassette
  // pricing).  Used in the non-vinyl breakdown branch to surface an honest
  // needsQuote state rather than a silent $0 manufacturing line.
  const pressSetButFormatUnsupported = !!invitedPressItself && !catalogFormat && !isVinyl;

  // Task #385 — quantity rungs the dropdown offers. Catalog flow reads
  // them off the picked tier's price ladder; legacy Hellbender flow
  // uses the published quantity tiers; non-vinyl has no rung concept
  // so the picker falls back to a number input.
  const quantityRungs = useMemo<number[]>(() => {
    if (usingCatalog && pickedTier) {
      return [...pickedTier.priceLadder].sort((a, b) => a.qty - b.qty).map((r) => r.qty);
    }
    if (isVinyl) return [...VINYL_QUANTITY_TIERS];
    return [];
  }, [usingCatalog, pickedTier, isVinyl]);

  // Picked quantity (the rung itself, in vinyl/catalog flows). Snaps
  // existing rows to the nearest available rung on first mount so a
  // legacy SKU with a weird qty (75) opens at the next-up rung (100).
  const initialQty = useMemo<number>(() => {
    // Task #705 — fresh cards default to the per-format run size (500)
    // instead of the platform-wide DEFAULT_VINYL_QUANTITY.
    const freshDefaultQty = FRESH_CARD_DEFAULTS[format]?.qty ?? DEFAULT_VINYL_QUANTITY;
    const saved = existing?.plannedQuantity;
    if (usingCatalog && pickedTier) {
      const snapped = snapCatalogLadder(pickedTier.priceLadder, saved ?? freshDefaultQty);
      return snapped?.qty ?? freshDefaultQty;
    }
    if (isVinyl) return snapToQuantityTier(saved ?? freshDefaultQty).tier;
    return saved ?? freshDefaultQty;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [parsedQty, setParsedQty] = useState<number>(initialQty);
  // When the user switches tier (catalog flow), snap the current qty
  // onto the new tier's ladder so the picker stays in sync.
  useEffect(() => {
    if (!usingCatalog || !pickedTier) return;
    const inLadder = pickedTier.priceLadder.some((r) => r.qty === parsedQty);
    if (!inLadder) {
      const snapped = snapCatalogLadder(pickedTier.priceLadder, parsedQty);
      if (snapped) setParsedQty(snapped.qty);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedTier?.id]);

  // Snap helpers for the cost calculator (identity when the user is
  // picking from the rungs directly, but still useful so the legacy
  // path keeps the same "request a custom quote" caveat above the cap).
  const qtySnap = useMemo(() => snapToQuantityTier(parsedQty), [parsedQty]);
  const catalogSnap = useMemo(
    () =>
      usingCatalog && pickedTier ? snapCatalogLadder(pickedTier.priceLadder, parsedQty) : null,
    [usingCatalog, pickedTier, parsedQty],
  );

  // Task #393 — Publishing / payment-processing / GoodTunes are now
  // computed live from real formulas instead of reading whatever the
  // payout-cost defaults table returns (which was $0 for every saved
  // row that hadn't been re-snapshotted). Formulas:
  //   • Publishing       = trackCount × $0.254  ($0.127/track × 2 for
  //                        vinyl + digital mechanicals, industry std).
  //   • Payment proc.    = round(retail × 2.9%) + $0.30 (Stripe-style;
  //                        placeholder for fulfillment + GoodDeed + tax).
  //   • GoodTunes        = flat $4.50 per unit.
  // Manufacturing keeps the existing snapshot-on-unchanged behaviour
  // (vinyl: Hellbender / catalog matrix recomputes live when picks
  // change; non-vinyl: snapshot wins until re-save).
  // Task #423 — track count itself is snapshotted on Save (alongside
  // manufacturing) so the Publishing line stops drifting when songs
  // are added / removed on the album. Saved-and-clean rows read the
  // snapshot; dirty or unsaved rows recompute against the live count
  // and re-snapshot on the next Save.
  const priceCentsForCost = useMemo(() => parseDollars(priceStr) ?? 0, [priceStr]);
  // Task #446 — 7" is mechanically a two-track single (one per side),
  // so the row's effective track count defaults to 2 whenever no real
  // masters have been uploaded yet. Live tracklist wins once songs
  // exist (same rule as every other format). Used by the Publishing
  // line of the breakdown, the trackCountDirty check, and the
  // snapshot persisted via submit().
  const songsUploaded = (liveTrackCount ?? 0) > 0;
  const effectiveTrackCount = sevenInch && !songsUploaded
    ? SEVEN_INCH_TRACK_COUNT
    : (trackCount ?? 0);
  const breakdown = useMemo(() => {
    const snapshotTrackCount = existing?.costSnapshotTrackCount ?? null;
    const publishingFor = (n: number) => Math.round(n * MECH_RATE_CENTS_PER_TRACK);
    // Task #429 — if the album's effective track count (live tracklist
    // or anticipated count) has drifted from the snapshotted value, fall
    // back to the live number so Publishing reprices immediately. The
    // SkuRow dirty calc below mirrors this so the row's Save lights up
    // and the next Save re-snapshots costSnapshotTrackCount.
    const trackCountDrift =
      snapshotTrackCount != null && snapshotTrackCount !== effectiveTrackCount;
    const sideCarFor = (useSnapshot: boolean) => {
      const tc =
        useSnapshot && snapshotTrackCount != null && !trackCountDrift
          ? snapshotTrackCount
          : effectiveTrackCount;
      return {
        publishingCents: publishingFor(tc),
        publishingTrackCount: tc,
        paymentProcessingCents: Math.round(priceCentsForCost * 0.029) + 30,
        goodtunesCents: 450,
      };
    };
    if (usingCatalog && pickedTier) {
      // Catalog-driven: live snap from the picked tier's ladder. Mirror
      // the snapshot-vs-live trick from the legacy block so a saved row
      // shows the locked snapshot until the artist actually changes a
      // pick (then we recompute and re-snapshot at Save).
      const pickedColor = pickedTier.colors.find((c) => c.id === pressColorId);
      const storedTierName = existing?.vinylColorTier ?? null;
      const storedColorName = existing?.vinylColor ?? null;
      const storedQtyTier = existing?.quantityTier ?? null;
      const picksDirty =
        pickedTier.name !== storedTierName ||
        (pickedColor?.name ?? null) !== storedColorName ||
        (storedQtyTier !== null && catalogSnap !== null && catalogSnap.qty !== storedQtyTier);
      // Task #652 — a snapshot is "stale" and must be ignored when
      // either (a) it's <= 0 (the row was saved before the catalog
      // ladder rung was filled in, so $0 got persisted and would
      // silently understate cost forever), or (b) the snapshot
      // disagrees with the live confirmed rung for the same picks
      // (a press re-priced its rung after the row was saved). In
      // both cases we fall through to the live-snap branch so the
      // breakdown shows the real number, and the source badge below
      // flips to "live · catalog" until the operator re-Saves and
      // re-locks the row at the healed value.
      const liveRungCents = catalogSnap?.unitCents ?? null;
      const snapshot = existing?.costSnapshotManufacturingCents ?? null;
      const snapshotStale =
        snapshot != null &&
        (snapshot <= 0 ||
          (liveRungCents != null && snapshot !== liveRungCents));
      if (
        existing &&
        snapshot != null &&
        !snapshotStale &&
        !picksDirty
      ) {
        return {
          manufacturingCents: snapshot,
          ...sideCarFor(true),
          source: "catalog" as const,
          needsQuote: false,
          usingSnapshot: true,
        };
      }
      // If the picked tier has no confirmed rung at this quantity
      // (snap returns null) OR the rung is priced at 0, fall through
      // to needsQuote so the operator sees a clear "no rung price"
      // hint instead of a silent $0.00 in the breakdown.
      const rungMissing = liveRungCents === null || liveRungCents <= 0;
      return {
        manufacturingCents: liveRungCents ?? 0,
        ...sideCarFor(false),
        source: "catalog" as const,
        needsQuote: rungMissing,
        usingSnapshot: false,
      };
    }
    if (isVinyl) {
      // Snapshot-at-save semantics: if the row is saved AND the
      // artist hasn't changed any of the picks the matrix is keyed
      // by, show the locked snapshot so the cost is stable until
      // they explicitly re-save (mirroring #194). If picks ARE
      // dirty, recompute live so the artist sees the new cost as
      // they tweak; that new number gets snapshotted on Save.
      // Task #446 — for 7" rows that were saved against a now-hidden
      // tier / jacket, treat the snapped values as the stored picks so
      // the breakdown keeps showing the locked snapshot until the user
      // actively re-picks (matches storedColor/storedJacket above).
      const storedColorId = sevenInchHiddenColor
        ? DEFAULT_VINYL_COLOR_ID
        : (existing?.vinylColor ?? DEFAULT_VINYL_COLOR_ID);
      const storedJacketLocal: JacketUpgrade = sevenInchHiddenJacket
        ? DEFAULT_JACKET_UPGRADE
        : ((existing?.jacketUpgrade as JacketUpgrade | null | undefined) ?? DEFAULT_JACKET_UPGRADE);
      const storedTier = existing?.quantityTier ?? null;
      const picksDirty =
        vinylColorId !== storedColorId ||
        jacketUpgrade !== storedJacketLocal ||
        (storedTier !== null && qtySnap.tier !== storedTier);
      if (
        existing &&
        existing.costSnapshotManufacturingCents != null &&
        existing.costSnapshotManufacturingCents > 0 &&
        !picksDirty
      ) {
        return {
          manufacturingCents: existing.costSnapshotManufacturingCents,
          ...sideCarFor(true),
          source: "hellbender" as const,
          needsQuote: false,
          usingSnapshot: true,
        };
      }
      // Task #656 — no invited press, but MRP's catalog is shipped as
      // the platform-wide manufacturing default. Map the legacy color-
      // tier pick to MRP's three-tier scheme (black → "Black",
      // everything else → "Color") and snap parsedQty up to MRP's
      // confirmed rungs. We resolve against MRP's default jacket via
      // the same `priceLadder` the invited-press path uses, so a
      // missing/unconfirmed rung still falls back to needsQuote (with
      // updated copy pointing operators at Admin → Presses → MRP).
      const mrpFormat = mrpDefaultFormat;
      if (mrpFormat && mrpFormat.tiers.length > 0) {
        const tierName = vinylColor.tier === "black" ? "Black" : "Color";
        const mrpTier =
          mrpFormat.tiers.find((t) => t.name.toLowerCase() === tierName.toLowerCase()) ??
          mrpFormat.tiers[0];
        const mrpSnap = snapCatalogLadder(mrpTier.priceLadder, parsedQty);
        const cents = mrpSnap?.unitCents ?? 0;
        if (mrpSnap && cents > 0) {
          return {
            manufacturingCents: cents,
            ...sideCarFor(false),
            source: "mrp-default" as const,
            needsQuote: false,
            usingSnapshot: false,
          };
        }
      }
      // No MRP rung available for this tier × qty (e.g. an off-catalog
      // size or a rung not yet confirmed by MRP). Surface the same
      // needsQuote chrome as before but with copy that points at the
      // real place to confirm a rung (Admin → Presses → MRP).
      return {
        manufacturingCents: 0,
        ...sideCarFor(false),
        source: "placeholder" as const,
        needsQuote: true,
        usingSnapshot: false,
      };
    }
    // Non-vinyl: snapshot wins until re-save (preserve #194 behaviour).
    // Mirror that for Publishing — if we have a manufacturing snapshot
    // we treat the row as locked and pull the snapshotted track count
    // too (Task #423). Task #652 — a $0 (or negative) snapshot is the
    // same stale-write trap we hit on catalog rows, so treat it as
    // absent and fall back to the live placeholder until the operator
    // re-Saves.
    // Task #1311 — when an artist's plant is set but its catalog doesn't
    // cover this format, return null so totalCostCents / profitCents /
    // totalCents all read as "—" (honest unsupported state).  Honor a
    // previously-saved snapshot: the operator may have a real manual
    // quote (e.g. a bespoke price) that must stay visible.
    const snapshot = existing?.costSnapshotManufacturingCents ?? null;
    const hasValidSnapshot = snapshot != null && snapshot > 0;
    if (pressSetButFormatUnsupported && !hasValidSnapshot) return null;
    const manufacturingCents = hasValidSnapshot
      ? snapshot
      : (liveCost?.manufacturingCents ?? 0);
    return {
      manufacturingCents,
      ...sideCarFor(hasValidSnapshot),
      source: "placeholder" as const,
      needsQuote: false,
      usingSnapshot: hasValidSnapshot,
    };
  }, [
    existing,
    liveCost,
    isVinyl,
    format,
    vinylColor.tier,
    vinylColorId,
    qtySnap.tier,
    jacketUpgrade,
    usingCatalog,
    pickedTier,
    pressColorId,
    catalogSnap,
    trackCount,
    priceCentsForCost,
    mrpDefaultFormat,
    parsedQty,
    pressSetButFormatUnsupported,
  ]);

  const totalCostCents = breakdown
    ? breakdown.manufacturingCents +
      breakdown.publishingCents +
      breakdown.paymentProcessingCents +
      breakdown.goodtunesCents
    : null;

  // Task #619 — fit check + bump suggestion. Runs only for vinyl rows
  // with real audio uploaded; the suggested format is filtered against
  // the invited press's catalog (if any) so we don't offer a bump the
  // press can't actually press.
  const fitReport = useMemo(
    () => fitForFormat({ totalSeconds: totalRuntimeSec ?? 0, format }),
    [totalRuntimeSec, format],
  );
  const catalogScoped = !!catalogByFormat && catalogByFormat.size > 0;
  const suggestedFormat = useMemo<AlbumFormat | null>(() => {
    if (!fitReport.suggestedFormat) return null;
    if (catalogScoped && !catalogByFormat!.has(fitReport.suggestedFormat)) {
      return null;
    }
    return fitReport.suggestedFormat;
  }, [fitReport.suggestedFormat, catalogScoped, catalogByFormat]);
  const showFitWarning = isVinyl && !fitReport.fits && (totalRuntimeSec ?? 0) > 0;

  // Preview + commit state for the bump CTA. `previewOpen` flips the
  // inline message from "View Suggestion" → "Accept / Undo".
  // `confirmOpen` is the AlertDialog modal; `confirmIntent` carries
  // whether the operator chose "Accept" or "Accept & adjust price"
  // so the post-commit focus knows where to land.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Reset preview state when the fit problem disappears (e.g. operator
  // deleted a song or already accepted the bump).
  useEffect(() => {
    if (!showFitWarning || !suggestedFormat) {
      setPreviewOpen(false);
      setConfirmOpen(false);
    }
  }, [showFitWarning, suggestedFormat]);

  // Manufacturing cost for the suggested format, used by the preview
  // margin readout + the AlertDialog's "$X.XX → $Y.YY" copy. Picks the
  // closest catalog tier by name (falls back to first/cheapest), then
  // snaps to the nearest rung on that tier's ladder. Legacy flow uses
  // the Hellbender matrix with the row's current color/jacket picks;
  // when that returns null (e.g. 12" Double LP has no per-rung matrix
  // yet) we fall back to the platform-default per-format placeholder.
  // Deterministic tier/color picker for the suggested format. Same
  // function is used by both the preview cost readout and the commit
  // path, so the dialog's "new per-unit profit" is exactly what gets
  // saved. `fellBackTier` / `fellBackColor` drive the disclosure line
  // shown in the preview ("Closest tier/color not on this format —
  // using ___ instead.").
  const suggestedPick = useMemo(() => {
    if (!suggestedFormat) return null;
    const row = catalogByFormat?.get(suggestedFormat);
    if (!row || row.tiers.length === 0) return null;
    const currentTierName = pickedTier?.name ?? "";
    const currentColorName =
      pickedTier?.colors.find((c) => c.id === pressColorId)?.name ?? "";
    const sortedByCheapest = [...row.tiers].sort((a, b) => {
      const aMin = Math.min(...a.priceLadder.map((r) => r.unitCents));
      const bMin = Math.min(...b.priceLadder.map((r) => r.unitCents));
      return aMin - bMin;
    });
    const matchedTier = row.tiers.find((t) => t.name === currentTierName);
    const tier = matchedTier ?? sortedByCheapest[0];
    const matchedColor = tier.colors.find((c) => c.name === currentColorName);
    const color = matchedColor ?? tier.colors[0] ?? null;
    return {
      tier,
      color,
      fellBackTier: !matchedTier && !!currentTierName,
      fellBackColor: !matchedColor && !!currentColorName,
    };
  }, [suggestedFormat, catalogByFormat, pickedTier, pressColorId]);

  const suggestedManufacturingCents = useMemo<number | null>(() => {
    if (!suggestedFormat) return null;
    if (suggestedPick) {
      const snapped = snapCatalogLadder(suggestedPick.tier.priceLadder, parsedQty);
      return snapped?.unitCents ?? null;
    }
    // Task #624 — legacy Hellbender matrix is retired as a pricing
    // source. When the suggested format has no catalog pick we fall
    // straight to the per-format platform placeholder; the preview
    // surfaces "needs quote" rather than a stale matrix number.
    return costByFormat?.get(suggestedFormat)?.manufacturingCents ?? null;
  }, [
    suggestedFormat,
    suggestedPick,
    parsedQty,
    costByFormat,
  ]);

  // Total cost / per-unit profit for the suggested format. Re-uses
  // the same publishing / payment-processing / GoodTunes side-cars
  // the current row's breakdown computes, so the delta the operator
  // sees in the dialog matches the same model the rest of the row
  // already reports.
  const suggestedTotalCostCents = useMemo<number | null>(() => {
    if (suggestedManufacturingCents == null || !breakdown) return null;
    return (
      suggestedManufacturingCents +
      breakdown.publishingCents +
      breakdown.paymentProcessingCents +
      breakdown.goodtunesCents
    );
  }, [suggestedManufacturingCents, breakdown]);
  const suggestedProfitCents = useMemo<number | null>(() => {
    if (suggestedTotalCostCents == null) return null;
    const p = parseDollars(priceStr);
    if (p == null) return null;
    return p - suggestedTotalCostCents;
  }, [suggestedTotalCostCents, priceStr]);

  const priceCents = useMemo(() => parseDollars(priceStr), [priceStr]);
  const profitCents =
    priceCents !== null && totalCostCents !== null ? priceCents - totalCostCents : null;

  // Task #624 — admin-only internal margin. Same stack as the
  // artist-facing total cost above, but with retail manufacturing
  // replaced by the discounted amount GoodTunes actually pays the
  // press. Drives the visible "Internal margin" row admins see under
  // the breakdown; surfaces the broker-discount lift on the same
  // number the artist sees as profit.
  const effectiveManufacturingCents = useMemo<number | null>(() => {
    if (!breakdown) return null;
    if (!brokerDiscountPct || brokerDiscountPct <= 0) return breakdown.manufacturingCents;
    return Math.floor((breakdown.manufacturingCents * (100 - brokerDiscountPct)) / 100);
  }, [breakdown, brokerDiscountPct]);
  const internalTotalCostCents = useMemo<number | null>(() => {
    if (!breakdown || effectiveManufacturingCents === null) return null;
    return (
      effectiveManufacturingCents +
      breakdown.publishingCents +
      breakdown.paymentProcessingCents +
      breakdown.goodtunesCents
    );
  }, [breakdown, effectiveManufacturingCents]);
  const internalProfitCents = useMemo<number | null>(() => {
    if (priceCents === null || internalTotalCostCents === null) return null;
    return priceCents - internalTotalCostCents;
  }, [priceCents, internalTotalCostCents]);
  const brokerDeltaCents = useMemo<number>(() => {
    if (!breakdown || !brokerDiscountPct || brokerDiscountPct <= 0) return 0;
    return breakdown.manufacturingCents - Math.floor((breakdown.manufacturingCents * (100 - brokerDiscountPct)) / 100);
  }, [breakdown, brokerDiscountPct]);

  // Task #385 — Estimated sold control. 25/50/75 chips plus a "Custom"
  // numeric input. Default is 25% of the picked quantity. Total =
  // profit × estimated sold (rounded down). Purely a display control —
  // it doesn't get persisted; the SKU still stores `plannedQuantity`.
  type EstPct = 25 | 50 | 75 | "custom";
  const [estPct, setEstPct] = useState<EstPct>(25);
  const [estCustomStr, setEstCustomStr] = useState<string>("");
  // Task #390 — Profit row is a collapsible disclosure inside the new
  // vinyl card layout. Closed by default; the chevron reveals the
  // per-unit cost breakdown inline (replaces the old CostTooltip
  // popover for vinyl rows).
  // Task #705 — per-pricing-block Profit disclosure. The primary block
  // defaults open (so the breakdown reads at a glance); duplicated
  // blocks default closed to keep the 2-up grid compact.
  const [openProfitKeys, setOpenProfitKeys] = useState<Set<string>>(
    () => new Set(["primary"]),
  );
  const toggleProfit = (key: string) =>
    setOpenProfitKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const estimatedSold = useMemo(() => {
    if (estPct === "custom") {
      const n = Number.parseInt(estCustomStr.replace(/[^0-9]/g, ""), 10);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.min(n, parsedQty);
    }
    return Math.max(0, Math.floor((parsedQty * estPct) / 100));
  }, [estPct, estCustomStr, parsedQty]);

  // Task #390 — vinyl Total is now the simple profit × selected qty
  // (estimated-sold chips are gone from the vinyl card). Non-vinyl
  // keeps the legacy fixed×qty (or TBD when unlimited) branch.
  // Task #1311 — non-vinyl formats priced via the invited-press catalog
  // (e.g. MRP cassette) use parsedQty (rung-snapped) just like vinyl,
  // so the Total reflects the selected pressing quantity rather than the
  // legacy free-text input.
  const totalCents = (isVinyl || usingCatalog)
    ? (profitCents !== null && parsedQty > 0 ? profitCents * parsedQty : null)
    : (qtyMode === "fixed" && profitCents !== null && legacyParsedQty !== null
        ? profitCents * legacyParsedQty
        : null);

  const storedActive = existing?.active ?? false;
  const storedPrice = existing ? (existing.priceCents / 100).toFixed(2) : "";
  const storedStock = existing?.stock?.toString() ?? "";
  const storedQty = existing?.plannedQuantity ?? null;
  // Task #446 — back-compat snap rows compare against the snapped
  // value (Black / standard jacket) so simply opening a saved 7" row
  // with a hidden tier or jacket upgrade doesn't flip dirty=true and
  // silently re-save on render. The persist happens on the next save
  // the user triggers (e.g. price edit) — the inline note tells them so.
  const storedColor = sevenInchHiddenColor
    ? DEFAULT_VINYL_COLOR_ID
    : (existing?.vinylColor ?? DEFAULT_VINYL_COLOR_ID);
  const storedJacket: JacketUpgrade = sevenInchHiddenJacket
    ? DEFAULT_JACKET_UPGRADE
    : ((existing?.jacketUpgrade as JacketUpgrade | null | undefined) ?? DEFAULT_JACKET_UPGRADE);
  // Task #218 — catalog picks dirty when tier or color id differs from
  // initial. We compare by id, not by snapshot name, so reopening a
  // saved row doesn't appear dirty.
  const catalogDirty =
    usingCatalog &&
    (pressTierId !== (initialTier?.id ?? null) || pressColorId !== initialColorId);
  const storedDisplayName = existing?.displayName ?? "";
  // Task #429 / #430 — if the effective track count (live tracklist
  // or operator-entered Anticipated tracks) has drifted from the
  // row's snapshotted value, treat the row as dirty so Save lights
  // up and the next submit re-snapshots costSnapshotTrackCount
  // alongside the Publishing line that already re-priced live.
  // Treating a null snapshot as 0 means legacy rows saved before
  // Task #423 (when the snapshot column didn't exist) also dirty up
  // the first time the artist changes Anticipated tracks — without
  // this, Bill's "saved SKU, then change anticipated, Save doesn't
  // light up" repro stays silent for those rows.
  const trackCountDirty =
    !!existing &&
    (existing.costSnapshotTrackCount ?? 0) !== effectiveTrackCount;

  // Task #433 — per-row Lock. The row is effectively locked when:
  //   1) the row itself has `lockedAt` set (per-row Lock icon), OR
  //   2) the album-level Quote lock is engaged (cascade — keeps the
  //      two locks visually + behaviourally consistent), OR
  //   3) the album's pressing order has been approved (run at press).
  // Server rejects unlock with 409 in case (3); we also hide the
  // Unlock affordance entirely there so the artist isn't tempted.
  const { data: pressingOrder } = useQuery<PressingOrderRequest | null>({
    queryKey: ["/api/admin/albums", albumId, "pressing-order"],
    enabled: !!albumId,
  });
  const atPress = pressingOrder?.status === "approved";
  const rowLocked = !!existing?.lockedAt;
  const isLocked = rowLocked || !!albumQuoteLockedAt || atPress;
  const dirty =
    active !== storedActive ||
    priceStr !== storedPrice ||
    displayNameStr.trim() !== storedDisplayName.trim() ||
    (isVinyl
      ? parsedQty !== storedQty
      : (stockStr !== storedStock ||
         qtyMode !== initialQtyMode ||
         (qtyMode === "fixed" && legacyParsedQty !== storedQty))) ||
    // Task #1311 — non-vinyl catalog rows (e.g. MRP cassette) use the
    // rung-snapped parsedQty from the quantity dropdown, not legacyParsedQty.
    // Detect changes here so the Save button lights up when the operator
    // picks a different run size.
    (!isVinyl && usingCatalog && parsedQty !== storedQty) ||
    (isVinyl && !usingCatalog && (vinylColorId !== storedColor || jacketUpgrade !== storedJacket)) ||
    catalogDirty ||
    trackCountDirty;

  const submit = () => {
    const cents = parseDollars(priceStr);
    if (cents === null) return;
    if (isVinyl || usingCatalog) {
      // Task #1311 — non-vinyl catalog rows guard the same way as vinyl:
      // a rung must be picked (parsedQty > 0) before saving.
      if (parsedQty <= 0) return;
    } else if (qtyMode === "fixed" && legacyParsedQty === null) {
      return;
    }
    onSave({
      format,
      priceCents: cents,
      // Task #423 — snapshot the album's current track count so the
      // Publishing line stays anchored to today's tracklist until the
      // artist re-saves this row.
      // Task #446 — for 7" with no live masters, snapshot 2 (one per
      // side) so the Publishing line is anchored to the format's
      // mechanical track count, not the album-level anticipated value.
      trackCount: effectiveTrackCount,
      // Task #385 — Stock removed for vinyl only; non-vinyl keeps the
      // per-album inventory cap.
      stock: useRichCard
        ? null
        : (stockStr.trim() === "" ? null : Math.max(0, Math.floor(Number(stockStr)))),
      active,
      // Task #1311 — catalog-priced non-vinyl (e.g. MRP cassette) uses the
      // rung-snapped parsedQty just like vinyl so the saved quantity matches
      // what the cost breakdown used during quoting.
      plannedQuantity: (isVinyl || usingCatalog)
        ? parsedQty
        : (qtyMode === "fixed" ? legacyParsedQty : null),
      // Catalog mode wins: the server resolves picks via pressTierId /
      // pressColorId and snapshots the tier name + color name itself.
      // Legacy vinyl picks are skipped (jacket upgrade was dropped
      // from the catalog model). For 12"LP we always force the
      // standard jacket — see Task #385.
      vinylColor: usingCatalog ? null : isVinyl ? vinylColorId : null,
      jacketUpgrade: usingCatalog
        ? null
        : isVinyl
          ? (jacketDropdownAllowed ? jacketUpgrade : DEFAULT_JACKET_UPGRADE)
          : null,
      pressTierId: usingCatalog ? pressTierId : null,
      pressColorId: usingCatalog ? pressColorId : null,
      displayName: displayNameStr.trim() ? displayNameStr.trim() : null,
    });
  };

  const lossColor = profitCents !== null && profitCents < 0;
  // Render a faded "$0.00" placeholder (slate-300) for the empty state
  // instead of a dash — Apple-style "shape of the eventual value" cue,
  // and it lines up with the Total placeholder so the two right-rail
  // values can't visually drift apart (Bill #2).
  const profitPending = profitCents === null;
  const profitLabel = profitPending
    ? "$0.00"
    : profitCents < 0
      ? `-${dollars(Math.abs(profitCents))}`
      : dollars(profitCents);

  // Task #393 — debounced autosave for vinyl rows. The new card has
  // no visible Save button; field changes (price, qty, color, jacket,
  // active toggle) flush through `submit()` after a quiet beat. Draft
  // rows without a parseable price are no-ops via submit's early-return.
  // Non-vinyl rows keep the explicit SaveLink path and skip this effect.
  useEffect(() => {
    // Task #1423 — catalog cassette rides the same autosave path as vinyl
    // (the rich card has no visible Save button). Genuinely un-catalog
    // non-vinyl rows keep the explicit SaveLink path and skip this effect.
    if (!useRichCard) return;
    if (!dirty) return;
    // Task #433 — locked rows are read-only. Skip autosave so a stale
    // dirty flag from a pre-lock edit can't sneak through and mutate
    // the snapshot the artist just finalised.
    if (isLocked) return;
    // Task #1025 — a saved color that no longer resolves against the live
    // catalog is in an explicit "choose a color" state. Suppress autosave
    // so editing any other field (e.g. price) can't flush a submit with a
    // null color, which the server would silently fall back to the
    // placeholder cost — the exact overwrite this task removes. The
    // operator must re-pick a color first; the banner tells them so.
    if (colorUnresolved) return;
    const t = setTimeout(() => submit(), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dirty,
    useRichCard,
    isLocked,
    priceStr,
    parsedQty,
    vinylColorId,
    jacketUpgrade,
    active,
    pressTierId,
    pressColorId,
    colorUnresolved,
    displayNameStr,
    // Task #430 — re-arm the debounce when only the effective track
    // count changes (e.g. anticipated tracks edited on a row that's
    // otherwise clean, or already dirty from a price edit). Without
    // this dep, the pending setTimeout fires the previous render's
    // submit closure, which captured the stale trackCount and
    // re-snapshots the old value.
    trackCount,
  ]);

  const onToggleLock = () => {
    onSave({
      format,
      // Re-send the persisted snapshot — the server upsert needs the
      // full body, but the row's editable fields aren't necessarily
      // valid at lock-time (e.g. price still blank on a draft). We
      // skip the lock call entirely for unsaved drafts.
      priceCents: existing?.priceCents ?? 0,
      trackCount: existing?.costSnapshotTrackCount ?? trackCount ?? 0,
      stock: existing?.stock ?? null,
      active: existing?.active ?? true,
      plannedQuantity: existing?.plannedQuantity ?? null,
      vinylColor: existing?.vinylColor ?? null,
      jacketUpgrade: (existing?.jacketUpgrade as JacketUpgrade | null) ?? null,
      pressTierId: usingCatalog ? pressTierId : null,
      pressColorId: usingCatalog ? pressColorId : null,
      displayName: existing?.displayName ?? null,
      locked: !isLocked,
    });
  };

  // Task #393 — destructive confirm for the trash button in the new
  // vinyl card header. Mirrors the `window.confirm` pattern the
  // Tracks row uses for "Delete track" so admin destructive confirms
  // stay consistent (see TracksPanel in AdminAlbum.tsx).
  const onDeleteWithConfirm = () => {
    if (isDraft) {
      onDelete();
      return;
    }
    const ok = window.confirm(
      `Remove the ${ALBUM_FORMAT_LABEL[format]} format from this album? Fans on the Buy sheet will no longer see it.`,
    );
    if (ok) onDelete();
  };

  // Task #619 — commit the suggested format bump. Upserts a SKU at the
  // suggested format carrying over price / active / displayName / qty
  // (snapped to the new context) plus color/jacket where compatible,
  // then deletes the current row. The Sell-panel query invalidation
  // on each mutation refreshes both rows; "Accept & adjust price"
  // additionally focuses the new row's Price input after a short
  // beat so the disclosure has time to repaint.
  // Track in-flight bump so the dialog buttons can't be double-clicked
  // into duplicate commits.
  const [bumping, setBumping] = useState(false);
  const commitBump = async (adjustPrice: boolean) => {
    if (!suggestedFormat || bumping) return;
    // Collision guard — the bump CTA is already hidden when the
    // suggested format is configured, but if somehow we get here
    // refuse to silently overwrite the existing row.
    if (configuredFormats?.has(suggestedFormat)) {
      toast({
        title: `${ALBUM_FORMAT_LABEL[suggestedFormat]} already configured`,
        description: "Open that row to adjust it instead of bumping.",
        variant: "destructive",
      });
      setPreviewOpen(false);
      setConfirmOpen(false);
      return;
    }
    const cents = parseDollars(priceStr);
    // Same deterministic picker the preview/dialog ran on, so the
    // saved SKU has the exact margin the operator confirmed.
    const newPressTierId = suggestedPick?.tier.id ?? null;
    const newPressColorId = suggestedPick?.color?.id ?? null;
    const useCatalogForNew = !!suggestedPick;
    const body = {
      format: suggestedFormat,
      priceCents: cents ?? existing?.priceCents ?? 0,
      trackCount: effectiveTrackCount,
      stock: null,
      active,
      plannedQuantity: parsedQty > 0 ? parsedQty : null,
      vinylColor: useCatalogForNew ? null : vinylColorId,
      jacketUpgrade: useCatalogForNew ? null : DEFAULT_JACKET_UPGRADE,
      pressTierId: useCatalogForNew ? newPressTierId : null,
      pressColorId: useCatalogForNew ? newPressColorId : null,
      displayName: displayNameStr.trim() ? displayNameStr.trim() : null,
    };
    setBumping(true);
    try {
      // Atomic-ish: upsert the new format FIRST, await success, then
      // (and only then) delete the original. If the upsert fails the
      // original row stays intact and the operator sees a toast.
      await apiRequest(
        "PUT",
        `/api/admin/albums/${albumId}/skus/${suggestedFormat}`,
        body,
      );
      if (!isDraft) {
        try {
          await apiRequest(
            "DELETE",
            `/api/admin/albums/${albumId}/skus/${format}`,
          );
        } catch (delErr: any) {
          // New SKU landed but old one wouldn't delete — surface so
          // the operator can clean up manually instead of leaving
          // both rows quietly configured.
          toast({
            title: "New format saved, original couldn't be removed",
            description: delErr?.message ?? "Delete the old format row manually.",
            variant: "destructive",
          });
        }
      }
      await queryClient.invalidateQueries({
        queryKey: ["/api/admin/albums", albumId, "skus"],
      });
      setPreviewOpen(false);
      setConfirmOpen(false);
      toast({
        title: `Switched to ${ALBUM_FORMAT_LABEL[suggestedFormat]}`,
        description: `Bumped from ${ALBUM_FORMAT_LABEL[format]} to fit the album's runtime.`,
      });
      onAfterBump?.(suggestedFormat, { adjustPrice });
    } catch (err: any) {
      toast({
        title: "Couldn't save the bumped format",
        description: err?.message ?? "Try again.",
        variant: "destructive",
      });
    } finally {
      setBumping(false);
    }
  };

  // Collapsed summary text for the vinyl header. `12" LP · $25.00 · 1,000`
  // when fully configured; degrades gracefully when bits are missing.
  // Task #397 — the artist-edited displayName lives in the inline
  // input itself (placeholder falls back to the format label), so the
  // summary only carries the trailing $price · qty · off bits.
  const collapsedSummary = (() => {
    const bits: string[] = [];
    if (priceCents !== null) bits.push(dollars(priceCents));
    if (parsedQty > 0) bits.push(parsedQty.toLocaleString());
    if (!active) bits.push("off");
    return bits.join(" · ");
  })();

  const estimateRungs = useMemo<{ qty: number; mfgCents: number }[]>(() => {
    if (!isVinyl) return [];
    if (usingCatalog && pickedTier) {
      return [...pickedTier.priceLadder]
        .filter((r) => r.confirmed !== false)
        .sort((a, b) => a.qty - b.qty)
        .map((r) => ({ qty: r.qty, mfgCents: r.unitCents }));
    }
    if (breakdown && parsedQty > 0) {
      return [{ qty: parsedQty, mfgCents: breakdown.manufacturingCents }];
    }
    return [];
  }, [isVinyl, usingCatalog, pickedTier, breakdown, parsedQty]);

  // Task #636 — per-cert wholesale comes from the **tiered ladder**,
  // not the flat `payout_settings.cert_cost_cents`. Each ladder rung
  // implies a different signed-copy count (= qty × attachRatio), and
  // each cert count lands on a different ladder rung ($13/$12/$9/$7/$6).
  // We fetch the live preview at every distinct cert count we need to
  // price (one per pressing rung + the currently-resolved cert qty)
  // and consume `totalPerUnitCents` from each. The flat
  // `livePlatformCostCents` is only the fallback for rows where the
  // preview hasn't loaded yet or the platform default ladder isn't
  // configured.
  const attachRatio = useMemo<number>(() => {
    if (!signedAddon?.active) return 0;
    if (!signedAddon?.plannedQuantity || parsedQty <= 0) return 0;
    return signedAddon.plannedQuantity / parsedQty;
  }, [signedAddon, parsedQty]);

  const certQtysToPrice = useMemo<number[]>(() => {
    if (!signedAddon?.active || attachRatio <= 0) return [];
    const set = new Set<number>();
    for (const { qty } of estimateRungs) {
      const c = Math.max(0, Math.floor(qty * attachRatio));
      if (c > 0) set.add(c);
    }
    if (signedAddon?.plannedQuantity && signedAddon.plannedQuantity > 0) {
      set.add(signedAddon.plannedQuantity);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [estimateRungs, attachRatio, signedAddon]);

  const certPreviewQueries = useQueries({
    queries: certQtysToPrice.map((certQty) => ({
      queryKey: [
        "/api/admin/albums",
        albumId,
        "gooddeed-pricing-preview",
        certQty,
      ] as const,
      queryFn: async () => {
        const r = await apiRequest(
          "GET",
          `/api/admin/albums/${albumId}/gooddeed-pricing-preview?runQty=${certQty}`,
        );
        return r.json();
      },
      enabled: !!albumId && certQty > 0 && !!signedAddon?.active,
    })),
  });

  const certCostByQty = useMemo<Map<number, number>>(() => {
    const m = new Map<number, number>();
    certQtysToPrice.forEach((q, i) => {
      const total = certPreviewQueries[i]?.data?.totalPerUnitCents;
      if (typeof total === "number" && total > 0) m.set(q, total);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certQtysToPrice, certPreviewQueries.map((q) => q.data?.totalPerUnitCents).join(",")]);

  const certNetForCertCount = (certQty: number): number | null => {
    if (!signedAddon?.active) return null;
    const certPrice = signedAddon.priceCents ?? 0;
    if (certPrice <= 0 || certQty <= 0) return null;
    const cost = certCostByQty.get(certQty) ?? livePlatformCostCents ?? null;
    if (cost == null) return null;
    const cc = Math.round(certPrice * 0.029) + 30;
    return certPrice - cost - cc;
  };

  // Resolved-cert net for the *current* vinyl run — exposed to the
  // Deductions popover ("+ GoodDeed per cert") so it shows the ladder
  // rung that matches the saved plannedQuantity, not the flat default.
  const certNetPerUnitCents = useMemo<number | null>(() => {
    if (!signedAddon?.active) return null;
    if (!signedAddon?.plannedQuantity) return null;
    return certNetForCertCount(signedAddon.plannedQuantity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedAddon, certCostByQty, livePlatformCostCents]);

  // Task #635 — per-rung Artist Net across the picked tier's price
  // ladder. Picks `profitCents` (= price − manufacturing − publishing
  // − payment processing − goodtunes) per ladder rung and multiplies
  // by the rung's qty. Folds in a proportional slice of the GoodDeed
  // cert's net per-cert when the signed_cert addon is live, so each
  // rung reflects what the artist would actually take home at that
  // pressing volume. Feeds both the collapsed-header single figure
  // (the chosen quantity's rung, Task #1087) and the Estimates
  // table. Task #636 — uses the *rung-correct* cert
  // cost (from the ladder via the preview endpoint), not the flat
  // platform default, so the per-rung range steps through the
  // wholesale ladder as the pressing run scales up.
  const perRungArtistNet = useMemo<{ qty: number; netCents: number }[]>(() => {
    if (!breakdown || priceCents === null) return [];
    return estimateRungs.map(({ qty, mfgCents }) => {
      const sidecar = breakdown;
      const costPerUnit =
        mfgCents +
        sidecar.publishingCents +
        sidecar.paymentProcessingCents +
        sidecar.goodtunesCents;
      const profitPerUnit = priceCents - costPerUnit;
      let net = profitPerUnit * qty;
      if (signedAddon?.active && attachRatio > 0) {
        const certCount = Math.max(0, Math.floor(qty * attachRatio));
        const certNet = certNetForCertCount(certCount);
        if (certNet !== null && certCount > 0) {
          net += certNet * certCount;
        }
      }
      return { qty, netCents: net };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateRungs, breakdown, priceCents, signedAddon, attachRatio, certCostByQty, livePlatformCostCents]);

  // Task #1087 — the collapsed-header Artist Net (artistNetLabel) is
  // computed further down, after the Quote-rows helpers, by reading
  // the chosen quantity's net out of perRungArtistNet.

  // Task #642 — Estimates table columns. Generalises the header
  // pill's per-rung Artist Net math to a broader column set the
  // operator can compare across:
  //   (a) every plannedQuantity saved on this album (any format) —
  //       so picking 1,000 here lines up alongside the 500 already
  //       locked in on the Double LP, etc.
  //   (b) the picked tier's ladder rungs that bracket the chosen
  //       Select Qty (one below, one above) — preview the next
  //       wholesale step in either direction.
  //   (c) the currently-typed Select Qty itself, even if it doesn't
  //       land on a rung (snaps up to the next rung's unit cost).
  // Manufacturing per column comes from snapping the picked tier's
  // ladder; non-catalog rows fall back to the breakdown's mfg cents
  // (single-column case, in which the standalone Profit/Total
  // below still renders).
  //
  // Task #757 — single source of truth for "what does ONE unit of
  // manufacturing cost at run size N?". Vinyl manufacturing steps down
  // by quantity, so every surface that compares quantities (pricing
  // blocks, the estimate table, the quote PDF) must re-snap the
  // confirmed ladder for each quantity rather than reusing one frozen
  // number. Resolution order mirrors the `breakdown` useMemo:
  //   invited-press catalog tier ladder → MRP platform-default ladder.
  // Returns `null` when no confirmed rung exists for that quantity on
  // the resolved ladder, so callers can surface a "needs quote" state
  // instead of silently presenting another quantity's price. The final
  // fallback (non-vinyl, or vinyl with no catalog + no MRP) is
  // qty-independent by design, so it reads the live breakdown snapshot.
  const resolveMfgCentsForQty = useCallback(
    (qty: number): number | null => {
      if (usingCatalog && pickedTier) {
        return snapCatalogLadder(pickedTier.priceLadder, qty)?.unitCents ?? null;
      }
      if (isVinyl && mrpDefaultFormat && mrpDefaultFormat.tiers.length > 0) {
        const tierName = vinylColor.tier === "black" ? "Black" : "Color";
        const mrpTier =
          mrpDefaultFormat.tiers.find(
            (t) => t.name.toLowerCase() === tierName.toLowerCase(),
          ) ?? mrpDefaultFormat.tiers[0];
        return snapCatalogLadder(mrpTier.priceLadder, qty)?.unitCents ?? null;
      }
      return breakdown?.manufacturingCents ?? null;
    },
    [usingCatalog, pickedTier, isVinyl, mrpDefaultFormat, vinylColor, breakdown],
  );
  const estimateTableRows = useMemo<
    { qty: number; netCents: number | null }[]
  >(() => {
    // Task #1311 — allow estimate rows for non-vinyl formats when catalog
    // pricing is active (e.g. MRP cassette), mirroring the vinyl path.
    if ((!isVinyl && !usingCatalog) || !breakdown || priceCents === null) return [];
    const set = new Set<number>();
    for (const q of allPlannedQuantities ?? []) {
      if (q > 0) set.add(q);
    }
    if (usingCatalog && pickedTier && parsedQty > 0) {
      const sorted = [...pickedTier.priceLadder]
        .filter((r) => r.confirmed !== false)
        .sort((a, b) => a.qty - b.qty);
      const below = [...sorted].reverse().find((r) => r.qty < parsedQty);
      const above = sorted.find((r) => r.qty > parsedQty);
      if (below) set.add(below.qty);
      if (above) set.add(above.qty);
    }
    if (parsedQty > 0) set.add(parsedQty);
    const qtys = [...set].sort((a, b) => a - b);
    return qtys.map((qty) => {
      // Task #757 — re-snap the confirmed ladder for THIS quantity so
      // larger runs reflect their real volume discount instead of
      // reusing one frozen number. A null rung means "no confirmed
      // price at this quantity" — surface it as an unknown net rather
      // than silently pricing against another quantity's number.
      const mfgCents = resolveMfgCentsForQty(qty);
      if (mfgCents === null || mfgCents <= 0) {
        return { qty, netCents: null };
      }
      const costPerUnit =
        mfgCents +
        breakdown.publishingCents +
        breakdown.paymentProcessingCents +
        breakdown.goodtunesCents;
      const profitPerUnit = priceCents - costPerUnit;
      let net = profitPerUnit * qty;
      if (signedAddon?.active && attachRatio > 0) {
        const certCount = Math.max(0, Math.floor(qty * attachRatio));
        const certNet = certNetForCertCount(certCount);
        if (certNet !== null && certCount > 0) {
          net += certNet * certCount;
        }
      }
      return { qty, netCents: net };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isVinyl,
    breakdown,
    priceCents,
    usingCatalog,
    pickedTier,
    parsedQty,
    allPlannedQuantities,
    signedAddon,
    attachRatio,
    certCostByQty,
    livePlatformCostCents,
    resolveMfgCentsForQty,
  ]);

  const signedDollars = (c: number) =>
    c < 0 ? `-${dollars(Math.abs(c))}` : dollars(c);
  // Task #1087 — artistNetLabel is computed further down, after the
  // Quote-rows helpers, from the chosen quantity's perRungArtistNet.

  // Color label for the collapsed header meta line. Catalog rows
  // resolve via the picked tier's color list; legacy rows fall back
  // to the static VINYL_COLOR_BY_ID map.
  const headerColorLabel = useMemo<string | null>(() => {
    if (!isVinyl) return null;
    if (usingCatalog && pickedTier) {
      const c = pickedTier.colors.find((c) => c.id === pressColorId);
      return c?.name ?? null;
    }
    return VINYL_COLOR_BY_ID[vinylColorId]?.name ?? null;
  }, [isVinyl, usingCatalog, pickedTier, pressColorId, vinylColorId]);

  // Presses qualified to quote this format. Display-only (swap is
  // album-level and routed through the invited-press flow elsewhere);
  // the popover highlights the currently-quoting one and links the
  // others to their detail page so the operator can see what they'd
  // offer.
  const qualifiedPresses = useMemo<Manufacturer[]>(() => {
    const seen = new Set<string>();
    const out: Manufacturer[] = [];
    if (invitedPressItself) {
      seen.add(invitedPressItself.id);
      out.push(invitedPressItself);
    }
    if (allPresses && pressFormatsByPress && pressFormatsByPress.size > 0) {
      for (const p of allPresses) {
        if (seen.has(p.id)) continue;
        const formats = pressFormatsByPress.get(p.id);
        if (formats && formats.has(format)) {
          seen.add(p.id);
          out.push(p);
        }
      }
    }
    return out;
  }, [allPresses, invitedPressItself, pressFormatsByPress, format]);

  // Task #736 — in "All Presses" mode the comparison anchors on the
  // invited press when there is one, else the first qualified press, so
  // an unaffiliated album (no invited stamp) still gets a side-by-side
  // multi-bid comparison. In "dedicated" mode the comparison never
  // renders, so this is only consulted in all-mode.
  const comparisonAnchorPress = useMemo<Manufacturer | null>(
    () => invitedPressItself ?? qualifiedPresses[0] ?? null,
    [invitedPressItself, qualifiedPresses],
  );

  // ====================================================================
  // Task #646 — multi-quote scratchpad. Each card represents one
  // format × one press quote (the SKU we'd save); beneath it we let
  // the operator stack additional Quote rows scoped to this album +
  // format (same press at a different qty rung, or another qualified
  // press). Persisted in localStorage so the comparison survives
  // reloads but never affects the SKU. Per the
  // vendor-pricing-bypasses-post-sale-lock memory, these rows stay
  // editable even when the partner edit_metadata lock disables the
  // left-column controls.
  // ====================================================================
  type QuoteRow = {
    id: string;
    pressId: string;
    tierName: string;
    colorName: string | null;
    qty: number;
    matched?: boolean;
  };
  const quoteScratchpadKey = albumId
    ? `gt:sellpanel:quotes:${albumId}:${format}`
    : null;
  const [quoteRows, setQuoteRows] = useState<QuoteRow[]>(() => {
    if (typeof window === "undefined" || !quoteScratchpadKey) return [];
    try {
      const raw = window.localStorage.getItem(quoteScratchpadKey);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter((r: unknown): r is QuoteRow => {
        const o = r as Record<string, unknown> | null;
        return (
          !!o &&
          typeof o.id === "string" &&
          typeof o.pressId === "string" &&
          typeof o.tierName === "string" &&
          typeof o.qty === "number" &&
          (o.colorName === null || typeof o.colorName === "string")
        );
      });
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (typeof window === "undefined" || !quoteScratchpadKey) return;
    try {
      window.localStorage.setItem(
        quoteScratchpadKey,
        JSON.stringify(quoteRows),
      );
    } catch {
      /* localStorage quota — operator scratchpad, safe to drop. */
    }
  }, [quoteRows, quoteScratchpadKey]);
  const [matchNotes, setMatchNotes] = useState<
    { pressName: string; reason: string }[]
  >([]);
  // Task #646 — rehydrate when the (album, format) scratchpad key
  // changes (e.g. album reload reuses this row instance for a
  // different format). Without this, quote rows would leak across
  // contexts.
  useEffect(() => {
    if (typeof window === "undefined" || !quoteScratchpadKey) {
      setQuoteRows([]);
      setMatchNotes([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(quoteScratchpadKey);
      if (!raw) {
        setQuoteRows([]);
      } else {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          setQuoteRows(
            arr.filter((r: unknown): r is QuoteRow => {
              const o = r as Record<string, unknown> | null;
              return (
                !!o &&
                typeof o.id === "string" &&
                typeof o.pressId === "string" &&
                typeof o.tierName === "string" &&
                typeof o.qty === "number" &&
                (o.colorName === null || typeof o.colorName === "string")
              );
            }),
          );
        } else {
          setQuoteRows([]);
        }
      }
    } catch {
      setQuoteRows([]);
    }
    setMatchNotes([]);
  }, [quoteScratchpadKey]);

  // Task #705 — artist-facing "Pricing" duplicate-to-grid. Each extra
  // block clones the primary block's price + qty into an independent
  // pricing scenario (its own price, qty, profit, total). Persisted to
  // the same localStorage-scratchpad pattern as quoteRows so a refresh
  // keeps the comparison the artist was building.
  type PricingBlock = { id: string; priceStr: string; qty: number };
  const pricingBlocksKey = albumId
    ? `gt:sellpanel:pricingblocks:${albumId}:${format}`
    : null;
  const parsePricingBlocks = (raw: string | null): PricingBlock[] => {
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter((b: unknown): b is PricingBlock => {
        const o = b as Record<string, unknown> | null;
        return (
          !!o &&
          typeof o.id === "string" &&
          typeof o.priceStr === "string" &&
          typeof o.qty === "number"
        );
      });
    } catch {
      return [];
    }
  };
  const [pricingBlocks, setPricingBlocks] = useState<PricingBlock[]>(() => {
    if (typeof window === "undefined" || !pricingBlocksKey) return [];
    return parsePricingBlocks(window.localStorage.getItem(pricingBlocksKey));
  });
  useEffect(() => {
    if (typeof window === "undefined" || !pricingBlocksKey) return;
    try {
      window.localStorage.setItem(
        pricingBlocksKey,
        JSON.stringify(pricingBlocks),
      );
    } catch {
      /* localStorage quota — pricing scratchpad, safe to drop. */
    }
  }, [pricingBlocks, pricingBlocksKey]);
  useEffect(() => {
    if (typeof window === "undefined" || !pricingBlocksKey) {
      setPricingBlocks([]);
      return;
    }
    setPricingBlocks(
      parsePricingBlocks(window.localStorage.getItem(pricingBlocksKey)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingBlocksKey]);
  // Task #758 — the live GoodDeed signal, lifted up from GoodDeedPill so
  // each pricing option column can render a read-only revenue card. Null
  // until the pill mounts (primary vinyl row only); `active` gates whether
  // the cards render at all.
  const [goodDeedSignal, setGoodDeedSignal] = useState<{
    active: boolean;
    ratio: number;
    pct: number;
    priceCents: number | null;
  } | null>(null);
  const addPricingBlock = () => {
    const newId = `pb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const sourceOpen = openProfitKeys.has("primary");
    setPricingBlocks((prev) => [
      ...prev,
      {
        id: newId,
        priceStr,
        qty: parsedQty,
      },
    ]);
    if (sourceOpen) {
      setOpenProfitKeys((prev) => {
        const next = new Set(prev);
        next.add(newId);
        return next;
      });
    }
  };
  const updatePricingBlock = (
    id: string,
    patch: Partial<Omit<PricingBlock, "id">>,
  ) => {
    setPricingBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    );
  };
  const removePricingBlock = (id: string) => {
    setPricingBlocks((prev) => prev.filter((b) => b.id !== id));
    setOpenProfitKeys((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // Distinct press ids referenced by quote rows that aren't the
  // invited press (whose catalog we already have via catalogFormat).
  const quoteForeignPressIds = useMemo<string[]>(() => {
    const s = new Set<string>();
    for (const r of quoteRows) {
      if (!invitedPressItself || r.pressId !== invitedPressItself.id)
        s.add(r.pressId);
    }
    // Task #736 — with no invited stamp the comparison anchors on the
    // first qualified press; load its catalog so the pinned primary row
    // can resolve a real per-unit cost instead of the MRP-default cost.
    if (!invitedPressItself && comparisonAnchorPress)
      s.add(comparisonAnchorPress.id);
    return [...s];
  }, [quoteRows, invitedPressItself, comparisonAnchorPress]);
  const quoteCatalogQueries = useQueries({
    queries: quoteForeignPressIds.map((pid) => ({
      queryKey: ["/api/admin/manufacturers", pid, "catalog"] as const,
      queryFn: async () => {
        const r = await apiRequest(
          "GET",
          `/api/admin/manufacturers/${pid}/catalog`,
        );
        return r.json() as Promise<Catalog>;
      },
      enabled: !!pid,
    })),
  });
  const catalogByPressId = useMemo<Map<string, Catalog>>(() => {
    const m = new Map<string, Catalog>();
    quoteForeignPressIds.forEach((pid, i) => {
      const data = quoteCatalogQueries[i]?.data as Catalog | undefined;
      if (data && Array.isArray(data.formats)) m.set(pid, data);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    quoteForeignPressIds,
    quoteCatalogQueries.map((q) => q.dataUpdatedAt).join(","),
  ]);
  const pressById = useMemo<Map<string, Manufacturer>>(() => {
    const m = new Map<string, Manufacturer>();
    if (invitedPressItself) m.set(invitedPressItself.id, invitedPressItself);
    for (const p of allPresses ?? []) m.set(p.id, p);
    return m;
  }, [allPresses, invitedPressItself]);

  type ResolvedQuote = {
    press: Manufacturer | null;
    tier: CatalogTier | null;
    color: CatalogColor | null;
    mfgCents: number;
    snappedQty: number;
    needsCatalog: boolean;
  };
  const resolveQuoteRow = (row: QuoteRow): ResolvedQuote => {
    const press = pressById.get(row.pressId) ?? null;
    let catalog: Catalog | undefined;
    if (
      invitedPressItself &&
      row.pressId === invitedPressItself.id &&
      catalogFormat
    ) {
      catalog = { formats: [catalogFormat] };
    } else {
      catalog = catalogByPressId.get(row.pressId);
    }
    if (!catalog) {
      return {
        press,
        tier: null,
        color: null,
        mfgCents: 0,
        snappedQty: row.qty,
        needsCatalog: true,
      };
    }
    const fr = catalog.formats.find((f) => f.format === format) ?? null;
    const tier =
      fr?.tiers.find((t) => t.name === row.tierName) ?? fr?.tiers[0] ?? null;
    const color = tier?.colors.find((c) => c.name === row.colorName) ?? null;
    const snap = tier ? snapCatalogLadder(tier.priceLadder, row.qty) : null;
    return {
      press,
      tier,
      color,
      mfgCents: snap?.unitCents ?? 0,
      snappedQty: snap?.qty ?? row.qty,
      needsCatalog: false,
    };
  };
  // Task #1087 — the collapsed-header Artist Net shows the single
  // figure for the row's chosen quantity (the "… · N pcs" shown in
  // the same header), not the old min-to-max span across the whole
  // ladder + every comparison quote. We read the picked
  // configuration's net for parsedQty straight out of
  // perRungArtistNet, so the per-unit cost stack + signed-cert
  // fold-in stay byte-identical to the per-rung / Estimates math, and
  // the figure matches the parsedQty column the Estimates table
  // highlights. perRungArtistNet only carries *confirmed* rungs, so a
  // chosen quantity with no confirmed price rung has no match and
  // falls through to the "—" not-priceable treatment. The full
  // per-rung / comparison spread still lives in the expanded
  // Estimates table (estimateTableRows) — unchanged.
  const chosenQtyArtistNetCents = useMemo<number | null>(() => {
    if (parsedQty <= 0) return null;
    const match = perRungArtistNet.find((r) => r.qty === parsedQty);
    return match ? match.netCents : null;
  }, [perRungArtistNet, parsedQty]);
  const artistNetLabel =
    chosenQtyArtistNetCents !== null
      ? signedDollars(chosenQtyArtistNetCents)
      : "—";

  // Color distance for "Match across presses". Skips entries with no
  // swatchHex (catalogs only carry hex today; image-only swatches
  // can't be compared without sampling).
  const colorDistance = (a: string, b: string): number => {
    const pa = parseInt(a.replace(/^#/, ""), 16);
    const pb = parseInt(b.replace(/^#/, ""), 16);
    if (!Number.isFinite(pa) || !Number.isFinite(pb)) return Infinity;
    const dr = ((pa >> 16) & 0xff) - ((pb >> 16) & 0xff);
    const dg = ((pa >> 8) & 0xff) - ((pb >> 8) & 0xff);
    const db = (pa & 0xff) - (pb & 0xff);
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };
  // Nearest qty rung; ties round UP per task spec.
  const nearestRung = (
    ladder: { qty: number; confirmed?: boolean }[],
    target: number,
  ): number => {
    const valid = ladder
      .filter((r) => r.confirmed !== false)
      .map((r) => r.qty)
      .sort((a, b) => a - b);
    if (valid.length === 0) return target;
    let best = valid[0];
    let bestDist = Math.abs(best - target);
    for (const q of valid) {
      const d = Math.abs(q - target);
      if (d < bestDist || (d === bestDist && q > best)) {
        best = q;
        bestDist = d;
      }
    }
    return best;
  };

  const addQuoteSamePress = () => {
    // Task #736 — anchor on the invited press when present, else the
    // first qualified press, so the "add another qty" shortcut works on
    // unaffiliated albums in all-mode too.
    if (!pickedTier || !comparisonAnchorPress) return;
    const sorted = [...pickedTier.priceLadder]
      .filter((r) => r.confirmed !== false)
      .sort((a, b) => a.qty - b.qty);
    const above = sorted.find((r) => r.qty > parsedQty);
    const next = above ?? sorted[sorted.length - 1];
    const colorName =
      pickedTier.colors.find((c) => c.id === pressColorId)?.name ?? null;
    setQuoteRows((prev) => [
      ...prev,
      {
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        pressId: comparisonAnchorPress.id,
        tierName: pickedTier.name,
        colorName,
        qty: next?.qty ?? parsedQty,
      },
    ]);
  };
  // Task #646 — Add Estimate › Another press uses a two-step
  // popover: this helper preloads the chosen press's catalog so the
  // qty list can render. addQuoteOnPressWithQty then materialises
  // the row using the operator-picked qty.
  // Load a foreign press's catalog into the query cache
  // so resolveQuoteRow / the qty popover can see it. Returns the
  // catalog or null on failure.
  const ensureForeignCatalog = async (
    pressId: string,
  ): Promise<Catalog | null> => {
    const cached = catalogByPressId.get(pressId);
    if (cached) return cached;
    const fromCache = queryClient.getQueryData<Catalog>([
      "/api/admin/manufacturers",
      pressId,
      "catalog",
    ]);
    if (fromCache) return fromCache;
    try {
      const r = await apiRequest(
        "GET",
        `/api/admin/manufacturers/${pressId}/catalog`,
      );
      const data = (await r.json()) as Catalog;
      queryClient.setQueryData(
        ["/api/admin/manufacturers", pressId, "catalog"],
        data,
      );
      return data;
    } catch {
      return null;
    }
  };
  // Add-Estimate flow for a different press: caller picks the qty
  // from that press's ladder before the row materialises (required
  // by Task #646 — no silent nearest-rung guesses on add).
  const addQuoteOnPressWithQty = (
    pressId: string,
    catalog: Catalog,
    qty: number,
  ) => {
    const fr = catalog.formats.find((f) => f.format === format);
    if (!fr || fr.tiers.length === 0) return;
    const tier =
      fr.tiers.find((t) => t.name === pickedTier?.name) ?? fr.tiers[0];
    const color = tier.colors[0] ?? null;
    const snappedQty = nearestRung(tier.priceLadder, qty);
    setQuoteRows((prev) => [
      ...prev,
      {
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        pressId,
        tierName: tier.name,
        colorName: color?.name ?? null,
        qty: snappedQty,
      },
    ]);
  };
  const duplicateQuoteRow = (id: string) => {
    setQuoteRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx < 0) return prev;
      const orig = prev[idx];
      const copy: QuoteRow = {
        ...orig,
        id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        matched: false,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };
  const deleteQuoteRow = (id: string) => {
    setQuoteRows((prev) => prev.filter((r) => r.id !== id));
  };
  const updateQuoteRowQty = (id: string, qty: number) => {
    setQuoteRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, qty, matched: false } : r)),
    );
  };
  // Task #646 — editing any field other than qty (press, color) also
  // clears the Matched marker so an operator-modified row stops
  // pretending it came from the auto-matcher.
  const updateQuoteRowColor = (id: string, colorName: string | null) => {
    setQuoteRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, colorName, matched: false } : r)),
    );
  };
  const updateQuoteRowPress = async (id: string, pressId: string) => {
    const catalog =
      invitedPressItself && pressId === invitedPressItself.id
        ? catalogFormat
          ? ({ formats: [catalogFormat] } as Catalog)
          : null
        : await ensureForeignCatalog(pressId);
    setQuoteRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (!catalog) return { ...r, pressId, matched: false };
        const fr = catalog.formats.find((f) => f.format === format);
        if (!fr || fr.tiers.length === 0) {
          return { ...r, pressId, matched: false };
        }
        const tier =
          fr.tiers.find((t) => t.name === r.tierName) ?? fr.tiers[0];
        const color =
          tier.colors.find((c) => c.name === r.colorName) ??
          tier.colors[0] ??
          null;
        const snappedQty = nearestRung(tier.priceLadder, r.qty);
        return {
          ...r,
          pressId,
          tierName: tier.name,
          colorName: color?.name ?? null,
          qty: snappedQty,
          matched: false,
        };
      }),
    );
  };

  // Idempotent — appends one row per qualified press that doesn't
  // already have a quote on this card. Closest color = same tier
  // name + nearest hex; nearest qty rung with ties rounding up.
  const matchAcrossPresses = async () => {
    if (!pickedTier || !comparisonAnchorPress) return;
    const srcColor =
      pickedTier.colors.find((c) => c.id === pressColorId) ?? null;
    const existing = new Set<string>([
      comparisonAnchorPress.id,
      ...quoteRows.map((r) => r.pressId),
    ]);
    const targets = qualifiedPresses.filter((p) => !existing.has(p.id));
    if (targets.length === 0) return;

    // Fetch any missing catalogs (sequential is fine — N ≤ a few presses).
    for (const p of targets) {
      if (!catalogByPressId.has(p.id)) {
        try {
          const r = await apiRequest(
            "GET",
            `/api/admin/manufacturers/${p.id}/catalog`,
          );
          const data = (await r.json()) as Catalog;
          queryClient.setQueryData(
            ["/api/admin/manufacturers", p.id, "catalog"],
            data,
          );
        } catch {
          /* leave unloaded — surfaces as a couldn't-match note below */
        }
      }
    }

    const notes: { pressName: string; reason: string }[] = [];
    const additions: QuoteRow[] = [];
    for (const press of targets) {
      const catalog = queryClient.getQueryData<Catalog>([
        "/api/admin/manufacturers",
        press.id,
        "catalog",
      ]);
      if (!catalog) {
        notes.push({ pressName: press.name, reason: "couldn't load catalog" });
        continue;
      }
      const fr = catalog.formats.find((f) => f.format === format);
      if (!fr) {
        notes.push({
          pressName: press.name,
          reason: `doesn't press ${ALBUM_FORMAT_LABEL[format]}`,
        });
        continue;
      }
      const matchedTier = fr.tiers.find((t) => t.name === pickedTier.name);
      if (!matchedTier) {
        notes.push({
          pressName: press.name,
          reason: `no "${pickedTier.name}" tier — quote manually if you want one`,
        });
        continue;
      }
      // Task #646 — if the source quote has a color, the matched
      // row must also have one. Skip presses where the same tier
      // has no colors OR no swatchHex-matchable color, with a note
      // so the operator knows why the row didn't appear.
      let pickColor: CatalogColor | null = null;
      if (srcColor) {
        if (matchedTier.colors.length === 0) {
          notes.push({
            pressName: press.name,
            reason: `no colors on "${matchedTier.name}" tier`,
          });
          continue;
        }
        if (srcColor.swatchHex) {
          let best = Infinity;
          for (const c of matchedTier.colors) {
            if (!c.swatchHex) continue;
            const d = colorDistance(srcColor.swatchHex, c.swatchHex);
            if (d < best) {
              best = d;
              pickColor = c;
            }
          }
          if (!pickColor) {
            notes.push({
              pressName: press.name,
              reason: `no swatch-matchable color for "${srcColor.name}"`,
            });
            continue;
          }
        } else {
          // Source color has no swatchHex — fall back to first
          // catalog color so we still produce a row, but only when
          // the target tier actually has one (handled above).
          pickColor = matchedTier.colors[0] ?? null;
        }
      }
      const rung = nearestRung(matchedTier.priceLadder, parsedQty);
      additions.push({
        id: `q_${Date.now()}_${press.id}_${Math.random().toString(36).slice(2, 5)}`,
        pressId: press.id,
        tierName: matchedTier.name,
        colorName: pickColor?.name ?? null,
        qty: rung,
        matched: true,
      });
    }
    if (additions.length > 0) setQuoteRows((prev) => [...prev, ...additions]);
    setMatchNotes(notes);
  };

  const [pressSwitcherOpen, setPressSwitcherOpen] = useState(false);
  // Task #673 — switch the quoting press straight from the "Qualified
  // presses" popover. The switch flips people.invited_by_press_id /
  // labels.invited_by_press_id on whichever scope owns this album's
  // invited-press stamp (returned by the invited-press query). The
  // backend PATCH is super-admin only, so the rows are only actionable
  // for super_admin — everyone else keeps the read-only footer below.
  const switchScopeKind = invitedPressRow?.scopeKind ?? null;
  const switchScopeId = invitedPressRow?.scopeId ?? null;
  const canSwitchPress =
    roleInfo?.role === "super_admin" && !!switchScopeKind && !!switchScopeId;
  const switchQuotingPress = useMutation({
    mutationFn: async (pressId: string) => {
      if (!switchScopeKind || !switchScopeId) {
        throw new Error("Couldn't determine which artist or label to update.");
      }
      const kind = switchScopeKind === "artist" ? "people" : "labels";
      await apiRequest(
        "PATCH",
        `/api/admin/${kind}/${switchScopeId}/invited-press`,
        { pressId },
      );
    },
    onSuccess: () => {
      // Re-resolve the panel: invited-press drives the format costs,
      // catalog, "Quoting" marker, and the trigger icon; the SKUs
      // query re-reads the new manufacturing math; the partner detail
      // + album list keep their invited-press stamp in sync.
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/albums", albumId, "invited-press"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/albums", albumId, "skus"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums"] });
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      queryClient.invalidateQueries({ queryKey: ["/api/labels"] });
      setPressSwitcherOpen(false);
      toast({ title: "Quoting press switched" });
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't switch press",
        description: e?.message,
        variant: "destructive",
      }),
  });
  // Task #646 — two-step "Add Estimate › Another press" popover:
  // pick the press, then pick the qty from that press's ladder
  // before the row materialises. Null means we're back on the press
  // list; a string means we're showing that press's qty options.
  const [addEstimateOpen, setAddEstimateOpen] = useState(false);
  const [pendingPressId, setPendingPressId] = useState<string | null>(null);
  const [pendingPressCatalog, setPendingPressCatalog] = useState<Catalog | null>(
    null,
  );
  const [pendingPressLoading, setPendingPressLoading] = useState(false);
  const beginAddOnPress = async (pressId: string) => {
    setPendingPressId(pressId);
    setPendingPressCatalog(null);
    setPendingPressLoading(true);
    const c = await ensureForeignCatalog(pressId);
    setPendingPressCatalog(c);
    setPendingPressLoading(false);
  };
  const resetAddEstimatePopover = () => {
    setPendingPressId(null);
    setPendingPressCatalog(null);
    setPendingPressLoading(false);
  };

  return (
    <div
      className={[
        "rounded-md border bg-white p-4",
        isDraft ? "border-slate-200 bg-slate-50" : "border-slate-200",
      ].join(" ")}
      data-testid={isDraft ? `row-sku-draft-${format}` : `row-sku-${format}`}
    >
      {useRichCard ? (
        <>
        {/* Task #642 — unified header (collapsed + expanded share the
           same row): cover thumb · title/artist/spec stack on the left,
           press-switcher · Artist Net · deductions (i) + button
           cluster (lock | trash | divider | eye | chevron) on the
           right. Replaces the prior collapse-only summary block so
           the operator's eye lands in the same place whether the row
           is open or closed. Body below picks up at REQUIRED · Vinyl. */}
        <div className={["flex items-start gap-3", expanded ? "mb-3" : "mb-2"].join(" ")}>
          {/* Task #635/#642/#702 — cover-art thumbnail anchors the
              header in both states. Clicking it toggles expansion so
              the thumb is itself the row's primary affordance. Task
              #702 enlarged it (w-9 → w-24, ~96px) so the artwork reads
              at a glance per Bill's "Preferred" mockup; the title /
              artist / spec stack sits top-aligned beside it. */}
          <button
            type="button"
            onClick={(e) => anchorScrollToElement(e.currentTarget, () => onSetExpanded(!expanded))}
            aria-label={expanded ? "Collapse format" : "Expand format"}
            className="flex-shrink-0 w-24 h-24 rounded-md overflow-hidden bg-slate-100 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]/40"
            data-testid={`button-row-thumb-${format}`}
          >
            {artworkUrl ? (
              <img src={artworkUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="block w-full h-full" aria-hidden />
            )}
          </button>
          <div className="flex-1 min-w-0 space-y-1">
          {/* Task #397 — Tracks-row inline-editable title. Click the
              input to edit; click anywhere else on the header (or the
              chevron) to expand. Task #413 — empty placeholder reads
              "Untitled <format label>" so it's obvious the title is
              empty without losing which size was picked. */}
          {(() => {
            const effectivePlaceholder = albumTitle?.trim()
              ? albumTitle.trim()
              : `Untitled ${ALBUM_FORMAT_LABEL[format]}`;
            const effectiveAriaLabel = albumTitle?.trim()
              ? "Row title — defaults to album title"
              : `Row title — defaults to ${ALBUM_FORMAT_LABEL[format]}`;
            return (
          <>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={displayNameStr}
              onChange={(e) => setDisplayNameStr(e.target.value.slice(0, 80))}
              placeholder={effectivePlaceholder}
              maxLength={80}
              readOnly={isLocked}
              aria-label={effectiveAriaLabel}
              className={[
                "min-w-0 flex-1 bg-transparent border-0 outline-none text-sm font-semibold placeholder:font-semibold transition-all",
                isLocked
                  ? "text-slate-500 placeholder:text-slate-400 cursor-default"
                  : "text-slate-900 placeholder:text-slate-400 focus:bg-slate-50 focus:px-1 focus:-mx-1 focus:rounded-sm",
              ].join(" ")}
              data-testid={`input-sku-display-name-${format}`}
            />
          {/* Task #433 — pulled tight to the top-right edge (-mr-1) and
              sized to the Tracks-row 7×7 chrome so the cluster reads
              as one affordance. Order matches Tracks-row destructive
              ordering: [Lock] [Trash | divider | Eye] [Chevron]. The
              hairline divider sits between the destructive Trash and
              the benign Eye so a thumb can't slide between them. Lock
              is the leftmost (furthest from the chevron) and is only
              offered on saved rows (drafts can't lock yet). */}
          <div className="flex items-center flex-shrink-0 -mr-1">
            {/* Task #433 — Lock affordance. Hidden once the run is at
                the press (the unlock direction is the only thing left
                to offer, and the server blocks it with 409); drafts
                can't lock either since there's no row to persist to.
                When the album-level Quote lock is what's holding the
                row, the icon is non-interactive and points at the
                bigger CTA via its tooltip. */}
            {!isDraft && !atPress && (
              <button
                type="button"
                onClick={onToggleLock}
                disabled={!rowLocked && !!albumQuoteLockedAt}
                className={[
                  "w-7 h-7 rounded-md inline-flex items-center justify-center transition-colors",
                  isLocked
                    ? "text-[color:var(--brand-blue)] hover:bg-slate-100"
                    : "text-slate-400 hover:text-slate-700 hover:bg-slate-100",
                  !rowLocked && !!albumQuoteLockedAt ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
                aria-label={
                  isLocked
                    ? "Unlock pressing quote for this format"
                    : "Lock pressing quote for this format"
                }
                aria-pressed={isLocked}
                title={
                  /* Task #611 — name what this padlock actually does so
                     it stops being mistaken for "lock the design" or a
                     partner-permissions edit-metadata gate. It only
                     freezes the per-format pressing quote (price /
                     quantity / color) on this SKU row. */
                  !rowLocked && !!albumQuoteLockedAt
                    ? "Pressing quote is locked at the album level — unlock it to edit this row."
                    : isLocked
                      ? "Pressing quote locked for this format. Click to unlock (reversible until the run goes to press)."
                      : "Lock pressing quote for this format (price, quantity, color)."
                }
                data-testid={`button-lock-sku-${format}`}
              >
                {isLocked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
              </button>
            )}
            <button
              type="button"
              onClick={onDeleteWithConfirm}
              disabled={isLocked}
              className={[
                "w-7 h-7 rounded-md inline-flex items-center justify-center transition-colors",
                isLocked
                  ? "text-slate-300 cursor-not-allowed"
                  : "text-slate-400 hover:text-rose-600 hover:bg-rose-50",
              ].join(" ")}
              aria-label={isDraft ? "Discard draft" : "Remove format"}
              title={isLocked ? "Unlock the row to remove this format." : undefined}
              data-testid={`button-delete-sku-${format}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="sr-only">{isDraft ? "Discard draft" : "Remove format"}</span>
            </button>
            <span className="mx-2 h-4 w-px bg-slate-200" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setActive((a) => !a)}
              disabled={isLocked}
              className={[
                "w-7 h-7 rounded-md inline-flex items-center justify-center transition-colors",
                isLocked
                  ? "text-slate-300 cursor-not-allowed"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100",
              ].join(" ")}
              aria-label={active ? "Hide from Buy sheet" : "Show on Buy sheet"}
              aria-pressed={!active}
              title={
                isLocked
                  ? "Unlock the row to change visibility."
                  : active ? "Hide from Buy sheet" : "Show on Buy sheet"
              }
              data-testid={`button-hide-sku-${format}`}
            >
              {active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={(e) => anchorScrollToElement(e.currentTarget, () => onSetExpanded(!expanded))}
              className="w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center transition-colors"
              aria-label={expanded ? "Collapse format" : "Expand format"}
              aria-expanded={expanded}
              data-testid={`button-toggle-sku-${format}`}
            >
              <ChevronDown className={["w-3.5 h-3.5 transition-transform", expanded ? "rotate-180" : ""].join(" ")} />
            </button>
          </div>
          </div>
          {/* Task #642 — artist line under the title; muted, single
              line. Hidden when the album has no artist (rare; new
              standalone releases). */}
          {artistName && (
            <div className="text-xs text-slate-500 truncate" data-testid={`text-row-artist-${format}`}>
              {artistName}
            </div>
          )}
          {/* Task #642 — spec line + press-switcher + Artist Net + (i)
              now render in BOTH collapsed and expanded states (was
              collapse-only). The press swap is display-only
              (album-level invited-press flow lives in the Vendors
              tab); we surface qualified presses so the operator can
              see who else would quote this format. */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 text-xs text-slate-500 truncate" data-testid={`text-row-spec-${format}`}>
              {[
                ALBUM_FORMAT_LABEL[format],
                headerColorLabel,
                trackCount > 0 ? `${trackCount} ${trackCount === 1 ? "track" : "tracks"}` : null,
                parsedQty > 0 ? `${parsedQty.toLocaleString()} pcs` : null,
                !active ? "off" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {invitedPressItself && (
                <Popover open={pressSwitcherOpen} onOpenChange={setPressSwitcherOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-slate-100 transition-colors"
                      aria-label={`Quoting press: ${invitedPressItself.name}. Click to see other qualified presses.`}
                      data-testid={`button-press-switcher-${format}`}
                    >
                      {invitedPressItself.logoUrl ? (
                        // Task #673 — presses sit in a rounded-rect tile;
                        // circles are reserved for people/bands, so a
                        // round logo (e.g. Hellbender) no longer reads
                        // as an avatar.
                        <span className="w-5 h-5 rounded-[4px] overflow-hidden bg-white border border-slate-200 flex-shrink-0">
                          <img
                            src={invitedPressItself.logoUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-slate-600">
                          {invitedPressItself.name}
                        </span>
                      )}
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 p-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500 px-1 pb-1">
                      Qualified presses
                    </div>
                    <ul className="space-y-1">
                      {qualifiedPresses.map((p) => {
                        const isCurrent = p.id === invitedPressItself.id;
                        // Task #673 — every press logo in a rounded-rect
                        // tile (people/bands keep circles). object-cover
                        // crops a round logo to the square so Hellbender
                        // stops reading as an avatar.
                        const logo = p.logoUrl ? (
                          <span className="w-5 h-5 rounded-[4px] overflow-hidden bg-white border border-slate-200 flex-shrink-0">
                            <img
                              src={p.logoUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </span>
                        ) : (
                          <span className="w-5 h-5 rounded-[4px] bg-slate-200 border border-slate-200 flex-shrink-0" />
                        );
                        const pending =
                          switchQuotingPress.isPending &&
                          switchQuotingPress.variables === p.id;
                        // Read-only for non-super-admins (backend gates
                        // the switch) and for the press already quoting —
                        // no dead click.
                        if (!canSwitchPress || isCurrent) {
                          return (
                            <li
                              key={p.id}
                              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                              data-testid={`row-qualified-press-${format}-${p.id}`}
                            >
                              {logo}
                              <span className="flex-1 truncate text-slate-700">{p.name}</span>
                              {isCurrent && (
                                <span className="text-xs font-medium text-[color:var(--brand-blue)]">
                                  Quoting
                                </span>
                              )}
                            </li>
                          );
                        }
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => switchQuotingPress.mutate(p.id)}
                              disabled={switchQuotingPress.isPending}
                              className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              data-testid={`button-switch-press-${format}-${p.id}`}
                            >
                              {logo}
                              <span className="flex-1 truncate text-slate-700">{p.name}</span>
                              <span className="text-xs font-medium text-slate-400">
                                {pending ? "Switching…" : "Switch"}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="text-xs text-slate-500 px-2 pt-2 border-t border-slate-100 mt-1">
                      {canSwitchPress
                        ? "Click a press to switch who's quoting this album."
                        : "Switch the quoting press from the Vendors tab."}
                    </p>
                  </PopoverContent>
                </Popover>
              )}
              <div className="text-xs text-slate-700 tabular-nums">
                <div>
                  <span className="text-slate-500 mr-1">Artist Net</span>
                  <span className="font-semibold">{artistNetLabel}</span>
                </div>
              </div>
              {/* Task #859 — the deductions popover is the per-copy vendor
                  cost stack (manufacturing/publishing/processing/GoodTunes
                  margin). An `artist` partner sees their Net but never the
                  cost breakdown behind it. */}
              {!isArtist && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Deductions"
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-[color:var(--brand-blue)] transition-colors"
                    data-testid={`button-deductions-${format}`}
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span className="sr-only">Deductions</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-3">
                  {breakdown && priceCents !== null ? (
                    <div className="space-y-1 text-xs">
                      <div className="font-medium text-slate-900">Per copy at {dollars(priceCents)}</div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Manufacturing</span><span className="tabular-nums">{dollars(breakdown.manufacturingCents)}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Publishing</span><span className="tabular-nums">{dollars(breakdown.publishingCents)}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">Payment processing</span><span className="tabular-nums">{dollars(breakdown.paymentProcessingCents)}</span></div>
                      <div className="flex justify-between gap-3"><span className="text-slate-500">GoodTunes</span><span className="tabular-nums">{dollars(breakdown.goodtunesCents)}</span></div>
                      {certNetPerUnitCents !== null && (
                        <div className="flex justify-between gap-3 pt-1 border-t border-slate-100"><span className="text-slate-500">+ GoodDeed per cert</span><span className="tabular-nums">{signedDollars(certNetPerUnitCents)}</span></div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500">Set a price to see deductions.</span>
                  )}
                </PopoverContent>
              </Popover>
              )}
            </div>
          </div>
          </>
            );
          })()}
          </div>
        </div>
        </>
      ) : (
        /* Non-vinyl rows keep the legacy header (checkbox + SaveLink +
           chevron + X) — out of scope for the #393 restructure. */
        <div className={["flex items-start justify-between gap-4", expanded ? "mb-3" : ""].join(" ")}>
          <label className="inline-flex items-center gap-2 min-w-0">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[color:var(--brand-blue)] focus:ring-[color:var(--brand-blue)]"
              data-testid={`toggle-sku-${format}`}
            />
            <span className="text-[13.5px] font-semibold text-slate-900">
              {ALBUM_FORMAT_LABEL[format]}
            </span>
            {!expanded && (
              <span className="text-xs text-slate-500 ml-2" data-testid={`text-sku-summary-${format}`}>
                {priceStr ? `$${priceStr}` : "no price"}
                {active ? "" : " · off"}
              </span>
            )}
          </label>
          <div className="flex items-center gap-1">
            <SaveLink dirty={dirty} onClick={submit} testId={`button-save-sku-${format}`} />
            <button
              type="button"
              onClick={(e) => anchorScrollToElement(e.currentTarget, () => onSetExpanded(!expanded))}
              className="h-8 w-8 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center transition-colors"
              aria-label={expanded ? "Collapse format" : "Expand format"}
              aria-expanded={expanded}
              data-testid={`button-toggle-sku-${format}`}
            >
              <ChevronDown className={["w-4 h-4 transition-transform", expanded ? "rotate-180" : ""].join(" ")} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="h-8 w-8 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center transition-colors"
              aria-label={isDraft ? "Discard draft" : "Remove format"}
              data-testid={`button-delete-sku-${format}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {expanded && (useRichCard ? (
      <>
      <div
        className={isLocked ? "pointer-events-none opacity-60" : "contents"}
        aria-disabled={isLocked || undefined}
        data-testid={isLocked ? `body-sku-locked-${format}` : undefined}
      >
      {/* Task #393 — REQUIRED section. The vinyl pressing itself is
          non-optional for this format; the hairline + label echoes the
          Tracks-row REQUIRED/OPTIONAL split. */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {/* Task #1423 — the catalog cassette reuses this section; label
              it with its own format so it doesn't read "Required · Vinyl". */}
          Required · {isVinyl ? "Vinyl" : ALBUM_FORMAT_LABEL[format]}
        </span>
        <span className="flex-1 h-px bg-slate-200" aria-hidden />
      </div>
      {/* Task #619 — runtime-vs-capacity warning. Shows when the
          album's total runtime exceeds the per-side cap for the
          currently-selected vinyl format and a sensible bump format
          is available (filtered against the invited press's catalog
          if any). Click "View Suggestion" → inline preview of the
          new format's cost / margin with Accept / Undo; Accept opens
          the AlertDialog at the bottom of the row. */}
      {showFitWarning && (
        <div
          className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          data-testid={`fit-warning-${format}`}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-medium">
                Doesn't fit on {ALBUM_FORMAT_LABEL[format]}
              </div>
              <div className="text-xs text-amber-800/90 mt-0.5">
                {(() => {
                  const t = Math.max(0, Math.round(totalRuntimeSec ?? 0));
                  const m = Math.floor(t / 60);
                  const s = String(t % 60).padStart(2, "0");
                  const cap = Math.round(VINYL_PER_SIDE_MAX_SECONDS[format] / 60);
                  const alreadyHasSuggested =
                    suggestedFormat != null && configuredFormats?.has(suggestedFormat);
                  const tail = !suggestedFormat
                    ? `No larger format is available on the invited press — drop a track or shorten the run to fit.`
                    : alreadyHasSuggested
                      ? `${ALBUM_FORMAT_LABEL[suggestedFormat]} is already configured on this album — adjust that row instead.`
                      : `Bump to ${ALBUM_FORMAT_LABEL[suggestedFormat]}?`;
                  return `Album runs ${m}:${s} — over the ~${cap} min/side cap on ${ALBUM_FORMAT_LABEL[format]}. ${tail}`;
                })()}
              </div>
              {suggestedFormat && previewOpen && (
                <div
                  className="mt-2 rounded border border-amber-300/70 bg-white/70 px-2.5 py-2 text-xs text-slate-700"
                  data-testid={`fit-preview-${format}`}
                >
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">New format</span>
                    <span className="font-medium text-slate-900">
                      {ALBUM_FORMAT_LABEL[suggestedFormat]}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 mt-1">
                    <span className="text-slate-500">New unit cost</span>
                    <span className="font-medium text-slate-900" data-testid={`text-preview-cost-${format}`}>
                      {suggestedTotalCostCents != null ? dollars(suggestedTotalCostCents) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 mt-1">
                    <span className="text-slate-500">New per-unit profit</span>
                    <span
                      className={`font-medium ${suggestedProfitCents != null && suggestedProfitCents < 0 ? "text-rose-700" : "text-slate-900"}`}
                      data-testid={`text-preview-profit-${format}`}
                    >
                      {suggestedProfitCents != null ? dollars(suggestedProfitCents) : "—"}
                    </span>
                  </div>
                  {suggestedPick && (suggestedPick.fellBackTier || suggestedPick.fellBackColor) && (
                    <div
                      className="mt-1.5 text-xs text-amber-800"
                      data-testid={`text-preview-fallback-${format}`}
                    >
                      Heads up — the press doesn't offer your current{" "}
                      {suggestedPick.fellBackTier && suggestedPick.fellBackColor
                        ? "tier or color"
                        : suggestedPick.fellBackTier
                          ? "tier"
                          : "color"}{" "}
                      on {ALBUM_FORMAT_LABEL[suggestedFormat!]}; using{" "}
                      <span className="font-medium">{suggestedPick.tier.name}</span>
                      {suggestedPick.color ? (
                        <>
                          {" "}/ <span className="font-medium">{suggestedPick.color.name}</span>
                        </>
                      ) : null}{" "}
                      instead.
                    </div>
                  )}
                </div>
              )}
            </div>
            {suggestedFormat && !configuredFormats?.has(suggestedFormat) && (
              <div className="flex flex-col gap-1.5 shrink-0">
                {!previewOpen ? (
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    className="h-7 px-2.5 rounded text-xs font-medium bg-white border border-amber-300 text-amber-900 hover:bg-amber-100"
                    data-testid={`button-view-suggestion-${format}`}
                  >
                    View Suggestion
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(true)}
                      className="h-7 px-2.5 rounded text-xs font-medium bg-amber-600 text-white hover:bg-amber-700"
                      data-testid={`button-accept-suggestion-${format}`}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewOpen(false)}
                      className="h-7 px-2.5 rounded text-xs font-medium bg-white border border-amber-300 text-amber-900 hover:bg-amber-100"
                      data-testid={`button-undo-suggestion-${format}`}
                    >
                      Undo
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Task #390 — new two-column vinyl card. LEFT: format dropdown,
          big preview hero with pencil-on-hover (→ cover-art editor),
          color section + swatch row + selected color name, jacket.
          RIGHT: Retail Price, Select Qty, collapsible Profit with
          inline cost breakdown, Total. Non-vinyl rows keep the legacy
          grid below (else branch). */}
      {/* Task #655 — thin gray rule above the vinyl card section to
          separate it from whatever sits above it in the panel. */}
      <hr className="border-t border-slate-200 my-4" aria-hidden />
      {(() => {
        const catalogPicked = usingCatalog && pickedTier
          ? pickedTier.colors.find((c) => c.id === pressColorId) ?? null
          : null;
        const previewColor: VinylColorOption = catalogPicked
          ? {
              id: catalogPicked.id,
              name: catalogPicked.name,
              tier: "black",
              swatch: catalogPicked.swatchHex ?? "#ccc",
              // Task #672 — real per-color photo (when imported) drives
              // the preview disc; otherwise VinylPreview falls back to
              // the name-appropriate hex swatch above.
              thumbnailUrl: catalogPicked.swatchImageUrl ?? null,
            }
          : vinylColor;
        const formatOptions = Array.from(new Set<AlbumFormat>([format, ...offeredFormats]));
        // Task #654 — swap targets are the offered formats MINUS any
        // format that already has its own SKU (saved or draft). The
        // swap mutation PUTs the new format then DELETEs the old, so
        // including an already-configured format would silently
        // overwrite that other row's picks/price/lock. Operators who
        // want to land on an already-configured format use the "+ Add
        // physical good" / existing-row chevron to navigate there.
        const swapTargets = formatOptions.filter(
          (f) => f === format || !configuredFormats?.has(f),
        );
        const canChangeFormat =
          !!onChangeFormat && swapTargets.length > 1 && !isLocked;
        // Task #757 — more than one quantity is on screen whenever the
        // operator has added a comparison block. In that case even the
        // primary option must re-snap the ladder for its OWN quantity
        // instead of reusing the saved per-SKU snapshot, so a larger run
        // shows its real volume discount. A lone primary (single-quote,
        // saved-quantity, unchanged picks) still reads the snapshot.
        const comparingQuantities = pricingBlocks.length > 0;
        // Per-block economics. Publishing + GoodTunes are qty-independent
        // (pulled from the live breakdown); manufacturing re-snaps per qty
        // and payment processing tracks the block's own price.
        const blockEconomics = (
          blockPriceStr: string,
          qty: number,
          isPrimary: boolean,
        ) => {
          const bPriceCents = parseDollars(blockPriceStr);
          const pub = breakdown?.publishingCents ?? 0;
          const gt = breakdown?.goodtunesCents ?? 0;
          // The genuine single-quote primary keeps the saved snapshot;
          // every other case (comparison blocks, and the primary once a
          // comparison exists) resolves the confirmed rung for its own
          // quantity. A null/0 rung means "no confirmed price" → the
          // option surfaces a needs-quote state rather than a fake number.
          const useSnapshot = isPrimary && !comparingQuantities;
          const resolvedMfg = useSnapshot
            ? breakdown?.manufacturingCents ?? null
            : resolveMfgCentsForQty(qty);
          const mfgMissing = resolvedMfg === null || resolvedMfg <= 0;
          const mfg = resolvedMfg ?? 0;
          const pp =
            bPriceCents !== null ? Math.round(bPriceCents * 0.029) + 30 : 0;
          const costPerUnit =
            breakdown && !mfgMissing ? mfg + pub + pp + gt : null;
          const profit =
            bPriceCents !== null && costPerUnit !== null
              ? bPriceCents - costPerUnit
              : null;
          const total = profit !== null && qty > 0 ? profit * qty : null;
          return { priceCents: bPriceCents, mfg, mfgMissing, pub, pp, gt, costPerUnit, profit, total };
        };
        // One independent pricing scenario (Retail · Qty · collapsible
        // Profit · Total). The primary block keeps the original
        // `…-${format}` test ids so existing references hold; duplicated
        // blocks suffix their own key and gain a label + remove control.
        const renderPricingBlock = (opts: {
          blockKey: string;
          label: string | null;
          blockPriceStr: string;
          blockQty: number;
          onPriceChange: (v: string) => void;
          onQtyChange: (q: number) => void;
          onRemove?: () => void;
          isPrimary: boolean;
        }) => {
          const econ = blockEconomics(
            opts.blockPriceStr,
            opts.blockQty,
            opts.isPrimary,
          );
          const open = openProfitKeys.has(opts.blockKey);
          const idSuffix = opts.isPrimary
            ? format
            : `${format}-${opts.blockKey}`;
          const blockProfitPending = econ.profit === null;
          const blockLoss = econ.profit !== null && econ.profit < 0;
          const blockProfitLabel =
            econ.profit === null
              ? "$0.00"
              : econ.profit < 0
                ? `-${dollars(Math.abs(econ.profit))}`
                : dollars(econ.profit);
          const blockTotalLabel =
            econ.total === null
              ? "$0.00"
              : econ.total < 0
                ? `-${dollars(Math.abs(econ.total))}`
                : dollars(econ.total);
          // Task #757 — the lone primary trusts the breakdown's own
          // needsQuote flag (snapshot path); every re-snapped option
          // (comparison blocks + the primary once comparing) flags a
          // missing/zero rung directly so a quantity with no confirmed
          // price can't masquerade as a real volume number.
          const blockNeedsQuote =
            opts.isPrimary && !comparingQuantities
              ? !!breakdown?.needsQuote
              : econ.mfgMissing;
          const blockEffMfg =
            brokerDiscountPct > 0
              ? Math.floor((econ.mfg * (100 - brokerDiscountPct)) / 100)
              : econ.mfg;
          const blockBrokerDelta = econ.mfg - blockEffMfg;
          const blockInternalProfit =
            econ.priceCents !== null && econ.costPerUnit !== null
              ? econ.priceCents - (blockEffMfg + econ.pub + econ.pp + econ.gt)
              : null;
          return (
            <div
              key={opts.blockKey}
              className="rounded-lg border border-slate-200 bg-white p-3 space-y-3"
              data-testid={`pricing-block-${idSuffix}`}
            >
              {(opts.label || opts.onRemove) && (
                <div className="flex items-center justify-between gap-2 min-h-7">
                  <span
                    className="text-xs uppercase tracking-wider text-slate-400 font-semibold truncate"
                    data-testid={`text-pricing-block-label-${idSuffix}`}
                  >
                    {opts.label}
                  </span>
                  {opts.onRemove && (
                    <IconButton
                      variant="ghost"
                      label="Remove pricing option"
                      onClick={opts.onRemove}
                      className="!w-7 !h-7 text-slate-400 hover:text-[color:var(--brand-pink)]"
                      data-testid={`button-remove-pricing-block-${idSuffix}`}
                    >
                      <X />
                    </IconButton>
                  )}
                </div>
              )}
              {/* Retail Price */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    Retail Price
                  </span>
                  <InfoTip
                    label="About retail price"
                    testId={`info-price-${idSuffix}`}
                    text="This is the price you want to charge per unit for your vinyl. Per unit sold to fans."
                  />
                </div>
                <div className="relative w-full">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                    $
                  </span>
                  <input
                    type="text"
                    value={opts.blockPriceStr}
                    onChange={(e) => opts.onPriceChange(e.target.value)}
                    onKeyDown={handlePriceFieldKeyDown}
                    placeholder="0.00"
                    inputMode="decimal"
                    className={`w-full pl-5 ${fieldClass}`}
                    data-testid={`input-price-${idSuffix}`}
                  />
                </div>
              </div>
              {/* Select Qty */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    Select Qty
                  </span>
                  <InfoTip
                    label="About quantity"
                    testId={`info-qty-${idSuffix}`}
                    text="Your margin will improve based on quantity. This estimate is for you to choose the absolute lowest quantity you believe you'll sell — anything above that is more profit due to lower per-unit costs from scale."
                  />
                </div>
                {quantityRungs.length > 0 ? (
                  <Select
                    value={String(opts.blockQty)}
                    onValueChange={(v) => opts.onQtyChange(Number.parseInt(v, 10))}
                  >
                    <SelectTrigger
                      className="h-8 w-full text-sm"
                      data-testid={`select-sku-quantity-${idSuffix}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900 border-slate-200">
                      {quantityRungs.map((q) => (
                        <SelectItem
                          key={q}
                          value={String(q)}
                          data-testid={`option-sku-quantity-${idSuffix}-${q}`}
                        >
                          {q.toLocaleString()} units
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <input
                    type="text"
                    value={String(opts.blockQty)}
                    onChange={(e) => {
                      const n = Number.parseInt(
                        e.target.value.replace(/[^0-9]/g, ""),
                        10,
                      );
                      if (Number.isFinite(n) && n > 0) opts.onQtyChange(n);
                      else if (e.target.value === "") opts.onQtyChange(0);
                    }}
                    inputMode="numeric"
                    className={`w-full ${fieldClass}`}
                    data-testid={`input-sku-quantity-${idSuffix}`}
                  />
                )}
              </div>
              {/* Profit — collapsible inline breakdown */}
              {/* Task #859 — "Profit / per unit sold" is platform margin and
                  its breakdown is the full vendor cost stack (manufacturing,
                  publishing, processing, GoodTunes, never-lose-money rung
                  notes). An `artist` partner sees Artist Net + Total only,
                  never this block. */}
              {!isArtist && (
              <div className="pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => toggleProfit(opts.blockKey)}
                  className="w-full flex items-center justify-between gap-2 text-left rounded-md hover:bg-slate-50 py-0.5 transition-colors"
                  aria-expanded={open}
                  data-testid={`button-toggle-breakdown-${idSuffix}`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                      Profit
                    </span>
                    <span className="text-xs text-slate-400 normal-case font-normal">
                      Per unit sold
                    </span>
                    <ChevronDown
                      className={[
                        "w-3.5 h-3.5 text-slate-400 transition-transform",
                        open ? "rotate-180" : "",
                      ].join(" ")}
                    />
                  </span>
                  <span
                    className={[
                      "tabular-nums text-base font-semibold",
                      blockProfitPending
                        ? "text-slate-300"
                        : blockLoss
                          ? "text-[color:var(--brand-pink)]"
                          : "text-slate-900",
                    ].join(" ")}
                    data-testid={`text-profit-${idSuffix}`}
                  >
                    {blockProfitLabel}
                  </span>
                </button>
                {open && breakdown && (
                  <div
                    className="mt-2 ml-1 pl-3 border-l border-slate-200 space-y-1"
                    data-testid={`breakdown-${idSuffix}`}
                  >
                    {isSuperAdmin && brokerDiscountPct > 0 && (
                      <div className="-ml-3 -mr-1 mb-1 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 space-y-0.5">
                        <div className="text-xs uppercase tracking-wider text-amber-700 font-semibold">
                          Internal — GoodTunes only
                        </div>
                        <div className="flex items-center justify-between gap-6 text-xs text-amber-900">
                          <span>{`Discounted mfg (−${brokerDiscountPct}%)`}</span>
                          <span className="tabular-nums">{dollars(blockEffMfg)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-6 text-xs text-amber-900 font-semibold">
                          <span>Broker margin to GoodTunes</span>
                          <span className="tabular-nums">{dollars(blockBrokerDelta)}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-6 text-xs text-slate-600">
                      <span className={blockNeedsQuote ? "text-[color:var(--brand-blue)]" : ""}>Manufacturing</span>
                      <span className={["tabular-nums", blockNeedsQuote ? "text-[color:var(--brand-blue)]" : ""].join(" ")}>{dollars(econ.mfg)}</span>
                    </div>
                    {blockNeedsQuote && (
                      <div
                        className="text-xs text-[color:var(--brand-blue)] leading-snug -mt-1 pl-1"
                        data-testid={`text-mfg-needs-quote-inline-${idSuffix}`}
                      >
                        {usingCatalog
                          ? `No confirmed price rung for ${pickedTier?.name ?? "this tier"} at ${opts.blockQty.toLocaleString()} pcs on ${invitedPressItself?.name ?? "this press"}. Confirm the rung in Admin → Presses.`
                          : invitedPressItself
                            ? `No quote yet from ${invitedPressItself.name} for this format. Add an estimate in the Quotes section below.`
                            : `No MRP rung for this tier at ${opts.blockQty.toLocaleString()} pcs — confirm the rung in Admin → Presses → MRP, or invite a different press.`}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-6 text-xs text-slate-600">
                      <span>Publishing: ($0.127 × 2 [vinyl+digital]) × {breakdown.publishingTrackCount} tracks</span>
                      <span className="tabular-nums">{dollars(econ.pub)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-6 text-xs text-slate-600">
                      <span>Payment processing</span>
                      <span className="tabular-nums">{dollars(econ.pp)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-6 text-xs text-slate-600">
                      <span>GoodTunes</span>
                      <span className="tabular-nums">{dollars(econ.gt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-6 text-xs text-slate-900 font-semibold pt-1.5 border-t border-slate-100 mt-1">
                      <span>Cost / unit</span>
                      <span
                        className="tabular-nums"
                        data-testid={`text-cost-${idSuffix}`}
                      >
                        {econ.costPerUnit === null ? "—" : dollars(econ.costPerUnit)}
                      </span>
                    </div>
                    {isSuperAdmin && brokerDiscountPct > 0 && blockInternalProfit !== null && (
                      <div className="flex items-center justify-between gap-6 text-xs text-amber-800 font-semibold">
                        <span>{`Internal margin (− mfg discount)`}</span>
                        <span
                          className="tabular-nums"
                          data-testid={`text-internal-margin-${idSuffix}`}
                        >
                          {dollars(blockInternalProfit)}
                          <span className="ml-1 text-amber-600 font-normal">{`(+${dollars(blockBrokerDelta)})`}</span>
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}
              {/* Total */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                      Total
                    </span>
                    <InfoTip
                      label="About total"
                      testId={`info-total-${idSuffix}`}
                      text="Estimated total profit at this quantity and price (per-unit profit × quantity)."
                    />
                  </span>
                  <span
                    className={[
                      "tabular-nums text-base font-semibold",
                      econ.total === null
                        ? "text-slate-300"
                        : econ.total < 0
                          ? "text-[color:var(--brand-pink)]"
                          : "text-slate-900",
                    ].join(" ")}
                    data-testid={`text-total-${idSuffix}`}
                  >
                    {blockTotalLabel}
                  </span>
                </div>
              </div>
              {/* Task #758 — GoodDeed revenue readout for this option.
                  Renders only when the GoodDeed cert is active; the cert
                  count, revenue, and net follow this option's own quantity
                  at the attach ratio chosen in the GoodDeed panel below.
                  Cost is resolved per option cert-run so the net is
                  accurate at each volume. */}
              {goodDeedSignal?.active &&
                goodDeedSignal.priceCents !== null &&
                opts.blockQty > 0 && (
                  <GoodDeedOptionCard
                    albumId={albumId!}
                    optionQty={opts.blockQty}
                    ratio={goodDeedSignal.ratio}
                    priceCents={goodDeedSignal.priceCents}
                    existing={signedAddon ?? null}
                    livePlatformCostCents={livePlatformCostCents ?? null}
                    vinylTotalCents={econ.total}
                    idSuffix={idSuffix}
                  />
                )}
            </div>
          );
        };
        // Task #707 — Quote PDF export. Build the same package + option
        // figures the on-screen blocks show (single-sourced via
        // `blockEconomics`) and POST them to the server's pdfkit renderer.
        // The primary block plus every duplicated pricing block becomes a
        // comparison column in the PDF.
        const exportColorName = isVinyl
          ? usingCatalog
            ? pickedTier?.colors.find((c) => c.id === pressColorId)?.name ?? null
            : vinylColor.name
          : null;
        const exportJacketLabel =
          isVinyl && jacketUpgrade && jacketUpgrade !== "none"
            ? JACKET_UPGRADE_LABEL[jacketUpgrade]
            : null;
        const buildQuoteOptions = () => {
          const out: {
            label: string;
            priceCents: number | null;
            qty: number;
            manufacturingCents: number;
            publishingCents: number;
            publishingTrackCount: number | null;
            paymentProcessingCents: number;
            goodtunesCents: number;
            costPerUnitCents: number | null;
            profitCents: number | null;
            totalCents: number | null;
            needsQuote: boolean;
          }[] = [];
          const trk = breakdown?.publishingTrackCount ?? null;
          const primary = blockEconomics(priceStr, parsedQty, true);
          out.push({
            label: pricingBlocks.length > 0 ? "Option 1" : "Quote",
            priceCents: primary.priceCents,
            qty: parsedQty,
            manufacturingCents: primary.mfg,
            publishingCents: primary.pub,
            publishingTrackCount: trk,
            paymentProcessingCents: primary.pp,
            goodtunesCents: primary.gt,
            costPerUnitCents: primary.costPerUnit,
            profitCents: primary.profit,
            totalCents: primary.total,
            needsQuote: comparingQuantities
              ? primary.mfgMissing
              : !!breakdown?.needsQuote,
          });
          pricingBlocks.forEach((block, idx) => {
            const e = blockEconomics(block.priceStr, block.qty, false);
            out.push({
              label: `Option ${idx + 2}`,
              priceCents: e.priceCents,
              qty: block.qty,
              manufacturingCents: e.mfg,
              publishingCents: e.pub,
              publishingTrackCount: trk,
              paymentProcessingCents: e.pp,
              goodtunesCents: e.gt,
              costPerUnitCents: e.costPerUnit,
              profitCents: e.profit,
              totalCents: e.total,
              needsQuote: e.mfgMissing,
            });
          });
          return out;
        };
        const handleExportPdf = async () => {
          if (exportingPdf) return;
          setExportingPdf(true);
          try {
            const payload = {
              format: {
                label: displayNameStr.trim() || ALBUM_FORMAT_LABEL[format],
              },
              pkg: {
                colorName: exportColorName,
                trackCount: breakdown?.publishingTrackCount ?? null,
                jacketLabel: exportJacketLabel,
                pressName: invitedPressItself?.name ?? null,
              },
              options: buildQuoteOptions(),
            };
            const res = await apiRequest(
              "POST",
              `/api/admin/albums/${albumId}/quote-pdf`,
              payload,
            );
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `GoodTunes-Quote-${format}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast({ title: "Quote PDF downloaded" });
          } catch (e: any) {
            toast({
              title: "Couldn't export PDF",
              description: e?.message,
              variant: "destructive",
            });
          } finally {
            setExportingPdf(false);
          }
        };
        return (
      <>
      <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 items-start"
          data-testid={`vinyl-card-${format}`}
        >
          {/* Task #654 — PREVIEW column with a hover overlay that
              groups two IconButtons (edit-artwork pencil + change-
              format package icon) on the jacket. Replaces the format
              dropdown that previously sat in the CONTROLS column.
              Task #671 — package icon + visible "Package Options"
              tooltip (was a loop/recycle icon w/ aria-label only). */}
          <div className="sm:order-2">
          <div className="relative">
            {/* Task #1025 — the vinyl preview sits on the plain white
                admin surface. The earlier ambient vendor-color backdrop
                (a blurred swatch-photo bloom / faint hex tint behind the
                disc) was removed because the tint read as a rendering
                glitch behind the color picker; the disc + jacket carry
                the selected color on their own. Wrapper kept for layout
                (rounded clip box reserving the preview footprint). */}
            <div className="relative overflow-hidden rounded-xl">
            <div
              className="group relative w-full rounded-lg p-3 sm:p-4"
              data-testid={`vinyl-preview-group-${format}`}
            >
              <div className="flex items-center justify-start">
                <VinylPreview
                  artworkUrl={artworkUrl}
                  color={previewColor}
                  jacketUpgrade={jacketUpgrade}
                  format={format}
                  size="2xl"
                  jacketOverlay={(onEditArtwork || canChangeFormat) ? (
                    <>
                      <span
                        className="absolute inset-0 bg-black/0 group-hover:bg-black/40 group-focus-within:bg-black/40 transition-colors pointer-events-none"
                        aria-hidden
                      />
                      <span
                        className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                        aria-hidden={false}
                      >
                        {onEditArtwork && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <IconButton
                                variant="ghost"
                                label="Edit artwork"
                                onClick={onEditArtwork}
                                className="!text-slate-700 shadow-lg ring-1 ring-black/5"
                                style={{ backgroundColor: "rgba(255,255,255,0.95)" }}
                                data-testid={`button-edit-artwork-${format}`}
                              >
                                <Pencil />
                              </IconButton>
                            </TooltipTrigger>
                            <TooltipContent>Edit artwork</TooltipContent>
                          </Tooltip>
                        )}
                        {canChangeFormat && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <IconButton
                                variant="ghost"
                                label="Package Options"
                                onClick={() => setChangeFormatOpen(true)}
                                disabled={swapBusy}
                                className="!text-slate-700 shadow-lg ring-1 ring-black/5"
                                style={{ backgroundColor: "rgba(255,255,255,0.95)" }}
                                data-testid={`button-change-format-${format}`}
                              >
                                <Package />
                              </IconButton>
                            </TooltipTrigger>
                            <TooltipContent>Package Options</TooltipContent>
                          </Tooltip>
                        )}
                      </span>
                    </>
                  ) : null}
                />
              </div>
            </div>
            </div>
            {/* Task #655 — 12" LP jacket footnote, demoted from a
                full labeled control row in the controls column to a
                small gray caption directly under the preview. The 7"
                "Standard Full-Color Jacket" tag and the dropdown for
                other vinyl formats still render down in the controls
                column below. */}
            {format === "12_lp" && (
              <div
                className="mt-2 text-xs text-slate-500 text-left"
                data-testid={`text-jacket-standard-${format}`}
              >
                Every 12&rdquo; LP ships in the standard jacket.
              </div>
            )}
          </div>
          </div>

          {/* Task #682 — CONTROLS column (left on desktop via sm:order-1,
              below preview on mobile). Reorder: the three numeric controls
              (Anticipated tracks · Retail Price · Select Qty) sit together on
              one responsive row → Jacket (full width, 7"/10" only; 12" LP
              footnote lives under the preview) → Color (full width, LAST) →
              Profit → Total. Color is last because its swatch grid is the one
              control with unpredictable height; placing it at the bottom lets
              it grow downward without reflowing the controls above it. */}
          <div className="sm:order-1 space-y-4">
            {/* Task #705 — the Package section now leads with the album
                art and carries only the package-shaping controls (Tracks
                + Jacket + Color). Retail Price / Select Qty / Profit /
                Total moved down into the dedicated "Pricing" section below
                so the commercial math reads as one block (and so each
                duplicated quote owns its own price + qty).
                Anticipated tracks drives the Publishing line before any
                masters are uploaded; once real audio exists the live count
                wins and the field switches to a read-only "Tracks" mirror
                of the tracklist count (it stays visible — see Task: don't
                let it disappear once everything is uploaded). */}
            <AnticipatedTracksInput
              format={format}
              liveTrackCount={liveTrackCount ?? 0}
              anticipatedTrackCount={anticipatedTrackCount ?? null}
              persistedAnticipatedTrackCount={persistedAnticipatedTrackCount ?? null}
              lockedValue={sevenInch ? SEVEN_INCH_TRACK_COUNT : null}
              onLocalChange={onAnticipatedTrackLocalChange}
              onChange={onAnticipatedTrackCountChange}
            />

            {/* Jacket — Select for 7"/10"; de-emphasized tag for 7" only.
                Task #655: 12" LP no longer renders a labeled Jacket row
                here — its "Standard jacket" copy now lives as a small
                gray caption directly under the album preview. */}
          {jacketDropdownAllowed ? (
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Jacket
              </div>
              <Select
                value={jacketUpgrade}
                onValueChange={(v) => setJacketUpgrade(v as JacketUpgrade)}
              >
                <SelectTrigger
                  className="h-8 w-full text-sm"
                  data-testid={`select-jacket-${format}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white text-slate-900 border-slate-200">
                  {(Object.keys(JACKET_UPGRADE_LABEL) as JacketUpgrade[]).map((j) => (
                    <SelectItem
                      key={j}
                      value={j}
                      data-testid={`option-jacket-${format}-${j}`}
                    >
                      {JACKET_UPGRADE_LABEL[j]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : sevenInch ? (
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Jacket
              </div>
              <div
                className="h-8 inline-flex items-center text-sm font-medium text-slate-700"
                data-testid={`text-jacket-standard-${format}`}
              >
                Standard Full-Color Jacket
              </div>
              {sevenInchHiddenJacket && existing?.jacketUpgrade && (
                <div
                  className="text-xs text-slate-500"
                  data-testid={`text-jacket-back-compat-${format}`}
                >
                  Previously: {JACKET_UPGRADE_LABEL[existing.jacketUpgrade as JacketUpgrade]} — saved as Standard jacket on next save.
                </div>
              )}
            </div>
          ) : null}

            {/* Color — full width, LAST. Catalog tier picker or legacy
                vinyl-color picker, plus the swatch row + selected color name.
                Kept at the bottom of the controls column because the swatch
                grid is the one control with unpredictable height (one row vs.
                several); placing it last lets it grow downward without
                reflowing the Tracks/Retail/Qty/Jacket controls above it. */}
          {!isVinyl ? (
            // Task #1310 — cassette/CD are a single one-color imprint
            // (J-card prints with the album cover), so they don't get
            // the vinyl color/tier picker. pickedTier still resolves to
            // the lone catalog tier, so pricing/rungs flow normally; we
            // just suppress the swatch UI and the misleading
            // "no colors set — ask the press" hint.
            <div
              className="text-xs text-slate-400"
              data-testid={`text-one-color-imprint-${format}`}
            >
              One-color imprint — the J-card prints with the album cover. No color choices for {ALBUM_FORMAT_LABEL[format].toLowerCase()}.
            </div>
          ) : usingCatalog && pickedTier ? (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Color
              </div>
              <Select
                value={pickedTier.id}
                onValueChange={(v) => setPressTierId(v)}
              >
                <SelectTrigger
                  className="h-8 w-full text-sm"
                  data-testid={`select-tier-${format}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white text-slate-900 border-slate-200">
                  {tiers.map((t) => (
                    <SelectItem
                      key={t.id}
                      value={t.id}
                      data-testid={`option-tier-${format}-${t.id}`}
                    >
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {pickedTier.colors.length === 0 ? (
                <div className="text-xs text-slate-400">
                  No colors set on this tier yet — ask the press to fill in their catalog.
                </div>
              ) : (
                <div
                  className="flex flex-wrap gap-1.5"
                  role="radiogroup"
                  aria-label="Vinyl color"
                  data-testid={`picker-vinyl-color-${format}`}
                >
                  {pickedTier.colors.map((c) => {
                    const selected = c.id === pressColorId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        title={c.name}
                        onClick={() => setPressColorId(c.id)}
                        className={[
                          "w-7 h-7 rounded-full border-2 transition-transform overflow-hidden bg-cover bg-center",
                          selected
                            ? "border-[color:var(--brand-blue)] scale-110 shadow"
                            : "border-slate-200 hover:border-slate-400",
                        ].join(" ")}
                        style={
                          c.swatchImageUrl
                            ? { backgroundImage: `url(${c.swatchImageUrl})` }
                            : { background: c.swatchHex ?? "#ccc" }
                        }
                        data-testid={`swatch-vinyl-color-${format}-${c.id}`}
                      >
                        <span className="sr-only">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Task #1025 — a saved color that no longer resolves
                  against the live catalog (the press re-imported / the
                  row is viewed under a different press). Surface it
                  explicitly instead of silently snapping to the first
                  swatch, and hold autosave until the operator re-picks. */}
              {colorUnresolved && (
                <div
                  className="text-xs text-amber-700 font-medium"
                  data-testid={`text-vinyl-color-unresolved-${format}`}
                >
                  Previously {existing?.vinylColor ?? "a color no longer in this catalog"} — choose a color to save.
                </div>
              )}
              {catalogPicked && (
                <div
                  className="text-xs text-slate-700 font-medium"
                  data-testid={`text-vinyl-color-name-${format}`}
                >
                  {catalogPicked.name}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Color
              </div>
              <Select
                value={legacyColorTier}
                onValueChange={(v) =>
                  setLegacyColorTier(v as import("@shared/pressing").VinylColorTier)
                }
              >
                <SelectTrigger
                  className="h-8 w-full text-sm"
                  data-testid={`select-vinyl-color-tier-${format}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white text-slate-900 border-slate-200">
                  {/* Task #446 — 7" trims the catalog to Black + Opaque
                      (the only tiers we want to sell today). The other
                      groups stay defined in shared/pressing.ts so this
                      is a one-line UI flip if Bill wants them back. */}
                  {(sevenInch
                    ? VINYL_COLOR_TIER_ORDER.filter((t) => SEVEN_INCH_VISIBLE_TIERS.includes(t))
                    : VINYL_COLOR_TIER_ORDER
                  ).map((t) => (
                    <SelectItem
                      key={t}
                      value={t}
                      data-testid={`option-vinyl-color-tier-${format}-${t}`}
                    >
                      {VINYL_COLOR_TIER_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {sevenInchHiddenColor && existingColorTier && (
                <div
                  className="text-xs text-slate-500"
                  data-testid={`text-vinyl-color-back-compat-${format}`}
                >
                  Previously: {VINYL_COLOR_TIER_LABEL[existingColorTier]} — switch to a visible color to save.
                </div>
              )}
              <div
                className="flex flex-wrap gap-1.5"
                role="radiogroup"
                aria-label="Vinyl color"
                data-testid={`picker-vinyl-color-${format}`}
              >
                {VINYL_COLORS.filter((c) => c.tier === legacyColorTier).map((c) => {
                  const selected = c.id === vinylColor.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      title={c.name}
                      onClick={() => setVinylColorId(c.id)}
                      className={[
                        "w-7 h-7 rounded-full border-2 transition-transform",
                        selected
                          ? "border-[color:var(--brand-blue)] scale-110 shadow"
                          : "border-slate-200 hover:border-slate-400",
                      ].join(" ")}
                      style={{ background: c.swatch }}
                      data-testid={`swatch-vinyl-color-${format}-${c.id}`}
                    >
                      <span className="sr-only">{c.name}</span>
                    </button>
                  );
                })}
              </div>
              <div
                className="text-xs text-slate-700 font-medium"
                data-testid={`text-vinyl-color-name-${format}`}
              >
                {vinylColor.name}
              </div>
            </div>
          )}

          </div>
        </div>

        {/* Task #705 — PRICING section. Lifts Retail Price / Select Qty /
            Profit / Total out of the package controls into their own
            full-width block so the commercial math reads as one unit. The
            duplicate (+) control clones the current quote into a second
            independent pricing block (own price + qty + profit + total) so
            an artist can compare, e.g., $35 @ 500 vs. $45 @ 1,000 side by
            side. Artist-facing — NOT gated behind an invited press (the
            operator-only "Quotes" comparison section still lives below). */}
        {/* Task #735 — hairline divider above Pricing, mirroring the
            rule rendered below the vinyl/format section so Pricing reads
            as its own bracketed block. */}
        <hr className="border-t border-slate-200 my-4" aria-hidden />
        <div className="mt-5" data-testid={`pricing-section-${format}`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-900">
                Pricing
              </span>
              <InfoTip
                label="About pricing"
                testId={`info-pricing-${format}`}
                text="Set your retail price and run size. Duplicate this to compare two scenarios side by side — each has its own price, quantity, profit and total."
              />
            </div>
            {/* Task #735 — boxed, labeled buttons matching the "+ Person"
                AddEntityButton family (white bg, slate outline, quiet).
                Duplicate clones the current pricing into a new Option
                card; Export quote fires the quote-PDF export. */}
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <AddEntityButton
                    label="Duplicate"
                    icon={Copy}
                    onClick={addPricingBlock}
                    testId={`button-add-pricing-block-${format}`}
                  />
                </TooltipTrigger>
                <TooltipContent>Duplicate pricing</TooltipContent>
              </Tooltip>
              {/* Task #859 — the quote PDF is an operator deliverable that
                  renders the cost stack/margin. An `artist` partner can
                  duplicate and compare quotes on-screen but can't export
                  the operator PDF. */}
              {!isArtist && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <AddEntityButton
                    label="Export quote"
                    icon={exportingPdf ? Loader2 : Share}
                    iconClassName={exportingPdf ? "w-3 h-3 animate-spin" : "w-3 h-3"}
                    onClick={handleExportPdf}
                    disabled={exportingPdf}
                    testId={`button-export-quote-pdf-${format}`}
                  />
                </TooltipTrigger>
                <TooltipContent>Export quote as PDF</TooltipContent>
              </Tooltip>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            {renderPricingBlock({
              blockKey: "primary",
              label: pricingBlocks.length > 0 ? "Option 1" : null,
              blockPriceStr: priceStr,
              blockQty: parsedQty,
              onPriceChange: setPriceStr,
              onQtyChange: setParsedQty,
              isPrimary: true,
            })}
            {pricingBlocks.map((block, idx) =>
              renderPricingBlock({
                blockKey: block.id,
                label: `Option ${idx + 2}`,
                blockPriceStr: block.priceStr,
                blockQty: block.qty,
                onPriceChange: (v) => updatePricingBlock(block.id, { priceStr: v }),
                onQtyChange: (q) => updatePricingBlock(block.id, { qty: q }),
                onRemove: () => removePricingBlock(block.id),
                isPrimary: false,
              }),
            )}
          </div>
        </div>
      </>
        );
      })()}
      {/* Task #655 — thin gray rule directly below the vinyl card
          section, mirroring the rule added above the IIFE. */}
      <hr className="border-t border-slate-200 my-4" aria-hidden />

      {/* Task #646 — close the partner-edit_metadata locked wrapper
          here so the operator-scoped Quote Rows section below stays
          interactive even when the SKU is locked
          (vendor-pricing-bypasses-post-sale-lock memory: operational
          routing edits stay live; only fan-facing metadata respects
          the lock). The OPTIONAL upsells below get their own lock
          wrapper. */}
      </div>
      {(() => {
        // Task #736 — the cross-press bid comparison only appears in
        // "all" mode. In "dedicated" (or inherit) mode the panel stays
        // locked to the single resolved plant with no comparison.
        const allMode = (invitedPressRow?.pressMode ?? "dedicated") === "all";
        // Task #736 — comparison renders in all-mode even with no invited
        // stamp (unaffiliated / investor demo). It anchors on the invited
        // press when present, else the first qualified press. Only bail if
        // there is no press at all to compare against.
        if (!isVinyl || !pickedTier || !allMode || !comparisonAnchorPress)
          return null;
        const catalogPicked = usingCatalog
          ? pickedTier.colors.find((c) => c.id === pressColorId) ?? null
          : null;
        const primaryColorName = catalogPicked?.name ?? null;
        // Pinned primary row cost: the invited press uses the album's saved
        // breakdown; the no-stamp anchor resolves its own catalog cost so the
        // headline bid reflects that plant, not the MRP-default fallback.
        const primaryMfgCents = invitedPressItself
          ? breakdown?.manufacturingCents ?? 0
          : resolveQuoteRow({
              id: "anchor-primary",
              pressId: comparisonAnchorPress.id,
              tierName: pickedTier.name,
              colorName: primaryColorName,
              qty: parsedQty,
            }).mfgCents;
        const otherQualified = qualifiedPresses.filter(
          (p) => p.id !== comparisonAnchorPress.id,
        );
        const renderQuote = (params: {
          key: string;
          press: Manufacturer | null;
          tierName: string;
          colorName: string | null;
          qty: number;
          mfgCents: number;
          isPinned?: boolean;
          matched?: boolean;
          needsCatalog?: boolean;
          onChangeQty?: (q: number) => void;
          onChangePress?: (pressId: string) => void;
          onChangeColor?: (colorName: string | null) => void;
          onDuplicate?: () => void;
          onDelete?: () => void;
          qtyOptions?: number[];
          pressOptions?: Manufacturer[];
          colorOptions?: CatalogColor[];
        }) => {
          const pubC = breakdown?.publishingCents ?? 0;
          const ppC = breakdown?.paymentProcessingCents ?? 0;
          const gtC = breakdown?.goodtunesCents ?? 0;
          const costPerUnit = params.mfgCents + pubC + ppC + gtC;
          const profitPerUnit = (priceCents ?? 0) - costPerUnit;
          const total = profitPerUnit * params.qty;
          return (
            <div
              key={params.key}
              className={[
                "rounded-md border p-2.5 bg-white",
                params.isPinned
                  ? "border-[color:var(--brand-blue)]/40 bg-[color:var(--brand-blue)]/[0.03]"
                  : "border-slate-200",
              ].join(" ")}
              data-testid={`row-quote-${format}-${params.key}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {params.press?.logoUrl ? (
                  <img
                    src={params.press.logoUrl}
                    alt=""
                    className="w-5 h-5 object-contain flex-shrink-0"
                  />
                ) : (
                  <span
                    className="w-5 h-5 rounded bg-slate-200 flex-shrink-0"
                    aria-hidden
                  />
                )}
                <div className="flex-1 min-w-0 text-xs flex items-center gap-1.5 flex-wrap">
                  {params.pressOptions &&
                  params.pressOptions.length > 1 &&
                  params.onChangePress ? (
                    <Select
                      value={params.press?.id ?? ""}
                      onValueChange={(v) => params.onChangePress?.(v)}
                    >
                      <SelectTrigger
                        className="h-6 w-32 text-xs font-medium"
                        data-testid={`select-quote-press-${format}-${params.key}`}
                      >
                        <SelectValue>{params.press?.name ?? "—"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-white text-slate-900 border-slate-200">
                        {params.pressOptions.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="font-medium text-slate-900">
                      {params.press?.name ?? "—"}
                    </span>
                  )}
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-500">{params.tierName}</span>
                  <span className="text-slate-500">·</span>
                  {params.colorOptions &&
                  params.colorOptions.length > 1 &&
                  params.onChangeColor ? (
                    <Select
                      value={params.colorName ?? ""}
                      onValueChange={(v) =>
                        params.onChangeColor?.(v === "" ? null : v)
                      }
                    >
                      <SelectTrigger
                        className="h-6 w-28 text-xs"
                        data-testid={`select-quote-color-${format}-${params.key}`}
                      >
                        <SelectValue>{params.colorName ?? "—"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-white text-slate-900 border-slate-200">
                        {params.colorOptions.map((c) => (
                          <SelectItem key={c.id} value={c.name}>
                            <span className="inline-flex items-center gap-1.5">
                              {c.swatchHex && (
                                <span
                                  className="w-3 h-3 rounded-full border border-slate-200"
                                  style={{ backgroundColor: c.swatchHex }}
                                  aria-hidden
                                />
                              )}
                              {c.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-slate-500">
                      {params.colorName ?? "—"}
                    </span>
                  )}
                  {params.qtyOptions &&
                  params.qtyOptions.length > 0 &&
                  params.onChangeQty ? (
                    <>
                      <span className="text-slate-500">·</span>
                      <Select
                        value={String(params.qty)}
                        onValueChange={(v) =>
                          params.onChangeQty?.(Number.parseInt(v, 10))
                        }
                      >
                        <SelectTrigger
                          className="h-6 w-24 text-xs"
                          data-testid={`select-quote-qty-${format}-${params.key}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white text-slate-900 border-slate-200">
                          {params.qtyOptions.map((q) => (
                            <SelectItem key={q} value={String(q)}>
                              {q.toLocaleString()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  ) : (
                    <>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-500">
                        {params.qty.toLocaleString()} pcs
                      </span>
                    </>
                  )}
                </div>
                {params.isPinned && (
                  <span
                    className="text-xs uppercase tracking-wider font-semibold text-[color:var(--brand-blue)]"
                    data-testid={`badge-quote-primary-${format}`}
                  >
                    Quoting
                  </span>
                )}
                {params.matched && (
                  <span
                    className="text-xs uppercase tracking-wider font-semibold text-amber-600"
                    data-testid={`badge-quote-matched-${format}-${params.key}`}
                  >
                    Matched
                  </span>
                )}
                {params.onDuplicate && (
                  <button
                    type="button"
                    onClick={params.onDuplicate}
                    className="w-6 h-6 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center"
                    title="Duplicate quote"
                    data-testid={`button-quote-duplicate-${format}-${params.key}`}
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="sr-only">Duplicate quote</span>
                  </button>
                )}
                {params.onDelete && (
                  <button
                    type="button"
                    onClick={params.onDelete}
                    className="w-6 h-6 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center"
                    title="Remove quote"
                    data-testid={`button-quote-delete-${format}-${params.key}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="sr-only">Remove quote</span>
                  </button>
                )}
              </div>
              {params.needsCatalog || !breakdown ? (
                <div className="text-xs text-slate-400 px-0.5">
                  Loading catalog…
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Manufacturing</span>
                    <span>{dollars(params.mfgCents)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Publishing</span>
                    <span>{dollars(pubC)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment proc.</span>
                    <span>{dollars(ppC)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">GoodTunes</span>
                    <span>{dollars(gtC)}</span>
                  </div>
                  <div className="flex justify-between col-span-2 pt-1 border-t border-slate-100 mt-1 font-medium text-slate-900">
                    <span>Cost / unit</span>
                    <span>{dollars(costPerUnit)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      Artist Net / unit
                    </span>
                    <span
                      className={
                        profitPerUnit < 0
                          ? "text-[color:var(--brand-pink)]"
                          : ""
                      }
                    >
                      {profitPerUnit < 0
                        ? `-${dollars(Math.abs(profitPerUnit))}`
                        : dollars(profitPerUnit)}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-900">
                    <span>Total</span>
                    <span
                      className={
                        total < 0 ? "text-[color:var(--brand-pink)]" : ""
                      }
                    >
                      {total < 0
                        ? `-${dollars(Math.abs(total))}`
                        : dollars(total)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        };
        return (
          <div className="mt-4" data-testid={`quotes-section-${format}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Quotes
                </span>
                <span className="text-xs text-slate-400">
                  Operator scratchpad — not shown to fans
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={matchAcrossPresses}
                  disabled={otherQualified.length === 0}
                  className="h-7 px-2.5 rounded-md text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Quote this same color + qty on every qualified press"
                  data-testid={`button-match-presses-${format}`}
                >
                  Match across presses
                </button>
                <Popover
                  open={addEstimateOpen}
                  onOpenChange={(o) => {
                    setAddEstimateOpen(o);
                    if (!o) resetAddEstimatePopover();
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="h-7 px-2.5 rounded-md text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                      data-testid={`button-add-estimate-${format}`}
                    >
                      <Plus className="w-3 h-3" />
                      Add Estimate
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="w-64 p-2 bg-white border-slate-200"
                  >
                    {pendingPressId === null ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            addQuoteSamePress();
                            setAddEstimateOpen(false);
                          }}
                          className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-slate-50"
                          data-testid={`button-add-estimate-same-press-${format}`}
                        >
                          Another quantity on this press
                        </button>
                        {otherQualified.length > 0 && (
                          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold px-2 pt-2 pb-1">
                            Another press
                          </div>
                        )}
                        {otherQualified.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => beginAddOnPress(p.id)}
                            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-slate-50 flex items-center gap-2"
                            data-testid={`button-add-estimate-press-${format}-${p.id}`}
                          >
                            {p.logoUrl ? (
                              <img
                                src={p.logoUrl}
                                alt=""
                                className="w-4 h-4 object-contain"
                              />
                            ) : (
                              <span
                                className="w-4 h-4 rounded bg-slate-200"
                                aria-hidden
                              />
                            )}
                            <span className="flex-1 truncate">{p.name}</span>
                          </button>
                        ))}
                      </>
                    ) : (
                      (() => {
                        const press = pressById.get(pendingPressId);
                        const fr = pendingPressCatalog?.formats.find(
                          (f) => f.format === format,
                        );
                        const tier = fr
                          ? fr.tiers.find(
                              (t) => t.name === pickedTier?.name,
                            ) ?? fr.tiers[0]
                          : null;
                        const rungs = tier
                          ? [...tier.priceLadder]
                              .filter((r) => r.confirmed !== false)
                              .map((r) => r.qty)
                              .sort((a, b) => a - b)
                          : [];
                        return (
                          <>
                            <div className="flex items-center gap-2 px-2 pb-1 pt-0.5">
                              <button
                                type="button"
                                onClick={resetAddEstimatePopover}
                                className="text-xs text-slate-400 hover:text-slate-700"
                                data-testid={`button-add-estimate-back-${format}`}
                              >
                                ← Back
                              </button>
                              <span className="text-xs font-medium text-slate-900 truncate">
                                {press?.name ?? "Press"}
                              </span>
                            </div>
                            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold px-2 pt-1 pb-1">
                              Pick a quantity
                            </div>
                            {pendingPressLoading ? (
                              <div className="text-xs text-slate-400 px-2 py-1.5">
                                Loading catalog…
                              </div>
                            ) : !pendingPressCatalog || !tier ? (
                              <div className="text-xs text-slate-400 px-2 py-1.5">
                                {`No ${ALBUM_FORMAT_LABEL[format]} tier on this press.`}
                              </div>
                            ) : (
                              <div className="max-h-48 overflow-auto">
                                {rungs.map((q) => (
                                  <button
                                    key={q}
                                    type="button"
                                    onClick={() => {
                                      addQuoteOnPressWithQty(
                                        pendingPressId,
                                        pendingPressCatalog,
                                        q,
                                      );
                                      setAddEstimateOpen(false);
                                      resetAddEstimatePopover();
                                    }}
                                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-slate-50 tabular-nums"
                                    data-testid={`button-add-estimate-qty-${format}-${pendingPressId}-${q}`}
                                  >
                                    {q.toLocaleString()} pcs
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-2">
              {renderQuote({
                key: "primary",
                press: comparisonAnchorPress,
                tierName: pickedTier.name,
                colorName: primaryColorName,
                qty: parsedQty,
                mfgCents: primaryMfgCents,
                isPinned: true,
              })}
              {quoteRows.map((row) => {
                const r = resolveQuoteRow(row);
                const qtyOptions = r.tier
                  ? r.tier.priceLadder
                      .filter((p) => p.confirmed !== false)
                      .map((p) => p.qty)
                      .sort((a, b) => a - b)
                  : [];
                return renderQuote({
                  key: row.id,
                  press: r.press,
                  tierName: r.tier?.name ?? row.tierName,
                  colorName: r.color?.name ?? row.colorName,
                  qty: r.snappedQty,
                  mfgCents: r.mfgCents,
                  matched: !!row.matched,
                  needsCatalog: r.needsCatalog,
                  qtyOptions,
                  pressOptions: qualifiedPresses,
                  colorOptions: r.tier?.colors ?? [],
                  onChangeQty: (q) => updateQuoteRowQty(row.id, q),
                  onChangePress: (pid) => {
                    void updateQuoteRowPress(row.id, pid);
                  },
                  onChangeColor: (name) => updateQuoteRowColor(row.id, name),
                  onDuplicate: () => duplicateQuoteRow(row.id),
                  onDelete: () => deleteQuoteRow(row.id),
                });
              })}
            </div>
            {matchNotes.length > 0 && (
              <div
                className="mt-2 text-xs text-slate-500 space-y-0.5"
                data-testid={`text-match-notes-${format}`}
              >
                <div className="font-medium text-slate-600">
                  Couldn't match:
                </div>
                {matchNotes.map((n, i) => (
                  <div key={i}>
                    · {n.pressName} — {n.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Task #646 — re-open the locked wrapper so the OPTIONAL
          upsells below (GoodDeed / Booklet pills) keep the same
          partner-lock behavior they had before the Quote-Rows split.
          The existing closing </div> downstream balances this open. */}
      <div
        className={isLocked ? "pointer-events-none opacity-60" : "contents"}
        aria-disabled={isLocked || undefined}
      >
      {/* Task #393 — OPTIONAL section: GoodDeed certificate pill.
          Full-width, collapsible, mirrors the AddonForm save shape but
          adds a percentage-of-vinyl-qty picker, inline cert preview,
          and per-vendor cost breakdown via the existing
          /gooddeed-pricing-preview endpoint. Vendor pricing edits keep
          working post-sale (see memory: vendor-pricing-bypasses-post-
          sale-lock) — only the fan-facing price/min/qty inside the
          pill respect the partner-permissions edit_metadata lock. */}
      <div className="flex items-center gap-2 mt-5 mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Optional · Add-ons
        </span>
        <span className="flex-1 h-px bg-slate-200" aria-hidden />
      </div>
      {/* Task #708 — the upsell tiles lay side-by-side in a responsive
          row (1-up on narrow widths, up to 3-across on sm+). Only the
          eligible tiles render, so a row can show fewer than 3. Each tile
          owns its compact summary; clicking it ring-highlights the tile
          and portals its full editor into `upsellBodyEl` below the row,
          enforcing one-open-at-a-time via `openUpsell`. No pricing/save/
          eligibility math changed — the pills are unchanged internally,
          only their chrome + placement moved. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {albumId && onSaveAddon && isPrimaryGoodDeed ? (
          <GoodDeedPill
            albumId={albumId}
            artworkUrl={artworkUrl}
            albumTitle={(displayNameStr.trim() || albumTitle) ?? ""}
            artistName={artistName ?? ""}
            artistPhotoUrl={artistPhotoUrl ?? null}
            vinylQty={parsedQty}
            existing={signedAddon ?? null}
            livePlatformCostCents={livePlatformCostCents ?? null}
            onSave={onSaveAddon}
            onEditArtwork={onEditArtwork}
            open={openUpsell === "gooddeed"}
            onToggle={() =>
              setOpenUpsell((k) => (k === "gooddeed" ? null : "gooddeed"))
            }
            bodyContainer={upsellBodyEl}
            onSignalChange={setGoodDeedSignal}
          />
        ) : null}
        {/* Task #579 — Booklet pill. Anchors to the first booklet-eligible
            SKU row (7" vinyl or cassette) so only one is rendered per
            album, mirroring the isPrimaryVinyl gate on GoodDeedPill. */}
        {albumId && onSaveBookletAddon && isBookletAnchor ? (
          <BookletPill
            albumId={albumId}
            existing={bookletAddon ?? null}
            onSave={onSaveBookletAddon}
            open={openUpsell === "booklet"}
            onToggle={() =>
              setOpenUpsell((k) => (k === "booklet" ? null : "booklet"))
            }
            bodyContainer={upsellBodyEl}
            // Task #793 — the booklet is an either/or VARIANT only on the
            // 7" single. The bundle cost is the 7" vinyl unit cost (mfg +
            // publishing + GoodTunes, NO standalone CC fee — one charge
            // carries one CC fee) so the pill can show an honest profit.
            bundleEligible={format === "7_inch"}
            anchorVinylCostCents={
              format === "7_inch" && breakdown && effectiveManufacturingCents !== null
                ? effectiveManufacturingCents +
                  breakdown.publishingCents +
                  breakdown.goodtunesCents
                : null
            }
            anchorVinylPriceCents={format === "7_inch" ? priceCents : null}
          />
        ) : null}
        {/* Task #687 — Add-on menu completeness. The full upsell menu on a
            vinyl release is: signed GoodDeed, 7×7 booklet, and CD. GoodDeed
            and the booklet (where a 7" / cassette SKU exists) are live +
            priced. The two placeholders below fill the gaps so the menu
            reads the same across every manufacturer — only pricing
            availability varies by press:
              · Booklet on a vinyl release with no booklet-eligible SKU
                (e.g. 12"-only) → "request a quote".
              · CD on any vinyl release (no press quotes the CD add-on yet)
                → "request a quote".
            Both are display-only — they don't persist or touch totals, so
            the math is unaffected until a press confirms numbers. */}
        {albumId && isPrimaryVinyl && !bookletEligibleExists ? (
          <AddonQuotePill
            icon={BookOpen}
            title="7×7 Booklet"
            description="A 7.125″ × 7.125″, 16-page full-colour booklet tucked in with the record. Priced today on 7″ / cassette releases (PMP, MRP); ask the press for a quote on this format."
            testKey="booklet-quote"
            open={openUpsell === "booklet-quote"}
            onToggle={() =>
              setOpenUpsell((k) =>
                k === "booklet-quote" ? null : "booklet-quote",
              )
            }
            bodyContainer={upsellBodyEl}
          />
        ) : null}
        {albumId && isPrimaryVinyl ? (
          <AddonQuotePill
            icon={Disc3}
            title="CD"
            description="A pressed CD shipped alongside the vinyl. No manufacturer has confirmed CD add-on pricing yet — surfaced here so the team remembers to ask each press, ready to wire up once numbers come back."
            testKey="cd-quote"
            open={openUpsell === "cd-quote"}
            onToggle={() =>
              setOpenUpsell((k) => (k === "cd-quote" ? null : "cd-quote"))
            }
            bodyContainer={upsellBodyEl}
          />
        ) : null}
        {/* Task #987 — inline Custom (non-profit) add-on tile. Opens its
            own modal dialog (not the portal body), pre-scoped to this
            album's primary artist. */}
        {albumId && isPrimaryVinyl ? (
          <CustomAddonInlineTile
            artistName={artistName}
            primaryArtistId={primaryArtistId}
          />
        ) : null}
      </div>
      {/* Task #708 — open tile's editor portals here, below the row. */}
      <div
        ref={setUpsellBodyEl}
        className="empty:hidden mt-3"
        data-testid="container-upsell-body"
      />
      </div>
      </>
      ) : (
      <>
      <div className={["grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4"].join(" ")}>
        {/* Left column — Price / Cost / Profit */}
        {/* Task #859 — Cost (vendor stack) and Profit (platform margin)
            are operator-only; an `artist` partner sees the Price field
            and their Artist Net (in the estimates table / Total) but
            never the cost or margin rows. */}
        <div className="space-y-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            {isArtist ? "Price" : "Price · Cost · Profit"}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 text-xs">Price $</span>
            <input
              type="text"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              onKeyDown={handlePriceFieldKeyDown}
              placeholder="0.00"
              inputMode="decimal"
              className={`w-28 ${fieldClass}`}
              data-testid={`input-price-${format}`}
            />
          </div>

          {!isArtist && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 text-xs inline-flex items-center gap-1">
              Cost $
              {breakdown && (
                <CostTooltip
                  format={format}
                  breakdown={breakdown}
                  brokerDiscountPct={brokerDiscountPct}
                  isSuperAdmin={isSuperAdmin}
                />
              )}
              <span
                className={[
                  "text-xs",
                  breakdown?.needsQuote ? "text-[color:var(--brand-blue)]" : "text-slate-400",
                ].join(" ")}
                data-testid={`text-cost-source-${format}`}
              >
                ({usingCatalog
                  ? (breakdown?.usingSnapshot ? "locked · catalog" : "live · catalog")
                  : isVinyl
                    ? (breakdown?.needsQuote
                        ? "needs quote"
                        : breakdown?.source === "mrp-default"
                          ? "live · MRP default"
                          : breakdown?.usingSnapshot
                            ? "locked · Hellbender"
                            : "live · Hellbender")
                    : "placeholder"})
              </span>
            </span>
            <span
              className={[
                "w-28 text-right tabular-nums text-[13.5px]",
                breakdown?.needsQuote ? "text-[color:var(--brand-blue)]" : "text-slate-700",
              ].join(" ")}
              data-testid={`text-cost-${format}`}
            >
              {totalCostCents === null ? "—" : dollars(totalCostCents)}
            </span>
          </div>
          )}
          {/* Task #1311 — Non-vinyl cost note. Three states:
              1. Catalog covers this format (usingCatalog): suppress the
                 generic note; a needsQuote hint fires separately below.
              2. An invited press exists but its catalog doesn't cover this
                 format: tell the operator to switch to a capable plant.
              3. No invited press at all: show a soft placeholder note. */}
          {!isArtist && !isVinyl && !usingCatalog && (
            <div
              className="text-[11px] text-slate-400 leading-snug -mt-1.5"
              data-testid={`text-cost-nonvinyl-note-${format}`}
            >
              {invitedPressRow?.press && !catalogFormat
                ? `${invitedPressRow.press.name} doesn't press ${ALBUM_FORMAT_LABEL[format]} — set a ${ALBUM_FORMAT_LABEL[format]}-capable plant on the artist page to get a real cost.`
                : `Quoted manually — no plant with ${ALBUM_FORMAT_LABEL[format]} pricing is set yet.`}
            </div>
          )}
          {!isArtist && (isVinyl || usingCatalog) && breakdown?.needsQuote && (
            <div
              className="text-xs text-[color:var(--brand-blue)] leading-snug -mt-1.5"
              data-testid={`text-cost-needs-quote-${format}`}
            >
              {usingCatalog
                ? `No confirmed price rung for ${pickedTier?.name ?? "this tier"} at ${parsedQty.toLocaleString()} pcs on ${invitedPressItself?.name ?? "this press"} — manufacturing reads as $0 until the rung is confirmed in Admin → Presses.`
                : `No MRP rung for ${ALBUM_FORMAT_LABEL[format]} at ${parsedQty.toLocaleString()} pcs — confirm the rung in Admin → Presses → MRP so this format reads a real manufacturing cost.`}
            </div>
          )}

          {!isArtist && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 text-xs">
              Profit ${" "}
              <span className="text-slate-400 text-[11px]">Per unit sold</span>
            </span>
            <span
              className={[
                "w-28 text-right tabular-nums text-[13.5px] font-semibold",
                lossColor ? "text-[color:var(--brand-pink)]" : "text-slate-900",
              ].join(" ")}
              data-testid={`text-profit-${format}`}
            >
              {profitLabel}
            </span>
          </div>
          )}

          {/* Non-vinyl keeps the per-album Stock cap — vinyl drops it
              entirely per Task #385. */}
          {!isVinyl && (
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <span className="text-slate-400 text-[11.5px]">Stock</span>
              <input
                type="text"
                value={stockStr}
                onChange={(e) => setStockStr(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="∞"
                inputMode="numeric"
                className={`w-20 ${fieldClass} text-xs`}
                data-testid={`input-stock-${format}`}
              />
            </div>
          )}
        </div>

        {/* Right column — vinyl: Quantity dropdown + Estimated sold +
            Total. Non-vinyl keeps the legacy Sold radio + free-text
            qty + TBD branch (out of scope for Task #385).
            Task #1311 — non-vinyl formats with catalog pricing (e.g.
            MRP cassette) use the vinyl-style rung dropdown + estimates
            table so the operator can price different run sizes. */}
        {(isVinyl || usingCatalog) ? (
        <div className="space-y-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Quantity · Estimated sold · Total
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 text-xs">Quantity</span>
            {quantityRungs.length > 0 ? (
              <Select
                value={String(parsedQty)}
                onValueChange={(v) => setParsedQty(Number.parseInt(v, 10))}
              >
                <SelectTrigger
                  className="h-8 w-28 text-sm"
                  data-testid={`select-sku-quantity-${format}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white text-slate-900 border-slate-200">
                  {quantityRungs.map((q) => (
                    <SelectItem key={q} value={String(q)} data-testid={`option-sku-quantity-${format}-${q}`}>
                      {q.toLocaleString()} units
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <input
                type="text"
                value={String(parsedQty)}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value.replace(/[^0-9]/g, ""), 10);
                  if (Number.isFinite(n) && n > 0) setParsedQty(n);
                  else if (e.target.value === "") setParsedQty(0);
                }}
                inputMode="numeric"
                className={`w-24 ${fieldClass}`}
                data-testid={`input-sku-quantity-${format}`}
              />
            )}
          </div>

          {/* Task #642 — per-quantity Estimates table. Columns are the
              union of (a) saved plannedQuantities across this album,
              (b) ladder rungs bracketing Select Qty, (c) the current
              Select Qty. Renders when ≥2 columns; the single-column
              case falls through to the standalone Profit/Total below. */}
          {estimateTableRows.length > 1 && (
            <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2" data-testid={`table-sku-estimates-${format}`}>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
                Estimates by quantity
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs tabular-nums">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="text-left font-medium pb-1 pr-2">Qty</th>
                      {estimateTableRows.map((r) => (
                        <th
                          key={r.qty}
                          className={[
                            "text-right font-medium pb-1 px-2",
                            r.qty === parsedQty ? "text-[color:var(--brand-blue)]" : "",
                          ].join(" ")}
                        >
                          {r.qty.toLocaleString()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-slate-700">
                      <td className="text-left text-slate-500 py-1 pr-2">Artist Net</td>
                      {estimateTableRows.map((r) => (
                        <td
                          key={r.qty}
                          className={[
                            "text-right py-1 px-2",
                            r.qty === parsedQty ? "font-semibold text-slate-900" : "",
                          ].join(" ")}
                          data-testid={`text-sku-estimate-${format}-${r.qty}`}
                        >
                          {r.netCents === null ? (
                            <span className="text-[color:var(--brand-blue)]">
                              Needs quote
                            </span>
                          ) : (
                            signedDollars(r.netCents)
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Estimated sold — 25/50/75 chips + Custom number. */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-slate-500 text-xs">Estimated sold</span>
            <div
              className="inline-flex items-center gap-1.5"
              role="radiogroup"
              data-testid={`picker-sku-est-sold-${format}`}
            >
              {([25, 50, 75] as const).map((pct) => {
                const on = estPct === pct;
                return (
                  <button
                    key={pct}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setEstPct(pct)}
                    className={[
                      "h-7 rounded-full px-2.5 text-xs border transition-colors",
                      on
                        ? "border-[color:var(--brand-blue)] bg-[color:var(--brand-blue)]/10 text-[color:var(--brand-blue)]"
                        : "border-slate-200 text-slate-600 hover:border-slate-300",
                    ].join(" ")}
                    data-testid={`chip-sku-est-${format}-${pct}`}
                  >
                    {pct}%
                  </button>
                );
              })}
              <input
                type="text"
                value={estPct === "custom" ? estCustomStr : ""}
                placeholder="Custom"
                inputMode="numeric"
                onChange={(e) => {
                  setEstCustomStr(e.target.value.replace(/[^0-9]/g, ""));
                  if (estPct !== "custom") setEstPct("custom");
                }}
                onFocus={() => setEstPct("custom")}
                className={`w-20 ${fieldClass} text-xs`}
                data-testid={`input-sku-est-custom-${format}`}
              />
            </div>
          </div>

          {/* Task #642 — single-column fallback. When the Estimates
              table is rendering (≥2 columns), the per-rung Artist Net
              row already covers what these two lines were showing for
              one quantity, so we suppress them to avoid a duplicate
              single-column "Total" sitting underneath the multi-column
              table. The bare Estimated-sold caveat below still renders
              in both modes. */}
          {estimateTableRows.length <= 1 && (
            <>
              {/* Task #859 — platform profit-per-unit is operator-only. */}
              {!isArtist && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-slate-500 text-xs">
                  Profit ${" "}
                  <span className="text-slate-400 text-[11px]">Per unit sold</span>
                </span>
                <span
                  className={[
                    "w-28 text-right tabular-nums text-[13.5px]",
                    lossColor ? "text-[color:var(--brand-pink)]" : "text-slate-700",
                  ].join(" ")}
                  data-testid={`text-profit-echo-${format}`}
                >
                  {profitLabel}
                </span>
              </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500 text-xs">Total $</span>
                <span
                  className={[
                    "w-28 text-right tabular-nums text-[15px] font-semibold",
                    totalCents !== null && totalCents < 0
                      ? "text-[color:var(--brand-pink)]"
                      : "text-slate-900",
                  ].join(" ")}
                  data-testid={`text-total-${format}`}
                >
                  {totalCents === null
                    ? "—"
                    : totalCents < 0
                      ? `-${dollars(Math.abs(totalCents))}`
                      : dollars(totalCents)}
                </span>
              </div>
            </>
          )}

          {estimatedSold !== null && (
            <div
              className="text-[11.5px] text-slate-400 text-right"
              data-testid={`text-total-caveat-${format}`}
            >
              If {estPct === "custom" ? estimatedSold : `${estPct}%`} ({estimatedSold.toLocaleString()} {estimatedSold === 1 ? "unit" : "units"}) sell.
            </div>
          )}
        </div>
        ) : (
        <div className="space-y-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Sold · Profit · Total
          </div>
          <div
            className="flex flex-col gap-2"
            role="radiogroup"
            data-testid={`picker-sku-quantity-mode-${format}`}
          >
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name={`sku-qty-mode-${format}`}
                checked={qtyMode === "fixed"}
                onChange={() => setQtyMode("fixed")}
                className="h-4 w-4 text-[color:var(--brand-blue)] focus:ring-[color:var(--brand-blue)]"
                data-testid={`radio-sku-qty-fixed-${format}`}
              />
              <input
                type="text"
                value={qtyInput}
                onChange={(e) => {
                  setQtyInput(e.target.value);
                  if (qtyMode !== "fixed") setQtyMode("fixed");
                }}
                onFocus={() => setQtyMode("fixed")}
                disabled={qtyMode !== "fixed"}
                inputMode="numeric"
                className={`w-24 ${fieldClass} ${qtyMode !== "fixed" ? "opacity-50" : ""}`}
                data-testid={`input-sold-${format}`}
              />
              <span className="text-xs text-slate-500">units</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name={`sku-qty-mode-${format}`}
                checked={qtyMode === "unlimited"}
                onChange={() => setQtyMode("unlimited")}
                className="h-4 w-4 text-[color:var(--brand-blue)] focus:ring-[color:var(--brand-blue)]"
                data-testid={`radio-sku-qty-unlimited-${format}`}
              />
              <span className="text-sm text-slate-700">As many as will sell</span>
            </label>
          </div>

          {!isArtist && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-slate-500 text-xs">
              Profit ${" "}
              <span className="text-slate-400 text-[11px]">Per unit sold</span>
            </span>
            <span
              className={[
                "w-28 text-right tabular-nums text-[13.5px]",
                lossColor ? "text-[color:var(--brand-pink)]" : "text-slate-700",
              ].join(" ")}
              data-testid={`text-profit-echo-${format}`}
            >
              {profitLabel}
            </span>
          </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 text-xs">Total $</span>
            {qtyMode === "unlimited" ? (
              <span
                className="w-28 text-right tabular-nums text-[15px] font-semibold text-slate-400"
                data-testid={`text-total-tbd-${format}`}
              >
                TBD
              </span>
            ) : (
              <span
                className={[
                  "w-28 text-right tabular-nums text-[15px] font-semibold",
                  totalCents !== null && totalCents < 0
                    ? "text-[color:var(--brand-pink)]"
                    : "text-slate-900",
                ].join(" ")}
                data-testid={`text-total-${format}`}
              >
                {totalCents === null
                  ? "—"
                  : totalCents < 0
                    ? `-${dollars(Math.abs(totalCents))}`
                    : dollars(totalCents)}
              </span>
            )}
          </div>

          {qtyMode === "fixed" && legacyParsedQty !== null && (
            <div
              className="text-[11.5px] text-slate-400 text-right"
              data-testid={`text-total-caveat-${format}`}
            >
              Only if all {legacyParsedQty} sell.
            </div>
          )}
        </div>
        )}
      </div>
      </>
      ))}
      {/* Task #619 — confirm-bump modal. Two-step: operator clicks
          "Accept" in the inline preview, then this dialog spells out
          the per-unit margin delta and offers Cancel · Accept ·
          Accept & adjust price. The third action sets a flag the
          commitBump handler reads to focus the Price input on the
          new format row after the bump persists. */}
      {suggestedFormat && (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent data-testid="dialog-confirm-format-bump">
            <AlertDialogHeader>
              <AlertDialogTitle>
                Bump to {ALBUM_FORMAT_LABEL[suggestedFormat]}?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <div>
                    Switching from {ALBUM_FORMAT_LABEL[format]} to{" "}
                    {ALBUM_FORMAT_LABEL[suggestedFormat]} keeps the album's
                    runtime within per-side limits.
                  </div>
                  {totalCostCents != null && suggestedTotalCostCents != null && (
                    <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Current per-unit profit</span>
                        <span className="font-medium" data-testid="text-margin-before">
                          {(() => {
                            const p = parseDollars(priceStr);
                            return p != null ? dollars(p - totalCostCents) : "—";
                          })()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">New per-unit profit</span>
                        <span
                          className={`font-medium ${suggestedProfitCents != null && suggestedProfitCents < 0 ? "text-rose-700" : ""}`}
                          data-testid="text-margin-after"
                        >
                          {suggestedProfitCents != null ? dollars(suggestedProfitCents) : "—"}
                        </span>
                      </div>
                      {(() => {
                        const p = parseDollars(priceStr);
                        if (p == null || suggestedProfitCents == null) return null;
                        const delta = suggestedProfitCents - (p - totalCostCents);
                        const sign = delta >= 0 ? "+" : "−";
                        const cls = delta >= 0 ? "text-emerald-700" : "text-rose-700";
                        return (
                          <div className="flex justify-between border-t border-slate-200 pt-1">
                            <span className="text-slate-500">Delta</span>
                            <span className={`font-semibold ${cls}`}>
                              {sign}{dollars(Math.abs(delta))}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {suggestedPick && (suggestedPick.fellBackTier || suggestedPick.fellBackColor) && (
                    <div className="text-xs text-amber-800" data-testid="text-dialog-fallback">
                      The press doesn't offer your current{" "}
                      {suggestedPick.fellBackTier && suggestedPick.fellBackColor
                        ? "tier or color"
                        : suggestedPick.fellBackTier
                          ? "tier"
                          : "color"}{" "}
                      on {ALBUM_FORMAT_LABEL[suggestedFormat]} — using{" "}
                      <span className="font-medium">{suggestedPick.tier.name}</span>
                      {suggestedPick.color ? (
                        <>
                          {" "}/ <span className="font-medium">{suggestedPick.color.name}</span>
                        </>
                      ) : null}{" "}
                      instead.
                    </div>
                  )}
                  {suggestedProfitCents != null && suggestedProfitCents < 0 && (
                    <div className="text-xs text-rose-700">
                      Heads up: the new format costs more than the current price.
                      You'll want to raise the price.
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="bg-transparent border-0 hover:bg-slate-100"
                data-testid="button-cancel-bump"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  commitBump(false);
                }}
                className="bg-transparent text-slate-900 border border-slate-300 hover:bg-slate-50"
                data-testid="button-accept-bump"
              >
                Accept
              </AlertDialogAction>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  commitBump(true);
                }}
                data-testid="button-accept-bump-adjust-price"
              >
                Accept &amp; adjust price
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {/* Task #654 — "Change the physical format" modal. Lives at the
          row level so the album-jacket overlay icon can pop it. On
          confirm we adapt the row's *current* picks onto the target
          (carry color/jacket/qty/price where possible, snap to defaults
          otherwise), then ask the parent to swap. A toast spells out
          any adjustments so nothing changes silently. */}
      {onChangeFormat && (
        <ChangeFormatDialog
          open={changeFormatOpen}
          onOpenChange={setChangeFormatOpen}
          current={format}
          // Task #654 — only not-yet-configured formats are swap targets;
          // see swapTargets comment in the render block above.
          options={Array.from(
            new Set<AlbumFormat>([
              format,
              ...offeredFormats.filter((f) => !configuredFormats?.has(f)),
            ]),
          )}
          busy={swapBusy}
          onPick={(target) => {
            if (target === format) return;
            const cents = parseDollars(priceStr);
            // No price set yet (draft row mid-edit) — there's nothing
            // to persist on the new format, so fall back to the legacy
            // switch-format affordance (creates an empty draft).
            if (cents === null) {
              setChangeFormatOpen(false);
              onSwitchFormat(target);
              toast({
                title: `Format changed to ${ALBUM_FORMAT_LABEL[target]}`,
                description: "Set a price to lock in the new row.",
              });
              return;
            }
            const picks: SkuPicks = {
              vinylColorId,
              jacketUpgrade,
              pressTierId: pressTierId ?? null,
              pressColorId: pressColorId ?? null,
              plannedQuantity: parsedQty > 0 ? parsedQty : 0,
              priceCents: cents,
            };
            const result = adaptSkuToFormat({
              currentFormat: format,
              targetFormat: target,
              picks,
              fromCatalog: catalogFormat,
              toCatalog: catalogByFormat?.get(target) ?? null,
            });
            const adapted = result.next;
            onChangeFormat({
              target,
              changes: result.changes,
              body: {
                format: target,
                priceCents: cents,
                stock: existing?.stock ?? null,
                active,
                plannedQuantity:
                  adapted.plannedQuantity > 0 ? adapted.plannedQuantity : null,
                vinylColor: adapted.vinylColorId,
                jacketUpgrade: adapted.jacketUpgrade,
                pressTierId: adapted.pressTierId,
                pressColorId: adapted.pressColorId,
                displayName: displayNameStr.trim() ? displayNameStr.trim() : null,
                trackCount: effectiveTrackCount,
              },
            });
            // Parent mutation owns the success toast (after PUT/DELETE
            // resolves) so we never falsely confirm a failed swap.
            setChangeFormatOpen(false);
          }}
        />
      )}
    </div>
  );
}

// Task #218 — catalog-driven picker. Tier select (chips) + color
// swatch row, both driven by the invited press's catalog. Quantity
// lives in the existing "Sold" input above; the row above this one
// shows the snapped rung. We deliberately keep this minimal and
// data-dense (Apple-Music-ish chips) since most artists pick once
// and forget.
function CatalogPicksBlock({
  format,
  tiers,
  pickedTier,
  pickedColorId,
  onPickTier,
  onPickColor,
}: {
  format: AlbumFormat;
  tiers: CatalogTier[];
  pickedTier: CatalogTier;
  pickedColorId: string | null;
  onPickTier: (id: string) => void;
  onPickColor: (id: string) => void;
}) {
  return (
    <div
      className="mt-3 pt-3 border-t border-slate-100 space-y-3"
      data-testid={`catalog-picks-${format}`}
    >
      {/* Task #385 — Color "section" is now a shadcn Select (the
          mechanical linter forbids the native element, and a dropdown
          scales past the row width when a press publishes 5+ tiers). */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Color section</span>
        <Select value={pickedTier.id} onValueChange={(v) => onPickTier(v)}>
          <SelectTrigger
            className="h-8 w-56 text-sm"
            data-testid={`select-tier-${format}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white text-slate-900 border-slate-200">
            {tiers.map((t) => (
              <SelectItem key={t.id} value={t.id} data-testid={`option-tier-${format}-${t.id}`}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <div className="text-[10.5px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
          Color
        </div>
        {pickedTier.colors.length === 0 ? (
          <div className="text-xs text-slate-400">
            No colors set on this tier yet — ask the press to fill in their catalog.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pickedTier.colors.map((c) => {
              const on = c.id === pickedColorId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onPickColor(c.id)}
                  className={[
                    "inline-flex items-center gap-1.5 h-7 rounded-full pl-1 pr-2.5 border transition-colors",
                    on
                      ? "border-[color:var(--brand-blue)] bg-[color:var(--brand-blue)]/5"
                      : "border-slate-200 hover:border-slate-300",
                  ].join(" ")}
                  data-testid={`chip-color-${format}-${c.id}`}
                  title={c.name}
                >
                  <span
                    className="w-5 h-5 rounded-full border border-slate-200"
                    style={{ background: c.swatchHex ?? "#ccc" }}
                  />
                  <span className="text-xs text-slate-700">{c.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Task #579 — PMP 16-page booklet upsell. Mirrors GoodDeedPill's
// Retail / Qty / Profit / Total disclosure exactly so the row reads as
// part of the same "Optional · Upsells" family, but swaps the
// signed-cert preview for a square drag-and-drop artwork tile (booklet
// art is its own printed cover, NOT the album jacket — different trim,
// different file). Quantity is one of the four PMP rungs
// (500 / 1000 / 2000 / 5000) plus an Other input that snaps UP to the
// next rung in the live cost preview. Vendor cost stays editable
// post-sale (see memory: vendor-pricing-bypasses-post-sale-lock); only
// the fan-facing fields respect the partner-permissions lock.
// Task #687 — display-only "request a quote" placeholder for add-ons
// whose per-press pricing isn't wired yet (CD across every press today;
// the 7×7 booklet on a vinyl format no press has quoted, e.g. 12"). It
// keeps the add-on menu complete across manufacturers — the option
// always shows; only the pricing availability varies — so the team
// remembers to chase each press for numbers. Persists nothing and feeds
// no totals, so the per-format math is untouched until the placeholder
// is swapped for a real priced pill (see GoodDeedPill / BookletPill).
// The amber "TBD" treatment mirrors the catalog editor's unconfirmed-
// rung convention so "awaiting quote" reads the same everywhere.
/* Task #708 — Upsell tile header. Compact icon + title + status
   subtitle, styled to match the album Tracks tab's optional StatusBadge
   tiles (icon chip, brand-blue active ring, trailing chevron). The
   SkuRow upsell block lays these side-by-side in a responsive row;
   the open tile's editor body is portaled into a full-width panel
   below the row (UpsellPanelCard) so only one editor shows at a time
   while the whole row of tiles stays visible. */
function UpsellTile({
  icon: Icon,
  title,
  subtitle,
  active,
  onClick,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: React.ReactNode;
  active: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={active}
      className={[
        "group/card flex items-center gap-2.5 px-3 py-3 rounded-lg bg-white border text-left w-full min-h-[44px] transition-all relative focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]/40",
        active
          ? "border-[color:var(--brand-blue)] bg-[color:var(--brand-blue)]/5 ring-2 ring-[color:var(--brand-blue)]/30 hover:bg-[color:var(--brand-blue)]/5 hover:border-[color:var(--brand-blue)]"
          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
      ].join(" ")}
    >
      <span className="w-8 h-8 rounded-md inline-flex items-center justify-center flex-shrink-0 bg-[color:var(--brand-blue)]/10 text-[color:var(--brand-blue)]">
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-slate-900 truncate">
          {title}
        </div>
        {subtitle && (
          <div className="text-xs text-slate-500 leading-tight mt-0.5 truncate min-w-0">
            {subtitle}
          </div>
        )}
      </div>
      <ChevronDown
        className={[
          "w-4 h-4 text-slate-400 flex-shrink-0 transition-transform",
          active ? "rotate-180" : "",
        ].join(" ")}
      />
    </button>
  );
}

/* Task #708 — the expanded body for an open upsell tile. Brand-blue
   bordered card (mirrors the Tracks-tab ExpandedPanel "open" treatment)
   rendered below the tile row via a portal into the SkuRow's body
   container. */
function UpsellPanelCard({
  className,
  testId,
  children,
}: {
  className?: string;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "rounded-xl border border-[color:var(--brand-blue)]/50 bg-white shadow-sm p-4",
        className ?? "",
      ].join(" ")}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

function AddonQuotePill({
  icon,
  title,
  description,
  testKey,
  open,
  onToggle,
  bodyContainer,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  testKey: string;
  open: boolean;
  onToggle: () => void;
  bodyContainer: HTMLElement | null;
}) {
  return (
    <>
      <UpsellTile
        icon={icon}
        title={title}
        subtitle={
          <span data-testid={`text-${testKey}-summary`}>Request a quote</span>
        }
        active={open}
        onClick={onToggle}
        testId={`button-toggle-${testKey}-pill`}
      />
      {open && bodyContainer
        ? createPortal(
            <UpsellPanelCard
              className="space-y-3"
              testId={`pill-${testKey}`}
            >
              <p className="text-xs text-slate-500 leading-relaxed">
                {description}
              </p>
              <div
                className="flex items-center justify-between gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5"
                data-testid={`row-${testKey}-quote`}
              >
                <span className="text-xs font-medium text-amber-700">
                  Ask the press / request a quote
                </span>
                <span className="text-xs text-amber-600 tabular-nums">TBD</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                No manufacturer has confirmed pricing for this add-on yet, so it
                doesn't affect any totals. Once a press quotes it, this becomes a
                live, priced option.
              </p>
            </UpsellPanelCard>,
            bodyContainer,
          )
        : null}
    </>
  );
}

/* Task #987 — inline "Custom" add-on tile. Sits in the Add-ons row next
   to GoodDeed / Booklet / CD and opens the same create dialog used on the
   dedicated Custom add-ons page, pre-scoped to this album's primary
   artist. Creates and global-addon edits are super-admin only; Artist
   Admins can edit per-artist add-ons scoped to their own artist
   (server enforces the scope boundary regardless). */
function CustomAddonInlineTile({
  artistName,
  primaryArtistId,
}: {
  artistName?: string;
  primaryArtistId?: string | null;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  // Task #1002 — the add-on currently open for inline edit (null = none).
  const [editing, setEditing] = useState<CustomAddon | null>(null);
  const { data: roleInfo } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
  });
  const canCreate = roleInfo?.role === "super_admin";
  // An Artist Admin may edit a non-global add-on that is explicitly
  // scoped to their own artist. Super-admins can edit anything.
  const canEditAddon = (a: CustomAddon): boolean => {
    if (roleInfo?.role === "super_admin") return true;
    if (roleInfo?.role === "artist" && roleInfo.roleScopeId) {
      return (
        !a.appliesToAllArtists &&
        a.artists.some((p) => p.personId === roleInfo.roleScopeId)
      );
    }
    return false;
  };

  // Task #1002 — load every custom add-on so we can surface the ones that
  // apply to THIS album right on the Sell page (closing the feedback gap
  // where a freshly-saved add-on reverted to an unchanged-looking screen).
  // Same query key the create/edit dialog invalidates on save, so a save
  // refreshes this list immediately. Reads are open to any admin; only
  // super-admins can open the edit dialog (server enforces it regardless).
  const { data: allAddons = [] } = useQuery<CustomAddon[]>({
    queryKey: ["/api/admin/custom-addons"],
  });
  // Applicable = global (all-artists) add-ons + those attached to this
  // album's primary artist. The list endpoint already returns each
  // add-on's `artists` and `appliesToAllArtists`, so we filter client-side.
  const applicable = useMemo(
    () =>
      allAddons.filter(
        (a) =>
          a.appliesToAllArtists ||
          (!!primaryArtistId &&
            a.artists.some((p) => p.personId === primaryArtistId)),
      ),
    [allAddons, primaryArtistId],
  );

  return (
    <>
      {applicable.map((a) => (
        <UpsellTile
          key={a.id}
          icon={Gift}
          title={a.name}
          subtitle={
            <span data-testid={`text-custom-addon-applies-${a.id}`}>
              {a.orgName} · {dollars(a.priceCents)}
              {a.active ? "" : " · inactive"}
            </span>
          }
          active={editing?.id === a.id}
          onClick={() => {
            if (!canEditAddon(a)) {
              toast({
                title: "Super-admin only",
                description: a.appliesToAllArtists
                  ? "Global non-profit add-ons can only be edited by a super-admin. Ask one to change it for you."
                  : "Custom non-profit add-ons can only be edited by a super-admin. Ask one to change it for you.",
              });
              return;
            }
            setEditing(a);
          }}
          testId={`button-edit-custom-addon-${a.id}`}
        />
      ))}
      <UpsellTile
        icon={Gift}
        title="Custom"
        subtitle={
          <span data-testid="text-custom-addon-tile-summary">
            Non-profit add-on
          </span>
        }
        active={open}
        onClick={() => {
          if (!canCreate) {
            toast({
              title: "Super-admin only",
              description:
                "Custom non-profit add-ons can only be created by a super-admin. Ask one to add it for you.",
            });
            return;
          }
          setOpen(true);
        }}
        testId="button-toggle-custom-addon-tile"
      />
      {/* Task #1002 — when no primary artist is linked, a "just this
          artist" add-on has nothing to attach to, so only all-artists
          add-ons can ever surface here. Spell that out so the operator
          isn't left wondering why a per-artist add-on never appears. */}
      {!primaryArtistId ? (
        <p
          className="sm:col-span-3 text-xs text-slate-400 leading-relaxed"
          data-testid="note-custom-addon-no-artist"
        >
          This release has no primary artist linked, so a “just this artist”
          add-on can’t be scoped here — only add-ons set to apply to all
          artists will show. Link a primary artist to attach one to them.
        </p>
      ) : null}
      {canCreate && (
        <AddonDialog
          mode="create"
          open={open}
          onOpenChange={setOpen}
          inline
          albumArtist={{
            personId: primaryArtistId ?? null,
            name: artistName ?? "this artist",
          }}
        />
      )}
      {!!editing && (
        <AddonDialog
          mode="edit"
          addon={editing}
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </>
  );
}

function BookletPill({
  albumId,
  existing,
  onSave,
  open,
  onToggle,
  bodyContainer,
  bundleEligible,
  anchorVinylCostCents,
  anchorVinylPriceCents,
}: {
  albumId: string;
  existing: AlbumAddon | null;
  onSave: (b: {
    priceCents: number;
    active: boolean;
    minPriceCents: number;
    plannedQuantity: number | null;
    artworkUrl?: string | null;
    bundlePriceCents?: number | null;
  }) => void;
  open: boolean;
  onToggle: () => void;
  bodyContainer: HTMLElement | null;
  // Task #793 — when the booklet anchor is the 7" single, the booklet is
  // sold as an either/or VARIANT ("7\" + booklet") at a flat set price.
  // `anchorVinylCostCents` is the 7" per-unit cost (mfg + publishing +
  // GoodTunes, EXCLUDING the standalone CC fee — the bundle is one
  // charge so it carries a single CC fee); `anchorVinylPriceCents` is
  // the 7"-alone retail used for the legacy summed-price hint. Both
  // null on a cassette anchor, where the booklet stays a stacked add-on.
  bundleEligible?: boolean;
  anchorVinylCostCents?: number | null;
  anchorVinylPriceCents?: number | null;
}) {
  const { toast } = useToast();
  const [active, setActive] = useState(existing?.active ?? false);
  const [priceStr, setPriceStr] = useState(
    existing ? (existing.priceCents / 100).toFixed(2) : "9.99",
  );
  const [floorStr, setFloorStr] = useState(
    existing ? (existing.minPriceCents / 100).toFixed(2) : "4.99",
  );
  // Task #793 — flat "7\" + booklet" set price (booklet anchor on a 7"
  // only). A FRESH addon defaults to $25 (the spec'd bundle price); an
  // EXISTING addon shows its stored bundle price; a LEGACY existing addon
  // (no stored bundle price) shows the 7"-alone + booklet sum so the
  // operator sees today's fan-facing price. We must NOT persist that
  // synthetic value unless the operator actually edits the field — else
  // unrelated saves (artwork / active / qty) would silently re-price a
  // legacy album to $25. `bundleTouched` gates persistence.
  const isLegacyBundle = !!existing && existing.bundlePriceCents == null;
  const [bundleStr, setBundleStr] = useState(
    existing?.bundlePriceCents != null
      ? (existing.bundlePriceCents / 100).toFixed(2)
      : "25.00",
  );
  const [bundleTouched, setBundleTouched] = useState(false);
  // Legacy display: once the 7" anchor price is known, show the real
  // fan-facing with-booklet sum for a legacy row (until the operator
  // edits it). Programmatic — never flips `bundleTouched`.
  useEffect(() => {
    if (bundleTouched || !isLegacyBundle) return;
    if (anchorVinylPriceCents == null || !existing) return;
    setBundleStr(((anchorVinylPriceCents + existing.priceCents) / 100).toFixed(2));
  }, [bundleTouched, isLegacyBundle, anchorVinylPriceCents, existing]);
  // What to send for bundlePriceCents on ANY save path:
  //  · not a 7" anchor    → undefined (column irrelevant)
  //  · operator edited it → the typed value (explicit null clears it)
  //  · legacy, untouched  → undefined (leave NULL → fan keeps sku+addon)
  //  · fresh / explicit   → current value ($25 default or stored price)
  const bundlePriceForSave: number | null | undefined = !bundleEligible
    ? undefined
    : bundleTouched
      ? parseDollars(bundleStr) ?? null
      : isLegacyBundle
        ? undefined
        : parseDollars(bundleStr) ?? null;
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  // Quantity snaps to a per-vendor rung. "other" lets the operator
  // type a custom planned-run, which the server snaps UP to the next
  // rung anyway — we surface the snapped value live via the preview
  // query. Task #625 — MRP only quotes 500 / 1000 / 2000; PMP also
  // has a 5000 rung. We render both rungs unconditionally; the server
  // snaps any too-high pick down to the vendor's top rung.
  const RUNGS = [500, 1000, 2000, 5000] as const;
  const initialQtyChoice = useMemo<string>(() => {
    const q = existing?.plannedQuantity ?? null;
    if (!q) return "500";
    if (RUNGS.includes(q as any)) return String(q);
    return "other";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [qtyChoice, setQtyChoice] = useState<string>(initialQtyChoice);
  const [otherQtyStr, setOtherQtyStr] = useState(
    initialQtyChoice === "other" && existing?.plannedQuantity
      ? String(existing.plannedQuantity)
      : "500",
  );
  const resolvedQty =
    qtyChoice === "other"
      ? Math.max(1, parseInt(otherQtyStr.replace(/[^0-9]/g, ""), 10) || 0)
      : parseInt(qtyChoice, 10);

  // Live booklet tier preview — mirrors the GoodDeedPill query shape
  // so costCents has the same `totalPerUnitCents` field to read from.
  // Task #625 — preview also returns vendorDomain/vendorLabel so the
  // copy below ("Add 16-Page Booklet (PMP)", "PMP Wholesale", trim
  // hints) routes by the album's invited press instead of hard-coding
  // PMP for every release.
  const { data: preview } = useQuery<{
    snappedQty: number;
    totalPerUnitCents: number;
    runTotalCents: number;
    vendorDomain: string;
    vendorLabel: string;
    bookletSpec?: string;
  }>({
    queryKey: ["/api/admin/albums", albumId, "booklet-pricing-preview", resolvedQty],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/admin/albums/${albumId}/booklet-pricing-preview?runQty=${Math.max(1, resolvedQty)}`,
      );
      return r.json();
    },
    enabled: open,
  });

  // Artwork — drag/drop or click-to-pick. Optimistic preview URL until
  // the upload returns the persisted /objects/uploads/<id> path; then
  // we PUT the addon with the new artworkUrl so the BuySheet thumbnail
  // updates on next buy-options fetch.
  const [artworkUrl, setArtworkUrl] = useState<string | null>(existing?.artworkUrl ?? null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const objectUrl = URL.createObjectURL(file);
      setArtworkUrl(objectUrl);
      const url = await uploadAdminImage(file);
      return url;
    },
    onSuccess: (url) => {
      setArtworkUrl(url);
      // Persist immediately — the artwork edit shouldn't have to wait
      // for the debounced autosave below (operator could navigate away).
      onSave({
        priceCents: parseDollars(priceStr) ?? 0,
        active,
        minPriceCents: parseDollars(floorStr) ?? 0,
        plannedQuantity: resolvedQty > 0 ? resolvedQty : null,
        artworkUrl: url,
        bundlePriceCents: bundlePriceForSave,
      });
      toast({ title: "Booklet artwork uploaded" });
    },
    onError: (e: any) => {
      setArtworkUrl(existing?.artworkUrl ?? null);
      toast({
        title: "Couldn't upload artwork",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });
  const removeArtwork = () => {
    setArtworkUrl(null);
    onSave({
      priceCents: parseDollars(priceStr) ?? 0,
      active,
      minPriceCents: parseDollars(floorStr) ?? 0,
      plannedQuantity: resolvedQty > 0 ? resolvedQty : null,
      artworkUrl: null,
      bundlePriceCents: bundlePriceForSave,
    });
  };

  const priceCents = useMemo(() => parseDollars(priceStr), [priceStr]);
  const costCents: number | null =
    preview?.totalPerUnitCents ?? existing?.costCentsSnapshot ?? null;
  const ccFeeCents =
    priceCents !== null ? Math.round(priceCents * 0.029) + 30 : null;
  const costPerUnitCents =
    costCents !== null && ccFeeCents !== null ? costCents + ccFeeCents : costCents;
  const netPerUnitCents =
    priceCents !== null && costCents !== null && ccFeeCents !== null
      ? priceCents - costCents - ccFeeCents
      : null;
  const canComputeNet = netPerUnitCents !== null;
  const netTotalCents = canComputeNet ? netPerUnitCents! * resolvedQty : null;
  const grossTotalCents = priceCents !== null ? priceCents * resolvedQty : null;
  const totalCents = netTotalCents ?? grossTotalCents;
  const totalIsLoss = netTotalCents !== null && netTotalCents < 0;
  const totalLabel =
    totalCents === null
      ? "—"
      : totalIsLoss
        ? `-${dollars(Math.abs(totalCents))}`
        : dollars(totalCents);
  const lossColor = netPerUnitCents !== null && netPerUnitCents < 0;
  const profitLabel =
    netPerUnitCents === null
      ? "—"
      : netPerUnitCents < 0
        ? `-${dollars(Math.abs(netPerUnitCents))}`
        : dollars(netPerUnitCents);

  // Task #793 — "7\" + booklet" bundle profit (anchor on a 7" only). The
  // set price is one charge, so it carries a single CC fee; the cost is
  // the 7" vinyl unit cost (mfg + publishing + GoodTunes, no standalone
  // CC fee) plus the booklet wholesale unit cost.
  const bundleCents = useMemo(() => parseDollars(bundleStr), [bundleStr]);
  const bundleCcFeeCents =
    bundleCents !== null ? Math.round(bundleCents * 0.029) + 30 : null;
  const bundleVinylCostCents = anchorVinylCostCents ?? null;
  const bundleCostCents =
    bundleVinylCostCents !== null && costCents !== null
      ? bundleVinylCostCents + costCents
      : null;
  const bundleNetCents =
    bundleCents !== null && bundleCostCents !== null && bundleCcFeeCents !== null
      ? bundleCents - bundleCostCents - bundleCcFeeCents
      : null;
  const bundleLoss = bundleNetCents !== null && bundleNetCents < 0;
  const bundleProfitLabel =
    bundleNetCents === null
      ? "—"
      : bundleLoss
        ? `-${dollars(Math.abs(bundleNetCents))}`
        : dollars(bundleNetCents);

  const storedActive = existing?.active ?? false;
  const storedPrice = existing ? (existing.priceCents / 100).toFixed(2) : "9.99";
  const storedFloor = existing ? (existing.minPriceCents / 100).toFixed(2) : "4.99";
  const storedQty = existing?.plannedQuantity ?? null;
  // Track real operator interaction so we don't autosave a no-op on
  // mount. Without an `existing` addon, the local defaults
  // (resolvedQty=500, price/floor strings) don't match the null/empty
  // stored values, so `dirty` would flip true immediately and the
  // debounced PUT below would fire — which previously surfaced a
  // bogus "Add a 7\" vinyl or cassette SKU…" 409 toast on a passive
  // Design-tab visit.
  const [touched, setTouched] = useState(false);
  const dirty =
    touched &&
    (active !== storedActive ||
      priceStr !== storedPrice ||
      floorStr !== storedFloor ||
      (bundleEligible && bundleTouched) ||
      (resolvedQty || null) !== storedQty);
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      const cents = parseDollars(priceStr);
      if (cents === null) return;
      onSave({
        priceCents: cents,
        active,
        minPriceCents: parseDollars(floorStr) ?? 0,
        plannedQuantity: resolvedQty > 0 ? resolvedQty : null,
        // Task #793 — persist the set bundle price on a 7" anchor.
        bundlePriceCents: bundlePriceForSave,
        // Don't re-send artworkUrl here — upload/remove mutations own
        // that field. Sending null on every debounce would clobber an
        // in-flight upload.
      });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, priceStr, floorStr, bundleStr, active, resolvedQty]);

  const snappedQty = preview?.snappedQty ?? resolvedQty;
  const qtyDisplay =
    qtyChoice === "other"
      ? `${resolvedQty.toLocaleString()} (snaps to ${snappedQty.toLocaleString()})`
      : `${resolvedQty.toLocaleString()}`;
  const summary = `${active ? "On" : "Off"} · ${qtyDisplay}`;

  const handleFiles = (files: FileList | null) => {
    if (!files?.[0]) return;
    upload.mutate(files[0]);
  };

  return (
    <>
      <UpsellTile
        icon={BookOpen}
        title="16-Page Booklet"
        subtitle={
          <span data-testid="text-booklet-summary">{summary}</span>
        }
        active={open}
        onClick={onToggle}
        testId="button-toggle-booklet-pill"
      />
      {open && bodyContainer ? (
        createPortal(
          <UpsellPanelCard className="space-y-4" testId="pill-booklet">
          <div
            className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2.5"
            data-testid="row-booklet-enable"
          >
            <Switch
              id="toggle-booklet-active"
              checked={active}
              onCheckedChange={(v) => {
                setTouched(true);
                setActive(v);
              }}
              data-testid="toggle-booklet-active"
              aria-label="Offer 16-page booklet on this release"
            />
            <label
              htmlFor="toggle-booklet-active"
              className="text-sm font-medium text-slate-900 cursor-pointer select-none"
            >
              Add 16-Page Booklet{preview?.vendorLabel ? ` (${preview.vendorLabel})` : ""}
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 items-start">
            {/* LEFT — square drag/drop artwork tile. NOT the album
                jacket: PMP prints 7.125"×7.125" on 100# gloss, so this
                file is its own upload. Pencil overlay on hover/touch
                mirrors the GoodDeed cert tile's affordance; trash
                button clears artworkUrl. */}
            <div>
              <div
                className={[
                  "relative w-full aspect-square rounded-md border-2 border-dashed bg-slate-50 overflow-hidden transition-colors",
                  dragging
                    ? "border-[color:var(--brand-blue)] bg-[color:var(--brand-blue)]/5"
                    : "border-slate-300",
                ].join(" ")}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleFiles(e.dataTransfer.files);
                }}
                data-testid="dropzone-booklet-artwork"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => handleFiles(e.target.files)}
                  data-testid="input-booklet-artwork-file"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label={artworkUrl ? "Replace booklet artwork" : "Upload booklet artwork"}
                  className="group absolute inset-0 w-full h-full focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]/40"
                  data-testid="button-booklet-edit-artwork"
                >
                  {artworkUrl ? (
                    <>
                      <img
                        src={artworkUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        data-testid="img-booklet-preview"
                      />
                      <span
                        className="absolute inset-0 bg-black/0 group-hover:bg-black/40 group-focus-visible:bg-black/40 [@media(hover:none)]:bg-black/30 transition-colors pointer-events-none"
                        aria-hidden
                      />
                      <span
                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity pointer-events-none"
                        aria-hidden
                      >
                        <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 inline-flex items-center justify-center shadow-lg ring-1 ring-black/5">
                          <Pencil className="w-4 h-4" />
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-500">
                      <Pencil className="w-5 h-5" aria-hidden />
                      <span className="text-xs font-medium">
                        Drop booklet art
                      </span>
                      <span className="text-xs text-slate-400">
                        7.125&quot; × 7.125&quot;, 4/4
                      </span>
                    </span>
                  )}
                </button>
                {artworkUrl && (
                  <IconButton
                    label="Remove booklet artwork"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeArtwork();
                    }}
                    variant="ghost"
                    size="md"
                    className="absolute top-2 right-2 !w-8 !h-8 !bg-white/90 hover:!bg-white !text-slate-700 shadow-md ring-1 ring-black/5"
                    data-testid="button-booklet-remove-artwork"
                  >
                    <Trash2 />
                  </IconButton>
                )}
              </div>
              <div className="mt-2 text-xs text-slate-400 leading-snug">
                PMP prints 16 pages full-colour on 100# gloss text. Upload a
                single front-cover image — the interior pages get laid out
                from your album tracklist + liner notes before press time.
              </div>
            </div>

            {/* RIGHT — Retail / Qty / Profit / Total */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    Retail Price
                  </span>
                  <InfoTip
                    label="About retail price"
                    testId="info-booklet-price"
                    text="What fans pay per booklet add-on."
                  />
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-slate-400 text-sm leading-9">$</span>
                  <div className="flex flex-col">
                    <input
                      type="text"
                      value={priceStr}
                      onChange={(e) => {
                        setTouched(true);
                        setPriceStr(e.target.value);
                      }}
                      onKeyDown={handlePriceFieldKeyDown}
                      inputMode="decimal"
                      className={`${fieldClass} w-32 tabular-nums`}
                      data-testid="input-booklet-price"
                      aria-label="Retail price per booklet"
                    />
                    <div className="text-xs text-slate-400 mt-1">
                      Per unit sold to fans.
                    </div>
                  </div>
                </div>
              </div>

              {/* Task #793 — On a 7" single the booklet is an either/or
                  VARIANT, not a stacked add-on. The fan picks "7\" alone"
                  (the SKU price) or "7\" + booklet" at this flat set price.
                  Persisted as bundlePriceCents; profit nets the single
                  CC fee against the 7" vinyl cost + booklet cost. */}
              {bundleEligible && (
                <div data-testid="row-booklet-bundle">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                      With-Booklet Price
                    </span>
                    <InfoTip
                      label="About the with-booklet price"
                      testId="info-booklet-bundle"
                      text='The flat set price for the "7" + booklet" variant. Fans choose 7" alone or this — it replaces the SKU price, it does not stack on top.'
                    />
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-slate-400 text-sm leading-9">$</span>
                    <div className="flex flex-col">
                      <input
                        type="text"
                        value={bundleStr}
                        onChange={(e) => {
                          setTouched(true);
                          setBundleTouched(true);
                          setBundleStr(e.target.value);
                        }}
                        onKeyDown={handlePriceFieldKeyDown}
                        inputMode="decimal"
                        className={`${fieldClass} w-32 tabular-nums`}
                        data-testid="input-booklet-bundle-price"
                        aria-label="Set price for 7-inch plus booklet"
                      />
                      <div className="text-xs text-slate-400 mt-1">
                        {anchorVinylPriceCents != null
                          ? `Set price for 7" + booklet (7" alone is ${dollars(anchorVinylPriceCents)}).`
                          : 'Set price for the "7" + booklet" variant.'}
                      </div>
                      <div
                        className="flex items-center gap-1.5 text-xs mt-1.5 tabular-nums"
                        data-testid="row-booklet-bundle-profit"
                      >
                        <span className="text-slate-500">Bundle profit / unit</span>
                        <span
                          className={[
                            "font-semibold",
                            bundleLoss
                              ? "text-[color:var(--brand-pink)]"
                              : "text-slate-900",
                          ].join(" ")}
                          data-testid="text-booklet-bundle-profit"
                        >
                          {bundleProfitLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    Select Qty
                  </span>
                  <InfoTip
                    label="About booklet quantity"
                    testId="info-booklet-qty"
                    text={
                      preview?.vendorLabel === "MRP"
                        ? "MRP only quotes 500 / 1000 / 2000 runs. Anything else snaps UP to the next rung; over 2000 stays at the 2000 price."
                        : "PMP only quotes 500 / 1000 / 2000 / 5000 runs. Anything else snaps UP to the next rung."
                    }
                  />
                </div>
                <Select
                  value={qtyChoice}
                  onValueChange={(v) => {
                    setTouched(true);
                    setQtyChoice(v);
                  }}
                >
                  <SelectTrigger
                    className="h-8 w-full text-sm"
                    data-testid="select-booklet-qty"
                    aria-label={`Booklet run quantity — currently ${qtyDisplay}`}
                  >
                    <span className="truncate">{qtyDisplay}</span>
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900 border-slate-200">
                    <SelectItem value="500">500</SelectItem>
                    <SelectItem value="1000">1,000</SelectItem>
                    <SelectItem value="2000">2,000</SelectItem>
                    <SelectItem value="5000">5,000</SelectItem>
                    <SelectItem value="other">Other…</SelectItem>
                  </SelectContent>
                </Select>
                {qtyChoice === "other" && (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={otherQtyStr}
                    onChange={(e) => {
                      setTouched(true);
                      setOtherQtyStr(e.target.value);
                    }}
                    className={`${fieldClass} mt-1.5`}
                    placeholder="e.g. 750 → snaps to 1,000"
                    aria-label="Booklet run quantity (snaps up to next PMP rung)"
                    data-testid="input-booklet-other-qty"
                  />
                )}
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setBreakdownOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-2 py-1.5 -mx-1 px-1 rounded hover:bg-slate-50 transition-colors text-left"
                  aria-expanded={breakdownOpen}
                  data-testid="button-toggle-booklet-profit"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                      Profit
                    </span>
                    <span className="text-xs text-slate-400 truncate">
                      · Per unit sold
                    </span>
                    <ChevronDown
                      className={[
                        "w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0",
                        breakdownOpen ? "rotate-180" : "",
                      ].join(" ")}
                    />
                  </span>
                  <span
                    className={[
                      "text-sm font-semibold tabular-nums flex-shrink-0",
                      lossColor
                        ? "text-[color:var(--brand-pink)]"
                        : "text-slate-900",
                    ].join(" ")}
                    data-testid="text-booklet-profit"
                  >
                    {profitLabel}
                  </span>
                </button>
                {breakdownOpen && (
                  <div
                    className="mt-1 ml-1 pl-3 border-l border-slate-200 space-y-1.5 py-1"
                    data-testid="block-booklet-cost-breakdown"
                  >
                    {costCents !== null ? (
                      <>
                        <div className="flex items-center justify-between text-xs tabular-nums">
                          <span className="text-slate-600">
                            {preview?.vendorLabel ?? "PMP"} Wholesale ({snappedQty.toLocaleString()} run)
                          </span>
                          <span
                            className="text-slate-900"
                            data-testid="text-booklet-wholesale"
                          >
                            {dollars(costCents)}
                          </span>
                        </div>
                        <div
                          className="flex items-center justify-between text-xs tabular-nums"
                          data-testid="row-booklet-cc-fee"
                        >
                          <span className="text-slate-600">CC fee</span>
                          {ccFeeCents !== null ? (
                            <span
                              className="text-slate-900"
                              data-testid="text-booklet-cc-fee"
                            >
                              {dollars(ccFeeCents)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">
                              set retail price
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs font-semibold border-t border-slate-200 pt-1.5 mt-1 tabular-nums">
                          <span className="text-slate-700">Cost / unit</span>
                          <span
                            className="text-slate-900"
                            data-testid="text-booklet-cost-per-unit"
                          >
                            {dollars(costPerUnitCents!)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs tabular-nums pt-1">
                          <span className="text-slate-600">Floor</span>
                          <input
                            type="text"
                            value={floorStr}
                            onChange={(e) => {
                              setTouched(true);
                              setFloorStr(e.target.value);
                            }}
                            inputMode="decimal"
                            className={`${fieldClass} w-20 tabular-nums text-right`}
                            data-testid="input-booklet-floor"
                            aria-label="Minimum retail price (floor)"
                          />
                        </div>
                      </>
                    ) : (
                      <div
                        className="text-xs text-slate-400 italic"
                        data-testid="text-booklet-cost-unavailable"
                      >
                        Loading PMP pricing…
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 pt-3 mt-1">
                <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                  Total
                </span>
                <span
                  className={[
                    "text-base font-semibold tabular-nums",
                    totalIsLoss
                      ? "text-[color:var(--brand-pink)]"
                      : "text-slate-900",
                  ].join(" ")}
                  data-testid="text-booklet-total"
                >
                  {totalLabel}
                </span>
              </div>
            </div>
          </div>
          </UpsellPanelCard>,
          bodyContainer,
        )
      ) : null}
    </>
  );
}

// Task #758 / #985 — per-option GoodDeed profit card. Rendered under
// each pricing option column in SkuRow (primary + every duplicated
// option) when the GoodDeed cert is active. It is a read-only consumer
// of the signal lifted from GoodDeedPill: it applies the chosen attach
// ratio to THIS option's quantity, resolves the per-cert wholesale for
// that option's cert-run via the same gooddeed-pricing-preview endpoint
// the pill uses, and presents the run's profit the SAME way the vinyl
// block above does — a per-unit profit line plus a total profit line
// (Task #985 retired the old "Revenue"/"Net" wording). Below the card
// it shows a combined whole-run total (vinyl total profit + GoodDeed
// total profit) so the operator sees the run's full profit at a glance.
// The cost-resolution chain (preview ladder → snapshot → flat platform
// default) mirrors GoodDeedPill so the numbers never contradict the
// panel below. Losses render in brand pink; the combined total only
// appears when both halves can be computed.
function GoodDeedOptionCard({
  albumId,
  optionQty,
  ratio,
  priceCents,
  existing,
  livePlatformCostCents,
  vinylTotalCents,
  idSuffix,
}: {
  albumId: string;
  optionQty: number;
  ratio: number;
  priceCents: number;
  existing: AlbumAddon | null;
  livePlatformCostCents: number | null;
  vinylTotalCents: number | null;
  idSuffix: string;
}) {
  const certCount = Math.max(0, Math.round(optionQty * ratio));
  const pct = Math.round(ratio * 100);
  // Task #1023 — collapsed by default, matching the vinyl PROFIT
  // disclosure and the GoodDeedPill below. Expanding reveals the
  // per-cert cost breakdown.
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  // Per-option cost preview, keyed to THIS option's cert-run size so a
  // 100-cert run and a 200-cert run resolve their own tier rung.
  const { data: preview } = useQuery<any>({
    queryKey: [
      "/api/admin/albums",
      albumId,
      "gooddeed-pricing-preview",
      certCount || 1,
    ],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/admin/albums/${albumId}/gooddeed-pricing-preview?runQty=${Math.max(1, certCount)}`,
      );
      return r.json();
    },
    enabled: certCount > 0,
  });
  const previewCost = preview?.totalPerUnitCents ?? null;
  const hasPreviewLadder = previewCost != null && previewCost > 0;
  let costCents: number | null;
  if (hasPreviewLadder) {
    costCents = previewCost;
  } else if (existing?.costCentsSnapshot != null) {
    costCents = existing.costCentsSnapshot;
  } else if (livePlatformCostCents != null) {
    costCents = livePlatformCostCents;
  } else {
    costCents = null;
  }
  // CC fee matches GoodDeedPill: Stripe's flat US rate (2.9% + 30¢) on
  // the cert retail.
  const ccFeeCents = Math.round(priceCents * 0.029) + 30;
  // Task #1023 — Cost/unit subtotal for the cost-breakdown disclosure:
  // per-cert wholesale (Manufacturing & Shipping) + the CC fee.
  const costPerUnitCents = costCents !== null ? costCents + ccFeeCents : null;
  const canComputeNet = costCents !== null;
  // Task #985 — present profit the way the vinyl block does: a per-unit
  // profit (per-cert net = retail − GoodDeed cost − CC fee) and a total
  // profit for the run. Same cost-resolution chain + CC-fee math the
  // pill uses, so these never drift from the GoodDeed pill below.
  const perUnitProfitCents = canComputeNet
    ? priceCents - costCents! - ccFeeCents
    : null;
  const netTotalCents =
    perUnitProfitCents !== null ? perUnitProfitCents * certCount : null;
  const perUnitIsLoss = perUnitProfitCents !== null && perUnitProfitCents < 0;
  const perUnitLabel =
    perUnitProfitCents === null
      ? "—"
      : perUnitIsLoss
        ? `-${dollars(Math.abs(perUnitProfitCents))}`
        : dollars(perUnitProfitCents);
  const netIsLoss = netTotalCents !== null && netTotalCents < 0;
  const netLabel =
    netTotalCents === null
      ? "—"
      : netIsLoss
        ? `-${dollars(Math.abs(netTotalCents))}`
        : dollars(netTotalCents);
  // Combined whole-run total = vinyl total profit (this option's own
  // Total) + GoodDeed total profit. Only shown when BOTH halves can be
  // computed, so it never contradicts a "—" net above.
  const combinedTotalCents =
    vinylTotalCents !== null && netTotalCents !== null
      ? vinylTotalCents + netTotalCents
      : null;
  const combinedIsLoss = combinedTotalCents !== null && combinedTotalCents < 0;
  const combinedLabel =
    combinedTotalCents === null
      ? "—"
      : combinedIsLoss
        ? `-${dollars(Math.abs(combinedTotalCents))}`
        : dollars(combinedTotalCents);
  return (
    <>
      <div
        className="rounded-md border border-slate-200 bg-slate-50/60 p-2.5 space-y-1.5"
        data-testid={`gooddeed-option-card-${idSuffix}`}
      >
        <div className="flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5 text-[color:var(--brand-purple)]" />
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
            GoodDeed
          </span>
        </div>
        <div
          className="text-xs text-slate-500 tabular-nums"
          data-testid={`text-gooddeed-option-certs-${idSuffix}`}
        >
          {pct}% · {certCount.toLocaleString()} of {optionQty.toLocaleString()}
        </div>
        {/* Task #1023 — PROFIT · Per unit sold is now a chevron
            disclosure (collapsed by default), matching the vinyl SkuRow
            and GoodDeedPill primitives. Expanding reveals the per-cert
            cost breakdown built from the values this card already
            derives: the Manufacturing & Shipping wholesale, the CC fee,
            and a Cost/unit subtotal. */}
        <div>
          <button
            type="button"
            onClick={() => setBreakdownOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-3 text-xs text-left -mx-1 px-1 py-0.5 rounded hover:bg-slate-100/70 transition-colors"
            aria-expanded={breakdownOpen}
            data-testid={`button-toggle-gooddeed-option-profit-${idSuffix}`}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-slate-600">
                Profit{" "}
                <span className="text-slate-400">Per unit sold</span>
              </span>
              <ChevronDown
                className={[
                  "w-3 h-3 text-slate-400 transition-transform flex-shrink-0",
                  breakdownOpen ? "rotate-180" : "",
                ].join(" ")}
              />
            </span>
            <span
              className={[
                "tabular-nums font-medium flex-shrink-0",
                perUnitIsLoss
                  ? "text-[color:var(--brand-pink)]"
                  : "text-slate-900",
              ].join(" ")}
              data-testid={`text-gooddeed-option-perunit-${idSuffix}`}
            >
              {perUnitLabel}
            </span>
          </button>
          {breakdownOpen && (
            <div
              className="mt-1 ml-1 pl-3 border-l border-slate-200 space-y-1.5 py-1"
              data-testid={`block-gooddeed-option-cost-breakdown-${idSuffix}`}
            >
              {costCents !== null ? (
                <>
                  <div className="flex items-center justify-between text-xs tabular-nums">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      Manufacturing &amp; Shipping
                      <InfoTip
                        label="What Manufacturing & Shipping covers"
                        testId={`info-gooddeed-option-manufacturing-${idSuffix}`}
                        text="Per-cert wholesale on the tiered ladder ($13 → $12 → $9 → $7 → $6 as the run grows). It covers print + hologram + shrinkwrap + insertion into the jacket and all three shipping legs (Hoover → artist for signing → Spinney for insertion → fulfillment). CC fee on the cert retail is the only other line."
                      />
                    </span>
                    <span
                      className="text-slate-900"
                      data-testid={`text-gooddeed-option-wholesale-${idSuffix}`}
                    >
                      {dollars(costCents)}
                    </span>
                  </div>
                  <div
                    className="flex items-center justify-between text-xs tabular-nums"
                    data-testid={`row-gooddeed-option-cc-fee-${idSuffix}`}
                  >
                    <span className="text-slate-600">CC fee</span>
                    <span
                      className="text-slate-900"
                      data-testid={`text-gooddeed-option-cc-fee-${idSuffix}`}
                    >
                      {dollars(ccFeeCents)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-semibold border-t border-slate-200 pt-1.5 mt-1 tabular-nums">
                    <span className="text-slate-700">Cost / unit</span>
                    <span
                      className="text-slate-900"
                      data-testid={`text-gooddeed-option-cost-per-unit-${idSuffix}`}
                    >
                      {dollars(costPerUnitCents!)}
                    </span>
                  </div>
                </>
              ) : (
                <div
                  className="text-xs text-slate-400 italic"
                  data-testid={`text-gooddeed-option-cost-unavailable-${idSuffix}`}
                >
                  Cost preview unavailable.
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-600">Total</span>
          <span
            className={[
              "tabular-nums font-semibold",
              netIsLoss
                ? "text-[color:var(--brand-pink)]"
                : "text-slate-900",
            ].join(" ")}
            data-testid={`text-gooddeed-option-net-${idSuffix}`}
          >
            {netLabel}
          </span>
        </div>
      </div>
      {/* Task #985 — combined whole-run total (vinyl + GoodDeed). Hidden
          unless both totals compute so it never contradicts a "—" net. */}
      {combinedTotalCents !== null && (
        <div className="px-0.5">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                Combined total
              </span>
              <InfoTip
                label="About combined total"
                testId={`info-gooddeed-combined-${idSuffix}`}
                text="Whole-run profit at this quantity: vinyl total profit + GoodDeed total profit."
              />
            </span>
            <span
              className={[
                "tabular-nums text-base font-semibold",
                combinedIsLoss
                  ? "text-[color:var(--brand-pink)]"
                  : "text-slate-900",
              ].join(" ")}
              data-testid={`text-gooddeed-combined-total-${idSuffix}`}
            >
              {combinedLabel}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

// Task #393 — GoodDeed certificate upsell, rendered as the full-width
// OPTIONAL pill underneath the vinyl REQUIRED body. Collapsed shows a
// one-line summary; expanded reveals the cert preview, % qty picker,
// price + floor, and the per-vendor cost block sourced from the
// existing /api/admin/albums/:id/gooddeed-pricing-preview endpoint.
// Field edits autosave through the same upsertAddon mutation the
// legacy AddonForm uses.
function GoodDeedPill({
  albumId,
  artworkUrl,
  albumTitle,
  artistName,
  artistPhotoUrl,
  vinylQty,
  existing,
  livePlatformCostCents,
  onSave,
  onEditArtwork,
  open,
  onToggle,
  bodyContainer,
  onSignalChange,
}: {
  albumId: string;
  artworkUrl: string | null | undefined;
  // Task #397 — power the proper cert visual (album art on top + a
  // navy footer band with the album title, artist name, and a small
  // round artist photo) instead of the previous 14×14 thumbnail.
  albumTitle: string;
  artistName: string;
  artistPhotoUrl: string | null;
  vinylQty: number;
  existing: AlbumAddon | null;
  livePlatformCostCents: number | null;
  onSave: (b: {
    priceCents: number;
    active: boolean;
    minPriceCents: number;
    plannedQuantity: number | null;
  }) => void;
  // Task #393 — two-way artwork sync. The cert preview tile is the
  // same `albums.artwork` field the REQUIRED jacket renders, so
  // clicking it must open the same cover-art editor (no second source
  // of truth). When absent the tile renders non-interactive.
  onEditArtwork?: () => void;
  open: boolean;
  onToggle: () => void;
  bodyContainer: HTMLElement | null;
  // Task #758 — lift the live GoodDeed signal up to SkuRow so each
  // pricing option column can render its own revenue card. The pill
  // stays the editor; the option cards are read-only consumers of
  // {active, ratio, pct, priceCents}.
  onSignalChange?: (signal: {
    active: boolean;
    ratio: number;
    pct: number;
    priceCents: number | null;
  }) => void;
}) {
  const [active, setActive] = useState(existing?.active ?? false);
  // Task #727 — new-cert defaults: $25 retail, 20% qty. Bill wants the
  // top-bar starting point to match how GoodDeeds are actually priced.
  // (Was $35 under Task #612.) Only the unsaved/new path uses these
  // defaults — existing certs still hydrate from their stored values.
  const [priceStr, setPriceStr] = useState(
    existing ? (existing.priceCents / 100).toFixed(2) : "25.00",
  );
  const [floorStr, setFloorStr] = useState(
    existing ? (existing.minPriceCents / 100).toFixed(2) : "4.99",
  );
  // Task #612 — prefilled new-cert values are "clean" until the
  // operator actually edits a field, so opening the pill doesn't
  // immediately persist a phantom cert via the debounced autosave.
  const [touched, setTouched] = useState(false);
  // Task #415 — Profit disclosure mirrors the vinyl card's "Profit ·
  // Per unit sold" chevron. Houses the per-unit cost lines, the
  // Cost/unit subtotal, and the Floor $ guardrail (moved out of the
  // primary pricing column so it doesn't compete with Retail Price).
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  // Resolve initial % choice from the stored plannedQuantity ÷ vinylQty.
  // If it doesn't snap to one of the canned options we surface "Other…"
  // with the exact percentage pre-filled. Vinyl rows with no qty fall
  // back to 100 (one cert per vinyl pressed) — the default sales pitch.
  const initialPctChoice = useMemo(() => {
    // Task #612 — new-cert default is 20% (the realistic attach rate
    // we pitch). Existing certs MUST continue to snap back to
    // whatever matches their stored plannedQuantity — including
    // legacy rows whose plannedQuantity is null, which we render as
    // "Other…" with a 0 raw count so `dirty` stays false on open.
    if (existing) {
      if (!existing.plannedQuantity || vinylQty <= 0) return "other";
      const pct = Math.round((existing.plannedQuantity / vinylQty) * 100);
      if ([100, 50, 25, 20].includes(pct)) return String(pct);
      return "other";
    }
    return "20";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pctChoice, setPctChoice] = useState<string>(initialPctChoice);
  // Task #393 — "Other…" is a RAW QUANTITY, not a percentage. The
  // dropdown is for the four canned ratios (100/50/25/20); when the
  // operator needs an odd run (e.g. "only the first 37 buyers get a
  // cert") they type the cert count directly and we clamp it to the
  // vinyl qty (a cert run > pressing run makes no sense).
  const [otherQtyStr, setOtherQtyStr] = useState(() => {
    // Task #612 — existing row hydration takes precedence: a saved
    // plannedQuantity → render it as-is; an existing row whose
    // plannedQuantity is null → render "0" so resolvedQty stays 0
    // and `dirty` doesn't fire on open. Only brand-new pills get the
    // "10% of vinyl run" placeholder.
    if (existing) {
      return existing.plannedQuantity ? String(existing.plannedQuantity) : "0";
    }
    return String(Math.max(1, Math.round(vinylQty / 10)));
  });

  const resolvedQty =
    pctChoice === "other"
      ? Math.max(
          0,
          Math.min(vinylQty, parseInt(otherQtyStr.replace(/[^0-9]/g, ""), 10) || 0),
        )
      : vinylQty > 0
        ? Math.round((vinylQty * parseInt(pctChoice, 10)) / 100)
        : 0;
  const resolvedPct =
    vinylQty > 0 ? Math.round((resolvedQty / vinylQty) * 100) : 0;

  // Per-vendor cost preview, sized to the resolved cert run. Only fires
  // when the pill is open and we have a positive resolved qty — the
  // endpoint chokes on runQty=0 and the data is wasted while collapsed.
  const { data: preview } = useQuery<any>({
    queryKey: [
      "/api/admin/albums",
      albumId,
      "gooddeed-pricing-preview",
      resolvedQty || 1,
    ],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/admin/albums/${albumId}/gooddeed-pricing-preview?runQty=${Math.max(1, resolvedQty)}`,
      );
      return r.json();
    },
    enabled: open,
  });

  const priceCents = useMemo(() => parseDollars(priceStr), [priceStr]);
  // Task #758 — report the live GoodDeed signal up to SkuRow so the
  // per-option revenue cards stay in lock-step with this pill. We send
  // the attach ratio (resolvedQty ÷ vinylQty) rather than a snapped
  // percentage so an "Other…" raw count scales each option exactly.
  useEffect(() => {
    if (!onSignalChange) return;
    onSignalChange({
      active,
      ratio: vinylQty > 0 ? resolvedQty / vinylQty : 0,
      pct: resolvedPct,
      priceCents,
    });
  }, [onSignalChange, active, resolvedQty, vinylQty, resolvedPct, priceCents]);
  // Task #511 / #612 — Prefer the qty-driven tier preview so the
  // operator sees wholesale move as they scrub Select Qty. Previously
  // the chain was `preview ?? snapshot ?? livePlatform`, but `??`
  // treats the server's "no legs resolved" zero as a real value and
  // shorts out the fallback — which is exactly how the Profit panel
  // ended up showing $0.00 in production. We now treat a 0/null
  // preview total as "no data" and walk to snapshot → flat platform
  // default (`payout_settings.cert_cost_cents`). Only when nothing at
  // all is configured do we fall through to null and surface the
  // explanatory note below.
  const previewCost = preview?.totalPerUnitCents ?? null;
  const hasPreviewLadder = previewCost != null && previewCost > 0;
  // Track which source actually produced the displayed wholesale, so
  // the operator-facing fallback note only fires when we're truly
  // showing the flat platform-default cost (not when a real per-cert
  // snapshot is supplying the number).
  let costCents: number | null;
  let costSource: "preview" | "snapshot" | "platform" | "none";
  if (hasPreviewLadder) {
    costCents = previewCost;
    costSource = "preview";
  } else if (existing?.costCentsSnapshot != null) {
    costCents = existing.costCentsSnapshot;
    costSource = "snapshot";
  } else if (livePlatformCostCents != null) {
    costCents = livePlatformCostCents;
    costSource = "platform";
  } else {
    costCents = null;
    costSource = "none";
  }
  const usingPlatformFallback = costSource === "platform";
  const earnsCents =
    priceCents !== null && costCents !== null ? priceCents - costCents : null;

  const storedActive = existing?.active ?? false;
  // Task #727 — storedPrice matches the new $25 default so opening a
  // fresh pill doesn't read as "dirty" before the operator types.
  const storedPrice = existing ? (existing.priceCents / 100).toFixed(2) : "25.00";
  const storedFloor = existing ? (existing.minPriceCents / 100).toFixed(2) : "4.99";
  const storedQty = existing?.plannedQuantity ?? null;
  const dirty =
    active !== storedActive ||
    priceStr !== storedPrice ||
    floorStr !== storedFloor ||
    (resolvedQty || null) !== storedQty;

  // Debounced autosave — same 700ms beat as the SkuRow's own vinyl
  // autosave so the experience is consistent across the card. Task
  // #612: gate on `touched` so the prefilled defaults on a brand-new
  // pill don't immediately persist a phantom cert; once the operator
  // edits anything (or there's already a saved row), normal
  // dirty-tracking kicks in.
  useEffect(() => {
    if (!dirty) return;
    // Task #612 — never persist from derived defaults. Even on
    // existing rows, only an explicit operator edit (price / qty /
    // floor / active toggle) flips `touched` and unlocks autosave.
    // This prevents legacy rows whose stored plannedQuantity is null
    // from being silently rewritten the first time the pill opens.
    if (!touched) return;
    const t = setTimeout(() => {
      const cents = parseDollars(priceStr);
      if (cents === null) return;
      onSave({
        priceCents: cents,
        active,
        minPriceCents: parseDollars(floorStr) ?? 0,
        plannedQuantity: resolvedQty > 0 ? resolvedQty : null,
      });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, priceStr, floorStr, active, resolvedQty]);

  // Task #393 — collapsed summary shows on/off state explicitly so a
  // glance at a collapsed pill tells the operator "this is live" vs
  // "this is dormant", followed by the spec's required
  // `{pct}% ({resolvedQty} of vinyl qty)` resolved label format.
  const stateLabel = active ? "On" : "Off";
  const resolvedLabel =
    vinylQty > 0
      ? `${resolvedPct}% (${resolvedQty.toLocaleString()} of ${vinylQty.toLocaleString()})`
      : "—";
  const summary = `${stateLabel} · ${resolvedLabel}`;

  // Task #415 — Match the vinyl card's right column exactly: same
  // labels (RETAIL PRICE / SELECT QTY), same InfoTip popover, same
  // collapsible Profit chevron, same Total row. The active toggle
  // lives in the header summary; per-vendor cost becomes a secondary
  // disclosure beneath the two-column card.
  //
  // Task #485 — Total is now NET to the artist:
  //   (retail − per-unit GoodDeed cost) × resolvedQty
  // when we can resolve a cost. When the platform has no tier ladder
  // configured (costCents === null), fall back to gross retail × qty
  // and surface a one-line note that net can't be computed yet. Loss
  // (negative net) renders in brand pink, same as the Profit row.
  // Task #498 — Stripe's flat US card-present rate: 2.9% + 30¢ per
  // transaction. We compute it client-side off the retail price
  // (the platform constant doesn't justify a server round-trip).
  // Only meaningful once a retail price is set; otherwise null.
  const ccFeeCents =
    priceCents !== null ? Math.round(priceCents * 0.029) + 30 : null;
  const costPerUnitCents =
    costCents !== null && ccFeeCents !== null
      ? costCents + ccFeeCents
      : costCents;
  const netPerUnitCents =
    priceCents !== null && costCents !== null && ccFeeCents !== null
      ? priceCents - costCents - ccFeeCents
      : earnsCents;
  const canComputeNet =
    priceCents !== null && costCents !== null && ccFeeCents !== null;
  const netTotalCents = canComputeNet
    ? (priceCents! - costCents! - ccFeeCents!) * resolvedQty
    : null;
  const grossTotalCents = priceCents !== null ? priceCents * resolvedQty : null;
  const totalCents = netTotalCents ?? grossTotalCents;
  const totalIsLoss = netTotalCents !== null && netTotalCents < 0;
  const totalLabel =
    totalCents === null
      ? "—"
      : totalIsLoss
        ? `-${dollars(Math.abs(totalCents))}`
        : dollars(totalCents);
  const lossColor = netPerUnitCents !== null && netPerUnitCents < 0;
  const profitLabel =
    netPerUnitCents === null
      ? "—"
      : netPerUnitCents < 0
        ? `-${dollars(Math.abs(netPerUnitCents))}`
        : dollars(netPerUnitCents);

  return (
    <>
      {/* Task #441 — Apple HIG: master on/off lives INSIDE the panel
          it controls. Task #708 — the collapsed header is now a compact
          side-by-side tile (UpsellTile); the disclosure chevron rotates
          and the open editor body is portaled into the full-width panel
          below the tile row. */}
      <UpsellTile
        icon={Award}
        title="GoodDeed® Certificate"
        subtitle={
          <span data-testid="text-gooddeed-summary">{summary}</span>
        }
        active={open}
        onClick={onToggle}
        testId="button-toggle-gooddeed-pill"
      />
      {open && bodyContainer ? (
        createPortal(
          <UpsellPanelCard className="space-y-4" testId="pill-gooddeed">
          {/* Task #441 — Master enable switch lives as the FIRST row
              inside the panel it gates, directly above the % / cap /
              price fields it controls. Flipping this updates the
              collapsed header's `On · 25% (65 of 260)` echo to `Off`. */}
          <div
            className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2.5"
            data-testid="row-gooddeed-enable"
          >
            <Switch
              id="toggle-gooddeed-active"
              checked={active}
              onCheckedChange={(v) => { setTouched(true); setActive(v); }}
              data-testid="toggle-gooddeed-active"
              aria-label="Offer GoodDeed® cert on this release"
            />
            <label
              htmlFor="toggle-gooddeed-active"
              className="text-sm font-medium text-slate-900 cursor-pointer select-none"
            >
              Add Signed GoodDeed Certificate
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 items-start">
            {/* LEFT — enlarged cert mock, framed in a proportionate
                GoodTunes-orange mat so it reads like the cert sitting
                inside a frame (matches the GoodDeed share-card framing
                convention). Album art on top, navy band (brand bg)
                with owner/serial bars + GoodDeed mark. The QR code is
                per-fan and gets generated at print time, so no
                placeholder shown here. The album-art tile keeps the
                pencil-on-hover affordance that opens the shared
                cover-art editor — single source of truth on
                `albums.artwork`. */}
            <div
              className="rounded-md border-[10px] border-[color:var(--brand-orange)] bg-white overflow-hidden shadow-sm"
              data-testid="card-gooddeed-cert"
            >
              {onEditArtwork ? (
                <button
                  type="button"
                  onClick={onEditArtwork}
                  aria-label="Edit cover art"
                  title="Edit cover art (syncs with the vinyl jacket)"
                  className="group relative block w-full aspect-square bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]/40"
                  data-testid="button-gooddeed-edit-artwork"
                >
                  {artworkUrl ? (
                    <img
                      src={artworkUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      data-testid="img-gooddeed-preview"
                    />
                  ) : (
                    <span className="absolute inset-0 inline-flex items-center justify-center text-xs text-slate-400">
                      No art
                    </span>
                  )}
                  <span
                    className="absolute inset-0 bg-black/0 group-hover:bg-black/40 group-focus-visible:bg-black/40 [@media(hover:none)]:bg-black/30 transition-colors pointer-events-none"
                    aria-hidden
                  />
                  <span
                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity pointer-events-none"
                    aria-hidden
                  >
                    <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 inline-flex items-center justify-center shadow-lg ring-1 ring-black/5">
                      <Pencil className="w-4 h-4" />
                    </span>
                  </span>
                </button>
              ) : (
                <div className="relative w-full aspect-square bg-slate-50">
                  {artworkUrl ? (
                    <img
                      src={artworkUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      data-testid="img-gooddeed-preview"
                    />
                  ) : (
                    <span className="absolute inset-0 inline-flex items-center justify-center text-xs text-slate-400">
                      No art
                    </span>
                  )}
                </div>
              )}
              {/* Task #510 follow-up — band matches Bill's wireframe
                  (image_1779851332242.png): all placeholder content is
                  a uniform muted slate-blue rounded rect set against
                  brand-navy. Top row = solid avatar disc + two short
                  bars (owner / serial) + GoodTunes wordmark top-right.
                  Bottom-right = solid square QR placeholder. No founder
                  caption, no mint, no QR finder pattern — reads as a
                  pure wireframe template. */}
              {/* Compact archival-strip footer — art dominates ~80% of
                  the composition, the cert strip is a thin premium
                  band carrying only owner/serial bars + QR. Body-copy
                  bars dropped to keep the strip dense and collectible,
                  not panel-like. */}
              <div
                className="w-full text-white flex flex-col justify-between px-4 py-3 aspect-[4/1] gap-1.5"
                style={{ backgroundColor: "var(--brand-bg)" }}
                data-testid="band-gooddeed-cert"
              >
                {/* Top row — solid avatar + two short bars + GoodTunes wordmark */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className="w-7 h-7 rounded-full flex-shrink-0"
                      style={{ background: "rgba(255,255,255,0.32)" }}
                      aria-label="Owner avatar (per fan)"
                      data-testid="skeleton-gooddeed-avatar"
                    />
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <div
                        className="h-2 w-[55%] rounded-full"
                        style={{ background: "rgba(255,255,255,0.32)" }}
                        aria-label="Owner name (filled in per fan)"
                        data-testid="skeleton-gooddeed-owner"
                      />
                      <div
                        className="h-2 w-[32%] rounded-full"
                        style={{ background: "rgba(255,255,255,0.32)" }}
                        aria-label={`owns no. NN of ${albumTitle || "this release"}`}
                        data-testid="skeleton-gooddeed-serial"
                      />
                    </div>
                  </div>
                  <img
                    src="/goodtunes-logo-white.png"
                    alt="GoodTunes®"
                    className="h-7 w-auto object-contain object-right flex-shrink-0"
                    data-testid="mark-goodtunes"
                  />
                </div>

                {/* Bottom row — small square QR placeholder (right).
                    Founder signature dropped per Bill (not needed in
                    this preview); the bottom-left stays clean. */}
                <div className="flex items-end justify-end gap-3">
                  <div
                    className="w-7 h-7 rounded-sm flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.32)" }}
                    aria-hidden
                    title="Per-fan QR — auto-generated at sale time"
                    data-testid="placeholder-gooddeed-qr"
                  />
                </div>
              </div>
            </div>

            {/* RIGHT — Retail / Qty / Profit / Total. Mirrors the
                vinyl SkuRow's right column exactly: same uppercase
                slate-500 labels, same InfoTip popover positions,
                same chevron disclosure for Profit, same Total row. */}
            <div className="space-y-4">
              {/* RETAIL PRICE */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    Retail Price
                  </span>
                  <InfoTip
                    label="About retail price"
                    testId="info-gooddeed-price"
                    text="What fans pay per GoodDeed® certificate."
                  />
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-slate-400 text-sm leading-9">$</span>
                  <div className="flex flex-col">
                    <input
                      type="text"
                      value={priceStr}
                      onChange={(e) => { setTouched(true); setPriceStr(e.target.value); }}
                      onKeyDown={handlePriceFieldKeyDown}
                      inputMode="decimal"
                      className={`${fieldClass} w-32 tabular-nums`}
                      data-testid="input-gooddeed-price"
                      aria-label="Retail price per cert"
                    />
                    <div className="text-xs text-slate-400 mt-1">
                      Per unit sold to fans.
                    </div>
                  </div>
                </div>
              </div>

              {/* SELECT QTY */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    Select Qty
                  </span>
                  <InfoTip
                    label="About cert quantity"
                    testId="info-gooddeed-qty"
                    text="How many certs to issue against this vinyl run. Capped at the vinyl quantity."
                  />
                </div>
                <Select value={pctChoice} onValueChange={(v) => { setTouched(true); setPctChoice(v); }}>
                  <SelectTrigger
                    className="h-8 w-full text-sm"
                    data-testid="select-gooddeed-pct"
                    aria-label={`Cert run ratio — currently ${resolvedLabel}`}
                  >
                    <span className="truncate">{resolvedLabel}</span>
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900 border-slate-200">
                    <SelectItem value="100">100% · one per vinyl</SelectItem>
                    <SelectItem value="50">50%</SelectItem>
                    <SelectItem value="25">25%</SelectItem>
                    <SelectItem value="20">20%</SelectItem>
                    <SelectItem value="other">Other…</SelectItem>
                  </SelectContent>
                </Select>
                {pctChoice === "other" && (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={otherQtyStr}
                    onChange={(e) => { setTouched(true); setOtherQtyStr(e.target.value); }}
                    className={`${fieldClass} mt-1.5`}
                    placeholder={`max ${vinylQty.toLocaleString()}`}
                    aria-label={`Cert count — capped at vinyl qty ${vinylQty.toLocaleString()}`}
                    data-testid="input-gooddeed-other-qty"
                  />
                )}
              </div>

              {/* PROFIT — chevron disclosure. Same primitive as the
                  vinyl SkuRow's "Profit · Per unit sold". Loss shown
                  in brand pink. Body holds the per-unit cost
                  breakdown (printing/hologram/insertion totalled as
                  GoodDeed Wholesale), the Cost/unit subtotal, and
                  the Floor $ guardrail (moved out of the primary
                  pricing column). No CC-fee line — the preview
                  endpoint doesn't expose one, and the task says
                  surface what's there, don't invent a field. */}
              <div>
                <button
                  type="button"
                  onClick={() => setBreakdownOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-2 py-1.5 -mx-1 px-1 rounded hover:bg-slate-50 transition-colors text-left"
                  aria-expanded={breakdownOpen}
                  data-testid="button-toggle-gooddeed-profit"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                      Profit
                    </span>
                    <span className="text-xs text-slate-400 truncate">
                      · Per unit sold
                    </span>
                    <ChevronDown
                      className={[
                        "w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0",
                        breakdownOpen ? "rotate-180" : "",
                      ].join(" ")}
                    />
                  </span>
                  <span
                    className={[
                      "text-sm font-semibold tabular-nums flex-shrink-0",
                      lossColor
                        ? "text-[color:var(--brand-pink)]"
                        : "text-slate-900",
                    ].join(" ")}
                    data-testid="text-gooddeed-profit"
                  >
                    {profitLabel}
                  </span>
                </button>
                {breakdownOpen && (
                  <div
                    className="mt-1 ml-1 pl-3 border-l border-slate-200 space-y-1.5 py-1"
                    data-testid="block-gooddeed-cost-breakdown"
                  >
                    {/* Task #485 — Per-unit GoodDeed cost is the
                        headline number here. It comes from the
                        tiered ladder via the gooddeed-pricing-preview
                        query (qty-driven) when available, and falls
                        back to a snapshot or the live platform cost.
                        The Floor $ guardrail was removed — the
                        artist shouldn't be setting our cost. */}
                    {costCents !== null ? (
                      <>
                        <div className="flex items-center justify-between text-xs tabular-nums">
                          <span className="flex items-center gap-1.5 text-slate-600">
                            Manufacturing &amp; Shipping
                            <InfoTip
                              label="What Manufacturing & Shipping covers"
                              testId="info-gooddeed-quickprinter"
                              text="Per-cert wholesale on the tiered ladder ($13 → $12 → $9 → $7 → $6 as the run grows). It covers print + hologram + shrinkwrap + insertion into the jacket and all three shipping legs (Hoover → artist for signing → Spinney for insertion → fulfillment). CC fee on the cert retail is the only other line."
                            />
                          </span>
                          <span
                            className="text-slate-900"
                            data-testid="text-gooddeed-wholesale"
                          >
                            {dollars(costCents)}
                          </span>
                        </div>
                        {/* Task #612 — When the live per-vendor ladder
                            preview returned no real number (no press
                            assigned and/or no platform-default ladder
                            rows), the wholesale shown above is the
                            flat platform-default cost rather than a
                            ladder-driven quote. Surface a one-line
                            note so the operator knows why it doesn't
                            scrub with Select Qty. */}
                        {usingPlatformFallback && (
                          <div
                            className="text-xs text-slate-400 italic leading-snug"
                            data-testid="text-gooddeed-wholesale-fallback-note"
                          >
                            No press ladder resolved — showing the
                            flat platform-default wholesale. Assign a
                            press (or configure default Printing/
                            Hologram/Insertion vendors on Platform
                            Pricing) to see a real per-quantity quote.
                          </div>
                        )}
                        {/* Task #498 — CC fee = retail × 2.9% + $0.30
                            (Stripe's flat US rate). Computed off the
                            retail price client-side; rolls into
                            Cost/unit, per-unit Profit, and Net to
                            Artist. Only italic-fallback when retail
                            isn't set yet. */}
                        <div
                          className="flex items-center justify-between text-xs tabular-nums"
                          data-testid="row-gooddeed-cc-fee"
                        >
                          <span className="text-slate-600">CC fee</span>
                          {ccFeeCents !== null ? (
                            <span
                              className="text-slate-900"
                              data-testid="text-gooddeed-cc-fee"
                            >
                              {dollars(ccFeeCents)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">
                              set retail price
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs font-semibold border-t border-slate-200 pt-1.5 mt-1 tabular-nums">
                          <span className="text-slate-700">Cost / unit</span>
                          <span
                            className="text-slate-900"
                            data-testid="text-gooddeed-cost-per-unit"
                          >
                            {dollars(costPerUnitCents!)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div
                        className="text-xs text-slate-400 italic"
                        data-testid="text-gooddeed-cost-unavailable"
                      >
                        Cost preview unavailable — set platform-default
                        Printing/Hologram/Insertion vendors on Platform Pricing.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* TOTAL — Task #485: net to the artist for the full
                  cert run = (retail − per-unit GoodDeed cost) × qty.
                  When the platform has no tier ladder configured
                  we can't compute net, so we fall back to gross
                  (retail × qty) and surface a one-line note. */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                      {canComputeNet ? "Net to Artist" : "Total"}
                    </span>
                    <InfoTip
                      label="About total"
                      testId="info-gooddeed-total"
                      text={
                        canComputeNet
                          ? "What the artist nets on the full cert run: (Retail − GoodDeed cost) × Qty."
                          : "Gross retail revenue (Retail × Qty). Net can't be shown until the platform tier ladder is configured."
                      }
                    />
                  </span>
                  <span
                    className={[
                      "text-base font-semibold tabular-nums",
                      totalIsLoss
                        ? "text-[color:var(--brand-pink)]"
                        : "text-slate-900",
                    ].join(" ")}
                    data-testid="text-gooddeed-total"
                  >
                    {totalLabel}
                  </span>
                </div>
                {!canComputeNet && grossTotalCents !== null && (
                  <div
                    className="mt-1 text-xs text-slate-400 italic"
                    data-testid="text-gooddeed-total-note"
                  >
                    Showing gross — net can't be computed until the
                    platform tier ladder is set.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Task #758 — the per-quantity uplift table that used to live
              here was retired. The GoodDeed upside now reads off a
              revenue card under each pricing option column in SkuRow
              (single source of truth), so two competing uplift views no
              longer drift apart. */}
          </UpsellPanelCard>,
          bodyContainer,
        )
      ) : null}
    </>
  );
}

// Task #200 — Vinyl color + jacket picker. Lives under the
// Price/Cost/Profit grid on 7" / 12" rows. The swatch row is
// horizontally scrollable so the artist can try a different color
// without leaving the row (a fix for Hellbender's own picker, which
// makes you back out to switch colors). Live preview on the right
// shows what a fan will see in the "You'll get" mock.
function VinylPicksBlock({
  format,
  artworkUrl,
  color,
  colorTier,
  onPickColorTier,
  onPickColor,
  jacketUpgrade,
  onPickJacket,
  jacketAllowed,
}: {
  format: AlbumFormat;
  artworkUrl: string | null;
  color: VinylColorOption;
  colorTier: import("@shared/pressing").VinylColorTier;
  onPickColorTier: (t: import("@shared/pressing").VinylColorTier) => void;
  onPickColor: (id: string) => void;
  jacketUpgrade: JacketUpgrade;
  onPickJacket: (j: JacketUpgrade) => void;
  jacketAllowed: boolean;
}) {
  const swatchesInTier = useMemo(
    () => VINYL_COLORS.filter((c) => c.tier === colorTier),
    [colorTier],
  );
  // Task #385 — when the user changes section, snap the picked color
  // to the first color in that section (mirrors the catalog
  // tier→color auto-reset effect above).
  useEffect(() => {
    if (color.tier === colorTier) return;
    const first = swatchesInTier[0];
    if (first) onPickColor(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorTier]);

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-4 items-start"
      data-testid={`vinyl-picks-${format}`}
    >
      <div className="space-y-3">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
          Vinyl
        </div>

        {/* Color section — shadcn Select, mirrors the catalog flow. */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">Color section</span>
          <Select
            value={colorTier}
            onValueChange={(v) => onPickColorTier(v as import("@shared/pressing").VinylColorTier)}
          >
            <SelectTrigger
              className="h-8 w-56 text-sm"
              data-testid={`select-vinyl-color-tier-${format}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white text-slate-900 border-slate-200">
              {VINYL_COLOR_TIER_ORDER.map((t) => (
                <SelectItem key={t} value={t} data-testid={`option-vinyl-color-tier-${format}-${t}`}>
                  {VINYL_COLOR_TIER_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Color picker — swatches filtered to the picked section. */}
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-xs text-slate-500">Color</span>
            <span
              className="text-xs text-slate-700 font-medium"
              data-testid={`text-vinyl-color-name-${format}`}
            >
              {color.name}
            </span>
          </div>
          <div
            className="flex flex-wrap gap-1.5"
            role="radiogroup"
            aria-label="Vinyl color"
            data-testid={`picker-vinyl-color-${format}`}
          >
            {swatchesInTier.map((c) => {
              const selected = c.id === color.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  title={c.name}
                  onClick={() => onPickColor(c.id)}
                  className={[
                    "w-7 h-7 rounded-full border-2 transition-transform",
                    selected
                      ? "border-[color:var(--brand-blue)] scale-110 shadow"
                      : "border-slate-200 hover:border-slate-400",
                  ].join(" ")}
                  style={{ background: c.swatch }}
                  data-testid={`swatch-vinyl-color-${format}-${c.id}`}
                >
                  <span className="sr-only">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Jacket — shadcn Select for 7"; for 12"LP we reserve a
            standard-jacket image slot (future: real product shot). */}
        {jacketAllowed ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">Jacket</span>
            <Select
              value={jacketUpgrade}
              onValueChange={(v) => onPickJacket(v as JacketUpgrade)}
            >
              <SelectTrigger
                className="h-8 w-56 text-sm"
                data-testid={`select-jacket-${format}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-900 border-slate-200">
                {(Object.keys(JACKET_UPGRADE_LABEL) as JacketUpgrade[]).map((j) => (
                  <SelectItem key={j} value={j} data-testid={`option-jacket-${format}-${j}`}>
                    {JACKET_UPGRADE_LABEL[j]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">Jacket</span>
            <div
              className="flex items-center gap-2"
              data-testid={`text-jacket-standard-${format}`}
            >
              <div
                className="w-10 h-10 rounded-md border border-dashed border-slate-300 bg-slate-50"
                aria-hidden
                data-testid={`img-jacket-standard-placeholder-${format}`}
              />
              <span className="text-xs text-slate-600">
                Standard jacket
                <span className="block text-xs text-slate-400">Every 12&quot;LP ships in the standard jacket.</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Live preview — album jacket + colored disc peeking out. The
          same mock will surface on the fan Preview & Purchase page. */}
      <div className="w-full sm:w-72">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
          Fan preview
        </div>
        <VinylPreview
          artworkUrl={artworkUrl}
          color={color}
          jacketUpgrade={jacketUpgrade}
          format={format}
        />
      </div>
    </div>
  );
}

function AddonForm({
  albumId,
  existing,
  livePlatformCostCents,
  onSave,
}: {
  albumId: string;
  existing: AlbumAddon | null;
  livePlatformCostCents: number | null;
  onSave: (b: {
    priceCents: number;
    active: boolean;
    minPriceCents: number;
    plannedQuantity: number | null;
  }) => void;
}) {
  const [active, setActive] = useState(existing?.active ?? false);
  // Task #727 — legacy/Shopify GoodDeed editor new-addon retail default
  // raised from $12.99 to $25.00 so it doesn't drift from the direct-sell
  // panel. Quantity controls unchanged.
  const [price, setPrice] = useState(existing ? (existing.priceCents / 100).toFixed(2) : "25.00");
  const [floor, setFloor] = useState(existing ? (existing.minPriceCents / 100).toFixed(2) : "4.99");
  // Task #121 — quantity mode. Existing rows without a planned quantity
  // (everything pre-#121) default to "unlimited" so we don't invent a
  // number on their behalf. Fixed mode defaults to 100 the first time
  // the artist switches into it.
  const initialMode: "fixed" | "unlimited" =
    existing?.plannedQuantity != null ? "fixed" : "unlimited";
  const [qtyMode, setQtyMode] = useState<"fixed" | "unlimited">(initialMode);
  const [qtyInput, setQtyInput] = useState<string>(
    existing?.plannedQuantity != null ? String(existing.plannedQuantity) : "100",
  );

  const lockedCost = existing?.costCentsSnapshot ?? null;
  const parsedQtyForPreview = useMemo(() => {
    const n = Number.parseInt(qtyInput.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [qtyInput]);
  const previewQty = qtyMode === "fixed" ? parsedQtyForPreview : 1;
  const { data: livePreview } = useQuery<any>({
    queryKey: ["/api/admin/albums", albumId, "gooddeed-pricing-preview", previewQty],
    queryFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/admin/albums/${albumId}/gooddeed-pricing-preview?runQty=${Math.max(1, previewQty)}`,
      );
      return r.json();
    },
    enabled: lockedCost === null,
  });
  const liveCost: number | null =
    typeof livePreview?.totalPerUnitCents === "number"
      ? livePreview.totalPerUnitCents
      : null;
  const readoutCost = lockedCost ?? liveCost ?? livePlatformCostCents;

  const priceCents = useMemo(() => parseDollars(price), [price]);
  const earnsCents = priceCents !== null && readoutCost !== null ? priceCents - readoutCost : null;

  const parsedQty = useMemo(() => {
    const n = Number.parseInt(qtyInput.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [qtyInput]);

  const totalCents =
    qtyMode === "fixed" && earnsCents !== null && parsedQty !== null
      ? earnsCents * parsedQty
      : null;

  const storedActive = existing?.active ?? false;
  // Task #727 — baseline matches the new $25 default so a fresh legacy
  // addon form opens clean (was $12.99).
  const storedPrice = existing ? (existing.priceCents / 100).toFixed(2) : "25.00";
  const storedFloor = existing ? (existing.minPriceCents / 100).toFixed(2) : "4.99";
  const storedMode: "fixed" | "unlimited" = initialMode;
  const storedQty = existing?.plannedQuantity ?? null;
  const dirty =
    active !== storedActive ||
    price !== storedPrice ||
    floor !== storedFloor ||
    qtyMode !== storedMode ||
    (qtyMode === "fixed" && parsedQty !== storedQty);

  const submit = () => {
    const cents = parseDollars(price);
    if (cents === null) return;
    const minCents = parseDollars(floor) ?? 0;
    const plannedQuantity = qtyMode === "fixed" ? parsedQty : null;
    if (qtyMode === "fixed" && plannedQuantity === null) return;
    onSave({ priceCents: cents, active, minPriceCents: minCents, plannedQuantity });
  };

  const lossColor = earnsCents !== null && earnsCents < 0;
  const earnsLabel =
    earnsCents === null
      ? "—"
      : earnsCents < 0
        ? `-${dollars(Math.abs(earnsCents))}`
        : dollars(earnsCents);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold pt-1">
          Price · Cost · Profit
        </div>
        <SaveLink dirty={dirty} onClick={submit} testId="button-save-addon" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        {/* Left column — Price / Cost / Profit */}
        <div className="space-y-3">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[color:var(--brand-blue)] focus:ring-[color:var(--brand-blue)]"
              data-testid="toggle-addon-signed_cert"
            />
            <span className="text-[13.5px] font-medium text-slate-900">
              Offer signed GoodDeed® Certificate
            </span>
          </label>

          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 text-xs">Price $</span>
            <input
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={handlePriceFieldKeyDown}
              inputMode="decimal"
              className={`w-28 ${fieldClass}`}
              data-testid="input-addon-price"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 text-xs">
              Cost ${" "}
              <span className="text-slate-400 text-[11px]">
                ({lockedCost === null ? "live" : "locked at last save"})
              </span>
            </span>
            <span
              className="w-28 text-right tabular-nums text-[13.5px] text-slate-700"
              data-testid="text-addon-cost"
            >
              {readoutCost === null ? "—" : dollars(readoutCost)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 text-xs">
              Profit ${" "}
              <span className="text-slate-400 text-[11px]">Per unit sold</span>
            </span>
            <span
              className={[
                "w-28 text-right tabular-nums text-[13.5px] font-semibold",
                lossColor ? "text-[color:var(--brand-pink)]" : "text-slate-900",
              ].join(" ")}
              data-testid="text-addon-profit"
            >
              {earnsLabel}
            </span>
          </div>
        </div>

        {/* Right column — Quantity / Total */}
        <div className="space-y-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Quantity
          </div>
          <div
            className="flex flex-col gap-2"
            role="radiogroup"
            data-testid="picker-addon-quantity-mode"
          >
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="addon-qty-mode"
                checked={qtyMode === "fixed"}
                onChange={() => setQtyMode("fixed")}
                className="h-4 w-4 text-[color:var(--brand-blue)] focus:ring-[color:var(--brand-blue)]"
                data-testid="radio-addon-qty-fixed"
              />
              <input
                type="text"
                value={qtyInput}
                onChange={(e) => {
                  setQtyInput(e.target.value);
                  if (qtyMode !== "fixed") setQtyMode("fixed");
                }}
                onFocus={() => setQtyMode("fixed")}
                disabled={qtyMode !== "fixed"}
                inputMode="numeric"
                className={`w-24 ${fieldClass} ${qtyMode !== "fixed" ? "opacity-50" : ""}`}
                data-testid="input-addon-quantity"
              />
              <span className="text-xs text-slate-500">units</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="addon-qty-mode"
                checked={qtyMode === "unlimited"}
                onChange={() => setQtyMode("unlimited")}
                className="h-4 w-4 text-[color:var(--brand-blue)] focus:ring-[color:var(--brand-blue)]"
                data-testid="radio-addon-qty-unlimited"
              />
              <span className="text-sm text-slate-700">As many as will sell</span>
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-slate-500 text-xs">
              Profit ${" "}
              <span className="text-slate-400 text-[11px]">Per unit sold</span>
            </span>
            <span
              className={[
                "w-28 text-right tabular-nums text-[13.5px]",
                lossColor ? "text-[color:var(--brand-pink)]" : "text-slate-700",
              ].join(" ")}
              data-testid="text-addon-profit-echo"
            >
              {earnsLabel}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 text-xs">Total $</span>
            {qtyMode === "unlimited" ? (
              <span
                className="w-28 text-right tabular-nums text-[15px] font-semibold text-slate-400"
                data-testid="text-addon-total-tbd"
              >
                TBD
              </span>
            ) : (
              <span
                className={[
                  "w-28 text-right tabular-nums text-[15px] font-semibold",
                  totalCents !== null && totalCents < 0
                    ? "text-[color:var(--brand-pink)]"
                    : "text-slate-900",
                ].join(" ")}
                data-testid="text-addon-total"
              >
                {totalCents === null
                  ? "—"
                  : totalCents < 0
                    ? `-${dollars(Math.abs(totalCents))}`
                    : dollars(totalCents)}
              </span>
            )}
          </div>

          {qtyMode === "fixed" && parsedQty !== null && (
            <div
              className="text-[11.5px] text-slate-400 text-right"
              data-testid="text-addon-total-caveat"
            >
              Only if all {parsedQty} sell.
            </div>
          )}
        </div>
      </div>

      {/* Min floor — preserved as a quiet advanced row for the Shopify
          bundle floor logic; not in the new mockup but still required. */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
        <span className="text-slate-400 text-[11.5px]">Min floor $</span>
        <input
          type="text"
          value={floor}
          onChange={(e) => setFloor(e.target.value)}
          inputMode="decimal"
          className={`w-20 ${fieldClass} text-xs`}
          data-testid="input-addon-floor"
        />
        <span className="text-slate-400 text-[11px]">
          (advanced — per-album floor used by Shopify bundles)
        </span>
      </div>
    </div>
  );
}
