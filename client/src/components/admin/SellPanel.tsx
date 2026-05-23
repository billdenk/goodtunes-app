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
import { Plus, X, Info, MapPin, Clock, Lock, ChevronDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AddEntityButton } from "@/components/admin/AddEntityButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { UploadValidationsPanel } from "@/components/admin/UploadValidationsPanel";
import { PressingOrderStepper, GoToPressButton } from "@/components/admin/PressingOrderFlow";
import { PrintPdfsPanel } from "@/components/admin/PrintPdfsPanel";

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

export function SellPanel({ albumId, artworkUrl = null }: { albumId: string; artworkUrl?: string | null }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<SellResponse>({ queryKey: ["/api/admin/albums", albumId, "skus"] });
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

  if (isLoading || !data) return <div className="text-slate-500 text-sm py-6">Loading…</div>;

  const skuByFormat = new Map(data.skus.map((s) => [s.format as AlbumFormat, s]));
  const signedAddon = data.addons.find((a) => a.kind === "signed_cert");

  // Task #218 — when this album is invited by a press that has built
  // its catalog, restrict the Add-Physical menu to the formats that
  // catalog offers. Free / non-invited albums keep the full
  // ALBUM_FORMATS list so the SellPanel still works without a press.
  const catalogByFormat = useMemo(() => {
    const m = new Map<AlbumFormat, CatalogFormatRow>();
    (invitedPress?.catalog?.formats ?? []).forEach((f) => m.set(f.format, f));
    return m;
  }, [invitedPress]);
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
        {/* Task #225 — five-stage progress strip (Select package → Upload
            art → Set price → Select quantity → Go to Press!). Frames
            every Sell-panel session so artists always know what's next
            and what's blocking submission. */}
        <PressingOrderStepper albumId={albumId} skus={data.skus} />

        {/* Task #216 — preflight art/audio against the picked plant's
            specs. Sits above Presses so failing checks surface BEFORE
            the operator commits to a vendor below. */}
        <UploadValidationsPanel albumId={albumId} />

        {/* Task #217 — compose vendor-shaped print PDFs from artwork. */}
        <PrintPdfsPanel albumId={albumId} />

        {/* Presses */}
        <PressesPanel albumId={albumId} invited={invitedPress ?? null} />

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
          <p className="text-[13px] text-slate-500 mb-4">
            Toggle a format on and set its price. Only enabled formats appear on the fan's Buy sheet.
          </p>
          {configuredFormats.length === 0 && liveDrafts.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-white p-8 text-center">
              <div className="text-slate-700 text-[13.5px] font-medium">No physical formats yet</div>
              <div className="text-slate-500 text-[12.5px] mt-1">
                Add a vinyl, cassette, or CD to start selling.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
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
            </div>
          )}
        </div>

        {/* Signed cert */}
        <div className="mb-8">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-1">Printed & Signed GoodDeed®</h2>
          <p className="text-[13px] text-slate-500 mb-4">
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
        </div>

        {/* Task #225 — terminal action of the stepper above. Only lights
            up when stages 0-3 are complete; surfaces the same submission
            state as the stepper when one is in flight. */}
        <GoToPressButton albumId={albumId} skus={data.skus} />
      </div>
    </div>
  );
}

// Shared form-control styling so every input on this panel matches
// the admin token set (hairline border, brand-blue focus ring).
const fieldClass =
  "h-8 rounded-md border border-slate-200 bg-white px-2 text-[13px] text-slate-900 " +
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
        "h-8 px-2.5 rounded-md text-[12px] font-medium transition-colors " +
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
                className="w-full text-left px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
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

// Task #194 — Presses panel. Reads the existing manufacturers
// directory and renders each plant as an info card (logo, name,
// description, location, turnaround, specialties). Per-press RFQ
// pricing plumbing is tracked on the roadmap — for now the panel is
// purely informational so an artist can see who's available before
// they decide on a pressing plant.
function PressesPanel({
  albumId,
  invited,
}: {
  albumId: string;
  invited: InvitedPressResponse | null;
}) {
  const { data, isLoading } = useQuery<Manufacturer[]>({
    queryKey: ["/api/manufacturers"],
  });
  const presses = data ?? [];

  // Task #199 — hard lock until the first run ships. When this album's
  // artist (or label) was invited to GoodTunes by a specific press,
  // they only see that press until they've shipped their first paid
  // run. Once `hasShippedFirst` flips true the panel unlocks to the
  // full directory (invited press still rendered first, marked).
  // Super-admin can clear/switch the invited press at any time via
  // the partner's Identity panel.
  const invitedPress = invited?.press ?? null;
  const locked = !!invitedPress && !invited?.hasShippedFirst;

  if (locked) {
    return (
      <div className="mb-8" data-testid="panel-presses">
        <h2 className="text-[15px] font-semibold text-slate-900 mb-1">Your press</h2>
        <p className="text-[13px] text-slate-500 mb-4 inline-flex items-center gap-1.5">
          <Lock className="w-3 h-3 text-slate-400" />
          You were invited by {invitedPress!.name}. The full pressing-plant directory unlocks once your first run ships — message GoodTunes if you need to switch sooner.
        </p>
        <div className="flex">
          <PressCard press={invitedPress!} highlight />
        </div>
      </div>
    );
  }

  // Hide the whole panel on empty/loading per task #194 spec — a fresh
  // DB without any presses should not render an empty-state card.
  if (isLoading || presses.length === 0) return null;

  // Once unlocked (or never locked), render the full directory. When
  // invited press is set we float it to the front and mark it so the
  // partner still knows who brought them on.
  const ordered = invitedPress
    ? [invitedPress, ...presses.filter((p) => p.id !== invitedPress.id)]
    : presses;
  return (
    <div className="mb-8" data-testid="panel-presses">
      <h2 className="text-[15px] font-semibold text-slate-900 mb-1">Presses</h2>
      <p className="text-[13px] text-slate-500 mb-4">
        {invitedPress
          ? `Pressing plants GoodTunes works with — ${invitedPress.name} brought you on, but you're free to pick anyone. Today the Cost on every vinyl format uses Hellbender Vinyl's public rate sheet as the default; per-plant quote plumbing wires in next so an artist can compare side-by-side.`
          : "Pressing plants GoodTunes works with. Today the Cost on every vinyl format uses Hellbender Vinyl's public rate sheet as the default — per-plant quote plumbing wires in next so an artist can compare side-by-side."}
      </p>
      <div
        className="flex flex-col sm:flex-row sm:overflow-x-auto gap-3 sm:pb-2 -mx-4 sm:px-4"
      >
        {ordered.map((p) => (
          <PressCard
            key={p.id}
            press={p}
            highlight={invitedPress?.id === p.id}
          />
        ))}
      </div>
    </div>
  );
}

function PressCard({ press, highlight = false }: { press: Manufacturer; highlight?: boolean }) {
  // Clickable card per task #194 — opens the press's website in a new
  // tab. `noopener noreferrer` prevents the opened page from gaining a
  // window.opener back-reference. When a press has no website URL we
  // fall back to a non-interactive container so the card still renders.
  const Wrapper: any = press.websiteUrl ? "a" : "div";
  const wrapperProps = press.websiteUrl
    ? {
        href: press.websiteUrl,
        target: "_blank" as const,
        rel: "noopener noreferrer",
      }
    : {};
  return (
    <Wrapper
      {...wrapperProps}
      className={[
        "rounded-md border bg-white p-4 flex flex-col gap-3",
        "w-full sm:w-72 sm:shrink-0",
        highlight
          ? "border-[color:var(--brand-blue)] ring-1 ring-[color:var(--brand-blue)]/30"
          : "border-slate-200",
        press.websiteUrl
          ? "hover:border-[color:var(--brand-blue)] hover:shadow-sm transition-all cursor-pointer no-underline"
          : "",
      ].join(" ")}
      data-testid={`card-press-${press.id}`}
    >
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
          <div className="flex items-center gap-1.5">
            <div
              className="text-[13.5px] font-semibold text-slate-900 truncate"
              data-testid={`text-press-name-${press.id}`}
            >
              {press.name}
            </div>
            {/* Until per-press RFQ pricing ships, every vinyl SKU
                prices off Hellbender's published rate sheet — even
                cards for other plants. Pill calls that out so the
                operator isn't confused why "Memphis" and "Precision"
                show identical Cost numbers. */}
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
              className="text-[12px] text-slate-500 inline-flex items-center gap-1 mt-0.5"
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
          className="text-[12.5px] text-slate-600 leading-snug line-clamp-3"
          data-testid={`text-press-bio-${press.id}`}
        >
          {press.bio}
        </div>
      )}
      {press.turnaroundDays != null && (
        <div
          className="text-[12px] text-slate-500 inline-flex items-center gap-1"
          data-testid={`text-press-turnaround-${press.id}`}
        >
          <Clock className="w-3 h-3" />
          {press.turnaroundDays}-day turnaround
        </div>
      )}
      {press.specialties.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid={`chips-press-specialties-${press.id}`}>
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
    </Wrapper>
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
        "flex items-center justify-between gap-6 text-[12.5px]",
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
  const [stockStr, setStockStr] = useState(existing?.stock?.toString() ?? "");
  // Task #194 — planned quantity, same shape as the signed_cert addon.
  // Existing rows without a planned quantity default to "unlimited".
  const initialMode: "fixed" | "unlimited" =
    existing?.plannedQuantity != null ? "fixed" : "unlimited";
  const [qtyMode, setQtyMode] = useState<"fixed" | "unlimited">(initialMode);
  const [qtyInput, setQtyInput] = useState<string>(
    existing?.plannedQuantity != null
      ? String(existing.plannedQuantity)
      : String(DEFAULT_VINYL_QUANTITY),
  );
  // Task #200 — vinyl picks. Initialised from the SKU snapshot (when
  // present) so a saved row re-opens with the picks the artist locked
  // in. New / non-vinyl rows fall back to platform defaults.
  const [vinylColorId, setVinylColorId] = useState<string>(
    existing?.vinylColor && VINYL_COLOR_BY_ID[existing.vinylColor]
      ? existing.vinylColor
      : DEFAULT_VINYL_COLOR_ID,
  );
  const [jacketUpgrade, setJacketUpgrade] = useState<JacketUpgrade>(
    (existing?.jacketUpgrade as JacketUpgrade | null | undefined) ?? DEFAULT_JACKET_UPGRADE,
  );
  const vinylColor: VinylColorOption = VINYL_COLOR_BY_ID[vinylColorId] ?? VINYL_COLOR_BY_ID[DEFAULT_VINYL_COLOR_ID];

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

  const parsedQty = useMemo(() => {
    const n = Number.parseInt(qtyInput.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [qtyInput]);

  // Task #200 — snap the typed quantity up to the next published
  // Hellbender tier (50/100/200/300/500/1000). The matrix is keyed
  // by tier, so this is also what gets snapshotted on save. Anything
  // above 1000 stays at 1000 and flips `requiresQuote` so the row
  // can show a "1000+ — request custom quote" caveat.
  const qtySnap = useMemo(
    () => snapToQuantityTier(parsedQty ?? DEFAULT_VINYL_QUANTITY),
    [parsedQty],
  );
  // Task #218 — catalog ladder snap (parallel to qtySnap but driven by
  // the picked tier's price ladder, not the Hellbender matrix).
  const catalogSnap = useMemo(
    () =>
      usingCatalog && pickedTier
        ? snapCatalogLadder(pickedTier.priceLadder, parsedQty ?? DEFAULT_VINYL_QUANTITY)
        : null,
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

  const totalCents =
    qtyMode === "fixed" && profitCents !== null && parsedQty !== null
      ? profitCents * parsedQty
      : null;

  const storedActive = existing?.active ?? false;
  const storedPrice = existing ? (existing.priceCents / 100).toFixed(2) : "";
  const storedStock = existing?.stock?.toString() ?? "";
  const storedMode: "fixed" | "unlimited" = initialMode;
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
    stockStr !== storedStock ||
    qtyMode !== storedMode ||
    (qtyMode === "fixed" && parsedQty !== storedQty) ||
    (isVinyl && !usingCatalog && (vinylColorId !== storedColor || jacketUpgrade !== storedJacket)) ||
    catalogDirty;

  const submit = () => {
    const cents = parseDollars(priceStr);
    if (cents === null) return;
    const stock = stockStr.trim() === "" ? null : Math.max(0, Math.floor(Number(stockStr)));
    const plannedQuantity = qtyMode === "fixed" ? parsedQty : null;
    if (qtyMode === "fixed" && plannedQuantity === null) return;
    onSave({
      format,
      priceCents: cents,
      stock,
      active,
      plannedQuantity,
      // Catalog mode wins: the server resolves picks via pressTierId /
      // pressColorId and snapshots the tier name + color name itself.
      // Legacy vinyl picks are skipped (jacket upgrade was dropped
      // from the catalog model).
      vinylColor: usingCatalog ? null : isVinyl ? vinylColorId : null,
      jacketUpgrade: usingCatalog ? null : isVinyl ? jacketUpgrade : null,
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
            <span className="text-[12px] text-slate-500 ml-2" data-testid={`text-sku-summary-${format}`}>
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

      {expanded && (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        {/* Left column — Price / Cost / Profit */}
        <div className="space-y-3">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Price · Cost · Profit
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 text-[12px]">Price $</span>
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
            <span className="text-slate-500 text-[12px] inline-flex items-center gap-1">
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
            <span className="text-slate-500 text-[12px]">
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

          {/* Stock — preserved here so the per-album cap on physical
              inventory keeps its admin affordance. Small + quiet. */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <span className="text-slate-400 text-[11.5px]">Stock</span>
            <input
              type="text"
              value={stockStr}
              onChange={(e) => setStockStr(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="∞"
              inputMode="numeric"
              className={`w-20 ${fieldClass} text-[12px]`}
              data-testid={`input-stock-${format}`}
            />
          </div>
        </div>

        {/* Right column — Sold (planned qty) / Profit echo / Total */}
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
              <span className="text-[12.5px] text-slate-500">units</span>
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
              <span className="text-[13px] text-slate-700">As many as will sell</span>
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-slate-500 text-[12px]">
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
            <span className="text-slate-500 text-[12px]">Total $</span>
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

          {qtyMode === "fixed" && parsedQty !== null && (
            <div
              className="text-[11.5px] text-slate-400 text-right"
              data-testid={`text-total-caveat-${format}`}
            >
              Only if all {parsedQty} sell.
            </div>
          )}
          {isVinyl && !usingCatalog && qtyMode === "fixed" && parsedQty !== null && (
            <div
              className="text-[11.5px] text-slate-500 text-right"
              data-testid={`text-qty-tier-${format}`}
            >
              {qtySnap.requiresQuote ? (
                <>1000+ — request a custom quote</>
              ) : parsedQty === qtySnap.tier ? (
                <>Priced at the {qtySnap.tier}-unit tier.</>
              ) : (
                <>Priced at the next tier up: {qtySnap.tier} units.</>
              )}
            </div>
          )}
          {usingCatalog && qtyMode === "fixed" && parsedQty !== null && catalogSnap && (
            <div
              className="text-[11.5px] text-slate-500 text-right"
              data-testid={`text-qty-tier-${format}`}
            >
              {catalogSnap.requiresQuote ? (
                <>{catalogSnap.qty}+ — request a custom quote</>
              ) : parsedQty === catalogSnap.qty ? (
                <>Priced at the {catalogSnap.qty}-unit rung.</>
              ) : (
                <>Priced at the next rung up: {catalogSnap.qty} units.</>
              )}
            </div>
          )}
        </div>
      </div>

      {usingCatalog && pickedTier ? (
        <CatalogPicksBlock
          format={format}
          tiers={tiers}
          pickedTier={pickedTier}
          pickedColorId={pressColorId}
          onPickTier={setPressTierId}
          onPickColor={setPressColorId}
        />
      ) : isVinyl ? (
        <VinylPicksBlock
          format={format}
          artworkUrl={artworkUrl}
          color={vinylColor}
          onPickColor={(id) => setVinylColorId(id)}
          jacketUpgrade={jacketUpgrade}
          onPickJacket={setJacketUpgrade}
        />
      ) : null}
      </>
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
      <div>
        <div className="text-[10.5px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
          Color tier
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tiers.map((t) => {
            const on = t.id === pickedTier.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onPickTier(t.id)}
                className={[
                  "h-7 rounded-full px-3 text-[12px] border transition-colors",
                  on
                    ? "border-[color:var(--brand-blue)] bg-[color:var(--brand-blue)]/10 text-[color:var(--brand-blue)]"
                    : "border-slate-200 text-slate-600 hover:border-slate-300",
                ].join(" ")}
                data-testid={`chip-tier-${format}-${t.id}`}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="text-[10.5px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
          Color
        </div>
        {pickedTier.colors.length === 0 ? (
          <div className="text-[12px] text-slate-400">
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
                  <span className="text-[12px] text-slate-700">{c.name}</span>
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
  onPickColor,
  jacketUpgrade,
  onPickJacket,
}: {
  format: AlbumFormat;
  artworkUrl: string | null;
  color: VinylColorOption;
  onPickColor: (id: string) => void;
  jacketUpgrade: JacketUpgrade;
  onPickJacket: (j: JacketUpgrade) => void;
}) {
  return (
    <div
      className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-4 items-start"
      data-testid={`vinyl-picks-${format}`}
    >
      <div className="space-y-3">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
          Vinyl
        </div>

        {/* Color picker — swatch grid. Wraps + scrolls so the whole
            Hellbender palette is one click away. */}
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-[12px] text-slate-500">Color</span>
            <span
              className="text-[12px] text-slate-700 font-medium"
              data-testid={`text-vinyl-color-name-${format}`}
            >
              {color.name}
              <span className="text-[11px] text-slate-400 ml-1.5">
                · {VINYL_COLOR_TIER_LABEL[color.tier]}
              </span>
            </span>
          </div>
          <div
            className="flex flex-wrap gap-1.5"
            role="radiogroup"
            aria-label="Vinyl color"
            data-testid={`picker-vinyl-color-${format}`}
          >
            {VINYL_COLORS.map((c) => {
              const selected = c.id === color.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  title={`${c.name} (${VINYL_COLOR_TIER_LABEL[c.tier]})`}
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

        {/* Jacket select */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-slate-500">Jacket</span>
          <select
            value={jacketUpgrade}
            onChange={(e) => onPickJacket(e.target.value as JacketUpgrade)}
            className={`${fieldClass} pr-8 w-56`}
            data-testid={`select-jacket-${format}`}
          >
            {(Object.keys(JACKET_UPGRADE_LABEL) as JacketUpgrade[]).map((j) => (
              <option key={j} value={j}>
                {JACKET_UPGRADE_LABEL[j]}
              </option>
            ))}
          </select>
        </div>
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
            <span className="text-slate-500 text-[12px]">Price $</span>
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
            <span className="text-slate-500 text-[12px]">
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
            <span className="text-slate-500 text-[12px]">
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
              <span className="text-[12.5px] text-slate-500">units</span>
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
              <span className="text-[13px] text-slate-700">As many as will sell</span>
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-slate-500 text-[12px]">
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
            <span className="text-slate-500 text-[12px]">Total $</span>
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
          className={`w-20 ${fieldClass} text-[12px]`}
          data-testid="input-addon-floor"
        />
        <span className="text-slate-400 text-[11px]">
          (advanced — per-album floor used by Shopify bundles)
        </span>
      </div>
    </div>
  );
}
