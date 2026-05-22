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
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AddEntityButton } from "@/components/admin/AddEntityButton";
import {
  ALBUM_FORMATS,
  ALBUM_FORMAT_LABEL,
  type AlbumFormat,
  type AlbumSku,
  type AlbumAddon,
  type PayoutSettings,
} from "@shared/schema";

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
const parseDollars = (v: string): number | null => {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

type SellResponse = { skus: AlbumSku[]; addons: AlbumAddon[] };

export function SellPanel({ albumId }: { albumId: string }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<SellResponse>({ queryKey: ["/api/admin/albums", albumId, "skus"] });
  // Live platform-cost feed — used for the "You earn" readout the first
  // time an addon is configured (before a snapshot is written), and as
  // the source of truth for what re-saving will lock in.
  const { data: payoutSettings } = useQuery<PayoutSettings>({
    queryKey: ["/api/admin/payout-settings"],
  });

  const upsertSku = useMutation({
    mutationFn: async (body: { format: AlbumFormat; priceCents: number; stock: number | null; active: boolean }) => {
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

  if (isLoading || !data) return <div className="text-slate-500 text-sm py-6">Loading…</div>;

  const skuByFormat = new Map(data.skus.map((s) => [s.format as AlbumFormat, s]));
  const signedAddon = data.addons.find((a) => a.kind === "signed_cert");

  // Once a draft becomes a real SKU (visible in `data.skus`), drop it
  // from the local draft list — the saved row takes over rendering.
  const liveDrafts = draftFormats.filter((f) => !skuByFormat.has(f));
  // Formats actually configured on this album — these are the rows we
  // render. The "+ Add Physical Good" picker handles the rest.
  const configuredFormats = ALBUM_FORMATS.filter((f) => skuByFormat.has(f));
  const availableFormats = ALBUM_FORMATS.filter(
    (f) => !skuByFormat.has(f) && !liveDrafts.includes(f),
  );

  return (
    <div className="py-6">
      <div className="max-w-3xl">
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
            <div className="rounded-md border border-slate-200 bg-white divide-y divide-slate-100">
              {configuredFormats.map((f) => {
                const existing = skuByFormat.get(f)!;
                return (
                  <SkuRow
                    key={f}
                    format={f}
                    existing={existing}
                    onSave={upsertSku.mutate}
                    onDelete={() => deleteSku.mutate(f)}
                  />
                );
              })}
              {liveDrafts.map((f) => (
                <SkuRow
                  key={`draft-${f}`}
                  format={f}
                  existing={null}
                  onSave={(body) => {
                    upsertSku.mutate(body, {
                      onSuccess: () =>
                        setDraftFormats((prev) => prev.filter((d) => d !== f)),
                    });
                  }}
                  onDelete={() => setDraftFormats((prev) => prev.filter((d) => d !== f))}
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

function SkuRow({
  format,
  existing,
  onSave,
  onDelete,
}: {
  format: AlbumFormat;
  // `null` = draft row (operator just picked the format from the menu;
  // nothing has hit the DB yet). Save promotes it to a real SKU; Delete
  // simply drops the draft from local state. See note in SellPanel.
  existing: AlbumSku | null;
  onSave: (b: { format: AlbumFormat; priceCents: number; stock: number | null; active: boolean }) => void;
  onDelete: () => void;
}) {
  const isDraft = existing === null;
  const [active, setActive] = useState(existing?.active ?? true);
  const [priceStr, setPriceStr] = useState(existing ? (existing.priceCents / 100).toFixed(2) : "");
  const [stockStr, setStockStr] = useState(existing?.stock?.toString() ?? "");

  // Row is dirty if any field diverges from the stored value (or no
  // stored value exists yet but the operator typed something).
  const storedActive = existing?.active ?? false;
  const storedPrice = existing ? (existing.priceCents / 100).toFixed(2) : "";
  const storedStock = existing?.stock?.toString() ?? "";
  const dirty =
    active !== storedActive || priceStr !== storedPrice || stockStr !== storedStock;

  const submit = () => {
    const cents = parseDollars(priceStr);
    if (cents === null) return;
    const stock = stockStr.trim() === "" ? null : Math.max(0, Math.floor(Number(stockStr)));
    onSave({ format, priceCents: cents, stock, active });
  };

  return (
    <div
      className={[
        "px-4 py-3 flex items-center gap-3",
        isDraft ? "bg-slate-50" : "",
      ].join(" ")}
      data-testid={isDraft ? `row-sku-draft-${format}` : `row-sku-${format}`}
    >
      <label className="inline-flex items-center gap-2 min-w-[140px]">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-[color:var(--brand-blue)] focus:ring-[color:var(--brand-blue)]"
          data-testid={`toggle-sku-${format}`}
        />
        <span className="text-[13.5px] font-medium text-slate-900">{ALBUM_FORMAT_LABEL[format]}</span>
      </label>
      <div className="flex items-center gap-1.5">
        <span className="text-slate-500 text-[13px]">$</span>
        <input
          type="text"
          value={priceStr}
          onChange={(e) => setPriceStr(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
          className={`w-24 ${fieldClass}`}
          data-testid={`input-price-${format}`}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-slate-500 text-[12px]">Stock</span>
        <input
          type="text"
          value={stockStr}
          onChange={(e) => setStockStr(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="∞"
          inputMode="numeric"
          className={`w-16 ${fieldClass}`}
          data-testid={`input-stock-${format}`}
        />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <SaveLink dirty={dirty} onClick={submit} testId={`button-save-sku-${format}`} />
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
