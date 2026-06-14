import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminErrorBoundary, ErrorState } from "@/components/admin/AdminErrorBoundary";
import { Input } from "@/components/ui/input";
import {
  OrderDetailSheet,
  dollars,
  orderShort,
  originBadge,
  statusPill,
} from "@/components/admin/OrderDetailSheet";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Search, X } from "lucide-react";

// Task #234 — wire the fan-orders queue to the real /api/admin/orders
// payload (Shopify webhook materializations + direct GoodTunes/Stripe
// checkouts both land in the same `orders` table, so one endpoint
// feeds every tab here).
type Tab = "all" | "active" | "returns" | "refunded";

type GiftInfo = {
  id: string;
  recipientFirstName: string;
  recipientLastName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  claimed: boolean;
  claimedAt: string | null;
  expiresAt: string;
  resendCount: number;
  createdAt: string;
};

type AdminOrderRow = {
  id: string;
  customerId: string;
  customerEmail: string;
  customerName: string | null;
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  albumArtwork: string | null;
  status: string;
  totalCents: number;
  goodDeedNumber: number | null;
  shippingName: string | null;
  shippingAddress: any;
  shippedAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  origin?: string;
  items: {
    id: string;
    kind: string;
    sku: string;
    label: string;
    unitPriceCents: number;
    quantity: number;
  }[];
  gift: GiftInfo | null;
  skuKind?: string | null;
  fulfillmentStatus?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  submittedToFulfillmentAt?: string | null;
  inFulfillmentAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  returnedAt?: string | null;
};

const TABS: { key: Tab; label: string; blurb: string }[] = [
  {
    key: "all",
    label: "All",
    blurb:
      "Every fan order across Shopify and direct GoodTunes checkout — searchable, filterable, exportable.",
  },
  {
    key: "active",
    label: "Active",
    blurb:
      "Orders currently in flight: paid, awaiting fulfillment, or in transit. The day-to-day work queue.",
  },
  {
    key: "returns",
    label: "Returns",
    blurb:
      "Customer-initiated returns awaiting inspection or restock. Stays a tab here until volume justifies its own surface.",
  },
  {
    key: "refunded",
    label: "Refunded",
    blurb:
      "Fully or partially refunded orders, with the refund reason and the agent who processed it.",
  },
];

type SortKey = "order" | "customer" | "items" | "total" | "status" | "date";
type SortDir = "asc" | "desc";

function isReturned(o: AdminOrderRow) {
  return Boolean(o.returnedAt) || o.fulfillmentStatus === "returned";
}

function classifyTab(o: AdminOrderRow, tab: Tab): boolean {
  if (tab === "all") return true;
  if (tab === "refunded") return o.status === "refunded";
  if (tab === "returns") return isReturned(o);
  // active: in-flight — paid or shipped, not returned.
  return (
    (o.status === "paid" || o.status === "shipped") && !isReturned(o)
  );
}

function customerLabel(o: AdminOrderRow) {
  return o.customerName || o.customerEmail || "—";
}

function itemsLabel(o: AdminOrderRow) {
  const totalQty = o.items.reduce((n, it) => n + (it.quantity ?? 1), 0);
  if (o.items.length === 0) return "—";
  const first = o.items[0].label;
  if (o.items.length === 1) return first;
  return `${first} +${o.items.length - 1} more · ${totalQty} units`;
}

export function AdminFanOrders() {
  return (
    <AdminErrorBoundary title="Fan orders failed to render">
      <AdminFanOrdersInner />
    </AdminErrorBoundary>
  );
}

type DateRangePreset = "all" | "7d" | "30d" | "90d" | "custom";

const DATE_PRESETS: { key: DateRangePreset; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "custom", label: "Custom" },
];

function presetBounds(preset: DateRangePreset, customFrom: string, customTo: string): { from: Date | null; to: Date | null } {
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000);
  if (preset === "7d") return { from: daysAgo(7), to: null };
  if (preset === "30d") return { from: daysAgo(30), to: null };
  if (preset === "90d") return { from: daysAgo(90), to: null };
  if (preset === "custom") {
    const from = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
    const to = customTo ? new Date(`${customTo}T23:59:59.999`) : null;
    return { from, to };
  }
  return { from: null, to: null };
}

function matchesSearch(o: AdminOrderRow, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const hay = [
    o.id,
    o.id.slice(0, 8),
    `#${o.id.slice(0, 8)}`,
    o.goodDeedNumber != null ? `#${o.goodDeedNumber}` : "",
    o.goodDeedNumber != null ? String(o.goodDeedNumber) : "",
    o.customerName ?? "",
    o.customerEmail ?? "",
    o.shippingName ?? "",
    o.albumTitle ?? "",
    o.albumArtist ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  // Defuse CSV formula injection: Excel/Sheets evaluate any cell that
  // starts with =, +, -, @, tab, or CR as a formula. Prefix a single
  // quote so the cell renders as text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadOrdersCsv(rows: AdminOrderRow[], tab: Tab) {
  const header = [
    "order_id",
    "good_deed_number",
    "origin",
    "status",
    "fulfillment_status",
    "created_at",
    "customer_name",
    "customer_email",
    "album_title",
    "album_artist",
    "items",
    "total_cents",
    "total_usd",
    "shipping_name",
    "shipping_city",
    "shipping_state",
    "shipping_postal_code",
    "shipping_country",
    "carrier",
    "tracking_number",
    "shipped_at",
    "refunded_at",
  ];
  const body = rows.map((o) => {
    const addr = (o.shippingAddress ?? {}) as Record<string, any>;
    const itemsCol = o.items
      .map((it) => `${it.label}${(it.quantity ?? 1) > 1 ? ` ×${it.quantity}` : ""}`)
      .join("; ");
    return [
      o.id,
      o.goodDeedNumber ?? "",
      o.origin ?? "direct",
      o.status,
      o.fulfillmentStatus ?? "",
      o.createdAt,
      o.customerName ?? "",
      o.customerEmail ?? "",
      o.albumTitle ?? "",
      o.albumArtist ?? "",
      itemsCol,
      o.totalCents,
      (o.totalCents / 100).toFixed(2),
      o.shippingName ?? "",
      addr.city ?? "",
      addr.state ?? "",
      addr.postalCode ?? "",
      addr.country ?? "",
      o.carrier ?? "",
      o.trackingNumber ?? "",
      o.shippedAt ?? "",
      o.refundedAt ?? "",
    ]
      .map(csvEscape)
      .join(",");
  });
  const csv = [header.join(","), ...body].join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fan-orders-${tab}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Global admin search deep-links into a specific order via ?orderId=…
// (see /api/admin/search href builder). Parse it off the reactive wouter
// search string so it works on a fresh navigation *and* when an operator
// already on this page uses global search to jump to another order (a
// query-only change that wouldn't remount the component).
function deepLinkOrderId(searchStr: string): string | null {
  try {
    return new URLSearchParams(searchStr).get("orderId");
  } catch {
    return null;
  }
}

function stripDeepLinkOrderId() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("orderId")) return;
  url.searchParams.delete("orderId");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

function AdminFanOrdersInner() {
  const urlSearch = useSearch();
  const linkedOrderId = deepLinkOrderId(urlSearch);
  const [tab, setTab] = useState<Tab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openOrderId, setOpenOrderId] = useState<string | null>(linkedOrderId);
  // The deep-linked order also gets its list row scrolled into view and
  // ring-highlighted, mirroring the physical Orders page focus pattern.
  const [focusOrderId, setFocusOrderId] = useState<string | null>(linkedOrderId);
  const focusedRef = useRef<HTMLButtonElement | null>(null);
  const [didFocus, setDidFocus] = useState(false);
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const {
    data: orders,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<AdminOrderRow[]>({ queryKey: ["/api/admin/orders"] });

  const { from: dateFrom, to: dateTo } = useMemo(
    () => presetBounds(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo],
  );

  const searchAndDateFiltered = useMemo(() => {
    return (orders ?? []).filter((o) => {
      if (!matchesSearch(o, search.trim())) return false;
      if (dateFrom || dateTo) {
        const t = new Date(o.createdAt).getTime();
        if (dateFrom && t < dateFrom.getTime()) return false;
        if (dateTo && t > dateTo.getTime()) return false;
      }
      return true;
    });
  }, [orders, search, dateFrom, dateTo]);

  const counts = useMemo(() => {
    const c = { all: 0, active: 0, returns: 0, refunded: 0 } as Record<Tab, number>;
    for (const o of searchAndDateFiltered) {
      c.all += 1;
      if (classifyTab(o, "active")) c.active += 1;
      if (classifyTab(o, "returns")) c.returns += 1;
      if (classifyTab(o, "refunded")) c.refunded += 1;
    }
    return c;
  }, [searchAndDateFiltered]);

  const filtered = useMemo(() => {
    const rows = searchAndDateFiltered.filter((o) => classifyTab(o, tab));
    const cmp = (a: AdminOrderRow, b: AdminOrderRow): number => {
      switch (sortKey) {
        case "order": {
          const ax = a.goodDeedNumber ?? Number.POSITIVE_INFINITY;
          const bx = b.goodDeedNumber ?? Number.POSITIVE_INFINITY;
          if (ax !== bx) return ax - bx;
          return a.id.localeCompare(b.id);
        }
        case "customer":
          return customerLabel(a).localeCompare(customerLabel(b));
        case "items":
          return itemsLabel(a).localeCompare(itemsLabel(b));
        case "total":
          return a.totalCents - b.totalCents;
        case "status":
          return a.status.localeCompare(b.status);
        case "date":
        default:
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
    };
    rows.sort((a, b) => (sortDir === "asc" ? cmp(a, b) : -cmp(a, b)));
    return rows;
  }, [searchAndDateFiltered, tab, sortKey, sortDir]);

  const active = TABS.find((t) => t.key === tab)!;

  // Scroll the deep-linked order's row into view + flash it once the
  // list has rendered and the row is present in the current tab.
  useEffect(() => {
    if (!focusOrderId || didFocus) return;
    if (!filtered.some((o) => o.id === focusOrderId)) return;
    const t = setTimeout(() => {
      focusedRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setDidFocus(true);
    }, 50);
    return () => clearTimeout(t);
  }, [filtered, focusOrderId, didFocus]);

  // React to the deep-link param appearing or changing *after* mount.
  // Global admin search navigates via wouter (client-side), so jumping
  // from this page to another order is a query-only change that leaves
  // the component mounted; without this the newly-picked order would
  // never open. Reset the tab to "all" so the target row isn't filtered
  // out of the highlight pass.
  useEffect(() => {
    if (!linkedOrderId) return;
    setOpenOrderId(linkedOrderId);
    setFocusOrderId(linkedOrderId);
    setDidFocus(false);
    setTab("all");
  }, [linkedOrderId]);

  function closeOrderDetail() {
    setOpenOrderId(null);
    setFocusOrderId(null);
    stripDeepLinkOrderId();
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" || key === "total" ? "desc" : "asc");
    }
  }

  const columns: { key: SortKey; label: string; align?: "left" | "right" }[] = [
    { key: "order", label: "Order" },
    { key: "customer", label: "Customer" },
    { key: "items", label: "Items" },
    { key: "total", label: "Total", align: "right" },
    { key: "status", label: "Status" },
    { key: "date", label: "Date", align: "right" },
  ];

  return (
    <AdminFrame active="fan-orders">
      <div className="space-y-5" data-testid="page-admin-fan-orders">
        <AdminPageHeader title="Fan orders" />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order #, GoodDeed #, customer, email, album…"
              className="pl-8 pr-8 h-9 text-[13px]"
              data-testid="input-search-fan-orders"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                data-testid="button-clear-search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as DateRangePreset)}
            data-testid="select-date-range"
            className="h-9 text-[13px] rounded-md border border-slate-200 bg-white px-2.5 text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>

          {datePreset === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 text-[13px] w-[140px]"
                data-testid="input-date-from"
                aria-label="From date"
              />
              <span className="text-slate-400 text-[12px]">to</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 text-[13px] w-[140px]"
                data-testid="input-date-to"
                aria-label="To date"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => downloadOrdersCsv(filtered, tab)}
            disabled={filtered.length === 0}
            data-testid="button-export-csv"
            className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={
              filtered.length === 0
                ? "No rows to export"
                : `Export ${filtered.length} row${filtered.length === 1 ? "" : "s"} as CSV`
            }
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
            <span className="text-slate-400 tabular-nums">({filtered.length})</span>
          </button>
        </div>

        <div
          className="flex items-center gap-1 border-b border-slate-200"
          role="tablist"
          aria-label="Fan order status"
        >
          {TABS.map((t) => {
            const isActive = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t.key)}
                data-testid={`tab-fan-orders-${t.key}`}
                className={[
                  "px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5",
                  isActive
                    ? "border-[var(--brand-blue)] text-[var(--brand-blue)]"
                    : "border-transparent text-slate-500 hover:text-slate-900",
                ].join(" ")}
              >
                {t.label}
                <span
                  className={[
                    "rounded-full text-[10.5px] font-semibold px-1.5 py-0.5 leading-none",
                    isActive
                      ? "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]"
                      : "bg-slate-100 text-slate-500",
                  ].join(" ")}
                  data-testid={`tab-count-${t.key}`}
                >
                  {counts[t.key]}
                </span>
              </button>
            );
          })}
        </div>

        {isLoading && (
          <div
            className="text-slate-500 text-sm"
            data-testid="loading-fan-orders"
          >
            Loading fan orders…
          </div>
        )}

        {isError && (
          <ErrorState
            error={error}
            onRetry={() => refetch()}
            title="Couldn't load fan orders"
            testId="error-fan-orders"
          />
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div
            className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"
            data-testid={`empty-fan-orders-${tab}`}
          >
            <p className="text-sm font-semibold text-slate-700">
              No {active.label.toLowerCase()} orders yet
            </p>
            <p className="text-[12px] text-slate-500 mt-1 max-w-md mx-auto">
              {active.blurb}
            </p>
          </div>
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <div
            className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
            data-testid="table-fan-orders"
          >
            <div className="grid grid-cols-[1.1fr_1.6fr_2fr_0.9fr_0.9fr_1fr] gap-3 px-4 py-2.5 border-b border-slate-200 bg-slate-50">
              {columns.map((c) => {
                const isSorted = sortKey === c.key;
                const Arrow = !isSorted
                  ? ChevronsUpDown
                  : sortDir === "asc"
                    ? ArrowUp
                    : ArrowDown;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    data-testid={`sort-${c.key}`}
                    className={[
                      "text-[11px] font-semibold uppercase tracking-wider inline-flex items-center gap-1 transition-colors",
                      c.align === "right" ? "justify-end" : "justify-start",
                      isSorted
                        ? "text-slate-900"
                        : "text-slate-500 hover:text-slate-700",
                    ].join(" ")}
                    aria-sort={
                      isSorted
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    {c.label}
                    <Arrow className="w-3 h-3" />
                  </button>
                );
              })}
            </div>
            {filtered.map((o) => {
              const isFocus = focusOrderId === o.id;
              return (
              <button
                key={o.id}
                type="button"
                ref={isFocus ? focusedRef : undefined}
                onClick={() => setOpenOrderId(o.id)}
                data-testid={`row-fan-order-${o.id}`}
                data-focused={isFocus ? "true" : undefined}
                className={[
                  "w-full grid grid-cols-[1.1fr_1.6fr_2fr_0.9fr_0.9fr_1fr] gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 text-left hover:bg-slate-50 transition-colors",
                  isFocus ? "bg-[var(--brand-blue)]/5 ring-2 ring-inset ring-[var(--brand-blue)]/40" : "",
                ].join(" ")}
              >
                <div className="text-[13px] text-slate-900 font-medium flex items-center gap-2 min-w-0">
                  <span className="truncate">{orderShort(o)}</span>
                  {originBadge(o.origin)}
                </div>
                <div className="text-[13px] text-slate-700 truncate">
                  {customerLabel(o)}
                </div>
                <div className="text-[13px] text-slate-600 truncate">
                  <span className="text-slate-900 font-medium">{o.albumTitle}</span>
                  <span className="text-slate-400"> · </span>
                  <span>{itemsLabel(o)}</span>
                </div>
                <div className="text-[13px] text-slate-900 text-right tabular-nums">
                  {dollars(o.totalCents)}
                </div>
                <div className="text-[13px]">{statusPill(o)}</div>
                <div className="text-[12.5px] text-slate-500 text-right tabular-nums">
                  {new Date(o.createdAt).toLocaleDateString()}
                </div>
              </button>
              );
            })}
          </div>
        )}
      </div>

      <OrderDetailSheet
        orderId={openOrderId}
        onClose={closeOrderDetail}
      />
    </AdminFrame>
  );
}
