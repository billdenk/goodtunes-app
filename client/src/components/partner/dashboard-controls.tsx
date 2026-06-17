import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RangePreset<T extends string> = { id: T; label: string };

export function RangePicker<T extends string>({
  presets,
  value,
  onChange,
  testId = "range-picker",
}: {
  presets: ReadonlyArray<RangePreset<T>>;
  value: T;
  onChange: (next: T) => void;
  testId?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      className="rounded-full bg-slate-100 p-1 ring-1 ring-slate-200 gap-0 justify-start"
      data-testid={testId}
    >
      {presets.map((p) => (
        <ToggleGroupItem
          key={p.id}
          value={p.id}
          aria-label={p.label}
          className={cn(
            "h-11 min-w-[44px] px-4 rounded-full font-semibold transition-colors",
            "text-slate-600 hover:text-slate-900 hover:bg-white",
            "data-[state=on]:bg-white data-[state=on]:text-slate-900 data-[state=on]:shadow-sm data-[state=on]:hover:bg-white",
            "focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)]",
          )}
          data-testid={`button-range-${p.id}`}
        >
          {p.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function CompareToggle({
  active,
  onToggle,
  label = "Compare to previous period",
}: {
  active: boolean;
  onToggle: (next: boolean) => void;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onToggle(!active)}
      aria-pressed={active}
      className={cn(
        "ml-auto h-11 min-w-[44px] px-4 rounded-full font-semibold ring-1 transition-colors",
        active
          ? "bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-100 hover:text-blue-700"
          : "bg-transparent text-slate-600 ring-slate-200 hover:bg-slate-100 hover:text-slate-900",
      )}
      data-testid="button-toggle-compare"
    >
      {label} {active ? "✓" : ""}
    </Button>
  );
}

export type TabDef<T extends string> = { id: T; label: string };

export function DashboardTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: ReadonlyArray<TabDef<T>>;
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <nav
        className={cn(
          "sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200",
          className,
        )}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <TabsPrimitive.List className="flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <TabsPrimitive.Trigger
                key={t.id}
                value={t.id}
                className={cn(
                  "h-11 min-h-[44px] inline-flex items-center px-3 font-semibold whitespace-nowrap",
                  "border-b-2 border-transparent transition-colors",
                  "text-slate-500 hover:text-slate-900",
                  "data-[state=active]:border-[color:var(--brand-blue)] data-[state=active]:text-slate-900",
                  "focus-visible:outline-none focus-visible:text-slate-900",
                )}
                data-testid={`tab-${t.id}`}
              >
                {t.label}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
        </div>
      </nav>
    </TabsPrimitive.Root>
  );
}

/**
 * Light dashboard panel — the shared "white rounded card on a slate page"
 * surface used by Label/Artist/NPO/Press dashboards. Replaces the
 * `rounded-2xl bg-white ring-1 ring-slate-200 p-4` literal that
 * was duplicated across every KPI tile and table wrapper. Accepts an
 * `as` prop so it can render a <ul>, <li>, etc. without losing the
 * shared surface treatment.
 */
type DashboardPanelProps = React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "ul" | "li" | "section" | "article";
  padding?: "none" | "sm" | "md";
};
export function DashboardPanel({
  as: Tag = "div",
  className,
  padding = "md",
  ...props
}: DashboardPanelProps) {
  return (
    <Tag
      className={cn(
        "rounded-2xl bg-white ring-1 ring-slate-200",
        padding === "md" && "p-4",
        padding === "sm" && "p-3",
        className,
      )}
      {...props}
    />
  );
}
