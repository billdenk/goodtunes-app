import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * RolePicker — Task #824.
 *
 * One coherent, Apple-"choose-a-carrier"-style role step for adding or
 * associating a Person in the admin. It separates two genuinely different
 * notions so operators stop conflating them:
 *
 *   • ACCESS role (single-select) — admin / label / artist / ambassador.
 *     Grants partner access (or mints an invite) on `users.role`. Exactly
 *     one applies at a time, so it renders as a radio-style stack of
 *     tappable cards with a selected ring + check.
 *
 *   • CREATIVE credits (multi-select) — Artist / Producer / Writer /
 *     Performer (+ any catalog credit). Descriptive "hats" a person wears
 *     (Prince is artist + producer + writer + guitarist). Persisted as the
 *     person's `roles[]` tags. Renders as a wrap of toggle chips with an
 *     inline search/filter and a free-text add.
 *
 * Both sections are optional — pass only the props for the axis a given
 * flow needs. Smart defaults are the caller's job (entity People tab →
 * that entity's access role; global People tab → artist/producer); this
 * component is a controlled surface.
 */

export type AccessRoleOption = {
  value: string;
  label: string;
  hint?: string;
};

type CreditRole = { id: string; name: string; kind: string };

/** The four headline creative credits the spec calls out, always shown. */
export const PRIMARY_CREATIVE_CREDITS = ["Artist", "Producer", "Writer", "Performer"];

export interface RolePickerProps {
  /** ACCESS section. Omit `accessOptions` to hide the access axis. */
  accessOptions?: AccessRoleOption[];
  accessValue?: string | null;
  onAccessChange?: (value: string | null) => void;
  accessLabel?: string;
  accessHint?: string;
  /** When true the access choice is fixed (e.g. an entity's own role). */
  accessLocked?: boolean;

  /** CREATIVE section. Omit `onCreativeChange` to hide the creative axis. */
  creativeValue?: string[];
  onCreativeChange?: (value: string[]) => void;
  creativeLabel?: string;
  creativeHint?: string;
  /**
   * Read-only credits derived from the person's actual track/album work.
   * Rendered as muted, non-removable chips so the operator sees the full
   * "hat" picture without being able to unset something the catalog says
   * is true.
   */
  derivedCreative?: string[];

  testIdPrefix?: string;
}

export function RolePicker({
  accessOptions,
  accessValue = null,
  onAccessChange,
  accessLabel = "Access role",
  accessHint,
  accessLocked = false,
  creativeValue,
  onCreativeChange,
  creativeLabel = "Creative credits",
  creativeHint,
  derivedCreative,
  testIdPrefix = "role-picker",
}: RolePickerProps) {
  const showAccess = !!accessOptions && accessOptions.length > 0;
  const showCreative = !!onCreativeChange;

  return (
    <div className="space-y-4" data-testid={`role-picker-${testIdPrefix}`}>
      {showAccess && (
        <AccessSection
          options={accessOptions!}
          value={accessValue}
          onChange={onAccessChange}
          label={accessLabel}
          hint={accessHint}
          locked={accessLocked}
          testIdPrefix={testIdPrefix}
        />
      )}
      {showCreative && (
        <CreativeSection
          value={creativeValue ?? []}
          onChange={onCreativeChange!}
          label={creativeLabel}
          hint={creativeHint}
          derived={derivedCreative ?? []}
          testIdPrefix={testIdPrefix}
        />
      )}
    </div>
  );
}

// ─── Access (single-select cards) ────────────────────────────────────

function AccessSection({
  options,
  value,
  onChange,
  label,
  hint,
  locked,
  testIdPrefix,
}: {
  options: AccessRoleOption[];
  value: string | null;
  onChange?: (value: string | null) => void;
  label: string;
  hint?: string;
  locked: boolean;
  testIdPrefix: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </label>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      <div className="space-y-2" data-testid={`role-picker-${testIdPrefix}-access`}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={locked && !selected}
              onClick={() => {
                if (locked) return;
                onChange?.(selected ? null : opt.value);
              }}
              className={[
                "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                selected
                  ? "border-[var(--brand-blue)] bg-[var(--brand-blue)]/5"
                  : "border-slate-200 hover:border-slate-300",
                locked ? "cursor-default" : "",
              ].join(" ")}
              data-testid={`button-${testIdPrefix}-access-${opt.value}`}
              aria-pressed={selected}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900">{opt.label}</div>
                {opt.hint && <div className="text-xs text-slate-500">{opt.hint}</div>}
              </div>
              <span
                className={[
                  "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors",
                  selected
                    ? "border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white"
                    : "border-slate-300 text-transparent",
                ].join(" ")}
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Creative (multi-select chips + search) ──────────────────────────

function CreativeSection({
  value,
  onChange,
  label,
  hint,
  derived,
  testIdPrefix,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  label: string;
  hint?: string;
  derived: string[];
  testIdPrefix: string;
}) {
  const [q, setQ] = useState("");

  // The catalog powers search beyond the four headline credits — same
  // source the per-track credits editor uses, so the vocabulary matches.
  const catalog = useQuery<CreditRole[]>({ queryKey: ["/api/admin/credit-roles"] });

  const lc = (s: string) => s.trim().toLowerCase();
  const isSelected = (name: string) => value.some((v) => lc(v) === lc(name));
  const isDerived = (name: string) => derived.some((d) => lc(d) === lc(name));

  function toggle(name: string) {
    const n = name.trim();
    if (!n) return;
    if (isSelected(n)) {
      onChange(value.filter((v) => lc(v) !== lc(n)));
    } else {
      onChange([...value, n]);
    }
  }

  // Suggestions = headline credits ∪ catalog names, de-duped, filtered by
  // the search term. Selected ones float to the front so they stay
  // visible while filtering.
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const all: string[] = [];
    for (const name of [...PRIMARY_CREATIVE_CREDITS, ...(catalog.data ?? []).map((r) => r.name)]) {
      const key = lc(name);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(name);
    }
    const term = lc(q);
    const filtered = term ? all.filter((n) => lc(n).includes(term)) : all;
    return filtered.sort((a, b) => {
      const sa = isSelected(a) ? 0 : 1;
      const sb = isSelected(b) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return a.localeCompare(b);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.data, q, value]);

  // Allow committing a brand-new credit not in the catalog via the search
  // box (Enter or the "Add" affordance).
  const trimmed = q.trim();
  const canAddCustom =
    trimmed.length > 0 &&
    !suggestions.some((s) => lc(s) === lc(trimmed)) &&
    !isSelected(trimmed);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </label>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>

      {/* Derived (read-only) credits from real track/album work. */}
      {derived.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5" data-testid={`role-picker-${testIdPrefix}-derived`}>
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <Sparkles className="h-3 w-3" /> From credits
          </span>
          {derived.map((name) => (
            <span
              key={`derived-${name}`}
              className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-500"
              data-testid={`chip-${testIdPrefix}-derived-${name}`}
            >
              {name}
            </span>
          ))}
        </div>
      )}

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
              toggle(trimmed);
              setQ("");
            }
          }}
          placeholder="Search credits (or type to add)…"
          className="pl-8"
          data-testid={`input-${testIdPrefix}-creative-search`}
        />
      </div>

      {/* Chips. */}
      <div className="flex flex-wrap gap-1.5" data-testid={`role-picker-${testIdPrefix}-creative`}>
        {canAddCustom && (
          <button
            type="button"
            onClick={() => { toggle(trimmed); setQ(""); }}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--brand-blue)] px-3 py-1 text-xs font-semibold text-[var(--brand-blue)] hover:bg-[var(--brand-blue)]/5"
            data-testid={`button-${testIdPrefix}-creative-add`}
          >
            <Plus className="h-3 w-3" /> Add “{trimmed}”
          </button>
        )}
        {suggestions.map((name) => {
          const selected = isSelected(name);
          const derivedToo = isDerived(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              className={[
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                selected
                  ? "border-[var(--brand-blue)] bg-[var(--brand-blue)]/5 text-[var(--brand-blue)]"
                  : "border-slate-200 text-slate-600 hover:border-slate-300",
              ].join(" ")}
              data-testid={`chip-${testIdPrefix}-creative-${name}`}
              aria-pressed={selected}
            >
              {selected && <Check className="h-3 w-3" strokeWidth={3} />}
              {name}
              {derivedToo && !selected && <Sparkles className="h-2.5 w-2.5 text-slate-300" />}
            </button>
          );
        })}
        {suggestions.length === 0 && !canAddCustom && (
          <span className="text-xs text-slate-400">No matching credits.</span>
        )}
      </div>
    </div>
  );
}
