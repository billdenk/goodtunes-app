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
import { useEffect, useMemo, useState } from "react";
import { useExclusiveDisclosure } from "@/hooks/useExclusiveDisclosure";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, X, Info, MapPin, Clock, ChevronDown, Pencil } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { pressTurnaroundLabel } from "@/lib/pressTurnaround";
import { useToast } from "@/hooks/use-toast";
import { AddEntityButton } from "@/components/admin/AddEntityButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ALBUM_FORMATS,
  ALBUM_FORMAT_LABEL,
  type AlbumFormat,
  type AlbumSku,
  type AlbumAddon,
  type PayoutSettings,
  type PayoutFormatCost,
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
import { PressingOrderStepper, GoToPressButton } from "@/components/admin/PressingOrderFlow";
import { SignedCertVendorPanel } from "@/components/admin/SignedCertVendorPanel";
import { CertSaleWindowPanel } from "@/components/admin/CertSaleWindowPanel";

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
const parseDollars = (v: string): number | null => {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

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
  artworkUrl = null,
  sellMode = "direct",
  physicalFormat = null,
  sellQuoteLockedAt = null,
  onLockToggle,
  onChangeMode,
  onEditArtwork,
}: {
  albumId: string;
  artworkUrl?: string | null;
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
  /** Task #390 — opens the album cover-art editor modal. Wired from
   *  AdminAlbum so the per-format card's preview hover-pencil opens
   *  the same drop-zone the page header thumbnail does. */
  onEditArtwork?: () => void;
}) {
  const { toast } = useToast();
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

  return (
    <div className="py-6">
      <div className="max-w-3xl">
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
        <div className="mb-8">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[15px] font-semibold text-slate-900">Formats</h2>
            {availableFormats.length > 0 && (
              <AddPhysicalGoodButton
                availableFormats={availableFormats}
                onAdd={(format) =>
                  setDraftFormats((prev) => (prev.includes(format) ? prev : [...prev, format]))
                }
              />
            )}
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Toggle a format on and set its price. Only enabled formats appear on the fan's Buy sheet.
          </p>
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
                            onSuccess: () =>
                              setDraftFormats((prev) => prev.filter((d) => d !== f)),
                          });
                        }}
                        onDelete={() => setDraftFormats((prev) => prev.filter((d) => d !== f))}
                        expanded={skuDisclosure.isOpen(`draft-${f}`)}
                        onSetExpanded={(open) => skuDisclosure.setOpen(`draft-${f}`, open)}
                      />
                    ))}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Signed cert */}
        <div className="mb-8">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-1">Printed & Signed GoodDeed®</h2>
          <p className="text-sm text-slate-500 mb-4">
            Optional add-on for every order. Fans see a single toggle on the Buy sheet with this price.
            Your per-unit earnings are computed live against the platform's certificate cost — the
            platform price locks in when you Save.
          </p>
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <AddonForm
              existing={signedAddon ?? null}
              livePlatformCostCents={payoutSettings?.certCostCents ?? null}
              onSave={upsertAddon.mutate}
            />
          </div>
          {/* Task #245 — per-leg vendor assignment + live wholesale
              calculator. Sits under the AddonForm so the operator
              edits the fan-facing price first, then routes the run. */}
          <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
            <SignedCertVendorPanel albumId={albumId} />
          </div>
          {/* Task #246 — Sale-window batch workflow. */}
          <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
            <CertSaleWindowPanel albumId={albumId} />
          </div>
        </div>

        {/* Task #335 — "Lock in quote" CTA. Until the operator hits
            this, the rest of the album tabs (Press, Bonus) stay
            hidden — see visibleTabsFor() in AdminAlbum. Reversible
            via "Unlock" until the run is actually at press. */}
        {(() => {
          // Task #335 — lock action stays disabled until the artist
          // has actually built a quote: at least one active SKU, every
          // active SKU has a price, and every active SKU has a planned
          // quantity. Mirrors the package/price/quantity stages on the
          // top stepper so the two never disagree.
          const active = data.skus.filter((s) => s.active);
          const quoteReady =
            active.length > 0 &&
            active.every((s) => (s.priceCents ?? 0) > 0) &&
            active.every((s) => (s.plannedQuantity ?? 0) > 0);
          return (
            <LockQuoteCTA
              locked={!!sellQuoteLockedAt}
              disabled={!sellQuoteLockedAt && !quoteReady}
              onToggle={() => onLockToggle?.(!sellQuoteLockedAt)}
            />
          );
        })()}

        {/* Task #225 — terminal "Go to Press" action stays at the
            bottom, but only matters once the quote is locked. */}
        {sellQuoteLockedAt && (
          <GoToPressButton albumId={albumId} skus={data.skus} />
        )}
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

  const { data } = useQuery<Manufacturer[]>({
    queryKey: ["/api/manufacturers"],
    enabled: !locked,
  });
  const presses = data ?? [];
  const hellbender = presses.find((p) => p.name.toLowerCase().includes("hellbender")) ?? null;

  type Chip = { id: string; label: string; status: "live" | "coming-soon"; press: Manufacturer | null };
  const chips: Chip[] = locked
    ? [{ id: "invited", label: invitedPress!.name, status: "live", press: invitedPress }]
    : [
        { id: "hellbender", label: "Hellbender Vinyl", status: "live", press: hellbender },
        { id: "mrp", label: "MRP", status: "coming-soon", press: null },
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

/* ─── Task #335 — Lock-in-quote CTA ────────────────────────────────── */
function LockQuoteCTA({
  locked,
  disabled = false,
  onToggle,
}: {
  locked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mt-6 mb-6 rounded-lg border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-slate-900">
            {locked
              ? "Quote locked in."
              : disabled
                ? "Finish your quote to lock it in."
                : "Lock in this quote to keep going."}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {locked
              ? "Press + Bonus tabs are unlocked. Unlock to keep editing the quote."
              : disabled
                ? "Pick a package, set a price, and choose a planned quantity above — then you can lock the quote and continue."
                : "Locks the printer, colors, and quantity. Unlocks Press + Bonus tabs above. Reversible until the run goes to press."}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          data-testid={locked ? "button-unlock-quote" : "button-lock-quote"}
          className={[
            "h-10 px-4 rounded-full text-sm font-bold transition-all",
            locked
              ? "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              : disabled
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-[color:var(--brand-blue)] text-white hover:brightness-110 shadow-sm",
          ].join(" ")}
        >
          {locked ? "Unlock quote" : "Lock in quote"}
        </button>
      </div>
    </div>
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
  onUpsertAddon,
}: {
  albumId: string;
  payoutSettings: PayoutSettings | null;
  signedAddon: any | null;
  sellQuoteLockedAt: string | null;
  onLockToggle?: (next: boolean) => void;
  onChangeMode?: () => void;
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
            data-testid="button-change-sell-mode"
            className="text-xs font-semibold text-[color:var(--brand-blue)] hover:underline shrink-0"
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
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <AddonForm
            existing={signedAddon ?? null}
            livePlatformCostCents={payoutSettings?.certCostCents ?? null}
            onSave={onUpsertAddon}
          />
        </div>
        <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
          <SignedCertVendorPanel albumId={albumId} />
        </div>
        <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
          <CertSaleWindowPanel albumId={albumId} />
        </div>
      </div>

      {/* Task #335 — Shopify mode lock CTA. The slim panel has no
          quote completeness requirements (the addon is optional), so
          the lock is always available; flipping it on unlocks the
          Shopify + Bonus tabs above so the operator can finish the
          product mapping and any digital-only bonuses. Reversible. */}
      <LockQuoteCTA
        locked={!!sellQuoteLockedAt}
        onToggle={() => onLockToggle?.(!sellQuoteLockedAt)}
      />
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
    paymentProcessingCents: number;
    goodtunesCents: number;
    source?: "hellbender" | "placeholder";
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
        <Row label="Publishing" cents={breakdown.publishingCents} />
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
  offeredFormats: AlbumFormat[];
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
  }) => void;
  onDelete: () => void;
  // Exclusive-disclosure: owned by SellPanel via `useExclusiveDisclosure`.
  // Draft rows auto-open on mount so the operator can start editing
  // immediately; existing rows open on click. See docs/design-system.md
  // ("Expandable row lists").
  expanded: boolean;
  onSetExpanded: (open: boolean) => void;
}) {
  const isDraft = existing === null;
  const isVinyl = isVinylFormat(format);
  // Draft rows auto-open on first mount — the operator just picked the
  // format from the "+ Add" menu and clearly wants to start editing.
  useEffect(() => {
    if (isDraft && !expanded) onSetExpanded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [active, setActive] = useState(existing?.active ?? true);
  const [priceStr, setPriceStr] = useState(existing ? (existing.priceCents / 100).toFixed(2) : "");
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
    existing?.vinylColor && VINYL_COLOR_BY_ID[existing.vinylColor]
      ? existing.vinylColor
      : DEFAULT_VINYL_COLOR_ID,
  );
  const vinylColor: VinylColorOption = VINYL_COLOR_BY_ID[vinylColorId] ?? VINYL_COLOR_BY_ID[DEFAULT_VINYL_COLOR_ID];
  // Task #385 — legacy color "section" (tier). Picking a section
  // filters the swatch row to that tier and auto-selects its first
  // color.
  const [legacyColorTier, setLegacyColorTier] = useState<import("@shared/pressing").VinylColorTier>(
    vinylColor.tier,
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
  // Task #385 — 12"LP always ships with the standard jacket. For 7"
  // we still allow the jacket-upgrade picker since Hellbender's 7"
  // ladders price gatefold + insert variants too.
  const jacketDropdownAllowed = isVinyl && format !== "12_lp";
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

  // Live Cost computation. Vinyl recomputes Manufacturing from the
  // Hellbender matrix every time the artist changes picks, so they
  // see the new cost immediately (the snapshot still locks at Save).
  // Non-vinyl formats fall back to the existing #194 snapshot/live
  // placeholder rule.
  const breakdown = useMemo(() => {
    const sideCarCents = existing && existing.costSnapshotManufacturingCents != null
      ? {
          publishingCents: existing.costSnapshotPublishingCents ?? 0,
          paymentProcessingCents: existing.costSnapshotPaymentProcessingCents ?? 0,
          goodtunesCents: existing.costSnapshotGoodtunesCents ?? 0,
        }
      : liveCost
        ? {
            publishingCents: liveCost.publishingCents,
            paymentProcessingCents: liveCost.paymentProcessingCents,
            goodtunesCents: liveCost.goodtunesCents,
          }
        : null;
    if (!sideCarCents) return null;
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
          ...sideCarCents,
          source: "catalog" as const,
        };
      }
      return {
        manufacturingCents: catalogSnap?.unitCents ?? 0,
        ...sideCarCents,
        source: "catalog" as const,
      };
    }
    if (isVinyl) {
      // Snapshot-at-save semantics: if the row is saved AND the
      // artist hasn't changed any of the picks the matrix is keyed
      // by, show the locked snapshot so the cost is stable until
      // they explicitly re-save (mirroring #194). If picks ARE
      // dirty, recompute live so the artist sees the new cost as
      // they tweak; that new number gets snapshotted on Save.
      const storedColorId = existing?.vinylColor ?? DEFAULT_VINYL_COLOR_ID;
      const storedJacketLocal = (existing?.jacketUpgrade as JacketUpgrade | null | undefined) ?? DEFAULT_JACKET_UPGRADE;
      const storedTier = existing?.quantityTier ?? null;
      const picksDirty =
        vinylColorId !== storedColorId ||
        jacketUpgrade !== storedJacketLocal ||
        (storedTier !== null && qtySnap.tier !== storedTier);
      if (existing && existing.costSnapshotManufacturingCents != null && !picksDirty) {
        return {
          manufacturingCents: existing.costSnapshotManufacturingCents,
          ...sideCarCents,
          source: "hellbender" as const,
        };
      }
      const m = lookupHellbenderUnitCents({
        format,
        colorTier: vinylColor.tier,
        qtyTier: qtySnap.tier,
        jacketUpgrade,
      });
      return {
        manufacturingCents: m ?? 0,
        ...sideCarCents,
        source: "hellbender" as const,
      };
    }
    // Non-vinyl: snapshot wins until re-save (preserve #194 behaviour).
    const manufacturingCents = existing?.costSnapshotManufacturingCents
      ?? liveCost?.manufacturingCents
      ?? 0;
    return { manufacturingCents, ...sideCarCents, source: "placeholder" as const };
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
  const storedColor = existing?.vinylColor ?? DEFAULT_VINYL_COLOR_ID;
  const storedJacket = (existing?.jacketUpgrade as JacketUpgrade | null | undefined) ?? DEFAULT_JACKET_UPGRADE;
  // Task #218 — catalog picks dirty when tier or color id differs from
  // initial. We compare by id, not by snapshot name, so reopening a
  // saved row doesn't appear dirty.
  const catalogDirty =
    usingCatalog &&
    (pressTierId !== (initialTier?.id ?? null) || pressColorId !== initialColorId);
  const dirty =
    active !== storedActive ||
    priceStr !== storedPrice ||
    (isVinyl
      ? parsedQty !== storedQty
      : (stockStr !== storedStock ||
         qtyMode !== initialQtyMode ||
         (qtyMode === "fixed" && legacyParsedQty !== storedQty))) ||
    (isVinyl && !usingCatalog && (vinylColorId !== storedColor || jacketUpgrade !== storedJacket)) ||
    catalogDirty;

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
    });
  };

  const lossColor = profitCents !== null && profitCents < 0;
  const profitLabel =
    profitCents === null
      ? "—"
      : profitCents < 0
        ? `-${dollars(Math.abs(profitCents))}`
        : dollars(profitCents);

  return (
    <div
      className={[
        "rounded-md border bg-white p-4",
        isDraft ? "border-slate-200 bg-slate-50" : "border-slate-200",
      ].join(" ")}
      data-testid={isDraft ? `row-sku-draft-${format}` : `row-sku-${format}`}
    >
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

      {expanded && (isVinyl ? (
      // Task #390 — new two-column vinyl card. LEFT: format dropdown,
      // big preview hero with pencil-on-hover (→ cover-art editor),
      // color section + swatch row + selected color name, jacket.
      // RIGHT: Retail Price, Select Qty, collapsible Profit with
      // inline cost breakdown, Total. Non-vinyl rows keep the legacy
      // grid below (else branch).
      (() => {
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
          {/* Format dropdown — pivot to any other offered format */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
              Format
            </div>
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
          </div>

          {/* Preview hero — pencil on hover opens the cover-art editor */}
          <div className="relative group">
            <button
              type="button"
              onClick={onEditArtwork}
              disabled={!onEditArtwork}
              className="block w-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)] disabled:cursor-default"
              aria-label="Edit album artwork"
              data-testid={`button-edit-artwork-${format}`}
            >
              <div className="flex items-center justify-center">
                <VinylPreview
                  artworkUrl={artworkUrl}
                  color={previewColor}
                  jacketUpgrade={jacketUpgrade}
                  size="xl"
                />
              </div>
              {onEditArtwork && (
                <span
                  className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/90 text-slate-700 shadow opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-hidden
                >
                  <Pencil className="w-3.5 h-3.5" />
                </span>
              )}
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
                  {VINYL_COLOR_TIER_ORDER.map((t) => (
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
            <div
              className="text-xs text-slate-400"
              data-testid={`text-jacket-standard-${format}`}
            >
              Standard jacket — every 12&quot;LP ships in the standard jacket.
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
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">$</span>
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
            <div className="text-xs text-slate-400 mt-1">
              Per unit sold to fans.
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
                  "tabular-nums text-sm font-semibold",
                  lossColor ? "text-[color:var(--brand-pink)]" : "text-slate-900",
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
                  <span>Publishing</span>
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
          </div>
        </div>
      </div>
        );
      })()
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
                className="text-slate-400 text-[11px]"
                data-testid={`text-cost-source-${format}`}
              >
                ({usingCatalog
                  ? (existing?.costSnapshotManufacturingCents != null ? "locked · catalog" : "live · catalog")
                  : isVinyl
                    ? (existing?.costSnapshotManufacturingCents != null ? "locked · Hellbender" : "live · Hellbender")
                    : "placeholder"})
              </span>
            </span>
            <span
              className="w-28 text-right tabular-nums text-[13.5px] text-slate-700"
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
  existing,
  livePlatformCostCents,
  onSave,
}: {
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
  const readoutCost = lockedCost ?? livePlatformCostCents;

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
