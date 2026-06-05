import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Users, ArrowUp, ArrowDown, ShieldCheck, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ViewModeToggle, useViewMode } from "@/components/admin/ViewModeToggle";
import {
  ROLE_OPTIONS,
  ROLE_LABEL,
  SCOPE_CONFIG,
  ScopePicker,
} from "@/components/admin/RoleScopePicker";
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
    const out: { tab: SegmentKey; search: string } = { tab: "all", search: "" };
    try {
      const p = new URLSearchParams(urlSearch);
      const t = p.get("tab");
      if (t && (SEGMENT_KEYS as string[]).includes(t)) out.tab = t as SegmentKey;
      const q = p.get("q");
      if (q) out.search = q;
    } catch { /* malformed — fall through */ }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tab, setTabState] = useState<SegmentKey>(initial.tab);
  const [search, setSearch] = useState(initial.search);
  const [searchOpen, setSearchOpen] = useState(initial.search !== "");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useViewMode("customers", "list");
  const { toast } = useToast();

  // Mirror tab + search into the URL so the view is bookmarkable.
  useEffect(() => {
    const p = new URLSearchParams();
    if (tab !== "all") p.set("tab", tab);
    if (search.trim()) p.set("q", search.trim());
    const qs = p.toString();
    navigate(qs ? `?${qs}` : "?", { replace: true });
  }, [tab, search, navigate]);

  function setTab(next: SegmentKey) {
    setTabState(next);
    // Reset pagination when switching tabs.
    setPages([]);
    setTotal(0);
    setOffset(0);
  }

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Task #256 — "Make admin…" row action. Only super_admin sees it.
  const { data: meRole } = useQuery<{ role: string }>({
    queryKey: ["/api/me/role"],
    enabled: !!user?.isAdmin,
  });
  const isSuperAdmin = meRole?.role === "super_admin";
  const [promoteFor, setPromoteFor] = useState<{ id: string; name: string; email: string } | null>(null);

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
    isLoading,
    isFetching,
    isError: customersError,
    error: customersErrorObj,
    refetch: refetchCustomers,
  } = useQuery<CustomerListResponse>({
    queryKey: ["/api/admin/customers", { q: debounced, offset, segment: tab }],
    enabled: !!user?.isAdmin,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debounced) params.set("q", debounced);
      params.set("limit", String(PAGE));
      params.set("offset", String(offset));
      params.set("segment", tab);
      const res = await apiRequest("GET", `/api/admin/customers?${params}`);
      const json = (await res.json()) as CustomerListResponse;
      setPages((prev) => {
        const next = [...prev];
        next[Math.floor(offset / PAGE)] = json.rows;
        return next;
      });
      setTotal(json.total);
      if (json.counts) setCounts(json.counts);
      return json;
    },
  });
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
          const at = a.createdAt ? new Date(a.createdAt as unknown as string).getTime() : 0;
          const bt = b.createdAt ? new Date(b.createdAt as unknown as string).getTime() : 0;
          return (at - bt) * mul;
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
                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => setPromoteFor({ id: c.id, name, email: c.email })}
                        className="absolute top-1 right-1 w-8 h-8 rounded-full bg-white/90 backdrop-blur ring-1 ring-slate-200 text-[var(--brand-purple)] inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
                        title="Promote this customer to an admin/partner role"
                        data-testid={`button-promote-${c.id}`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </button>
                    )}
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
            <div className="hidden sm:grid grid-cols-[1fr_72px_104px_104px_104px] gap-4 px-4 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
                    className="flex items-stretch hover:bg-slate-50 transition-colors"
                    data-testid={`row-customer-${c.id}`}
                  >
                    <Link
                      href={`/admin/customers/${c.id}`}
                      className="flex-1 min-w-0 block px-4 py-3"
                    >
                      <div className="sm:grid sm:grid-cols-[1fr_72px_104px_104px_104px] sm:gap-4 sm:items-center">
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
                          {formatDate(c.createdAt as unknown as string | null)}
                        </div>
                      </div>
                    </Link>
                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => setPromoteFor({ id: c.id, name, email: c.email })}
                        className="flex items-center gap-1.5 px-3 my-1 mr-2 rounded-md text-sm font-medium text-[var(--brand-purple)] hover:bg-[var(--brand-purple)]/10 transition-colors"
                        title="Promote this customer to an admin/partner role"
                        data-testid={`button-promote-${c.id}`}
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span className="hidden sm:inline">Make admin…</span>
                      </button>
                    )}
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
      {promoteFor && (
        <PromoteDialog
          customer={promoteFor}
          onClose={() => setPromoteFor(null)}
          onPromoted={() => {
            toast({ title: `${promoteFor.name} promoted`, description: `Admin access granted.` });
            setPromoteFor(null);
            queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
          }}
        />
      )}
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

function PromoteDialog({
  customer,
  onClose,
  onPromoted,
}: {
  customer: { id: string; name: string; email: string };
  onClose: () => void;
  onPromoted: () => void;
}) {
  const [role, setRole] = useState("super_admin");
  const [scopeId, setScopeId] = useState<string | null>(null);
  const needsScope = !!SCOPE_CONFIG[role];
  const { toast } = useToast();

  const promote = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/customers/${customer.id}/promote`, {
        role,
        roleScopeId: needsScope ? scopeId : null,
      });
      return r.json();
    },
    onSuccess: () => onPromoted(),
    onError: (err: any) => {
      toast({ title: "Could not promote", description: err?.message ?? "Try again." });
    },
  });

  const canSubmit = !needsScope || !!scopeId;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="dialog-promote-customer"
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Make admin</h2>
            <p className="text-xs text-slate-500">
              {customer.name} &lt;{customer.email}&gt;
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close"
            data-testid="button-close-promote"
          >
            <X className="w-4 h-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-slate-600 leading-relaxed mb-3">
            Grants admin access using <strong>{customer.email}</strong>&apos;s existing
            password and any linked Google/Apple sign-in. No email is sent.
          </p>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setScopeId(null);
            }}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
            data-testid="select-promote-role"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {needsScope && (
            <ScopePicker
              cfg={SCOPE_CONFIG[role]}
              value={scopeId}
              onChange={(id) => setScopeId(id)}
              testId="promote-scope"
            />
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100"
            data-testid="button-cancel-promote"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit || promote.isPending}
            onClick={() => promote.mutate()}
            className="min-h-[44px] px-4 rounded-md text-sm font-semibold bg-[var(--brand-purple)] text-white hover:opacity-90 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-100"
            data-testid="button-confirm-promote"
          >
            {promote.isPending ? "Promoting…" : `Make ${ROLE_LABEL[role] || role}`}
          </button>
        </div>
      </div>
    </div>
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
