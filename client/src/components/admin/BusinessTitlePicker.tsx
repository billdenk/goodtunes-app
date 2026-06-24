import { useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

// Task #2071 — a Person's *business title* at a partner affiliation
// (CEO, CMO, A&R, Fulfillment…). This is a deliberately SEPARATE axis
// from the music "Creative credits" picker (RolePicker): a business
// title is descriptive metadata on the affiliation row
// (entity_contacts.role / organization_people.role) and NEVER lands in
// people.roles[] — so it can't flip a pure business contact into
// "artist shape". Keeping a distinct vocabulary here is what stops the
// two from cross-contaminating: the music catalog (guitar, producer,
// lyricist…) lives behind RolePicker; the staff titles live here.
//
// Single-select (one title per affiliation), with the same chip/search +
// free-text-add ergonomics as RolePicker's creative section so operators
// don't have to learn a second interaction.

/** Curated partner-staff titles. Free-text add covers anything missing. */
export const BUSINESS_TITLE_VOCAB: readonly string[] = [
  "CEO",
  "COO",
  "CFO",
  "CMO",
  "CTO",
  "Founder / Owner",
  "President",
  "A&R",
  "Marketing",
  "Sales",
  "Fulfillment",
  "Operations",
  "Manager",
  "Label Manager",
  "Publicist",
  "Booking",
  "Distribution",
  "Finance",
  "Legal",
];

const lc = (s: string) => s.trim().toLowerCase();

/**
 * Pure helper (unit-tested): the title suggestions to show given the
 * search term and the currently-selected title. The selected title (and
 * any free-text term that matches) floats to the front so it stays
 * visible while filtering. Exported so the picker logic is testable
 * without a DOM.
 */
export function filterBusinessTitles(
  query: string,
  selected: string | null,
  vocab: readonly string[] = BUSINESS_TITLE_VOCAB,
): string[] {
  const seen = new Set<string>();
  const all: string[] = [];
  // Fold the selected value in even when it isn't part of the catalog,
  // so a previously free-typed title ("Plant Manager") still shows as a
  // selectable/active chip.
  for (const name of [...(selected ? [selected] : []), ...vocab]) {
    const key = lc(name);
    if (!name.trim() || seen.has(key)) continue;
    seen.add(key);
    all.push(name);
  }
  const term = lc(query);
  const filtered = term ? all.filter((n) => lc(n).includes(term)) : all;
  return filtered.sort((a, b) => {
    const sa = selected && lc(a) === lc(selected) ? 0 : 1;
    const sb = selected && lc(b) === lc(selected) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b);
  });
}

export interface BusinessTitlePickerProps {
  /** The currently-selected title, or null when none is set. */
  value: string | null;
  onChange: (value: string | null) => void;
  testIdPrefix?: string;
}

export function BusinessTitlePicker({
  value,
  onChange,
  testIdPrefix = "business-title",
}: BusinessTitlePickerProps) {
  const [q, setQ] = useState("");

  const suggestions = useMemo(
    () => filterBusinessTitles(q, value),
    [q, value],
  );

  const isSelected = (name: string) => !!value && lc(value) === lc(name);

  function pick(name: string) {
    const n = name.trim();
    if (!n) return;
    // Single-select: clicking the active chip clears it.
    onChange(isSelected(n) ? null : n);
  }

  const trimmed = q.trim();
  const canAddCustom =
    trimmed.length > 0 &&
    !suggestions.some((s) => lc(s) === lc(trimmed));

  return (
    <div data-testid={`business-title-picker-${testIdPrefix}`}>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Business title
        </label>
        <span className="text-xs text-slate-400">Their job at this partner</span>
      </div>

      {/* Search / add box. */}
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canAddCustom) {
              e.preventDefault();
              pick(trimmed);
              setQ("");
            }
          }}
          placeholder="Search titles (or type to add)…"
          className="pl-8"
          data-testid={`input-${testIdPrefix}-search`}
        />
      </div>

      {/* Chips. */}
      <div className="flex flex-wrap gap-1.5" data-testid={`chips-${testIdPrefix}`}>
        {canAddCustom && (
          <button
            type="button"
            onClick={() => { pick(trimmed); setQ(""); }}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--brand-blue)] px-3 py-1 text-xs font-semibold text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/5"
            data-testid={`button-${testIdPrefix}-add`}
          >
            <Plus className="h-3 w-3" /> Add “{trimmed}”
          </button>
        )}
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700"
            data-testid={`button-${testIdPrefix}-clear`}
          >
            <X className="h-3 w-3" /> No title
          </button>
        )}
        {suggestions.map((name) => {
          const selected = isSelected(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => pick(name)}
              className={[
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                selected
                  ? "border-[var(--brand-blue)] bg-[var(--brand-blue)]/5 text-[var(--brand-blue)]"
                  : "border-slate-200 text-slate-600 hover:border-slate-300",
              ].join(" ")}
              data-testid={`chip-${testIdPrefix}-${name}`}
              aria-pressed={selected}
            >
              {selected && <Check className="h-3 w-3" strokeWidth={3} />}
              {name}
            </button>
          );
        })}
        {suggestions.length === 0 && !canAddCustom && (
          <span className="text-xs text-slate-400">No matching titles.</span>
        )}
      </div>
    </div>
  );
}
