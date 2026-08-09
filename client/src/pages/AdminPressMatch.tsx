// Task #1013 — Find-a-press tool (super-admin).
//
// Operator enters a spec (format + quantity required, optional color,
// preferred location, max turnaround) and gets the presses that can
// fulfill it, ranked + explained. Format/color are hard filters; price,
// color quality, turnaround and location are the soft ranking factors
// (documented weights live in shared/pressMatch.ts). From any matching
// result the operator can assign that press to an artist or label,
// reusing the existing invited-press flow (PATCH /api/admin/{kind}/:id/
// invited-press) — no re-entry of anything.
import { useMemo, useState } from "react";
import { formatUsdCents } from "@shared/money";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { ALBUM_FORMATS, ALBUM_FORMAT_LABEL, type AlbumFormat } from "@shared/schema";
import type { PressMatchResult, FactorScore } from "@shared/pressMatch";
import {
  Radar,
  Search,
  MapPin,
  Clock,
  CircleDollarSign,
  Palette,
  Check,
  ChevronRight,
  Star,
} from "lucide-react";

type RoleInfo = { role: string; roleScopeId: string | null };
type PartnerRow = { id: string; name: string };

const dollars = (c: number) => formatUsdCents(c);

const FACTOR_META: Record<
  keyof PressMatchResult["factors"],
  { label: string; icon: typeof CircleDollarSign }
> = {
  price: { label: "Price", icon: CircleDollarSign },
  color: { label: "Color", icon: Palette },
  turnaround: { label: "Turnaround", icon: Clock },
  location: { label: "Location", icon: MapPin },
};

function ScoreDial({ score }: { score: number }) {
  // Brand-blue ring whose fill tracks the score.
  return (
    <div
      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(var(--brand-blue) ${score * 3.6}deg, var(--apple-track) 0deg)`,
      }}
      data-testid="score-dial"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-[var(--apple-ink)]">
        {score}
      </div>
    </div>
  );
}

function FactorChip({ name, factor }: { name: keyof PressMatchResult["factors"]; factor: FactorScore }) {
  if (!factor.active) return null;
  const meta = FACTOR_META[name];
  const Icon = meta.icon;
  const pct = Math.round(factor.score * 100);
  return (
    <div
      className="flex items-center gap-1.5 rounded-md bg-[var(--apple-track)] px-2 py-1 text-xs text-[var(--apple-subink)]"
      data-testid={`factor-${name}`}
      title={`${meta.label}: ${factor.note}`}
    >
      <Icon className="h-3.5 w-3.5 text-[var(--apple-faint)]" />
      <span className="font-medium text-[var(--apple-ink)]">{meta.label}</span>
      <span className="text-[var(--apple-faint)]">{pct}%</span>
      <span className="truncate max-w-[180px]">· {factor.note}</span>
    </div>
  );
}

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
    <div className="mt-3 rounded-xl border border-[var(--apple-hairline)] bg-[var(--apple-track)] p-3" data-testid="assign-picker">
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

function ResultCard({ result, rank }: { result: PressMatchResult; rank: number }) {
  const [assigning, setAssigning] = useState(false);
  return (
    <div
      className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-4"
      data-testid={`result-${result.pressId}`}
    >
      <div className="flex items-start gap-3">
        <ScoreDial score={result.score} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {rank === 1 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--brand-blue)] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                <Star className="h-3 w-3" /> Best match
              </span>
            )}
            {result.logoUrl && (
              <img src={result.logoUrl} alt="" className="h-5 w-5 rounded object-contain" />
            )}
            <span className="truncate text-base font-semibold text-[var(--apple-ink)]" data-testid={`result-name-${result.pressId}`}>
              {result.name}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-[var(--apple-subink)]">
            {result.tierName ? <span>{result.tierName}</span> : null}
            {result.colorMatch ? (
              <span className="ml-1 inline-flex items-center gap-1">
                ·
                {result.colorMatch.swatchHex && (
                  <span
                    className="inline-block h-3 w-3 rounded-full border border-[var(--apple-hairline)] align-middle"
                    style={{ backgroundColor: result.colorMatch.swatchHex }}
                  />
                )}
                {result.colorMatch.name}
              </span>
            ) : null}
            {result.location ? <span className="ml-1">· {result.location}</span> : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {result.unitCents != null ? (
            <>
              <div className="text-base font-bold text-[var(--apple-ink)]" data-testid={`result-price-${result.pressId}`}>
                {dollars(result.unitCents)}
              </div>
              <div className="text-xs text-[var(--apple-faint)]">/unit at {result.snappedQty}</div>
              {result.requiresQuote && (
                <div className="text-xs text-amber-600">custom quote</div>
              )}
            </>
          ) : (
            <div className="text-xs font-medium text-amber-600">Needs a quote</div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <FactorChip name="price" factor={result.factors.price} />
        <FactorChip name="color" factor={result.factors.color} />
        <FactorChip name="turnaround" factor={result.factors.turnaround} />
        <FactorChip name="location" factor={result.factors.location} />
      </div>

      <div className="mt-3 flex justify-end">
        {!assigning ? (
          <button
            onClick={() => setAssigning(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--apple-blue)] hover:bg-[var(--apple-blue)]/10 transition-colors"
            data-testid={`button-assign-${result.pressId}`}
          >
            <Check className="h-3.5 w-3.5" /> Assign this press
          </button>
        ) : null}
      </div>
      {assigning && (
        <AssignPicker pressId={result.pressId} pressName={result.name} onDone={() => setAssigning(false)} />
      )}
    </div>
  );
}

export function AdminPressMatch() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: role, isLoading: roleLoading } = useQuery<RoleInfo>({ queryKey: ["/api/me/role"] });

  const [format, setFormat] = useState<AlbumFormat>("12_lp");
  const [color, setColor] = useState("");
  const [quantity, setQuantity] = useState("500");
  const [preferredLocation, setPreferredLocation] = useState("");
  const [maxTurnaroundWeeks, setMaxTurnaroundWeeks] = useState("");
  const [results, setResults] = useState<PressMatchResult[] | null>(null);

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
    onSuccess: (data) => setResults(data.results),
    onError: (e: any) => toast({ title: "Search failed", description: e?.message, variant: "destructive" }),
  });

  if (roleLoading) {
    return (
      <AdminFrame active="press-match">
        <AdminPageHeader title="Find a press" subtitle="Loading…" />
      </AdminFrame>
    );
  }
  if (!user?.isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
        <p className="text-sm text-slate-500">Admin only.</p>
      </main>
    );
  }
  if (role && role.role !== "super_admin") {
    return (
      <AdminFrame active="press-match">
        <AdminPageHeader title="Find a press" subtitle="Restricted." />
        <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-10 text-center">
          <div className="font-medium text-[var(--apple-ink)]">Super admin only</div>
          <div className="mt-1 text-sm text-[var(--apple-subink)]">Ask a super admin to run a press search.</div>
        </div>
      </AdminFrame>
    );
  }

  const matching = (results ?? []).filter((r) => r.matches);
  const nonMatching = (results ?? []).filter((r) => !r.matches);

  return (
    <AdminFrame active="press-match">
      <div className="space-y-5">
        <AdminPageHeader
          title="Find a press"
          subtitle="Enter a spec and we'll rank the presses that can make it — by price, color, turnaround and location."
        />

        {/* Spec form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            search.mutate();
          }}
          className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--apple-subink)]">Format</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as AlbumFormat)}
                className="w-full rounded-md border border-[var(--apple-hairline)] bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--brand-blue)]"
                data-testid="select-format"
              >
                {ALBUM_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {ALBUM_FORMAT_LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--apple-subink)]">Quantity</span>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-md border border-[var(--apple-hairline)] bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--brand-blue)]"
                data-testid="input-quantity"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--apple-subink)]">
                Color <span className="font-normal text-[var(--apple-faint)]">(optional)</span>
              </span>
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="e.g. gold, translucent blue"
                className="w-full rounded-md border border-[var(--apple-hairline)] bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--brand-blue)]"
                data-testid="input-color"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--apple-subink)]">
                Preferred location <span className="font-normal text-[var(--apple-faint)]">(optional)</span>
              </span>
              <input
                value={preferredLocation}
                onChange={(e) => setPreferredLocation(e.target.value)}
                placeholder="e.g. Tennessee, USA"
                className="w-full rounded-md border border-[var(--apple-hairline)] bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--brand-blue)]"
                data-testid="input-location"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--apple-subink)]">
                Max turnaround (weeks) <span className="font-normal text-[var(--apple-faint)]">(optional)</span>
              </span>
              <input
                type="number"
                min={1}
                value={maxTurnaroundWeeks}
                onChange={(e) => setMaxTurnaroundWeeks(e.target.value)}
                placeholder="e.g. 10"
                className="w-full rounded-md border border-[var(--apple-hairline)] bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--brand-blue)]"
                data-testid="input-turnaround"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={search.isPending}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[var(--apple-blue)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 transition disabled:opacity-60"
                data-testid="button-search"
              >
                <Radar className="h-4 w-4" />
                {search.isPending ? "Searching…" : "Find presses"}
              </button>
            </div>
          </div>
        </form>

        {/* Results */}
        {results !== null && (
          <div className="space-y-4">
            {matching.length > 0 ? (
              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]" data-testid="text-match-count">
                  {matching.length} press{matching.length === 1 ? "" : "es"} can make this
                </div>
                {matching.map((r, i) => (
                  <ResultCard key={r.pressId} result={r} rank={i + 1} />
                ))}
              </div>
            ) : (
              <div
                className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-8 text-center"
                data-testid="empty-state"
              >
                <div className="font-medium text-[var(--apple-ink)]">No press can make this exact spec</div>
                <div className="mx-auto mt-1 max-w-md text-sm text-[var(--apple-subink)]">
                  No press in the catalog lists{" "}
                  <span className="font-medium">{ALBUM_FORMAT_LABEL[format]}</span>
                  {color.trim() ? (
                    <>
                      {" "}in <span className="font-medium">{color.trim()}</span>
                    </>
                  ) : null}
                  . Try widening the color, or check the closest presses below.
                </div>
              </div>
            )}

            {nonMatching.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">
                  Didn't match ({nonMatching.length})
                </div>
                {nonMatching.map((r) => (
                  <div
                    key={r.pressId}
                    className="flex items-center justify-between rounded-xl border border-[var(--apple-hairline)] bg-[var(--apple-track)] px-4 py-2.5"
                    data-testid={`nonmatch-${r.pressId}`}
                  >
                    <span className="text-sm font-medium text-[var(--apple-ink)]">{r.name}</span>
                    <span className="text-xs text-[var(--apple-subink)]">{r.failedHard.join(" · ")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {results === null && (
          <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white">
            <AdminEmptyState>Enter a spec above to rank the presses that can fulfill it.</AdminEmptyState>
          </div>
        )}
      </div>
    </AdminFrame>
  );
}
