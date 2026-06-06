import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  DollarSign,
  ShoppingBag,
  Search,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Check,
  Download,
  ChevronDown,
} from "lucide-react";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest } from "@/lib/queryClient";

type Kpis = { totalOrders: number; distinctFans: number; totalCents: number };
type OrderRow = {
  orderId: string;
  createdAt: string;
  status: string;
  totalCents: number;
  buyerName: string | null;
  buyerEmail: string | null;
  customerId: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  goodDeed: boolean;
};
type Payload = { kpis: Kpis; orders: OrderRow[]; total: number };

// Server-side sort keys mirror the GET /api/admin/albums/:id/buyers `sort`
// param. Sorting + search run against the WHOLE roster on the server, not
// just the rows already loaded — that's the whole point of this tab.
type SortKey = "name" | "date" | "location" | "gooddeed" | "amount";
type SortDir = "asc" | "desc";

function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function locationStr(row: OrderRow) {
  return [row.city, row.state, row.country].filter(Boolean).join(", ") || null;
}

function StatCard({
  label,
  value,
  icon: Icon,
  testId,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  testId?: string;
}) {
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-3"
      data-testid={testId}
    >
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

// Default sort direction the first time a column is picked. Date/amount lead
// with the most interesting end (newest, biggest); name/location read A→Z;
// GoodDeed floats the "yes" rows up.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  date: "desc",
  location: "asc",
  gooddeed: "desc",
  amount: "desc",
};

function SortHeader({
  label,
  col,
  activeKey,
  activeDir,
  onSort,
  className,
}: {
  label: string;
  col: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (col: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === col;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={[
          "inline-flex items-center gap-1 -mx-1 px-1 py-0.5 rounded hover:text-slate-700 transition-colors",
          active ? "text-slate-900" : "text-slate-500",
        ].join(" ")}
        data-testid={`sort-${col}`}
      >
        {label}
        {active ? (
          activeDir === "asc" ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

const PAGE_SIZE = 200;

export function AlbumCustomersPanel({ albumId }: { albumId: string }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [exporting, setExporting] = useState(false);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any change to the filter/sort restarts pagination from the top.
  useEffect(() => {
    setOffset(0);
  }, [search, sortKey, sortDir]);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (search) p.set("search", search);
    // Only send sort params when they diverge from the legacy default, so the
    // default request stays cache-shared with the standalone roster page.
    if (sortKey !== "date" || sortDir !== "desc") {
      p.set("sort", sortKey);
      p.set("dir", sortDir);
    }
    return p.toString();
  }, [offset, search, sortKey, sortDir]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<Payload>({
    queryKey: ["/api/admin/albums", albumId, "buyers", qs],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/albums/${albumId}/buyers?${qs}`);
      return (await res.json()) as Payload;
    },
  });

  // Accumulate pages for "Load more"; replace on a fresh page (offset 0).
  useEffect(() => {
    if (!data) return;
    setTotal(data.total);
    setRows((prev) => (offset === 0 ? data.orders : [...prev, ...data.orders]));
  }, [data, offset]);

  const kpis = data?.kpis;

  // Build the same search/sort params as the table, minus pagination, and
  // tack on format=csv. The server exports the WHOLE filtered roster.
  // `variant="fulfillment"` adds the full mailing address captured at
  // checkout so operators can ship straight off the export.
  async function handleExport(variant?: "fulfillment") {
    if (exporting) return;
    setExporting(true);
    try {
      const p = new URLSearchParams({ format: "csv" });
      if (variant) p.set("variant", variant);
      if (search) p.set("search", search);
      if (sortKey !== "date" || sortDir !== "desc") {
        p.set("sort", sortKey);
        p.set("dir", sortDir);
      }
      const res = await apiRequest(
        "GET",
        `/api/admin/albums/${albumId}/buyers?${p.toString()}`,
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `album-${albumId}-${variant === "fulfillment" ? "fulfillment" : "customers"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  function handleSort(col: SortKey) {
    if (col === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir(DEFAULT_DIR[col]);
    }
  }

  if (isLoading && offset === 0) {
    return <div className="py-10 text-slate-500 text-sm" data-testid="customers-loading">Loading…</div>;
  }
  if (isError && offset === 0) {
    return (
      <ErrorState
        error={error}
        onRetry={() => refetch()}
        title="Couldn't load customers"
        testId="album-customers-error"
      />
    );
  }

  return (
    <div className="space-y-5" data-testid="panel-customers">
      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="kpi-grid-customers">
          <StatCard
            label="Total orders"
            value={kpis.totalOrders.toLocaleString()}
            icon={ShoppingBag}
            testId="kpi-orders"
          />
          <StatCard
            label="Distinct fans"
            value={kpis.distinctFans.toLocaleString()}
            icon={Users}
            testId="kpi-fans"
          />
          <StatCard
            label="Gross revenue"
            value={formatMoney(kpis.totalCents)}
            icon={DollarSign}
            testId="kpi-revenue"
          />
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">
            Customers
            {total > 0 && (
              <span className="ml-2 text-slate-400 font-normal text-xs">
                ({total.toLocaleString()}
                {search ? " matching" : " total"})
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2.5 h-8">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, email, city…"
                className="w-48 text-sm bg-transparent outline-none placeholder:text-slate-400"
                data-testid="input-search-customers"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="text-slate-400 hover:text-slate-700"
                  data-testid="button-clear-search-customers"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={exporting || total === 0}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  data-testid="button-export-customers"
                >
                  <Download className="w-3.5 h-3.5" />
                  {exporting ? "Exporting…" : "Export CSV"}
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  onClick={() => handleExport()}
                  data-testid="button-export-summary"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">Summary</span>
                    <span className="text-xs text-slate-500">
                      Fan, email, location, GoodDeed, amount
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExport("fulfillment")}
                  data-testid="button-export-fulfillment"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">Fulfillment</span>
                    <span className="text-xs text-slate-500">
                      Adds full shipping address for mailing
                    </span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wide font-semibold">
                <SortHeader
                  label="Fan"
                  col="name"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={handleSort}
                  className="text-left px-5 py-2.5"
                />
                <SortHeader
                  label="Location"
                  col="location"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={handleSort}
                  className="text-left px-4 py-2.5 hidden md:table-cell"
                />
                <SortHeader
                  label="Date"
                  col="date"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={handleSort}
                  className="text-left px-4 py-2.5 hidden md:table-cell"
                />
                <SortHeader
                  label="GoodDeed"
                  col="gooddeed"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={handleSort}
                  className="text-left px-4 py-2.5"
                />
                <th className="text-right px-5 py-2.5">
                  <button
                    type="button"
                    onClick={() => handleSort("amount")}
                    className={[
                      "inline-flex items-center gap-1 -mx-1 px-1 py-0.5 rounded hover:text-slate-700 transition-colors",
                      sortKey === "amount" ? "text-slate-900" : "text-slate-500",
                    ].join(" ")}
                    data-testid="sort-amount"
                  >
                    Amount
                    {sortKey === "amount" ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="w-3 h-3" />
                      ) : (
                        <ArrowDown className="w-3 h-3" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-40" />
                    )}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400" data-testid="customers-empty">
                    {search ? "No customers match your search." : "No customers yet."}
                  </td>
                </tr>
              )}
              {rows.map((o) => (
                <tr
                  key={o.orderId}
                  className="hover:bg-slate-50 transition-colors"
                  data-testid={`row-customer-${o.orderId}`}
                >
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900 truncate max-w-[200px]">
                      {o.customerId ? (
                        <Link href={`/admin/customers/${o.customerId}`} className="text-inherit hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors" data-testid={`link-customer-${o.customerId}`}>
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
                  <td className="px-4 py-3">
                    {o.goodDeed ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-blue)]/10 text-[var(--brand-blue)] text-xs font-semibold px-2 py-0.5"
                        data-testid={`gooddeed-yes-${o.orderId}`}
                      >
                        <Check className="w-3 h-3" strokeWidth={2.5} />
                        Yes
                      </span>
                    ) : (
                      <span className="text-slate-300" data-testid={`gooddeed-no-${o.orderId}`}>
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-900">
                    {formatMoney(o.totalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length < total && (
          <div className="px-5 py-3 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={() => setOffset(rows.length)}
              disabled={isFetching}
              className="text-sm font-medium text-[var(--brand-blue)] hover:underline disabled:text-slate-400"
              data-testid="button-load-more-customers"
            >
              {isFetching
                ? "Loading…"
                : `Load more (${rows.length} of ${total.toLocaleString()} loaded)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
