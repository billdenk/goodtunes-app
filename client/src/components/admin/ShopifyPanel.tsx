// ShopifyPanel — per-album Shopify mapping UI (Task #49, step 3).
//
// Lives on the AdminAlbum "Shopify" tab. Lets the operator paste a
// product URL from a connected Shopify store, pick a variant (or
// "all variants"), and toggle whether the printed-signed-cert add-on
// is bundled into the same Shopify order — at a price floor-checked
// against the album's signed_cert min.
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link as LinkIcon, Trash2, ChevronDown } from "lucide-react";
import { useExclusiveDisclosure } from "@/hooks/useExclusiveDisclosure";

type Mapping = {
  id: string;
  storeId: string;
  shopifyProductId: string;
  shopifyVariantId: string | null;
  shopifyProductTitle: string | null;
  albumId: string;
  offerSignedCert: boolean;
  signedCertPriceCents: number | null;
  storeName: string | null;
  shopDomain: string | null;
};
type Resolved = {
  storeId: string;
  shopifyProductId: string;
  shopifyProductTitle: string;
  variants: { id: string; title: string; price: string }[];
  albumId: string;
};

const dollars = (c: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);
const parseDollars = (v: string): number | null => {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

export function ShopifyPanel({ albumId }: { albumId: string }) {
  const { toast } = useToast();
  const { data: mappings, isLoading } = useQuery<Mapping[]>({
    queryKey: ["/api/admin/albums", albumId, "shopify-mappings"],
  });
  // Exclusive-disclosure for the linked-mapping rows — at most one
  // expanded at a time. Collapsed shows just the product title; the
  // store/variant/cert meta + remove button live behind expansion.
  // See docs/design-system.md ("Expandable row lists").
  const disclosure = useExclusiveDisclosure<string>();

  const [url, setUrl] = useState("");
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [offerCert, setOfferCert] = useState(false);
  const [certPrice, setCertPrice] = useState("9.99");

  const resolve = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/shopify-mappings/resolve`, { url: url.trim() });
      return (await r.json()) as Resolved;
    },
    onSuccess: (r) => {
      setResolved(r);
      setVariantId(null);
    },
    onError: (e: any) => toast({ title: "Couldn't find that product", description: e?.message, variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!resolved) throw new Error("Resolve a product first");
      const body: any = {
        storeId: resolved.storeId,
        shopifyProductId: resolved.shopifyProductId,
        shopifyVariantId: variantId,
        shopifyProductTitle: resolved.shopifyProductTitle,
        albumId,
        offerSignedCert: offerCert,
      };
      if (offerCert) {
        const cents = parseDollars(certPrice);
        if (cents == null) throw new Error("Enter a valid cert price");
        body.signedCertPriceCents = cents;
      }
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/shopify-mappings`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "shopify-mappings"] });
      setUrl("");
      setResolved(null);
      setVariantId(null);
      setOfferCert(false);
      toast({ title: "Mapping saved" });
    },
    onError: (e: any) => toast({ title: "Couldn't save mapping", description: e?.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/albums/${albumId}/shopify-mappings/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "shopify-mappings"] }),
  });

  return (
    <div className="py-6" data-testid="panel-shopify">
      <div className="max-w-3xl">
        <h2 className="text-[15px] font-semibold text-slate-900 mb-1">Sell this album on Shopify</h2>
        <p className="text-[13px] text-slate-500 mb-4 leading-snug">
          Paste a Shopify product URL from a connected store and we'll bundle GoodTunes digital access into every paid
          order on that product. Manage connected stores at{" "}
          <a className="text-[var(--brand-blue)] underline underline-offset-2" href="/admin/shopify">
            /admin/shopify
          </a>
          .
        </p>

        {/* Existing mappings */}
        <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 mb-6">
          {isLoading && <div className="px-4 py-3 text-slate-400 text-sm">Loading…</div>}
          {!isLoading && (mappings?.length ?? 0) === 0 && (
            <div className="px-4 py-6 text-slate-400 text-[13px] text-center" data-testid="shopify-mappings-empty">
              No Shopify products linked to this album yet.
            </div>
          )}
          {(mappings ?? []).map((m) => {
            const expanded = disclosure.isOpen(m.id);
            return (
            <div key={m.id} data-testid={`row-shopify-mapping-${m.id}`}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onClick={() => disclosure.setOpen(m.id, !expanded)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    disclosure.setOpen(m.id, !expanded);
                  }
                }}
                className="px-4 py-3 flex items-center gap-3 cursor-pointer select-none hover:bg-slate-50"
                data-testid={`button-toggle-mapping-${m.id}`}
              >
                <LinkIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1 text-[13.5px] font-medium text-slate-900 truncate">
                  {m.shopifyProductTitle ?? m.shopifyProductId}
                </div>
                <ChevronDown
                  className={[
                    "w-4 h-4 text-slate-400 transition-transform shrink-0",
                    expanded ? "rotate-180" : "",
                  ].join(" ")}
                />
              </div>
              {expanded && (
                <div className="px-4 pb-3 pl-11 flex items-start justify-between gap-3">
                  <div className="text-[11.5px] text-slate-500 min-w-0 flex-1">
                    {m.storeName ?? m.shopDomain ?? "—"}
                    {m.shopifyVariantId ? ` · variant ${m.shopifyVariantId}` : " · all variants"}
                    {m.offerSignedCert ? ` · cert ${dollars(m.signedCertPriceCents)}` : ""}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove.mutate(m.id);
                    }}
                    disabled={remove.isPending}
                    className="text-slate-400 hover:text-rose-600 p-1 shrink-0"
                    data-testid={`button-remove-mapping-${m.id}`}
                    aria-label="Remove mapping"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            );
          })}
        </div>

        {/* Add a new mapping */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-[13.5px] font-semibold text-slate-900 mb-2">Link a Shopify product</h3>
          <div className="flex gap-2 mb-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://store.myshopify.com/products/album-vinyl"
              className="flex-1 h-9 border border-slate-300 rounded-md px-3 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
              data-testid="input-shopify-product-url"
            />
            <button
              type="button"
              onClick={() => resolve.mutate()}
              disabled={resolve.isPending || !url.trim()}
              className="h-9 px-3 rounded-md bg-slate-900 text-white text-[12px] font-medium hover:bg-slate-800 disabled:opacity-50"
              data-testid="button-shopify-resolve"
            >
              {resolve.isPending ? "Finding…" : "Find product"}
            </button>
          </div>

          {resolved && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 space-y-3" data-testid="shopify-resolved">
              <div>
                <div className="text-[12px] font-semibold text-slate-700">Found</div>
                <div className="text-[13.5px] text-slate-900">{resolved.shopifyProductTitle}</div>
              </div>
              <div>
                <label className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Variant</label>
                <select
                  value={variantId ?? ""}
                  onChange={(e) => setVariantId(e.target.value || null)}
                  className="w-full h-8 border border-slate-300 rounded-md px-2 text-[13px] bg-white"
                  data-testid="select-shopify-variant"
                >
                  <option value="">All variants of this product</option>
                  {resolved.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title} · ${v.price}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={offerCert}
                    onChange={(e) => setOfferCert(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[var(--brand-blue)] focus:ring-[var(--brand-blue)]"
                    data-testid="toggle-shopify-cert"
                  />
                  <span className="text-[13px] text-slate-800">Bundle a printed & signed GoodDeed certificate</span>
                </label>
                {offerCert && (
                  <div className="flex items-center gap-1.5 mt-2 ml-6">
                    <span className="text-slate-500 text-[12px]">Price $</span>
                    <input
                      type="text"
                      value={certPrice}
                      onChange={(e) => setCertPrice(e.target.value)}
                      inputMode="decimal"
                      className="w-24 h-8 border border-slate-300 rounded-md px-2 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
                      data-testid="input-shopify-cert-price"
                    />
                    <span className="text-[11.5px] text-slate-400">Must be ≥ the album's per-album minimum floor.</span>
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => save.mutate()}
                  disabled={save.isPending}
                  className="h-8 px-3 rounded-md bg-[var(--brand-blue)] text-white text-[12px] font-medium hover:bg-[var(--brand-blue-hover)] disabled:opacity-50"
                  data-testid="button-shopify-save-mapping"
                >
                  {save.isPending ? "Saving…" : "Save mapping"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
