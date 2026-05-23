// ShopifyPanel — per-album Shopify mapping UI (Task #49, step 3).
//
// Lives on the AdminAlbum "Shopify" tab. Lets the operator paste a
// product URL from a connected Shopify store, pick a variant (or
// "all variants"), and toggle whether the printed-signed-cert add-on
// is bundled into the same Shopify order — at a price floor-checked
// against the album's signed_cert min.
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link as LinkIcon, Trash2, ChevronDown, ExternalLink, Upload, AlertTriangle, RefreshCw } from "lucide-react";
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

type PushStatus = {
  album: {
    priceCents: number | null;
    maxRedemptions: number | null;
    signedCertRetailCents: number | null;
  };
  cert: {
    plannedQuantity: number | null;
    minPriceCents: number | null;
  } | null;
  earnings: {
    plannedQuantity: number;
    wholesaleCents: number;
    retailCents: number;
    perCertCents: number;
    totalCents: number;
    rungLabel: string;
  } | null;
  stores: { id: string; shopDomain: string; storeName: string | null }[];
  push: {
    storeId: string;
    shopDomain: string | null;
    storeName: string | null;
    productId: string;
    editionVariantId: string | null;
    certVariantId: string | null;
    pushedAt: string | null;
    adminUrl: string | null;
  } | null;
};

export function ShopifyPanel({ albumId }: { albumId: string }) {
  const { toast } = useToast();
  const { data: mappings, isLoading } = useQuery<Mapping[]>({
    queryKey: ["/api/admin/albums", albumId, "shopify-mappings"],
  });
  const { data: pushStatus } = useQuery<PushStatus>({
    queryKey: ["/api/admin/albums", albumId, "shopify-push"],
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

  // Push-to-Shopify (Task #242) — locally-edited fields. Initialized
  // from /shopify-push so the inputs reflect the persisted album row
  // on first load, then drift independently as the operator edits.
  const [maxRedemptions, setMaxRedemptions] = useState<string>("");
  const [certRetail, setCertRetail] = useState<string>("");
  const [pushStoreId, setPushStoreId] = useState<string>("");
  const [pushConflicts, setPushConflicts] = useState<string[] | null>(null);
  useEffect(() => {
    if (!pushStatus) return;
    setMaxRedemptions(pushStatus.album.maxRedemptions != null ? String(pushStatus.album.maxRedemptions) : "");
    setCertRetail(
      pushStatus.album.signedCertRetailCents != null
        ? (pushStatus.album.signedCertRetailCents / 100).toFixed(2)
        : "",
    );
    setPushStoreId(
      pushStatus.push?.storeId ?? (pushStatus.stores.length === 1 ? pushStatus.stores[0].id : ""),
    );
  }, [pushStatus]);

  const savePushFields = useMutation({
    mutationFn: async () => {
      const body: any = {};
      body.maxRedemptions = maxRedemptions.trim() === "" ? null : Number(maxRedemptions);
      if (pushStatus?.cert) {
        const cents = parseDollars(certRetail);
        body.signedCertRetailCents = cents;
      }
      const r = await apiRequest("PUT", `/api/admin/albums/${albumId}`, body);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "shopify-push"] });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });

  const push = useMutation({
    mutationFn: async (opts: { force?: boolean } = {}) => {
      // Persist edits first so the push uses the latest values.
      await savePushFields.mutateAsync();
      const body: any = { force: !!opts.force };
      if (pushStoreId) body.storeId = pushStoreId;
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/shopify-push`, body);
      return r.json();
    },
    onSuccess: (r: any) => {
      setPushConflicts(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums", albumId, "shopify-push"] });
      toast({ title: r.action === "updated" ? "Updated draft on Shopify" : "Pushed draft to Shopify" });
    },
    onError: async (e: any) => {
      // 409 conflict — surface the field list so the operator can
      // confirm-overwrite. apiRequest throws on non-2xx with a string
      // body that may include the JSON payload.
      const msg = String(e?.message ?? "");
      const m = msg.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          const j = JSON.parse(m[0]);
          if (Array.isArray(j.conflicts) && j.conflicts.length > 0) {
            setPushConflicts(j.conflicts);
            return;
          }
        } catch {}
      }
      toast({ title: "Push failed", description: e?.message, variant: "destructive" });
    },
  });

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

  const earnings = pushStatus?.earnings ?? null;
  const liveCertCents = parseDollars(certRetail);
  const liveEarnings = earnings && liveCertCents != null
    ? {
        perCertCents: liveCertCents - earnings.wholesaleCents,
        totalCents: (liveCertCents - earnings.wholesaleCents) * earnings.plannedQuantity,
      }
    : null;

  return (
    <div className="py-6" data-testid="panel-shopify">
      <div className="max-w-3xl">
        {/* Push to Shopify (Task #242) — creates a DRAFT product on the
            label's connected store. Sits above the URL-pasting flow
            because this is the path most labels will take by default. */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 mb-6" data-testid="section-shopify-push">
          <h2 className="text-[15px] font-semibold text-slate-900 mb-1">Push to Shopify as a draft</h2>
          <p className="text-[13px] text-slate-500 mb-4 leading-snug">
            One-click create the album as a draft Shopify product on a connected store, with a “GoodTunes Edition”
            variant{pushStatus?.cert ? " plus an optional “+ Signed printed GoodDeed” variant" : ""}. We never publish
            for you — the label flips it live in Shopify when they’re ready.
          </p>

          {pushStatus && pushStatus.stores.length === 0 && (
            <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-[12.5px] text-slate-600">
              No Shopify store connected. Install GoodTunes on a store at{" "}
              <a className="text-[var(--brand-blue)] underline" href="/admin/shopify">/admin/shopify</a> first.
            </div>
          )}

          {pushStatus && pushStatus.stores.length > 0 && (
            <div className="space-y-3">
              {pushStatus.stores.length > 1 && (
                <div>
                  <label className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Store</label>
                  <select
                    value={pushStoreId}
                    onChange={(e) => setPushStoreId(e.target.value)}
                    className="w-full h-8 border border-slate-300 rounded-md px-2 text-[13px] bg-white"
                    data-testid="select-push-store"
                  >
                    <option value="">— Pick a store —</option>
                    {pushStatus.stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.storeName ?? s.shopDomain}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                    Edition price
                  </label>
                  <div className="h-8 px-2 flex items-center text-[13px] text-slate-700 bg-slate-50 rounded-md border border-slate-200">
                    {pushStatus.album.priceCents != null
                      ? `$${(pushStatus.album.priceCents / 100).toFixed(2)}`
                      : "— set bundle price on Sell tab"}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                    Edition inventory cap
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={maxRedemptions}
                    onChange={(e) => setMaxRedemptions(e.target.value)}
                    placeholder="Uncapped"
                    className="w-full h-8 border border-slate-300 rounded-md px-2 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
                    data-testid="input-push-max-redemptions"
                  />
                </div>
              </div>

              {pushStatus.cert && (
                <div className="rounded-md bg-emerald-50/40 border border-emerald-200 p-3 space-y-2">
                  <div className="text-[12px] font-semibold text-slate-700">Signed-cert variant</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                        Retail (fan-facing)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 text-[12px]">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={certRetail}
                          onChange={(e) => setCertRetail(e.target.value)}
                          placeholder="0.00"
                          className="flex-1 h-8 border border-slate-300 rounded-md px-2 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
                          data-testid="input-push-cert-retail"
                        />
                      </div>
                      {pushStatus.cert.minPriceCents != null && (
                        <div className="text-[11px] text-slate-400 mt-1">
                          Min ${(pushStatus.cert.minPriceCents / 100).toFixed(2)}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                        Inventory cap (planned)
                      </label>
                      <div className="h-8 px-2 flex items-center text-[13px] text-slate-700 bg-white rounded-md border border-slate-200">
                        {pushStatus.cert.plannedQuantity != null ? `${pushStatus.cert.plannedQuantity} units` : "—"}
                      </div>
                    </div>
                  </div>
                  {earnings && (
                    <div className="text-[12px] text-slate-600 leading-snug pt-1" data-testid="text-push-earnings">
                      <span className="font-semibold text-slate-800">Earnings preview</span> · GoodTunes bills{" "}
                      <span className="font-semibold">${(earnings.wholesaleCents / 100).toFixed(2)}</span>/cert at the{" "}
                      {earnings.rungLabel} rung. At {dollars(liveCertCents)} retail you keep{" "}
                      <span className="font-semibold text-emerald-700">{dollars(liveEarnings?.perCertCents ?? null)}</span>{" "}
                      per cert · <span className="font-semibold">{dollars(liveEarnings?.totalCents ?? null)}</span> total
                      across {earnings.plannedQuantity} units.
                    </div>
                  )}
                </div>
              )}

              {pushConflicts && pushConflicts.length > 0 && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3" data-testid="push-conflict-banner">
                  <div className="flex items-start gap-2 text-[12.5px] text-amber-900">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold">The label edited this product on Shopify.</div>
                      <div className="mt-1">Re-pushing will overwrite: {pushConflicts.join(", ")}.</div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => push.mutate({ force: true })}
                          disabled={push.isPending}
                          className="h-7 px-2.5 rounded-md bg-amber-700 text-white text-[12px] font-medium hover:bg-amber-800 disabled:opacity-50"
                          data-testid="button-push-confirm-overwrite"
                        >
                          {push.isPending ? "Overwriting…" : "Overwrite anyway"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPushConflicts(null)}
                          className="h-7 px-2.5 rounded-md bg-white border border-amber-300 text-amber-900 text-[12px] font-medium hover:bg-amber-50"
                          data-testid="button-push-cancel-overwrite"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                {pushStatus.push ? (
                  <a
                    href={pushStatus.push.adminUrl ?? "#"}
                    target="_blank"
                    rel="noopener"
                    className="text-[12px] text-[var(--brand-blue)] hover:underline inline-flex items-center gap-1"
                    data-testid="link-push-shopify-admin"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Draft on {pushStatus.push.storeName ?? pushStatus.push.shopDomain ?? "Shopify"}
                    {pushStatus.push.pushedAt && (
                      <span className="text-slate-400 ml-1">
                        · pushed {new Date(pushStatus.push.pushedAt).toLocaleString()}
                      </span>
                    )}
                  </a>
                ) : (
                  <div className="text-[12px] text-slate-400">Not pushed yet.</div>
                )}
                <button
                  type="button"
                  onClick={() => push.mutate({})}
                  disabled={push.isPending || pushStatus.album.priceCents == null || (pushStatus.stores.length > 1 && !pushStoreId)}
                  className="h-9 px-3 rounded-md bg-[var(--brand-blue)] text-white text-[12px] font-medium hover:bg-[var(--brand-blue-hover)] disabled:opacity-50 inline-flex items-center gap-1.5"
                  data-testid="button-push-to-shopify"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {push.isPending ? "Pushing…" : pushStatus.push ? "Re-push as draft" : "Push as draft"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sales mirror (Task #243) — read-only retail + units sold per
            pushed variant. Renders only when the album has actually been
            pushed (edition + optional cert variant ids on the row).
            Refresh pulls live retail past the 60s server cache. */}
        <ShopifySalesPanel albumId={albumId} />

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

// ── ShopifySalesPanel (Task #243) ────────────────────────────────────
// Per-variant read-only mirror of "what is this priced at on Shopify,
// and how many have sold?". Backed by GET /api/admin/albums/:id/
// shopify-sales which returns one row per pushed variant (edition +
// optional cert). Hidden entirely when the album has not been pushed
// to Shopify yet — the existing empty state on the panel above
// continues to cover the "not mapped" case.
type SalesVariant = {
  kind: "edition" | "cert";
  label: string;
  variantId: string;
  retail: { priceCents: number | null; currency: string | null; removed: boolean } | null;
  unitsSold: number;
};
type SalesResponse = {
  mapped: boolean;
  storeName?: string;
  fetchedAt?: string;
  variants: SalesVariant[];
};

function formatRelative(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.round((now - t) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ShopifySalesPanel({ albumId }: { albumId: string }) {
  const queryKey = ["/api/admin/albums", albumId, "shopify-sales"] as const;
  const { data, isLoading, isFetching, refetch } = useQuery<SalesResponse>({ queryKey });

  // Tick once a second so the "Updated 12s ago" line stays current
  // without re-fetching anything. Cheap state update.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(i);
  }, []);

  const refresh = async () => {
    // Bypass the server's 60s cache and pull fresh from Shopify.
    await queryClient.fetchQuery({
      queryKey,
      queryFn: async () => {
        const r = await apiRequest("GET", `/api/admin/albums/${albumId}/shopify-sales?refresh=1`);
        return r.json();
      },
    });
    refetch();
  };

  if (isLoading || !data) return null;
  if (!data.mapped || data.variants.length === 0) return null;

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4 mb-6"
      data-testid="section-shopify-sales"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Live on Shopify</h2>
          <p className="text-xs text-slate-500 leading-snug">
            Retail price and units sold to date{data.storeName ? ` on ${data.storeName}` : ""}, mirrored from Shopify.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isFetching}
          className="h-8 px-2.5 rounded-md border border-slate-300 bg-white text-xs text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
          data-testid="button-shopify-sales-refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Refreshing…" : "Refresh from Shopify"}
        </button>
      </div>

      <div className={`grid gap-3 ${data.variants.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {data.variants.map((v) => {
          const removed = v.retail?.removed === true;
          const price = v.retail?.priceCents ?? null;
          return (
            <div
              key={v.variantId}
              className="rounded-md border border-slate-200 bg-slate-50/60 p-3"
              data-testid={`shopify-sales-variant-${v.kind}`}
            >
              <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2">
                {v.label}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-0.5">
                    Retail
                  </div>
                  <div
                    className={`text-sm font-semibold ${removed ? "text-rose-600" : "text-slate-900"}`}
                    data-testid={`text-sales-retail-${v.kind}`}
                  >
                    {removed
                      ? "Removed in Shopify"
                      : price != null
                        ? `$${(price / 100).toFixed(2)}`
                        : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-0.5">
                    Units sold
                  </div>
                  <div
                    className="text-sm font-semibold text-slate-900"
                    data-testid={`text-sales-units-${v.kind}`}
                  >
                    {v.unitsSold.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {data.fetchedAt && (
        <div className="text-xs text-slate-400 mt-3" data-testid="text-shopify-sales-stamp">
          Updated {formatRelative(data.fetchedAt, now)}
        </div>
      )}
    </div>
  );
}
