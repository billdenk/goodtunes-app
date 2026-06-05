import { useMemo, useState } from "react";
import { Link, useRoute, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Users, DollarSign, ShoppingBag, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminErrorBoundary, ErrorState } from "@/components/admin/AdminErrorBoundary";
import { apiRequest } from "@/lib/queryClient";

type Kpis = { totalOrders: number; distinctFans: number; totalCents: number };
type AlbumRow = { albumId: string; title: string; artwork: string | null; orders: number; fans: number; revenueCents: number };
type OrderRow = {
  orderId: string; createdAt: string; status: string; totalCents: number;
  albumId: string; albumTitle: string;
  buyerName: string | null; buyerEmail: string | null; customerId: string | null;
  city: string | null; state: string | null; country: string | null;
};
type Payload = { kpis: Kpis; albums: AlbumRow[]; orders: OrderRow[]; total: number };

function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function locationStr(row: OrderRow) {
  const parts = [row.city, row.state, row.country].filter(Boolean);
  return parts.join(", ") || null;
}

function StatCard({ label, value, icon: Icon, testId }: { label: string; value: string; icon: React.ElementType; testId?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-3" data-testid={testId}>
      <div className="w-9 h-9 rounded-lg bg-[var(--brand-blue)]/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-[var(--brand-blue)]" strokeWidth={1.8} />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
        <div className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function AlbumBreakdownTable({ albums, selectedAlbumId, onSelectAlbum }: {
  albums: AlbumRow[];
  selectedAlbumId: string | null;
  onSelectAlbum: (id: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
        data-testid="toggle-album-breakdown"
      >
        <h2 className="text-sm font-semibold text-slate-900">Per-album breakdown</h2>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {expanded && (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="text-left font-semibold px-5 py-2.5">Album</th>
                <th className="text-right font-semibold px-4 py-2.5">Orders</th>
                <th className="text-right font-semibold px-4 py-2.5">Fans</th>
                <th className="text-right font-semibold px-5 py-2.5">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {albums.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-400">No albums found.</td></tr>
              )}
              {albums.map((a) => {
                const active = selectedAlbumId === a.albumId;
                return (
                  <tr
                    key={a.albumId}
                    className={`hover:bg-slate-50 transition-colors cursor-pointer ${active ? "bg-[var(--brand-blue)]/5" : ""}`}
                    onClick={() => onSelectAlbum(active ? null : a.albumId)}
                    data-testid={`row-album-${a.albumId}`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {a.artwork ? (
                          <img src={a.artwork} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded bg-slate-100 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">{a.title}</div>
                          {active && <div className="text-xs text-[var(--brand-blue)] font-semibold">Filtered — click to clear</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{a.orders.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{a.fans.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-900">{formatMoney(a.revenueCents)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BuyerList({ orders, total, onLoadMore, isLoading, search, onSearch }: {
  orders: OrderRow[];
  total: number;
  onLoadMore: () => void;
  isLoading: boolean;
  search: string;
  onSearch: (v: string) => void;
}) {
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return orders;
    return orders.filter((o) =>
      (o.buyerName ?? "").toLowerCase().includes(q) ||
      (o.buyerEmail ?? "").toLowerCase().includes(q) ||
      (o.albumTitle ?? "").toLowerCase().includes(q) ||
      (o.city ?? "").toLowerCase().includes(q)
    );
  }, [orders, search]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">
          Buyer orders
          {total > 0 && <span className="ml-2 text-slate-400 font-normal text-xs">({total.toLocaleString()} total)</span>}
        </h2>
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2.5 h-8">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Filter loaded rows…"
            className="w-44 text-sm bg-transparent outline-none placeholder:text-slate-400"
            data-testid="input-search-buyers"
          />
          {search && (
            <button type="button" onClick={() => onSearch("")} className="text-slate-400 hover:text-slate-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <th className="text-left font-semibold px-5 py-2.5">Fan</th>
              <th className="text-left font-semibold px-4 py-2.5 hidden sm:table-cell">Album</th>
              <th className="text-left font-semibold px-4 py-2.5 hidden md:table-cell">Location</th>
              <th className="text-left font-semibold px-4 py-2.5 hidden md:table-cell">Date</th>
              <th className="text-right font-semibold px-5 py-2.5">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  {search ? "No orders match your filter." : "No orders yet."}
                </td>
              </tr>
            )}
            {filtered.map((o) => (
              <tr key={o.orderId} className="hover:bg-slate-50 transition-colors" data-testid={`row-order-${o.orderId}`}>
                <td className="px-5 py-3">
                  <div className="font-medium text-slate-900 truncate max-w-[180px]">
                    {o.customerId ? (
                      <Link
                        href={`/admin/customers/${o.customerId}`}
                        className="hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
                        data-testid={`link-customer-${o.customerId}`}
                      >
                        {o.buyerName ?? o.buyerEmail ?? "Anonymous"}
                      </Link>
                    ) : (
                      o.buyerName ?? o.buyerEmail ?? "Anonymous"
                    )}
                  </div>
                  {o.buyerEmail && (
                    <div className="text-xs text-slate-500 truncate max-w-[180px]">{o.buyerEmail}</div>
                  )}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <div className="text-slate-700 truncate max-w-[200px]">{o.albumTitle}</div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-slate-500">
                  {locationStr(o) ?? "—"}
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-slate-500 whitespace-nowrap">
                  {formatDate(o.createdAt)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-900">
                  {formatMoney(o.totalCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {orders.length < total && (
        <div className="px-5 py-3 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoading}
            className="text-sm font-medium text-[var(--brand-blue)] hover:underline disabled:text-slate-400 disabled:no-underline"
            data-testid="button-load-more-buyers"
          >
            {isLoading ? "Loading…" : `Load more (${orders.length} of ${total.toLocaleString()} loaded)`}
          </button>
        </div>
      )}
    </div>
  );
}

function AdminArtistBuyersInner() {
  const [, params] = useRoute<{ id: string }>("/admin/people/:id/buyers");
  const personId = params?.id ?? "";
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [allOrders, setAllOrders] = useState<OrderRow[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [search, setSearch] = useState("");

  const qs = useMemo(() => {
    const p = new URLSearchParams({ limit: "500", offset: String(offset) });
    if (selectedAlbumId) p.set("albumId", selectedAlbumId);
    return p.toString();
  }, [selectedAlbumId, offset]);

  const { data: person } = useQuery<{ id: string; name: string; photoUrl?: string | null }>({
    queryKey: ["/api/admin/people", personId],
  });

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<Payload>({
    queryKey: ["/api/admin/people", personId, "buyers", qs],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/people/${personId}/buyers?${qs}`);
      const json = (await res.json()) as Payload;
      setTotalOrders(json.total);
      if (offset === 0) {
        setAllOrders(json.orders);
      } else {
        setAllOrders((prev) => [...prev, ...json.orders]);
      }
      return json;
    },
  });

  function handleSelectAlbum(albumId: string | null) {
    setSelectedAlbumId(albumId);
    setOffset(0);
    setAllOrders([]);
  }

  function handleLoadMore() {
    setOffset(allOrders.length);
  }

  const kpis = data?.kpis;
  const albums = data?.albums ?? [];

  return (
    <AdminFrame active="people" contentWidth="wide">
      <div className="space-y-5">
        <Link
          href={`/admin/people/${personId}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
          data-testid="link-back-to-person"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {person?.name ?? "Person"}
        </Link>

        <AdminPageHeader
          title={`Buyer roster — ${person?.name ?? "Artist"}`}
          subtitle={
            selectedAlbumId
              ? `Filtered to one album · click the album row to clear`
              : `All fans who purchased any release from this artist`
          }
          testId="heading-artist-buyers"
        />

        {isLoading && offset === 0 && (
          <div className="py-10 text-slate-500 text-sm">Loading…</div>
        )}
        {isError && offset === 0 && (
          <ErrorState
            error={error}
            onRetry={() => refetch()}
            title="Couldn't load buyer roster"
            testId="artist-buyers-error"
          />
        )}

        {kpis && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="kpi-grid">
              <StatCard label="Total orders" value={kpis.totalOrders.toLocaleString()} icon={ShoppingBag} testId="kpi-orders" />
              <StatCard label="Distinct fans" value={kpis.distinctFans.toLocaleString()} icon={Users} testId="kpi-fans" />
              <StatCard label="Gross revenue" value={formatMoney(kpis.totalCents)} icon={DollarSign} testId="kpi-revenue" />
            </div>

            {!selectedAlbumId && (
              <AlbumBreakdownTable
                albums={albums}
                selectedAlbumId={selectedAlbumId}
                onSelectAlbum={handleSelectAlbum}
              />
            )}

            {selectedAlbumId && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">Filtered to album</span>
                <button
                  type="button"
                  onClick={() => handleSelectAlbum(null)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-blue)] hover:underline"
                  data-testid="button-clear-album-filter"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear filter
                </button>
              </div>
            )}

            <BuyerList
              orders={allOrders}
              total={totalOrders}
              onLoadMore={handleLoadMore}
              isLoading={isFetching}
              search={search}
              onSearch={setSearch}
            />
          </>
        )}
      </div>
    </AdminFrame>
  );
}

export function AdminArtistBuyers() {
  return (
    <AdminErrorBoundary title="Buyer roster failed to render">
      <AdminArtistBuyersInner />
    </AdminErrorBoundary>
  );
}
