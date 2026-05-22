// SellPanel — the "Sell this album" admin panel (Task #44, step 4).
//
// Lets the operator enable/disable each format, set per-format prices,
// and configure the signed-cert add-on (artist price + live profit
// readout against the platform's certificate cost — Task #119).
//
// Mounted as the Sell tab on `AdminAlbum.tsx`.
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
    mutationFn: async (body: { priceCents: number; active: boolean }) => {
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
            <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
              <div className="text-slate-700 text-[13.5px] font-medium">No physical formats yet</div>
              <div className="text-slate-500 text-[12.5px] mt-1">
                Add a vinyl, cassette, or CD to start selling.
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
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
          <div className="rounded-lg border border-slate-200 bg-white p-4">
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
          className="h-4 w-4 rounded border-slate-300 text-[#319ED8] focus:ring-[#319ED8]"
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
          className="w-24 h-8 border border-slate-300 rounded-md px-2 text-[13px] focus:outline-none focus:border-[#319ED8]"
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
          className="w-16 h-8 border border-slate-300 rounded-md px-2 text-[13px] focus:outline-none focus:border-[#319ED8]"
          data-testid={`input-stock-${format}`}
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          className="h-8 px-3 rounded-md bg-[#319ED8] text-white text-[12px] font-medium hover:bg-[#2a8cc1]"
          data-testid={`button-save-sku-${format}`}
        >
          Save
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="h-8 w-8 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center"
          aria-label="Remove format"
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
  onSave: (b: { priceCents: number; active: boolean }) => void;
}) {
  const [active, setActive] = useState(existing?.active ?? false);
  const [price, setPrice] = useState(existing ? (existing.priceCents / 100).toFixed(2) : "12.99");

  // Cost to use for the readout: prefer the snapshot the artist locked
  // in at last save, fall back to the live platform cost when the addon
  // has never been saved yet. Null means we genuinely don't know (settings
  // still loading) — render a muted placeholder.
  const lockedCost = existing?.costCentsSnapshot ?? null;
  const readoutCost = lockedCost ?? livePlatformCostCents;

  const priceCents = useMemo(() => parseDollars(price), [price]);
  const earnsCents = priceCents !== null && readoutCost !== null ? priceCents - readoutCost : null;

  const submit = () => {
    const cents = parseDollars(price);
    if (cents === null) return;
    onSave({ priceCents: cents, active });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-[#319ED8] focus:ring-[#319ED8]"
            data-testid="toggle-addon-signed_cert"
          />
          <span className="text-[13.5px] font-medium text-slate-900">Offer signed certificate</span>
        </label>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 text-[12px]">Price $</span>
          <input
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            className="w-24 h-8 border border-slate-300 rounded-md px-2 text-[13px] focus:outline-none focus:border-[#319ED8]"
            data-testid="input-addon-price"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          className="h-8 px-3 rounded-md bg-[#319ED8] text-white text-[12px] font-medium hover:bg-[#2a8cc1]"
          data-testid="button-save-addon"
        >
          Save
        </button>
      </div>

      {/* Live profit readout. Mint = profit, heart-pink = loss. */}
      {readoutCost === null ? (
        <div className="text-[12px] text-slate-400" data-testid="text-addon-earnings-loading">
          Loading platform cost…
        </div>
      ) : earnsCents === null ? null : (
        <div
          className="text-[12.5px] inline-flex items-center gap-2"
          data-testid="text-addon-earnings"
        >
          <span
            className={[
              "tabular-nums font-semibold",
              earnsCents < 0 ? "text-[#FF5470]" : "text-slate-900",
            ].join(" ")}
          >
            You earn {earnsCents < 0 ? `-${dollars(Math.abs(earnsCents))}` : dollars(earnsCents)} per unit
          </span>
          <span className="text-slate-400 text-[11.5px]">
            (price {dollars(priceCents ?? 0)} − platform cost {dollars(readoutCost)}
            {lockedCost === null ? ", live" : ", locked at last save"})
          </span>
        </div>
      )}
    </div>
  );
}
