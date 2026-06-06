import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, X } from "lucide-react";

export const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "super_admin", label: "Super Admin (full access)" },
  { value: "label", label: "Label" },
  { value: "manager", label: "Manager" },
  { value: "artist", label: "Artist" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "fulfillment", label: "Fulfillment Partner" },
  { value: "non_profit", label: "Non-profit" },
  { value: "vendor", label: "Vendor (GoodDeed pricing)" },
];

export const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((o) => [o.value, o.label.replace(/ \(.*\)$/, "")]),
);

export const SCOPE_CONFIG: Record<
  string,
  { endpoint: string; noun: string; thumbField: "photoUrl" | "logoUrl" }
> = {
  artist: { endpoint: "/api/people", noun: "artist", thumbField: "photoUrl" },
  label: { endpoint: "/api/labels", noun: "label", thumbField: "logoUrl" },
  manager: { endpoint: "/api/managers", noun: "manager", thumbField: "logoUrl" },
  manufacturer: { endpoint: "/api/manufacturers", noun: "manufacturer", thumbField: "logoUrl" },
  fulfillment: { endpoint: "/api/fulfillment-partners", noun: "fulfillment partner", thumbField: "logoUrl" },
  non_profit: { endpoint: "/api/non-profits", noun: "non-profit", thumbField: "logoUrl" },
  vendor: { endpoint: "/api/vendors", noun: "vendor", thumbField: "logoUrl" },
  // Task #350 — ambassador picker reuses the people endpoint; server
  // validates can_invite_ambassadors=true at invite-create time so a
  // misclicked non-ambassador surfaces as a 400 rather than silently
  // attributing to a person without the verb.
  ambassador: { endpoint: "/api/people", noun: "ambassador", thumbField: "photoUrl" },
};

export type ScopeEntity = { id: string; name: string; photoUrl?: string | null; logoUrl?: string | null };

export function ScopePicker({
  cfg,
  value,
  onChange,
  label,
  testId,
}: {
  cfg: { endpoint: string; noun: string; thumbField: "photoUrl" | "logoUrl" };
  value: string | null;
  onChange: (id: string | null, name: string | null) => void;
  label?: string;
  testId?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data: rows = [], isLoading } = useQuery<ScopeEntity[]>({
    queryKey: [cfg.endpoint],
  });

  const selected = useMemo(() => rows.find((r) => r.id === value) ?? null, [rows, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted.slice(0, 50);
    return sorted.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 50);
  }, [rows, query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const thumb = (r: ScopeEntity) => (cfg.thumbField === "photoUrl" ? r.photoUrl : r.logoUrl) || null;

  return (
    <div className="mt-3" ref={wrapRef}>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
        {label || cfg.noun.charAt(0).toUpperCase() + cfg.noun.slice(1)}
      </label>
      {selected ? (
        <div
          className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-300 bg-white"
          data-testid={testId ? `${testId}-selected` : "scope-selected"}
        >
          {thumb(selected) ? (
            <img src={thumb(selected)!} alt="" className="w-8 h-8 rounded-full object-cover bg-slate-100" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-200" />
          )}
          <div className="flex-1 min-w-0 font-medium text-slate-900 truncate">{selected.name}</div>
          <button
            type="button"
            onClick={() => {
              onChange(null, null);
              setQuery("");
              setOpen(true);
            }}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Clear selection"
            data-testid={testId ? `${testId}-clear` : "button-clear-scope"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-[var(--brand-blue)] focus-within:ring-2 focus-within:ring-[var(--brand-blue)]/20">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder={`Search ${cfg.noun}s…`}
              className="flex-1 px-3 py-2 bg-transparent focus:outline-none"
              data-testid={testId ? `${testId}-input` : "input-scope-search"}
            />
            <ChevronDown className="w-4 h-4 text-slate-400 mr-3" />
          </div>
          {open && (
            <div
              className="absolute z-20 mt-1 w-full max-h-72 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg"
              data-testid={testId ? `${testId}-options` : "list-scope-options"}
            >
              {isLoading ? (
                <div className="px-3 py-2 text-sm text-slate-500">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500">
                  No {cfg.noun}s match "{query}".
                </div>
              ) : (
                filtered.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      onChange(r.id, r.name);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                    data-testid={`option-${testId || "scope"}-${r.id}`}
                  >
                    {thumb(r) ? (
                      <img src={thumb(r)!} alt="" className="w-7 h-7 rounded-full object-cover bg-slate-100" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-200" />
                    )}
                    <span className="text-sm text-slate-900 truncate">{r.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
