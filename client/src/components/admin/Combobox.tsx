import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";

/**
 * Combobox — searchable picker over a list of existing string values
 * fetched from `optionsEndpoint`. Shared by the admin Genre field on
 * AdminAlbum (EditablePanel) and the Albums filter popover, so both
 * surfaces look and behave identically per the styleguide.
 *
 * If `allowAdd` is true (default) and the typed query has no exact
 * (case-insensitive) match, a final "Add '<typed>'" row lets the
 * operator commit a brand-new value — used by the edit flow where
 * Genre is free-text on the album row. The filter flow passes
 * `allowAdd={false}` because filtering by a genre that doesn't exist
 * in the catalog would always return zero rows.
 *
 * Keyboard: ↑/↓ moves the highlight, Enter picks the highlighted row
 * (or commits the typed text if allowAdd and nothing matches), Esc
 * closes the popup leaving the field's current value untouched.
 */
export function Combobox({
  value,
  onChange,
  optionsEndpoint,
  placeholder,
  testId,
  allowAdd = true,
  allowClear = false,
}: {
  value: string;
  onChange: (next: string) => void;
  optionsEndpoint?: string;
  placeholder?: string;
  testId: string;
  allowAdd?: boolean;
  allowClear?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = `${testId}-listbox`;
  const optionId = (i: number) => `${testId}-opt-${i}`;

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const { data } = useQuery<string[]>({
    queryKey: [optionsEndpoint],
    enabled: !!optionsEndpoint,
    select: (raw: any) => {
      if (Array.isArray(raw)) return raw as string[];
      if (raw && typeof raw === "object") {
        const firstArray = Object.values(raw).find((v) => Array.isArray(v));
        return (firstArray as string[]) ?? [];
      }
      return [];
    },
  });

  const all = data ?? [];
  const q = query.trim();
  const qLower = q.toLowerCase();
  const filtered = useMemo(
    () => (q ? all.filter((o) => o.toLowerCase().includes(qLower)) : all),
    [all, q, qLower],
  );
  const exactMatch = all.some((o) => o.toLowerCase() === qLower);
  const showAdd = allowAdd && !!q && !exactMatch;
  const rowCount = filtered.length + (showAdd ? 1 : 0);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        // For pickers that *don't* support free-text add, never silently
        // commit unmatched typed text — snap back to the last value.
        if (!allowAdd) {
          if (query !== value) setQuery(value);
          return;
        }
        if (query !== value) onChange(query.trim());
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, query, value, onChange, allowAdd]);

  const commit = (next: string) => {
    const trimmed = next.trim();
    setQuery(trimmed);
    onChange(trimmed);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(0, rowCount - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight < filtered.length) {
        commit(filtered[highlight]);
      } else if (showAdd) {
        commit(q);
      } else if (allowAdd) {
        commit(query);
      } else if (filtered.length > 0) {
        commit(filtered[0]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery(value);
    }
  };

  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && wrapRef.current?.contains(next)) return;
    setOpen(false);
    const trimmed = query.trim();
    if (!allowAdd) {
      if (trimmed !== (value ?? "")) setQuery(value);
      return;
    }
    if (trimmed !== (value ?? "")) onChange(trimmed);
  };

  const activeId =
    open && rowCount > 0
      ? optionId(Math.min(highlight, rowCount - 1))
      : undefined;

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? "Search or add new…"}
        className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 pr-8 text-[13.5px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent"
        data-testid={testId}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && rowCount > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
      />
      {allowClear && !!value && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            commit("");
          }}
          aria-label="Clear"
          data-testid={`${testId}-clear`}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {open && rowCount > 0 && (
        <div
          id={listboxId}
          className="absolute z-20 top-[calc(100%+4px)] left-0 right-0 max-h-60 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg py-1"
          role="listbox"
          data-testid={`${testId}-options`}
        >
          {filtered.map((opt, i) => (
            <button
              key={opt}
              id={optionId(i)}
              type="button"
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(opt);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={[
                "w-full text-left px-3 py-1.5 text-[13.5px] flex items-center justify-between gap-2",
                i === highlight
                  ? "bg-[#319ED8]/10 text-slate-900"
                  : "text-slate-700 hover:bg-slate-50",
              ].join(" ")}
              data-testid={`${testId}-option-${opt
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")}`}
            >
              <span className="truncate">{opt}</span>
              {opt.toLowerCase() === value.toLowerCase() && (
                <Check className="w-3.5 h-3.5 text-[#319ED8] flex-shrink-0" />
              )}
            </button>
          ))}
          {showAdd && (
            <button
              id={optionId(filtered.length)}
              type="button"
              role="option"
              aria-selected={highlight === filtered.length}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(q);
              }}
              onMouseEnter={() => setHighlight(filtered.length)}
              className={[
                "w-full text-left px-3 py-1.5 text-[13.5px] flex items-center gap-2 border-t border-slate-100",
                highlight === filtered.length
                  ? "bg-[#319ED8]/10 text-[#319ED8]"
                  : "text-[#319ED8] hover:bg-slate-50",
              ].join(" ")}
              data-testid={`${testId}-option-add`}
            >
              <Plus className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">
                Add <span className="font-semibold">"{q}"</span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
