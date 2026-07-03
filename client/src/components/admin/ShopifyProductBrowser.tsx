import { useEffect, useMemo, useRef, useState } from "react";
import { Search, RefreshCw, Image as ImageIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// Shared shape returned by GET /api/admin/shopify/stores/:storeId/products.
export type ShopifyBrowseProduct = {
  id: string;
  title: string;
  productType: string | null;
  image: string | null;
  variants: { id: string; title: string; price: string }[];
};

type ProductsResponse = { products: ShopifyBrowseProduct[]; nextCursor: string | null };

/**
 * Task #2435 — reusable Shopify store product browser. Backs both the album
 * Shopify tab's picker ("list" layout) and the artist Overview product browser
 * ("grid" layout). Search filters case-insensitively (server-side substring);
 * with no search the operator can page through the WHOLE catalog via the
 * cursor "Load more" button. A lightweight product-type chip row refines the
 * currently-loaded items client-side.
 */
export function ShopifyProductBrowser({
  storeId,
  selectedProductId,
  onPick,
  layout = "list",
  heightClass = "max-h-64",
}: {
  storeId: string;
  selectedProductId?: string | null;
  onPick: (p: ShopifyBrowseProduct) => void;
  layout?: "list" | "grid";
  heightClass?: string;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<ShopifyBrowseProduct[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every store/search change so a slow in-flight response can't
  // land after a newer request and clobber the list.
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

  // Reset + load the first page whenever the store or search term changes.
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
      .catch(() => {
        if (reqRef.current !== myReq) return;
        setError("Couldn't load products");
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

  const productTypes = useMemo(() => {
    const set = new Set<string>();
    for (const p of items) if (p.productType) set.add(p.productType);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const shown = useMemo(
    () => (typeFilter ? items.filter((p) => p.productType === typeFilter) : items),
    [items, typeFilter],
  );

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
