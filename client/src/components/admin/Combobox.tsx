import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
        className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 pr-8 text-[13.5px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
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
                  ? "bg-[var(--brand-blue)]/10 text-slate-900"
                  : "text-slate-700 hover:bg-slate-50",
              ].join(" ")}
              data-testid={`${testId}-option-${opt
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")}`}
            >
              <span className="truncate">{opt}</span>
              {opt.toLowerCase() === value.toLowerCase() && (
                <Check className="w-3.5 h-3.5 text-[var(--brand-blue)] flex-shrink-0" />
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
                  ? "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]"
                  : "text-[var(--brand-blue)] hover:bg-slate-50",
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

export type EntityLite = { id: string; name: string };

/**
 * EntityCombobox — searchable picker over real *records* (labels today),
 * not free text. Distinct from `Combobox` above: the displayed value is
 * the record's name, but the value handed back is the record's id.
 *
 * - Lists existing records from `listEndpoint` (GET → `[{id, name, …}]`),
 *   with a synthetic empty/none row at the top labelled `emptyOptionLabel`
 *   (e.g. "Independent") that clears the selection.
 * - Typing a name that isn't an existing record reveals an "Add '<typed>'"
 *   row; committing it POSTs `{ name }` to `createEndpoint`, refreshes the
 *   list cache so the new record shows everywhere, and selects it.
 * - A typed name that matches an existing record (case-insensitive)
 *   resolves to that record instead of creating a duplicate (no Add row).
 * - Unmatched typed text is never silently committed on blur/click-out —
 *   it snaps back to the current selection (creation must be explicit).
 *
 * `onPick` fires with the chosen record, or `null` when the empty/none
 * row is picked.
 */
export function EntityCombobox({
  value,
  onPick,
  listEndpoint,
  createEndpoint,
  emptyOptionLabel = "None",
  placeholder,
  testId,
}: {
  value: string;
  onPick: (entity: EntityLite | null) => void;
  listEndpoint: string;
  createEndpoint: string;
  emptyOptionLabel?: string;
  placeholder?: string;
  testId: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = `${testId}-listbox`;
  const optionId = (i: number) => `${testId}-opt-${i}`;

  const { data } = useQuery<EntityLite[]>({
    queryKey: [listEndpoint],
    select: (raw: any) =>
      Array.isArray(raw)
        ? raw.map((r: any) => ({ id: String(r.id), name: String(r.name) }))
        : [],
  });
  const entities = data ?? [];
  const selected = entities.find((e) => e.id === value) ?? null;
  const selectedName = selected?.name ?? "";

  // Keep the visible text in sync with the resolved selection — but only
  // when the popup is closed so a background list refetch never clobbers
  // what the operator is typing. On first load the list arrives async, so
  // this is what fills in an existing label's name.
  useEffect(() => {
    if (!open) setQuery(selectedName);
  }, [selectedName, open]);

  const createMut = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", createEndpoint, { name });
      return (await res.json()) as EntityLite;
    },
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: [listEndpoint] });
      const next = { id: String(created.id), name: String(created.name) };
      onPick(next);
      setQuery(next.name);
      setOpen(false);
      inputRef.current?.blur();
      toast({ title: `Added ${next.name}` });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't add",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const rows: EntityLite[] = useMemo(
    () => [{ id: "", name: emptyOptionLabel }, ...entities],
    [entities, emptyOptionLabel],
  );
  const q = query.trim();
  const qLower = q.toLowerCase();
  const filtered = useMemo(
    () => (q ? rows.filter((e) => e.name.toLowerCase().includes(qLower)) : rows),
    [rows, q, qLower],
  );
  const exactMatch =
    rows.find((e) => e.name.toLowerCase() === qLower) ?? null;
  const showAdd = !!q && !exactMatch && !createMut.isPending;
  const rowCount = filtered.length + (showAdd ? 1 : 0);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        // Never silently commit unmatched typed text — snap back.
        if (query !== selectedName) setQuery(selectedName);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, query, selectedName]);

  const commitEntity = (e: EntityLite) => {
    if (e.id === "") {
      onPick(null);
      setQuery("");
    } else {
      onPick(e);
      setQuery(e.name);
    }
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
        commitEntity(filtered[highlight]);
      } else if (showAdd) {
        createMut.mutate(q);
      } else if (exactMatch) {
        commitEntity(exactMatch);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery(selectedName);
    }
  };

  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && wrapRef.current?.contains(next)) return;
    setOpen(false);
    if (query !== selectedName) setQuery(selectedName);
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
        className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 pr-8 text-[13.5px] text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
        data-testid={testId}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && rowCount > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
      />
      {createMut.isPending && (
        <span className="absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-slate-400">
          Adding…
        </span>
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
              key={opt.id || "__none"}
              id={optionId(i)}
              type="button"
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                commitEntity(opt);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={[
                "w-full text-left px-3 py-1.5 text-[13.5px] flex items-center justify-between gap-2",
                i === highlight
                  ? "bg-[var(--brand-blue)]/10 text-slate-900"
                  : "text-slate-700 hover:bg-slate-50",
                opt.id === "" ? "text-slate-500 italic" : "",
              ].join(" ")}
              data-testid={`${testId}-option-${
                opt.id
                  ? opt.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
                  : "none"
              }`}
            >
              <span className="truncate">{opt.name}</span>
              {opt.id === value && (
                <Check className="w-3.5 h-3.5 text-[var(--brand-blue)] flex-shrink-0" />
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
                createMut.mutate(q);
              }}
              onMouseEnter={() => setHighlight(filtered.length)}
              className={[
                "w-full text-left px-3 py-1.5 text-[13.5px] flex items-center gap-2 border-t border-slate-100",
                highlight === filtered.length
                  ? "bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]"
                  : "text-[var(--brand-blue)] hover:bg-slate-50",
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
