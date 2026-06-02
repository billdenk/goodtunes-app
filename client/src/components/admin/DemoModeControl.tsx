import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Layers, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Task #752 — Demo Mode control. Super-admin-only, session-scoped pitch
// switch that lives in the admin header so the on-state is always
// visible while demoing. Off / Demo press (force one chosen plant for
// the operator's view everywhere) / Demo competitive (force "all" — open
// the press picker + side-by-side bids everywhere). The override is
// applied read-only at GET /api/admin/albums/:id/invited-press, so it
// never mutates Live data and exiting demo restores the real view.

type RoleInfo = { role: string; roleScopeId: string | null };
type Manufacturer = { id: string; name: string; logoUrl: string | null };
type DemoMode =
  | { kind: "press"; pressId: string }
  | { kind: "competitive" }
  | null;

export function DemoModeControl() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: role } = useQuery<RoleInfo>({ queryKey: ["/api/me/role"] });
  const isSuperAdmin = role?.role === "super_admin";

  const { data: demoResp } = useQuery<{ demoMode: DemoMode }>({
    queryKey: ["/api/admin/demo-mode"],
    enabled: isSuperAdmin,
  });
  const demo = demoResp?.demoMode ?? null;

  const { data: presses = [] } = useQuery<Manufacturer[]>({
    queryKey: ["/api/manufacturers"],
    enabled: isSuperAdmin,
  });

  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Dismiss the picker on outside-click so it behaves like a popover.
  useEffect(() => {
    if (!picking) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPicking(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [picking]);

  const set = useMutation({
    mutationFn: async (body: {
      mode: "off" | "press" | "competitive";
      pressId?: string;
    }) => {
      await apiRequest("PUT", "/api/admin/demo-mode", body);
    },
    onSuccess: () => {
      // Refresh the demo state itself + every open Sell-panel view (the
      // invited-press queries live under the /api/admin/albums prefix).
      qc.invalidateQueries({ queryKey: ["/api/admin/demo-mode"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/albums"] });
      setPicking(false);
      setQuery("");
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't change demo mode",
        description: e?.message,
        variant: "destructive",
      }),
  });

  const currentPress = useMemo(
    () =>
      demo?.kind === "press"
        ? presses.find((p) => p.id === demo.pressId) ?? null
        : null,
    [demo, presses],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...presses].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted.slice(0, 50);
    return sorted.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 50);
  }, [presses, query]);

  if (!isSuperAdmin) return null;

  const active = !!demo;

  return (
    <div ref={wrapRef} className="relative" data-testid="control-demo-mode">
      {!active ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
            View
          </span>
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-[color:var(--brand-purple)]/40 hover:text-[color:var(--brand-purple)] transition-colors"
            data-testid="button-demo-press"
          >
            <Building2 className="w-4 h-4" />
            Demo press
          </button>
          <button
            type="button"
            onClick={() => set.mutate({ mode: "competitive" })}
            disabled={set.isPending}
            className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-[color:var(--brand-purple)]/40 hover:text-[color:var(--brand-purple)] transition-colors disabled:opacity-50"
            data-testid="button-demo-competitive"
          >
            <Layers className="w-4 h-4" />
            Demo competitive
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span
            className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md border border-[color:var(--brand-purple)]/25 bg-[color:var(--brand-purple)]/10 text-xs font-semibold text-[color:var(--brand-purple)]"
            data-testid="indicator-demo-mode"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--brand-purple)] animate-pulse" />
            {demo?.kind === "press"
              ? `Demo press · ${currentPress?.name ?? "…"}`
              : "Demo competitive"}
          </span>
          <button
            type="button"
            onClick={() => set.mutate({ mode: "off" })}
            disabled={set.isPending}
            className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900 transition-colors disabled:opacity-50"
            data-testid="button-exit-demo"
          >
            <X className="w-4 h-4" />
            Exit demo
          </button>
        </div>
      )}

      {picking && (
        <div
          className="absolute right-0 top-full mt-2 w-72 z-30 rounded-lg border border-slate-200 bg-white shadow-lg p-3"
          data-testid="panel-demo-press-picker"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-slate-700">
              Force a press for your view
            </div>
            <button
              type="button"
              onClick={() => {
                setPicking(false);
                setQuery("");
              }}
              className="text-xs text-slate-400 hover:text-slate-700"
              data-testid="button-cancel-demo-press"
            >
              Cancel
            </button>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search presses…"
            className="w-full h-8 rounded-md border border-slate-300 px-2 text-sm focus:outline-none focus:border-[color:var(--brand-blue)] focus:ring-2 focus:ring-[color:var(--brand-blue)]/20 mb-2"
            data-testid="input-search-demo-press"
          />
          <ul
            className="max-h-60 overflow-auto border border-slate-200 rounded-md divide-y divide-slate-100"
            data-testid="list-demo-press-options"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">
                No presses match.
              </li>
            ) : (
              filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => set.mutate({ mode: "press", pressId: p.id })}
                    disabled={set.isPending}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
                    data-testid={`option-demo-press-${p.id}`}
                  >
                    {p.logoUrl ? (
                      <img
                        src={p.logoUrl}
                        alt=""
                        className="w-6 h-6 rounded object-cover"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded bg-slate-100" />
                    )}
                    <span className="flex-1 text-sm text-slate-900 truncate">
                      {p.name}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <p className="text-xs text-slate-400 mt-2">
            View-only. Nothing you do in demo touches Live data.
          </p>
        </div>
      )}
    </div>
  );
}
