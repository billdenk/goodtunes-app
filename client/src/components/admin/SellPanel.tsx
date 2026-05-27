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
import { useEffect, useMemo, useRef, useState } from "react";
import { useExclusiveDisclosure } from "@/hooks/useExclusiveDisclosure";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, X, Info, MapPin, Clock, ChevronDown, Pencil, Eye, EyeOff, Trash2, Lock, LockOpen } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { apiRequest, getAuthToken, queryClient } from "@/lib/queryClient";
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
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ALBUM_FORMATS,
  ALBUM_FORMAT_LABEL,
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
  lookupHellbenderUnitCents,
  snapToQuantityTier,
  type JacketUpgrade,
  type VinylColorOption,
} from "@shared/pressing";
import { VinylPreview } from "@/components/VinylPreview";
import { PressingOrderStepper } from "@/components/admin/PressingOrderFlow";
import { CertSaleWindowPanel } from "@/components/admin/CertSaleWindowPanel";

// Task #393 — Intl-based currency formatter with thousands separators
// and proper negative handling, replacing the old `$${(c/100).toFixed(2)}`
// helper. `dollars(123456)` → "$1,234.56", `dollars(-50)` → "-$0.50".
const DOLLAR_FMT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const dollars = (c: number) => DOLLAR_FMT.format(c / 100);
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
  priceLadder: { qty: number; unitCents: number }[];
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
};

// Mirrors `snapToCatalogQuantityTier` server-side. Walks an ordered
// ladder and returns the matched rung + a `requiresQuote` flag when
// the typed quantity exceeds the top rung.
function snapCatalogLadder(
  ladder: { qty: number; unitCents: number }[],
  n: number,
): { qty: number; unitCents: number; requiresQuote: boolean } | null {
  if (!Array.isArray(ladder) || ladder.length === 0) return null;
  const sorted = [...ladder].sort((a, b) => a.qty - b.qty);
  const q = Math.max(1, Math.floor(n));
  for (const r of sorted) if (q <= r.qty) return { qty: r.qty, unitCents: r.unitCents, requiresQuote: false };
  const top = sorted[sorted.length - 1];
  return { qty: top.qty, unitCents: top.unitCents, requiresQuote: true };
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
  const { data, isLoading, error } = useQuery<SellResponse>({ queryKey: ["/api/admin/albums", albumId, "skus"] });
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
  });
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "skus"] }),
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });
  const deleteSku = useMutation({
    mutationFn: async (format: AlbumFormat) => apiRequest("DELETE", `/api/admin/albums/${albumId}/skus/${format}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "skus"] }),
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
                : `[data-testid="button-row-summary-${firstFormat}"]`;
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
        <PrinterAndPressPanel invited={invitedPress ?? null} />

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
                      return (
                        <SkuRow
                          key={f}
                          format={f}
                          existing={existing}
                          liveCost={costByFormat.get(f) ?? null}
                          catalogFormat={catalogByFormat.get(f) ?? null}
                          artworkUrl={artworkUrl}
                          offeredFormats={offeredFormats}
                          onSwitchFormat={switchFormat(f, f)}
                          onEditArtwork={onEditArtwork}
                          onSave={upsertSku.mutate}
                          onDelete={() => deleteSku.mutate(f)}
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
                          bookletAddon={bookletAddon ?? null}
                          isBookletAnchor={primaryBookletFormat === f}
                          onSaveBookletAddon={upsertBookletAddon.mutate}
                          albumTitle={albumTitle}
                          artistName={artistName}
                          artistPhotoUrl={artistPhotoUrl}
                          albumQuoteLockedAt={sellQuoteLockedAt ?? null}
                        />
                      );
                    })}
                    {liveDrafts.map((f) => (
                      <SkuRow
                        key={`draft-${f}`}
                        format={f}
                        existing={null}
                        liveCost={costByFormat.get(f) ?? null}
                        catalogFormat={catalogByFormat.get(f) ?? null}
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
                        bookletAddon={bookletAddon ?? null}
                        isBookletAnchor={primaryBookletFormat === f}
                        onSaveBookletAddon={upsertBookletAddon.mutate}
                        albumTitle={albumTitle}
                        artistName={artistName}
                        artistPhotoUrl={artistPhotoUrl}
                        albumQuoteLockedAt={sellQuoteLockedAt ?? null}
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
function PrinterAndPressPanel({ invited }: { invited: InvitedPressResponse | null }) {
  const invitedPress = invited?.press ?? null;
  const locked = !!invitedPress && !invited?.hasShippedFirst;

  // Hellbender is intentionally hidden from the Printer picker for
  // now — MRP demo / pitch is in flight and we don't want partners
  // landing on the Sell tab and seeing Hellbender presented as the
  // default live plant. Reference rates still drive cost math under
  // the hood; only the user-facing chip is suppressed. Restore by
  // re-adding the Hellbender entry (and the /api/manufacturers
  // query) once MRP signs.

  type Chip = { id: string; label: string; status: "live" | "coming-soon"; press: Manufacturer | null };
  // Task #597 — MRP hidden from the Printer chip row pre-meeting
  // (mirrors the Press-tab preflight hide). With only PMP left as a
  // coming-soon chip and the invited press as the live one, the
  // default-selected label is never "MRP". Restore by re-adding the
  // MRP entry above PMP.
  const chips: Chip[] = locked
    ? [{ id: "invited", label: invitedPress!.name, status: "live", press: invitedPress }]
    : [
        { id: "pmp", label: "PMP", status: "coming-soon", press: null },
      ];

  const defaultId = chips[0].id;
  const [selectedId, setSelectedId] = useState<string>(defaultId);
  const selectedChip = chips.find((c) => c.id === selectedId) ?? chips[0];
  const selectedPress = selectedChip.press;

  // Only one printer truly selectable → no chip row at all (just the
  // selected label + Info). "Selectable" means live; coming-soon chips
  // don't count for this decision (otherwise the disabled MRP/PMP would
  // force chips to render in the free flow even though the operator can
  // only pick Hellbender today).
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
                onClick={() => setSelectedId(c.id)}
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
          Anticipated tracks
        </span>
        <InfoTip
          label="About anticipated tracks"
          testId={`info-anticipated-tracks-${format}`}
          text="Type the number of tracks you expect this album to have so the Publishing estimate is realistic before you upload masters. Publishing = N × $0.254 (mechanicals × 2 for vinyl + digital). Once songs are uploaded this switches to the live tracklist count."
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
        className="w-24 h-8 px-2 rounded-md border border-slate-200 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]"
        data-testid={`input-anticipated-tracks-${format}`}
      />
      <div className="text-xs text-slate-400 mt-1">
        {hasLive ? "from tracklist" : "Used until you upload masters."}
      </div>
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
}: {
  format: AlbumFormat;
  breakdown: {
    manufacturingCents: number;
    publishingCents: number;
    publishingTrackCount: number;
    paymentProcessingCents: number;
    goodtunesCents: number;
    source?: "hellbender" | "placeholder" | "catalog";
  };
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
        {breakdown.source && (
          <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
            {breakdown.source === "hellbender"
              ? "Source: Hellbender Vinyl reference matrix"
              : "Placeholder — per-plant matrix pending"}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

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
  bookletAddon,
  isBookletAnchor,
  onSaveBookletAddon,
  albumTitle,
  artistName,
  artistPhotoUrl,
  albumQuoteLockedAt = null,
}: {
  format: AlbumFormat;
  existing: AlbumSku | null;
  liveCost: PayoutFormatCost | null;
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
  // Task #579 — Booklet add-on parallel to signed_cert. The pill is
  // mounted only on the *anchor* SKU row (first 7" vinyl or cassette
  // in the configured-then-draft order), so two booklet-eligible rows
  // on the same album can't race-overwrite each other's plannedQuantity.
  bookletAddon?: AlbumAddon | null;
  isBookletAnchor?: boolean;
  onSaveBookletAddon?: (b: {
    priceCents: number;
    active: boolean;
    minPriceCents: number;
    plannedQuantity: number | null;
    artworkUrl?: string | null;
  }) => void;
  // Task #397 — forwarded into the GoodDeed cert preview tile.
  albumTitle?: string;
  artistName?: string;
  artistPhotoUrl?: string | null;
  // Task #433 — album-level Quote lock cascades to the row: when the
  // bigger Lock-in-quote CTA is engaged, every row is locked too
  // (visual + behavioural) so the album lock and per-row lock can't
  // disagree.
  albumQuoteLockedAt?: string | null;
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
  const [active, setActive] = useState(existing?.active ?? true);
  const [priceStr, setPriceStr] = useState(existing ? (existing.priceCents / 100).toFixed(2) : "");
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
  const initialTier = useMemo(() => {
    if (!tiers.length) return null;
    if (existing?.vinylColorTier) {
      const hit = tiers.find((t) => t.name === existing.vinylColorTier);
      if (hit) return hit;
    }
    return tiers[0];
  }, [tiers, existing?.vinylColorTier]);
  const [pressTierId, setPressTierId] = useState<string | null>(initialTier?.id ?? null);
  const pickedTier = tiers.find((t) => t.id === pressTierId) ?? initialTier ?? null;
  const initialColorId = useMemo(() => {
    if (!pickedTier || pickedTier.colors.length === 0) return null;
    if (existing?.vinylColor) {
      const hit = pickedTier.colors.find((c) => c.name === existing.vinylColor);
      if (hit) return hit.id;
    }
    return pickedTier.colors[0].id;
  }, [pickedTier, existing?.vinylColor]);
  const [pressColorId, setPressColorId] = useState<string | null>(initialColorId);
  // When tier changes, reset color to the first one in the new tier.
  useEffect(() => {
    if (!pickedTier) {
      if (pressColorId !== null) setPressColorId(null);
      return;
    }
    const stillThere = pickedTier.colors.find((c) => c.id === pressColorId);
    if (!stillThere) setPressColorId(pickedTier.colors[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedTier?.id]);

  const usingCatalog = !!catalogFormat && !!pickedTier;

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
    const saved = existing?.plannedQuantity;
    if (usingCatalog && pickedTier) {
      const snapped = snapCatalogLadder(pickedTier.priceLadder, saved ?? DEFAULT_VINYL_QUANTITY);
      return snapped?.qty ?? DEFAULT_VINYL_QUANTITY;
    }
    if (isVinyl) return snapToQuantityTier(saved ?? DEFAULT_VINYL_QUANTITY).tier;
    return saved ?? DEFAULT_VINYL_QUANTITY;
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
      if (existing && existing.costSnapshotManufacturingCents != null && !picksDirty) {
        return {
          manufacturingCents: existing.costSnapshotManufacturingCents,
          ...sideCarFor(true),
          source: "catalog" as const,
          needsQuote: false,
        };
      }
      return {
        manufacturingCents: catalogSnap?.unitCents ?? 0,
        ...sideCarFor(false),
        source: "catalog" as const,
        needsQuote: false,
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
      if (existing && existing.costSnapshotManufacturingCents != null && !picksDirty) {
        return {
          manufacturingCents: existing.costSnapshotManufacturingCents,
          ...sideCarFor(true),
          source: "hellbender" as const,
          needsQuote: false,
        };
      }
      const m = lookupHellbenderUnitCents({
        format,
        colorTier: vinylColor.tier,
        qtyTier: qtySnap.tier,
        jacketUpgrade,
      });
      // Task #456 — `lookupHellbenderUnitCents` returns null for vinyl
      // sizes we don't carry a per-rung matrix for (today: 12" Double
      // LP). The row still renders vinyl chrome, but we flag the
      // manufacturing cell as awaiting a manual quote so it doesn't
      // silently read as $0.00 (which made profit look free).
      return {
        manufacturingCents: m ?? 0,
        ...sideCarFor(false),
        source: "hellbender" as const,
        needsQuote: m === null,
      };
    }
    // Non-vinyl: snapshot wins until re-save (preserve #194 behaviour).
    // Mirror that for Publishing — if we have a manufacturing snapshot
    // we treat the row as locked and pull the snapshotted track count
    // too (Task #423).
    const hasSnapshot = existing?.costSnapshotManufacturingCents != null;
    const manufacturingCents = existing?.costSnapshotManufacturingCents
      ?? liveCost?.manufacturingCents
      ?? 0;
    return { manufacturingCents, ...sideCarFor(hasSnapshot), source: "placeholder" as const, needsQuote: false };
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
  ]);

  const totalCostCents = breakdown
    ? breakdown.manufacturingCents +
      breakdown.publishingCents +
      breakdown.paymentProcessingCents +
      breakdown.goodtunesCents
    : null;

  const priceCents = useMemo(() => parseDollars(priceStr), [priceStr]);
  const profitCents =
    priceCents !== null && totalCostCents !== null ? priceCents - totalCostCents : null;

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
  const [breakdownOpen, setBreakdownOpen] = useState(false);
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
  const totalCents = isVinyl
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
    (isVinyl && !usingCatalog && (vinylColorId !== storedColor || jacketUpgrade !== storedJacket)) ||
    catalogDirty ||
    trackCountDirty;

  const submit = () => {
    const cents = parseDollars(priceStr);
    if (cents === null) return;
    if (isVinyl) {
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
      stock: isVinyl
        ? null
        : (stockStr.trim() === "" ? null : Math.max(0, Math.floor(Number(stockStr)))),
      active,
      plannedQuantity: isVinyl
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
    if (!isVinyl) return;
    if (!dirty) return;
    // Task #433 — locked rows are read-only. Skip autosave so a stale
    // dirty flag from a pre-lock edit can't sneak through and mutate
    // the snapshot the artist just finalised.
    if (isLocked) return;
    const t = setTimeout(() => submit(), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dirty,
    isVinyl,
    isLocked,
    priceStr,
    parsedQty,
    vinylColorId,
    jacketUpgrade,
    active,
    pressTierId,
    pressColorId,
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

  return (
    <div
      className={[
        "rounded-md border bg-white p-4",
        isDraft ? "border-slate-200 bg-slate-50" : "border-slate-200",
      ].join(" ")}
      data-testid={isDraft ? `row-sku-draft-${format}` : `row-sku-${format}`}
    >
      {isVinyl ? (
        /* Task #393 — vinyl header mirrors the Tracks-row chrome:
           format name as the title on the left, hide-toggle + trash
           (destructive-confirm) + chevron on the right. No checkbox,
           no SaveLink, no bare ×. Format pivots happen via the
           Format dropdown inside the expanded REQUIRED body. */
        <div className={["flex items-center justify-between gap-2", expanded ? "mb-3" : ""].join(" ")}>
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
          <div className="flex-1 min-w-0 flex items-center gap-2">
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
            {!expanded && collapsedSummary && (
              <button
                type="button"
                onClick={() => onSetExpanded(true)}
                className="text-xs text-slate-500 truncate hover:text-slate-700 transition-colors"
                aria-label="Expand format"
                data-testid={`button-row-summary-${format}`}
              >
                {collapsedSummary}
              </button>
            )}
          </div>
            );
          })()}
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
              onClick={() => onSetExpanded(!expanded)}
              className="w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center transition-colors"
              aria-label={expanded ? "Collapse format" : "Expand format"}
              aria-expanded={expanded}
              data-testid={`button-toggle-sku-${format}`}
            >
              <ChevronDown className={["w-3.5 h-3.5 transition-transform", expanded ? "rotate-180" : ""].join(" ")} />
            </button>
          </div>
        </div>
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
              onClick={() => onSetExpanded(!expanded)}
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

      {expanded && (isVinyl ? (
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
          Required · Vinyl
        </span>
        <span className="flex-1 h-px bg-slate-200" aria-hidden />
      </div>
      {/* Task #390 — new two-column vinyl card. LEFT: format dropdown,
          big preview hero with pencil-on-hover (→ cover-art editor),
          color section + swatch row + selected color name, jacket.
          RIGHT: Retail Price, Select Qty, collapsible Profit with
          inline cost breakdown, Total. Non-vinyl rows keep the legacy
          grid below (else branch). */}
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
            }
          : vinylColor;
        const formatOptions = Array.from(new Set<AlbumFormat>([format, ...offeredFormats]));
        return (
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 items-start"
        data-testid={`vinyl-card-${format}`}
      >
        {/* LEFT */}
        <div className="space-y-3">
          {/* Format dropdown — pivot to any other offered format.
              Task #446 — 7" is pre-selected from the "+ Add physical
              good" menu; we render a read-only label so the operator
              doesn't see a second size pick. To switch off 7", delete
              the row and add a different format from the menu. */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
              Format
            </div>
            {sevenInch ? (
              <div
                className="h-8 inline-flex items-center text-sm font-medium text-slate-700"
                data-testid={`text-card-format-${format}`}
              >
                {ALBUM_FORMAT_LABEL[format]}
              </div>
            ) : (
              <Select
                value={format}
                onValueChange={(v) => onSwitchFormat(v as AlbumFormat)}
              >
                <SelectTrigger
                  className="h-8 w-full text-sm"
                  data-testid={`select-card-format-${format}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white text-slate-900 border-slate-200">
                  {formatOptions.map((f) => (
                    <SelectItem
                      key={f}
                      value={f}
                      data-testid={`option-card-format-${format}-${f}`}
                    >
                      {ALBUM_FORMAT_LABEL[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Preview hero — Task #393: pencil now lives INSIDE the
              jacket via VinylPreview's `jacketOverlay` slot so it only
              hovers over the album art, not the vinyl disc peeking out
              to the right. Same fade-on-hover the rest of admin uses
              for cover edits. */}
          <div className="relative">
            <button
              type="button"
              onClick={onEditArtwork}
              disabled={!onEditArtwork}
              className="group block w-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)] disabled:cursor-default"
              aria-label="Edit album artwork"
              data-testid={`button-edit-artwork-${format}`}
            >
              <div className="flex items-center justify-center">
                <VinylPreview
                  artworkUrl={artworkUrl}
                  color={previewColor}
                  jacketUpgrade={jacketUpgrade}
                  size="xl"
                  jacketOverlay={onEditArtwork ? (
                    <>
                      <span
                        className="absolute inset-0 bg-black/0 group-hover:bg-black/40 group-focus-visible:bg-black/40 transition-colors pointer-events-none"
                        aria-hidden
                      />
                      <span
                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity pointer-events-none"
                        aria-hidden
                      >
                        <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 inline-flex items-center justify-center shadow-lg ring-1 ring-black/5">
                          <Pencil className="w-4 h-4" />
                        </span>
                      </span>
                    </>
                  ) : null}
                />
              </div>
            </button>
          </div>

          {/* Color section + swatch row + selected color name */}
          {usingCatalog && pickedTier ? (
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
                          "w-7 h-7 rounded-full border-2 transition-transform",
                          selected
                            ? "border-[color:var(--brand-blue)] scale-110 shadow"
                            : "border-slate-200 hover:border-slate-400",
                        ].join(" ")}
                        style={{ background: c.swatchHex ?? "#ccc" }}
                        data-testid={`swatch-vinyl-color-${format}-${c.id}`}
                      >
                        <span className="sr-only">{c.name}</span>
                      </button>
                    );
                  })}
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

          {/* Jacket — Select for 7"; de-emphasized tag for 12"LP */}
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
          ) : (
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Jacket
              </div>
              <div
                className="h-8 inline-flex items-center text-sm font-medium text-slate-700"
                data-testid={`text-jacket-standard-${format}`}
              >
                {sevenInch
                  ? "Standard Full-Color Jacket"
                  : "Standard jacket — every 12\u201D LP ships in the standard jacket."}
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
          )}
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          {/* Retail Price */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                Retail Price
              </span>
              <InfoTip
                label="About retail price"
                testId={`info-price-${format}`}
                text="This is the price you want to charge per unit for your vinyl."
              />
            </div>
            {/* "$" lives INSIDE the input as an absolute prefix so the
                input's left edge lines up with the Select Qty trigger
                and Anticipated Tracks input below — keeping every
                control on this right column flush-left (Bill #1). */}
            <div className="flex flex-col">
              <div className="relative w-28">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                  $
                </span>
                <input
                  type="text"
                  value={priceStr}
                  onChange={(e) => setPriceStr(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                  className={`w-full pl-5 ${fieldClass}`}
                  data-testid={`input-price-${format}`}
                />
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Per unit sold to fans.
              </div>
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
                testId={`info-qty-${format}`}
                text="Your margin will improve based on quantity. This estimate is for you to choose the absolute lowest quantity you believe you'll sell — anything above that is more profit due to lower per-unit costs from scale."
              />
            </div>
            {quantityRungs.length > 0 ? (
              <Select
                value={String(parsedQty)}
                onValueChange={(v) => setParsedQty(Number.parseInt(v, 10))}
              >
                <SelectTrigger
                  className="h-8 w-full text-sm"
                  data-testid={`select-sku-quantity-${format}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white text-slate-900 border-slate-200">
                  {quantityRungs.map((q) => (
                    <SelectItem
                      key={q}
                      value={String(q)}
                      data-testid={`option-sku-quantity-${format}-${q}`}
                    >
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
            {!usingCatalog && qtySnap.requiresQuote && (
              <div
                className="text-xs text-slate-500 mt-1"
                data-testid={`text-qty-tier-${format}`}
              >
                {qtySnap.tier}+ — request a custom quote
              </div>
            )}
            {usingCatalog && catalogSnap?.requiresQuote && (
              <div
                className="text-xs text-slate-500 mt-1"
                data-testid={`text-qty-tier-${format}`}
              >
                {catalogSnap.qty}+ — request a custom quote
              </div>
            )}
          </div>

          {/* Task #429 — Anticipated tracks. Drives the Publishing
              line of the cost breakdown before any masters have been
              uploaded. Once songs are uploaded the field shows the
              live count and is disabled. Saves on blur via the
              album-level PUT (debounced by the operator's typing). */}
          <AnticipatedTracksInput
            format={format}
            liveTrackCount={liveTrackCount ?? 0}
            anticipatedTrackCount={anticipatedTrackCount ?? null}
            persistedAnticipatedTrackCount={persistedAnticipatedTrackCount ?? null}
            lockedValue={sevenInch ? SEVEN_INCH_TRACK_COUNT : null}
            onLocalChange={onAnticipatedTrackLocalChange}
            onChange={onAnticipatedTrackCountChange}
          />

          {/* Profit — collapsible inline breakdown */}
          <div>
            <button
              type="button"
              onClick={() => setBreakdownOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-2 text-left rounded-md hover:bg-slate-50 -mx-1 px-1 py-0.5 transition-colors"
              aria-expanded={breakdownOpen}
              data-testid={`button-toggle-breakdown-${format}`}
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
                    breakdownOpen ? "rotate-180" : "",
                  ].join(" ")}
                />
              </span>
              <span
                className={[
                  "tabular-nums text-base font-semibold",
                  profitPending
                    ? "text-slate-300"
                    : lossColor
                      ? "text-[color:var(--brand-pink)]"
                      : "text-slate-900",
                ].join(" ")}
                data-testid={`text-profit-${format}`}
              >
                {profitLabel}
              </span>
            </button>
            {breakdownOpen && breakdown && (
              <div
                className="mt-2 ml-1 pl-3 border-l border-slate-200 space-y-1"
                data-testid={`breakdown-${format}`}
              >
                <div className="flex items-center justify-between gap-6 text-xs text-slate-600">
                  <span>Manufacturing</span>
                  <span className="tabular-nums">{dollars(breakdown.manufacturingCents)}</span>
                </div>
                <div className="flex items-center justify-between gap-6 text-xs text-slate-600">
                  <span>Publishing: ($0.127 × 2 [vinyl+digital]) × {breakdown.publishingTrackCount} tracks</span>
                  <span className="tabular-nums">{dollars(breakdown.publishingCents)}</span>
                </div>
                <div className="flex items-center justify-between gap-6 text-xs text-slate-600">
                  <span>Payment processing</span>
                  <span className="tabular-nums">{dollars(breakdown.paymentProcessingCents)}</span>
                </div>
                <div className="flex items-center justify-between gap-6 text-xs text-slate-600">
                  <span>GoodTunes</span>
                  <span className="tabular-nums">{dollars(breakdown.goodtunesCents)}</span>
                </div>
                <div className="flex items-center justify-between gap-6 text-xs text-slate-900 font-semibold pt-1.5 border-t border-slate-100 mt-1">
                  <span>Cost / unit</span>
                  <span
                    className="tabular-nums"
                    data-testid={`text-cost-${format}`}
                  >
                    {totalCostCents === null ? "—" : dollars(totalCostCents)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Total */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                  Total
                </span>
                <InfoTip
                  label="About total"
                  testId={`info-total-${format}`}
                  text="Estimated total revenue at this quantity and price."
                />
              </span>
              <span
                className={[
                  "tabular-nums text-base font-semibold",
                  totalCents === null
                    ? "text-slate-300"
                    : totalCents < 0
                      ? "text-[color:var(--brand-pink)]"
                      : "text-slate-900",
                ].join(" ")}
                data-testid={`text-total-${format}`}
              >
                {totalCents === null
                  ? "$0.00"
                  : totalCents < 0
                    ? `-${dollars(Math.abs(totalCents))}`
                    : dollars(totalCents)}
              </span>
            </div>
          </div>
        </div>
      </div>
        );
      })()}
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
          Optional · Upsells
        </span>
        <span className="flex-1 h-px bg-slate-200" aria-hidden />
      </div>
      {albumId && onSaveAddon && isPrimaryVinyl ? (
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
        />
      ) : null}
      {/* Task #579 — Booklet pill. Anchors to the first booklet-eligible
          SKU row (7" vinyl or cassette) so only one is rendered per
          album, mirroring the isPrimaryVinyl gate on GoodDeedPill. */}
      {albumId && onSaveBookletAddon && isBookletAnchor ? (
        <div className="mt-3">
          <BookletPill
            albumId={albumId}
            existing={bookletAddon ?? null}
            onSave={onSaveBookletAddon}
          />
        </div>
      ) : null}
      </div>
      ) : (
      <>
      <div className={["grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4"].join(" ")}>
        {/* Left column — Price / Cost / Profit */}
        <div className="space-y-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Price · Cost · Profit
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 text-xs">Price $</span>
            <input
              type="text"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className={`w-28 ${fieldClass}`}
              data-testid={`input-price-${format}`}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 text-xs inline-flex items-center gap-1">
              Cost $
              {breakdown && (
                <CostTooltip format={format} breakdown={breakdown} />
              )}
              <span
                className={[
                  "text-xs",
                  breakdown?.needsQuote ? "text-[color:var(--brand-blue)]" : "text-slate-400",
                ].join(" ")}
                data-testid={`text-cost-source-${format}`}
              >
                ({usingCatalog
                  ? (existing?.costSnapshotManufacturingCents != null ? "locked · catalog" : "live · catalog")
                  : isVinyl
                    ? (breakdown?.needsQuote
                        ? "needs quote"
                        : existing?.costSnapshotManufacturingCents != null
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
          {!isVinyl && (
            <div
              className="text-[11px] text-slate-400 leading-snug -mt-1.5"
              data-testid={`text-cost-nonvinyl-note-${format}`}
            >
              Quoted manually — Hellbender doesn't press this format.
            </div>
          )}
          {isVinyl && breakdown?.needsQuote && (
            <div
              className="text-xs text-[color:var(--brand-blue)] leading-snug -mt-1.5"
              data-testid={`text-cost-needs-quote-${format}`}
            >
              Awaiting Hellbender quote for {ALBUM_FORMAT_LABEL[format]} — manufacturing reads as $0 until a quote lands. Ping Bill.
            </div>
          )}

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
            qty + TBD branch (out of scope for Task #385). */}
        {isVinyl ? (
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

          {estimatedSold !== null && (
            <div
              className="text-[11.5px] text-slate-400 text-right"
              data-testid={`text-total-caveat-${format}`}
            >
              If {estPct === "custom" ? estimatedSold : `${estPct}%`} ({estimatedSold.toLocaleString()} {estimatedSold === 1 ? "unit" : "units"}) sell.
            </div>
          )}
          {!usingCatalog && qtySnap.requiresQuote && (
            <div
              className="text-[11.5px] text-slate-500 text-right"
              data-testid={`text-qty-tier-${format}`}
            >
              {qtySnap.tier}+ — request a custom quote
            </div>
          )}
          {usingCatalog && catalogSnap?.requiresQuote && (
            <div
              className="text-[11.5px] text-slate-500 text-right"
              data-testid={`text-qty-tier-${format}`}
            >
              {catalogSnap.qty}+ — request a custom quote
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
async function uploadAdminImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const token = getAuthToken();
  if (!token) throw new Error("Sign out and back in — your session token is missing.");
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

function BookletPill({
  albumId,
  existing,
  onSave,
}: {
  albumId: string;
  existing: AlbumAddon | null;
  onSave: (b: {
    priceCents: number;
    active: boolean;
    minPriceCents: number;
    plannedQuantity: number | null;
    artworkUrl?: string | null;
  }) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(existing?.active ?? false);
  const [priceStr, setPriceStr] = useState(
    existing ? (existing.priceCents / 100).toFixed(2) : "9.99",
  );
  const [floorStr, setFloorStr] = useState(
    existing ? (existing.minPriceCents / 100).toFixed(2) : "4.99",
  );
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  // Quantity snaps to a PMP rung. "other" lets the operator type a
  // custom planned-run, which the server snaps UP to the next rung
  // anyway — we surface the snapped value live via the preview query.
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

  // Live PMP tier preview — mirrors the GoodDeedPill query shape so
  // costCents has the same `totalPerUnitCents` field to read from.
  const { data: preview } = useQuery<{
    snappedQty: number;
    totalPerUnitCents: number;
    runTotalCents: number;
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
        // Don't re-send artworkUrl here — upload/remove mutations own
        // that field. Sending null on every debounce would clobber an
        // in-flight upload.
      });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, priceStr, floorStr, active, resolvedQty]);

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
    <div
      className="rounded-md border border-slate-200 bg-white"
      data-testid="pill-booklet"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
        aria-expanded={open}
        data-testid="button-toggle-booklet-pill"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13.5px] font-semibold text-slate-900">
            16-Page Booklet
          </span>
          <span
            className="text-xs text-slate-500 truncate"
            data-testid="text-booklet-summary"
          >
            · {summary}
          </span>
        </div>
        <ChevronDown
          className={[
            "w-4 h-4 text-slate-400 transition-transform flex-shrink-0",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-3 border-t border-slate-100 space-y-4">
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
              Add 16-Page Booklet (PMP)
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

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    Select Qty
                  </span>
                  <InfoTip
                    label="About booklet quantity"
                    testId="info-booklet-qty"
                    text="PMP only quotes 500 / 1000 / 2000 / 5000 runs. Anything else snaps UP to the next rung."
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
                            PMP Wholesale ({snappedQty.toLocaleString()} run)
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
        </div>
      )}
    </div>
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
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(existing?.active ?? false);
  const [priceStr, setPriceStr] = useState(
    existing ? (existing.priceCents / 100).toFixed(2) : "12.99",
  );
  const [floorStr, setFloorStr] = useState(
    existing ? (existing.minPriceCents / 100).toFixed(2) : "4.99",
  );
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
    if (!existing?.plannedQuantity || vinylQty <= 0) return "100";
    const pct = Math.round((existing.plannedQuantity / vinylQty) * 100);
    if ([100, 50, 25, 20].includes(pct)) return String(pct);
    return "other";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pctChoice, setPctChoice] = useState<string>(initialPctChoice);
  // Task #393 — "Other…" is a RAW QUANTITY, not a percentage. The
  // dropdown is for the four canned ratios (100/50/25/20); when the
  // operator needs an odd run (e.g. "only the first 37 buyers get a
  // cert") they type the cert count directly and we clamp it to the
  // vinyl qty (a cert run > pressing run makes no sense).
  const [otherQtyStr, setOtherQtyStr] = useState(
    initialPctChoice === "other" && existing?.plannedQuantity
      ? String(existing.plannedQuantity)
      : String(Math.max(1, Math.round(vinylQty / 10))),
  );

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
  // Task #511 — Prefer the qty-driven tier preview so the operator sees
  // wholesale move as they scrub Select Qty. The snapshot stays in the
  // DB (and continues to inform sale-time / statement readouts) but no
  // longer overrides the live preview here. Falls back to snapshot or
  // live platform cost when the preview hasn't returned yet.
  const costCents: number | null =
    preview?.totalPerUnitCents ??
    existing?.costCentsSnapshot ??
    livePlatformCostCents ??
    null;
  const earnsCents =
    priceCents !== null && costCents !== null ? priceCents - costCents : null;

  const storedActive = existing?.active ?? false;
  const storedPrice = existing ? (existing.priceCents / 100).toFixed(2) : "12.99";
  const storedFloor = existing ? (existing.minPriceCents / 100).toFixed(2) : "4.99";
  const storedQty = existing?.plannedQuantity ?? null;
  const dirty =
    active !== storedActive ||
    priceStr !== storedPrice ||
    floorStr !== storedFloor ||
    (resolvedQty || null) !== storedQty;

  // Debounced autosave — same 700ms beat as the SkuRow's own vinyl
  // autosave so the experience is consistent across the card.
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
    <div
      className="rounded-md border border-slate-200 bg-white"
      data-testid="pill-gooddeed"
    >
      {/* Task #441 — Apple HIG: master on/off lives INSIDE the panel
          it controls; the collapsed header is a single tappable row
          with the disclosure chevron at the far trailing edge (down
          collapsed / up expanded). 44pt min-height keeps the hit
          target HIG-compliant even though admin chrome is denser. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
        aria-expanded={open}
        data-testid="button-toggle-gooddeed-pill"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13.5px] font-semibold text-slate-900">
            GoodDeed® Certificate
          </span>
          <span
            className="text-xs text-slate-500 truncate"
            data-testid="text-gooddeed-summary"
          >
            · {summary}
          </span>
        </div>
        <ChevronDown
          className={[
            "w-4 h-4 text-slate-400 transition-transform flex-shrink-0",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-3 border-t border-slate-100 space-y-4">
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
              onCheckedChange={setActive}
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
            {/* LEFT — enlarged cert mock. Album art on top, navy
                band (brand bg) with album title + artist + GoodDeed
                mark, then the cert paragraph + founder signature
                line. The QR code is per-fan and gets generated at
                print time, so no placeholder shown here. The album-
                art tile keeps the pencil-on-hover affordance that
                opens the shared cover-art editor — single source of
                truth on `albums.artwork`. */}
            <div
              className="rounded-md border border-slate-200 bg-white overflow-hidden shadow-sm"
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
                  Middle = three full-width body bars (cert body copy).
                  Bottom-left = real Will signature overlaid on a wider
                  bar; bottom-right = solid square QR placeholder. No
                  founder caption, no mint, no QR finder pattern —
                  reads as a pure wireframe template. */}
              {/* Compact archival-strip footer — art dominates ~80% of
                  the composition, the cert strip is a thin premium
                  band carrying only owner/serial bars + signature + QR.
                  Body-copy bars dropped to keep the strip dense and
                  collectible, not panel-like. */}
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

                {/* Bottom row — signature overlaid on a bar (left), small square QR placeholder (right) */}
                <div className="flex items-end justify-between gap-3">
                  <div className="flex-1 min-w-0 relative" aria-label="Founder signature" data-testid="signature-gooddeed">
                    <div className="h-2 w-[60%] rounded-full" style={{ background: "rgba(255,255,255,0.32)" }} aria-hidden />
                    <img
                      src="/will-signature.png"
                      alt="Will Bowen, Founder"
                      className="absolute left-0 bottom-0 h-7 w-auto max-w-[55%] object-contain object-left-bottom select-none"
                      draggable={false}
                    />
                  </div>
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
                      onChange={(e) => setPriceStr(e.target.value)}
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
                <Select value={pctChoice} onValueChange={setPctChoice}>
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
                    onChange={(e) => setOtherQtyStr(e.target.value)}
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
                          <span className="text-slate-600">
                            GoodDeed Wholesale
                          </span>
                          <span
                            className="text-slate-900"
                            data-testid="text-gooddeed-wholesale"
                          >
                            {dollars(costCents)}
                          </span>
                        </div>
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

        </div>
      )}
    </div>
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
  const [price, setPrice] = useState(existing ? (existing.priceCents / 100).toFixed(2) : "12.99");
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
  const storedPrice = existing ? (existing.priceCents / 100).toFixed(2) : "12.99";
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
