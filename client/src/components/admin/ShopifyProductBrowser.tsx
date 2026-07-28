import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Search, RefreshCw, Image as ImageIcon, X as XIcon, ExternalLink } from "lucide-react";
import { apiRequest, apiErrorBody } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── Shared product type ──────────────────────────────────────────────
// Used by the legacy list/grid browser and the new variant picker dialog.
export type ShopifyBrowseProduct = {
  id: string;
  title: string;
  productType: string | null;
  image: string | null;
  onlineStoreUrl?: string | null;
  variants: { id: string; title: string; price: string; inventoryQuantity?: number | null }[];
};

// Variant picked from the new dialog picker — richer than ShopifyBrowseProduct
// since it carries both the chosen variant AND its parent product context.
export type PickedVariant = {
  variantId: string;
  variantTitle: string;
  price: string;
  inventoryQuantity: number | null;
  productId: string;
  productTitle: string;
  onlineStoreUrl: string | null;
  storeId: string;
};

type ProductsResponse = { products: ShopifyBrowseProduct[]; nextCursor: string | null };

// ─── Resolve endpoint shape (paste-URL path) ─────────────────────────
type ResolvedProduct = {
  storeId: string;
  shopifyProductId: string;
  shopifyProductTitle: string;
  variants: { id: string; title: string; price: string }[];
  albumId: string;
};

// ─── Variant Picker Dialog (Task #2909) ──────────────────────────────
// 620px dialog with search, grouped variant-level list, already-linked
// overlays, "Load more" cursor paging, and a "paste URL" footer fallback.
export function ShopifyVariantPickerDialog({
  open,
  onOpenChange,
  storeId,
  storeName,
  storeShopDomain,
  albumId,
  linkedVariantIds,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeId: string;
  storeName?: string | null;
  storeShopDomain?: string | null;
  albumId: string;
  linkedVariantIds?: ReadonlySet<string>;
  onPick: (v: PickedVariant) => void;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<ShopifyBrowseProduct[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // paste-URL fallback
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  // Task #2909 fix: track the resolved storeId per injected product so a
  // pasted URL from a different store doesn't create a storeId mismatch.
  const [resolvedStoreIds, setResolvedStoreIds] = useState<Map<string, string>>(new Map());
  const reqRef = useRef(0);

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebounced("");
      setItems([]);
      setCursor(null);
      setError(null);
      setPasteOpen(false);
      setPasteUrl("");
      setPasteError(null);
      setResolvedStoreIds(new Map());
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (after: string | null): Promise<ProductsResponse> => {
      const params = new URLSearchParams();
      if (debounced) params.set("search", debounced);
      if (after) params.set("cursor", after);
      const r = await apiRequest(
        "GET",
        `/api/admin/shopify/stores/${storeId}/products${params.toString() ? `?${params}` : ""}`,
      );
      return r.json();
    },
    [storeId, debounced],
  );

  useEffect(() => {
    if (!storeId || !open) return;
    const myReq = ++reqRef.current;
    setLoading(true);
    setError(null);
    fetchPage(null)
      .then((d) => {
        if (reqRef.current !== myReq) return;
        setItems(d.products ?? []);
        setCursor(d.nextCursor ?? null);
      })
      .catch((err) => {
        if (reqRef.current !== myReq) return;
        const body = apiErrorBody<{ code?: string }>(err);
        setError(
          body?.code === "shopify_reconnect_required"
            ? `The Shopify connection${storeName ? ` for ${storeName}` : ""} expired. Reconnect the store to load products.`
            : `Couldn't load products${storeName ? ` from ${storeName}` : ""}.`,
        );
        setItems([]);
        setCursor(null);
      })
      .finally(() => {
        if (reqRef.current === myReq) setLoading(false);
      });
  }, [storeId, debounced, open, fetchPage, storeName]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const myReq = reqRef.current;
    setLoadingMore(true);
    try {
      const d = await fetchPage(cursor);
      if (reqRef.current !== myReq) return;
      setItems((prev) => [...prev, ...(d.products ?? [])]);
      setCursor(d.nextCursor ?? null);
    } catch {
      if (reqRef.current === myReq) setError("Couldn't load more products.");
    } finally {
      if (reqRef.current === myReq) setLoadingMore(false);
    }
  }

  async function resolvePastedUrl() {
    const trimmed = pasteUrl.trim();
    if (!trimmed) return;
    setPasting(true);
    setPasteError(null);
    try {
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/shopify-mappings/resolve`, {
        url: trimmed,
      });
      const data: ResolvedProduct = await r.json();
      // Treat the resolved product as a single-variant product in the picker.
      // If the product only has one variant, auto-pick it.
      if (data.variants.length === 1) {
        const v = data.variants[0];
        onPick({
          variantId: v.id,
          variantTitle: v.title,
          price: v.price,
          inventoryQuantity: null,
          productId: data.shopifyProductId,
          productTitle: data.shopifyProductTitle,
          onlineStoreUrl: null,
          storeId: data.storeId,
        });
        onOpenChange(false);
      } else {
        // Multiple variants — add the resolved product to the top of the list.
        // Record the storeId from the server so if this product came from a
        // different connected store, onPick uses the correct storeId.
        const resolvedStoreId = data.storeId;
        const resolved: ShopifyBrowseProduct = {
          id: data.shopifyProductId,
          title: data.shopifyProductTitle,
          productType: null,
          image: null,
          onlineStoreUrl: null,
          variants: data.variants.map((v) => ({
            id: v.id,
            title: v.title,
            price: v.price,
            inventoryQuantity: null,
          })),
        };
        setResolvedStoreIds((prev) => {
          const next = new Map(prev);
          next.set(data.shopifyProductId, resolvedStoreId);
          return next;
        });
        setItems((prev) => [resolved, ...prev.filter((p) => p.id !== data.shopifyProductId)]);
        setPasteOpen(false);
        setPasteUrl("");
      }
    } catch (e: any) {
      setPasteError(
        apiErrorBody<{ message?: string }>(e)?.message ??
          (e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Couldn't find that product"),
      );
    } finally {
      setPasting(false);
    }
  }

  const newProductUrl = storeShopDomain
    ? `https://admin.shopify.com/store/${storeShopDomain.replace(/\.myshopify\.com$/, "")}/products/new`
    : null;

  const isEmpty = !loading && !error && items.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col"
        style={{ maxWidth: "620px", boxShadow: "0 12px 32px rgba(15,23,42,.10)" }}
        data-testid="dialog-variant-picker"
      >
        <DialogHeader className="px-5 pt-5 pb-0 shrink-0">
          <DialogTitle className="text-[15px] font-semibold text-slate-900">
            Link a Shopify product
          </DialogTitle>
        </DialogHeader>

        {/* Search bar */}
        <div className="px-5 pt-3 pb-0 shrink-0">
          <div className="flex items-center gap-2 h-9 rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-3">
            <Search className="w-[15px] h-[15px] text-slate-400 shrink-0" strokeWidth={1.75} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="flex-1 bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
              data-testid="input-variant-picker-search"
              autoFocus
            />
            {(loading || loadingMore) && (
              <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin shrink-0" strokeWidth={1.75} />
            )}
            {search && !loading && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-slate-400 hover:text-slate-600"
              >
                <XIcon className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>

        {/* Product + variant list */}
        <div className="overflow-y-auto flex-1 min-h-0 mt-3" data-testid="variant-picker-list">
          {error && (
            <div className="px-5 py-6 text-center text-[12.5px] text-slate-500">
              {error}
            </div>
          )}

          {isEmpty && !error && (
            <div className="px-5 py-8 text-center" data-testid="variant-picker-empty">
              {debounced ? (
                <>
                  <p className="text-[13px] text-slate-600 mb-1">
                    No products matched "{debounced}".
                  </p>
                  <p className="text-[12.5px] text-slate-400">
                    Check the product name in Shopify
                    {newProductUrl && (
                      <>, or{" "}
                        <a
                          href={newProductUrl}
                          target="_blank"
                          rel="noopener"
                          className="text-[#1f7fb8] hover:underline"
                        >
                          create it in your store ↗
                        </a>
                      </>
                    )}.
                  </p>
                </>
              ) : (
                <p className="text-[12.5px] text-slate-400">No products found in this store.</p>
              )}
            </div>
          )}

          {items.map((product) => (
            <div key={product.id} className="px-5" data-testid={`picker-product-${product.id}`}>
              {/* Product name header */}
              <div className="pt-3 pb-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {product.title}
                </span>
              </div>
              {/* Variant rows */}
              {product.variants.map((v) => {
                const alreadyLinked = linkedVariantIds?.has(v.id) ?? false;
                const stock = v.inventoryQuantity;
                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={alreadyLinked}
                    onClick={() => {
                      if (alreadyLinked) return;
                      // Use the resolved storeId for paste-URL products (may
                      // differ from the currently-selected store).
                      const effectiveStoreId =
                        resolvedStoreIds.get(product.id) ?? storeId;
                      onPick({
                        variantId: v.id,
                        variantTitle: v.title,
                        price: v.price,
                        inventoryQuantity: v.inventoryQuantity ?? null,
                        productId: product.id,
                        productTitle: product.title,
                        onlineStoreUrl: product.onlineStoreUrl ?? null,
                        storeId: effectiveStoreId,
                      });
                      onOpenChange(false);
                    }}
                    className={[
                      "w-full flex items-center gap-3 py-2.5 rounded-md px-2 -mx-2 text-left transition-colors duration-[140ms]",
                      alreadyLinked
                        ? "opacity-55 cursor-default"
                        : "hover:bg-[#f8fafc] cursor-pointer",
                    ].join(" ")}
                    data-testid={`picker-variant-${v.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] text-slate-900">{v.title}</span>
                      <span className="text-[12.5px] text-slate-500 ml-2">${v.price}</span>
                      {stock != null && (
                        <span className="text-[11.5px] text-slate-400 ml-2">
                          {stock} in stock
                        </span>
                      )}
                    </div>
                    {alreadyLinked && (
                      <span className="text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                        Already linked
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {/* Load more */}
          {cursor && (
            <div className="px-5 py-3">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full h-9 rounded-md border border-[#e2e8f0] bg-white text-[12.5px] font-medium text-slate-700 hover:bg-[#f8fafc] disabled:opacity-50 transition-colors duration-[140ms]"
                data-testid="button-picker-load-more"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>

        {/* Footer strip */}
        <div className="border-t border-[#e2e8f0] bg-[#f8fafc] shrink-0">
          {pasteOpen ? (
            <div className="px-5 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={pasteUrl}
                  onChange={(e) => { setPasteUrl(e.target.value); setPasteError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") resolvePastedUrl(); }}
                  placeholder="https://store.myshopify.com/products/album-vinyl"
                  className="flex-1 h-9 rounded-md border border-[#e2e8f0] bg-white px-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1f7fb8]"
                  autoFocus
                  data-testid="input-picker-paste-url"
                />
                <button
                  type="button"
                  onClick={resolvePastedUrl}
                  disabled={pasting || !pasteUrl.trim()}
                  className="h-9 px-3.5 rounded-md bg-[#1f7fb8] text-white text-[13px] font-medium hover:bg-[#1a6da0] disabled:opacity-50 transition-colors duration-[140ms]"
                  data-testid="button-picker-resolve-url"
                >
                  {pasting ? "Finding…" : "Find"}
                </button>
                <button
                  type="button"
                  onClick={() => { setPasteOpen(false); setPasteUrl(""); setPasteError(null); }}
                  className="h-9 px-3 rounded-md border border-[#e2e8f0] bg-white text-[13px] text-slate-600 hover:bg-[#f8fafc] transition-colors duration-[140ms]"
                >
                  Cancel
                </button>
              </div>
              {pasteError && (
                <p className="text-[12px] text-rose-600" data-testid="text-picker-paste-error">
                  {pasteError}
                </p>
              )}
            </div>
          ) : (
            <div className="px-5 py-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPasteOpen(true)}
                className="text-[12.5px] text-slate-500 hover:text-[#1f7fb8] transition-colors duration-[140ms]"
                data-testid="button-picker-paste-url"
              >
                Can't find it? Paste a product URL
              </button>
              {newProductUrl && (
                <a
                  href={newProductUrl}
                  target="_blank"
                  rel="noopener"
                  className="text-[12px] text-slate-400 hover:text-[#1f7fb8] inline-flex items-center gap-1 transition-colors duration-[140ms]"
                  data-testid="link-picker-create-product"
                >
                  Create in your store
                  <ExternalLink className="w-[13px] h-[13px]" strokeWidth={1.75} />
                </a>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Legacy list/grid browser (kept for AdminPerson.tsx) ──────────────
/**
 * Task #2435 — reusable Shopify store product browser. Backs the artist
 * Overview product browser ("grid" layout). Search filters case-insensitively
 * (server-side substring); with no search the operator can page through the
 * WHOLE catalog via the cursor "Load more" button.
 */
export function ShopifyProductBrowser({
  storeId,
  storeName,
  selectedProductId,
  onPick,
  layout = "list",
  heightClass = "max-h-64",
  helpNode,
}: {
  storeId: string;
  storeName?: string | null;
  selectedProductId?: string | null;
  onPick: (p: ShopifyBrowseProduct) => void;
  layout?: "list" | "grid";
  heightClass?: string;
  helpNode?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<ShopifyBrowseProduct[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  async function fetchPage(next: string | null): Promise<ProductsResponse> {
    const params = new URLSearchParams();
    if (debounced) params.set("search", debounced);
    if (next) params.set("cursor", next);
    const r = await apiRequest(
      "GET",
      `/api/admin/shopify/stores/${storeId}/products${params.toString() ? `?${params}` : ""}`,
    );
    return r.json();
  }

  useEffect(() => {
    if (!storeId) {
      setItems([]);
      setCursor(null);
      return;
    }
    const myReq = ++reqRef.current;
    setLoading(true);
    setError(null);
    setTypeFilter("");
    fetchPage(null)
      .then((d) => {
        if (reqRef.current !== myReq) return;
        setItems(d.products ?? []);
        setCursor(d.nextCursor ?? null);
      })
      .catch((err) => {
        if (reqRef.current !== myReq) return;
        const body = apiErrorBody<{ code?: string }>(err);
        setError(
          body?.code === "shopify_reconnect_required"
            ? `The Shopify connection${storeName ? ` for ${storeName}` : ""} expired. Reconnect the store to load products.`
            : `Couldn't load products${storeName ? ` from ${storeName}` : ""}.`,
        );
        setItems([]);
        setCursor(null);
      })
      .finally(() => {
        if (reqRef.current === myReq) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, debounced]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const myReq = reqRef.current;
    setLoadingMore(true);
    try {
      const d = await fetchPage(cursor);
      if (reqRef.current !== myReq) return;
      setItems((prev) => [...prev, ...(d.products ?? [])]);
      setCursor(d.nextCursor ?? null);
    } catch {
      if (reqRef.current === myReq) setError("Couldn't load more products");
    } finally {
      if (reqRef.current === myReq) setLoadingMore(false);
    }
  }

  const productTypes = Array.from(
    new Set(items.filter((p) => p.productType).map((p) => p.productType!)),
  ).sort((a, b) => a.localeCompare(b));

  const shown = typeFilter ? items.filter((p) => p.productType === typeFilter) : items;

  function variantLine(p: ShopifyBrowseProduct) {
    if (p.variants.length > 1) return `${p.variants.length} variants · from $${p.variants[0]?.price ?? "—"}`;
    return p.variants[0] ? `$${p.variants[0].price}` : "No variants";
  }

  const isSelected = (p: ShopifyBrowseProduct) => selectedProductId != null && selectedProductId === p.id;

  return (
    <div className="rounded-md border border-slate-200 overflow-hidden" data-testid="shopify-product-browser">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50">
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="flex-1 bg-transparent text-[13px] focus:outline-none"
          data-testid="input-shopify-product-search"
        />
        {(loading || loadingMore) && <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin shrink-0" />}
      </div>

      {productTypes.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-slate-100 bg-white">
          <button
            type="button"
            onClick={() => setTypeFilter("")}
            className={[
              "px-2 py-0.5 rounded-full text-[11.5px] border",
              typeFilter === "" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50",
            ].join(" ")}
            data-testid="chip-product-type-all"
          >
            All
          </button>
          {productTypes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter((cur) => (cur === t ? "" : t))}
              className={[
                "px-2 py-0.5 rounded-full text-[11.5px] border",
                typeFilter === t ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50",
              ].join(" ")}
              data-testid={`chip-product-type-${t}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className={`${heightClass} overflow-y-auto`}>
        {!loading && shown.length === 0 && (
          <div className="px-3 py-6 text-center text-[12.5px] text-slate-400" data-testid="text-browser-empty">
            {error
              ? error
              : debounced
                ? "No products matched that search"
                : typeFilter
                  ? "No products of that type loaded yet"
                  : "No products found in this store"}
            {helpNode && (error || (!debounced && !typeFilter)) && (
              <div className="mt-1.5 text-slate-500" data-testid="text-browser-help">
                {helpNode}
              </div>
            )}
          </div>
        )}

        {layout === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3">
            {shown.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
                className={[
                  "flex flex-col text-left rounded-lg border overflow-hidden hover:border-slate-400 transition-colors",
                  isSelected(p) ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200",
                ].join(" ")}
                data-testid={`button-browse-product-${p.id}`}
              >
                {p.image ? (
                  <img src={p.image} alt="" className="w-full aspect-square object-cover bg-slate-100" />
                ) : (
                  <div className="w-full aspect-square bg-slate-100 flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-slate-300" />
                  </div>
                )}
                <div className="p-2 min-w-0">
                  <div className="text-[12.5px] font-medium text-slate-900 truncate">{p.title}</div>
                  <div className="text-[11px] text-slate-500 truncate">{variantLine(p)}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {shown.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
                className={[
                  "w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50",
                  isSelected(p) ? "bg-blue-50" : "",
                ].join(" ")}
                data-testid={`button-browse-product-${p.id}`}
              >
                {p.image ? (
                  <img src={p.image} alt="" className="w-9 h-9 rounded object-cover shrink-0 bg-slate-100" />
                ) : (
                  <div className="w-9 h-9 rounded bg-slate-100 flex items-center justify-center shrink-0">
                    <ImageIcon className="w-4 h-4 text-slate-300" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-slate-900 truncate">{p.title}</div>
                  <div className="text-[11.5px] text-slate-500 truncate">{variantLine(p)}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {cursor && !typeFilter && (
          <div className="p-3">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full h-9 rounded-md border border-slate-300 bg-white text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              data-testid="button-load-more-products"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
