// Task #3041 — "Find a press" advanced-search modal (super-admin).
//
// Relocated from the retired standalone /admin/press-match page (Task
// #1013) onto the Presses page per the handoff in handoff/press-find/.
// Spec-first: Format + Quantity required, Color / Preferred location /
// Max turnaround optional → ranked results by fit (price, color,
// turnaround, location — weights documented in shared/pressMatch.ts)
// with a per-row "Invite to bid" action that assigns the press to an
// artist or label through the existing invited-press flow.
//
// Visuals copy the handoff's SuperAdminPressesFind modal, restyled onto
// the app's real theme source: everything reads the `--apple-*` CSS
// variables, so the `gt-admin-dark` body class flips it to the charcoal
// canon automatically (the mock's floating theme pill + FIND_DARK /
// FIND_LIGHT consts were mock-only chrome and are gone). Canon rules
// kept: ONE filled blue pill on screen ("Find presses"); "Best match"
// is dot + label, never color alone.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, ChevronRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatUsdCents } from "@shared/money";
import { pressTurnaroundLabel } from "@/lib/pressTurnaround";
import { ALBUM_FORMATS, ALBUM_FORMAT_LABEL, type AlbumFormat } from "@shared/schema";
import type { PressMatchResult } from "@shared/pressMatch";

type PartnerRow = { id: string; name: string };

// Inline assign flow — verbatim behavior from the old AdminPressMatch
// AssignPicker: search artists + labels, PATCH the invited-press pointer.
function AssignPicker({
  pressId,
  pressName,
  onDone,
}: {
  pressId: string;
  pressName: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const { data: people = [] } = useQuery<PartnerRow[]>({ queryKey: ["/api/people"] });
  const { data: labels = [] } = useQuery<PartnerRow[]>({ queryKey: ["/api/labels"] });

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as { kind: "people" | "labels"; id: string; name: string }[];
    const tag = (rows: PartnerRow[], kind: "people" | "labels") =>
      rows
        .filter((r) => r.name?.toLowerCase().includes(q))
        .map((r) => ({ kind, id: r.id, name: r.name }));
    return [...tag(people, "people"), ...tag(labels, "labels")].slice(0, 8);
  }, [query, people, labels]);

  const assign = useMutation({
    mutationFn: async (target: { kind: "people" | "labels"; id: string }) => {
      await apiRequest("PATCH", `/api/admin/${target.kind}/${target.id}/invited-press`, { pressId });
    },
    onSuccess: (_d, target) => {
      queryClient.invalidateQueries({ queryKey: [target.kind === "people" ? "/api/people" : "/api/labels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/albums"] });
      toast({ title: `Assigned ${pressName}`, description: "Their Sell panel is now locked to this press until first sale." });
      onDone();
    },
    onError: (e: any) =>
      toast({ title: "Couldn't assign press", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="mb-3 rounded-xl border border-[var(--apple-hairline)] bg-[var(--apple-track)] p-3" data-testid="assign-picker">
      <div className="mb-2 text-xs font-medium text-[var(--apple-subink)]">
        Assign {pressName} to an artist or label
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--apple-faint)]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search artists & labels…"
          className="w-full rounded-md border border-[var(--apple-hairline)] bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-[color:var(--brand-blue)]"
          data-testid="input-assign-search"
        />
      </div>
      {query.trim() && (
        <div className="mt-2 divide-y divide-[var(--apple-hairline)] overflow-hidden rounded-md border border-[var(--apple-hairline)] bg-white">
          {matches.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-[var(--apple-faint)]">No artists or labels match.</div>
          ) : (
            matches.map((m) => (
              <button
                key={`${m.kind}-${m.id}`}
                disabled={assign.isPending}
                onClick={() => assign.mutate({ kind: m.kind, id: m.id })}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-[var(--apple-track)] transition-colors disabled:opacity-50"
                data-testid={`assign-target-${m.id}`}
              >
                <span className="text-[var(--apple-ink)]">{m.name}</span>
                <span className="flex items-center gap-1 text-xs uppercase tracking-wide text-[var(--apple-faint)]">
                  {m.kind === "people" ? "Artist" : "Label"}
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Short fit note per handoff ("Presses this color · closest to spec"):
// the active factors' notes, most interesting first.
function fitNote(r: PressMatchResult): string {
  const bits: string[] = [];
  if (r.factors.color.active && r.colorMatch) bits.push(`${r.colorMatch.name} (${r.colorMatch.kind} match)`);
  bits.push(r.factors.price.note);
  if (r.factors.turnaround.active) bits.push(r.factors.turnaround.note);
  if (r.factors.location.active) bits.push(r.factors.location.note);
  return bits.filter((b) => b && b !== "—").join(" · ");
}

function SpecField({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block whitespace-nowrap text-[11.5px] font-medium text-[var(--apple-faint)]">
        {label}
        {optional && <span className="font-normal opacity-70"> · optional</span>}
      </span>
      <span className="flex h-9 items-center rounded-[10px] bg-[var(--apple-track)] px-3">
        {children}
      </span>
    </label>
  );
}

const specInputClass =
  "w-full min-w-0 flex-1 bg-transparent text-[13px] text-[var(--apple-ink)] outline-none placeholder:text-[var(--apple-faint)]";

export function FindAPressModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [format, setFormat] = useState<AlbumFormat>("12_lp");
  const [quantity, setQuantity] = useState("500");
  const [color, setColor] = useState("");
  const [preferredLocation, setPreferredLocation] = useState("");
  const [maxTurnaroundWeeks, setMaxTurnaroundWeeks] = useState("");
  const [results, setResults] = useState<PressMatchResult[] | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const search = useMutation({
    mutationFn: async () => {
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty < 1) throw new Error("Enter a quantity of at least 1");
      const res = await apiRequest("POST", "/api/admin/press-match", {
        format,
        color: color.trim() || null,
        quantity: qty,
        preferredLocation: preferredLocation.trim() || null,
        maxTurnaroundWeeks: maxTurnaroundWeeks.trim() ? Number(maxTurnaroundWeeks) : null,
      });
      return (await res.json()) as { results: PressMatchResult[] };
    },
    onSuccess: (data) => {
      setResults(data.results);
      setAssigningId(null);
    },
    onError: (e: any) => toast({ title: "Search failed", description: e?.message, variant: "destructive" }),
  });

  if (!open) return null;

  const matching = (results ?? []).filter((r) => r.matches);
  const nonMatching = (results ?? []).filter((r) => !r.matches);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
      data-testid="backdrop-find-a-press"
      role="dialog"
      aria-modal="true"
      aria-label="Find a press"
    >
      <div
        className="max-h-[85vh] w-[620px] max-w-full overflow-y-auto rounded-[20px] border border-[var(--apple-hairline)] bg-white p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="modal-find-a-press"
      >
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--apple-ink)]">
          Find a press. <span className="font-normal text-[var(--apple-subink)]">Spec first, ranked by fit.</span>
        </h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            search.mutate();
          }}
          className="mt-5 grid gap-x-4 gap-y-4"
          style={{ gridTemplateColumns: "minmax(0,1.1fr) minmax(0,0.7fr) minmax(0,1.2fr)" }}
        >
          <SpecField label="Format">
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as AlbumFormat)}
              className={`${specInputClass} appearance-none`}
              data-testid="select-format"
            >
              {ALBUM_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {ALBUM_FORMAT_LABEL[f]}
                </option>
              ))}
            </select>
          </SpecField>
          <SpecField label="Quantity">
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={specInputClass}
              data-testid="input-quantity"
            />
          </SpecField>
          <SpecField label="Color" optional>
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="e.g. translucent blue"
              className={specInputClass}
              data-testid="input-color"
            />
          </SpecField>
          <SpecField label="Preferred location" optional>
            <input
              value={preferredLocation}
              onChange={(e) => setPreferredLocation(e.target.value)}
              placeholder="e.g. Tennessee, USA"
              className={specInputClass}
              data-testid="input-location"
            />
          </SpecField>
          <SpecField label="Max turnaround" optional>
            <input
              type="number"
              min={1}
              value={maxTurnaroundWeeks}
              onChange={(e) => setMaxTurnaroundWeeks(e.target.value)}
              placeholder="weeks"
              className={specInputClass}
              data-testid="input-turnaround"
            />
          </SpecField>
          <div className="flex items-end justify-end">
            {/* Canon: the ONE filled blue pill on screen. */}
            <button
              type="submit"
              disabled={search.isPending}
              className="h-9 rounded-full bg-[var(--apple-blue)] px-6 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              data-testid="button-find-presses"
            >
              {search.isPending ? "Searching…" : "Find presses"}
            </button>
          </div>
        </form>

        {/* Ranked results — hairline list, not boxes */}
        {results !== null && (
          <div className="mt-6 border-t border-[var(--apple-hairline)] pt-1">
            {matching.length === 0 ? (
              <div className="py-6 text-center" data-testid="empty-state">
                <div className="text-[13.5px] font-medium text-[var(--apple-ink)]">
                  No press can make this exact spec
                </div>
                <div className="mx-auto mt-1 max-w-md text-[12px] text-[var(--apple-subink)]">
                  No press in the catalog lists <span className="font-medium">{ALBUM_FORMAT_LABEL[format]}</span>
                  {color.trim() ? (
                    <>
                      {" "}in <span className="font-medium">{color.trim()}</span>
                    </>
                  ) : null}
                  . Try widening the color.
                </div>
              </div>
            ) : (
              matching.map((r, i) => (
                <div
                  key={r.pressId}
                  className={i < matching.length - 1 || assigningId === r.pressId ? "border-b border-[var(--apple-hairline)]" : undefined}
                >
                  <div className="flex items-center gap-4 py-3.5" data-testid={`result-${r.pressId}`}>
                    <span className="w-4 flex-shrink-0 text-right text-[12.5px] tabular-nums text-[var(--apple-faint)]">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-[var(--apple-ink)]" data-testid={`result-name-${r.pressId}`}>
                        {r.name}
                        {i === 0 && (
                          // Canon: "Best match" = dot + label, never color alone.
                          <span className="ml-2.5 inline-flex items-center gap-1.5 align-middle text-[11px] font-medium text-[var(--apple-blue)]" data-testid="badge-best-match">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--apple-blue)]" />
                            Best match
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-[var(--apple-faint)]" title={fitNote(r)}>
                        {fitNote(r)}
                      </p>
                    </div>
                    <span className="flex-shrink-0 text-[12.5px] tabular-nums text-[var(--apple-subink)]">
                      {pressTurnaroundLabel(r) ?? "—"}
                    </span>
                    <span className="min-w-[84px] flex-shrink-0 whitespace-nowrap text-right text-[13px] font-semibold tabular-nums text-[var(--apple-ink)]" data-testid={`result-price-${r.pressId}`}>
                      {r.unitCents != null ? `${formatUsdCents(r.unitCents)} / unit` : "Quote"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAssigningId((cur) => (cur === r.pressId ? null : r.pressId))}
                      className="flex-shrink-0 text-[12.5px] font-medium text-[var(--apple-blue)] transition-opacity hover:opacity-80"
                      data-testid={`button-assign-${r.pressId}`}
                    >
                      Invite to bid
                    </button>
                  </div>
                  {assigningId === r.pressId && (
                    <AssignPicker pressId={r.pressId} pressName={r.name} onDone={() => setAssigningId(null)} />
                  )}
                </div>
              ))
            )}

            {nonMatching.length > 0 && (
              <div className="mt-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-faint)]">
                  Didn't match ({nonMatching.length})
                </div>
                {nonMatching.map((r) => (
                  <div
                    key={r.pressId}
                    className="flex items-center justify-between gap-3 py-2"
                    data-testid={`nonmatch-${r.pressId}`}
                  >
                    <span className="truncate text-[12.5px] font-medium text-[var(--apple-subink)]">{r.name}</span>
                    <span className="flex-shrink-0 text-[11.5px] text-[var(--apple-faint)]">{r.failedHard.join(" · ")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="mt-3.5 text-[11.5px] text-[var(--apple-faint)]">
          Ranked by fit — price, color, turnaround and location.
        </p>
      </div>
    </div>
  );
}
