// Task #2109 — Confirm a completed PDF template matches the press specs.
//
// Mounted in the Press tab of AdminAlbum, BELOW the upload-preflight
// surfaces. Where UploadValidationsPanel checks a single source file
// against a plant template, this surface confirms a FINISHED, print-ready
// release: the operator picks the product configuration (size / discs /
// jacket / inner sleeves / label color), the server derives the SET of
// print components that release must supply (jacket × 1, center labels,
// one printed inner sleeve per disc), and the operator pastes a share
// link (Dropbox etc.) per component. The server streams the (350–530MB)
// file through a bounded-memory scanner and runs the finished-template
// checks (EXACT artboard size, page/face count, CMYK/PMS, fonts
// outlined/embedded, dieline advisory) and we roll the whole thing up
// into one "Ready to send to [vendor]" verdict that persists with the
// release. A failing/warning component can be overridden with a
// justification (legit gatefold variants etc.).
//
// Operator surface → light admin slate chrome (never the fan navy).
// Input is paste-a-URL, NOT multipart upload: real finished files exceed
// the 200MB upload cap and arrive as share links.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, AlertTriangle, X, Lock, Send, AlertCircle, Loader2, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VENDOR_SPECS, defaultCompletedTemplateConfig, type VendorId, type CompletedTemplateConfig, type JacketKind, type InnerSleeveKind, type LabelColorKind, type VinylSize, type FinishedComponentSpec } from "@shared/vendorSpecs";
import type { CompletedTemplateComponent, CompletedTemplateVerdict, CheckStatus } from "@shared/uploadValidation";

type CompletedTemplateResponse = {
  configured: boolean;
  vendorId: VendorId | null;
  config: CompletedTemplateConfig;
  requiredComponents: FinishedComponentSpec[];
  components: CompletedTemplateComponent[];
  status: CompletedTemplateVerdict;
  updatedAt: string | null;
};

const STATUS_STYLE: Record<CheckStatus, { ring: string; text: string; bg: string; label: string }> = {
  pass: { ring: "ring-emerald-200", text: "text-emerald-700", bg: "bg-emerald-50", label: "Pass" },
  warn: { ring: "ring-amber-200", text: "text-amber-700", bg: "bg-amber-50", label: "Warn" },
  fail: { ring: "ring-rose-200", text: "text-rose-700", bg: "bg-rose-50", label: "Fail" },
};

function StatusIcon({ s, className = "w-3.5 h-3.5" }: { s: CheckStatus; className?: string }) {
  if (s === "pass") return <Check className={className} />;
  if (s === "warn") return <AlertTriangle className={className} />;
  return <X className={className} />;
}

const JACKET_OPTIONS: { value: JacketKind; label: string }[] = [
  { value: "single", label: "Single jacket" },
  { value: "gatefold", label: "Gatefold" },
  { value: "gatefold_oldstyle", label: "Gatefold (old-style tip-on)" },
  { value: "widespine", label: "Widespine" },
];
const INNER_SLEEVE_OPTIONS: { value: InnerSleeveKind; label: string }[] = [
  { value: "none", label: "None / plain" },
  { value: "printed", label: "Printed (one per disc)" },
  { value: "generic", label: "Generic (no art)" },
];
const LABEL_COLOR_OPTIONS: { value: LabelColorKind; label: string }[] = [
  { value: "process-4c", label: "4-color process (CMYK)" },
  { value: "spot-1c", label: "Spot / PMS" },
  { value: "none", label: "No printed labels" },
];

function sameConfig(a: CompletedTemplateConfig, b: CompletedTemplateConfig): boolean {
  return a.size === b.size && a.discs === b.discs && a.jacket === b.jacket && a.innerSleeves === b.innerSleeves && a.labelColor === b.labelColor;
}

export function CompletedTemplatePanel({ albumId, vendor }: { albumId: string; vendor: VendorId }) {
  const { toast } = useToast();
  const vendorLabel = VENDOR_SPECS[vendor]?.label ?? vendor.toUpperCase();

  const query = useQuery<CompletedTemplateResponse>({
    queryKey: ["/api/admin/albums", albumId, "completed-template"],
  });

  // Local config state seeds from the persisted row once it loads.
  const [config, setConfig] = useState<CompletedTemplateConfig | null>(null);
  useEffect(() => {
    if (query.data && config === null) setConfig(query.data.config);
  }, [query.data, config]);

  const data = query.data;
  const serverConfig = data?.config ?? null;
  const dirty = !!config && !!serverConfig && !sameConfig(config, serverConfig);
  const configured = !!data?.configured;

  const saveConfig = useMutation({
    mutationFn: async (c: CompletedTemplateConfig) => {
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/completed-template/config`, { vendorId: vendor, config: c });
      return r.json() as Promise<CompletedTemplateResponse>;
    },
    onSuccess: (resp) => {
      queryClient.setQueryData(["/api/admin/albums", albumId, "completed-template"], resp);
      setConfig(resp.config);
    },
    onError: (e: any) => toast({ title: "Couldn't update configuration", description: e?.message, variant: "destructive" }),
  });

  const required = data?.requiredComponents ?? [];
  const components = data?.components ?? [];
  const byId = useMemo(() => new Map(components.map((c) => [c.componentId, c])), [components]);
  const extras = components.filter((c) => c.presence === "extra");

  // Roll-up tallies for the verdict banner copy.
  const blockers = required.filter((spec) => {
    const c = byId.get(spec.id);
    if (c?.override) return false;
    if (!c || c.presence === "missing") return true;
    return c.status === "fail" || c.status == null;
  }).length;
  const advisories =
    required.filter((spec) => {
      const c = byId.get(spec.id);
      return !!c && (c.override != null || c.status === "warn");
    }).length + extras.length;

  const verdict: CompletedTemplateVerdict = data?.status ?? "empty";

  return (
    <div className="mb-10" data-testid="panel-completed-template">
      <h2 className="text-base font-semibold text-slate-900 mb-1">Confirm finished templates</h2>
      <p className="text-sm text-slate-500 mb-4">
        Confirm the finished, print-ready files match {vendorLabel}'s specs before you send the job. Pick the package, then
        paste a share link (Dropbox etc.) for each required component — the file is scanned in place, never uploaded. A
        failing component blocks the send; an admin can override with a justification for a legit variant.
      </p>

      {/* ── Configuration picker ─────────────────────────────────────── */}
      <div className="rounded-md border border-slate-200 bg-white p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-600">
            Record size
            <select
              value={config?.size ?? '12"'}
              onChange={(e) => setConfig((c) => ({ ...(c ?? data?.config ?? defaultCompletedTemplateConfig()), size: e.target.value as VinylSize }))}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
              data-testid="select-completed-size"
            >
              <option value={'7"'}>7"</option>
              <option value={'10"'}>10"</option>
              <option value={'12"'}>12"</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Discs in package
            <select
              value={config?.discs ?? 1}
              onChange={(e) => setConfig((c) => ({ ...(c ?? data?.config ?? defaultCompletedTemplateConfig()), discs: Number(e.target.value) }))}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
              data-testid="select-completed-discs"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n === 1 ? "1 (single LP)" : `${n} discs`}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Jacket
            <select
              value={config?.jacket ?? "single"}
              onChange={(e) => setConfig((c) => ({ ...(c ?? data?.config ?? defaultCompletedTemplateConfig()), jacket: e.target.value as JacketKind }))}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
              data-testid="select-completed-jacket"
            >
              {JACKET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Inner sleeves
            <select
              value={config?.innerSleeves ?? "none"}
              onChange={(e) => setConfig((c) => ({ ...(c ?? data?.config ?? defaultCompletedTemplateConfig()), innerSleeves: e.target.value as InnerSleeveKind }))}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
              data-testid="select-completed-inner-sleeves"
            >
              {INNER_SLEEVE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600 col-span-2">
            Center labels
            <select
              value={config?.labelColor ?? "process-4c"}
              onChange={(e) => setConfig((c) => ({ ...(c ?? data?.config ?? defaultCompletedTemplateConfig()), labelColor: e.target.value as LabelColorKind }))}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
              data-testid="select-completed-label-color"
            >
              {LABEL_COLOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        {(!configured || dirty) && (
          <button
            type="button"
            onClick={() => config && saveConfig.mutate(config)}
            disabled={saveConfig.isPending || !config}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--brand-blue)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            data-testid="button-completed-set-config"
          >
            {saveConfig.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {configured ? "Update package" : "Start confirmation"}
          </button>
        )}
      </div>

      {query.isLoading && <div className="mt-4 text-sm text-slate-500">Loading…</div>}

      {/* ── Verdict + required components ─────────────────────────────── */}
      {configured && (
        <div className="mt-4 space-y-4">
          <VerdictBanner verdict={verdict} vendorLabel={vendorLabel} blockers={blockers} advisories={advisories} />

          <div className="space-y-2">
            {required.map((spec) => (
              <ComponentRow
                key={spec.id}
                albumId={albumId}
                spec={spec}
                component={byId.get(spec.id) ?? null}
              />
            ))}
          </div>

          {extras.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-amber-700">Files not matched to a required component</div>
              {extras.map((c) => (
                <ComponentRow key={c.componentId} albumId={albumId} spec={null} component={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VerdictBanner({ verdict, vendorLabel, blockers, advisories }: { verdict: CompletedTemplateVerdict; vendorLabel: string; blockers: number; advisories: number }) {
  if (verdict === "ready") {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2" data-testid="banner-completed-verdict">
        <Send className="w-4 h-4 text-emerald-700 shrink-0" />
        <div className="text-sm font-semibold text-emerald-900">Ready to send to {vendorLabel}</div>
      </div>
    );
  }
  if (verdict === "warnings") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 flex items-center gap-2" data-testid="banner-completed-verdict">
        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
        <div className="text-sm font-semibold text-amber-900">
          Ready to send to {vendorLabel} · {advisories} {advisories === 1 ? "advisory" : "advisories"}
        </div>
      </div>
    );
  }
  if (verdict === "blocked") {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-3 flex items-center gap-2" data-testid="banner-completed-verdict">
        <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
        <div className="text-sm font-semibold text-rose-900">
          Not ready to send · {blockers} {blockers === 1 ? "blocker" : "blockers"}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500" data-testid="banner-completed-verdict">
      Paste a share link for each required component to begin.
    </div>
  );
}

function ComponentRow({ albumId, spec, component }: { albumId: string; spec: FinishedComponentSpec | null; component: CompletedTemplateComponent | null }) {
  const { toast } = useToast();
  const componentId = spec?.id ?? component!.componentId;
  const label = spec?.label ?? component?.label ?? componentId;
  const present = component && component.presence !== "missing";
  const status: CheckStatus | null = component?.status ?? null;
  const [url, setUrl] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [justification, setJustification] = useState("");

  const check = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/completed-template/check`, { componentId, url: url.trim() });
      return r.json() as Promise<CompletedTemplateResponse>;
    },
    onSuccess: (resp) => {
      queryClient.setQueryData(["/api/admin/albums", albumId, "completed-template"], resp);
      setUrl("");
      const c = resp.components.find((x) => x.componentId === componentId);
      toast({ title: `Checked ${label}`, description: c ? `${c.checks.length} check(s) — ${c.status ?? "?"}` : "Done." });
    },
    onError: (e: any) => toast({ title: "Check failed", description: e?.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/completed-template/remove`, { componentId });
      return r.json() as Promise<CompletedTemplateResponse>;
    },
    onSuccess: (resp) => {
      queryClient.setQueryData(["/api/admin/albums", albumId, "completed-template"], resp);
      toast({ title: "File removed" });
    },
    onError: (e: any) => toast({ title: "Couldn't remove", description: e?.message, variant: "destructive" }),
  });

  const override = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/completed-template/override`, { componentId, justification: justification.trim() });
      return r.json() as Promise<CompletedTemplateResponse>;
    },
    onSuccess: (resp) => {
      queryClient.setQueryData(["/api/admin/albums", albumId, "completed-template"], resp);
      setOverrideOpen(false);
      setJustification("");
      toast({ title: "Override saved" });
    },
    onError: (e: any) => toast({ title: "Couldn't save override", description: e?.message, variant: "destructive" }),
  });

  const sty = status ? STATUS_STYLE[status] : null;
  const ring = component?.override ? "ring-violet-200" : sty ? sty.ring : present ? "ring-slate-200" : "ring-amber-200";
  const canOverride = !!component && (status === "fail" || status === "warn") && !component.override;

  return (
    <div className={`rounded-md border border-slate-200 bg-white p-3 ring-1 ${ring}`} data-testid={`row-completed-${componentId}`}>
      <div className="flex items-center gap-2">
        {component?.override ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-700 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">
            <Lock className="w-3 h-3" /> Override
          </span>
        ) : sty ? (
          <span className={`inline-flex items-center gap-1 rounded-full ${sty.bg} ${sty.text} px-2 py-0.5 text-xs font-semibold uppercase tracking-wider`}>
            <StatusIcon s={status!} /> {sty.label}
          </span>
        ) : present ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">Checking…</span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">Missing</span>
        )}
        <span className="text-sm font-medium text-slate-800 flex-1 truncate" data-testid={`text-completed-label-${componentId}`}>{label}</span>
        {spec && (
          <span className="text-xs text-slate-400">
            {spec.expectedPages} {spec.expectedPages === 1 ? "page" : "pages"} · {spec.color === "process-4c" ? "4-color" : "CMYK/PMS"}
          </span>
        )}
      </div>

      {/* Required-spec hint (before a file is supplied). */}
      {spec && !present && (
        <div className="mt-1 text-xs text-slate-500">
          {spec.templatePageInches
            ? <>Artboard must be exactly {spec.templatePageInches.w}″ × {spec.templatePageInches.h}″.</>
            : <>No vendor template on file — checked against computed {spec.finishedInches.w}″ × {spec.finishedInches.h}″ + {spec.bleedInches}″ bleed (advisory).</>}
        </div>
      )}

      {/* Present file + checks. */}
      {present && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="truncate flex-1" data-testid={`text-completed-file-${componentId}`}>{component!.fileName ?? component!.assetUrl}</span>
            <button
              type="button"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              className="inline-flex items-center gap-1 text-slate-500 hover:text-rose-700 disabled:opacity-50"
              data-testid={`button-completed-remove-${componentId}`}
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
          {component!.checks.map((c) => {
            const cs = STATUS_STYLE[c.status];
            return (
              <div key={c.key} className="flex items-start gap-2 text-xs" data-testid={`check-completed-${componentId}-${c.key}`}>
                <span className={`mt-0.5 inline-flex items-center justify-center rounded-full ${cs.bg} ${cs.text} w-4 h-4`}>
                  <StatusIcon s={c.status} className="w-2.5 h-2.5" />
                </span>
                <div className="flex-1">
                  <div className="font-medium text-slate-800">{c.label}</div>
                  <div className="text-slate-500">{c.message}</div>
                </div>
              </div>
            );
          })}

          {component!.override && (
            <div className="mt-2 rounded-md bg-violet-50 border border-violet-100 p-2 text-xs text-violet-800">
              <span className="font-semibold">Overridden</span>
              {component!.override.byDisplayName ? ` by ${component!.override.byDisplayName}` : ""} — {component!.override.justification}
            </div>
          )}

          {canOverride && !overrideOpen && (
            <button
              type="button"
              onClick={() => setOverrideOpen(true)}
              className="text-xs font-semibold text-[var(--brand-blue)] hover:underline"
              data-testid={`button-completed-override-open-${componentId}`}
            >
              Override with justification
            </button>
          )}
          {overrideOpen && (
            <div className="mt-2 space-y-2">
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={2}
                placeholder="Why is this safe to send despite the check? (≥ 8 chars)"
                className="block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
                data-testid={`input-completed-justification-${componentId}`}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => override.mutate()}
                  disabled={override.isPending || justification.trim().length < 8}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-violet-600 text-white text-xs font-semibold hover:brightness-110 disabled:opacity-50"
                  data-testid={`button-completed-override-save-${componentId}`}
                >
                  {override.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Save override
                </button>
                <button
                  type="button"
                  onClick={() => { setOverrideOpen(false); setJustification(""); }}
                  className="text-xs text-slate-500 hover:text-slate-700"
                  data-testid={`button-completed-override-cancel-${componentId}`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Paste-a-URL for a not-yet-supplied required slot, or replace. */}
      {spec && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={present ? "Paste a new share link to replace…" : "Paste the print-ready file's share link (https://…)"}
            className="block flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
            data-testid={`input-completed-url-${componentId}`}
          />
          <button
            type="button"
            onClick={() => check.mutate()}
            disabled={check.isPending || url.trim().length === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[var(--brand-blue)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50"
            data-testid={`button-completed-check-${componentId}`}
          >
            {check.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {check.isPending ? "Scanning…" : present ? "Re-check" : "Check"}
          </button>
        </div>
      )}

      {/* Extra (unmatched) file controls. */}
      {!spec && component && (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <span className="flex-1 truncate">{component.fileName ?? component.assetUrl}</span>
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="inline-flex items-center gap-1 text-slate-500 hover:text-rose-700 disabled:opacity-50"
            data-testid={`button-completed-remove-${componentId}`}
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove
          </button>
        </div>
      )}
    </div>
  );
}
