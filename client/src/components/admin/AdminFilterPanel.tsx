import { useMemo, useState } from "react";
import { Filter, Search, X } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * AdminFilterPanel — the shared admin index-page filter affordance
 * (Task #24). One filter icon in the toolbar (matching the Albums
 * chrome: 36px square, slate hover, brand-blue "active" dot) opening
 * a panel of chip groups — a Popover on wider viewports, a bottom
 * Sheet on mobile so the touch targets aren't cramped.
 *
 * Chip + section styling is copied from AdminAlbums' inline
 * FilterSection / FilterChip so the two surfaces read identically.
 * (Albums keeps its own richer inline panel — Combobox, year select,
 * segmented controls — per the original task scope; this component
 * covers the chip-group cases: People, Gear, Vendors, Labels.)
 *
 * Semantics are owned by the page: the panel just reports
 * `onToggle(groupId, value)`. `mode: "single"` renders identically but
 * signals the page to replace-on-select; `multi` accumulates.
 */
export interface AdminFilterOption {
  value: string;
  label: string;
}

export interface AdminFilterGroup {
  id: string;
  label: string;
  options: AdminFilterOption[];
  /** multi (default): chips accumulate. single: page replaces selection. */
  mode?: "multi" | "single";
}

export function AdminFilterPanel({
  groups,
  selected,
  onToggle,
  onReset,
  isActive,
  title = "Filters",
}: {
  groups: AdminFilterGroup[];
  /** groupId → selected option values (exact `option.value` strings). */
  selected: Record<string, string[]>;
  onToggle: (groupId: string, value: string) => void;
  onReset: () => void;
  /** Any filter active — drives the blue dot + enables Reset. */
  isActive: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const isMobile = useIsMobile();

  const totalOptions = useMemo(
    () => groups.reduce((n, g) => n + g.options.length, 0),
    [groups],
  );
  // The option search only earns its row when the list is long (the
  // People credit list runs to dozens); a 2-chip Logo group doesn't
  // need a search box above it.
  const showSearch = totalOptions > 8;

  const q = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!q) return groups.map((g) => ({ group: g, options: g.options }));
    return groups.map((g) => {
      const sel = new Set(selected[g.id] ?? []);
      // Selected chips stay visible even when they don't match the
      // query, so narrowing the list never hides the way to unselect.
      const options = g.options.filter(
        (o) => sel.has(o.value) || o.label.toLowerCase().includes(q),
      );
      return { group: g, options };
    });
  }, [groups, selected, q]);

  const anyVisible = visibleGroups.some((g) => g.options.length > 0);

  const trigger = (
    <button
      type="button"
      aria-label="Filter"
      title="Filter"
      data-testid="button-filter"
      className="relative w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 data-[state=open]:bg-slate-100 data-[state=open]:text-slate-900 data-[state=open]:ring-1 data-[state=open]:ring-slate-200 transition-colors"
    >
      <Filter className="w-4 h-4" />
      {isActive && (
        <span
          className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--brand-blue)]"
          data-testid="badge-filter-active"
        />
      )}
    </button>
  );

  const body = (
    <>
      <div className="px-4 pt-3.5 pb-4 space-y-4">
        {showSearch && (
          <div className="flex items-center gap-1.5 h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md focus-within:border-[var(--brand-blue)] focus-within:ring-2 focus-within:ring-[var(--brand-blue)]/20 transition-colors">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filters"
              className="w-full text-[13px] bg-transparent outline-none placeholder:text-slate-400"
              data-testid="input-filter-search"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Clear filter search"
                data-testid="button-clear-filter-search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
        {anyVisible ? (
          visibleGroups.map(({ group, options }) =>
            options.length === 0 ? null : (
              <div key={group.id}>
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 mb-2">
                  {group.label}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {options.map((o) => {
                    const active = (selected[group.id] ?? []).includes(
                      o.value,
                    );
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => onToggle(group.id, o.value)}
                        aria-pressed={active}
                        data-testid={`filter-${group.id}-${o.value}`}
                        className={[
                          "h-7 px-2.5 text-[12px] font-semibold rounded-full transition-colors inline-flex items-center",
                          active
                            ? "bg-[var(--brand-blue)]/12 text-[#1f7ab4] ring-1 ring-inset ring-[var(--brand-blue)]/40"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                        ].join(" ")}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ),
          )
        ) : (
          <p
            className="text-[12.5px] text-slate-400 text-center py-2"
            data-testid="text-filter-search-empty"
          >
            No filters match "{query.trim()}"
          </p>
        )}
      </div>
      <div className="flex items-center justify-end px-4 py-2.5 border-t border-slate-100 bg-slate-50/60">
        <button
          type="button"
          onClick={onReset}
          disabled={!isActive}
          data-testid="button-filter-reset"
          className="text-[12.5px] font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Reset
        </button>
      </div>
    </>
  );

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) setQuery("");
  };

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="bg-white border-slate-200 rounded-t-xl p-0 max-h-[80dvh] overflow-y-auto"
          data-testid="sheet-filter"
        >
          <SheetHeader className="px-4 pt-4 pb-0 text-left">
            <SheetTitle className="text-[15px] font-semibold text-slate-900">
              {title}
            </SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        alignOffset={-8}
        sideOffset={6}
        className="w-[300px] p-0 bg-white border border-slate-200 rounded-xl shadow-[0_10px_30px_-12px_rgba(15,23,42,0.18)]"
        data-testid="popover-filter"
      >
        {/* Apple-style caret tying the popover to the Filter button —
            Radix positions the arrow at the trigger center, so with
            align="end" + alignOffset=-8 it lands directly under the
            icon. */}
        <PopoverArrow />
        {body}
      </PopoverContent>
    </Popover>
  );
}
