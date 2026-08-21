// Task #3227 — Itemized press-package cost breakdown (operator-visible
// cost data, NOT fan pricing). For an album with a press assigned, shows
// record (tier ladder at the planned quantity) + each selected component's
// price resolved from THAT press's own linkage rows (component ladders /
// service items / included / custom quote) + applicable one-time services
// (metalwork, setup fees, test pressings). Unpriced components surface
// honestly as "no price on file" / "custom quote" — never $0, never
// another press's number. Selection is a local operator scratchpad; the
// press-level linkages come from the press catalog page.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  PACKAGE_COMPONENT_KEYS,
  PACKAGE_COMPONENT_OPTIONS,
  PACKAGE_COMPONENT_GROUP_LABEL,
  PACKAGE_OPTION_LABEL,
  type PackageComponentKey,
} from "@shared/pressComponentPricing";
import { PRESS_SERVICE_UNIT_LABEL, type PressServiceUnitBasis } from "@shared/schema";

const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type BreakdownLine = {
  componentKey: string;
  optionId: string;
  label: string;
  status: "priced" | "included" | "custom_quote" | "no_price_on_file";
  unitCents: number | null;
  totalCents: number | null;
  snappedQty: number | null;
  unitBasis: PressServiceUnitBasis | null;
  sourceLabel: string | null;
  note: string | null;
};
type Breakdown = {
  pressName: string;
  quantity: number;
  record: {
    unitCents: number;
    totalCents: number;
    snappedQty: number;
    tierName: string;
    colorName: string | null;
    requiresQuote: boolean;
  } | null;
  recordNote?: string | null;
  components: BreakdownLine[];
  oneTimeServices: { id: string; category: string; label: string; amountCents: number; unitBasis: PressServiceUnitBasis; note: string | null }[];
  totals: { recordCents: number | null; componentsCents: number; combinedCents: number | null; unpricedCount: number };
};

export function PressPackageCostBreakdown({
  pressId,
  format,
  tierId,
  colorId,
  plannedQuantity,
}: {
  pressId: string;
  format: string;
  tierId: string | null;
  colorId: string | null;
  plannedQuantity: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [qtyText, setQtyText] = useState<string | null>(null);
  const quantity = Math.max(1, Math.floor(Number(qtyText ?? "") || plannedQuantity || 500));
  // Default composition: single jacket + white poly-lined sleeve +
  // shrink-wrap — the common baseline; operators toggle the rest.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(["jacket:single", "inner_sleeve:white-poly", "extras:shrink_wrap"]),
  );
  const selections = useMemo(() => Array.from(selected).sort().join(","), [selected]);

  const params = new URLSearchParams({
    format,
    tierId: tierId ?? "",
    colorId: colorId ?? "",
    quantity: String(quantity),
    selections,
  });
  const { data, isLoading, error } = useQuery<Breakdown>({
    queryKey: [`/api/admin/manufacturers/${pressId}/catalog/package-cost-breakdown?${params.toString()}`],
    enabled: open && !!pressId,
  });

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      // Jacket + inner sleeve are single-choice groups; extras multi-toggle.
      const [group] = key.split(":");
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (group === "jacket" || group === "inner_sleeve" || group === "insert") {
          for (const k of Array.from(next)) if (k.startsWith(`${group}:`)) next.delete(k);
        }
        next.add(key);
      }
      return next;
    });

  const statusText = (l: BreakdownLine) => {
    if (l.status === "included") return "Included in record price";
    if (l.status === "custom_quote") return l.note ?? "Custom quote";
    if (l.status === "no_price_on_file") return "No price on file";
    if (l.totalCents === null) {
      return `${dollars(l.unitCents ?? 0)} ${l.unitBasis ? PRESS_SERVICE_UNIT_LABEL[l.unitBasis] : ""} — ${l.note ?? "rate only"}`;
    }
    return null;
  };

  return (
    <Card className="rounded-2xl shadow-sm px-5 py-4 mb-8" data-testid="panel-package-cost-breakdown">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2"
        onClick={() => setOpen((v) => !v)}
        data-testid="button-toggle-package-cost-breakdown"
      >
        <div className="text-left">
          <div className="text-sm font-semibold text-slate-900">Package cost breakdown</div>
          <div className="text-xs text-slate-500">
            Operator cost data — itemized from the press's own price rows. Not fan pricing.
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Quantity
              <input
                value={qtyText ?? String(plannedQuantity || 500)}
                onChange={(e) => setQtyText(e.target.value)}
                inputMode="numeric"
                className="w-20 rounded-md border border-slate-200 px-2 py-1 text-xs text-right tabular-nums"
                data-testid="input-breakdown-quantity"
              />
            </label>
          </div>

          {/* Component toggles */}
          <div className="space-y-2">
            {PACKAGE_COMPONENT_KEYS.map((group: PackageComponentKey) => (
              <div key={group} className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold w-24 shrink-0">
                  {PACKAGE_COMPONENT_GROUP_LABEL[group]}
                </span>
                {PACKAGE_COMPONENT_OPTIONS[group].map((opt) => {
                  const key = `${group}:${opt}`;
                  const on = selected.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggle(key)}
                      className={[
                        "rounded-full px-2.5 py-0.5 text-[11.5px] border transition-colors",
                        on
                          ? "border-[color:var(--brand-blue)] text-[color:var(--brand-blue)] bg-blue-50"
                          : "border-slate-200 text-slate-500 hover:border-slate-300",
                      ].join(" ")}
                      data-testid={`chip-breakdown-${group}-${opt}`}
                    >
                      {PACKAGE_OPTION_LABEL[group][opt] ?? opt}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Lines */}
          {isLoading && <div className="text-xs text-slate-400">Pricing…</div>}
          {!!error && (
            <div className="text-xs text-slate-400">Couldn't load the breakdown.</div>
          )}
          {data && (
            <div className="space-y-1" data-testid="package-cost-lines">
              {!tierId && (
                <div className="text-xs text-slate-400">
                  No catalog tier saved on this SKU yet — record line unavailable.
                </div>
              )}
              {!data.record && data.recordNote && (
                <div className="flex items-center justify-between gap-4 text-xs" data-testid="record-line-note">
                  <span className="text-slate-700">Record</span>
                  <span className="text-slate-400 italic">{data.recordNote}</span>
                </div>
              )}
              {data.record && (
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span className="text-slate-700">
                    Record — {data.record.tierName}
                    {data.record.colorName ? ` · ${data.record.colorName}` : ""}
                    {data.record.requiresQuote
                      ? ""
                      : ` (${dollars(data.record.unitCents)}/unit @ rung ${data.record.snappedQty.toLocaleString()})`}
                  </span>
                  <span className="tabular-nums text-slate-900 font-medium">
                    {data.record.requiresQuote ? "Custom quote" : dollars(data.record.totalCents)}
                  </span>
                </div>
              )}
              {data.components.map((l) => (
                <div
                  key={`${l.componentKey}:${l.optionId}`}
                  className="flex items-center justify-between gap-4 text-xs"
                  data-testid={`cost-line-${l.componentKey}-${l.optionId}`}
                >
                  <span className="text-slate-600 min-w-0 truncate">
                    {l.label}
                    {l.status === "priced" && l.unitCents !== null && l.totalCents !== null && (
                      <span className="text-slate-400">
                        {" "}({dollars(l.unitCents)}/unit{l.snappedQty ? ` @ rung ${l.snappedQty.toLocaleString()}` : ""})
                      </span>
                    )}
                  </span>
                  <span
                    className={[
                      "tabular-nums shrink-0",
                      l.status === "priced" && l.totalCents !== null
                        ? "text-slate-900 font-medium"
                        : "text-slate-400 italic",
                    ].join(" ")}
                  >
                    {l.status === "priced" && l.totalCents !== null ? dollars(l.totalCents) : statusText(l)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 text-xs pt-1.5 mt-1 border-t border-slate-100">
                <span className="text-slate-900 font-semibold">
                  Total (priced lines{data.totals.unpricedCount > 0 ? ` — ${data.totals.unpricedCount} unpriced` : ""})
                </span>
                <span className="tabular-nums text-slate-900 font-semibold">
                  {data.totals.combinedCents !== null
                    ? dollars(data.totals.combinedCents)
                    : data.totals.componentsCents > 0
                      ? `${dollars(data.totals.componentsCents)} components only`
                      : "—"}
                </span>
              </div>

              {data.oneTimeServices.length > 0 && (
                <div className="pt-2 mt-2 border-t border-slate-100">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    One-time services (metalwork, test pressings, setup)
                  </div>
                  {data.oneTimeServices.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-4 text-xs">
                      <span className="text-slate-600 min-w-0 truncate">{s.label}</span>
                      <span className="tabular-nums text-slate-700">
                        {dollars(s.amountCents)}{" "}
                        <span className="text-slate-400">{PRESS_SERVICE_UNIT_LABEL[s.unitBasis]}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
