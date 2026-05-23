import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Users, ArrowUp, ArrowDown, ShieldCheck, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
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
 */

type CustomerRow = CustomerUser & {
  orderCount: number;
  lifetimeSpendCents: number;
  lastActivityAt: string | null;
};

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
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
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  // Task #256 — "Make admin…" row action. Only super_admin sees it; the
  // dialog mirrors the role + scope picker from /admin/invites but
  // POSTs to /promote so the customer's existing credentials carry
  // over (no second account, no separate invite).
  const { data: meRole } = useQuery<{ role: string }>({
    queryKey: ["/api/me/role"],
    enabled: !!user?.isAdmin,
  });
  const isSuperAdmin = meRole?.role === "super_admin";
  const [promoteFor, setPromoteFor] = useState<{ id: string; name: string; email: string } | null>(null);

  // Debounce the search term so each keystroke doesn't hit the server.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Offset-based pagination. The server caps each request at 500 rows
  // but supports `offset`, so we accumulate pages here to give admins
  // a "Load more" button that walks past the per-request cap and lets
  // them browse the entire fan-account directory. The accumulated
  // rows + total are reset whenever the search term changes.
  const PAGE = 200;
  const [pages, setPages] = useState<CustomerRow[][]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    setPages([]);
    setTotal(0);
    setOffset(0);
  }, [debounced]);

  const {
    isLoading,
    isFetching,
    isError: customersError,
    error: customersErrorObj,
    refetch: refetchCustomers,
  } = useQuery<{ rows: CustomerRow[]; total: number }>({
    queryKey: ["/api/admin/customers", { q: debounced, offset }],
    enabled: !!user?.isAdmin,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debounced) params.set("q", debounced);
      params.set("limit", String(PAGE));
      params.set("offset", String(offset));
      const res = await apiRequest("GET", `/api/admin/customers?${params}`);
      const json = (await res.json()) as { rows: CustomerRow[]; total: number };
      // Replace this offset's page in-place so refetches don't duplicate.
      setPages((prev) => {
        const next = [...prev];
        next[Math.floor(offset / PAGE)] = json.rows;
        return next;
      });
      setTotal(json.total);
      return json;
    },
  });
  const allRows = useMemo(() => pages.flat(), [pages]);

  // Client-side sort over the server payload. The list is capped at
  // 500 rows server-side so sorting in-browser is cheap; sortable
  // columns are what the operator actually reaches for first
  // (lifetime spend, order count, last activity).
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
              ? `${rows.length} match${rows.length === 1 ? "" : "es"} of ${total} fan account${total === 1 ? "" : "s"}`
              : `${total} fan account${total === 1 ? "" : "s"}`
          }
        />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or username"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-slate-200 text-[13px] focus:outline-none focus:border-[var(--brand-blue)]"
            data-testid="input-search-customers"
          />
        </div>

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
              {debounced ? "No matching customers" : "No customers yet"}
            </div>
            <div className="text-slate-500 text-[13px] mt-1">
              {debounced
                ? "Try a different name, email, or username."
                : "Your first fan will show up here once they buy something."}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
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
            {/* Load more: walks the offset forward 200 rows at a time
                so admins can browse the entire fan directory regardless
                of size, without infinite scroll. */}
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
