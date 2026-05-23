import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminErrorBoundary, ErrorState } from "@/components/admin/AdminErrorBoundary";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, ExternalLink, Search, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

type AdminOrderDetail = {
  order: AdminOrderRow & Record<string, any>;
  items: Array<Record<string, any>>;
  album: { id: string; title: string; artist: string; artwork: string | null } | null;
  customer: { id: string; email: string; displayName: string | null; realName: string | null } | null;
  fulfillmentPartner: any;
  orderDeskEvents: Array<{
    id: string;
    receivedAt: string;
    eventType: string | null;
    fulfillmentStatus: string | null;
    trackingNumber: string | null;
  }>;
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

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

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

function orderShort(o: AdminOrderRow) {
  if (o.goodDeedNumber !== null && o.goodDeedNumber !== undefined) {
    return `#${o.goodDeedNumber}`;
  }
  return `#${o.id.slice(0, 8)}`;
}

function originBadge(origin: string | undefined) {
  if (!origin || origin === "direct") {
    return (
      <span
        className="inline-flex items-center rounded-full bg-[var(--brand-blue)]/10 text-[var(--brand-blue)] text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5"
        data-testid="badge-origin-direct"
      >
        Direct
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full bg-[#95BF47]/15 text-[#5a7c2c] text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5"
      data-testid="badge-origin-shopify"
      title="Bundled with a label's Shopify order"
    >
      Shopify
    </span>
  );
}

function statusPill(o: AdminOrderRow) {
  const s = o.status;
  const cls =
    s === "paid"
      ? "bg-emerald-50 text-emerald-700"
      : s === "shipped"
        ? "bg-sky-50 text-sky-700"
        : s === "refunded"
          ? "bg-rose-50 text-rose-700"
          : "bg-slate-100 text-slate-600";
  return (
    <span
      className={`px-2 py-0.5 rounded-full font-semibold uppercase text-[10px] ${cls}`}
      data-testid={`status-${o.id}`}
    >
      {s}
    </span>
  );
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

function AdminFanOrdersInner() {
  const [tab, setTab] = useState<Tab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
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
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOpenOrderId(o.id)}
                data-testid={`row-fan-order-${o.id}`}
                className="w-full grid grid-cols-[1.1fr_1.6fr_2fr_0.9fr_0.9fr_1fr] gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 text-left hover:bg-slate-50 transition-colors"
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
            ))}
          </div>
        )}
      </div>

      <OrderDetailSheet
        orderId={openOrderId}
        onClose={() => setOpenOrderId(null)}
      />
    </AdminFrame>
  );
}

function OrderDetailSheet({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error, refetch } = useQuery<AdminOrderDetail>({
    queryKey: ["/api/admin/orders", orderId],
    enabled: !!orderId,
  });

  return (
    <Sheet open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto"
        data-testid="sheet-fan-order-detail"
      >
        <SheetHeader>
          <SheetTitle>Order detail</SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="text-slate-500 text-sm mt-4" data-testid="sheet-loading">
            Loading order…
          </div>
        )}
        {isError && (
          <div className="mt-4">
            <ErrorState
              error={error}
              onRetry={() => refetch()}
              title="Couldn't load order"
              testId="sheet-error"
            />
          </div>
        )}
        {data && <OrderDetailBody detail={data} />}
      </SheetContent>
    </Sheet>
  );
}

function OrderDetailBody({ detail }: { detail: AdminOrderDetail }) {
  const o = detail.order;
  const customer = detail.customer;
  const items = (detail.items ?? []) as Array<{
    id: string;
    kind: string;
    sku: string;
    label: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  const refunded = o.status === "refunded";
  const events = detail.orderDeskEvents ?? [];
  const refundEvents = events.filter(
    (e) =>
      (e.eventType ?? "").toLowerCase().includes("refund") ||
      (e.fulfillmentStatus ?? "").toLowerCase().includes("refund"),
  );
  const addr = o.shippingAddress;

  return (
    <div className="mt-4 space-y-5 text-[13px]" data-testid="sheet-order-body">
      <div className="flex items-center gap-2 flex-wrap">
        {statusPill(o as AdminOrderRow)}
        {originBadge(o.origin)}
        <span className="text-slate-400 text-[12px]">
          {orderShort(o as AdminOrderRow)}
        </span>
        <span className="text-slate-400 text-[12px]">
          {new Date(o.createdAt).toLocaleString()}
        </span>
        <Link href={`/admin/orders?orderId=${o.id}`} className="ml-auto inline-flex items-center gap-1 text-[12px] text-[var(--brand-blue)] hover:underline underline-offset-2" data-testid="link-open-in-orders">
          Open in operator view <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <Section title="Album">
        <div className="flex items-center gap-3">
          {detail.album?.artwork ? (
            <img
              src={detail.album.artwork}
              alt=""
              className="w-12 h-12 rounded object-cover border border-slate-200"
            />
          ) : (
            <div className="w-12 h-12 rounded bg-slate-100" />
          )}
          <div className="min-w-0">
            <div className="font-medium text-slate-900 truncate">
              {detail.album?.title ?? o.albumTitle}
            </div>
            <div className="text-slate-500 truncate">
              {detail.album?.artist ?? o.albumArtist}
            </div>
          </div>
          {detail.album?.id && (
            <Link href={`/admin/albums/${detail.album.id}`} className="ml-auto text-[12px] text-[var(--brand-blue)] hover:underline underline-offset-2" data-testid="link-album">
              View album
            </Link>
          )}
        </div>
      </Section>

      <Section title="Customer">
        {customer ? (
          <div className="flex items-center gap-2">
            <div className="min-w-0">
              <div className="font-medium text-slate-900 truncate">
                {customer.realName || customer.displayName || customer.email}
              </div>
              <div className="text-slate-500 truncate">{customer.email}</div>
            </div>
            <Link href={`/admin/customers/${customer.id}`} className="ml-auto text-[12px] text-[var(--brand-blue)] hover:underline underline-offset-2" data-testid="link-customer">
              View customer
            </Link>
          </div>
        ) : (
          <div className="text-slate-500">Guest / unlinked customer.</div>
        )}
      </Section>

      <Section title="Line items">
        {items.length === 0 ? (
          <div className="text-slate-500">No line items recorded.</div>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {items.map((it) => (
              <li
                key={it.id}
                className="px-3 py-2 flex items-center gap-3"
                data-testid={`sheet-item-${it.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-slate-900 font-medium truncate">
                    {it.label}
                  </div>
                  <div className="text-slate-500 text-[11.5px]">
                    {it.kind} · {it.sku}
                    {it.quantity > 1 ? ` · ×${it.quantity}` : ""}
                  </div>
                </div>
                <div className="text-slate-900 tabular-nums">
                  {dollars(it.unitPriceCents * (it.quantity || 1))}
                </div>
              </li>
            ))}
            <li className="px-3 py-2 flex items-center bg-slate-50">
              <span className="text-slate-500 text-[11.5px] uppercase tracking-wider font-semibold flex-1">
                Total
              </span>
              <span
                className="text-slate-900 font-semibold tabular-nums"
                data-testid="sheet-total"
              >
                {dollars(o.totalCents)}
              </span>
            </li>
          </ul>
        )}
      </Section>

      <Section title="Fulfillment">
        <dl className="grid grid-cols-[120px_1fr] gap-y-1 gap-x-3">
          <Row label="Kind" value={o.skuKind ?? "—"} />
          <Row label="Status" value={o.fulfillmentStatus ?? "—"} />
          <Row
            label="Ship to"
            value={
              addr
                ? `${o.shippingName ?? "—"} · ${[
                    addr.line1,
                    addr.line2,
                    addr.city,
                    addr.state,
                    addr.postalCode,
                    addr.country,
                  ]
                    .filter(Boolean)
                    .join(", ")}`
                : "—"
            }
          />
          <Row
            label="Carrier"
            value={
              o.trackingUrl ? (
                <a
                  href={o.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--brand-blue)] hover:underline"
                  data-testid="link-tracking"
                >
                  {o.carrier ?? "Tracking"} · {o.trackingNumber ?? "open"}
                </a>
              ) : o.carrier ? (
                `${o.carrier} · ${o.trackingNumber ?? "—"}`
              ) : (
                "—"
              )
            }
          />
          <Row
            label="Submitted"
            value={o.submittedToFulfillmentAt ? new Date(o.submittedToFulfillmentAt).toLocaleString() : "—"}
          />
          <Row
            label="Shipped"
            value={o.shippedAt ? new Date(o.shippedAt).toLocaleString() : "—"}
          />
          <Row
            label="Delivered"
            value={o.deliveredAt ? new Date(o.deliveredAt).toLocaleString() : "—"}
          />
          <Row
            label="Returned"
            value={o.returnedAt ? new Date(o.returnedAt).toLocaleString() : "—"}
          />
        </dl>
      </Section>

      <Section title="Refund history">
        <RefundAction order={o as AdminOrderRow} />
        {!refunded && refundEvents.length === 0 ? (
          <div className="text-slate-500">No refunds recorded.</div>
        ) : (
          <ul className="space-y-1.5">
            {refunded && (
              <li
                className="flex items-center gap-2"
                data-testid="sheet-refund-status"
              >
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-rose-50 text-rose-700">
                  Refunded
                </span>
                <span className="text-slate-600">
                  {o.refundedAt
                    ? new Date(o.refundedAt).toLocaleString()
                    : "Marked refunded"}
                </span>
              </li>
            )}
            {refundEvents.map((e) => (
              <li
                key={e.id}
                className="text-slate-600"
                data-testid={`sheet-refund-event-${e.id}`}
              >
                <span className="text-slate-400">
                  {new Date(e.receivedAt).toLocaleString()}
                </span>{" "}
                · {e.eventType ?? "event"}
                {e.fulfillmentStatus ? ` → ${e.fulfillmentStatus}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// Task #236 — in-sheet refund control. Direct (Stripe) and Shopify-
// origin orders share a single `/api/admin/orders/:id/refund` endpoint;
// the server picks the right gateway from `order.origin`. We invalidate
// both the list and this order's detail query so the Refund history
// list + status pill update without a page reload.
function RefundAction({ order }: { order: AdminOrderRow }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>(
    ((order.totalCents ?? 0) / 100).toFixed(2),
  );
  const [reason, setReason] = useState<string>("");
  const refundable = order.status === "paid" || order.status === "shipped";
  const isShopify = (order.origin ?? "direct").startsWith("shopify:");

  const mutation = useMutation({
    mutationFn: async () => {
      const dollars = Number.parseFloat(amount);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        throw new Error("Enter a refund amount greater than $0");
      }
      const cents = Math.round(dollars * 100);
      if (cents > order.totalCents) {
        throw new Error("Refund amount cannot exceed order total");
      }
      const res = await apiRequest("POST", `/api/admin/orders/${order.id}/refund`, {
        amountCents: cents,
        reason: reason.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data: { full: boolean; amountCents: number }) => {
      toast({
        title: data.full ? "Refund issued" : "Partial refund issued",
        description: `$${(data.amountCents / 100).toFixed(2)} returned via ${isShopify ? "Shopify" : "Stripe"}.`,
      });
      setOpen(false);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders", order.id] });
    },
    onError: (err: any) => {
      toast({
        title: "Refund failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  if (!refundable) return null;

  if (!open) {
    return (
      <div className="mb-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          data-testid="button-open-refund"
        >
          Refund this order
        </Button>
        <p className="text-[11.5px] text-slate-500 mt-1">
          Issues a {isShopify ? "Shopify" : "Stripe"} refund directly. Full refunds void the GoodDeed
          number and return the album unlock; partial refunds leave the order
          intact.
        </p>
      </div>
    );
  }

  return (
    <div
      className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2"
      data-testid="refund-form"
    >
      <div className="flex items-center gap-2">
        <label className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500 w-16">
          Amount
        </label>
        <span className="text-slate-500">$</span>
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          className="h-8 w-28 tabular-nums"
          data-testid="input-refund-amount"
        />
        <button
          type="button"
          onClick={() => setAmount((order.totalCents / 100).toFixed(2))}
          className="text-[11.5px] text-[var(--brand-blue)] hover:underline"
          data-testid="button-refund-full"
        >
          Full (${(order.totalCents / 100).toFixed(2)})
        </button>
      </div>
      <div className="flex items-start gap-2">
        <label className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500 w-16 mt-1.5">
          Reason
        </label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional — shown in Stripe / sent in Shopify refund note"
          rows={2}
          className="text-[12.5px]"
          data-testid="input-refund-reason"
        />
      </div>
      <div className="flex items-center gap-2 justify-end">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={mutation.isPending}
          data-testid="button-cancel-refund"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          data-testid="button-submit-refund"
        >
          {mutation.isPending ? "Refunding…" : "Issue refund"}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 min-w-0 truncate">{value}</dd>
    </>
  );
}
