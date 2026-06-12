import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, ArrowUp, ArrowDown, X, MapPin } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ViewModeToggle, useViewMode } from "@/components/admin/ViewModeToggle";
import { CustomerMap, type CitySelection } from "@/components/admin/CustomerMap";
import type { CustomerUser } from "@shared/schema";

/**
 * Admin · Customers directory (Task #131).
 *
 * Read-only index of every fan account (`customer_users`). The server
 * roll-up on each row is the bit that makes this useful at a glance:
 *
 *   - orderCount         — every order, including refunded ones
 *   - lifetimeSpendCents — paid + shipped only (refunded excluded)
 *   - lastActivityAt     — last order date, falling back to signup
 *
 * Search matches display/real name, email, and username server-side so
 * we never ship the full fan list to the client for filtering. Sorting
 * is server-side by signup recency for now; click-through to the
 * detail page is where deeper analysis happens.
 *
 * Task #1298 — adds a segmented tab bar (All / Buyers / No sales /
 * Unclaimed) with server-side filtering and per-tab counts. The active
 * tab is mirrored into the URL so a filtered view can be bookmarked.
 */

type SegmentKey = "all" | "buyers" | "no_sales" | "unclaimed";
const SEGMENT_KEYS: SegmentKey[] = ["all", "buyers", "no_sales", "unclaimed"];
const SEGMENT_LABELS: Record<SegmentKey, string> = {
  all: "All",
  buyers: "Buyers",
  no_sales: "No sales",
  unclaimed: "Unclaimed",
};

type CustomerRow = CustomerUser & {
  orderCount: number;
  lifetimeSpendCents: number;
  lastActivityAt: string | null;
  // Task #1342 — earliest order date, used as the honest "Customer since"
  // value for imported fans whose createdAt is just the import timestamp.
  firstOrderAt: string | null;
};

type CustomerListResponse = {
  rows: CustomerRow[];
  total: number;
  counts: Record<SegmentKey, number>;
};

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function initialFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Task #1342 — imported/legacy fans carry the import timestamp in
// `createdAt`, which is not a real signup. An account is "imported" when it
// has a goGoods legacy id. For those, we show the earliest order date
// ("Customer since") and fall back to a plain "Imported" tag when there's
// no order history yet — never the misleading import timestamp.
function isImported(c: { legacyGogoodsId?: string | null }): boolean {
  return !!c.legacyGogoodsId;
}

function effectiveSignupMs(c: CustomerRow): number {
  const iso = isImported(c)
    ? c.firstOrderAt
    : (c.createdAt as unknown as string | null);
  return iso ? new Date(iso).getTime() : 0;
}

/** Renders the honest "Signup" cell value for a customer row. */
function SignupValue({ c }: { c: CustomerRow }) {
  if (isImported(c)) {
    if (c.firstOrderAt) {
      return (
        <span title="Imported account · earliest order date">
          <span className="text-slate-400">since </span>
          {formatDate(c.firstOrderAt)}
        </span>
      );
    }
    return (
      <span className="text-slate-400" title="Imported from goGoods — no orders yet">
        Imported
      </span>
    );
  }
  return <>{formatDate(c.createdAt as unknown as string | null)}</>;
}

export function AdminCustomers() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const urlSearch = useSearch();

  // Parse initial state from URL on mount only.
  const initial = useMemo(() => {
    const out: { tab: SegmentKey; search: string; city: CitySelection | null } = { tab: "all", search: "", city: null };
    try {
      const p = new URLSearchParams(urlSearch);
      const t = p.get("tab");
      if (t && (SEGMENT_KEYS as string[]).includes(t)) out.tab = t as SegmentKey;
      const q = p.get("q");
      if (q) out.search = q;
      const cityName = p.get("city");
      if (cityName) out.city = { city: cityName, region: p.get("region"), country: p.get("country") };
    } catch { /* malformed — fall through */ }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tab, setTabState] = useState<SegmentKey>(initial.tab);
  const [search, setSearch] = useState(initial.search);
  const [searchOpen, setSearchOpen] = useState(initial.search !== "");
  const [city, setCityState] = useState<CitySelection | null>(initial.city);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useViewMode("customers", "list");

  // Mirror tab + search + city into the URL so the view is bookmarkable.
  useEffect(() => {
    const p = new URLSearchParams();
    if (tab !== "all") p.set("tab", tab);
    if (search.trim()) p.set("q", search.trim());
    if (city?.city) {
      p.set("city", city.city);
      if (city.region) p.set("region", city.region);
      if (city.country) p.set("country", city.country);
    }
    const qs = p.toString();
    navigate(qs ? `?${qs}` : "?", { replace: true });
  }, [tab, search, city, navigate]);

  function setTab(next: SegmentKey) {
    setTabState(next);
    // Reset pagination when switching tabs.
    setPages([]);
    setTotal(0);
    setOffset(0);
  }

  // Tap a map point or city row → filter the list to that city. Passing an
  // empty city clears the filter. Resets pagination either way.
  function setCity(next: CitySelection | null) {
    setCityState(next && next.city ? next : null);
    setPages([]);
    setTotal(0);
    setOffset(0);
  }

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Task #1342 — "Make admin…" moved off the list (it was a loud per-row
  // button that also broke the header column alignment). The promote action
  // now lives as a quiet action on the customer detail page.

  // Debounce the search term so each keystroke doesn't hit the server.
  const [debounced, setDebounced] = useState(initial.search);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Offset-based pagination. Reset on search or tab change.
  const PAGE = 200;
  const [pages, setPages] = useState<CustomerRow[][]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    setPages([]);
    setTotal(0);
    setOffset(0);
  }, [debounced]);

  // Per-segment counts returned by the server (always full-dataset, no
  // search filter applied). Kept as the latest resolved value.
  const [counts, setCounts] = useState<Record<SegmentKey, number>>({
    all: 0,
    buyers: 0,
    no_sales: 0,
    unclaimed: 0,
  });

  const {
    data,
    isLoading,
    isFetching,
    isError: customersError,
    error: customersErrorObj,
    refetch: refetchCustomers,
  } = useQuery<CustomerListResponse>({
    queryKey: ["/api/admin/customers", { q: debounced, offset, segment: tab, city: city?.city ?? "", region: city?.region ?? "", country: city?.country ?? "" }],
    enabled: !!user?.isAdmin,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debounced) params.set("q", debounced);
      params.set("limit", String(PAGE));
      params.set("offset", String(offset));
      params.set("segment", tab);
      if (city?.city) {
        params.set("city", city.city);
        if (city.region) params.set("region", city.region);
        if (city.country) params.set("country", city.country);
      }
      const res = await apiRequest("GET", `/api/admin/customers?${params}`);
      return (await res.json()) as CustomerListResponse;
    },
  });

  // Task #1342 — accumulate the paginated pages from the query DATA, not as a
  // queryFn side-effect. With staleTime:Infinity, navigating back to this
  // page is a cache hit and the queryFn never runs, so the old side-effect
  // approach left `pages` empty and the list blank until a hard refresh.
  // Keying the effect on `data` means it re-populates from cache too.
  useEffect(() => {
    if (!data) return;
    setPages((prev) => {
      const next = [...prev];
      next[Math.floor(offset / PAGE)] = data.rows;
      return next;
    });
    setTotal(data.total);
    if (data.counts) setCounts(data.counts);
  }, [data, offset]);

  const allRows = useMemo(() => pages.flat(), [pages]);

  // Client-side sort over the server payload.
  type SortKey = "name" | "orders" | "lifetime" | "lastActivity" | "signup";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>("lastActivity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  }
  const sorted = useMemo(() => {
    const rows = [...allRows];
    const mul = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return ((a.realName || a.displayName).toLowerCase() <
            (b.realName || b.displayName).toLowerCase()
            ? -1
            : 1) * mul;
        case "orders":
          return (a.orderCount - b.orderCount) * mul;
        case "lifetime":
          return (a.lifetimeSpendCents - b.lifetimeSpendCents) * mul;
        case "lastActivity": {
          const at = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
          const bt = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
          return (at - bt) * mul;
        }
        case "signup": {
          // Sort on the same honest "since" value the cell displays.
          return (effectiveSignupMs(a) - effectiveSignupMs(b)) * mul;
        }
      }
    });
    return rows;
  }, [allRows, sortKey, sortDir]);

  if (authLoading) {
    return (
      <AdminFrame active="customers">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }
  if (!user?.isAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <p className="text-slate-500 text-sm">Admin only.</p>
      </main>
    );
  }

  const rows = sorted;

  return (
    <AdminFrame active="customers">
      <div className="space-y-5">
        <AdminPageHeader
          title="Customers"
          subtitle={
            debounced
              ? `${rows.length} match${rows.length === 1 ? "" : "es"} of ${total} in ${SEGMENT_LABELS[tab].toLowerCase()}`
              : `${total} fan account${total === 1 ? "" : "s"}`
          }
          actions={(<>
            {searchOpen ? (
              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-md px-2.5 h-9">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, email, or username"
                  className="w-56 text-sm bg-transparent outline-none placeholder:text-slate-400"
                  data-testid="input-search-customers"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSearch("");
                      setSearchOpen(false);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSearchOpen(false);
                  }}
                  className="text-slate-400 hover:text-slate-700"
                  aria-label="Close search"
                  data-testid="button-close-search"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="h-9 w-9 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center justify-center transition-colors"
                aria-label="Search"
                data-testid="button-open-search"
              >
                <Search className="w-4 h-4" />
              </button>
            )}
            <ViewModeToggle
              value={view}
              onChange={setView}
              testIdPrefix="view-mode-customers"
            />
          </>)}
          belowHeader={(
            <div className="border-b border-slate-200 flex items-center gap-6 overflow-x-auto mt-3">
              {SEGMENT_KEYS.map((k) => (
                <TabBtn
                  key={k}
                  active={tab === k}
                  onClick={() => setTab(k)}
                  count={counts[k]}
                  testId={`tab-${k}`}
                >
                  {SEGMENT_LABELS[k]}
                </TabBtn>
              ))}
            </div>
          )}
        />

        {/* Customer locations map — tap a point or city to filter the list. */}
        <CustomerMap
          activeCity={city}
          onSelectCity={(sel) => {
            setCity(sel.city ? sel : null);
            if (typeof window !== "undefined") {
              window.requestAnimationFrame(() => {
                document
                  .getElementById("customers-list-anchor")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }
          }}
        />

        {city?.city && (
          <div
            className="flex items-center gap-2 rounded-md border border-[var(--brand-blue)]/30 bg-[var(--brand-blue)]/5 px-3 py-2 text-sm"
            data-testid="active-city-filter"
          >
            <MapPin className="w-4 h-4 text-[var(--brand-blue)] flex-shrink-0" />
            <span className="text-slate-700">
              Showing customers in{" "}
              <span className="font-semibold text-slate-900" data-testid="text-active-city">
                {[city.city, city.region].filter(Boolean).join(", ")}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setCity(null)}
              className="ml-auto inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 transition-colors"
              data-testid="button-clear-city"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        )}

        <div id="customers-list-anchor" />

        {isLoading ? (
          <div className="py-10 text-slate-500 text-sm">Loading…</div>
        ) : customersError ? (
          <ErrorState
            error={customersErrorObj}
            onRetry={() => refetchCustomers()}
            title="Couldn't load customers"
            testId="admin-customers-error"
          />
        ) : rows.length === 0 ? (
          <div
            className="rounded-lg border border-slate-200 bg-white p-10 text-center"
            data-testid="empty-customers"
          >
            <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" strokeWidth={1.5} />
            <div className="text-slate-700 font-medium">
              {debounced ? "No matching customers" : `No customers in ${SEGMENT_LABELS[tab].toLowerCase()}`}
            </div>
            <div className="text-slate-500 text-[13px] mt-1">
              {debounced
                ? "Try a different name, email, or username."
                : tab === "all"
                ? "Your first fan will show up here once they sign up."
                : tab === "buyers"
                ? "No customers have purchased yet."
                : tab === "no_sales"
                ? "Every customer has at least one order."
                : "No unclaimed legacy accounts found."}
            </div>
          </div>
        ) : view === "grid" ? (
          <div>
            <div
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-5"
              data-testid="grid-customers"
            >
              {rows.map((c) => {
                const name = c.realName || c.displayName;
                return (
                  <div
                    key={c.id}
                    className="relative group"
                    data-testid={`card-customer-${c.id}`}
                  >
                    <Link
                      href={`/admin/customers/${c.id}`}
                      className="block text-left"
                    >
                      <div className="aspect-square w-full rounded-full overflow-hidden bg-[var(--brand-blue)] ring-1 ring-slate-200 shadow-sm group-hover:shadow-md group-hover:ring-[var(--brand-blue)]/30 transition-all flex items-center justify-center">
                        <span className="text-white text-3xl font-bold">
                          {initialFor(name)}
                        </span>
                      </div>
                      <div
                        className="mt-3 w-full text-center text-slate-900 text-sm font-semibold truncate px-1"
                        data-testid={`text-customer-name-${c.id}`}
                      >
                        {name}
                      </div>
                      <div className="w-full text-center text-slate-500 text-xs truncate px-1">
                        {c.email}
                      </div>
                      <div className="w-full text-center text-slate-400 text-xs truncate px-1 tabular-nums">
                        <span data-testid={`text-lifetime-${c.id}`}>
                          {formatMoney(c.lifetimeSpendCents)}
                        </span>
                        <span className="mx-1">·</span>
                        <span>{formatDate(c.lastActivityAt)}</span>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
            {rows.length < total && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setOffset(allRows.length)}
                  disabled={isFetching}
                  className="text-[13px] font-medium text-[var(--brand-blue)] hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed"
                  data-testid="button-load-more-customers"
                >
                  {isFetching ? "Loading…" : `Load more (${rows.length} of ${total})`}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden" data-testid="list-customers">
            <div className="hidden sm:grid grid-cols-[1fr_64px_96px_112px_112px] gap-4 px-4 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <SortHeader label="Customer" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="left" />
              <SortHeader label="Orders" k="orders" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
              <SortHeader label="Lifetime" k="lifetime" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
              <SortHeader label="Last activity" k="lastActivity" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
              <SortHeader label="Signup" k="signup" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
            </div>
            <div className="divide-y divide-slate-100">
              {rows.map((c) => {
                const name = c.realName || c.displayName;
                return (
                  <div
                    key={c.id}
                    className="hover:bg-slate-50 transition-colors"
                    data-testid={`row-customer-${c.id}`}
                  >
                    <Link
                      href={`/admin/customers/${c.id}`}
                      className="block px-4 py-3"
                    >
                      <div className="sm:grid sm:grid-cols-[1fr_64px_96px_112px_112px] sm:gap-4 sm:items-center">
                        <div className="min-w-0">
                          <div className="text-slate-900 text-[14px] font-medium truncate" data-testid={`text-customer-name-${c.id}`}>
                            {name}
                          </div>
                          <div className="text-slate-500 text-[12px] truncate">
                            {c.email}
                            {c.username && c.username !== c.email ? ` · @${c.username}` : ""}
                          </div>
                        </div>
                        <div className="text-slate-700 text-[13px] tabular-nums mt-1 sm:mt-0 sm:text-right" data-testid={`text-order-count-${c.id}`}>
                          <span className="sm:hidden text-slate-400 text-[11px] uppercase tracking-wide mr-1">Orders</span>
                          {c.orderCount}
                        </div>
                        <div className="text-slate-700 text-[13px] tabular-nums sm:text-right" data-testid={`text-lifetime-${c.id}`}>
                          <span className="sm:hidden text-slate-400 text-[11px] uppercase tracking-wide mr-1">Lifetime</span>
                          {formatMoney(c.lifetimeSpendCents)}
                        </div>
                        <div className="text-slate-500 text-[12.5px] sm:text-right">
                          <span className="sm:hidden text-slate-400 text-[11px] uppercase tracking-wide mr-1">Last</span>
                          {formatDate(c.lastActivityAt)}
                        </div>
                        <div className="text-slate-500 text-[12.5px] sm:text-right" data-testid={`text-signup-${c.id}`}>
                          <span className="sm:hidden text-slate-400 text-[11px] uppercase tracking-wide mr-1">Signed up</span>
                          <SignupValue c={c} />
                        </div>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
            {rows.length < total && (
              <div className="px-4 py-3 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={() => setOffset(allRows.length)}
                  disabled={isFetching}
                  className="text-[13px] font-medium text-[var(--brand-blue)] hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed"
                  data-testid="button-load-more-customers"
                >
                  {isFetching ? "Loading…" : `Load more (${rows.length} of ${total})`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminFrame>
  );
}

function TabBtn({
  active,
  onClick,
  count,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={[
        "relative py-2.5 text-[13.5px] font-semibold transition-colors inline-flex items-center gap-1.5 flex-shrink-0",
        active ? "text-slate-900" : "text-slate-400 hover:text-slate-700",
      ].join(" ")}
    >
      {children}
      <span
        className={[
          "tabular-nums text-[11.5px] font-bold px-1.5 py-px rounded",
          active ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-400",
        ].join(" ")}
      >
        {count}
      </span>
      {active && (
        <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-[var(--brand-blue)] rounded-full" />
      )}
    </button>
  );
}

function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
  align,
}: {
  label: string;
  k: "name" | "orders" | "lifetime" | "lastActivity" | "signup";
  sortKey: "name" | "orders" | "lifetime" | "lastActivity" | "signup";
  sortDir: "asc" | "desc";
  onClick: (k: "name" | "orders" | "lifetime" | "lastActivity" | "signup") => void;
  align: "left" | "right";
}) {
  const active = sortKey === k;
  return (
    <button
      type="button"
      onClick={() => onClick(k)}
      className={[
        "flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
        align === "right" ? "justify-end" : "justify-start",
        active ? "text-slate-700" : "text-slate-500 hover:text-slate-700",
      ].join(" ")}
      data-testid={`sort-${k}`}
      aria-pressed={active}
    >
      <span>{label}</span>
      {active &&
        (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
    </button>
  );
}
