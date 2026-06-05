import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Users, DollarSign, ShoppingBag, Search, X } from "lucide-react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminErrorBoundary, ErrorState } from "@/components/admin/AdminErrorBoundary";
import { apiRequest } from "@/lib/queryClient";

type Kpis = { totalOrders: number; distinctFans: number; totalCents: number };
type OrderRow = {
  orderId: string; createdAt: string; status: string; totalCents: number;
  buyerName: string | null; buyerEmail: string | null; customerId: string | null;
  city: string | null; state: string | null; country: string | null;
};
type Payload = { kpis: Kpis; orders: OrderRow[]; total: number };

type Album = { id: string; title: string; artist: string; artwork: string | null };

function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function locationStr(row: OrderRow) {
  return [row.city, row.state, row.country].filter(Boolean).join(", ") || null;
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

function AdminAlbumBuyersInner() {
  const [, params] = useRoute<{ id: string }>("/admin/albums/:id/buyers");
  const albumId = params?.id ?? "";
  const [offset, setOffset] = useState(0);
  const [allOrders, setAllOrders] = useState<OrderRow[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [search, setSearch] = useState("");

  const { data: album } = useQuery<Album>({ queryKey: ["/api/albums", albumId] });

  const qs = useMemo(() => new URLSearchParams({ limit: "200", offset: String(offset) }).toString(), [offset]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<Payload>({
    queryKey: ["/api/admin/albums", albumId, "buyers", qs],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/albums/${albumId}/buyers?${qs}`);
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allOrders;
    return allOrders.filter((o) =>
      (o.buyerName ?? "").toLowerCase().includes(q) ||
      (o.buyerEmail ?? "").toLowerCase().includes(q) ||
      (o.city ?? "").toLowerCase().includes(q)
    );
  }, [allOrders, search]);

  const kpis = data?.kpis;

  return (
    <AdminFrame active="albums" contentWidth="wide">
      <div className="space-y-5">
        <Link
          href={`/admin/albums/${albumId}/engagement`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
          data-testid="link-back-to-engagement"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {album?.title ?? "Album"} — Engagement
        </Link>

        <AdminPageHeader
          title={`Buyer roster — ${album?.title ?? "Album"}`}
          subtitle={`${album?.artist ?? ""} · all confirmed purchases`}
          testId="heading-album-buyers"
        />

        {isLoading && offset === 0 && (
          <div className="py-10 text-slate-500 text-sm">Loading…</div>
        )}
        {isError && offset === 0 && (
          <ErrorState
            error={error}
            onRetry={() => refetch()}
            title="Couldn't load buyer roster"
            testId="album-buyers-error"
          />
        )}

        {kpis && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="kpi-grid">
              <StatCard label="Total orders" value={kpis.totalOrders.toLocaleString()} icon={ShoppingBag} testId="kpi-orders" />
              <StatCard label="Distinct fans" value={kpis.distinctFans.toLocaleString()} icon={Users} testId="kpi-fans" />
              <StatCard label="Gross revenue" value={formatMoney(kpis.totalCents)} icon={DollarSign} testId="kpi-revenue" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">
                  Orders
                  {totalOrders > 0 && (
                    <span className="ml-2 text-slate-400 font-normal text-xs">
                      ({totalOrders.toLocaleString()} total)
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2.5 h-8">
                  <Search className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter loaded rows…"
                    className="w-40 text-sm bg-transparent outline-none placeholder:text-slate-400"
                    data-testid="input-search-buyers"
                  />
                  {search && (
                    <button type="button" onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-700">
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
                      <th className="text-left font-semibold px-4 py-2.5 hidden md:table-cell">Location</th>
                      <th className="text-left font-semibold px-4 py-2.5 hidden md:table-cell">Date</th>
                      <th className="text-right font-semibold px-5 py-2.5">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                          {search ? "No orders match your filter." : "No orders yet."}
                        </td>
                      </tr>
                    )}
                    {filtered.map((o) => (
                      <tr key={o.orderId} className="hover:bg-slate-50 transition-colors" data-testid={`row-order-${o.orderId}`}>
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-900 truncate max-w-[200px]">
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
                            <div className="text-xs text-slate-500 truncate max-w-[200px]">{o.buyerEmail}</div>
                          )}
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
              {allOrders.length < totalOrders && (
                <div className="px-5 py-3 border-t border-slate-100 text-center">
                  <button
                    type="button"
                    onClick={() => setOffset(allOrders.length)}
                    disabled={isFetching}
                    className="text-sm font-medium text-[var(--brand-blue)] hover:underline disabled:text-slate-400"
                    data-testid="button-load-more-buyers"
                  >
                    {isFetching ? "Loading…" : `Load more (${allOrders.length} of ${totalOrders.toLocaleString()} loaded)`}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminFrame>
  );
}

export function AdminAlbumBuyers() {
  return (
    <AdminErrorBoundary title="Buyer roster failed to render">
      <AdminAlbumBuyersInner />
    </AdminErrorBoundary>
  );
}
