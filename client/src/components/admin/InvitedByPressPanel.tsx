import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, Lock, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Task #199 — Super-admin override for the "invited by press" stamp
// that the press-invite flow writes onto people / labels. Hidden to
// everyone but super_admin (a label/artist partner has no reason to
// see or touch it — the lock is on their Sell-panel side). Renders a
// quiet read-only line for non-super viewers when a press is set, so
// the audit trail is still visible.

type Manufacturer = {
  id: string;
  name: string;
  logoUrl: string | null;
  // Optional raster identity icon (logo policy Aug 10 2026) — preferred on
  // identification chips; falls back to the SVG logoUrl.
  identityIconUrl?: string | null;
};

type RoleInfo = { role: string; roleScopeId: string | null };

export function InvitedByPressPanel({
  kind,
  id,
  currentPressId,
  currentPressMode,
  onChanged,
}: {
  kind: "people" | "labels";
  id: string;
  currentPressId: string | null;
  // Task #736 — stored press mode for this entity. null = inherit (the
  // resolver falls to the label, then "dedicated"); the toggle below
  // surfaces the effective default ("dedicated") when null.
  currentPressMode?: string | null;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: role } = useQuery<RoleInfo>({ queryKey: ["/api/me/role"] });
  const isSuperAdmin = role?.role === "super_admin";

  // Task #736 — press mode (Dedicated vs All Presses). Hidden from
  // partners; only super-admins flip it. Writing always persists a
  // non-null value, so an artist's choice wins over its label.
  const effectiveMode: "dedicated" | "all" =
    currentPressMode === "all" ? "all" : "dedicated";
  const setMode = useMutation({
    mutationFn: async (mode: "dedicated" | "all") => {
      await apiRequest("PATCH", `/api/admin/${kind}/${id}/press-mode`, { mode });
    },
    onSuccess: () => {
      const partnerKey = kind === "people" ? "/api/people" : "/api/labels";
      qc.invalidateQueries({ queryKey: [partnerKey, id] });
      qc.invalidateQueries({ queryKey: [partnerKey] });
      // Task #736 — the admin Person page reads from the admin query key
      // (not the public one), so the open page only refetches the saved
      // mode — keeping the highlighted segment in sync — when we
      // invalidate the admin key too. Labels read from the public key
      // above, but invalidate the admin key for parity.
      qc.invalidateQueries({ queryKey: [`/api/admin/${kind}`, id] });
      qc.invalidateQueries({ queryKey: ["/api/admin/albums"] });
      onChanged?.();
      toast({ title: "Press mode updated" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't update press mode", description: e?.message, variant: "destructive" }),
  });

  const { data: presses = [] } = useQuery<Manufacturer[]>({
    queryKey: ["/api/manufacturers"],
    enabled: isSuperAdmin || !!currentPressId,
  });

  const current = useMemo(
    () => (currentPressId ? presses.find((p) => p.id === currentPressId) ?? null : null),
    [presses, currentPressId],
  );

  const [selecting, setSelecting] = useState(false);
  const [query, setQuery] = useState("");

  const save = useMutation({
    mutationFn: async (pressId: string | null) => {
      await apiRequest("PATCH", `/api/admin/${kind}/${id}/invited-press`, { pressId });
    },
    onSuccess: () => {
      // Invalidate the partner detail + any album-level invited-press
      // panel that might be sitting open in a sibling tab.
      const partnerKey = kind === "people" ? "/api/people" : "/api/labels";
      qc.invalidateQueries({ queryKey: [partnerKey, id] });
      qc.invalidateQueries({ queryKey: [partnerKey] });
      // Task #1959 — the admin Person page reads from the admin query key
      // (not the public one), so the assigned plant only appears live when
      // we invalidate the admin key too — matching what the press-mode
      // toggle above already does. Labels read from the public key above,
      // but invalidate the admin key for parity.
      qc.invalidateQueries({ queryKey: [`/api/admin/${kind}`, id] });
      qc.invalidateQueries({ queryKey: ["/api/admin/albums"] });
      setSelecting(false);
      setQuery("");
      onChanged?.();
      toast({ title: "Pressing plant updated" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't update", description: e?.message, variant: "destructive" }),
  });

  // When no explicit plant is set, check whether this entity's album SKUs
  // unambiguously resolve to one press — if so, surface a reconciliation note
  // so "No plant set" doesn't silently contradict the album Press panel.
  const { data: skuSummary } = useQuery<{ skuDerivedPressName: string | null }>({
    queryKey: [`/api/admin/${kind}/${id}/sku-press-summary`],
    enabled: isSuperAdmin && !currentPressId,
  });
  const skuDerivedPressName = currentPressId ? null : (skuSummary?.skuDerivedPressName ?? null);

  // Non-super-admins only see the read-only line when a press is set;
  // hide entirely otherwise to keep the partner-side surface clean.
  if (!isSuperAdmin && !current) return null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...presses].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted.slice(0, 50);
    return sorted.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 50);
  }, [presses, query]);

  return (
    <div data-testid="panel-invited-by-press">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-900 inline-flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-slate-400" /> Pressing plant
        </h3>
        {isSuperAdmin && current && !selecting && (
          <button
            type="button"
            onClick={() => save.mutate(null)}
            disabled={save.isPending}
            className="text-[12px] text-slate-500 hover:text-[color:var(--brand-blue)]"
            data-testid="button-clear-invited-press"
          >
            Clear
          </button>
        )}
      </div>
      {current ? (
        <div className="flex items-center gap-3" data-testid="row-current-invited-press">
          {(current.identityIconUrl ?? current.logoUrl) ? (
            <img src={current.identityIconUrl ?? current.logoUrl ?? undefined} alt="" className="w-9 h-9 rounded-md object-cover border border-slate-200" />
          ) : (
            <div
              className="w-9 h-9 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center"
              aria-hidden
            >
              <Factory className="w-4 h-4 text-slate-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div
              className="text-xs font-medium uppercase tracking-wide text-slate-400"
              data-testid="text-invited-press-mode"
            >
              {effectiveMode === "all" ? "All Presses" : "Dedicated press"}
            </div>
            <div className="text-sm font-semibold text-slate-900 truncate" data-testid="text-invited-press-name">
              {current.name}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-[12.5px] text-slate-500" data-testid="text-no-invited-press">
            {skuDerivedPressName
              ? "No plant explicitly set — releases resolve via vinyl pricing (see note below)."
              : "No plant set. Pricing and the Physical tab will use platform defaults."}
          </p>
          {skuDerivedPressName && (
            <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5" data-testid="note-sku-derived-press">
              Releases currently resolve to <span className="font-semibold">{skuDerivedPressName}</span> via their vinyl pricing — set a plant above to make this explicit.
            </p>
          )}
        </div>
      )}
      {isSuperAdmin && (
        <div className="mt-4 pt-3 border-t border-slate-100" data-testid="row-press-mode">
          <div className="text-xs font-medium text-slate-700 mb-1.5">Press mode</div>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            {(["dedicated", "all"] as const).map((m) => {
              const active = effectiveMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => !active && setMode.mutate(m)}
                  disabled={setMode.isPending}
                  className={
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors " +
                    (active
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700")
                  }
                  data-testid={`button-press-mode-${m}`}
                >
                  {m === "dedicated" ? "Dedicated" : "All Presses"}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {effectiveMode === "all"
              ? "Sell panel unlocks the press picker and side-by-side bid comparison."
              : "Sell panel locks to the single resolved plant — no comparison."}
          </p>
        </div>
      )}
      {isSuperAdmin && (
        <div className="mt-3">
          {!selecting ? (
            <button
              type="button"
              onClick={() => setSelecting(true)}
              className="text-[12px] text-[color:var(--brand-blue)] hover:underline"
              data-testid="button-change-invited-press"
            >
              {current ? "Change plant" : "Assign plant"}
            </button>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search plants…"
                  className="flex-1 h-8 rounded-md border border-slate-300 px-2 text-[13px] focus:outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20"
                  data-testid="input-search-invited-press"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelecting(false);
                    setQuery("");
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-700"
                  aria-label="Cancel"
                  data-testid="button-cancel-invited-press"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ul
                className="max-h-60 overflow-auto border border-slate-200 rounded-md divide-y divide-slate-100"
                data-testid="list-press-options"
              >
                {filtered.length === 0 ? (
                  <li className="px-3 py-2 text-[12.5px] text-slate-500">No presses match.</li>
                ) : (
                  filtered.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => save.mutate(p.id)}
                        disabled={save.isPending || p.id === currentPressId}
                        className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
                        data-testid={`option-press-${p.id}`}
                      >
                        {(p.identityIconUrl ?? p.logoUrl) ? (
                          <img src={p.identityIconUrl ?? p.logoUrl ?? undefined} alt="" className="w-6 h-6 rounded object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded bg-slate-100" />
                        )}
                        <span className="flex-1 text-[13px] text-slate-900 truncate">{p.name}</span>
                        {p.id === currentPressId && (
                          <span className="text-[10px] uppercase tracking-wide text-slate-400">current</span>
                        )}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
