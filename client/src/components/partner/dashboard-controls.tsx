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
      className="rounded-full bg-white/5 p-1 ring-1 ring-white/10 gap-0 justify-start"
      data-testid={testId}
    >
      {presets.map((p) => (
        <ToggleGroupItem
          key={p.id}
          value={p.id}
          aria-label={p.label}
          className={cn(
            "h-11 min-w-[44px] px-4 rounded-full font-semibold transition-colors",
            "text-white/70 hover:text-white hover:bg-white/5",
            "data-[state=on]:bg-white data-[state=on]:text-[color:var(--brand-bg)] data-[state=on]:hover:bg-white",
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
          ? "bg-[color:var(--brand-blue)]/15 text-[color:var(--brand-blue)] ring-[color:var(--brand-blue)]/30 hover:bg-[color:var(--brand-blue)]/20 hover:text-[color:var(--brand-blue)]"
          : "bg-transparent text-white/55 ring-white/15 hover:bg-white/5 hover:text-white",
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
          "sticky top-0 z-10 bg-[color:var(--brand-bg)]/95 backdrop-blur border-b border-white/10",
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
                  "text-white/55 hover:text-white",
                  "data-[state=active]:border-[color:var(--brand-mint)] data-[state=active]:text-white",
                  "focus-visible:outline-none focus-visible:text-white",
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
 * Dark-mode dashboard panel — the shared "rounded card on a navy page"
 * surface used by Label/Artist/NPO dashboards. Replaces the
 * `rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-4` literal that
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
        "rounded-2xl bg-white/[0.04] ring-1 ring-white/10",
        padding === "md" && "p-4",
        padding === "sm" && "p-3",
        className,
      )}
      {...props}
    />
  );
}
