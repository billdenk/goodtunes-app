import { useState } from "react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

// Task #230 — Design stub for the fan-orders queue. No data wiring yet;
// the page exists so the team can react to the intended UI (tab strip,
// per-tab empty state, column layout) before we plumb in real Shopify
// + Stripe order data.
type Tab = "all" | "active" | "returns" | "refunded";

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

const COLUMNS = ["Order", "Customer", "Items", "Total", "Status", "Date"];

export function AdminFanOrders() {
  const [tab, setTab] = useState<Tab>("all");
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <AdminFrame active="fan-orders">
      <div className="space-y-5" data-testid="page-admin-fan-orders">
        <AdminPageHeader title="Fan orders" />

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
                  "px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors",
                  isActive
                    ? "border-[var(--brand-blue)] text-[var(--brand-blue)]"
                    : "border-transparent text-slate-500 hover:text-slate-900",
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </div>

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

        <div
          className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
          data-testid="skeleton-fan-orders-table"
          aria-hidden="true"
        >
          <div className="grid grid-cols-6 gap-3 px-4 py-2.5 border-b border-slate-200 bg-slate-50">
            {COLUMNS.map((c) => (
              <div
                key={c}
                className="text-[11px] font-semibold uppercase tracking-wider text-slate-500"
              >
                {c}
              </div>
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, rowIdx) => (
            <div
              key={rowIdx}
              className="grid grid-cols-6 gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0"
            >
              {COLUMNS.map((_, colIdx) => (
                <div
                  key={colIdx}
                  className="h-3 rounded bg-slate-100"
                  style={{ width: `${50 + ((rowIdx * 13 + colIdx * 7) % 40)}%` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </AdminFrame>
  );
}
