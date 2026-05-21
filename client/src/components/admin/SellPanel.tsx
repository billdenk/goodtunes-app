// SellPanel — the "Sell this album" admin panel (Task #44, step 4).
// Lets the operator enable/disable each format, set per-format prices,
// and configure the signed-cert add-on (artist price + minimum floor).
//
// Mounted as the Sell tab on `AdminAlbum.tsx`.
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ALBUM_FORMATS, ALBUM_FORMAT_LABEL, type AlbumFormat, type AlbumSku, type AlbumAddon } from "@shared/schema";

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
    mutationFn: async (body: { priceCents: number; minPriceCents: number; active: boolean }) => {
      const r = await apiRequest("PUT", `/api/admin/albums/${albumId}/addons/signed_cert`, body);
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "skus"] }),
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  if (isLoading || !data) return <div className="text-slate-500 text-sm py-6">Loading…</div>;

  const skuByFormat = new Map(data.skus.map((s) => [s.format as AlbumFormat, s]));
  const signedAddon = data.addons.find((a) => a.kind === "signed_cert");

  return (
    <div className="py-6">
      <div className="max-w-3xl">
        {/* SKUs */}
        <div className="mb-8">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-1">Formats</h2>
          <p className="text-[13px] text-slate-500 mb-4">
            Toggle a format on and set its price. Only enabled formats appear on the fan's Buy sheet.
          </p>
          <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
            {ALBUM_FORMATS.map((f) => {
              const existing = skuByFormat.get(f);
              return <SkuRow key={f} format={f} existing={existing} onSave={upsertSku.mutate} onDelete={() => deleteSku.mutate(f)} />;
            })}
          </div>
        </div>

        {/* Signed cert */}
        <div className="mb-8">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-1">Printed & Signed GoodDeed®</h2>
          <p className="text-[13px] text-slate-500 mb-4">
            Optional add-on for every order. Fans see a single toggle on the Buy sheet with this price.
            The minimum floor is the lowest you'll accept if discounted on a campaign.
          </p>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <AddonForm
              existing={signedAddon ?? null}
              onSave={upsertAddon.mutate}
            />
          </div>
        </div>
      </div>
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
  existing: AlbumSku | undefined;
  onSave: (b: { format: AlbumFormat; priceCents: number; stock: number | null; active: boolean }) => void;
  onDelete: () => void;
}) {
  const [active, setActive] = useState(existing?.active ?? false);
  const [priceStr, setPriceStr] = useState(existing ? (existing.priceCents / 100).toFixed(2) : "");
  const [stockStr, setStockStr] = useState(existing?.stock?.toString() ?? "");

  const submit = () => {
    const cents = parseDollars(priceStr);
    if (cents === null) return;
    const stock = stockStr.trim() === "" ? null : Math.max(0, Math.floor(Number(stockStr)));
    onSave({ format, priceCents: cents, stock, active });
  };

  return (
    <div className="px-4 py-3 flex items-center gap-3" data-testid={`row-sku-${format}`}>
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
        {existing && (
          <button
            type="button"
            onClick={onDelete}
            className="h-8 px-2 rounded-md text-[12px] text-slate-500 hover:text-rose-600"
            data-testid={`button-delete-sku-${format}`}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function AddonForm({
  existing,
  onSave,
}: {
  existing: AlbumAddon | null;
  onSave: (b: { priceCents: number; minPriceCents: number; active: boolean }) => void;
}) {
  const [active, setActive] = useState(existing?.active ?? false);
  const [price, setPrice] = useState(existing ? (existing.priceCents / 100).toFixed(2) : "9.99");
  const [floor, setFloor] = useState(existing ? (existing.minPriceCents / 100).toFixed(2) : "4.99");

  const submit = () => {
    const cents = parseDollars(price);
    const minCents = parseDollars(floor);
    if (cents === null || minCents === null) return;
    onSave({ priceCents: cents, minPriceCents: minCents, active });
  };

  return (
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
      <div className="flex items-center gap-1.5">
        <span className="text-slate-500 text-[12px]">Min floor $</span>
        <input
          type="text"
          value={floor}
          onChange={(e) => setFloor(e.target.value)}
          inputMode="decimal"
          className="w-24 h-8 border border-slate-300 rounded-md px-2 text-[13px] focus:outline-none focus:border-[#319ED8]"
          data-testid="input-addon-floor"
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
  );
}
