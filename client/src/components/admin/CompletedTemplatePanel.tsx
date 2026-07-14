// Task #2109 → rebuilt for Task #2705 — "Completed Art" card grid.
//
// Mounted in the Art sub-tab of AdminAlbum (Physical → Art), below the
// source-art preflight surfaces. One card per print element the chosen
// package needs (Cover/jacket, Center labels, Booklet when the package
// includes one, printed inner sleeve per disc), derived server-side from
// the press's template catalog merged over the measured baseline.
//
// Per card: download the press template, upload the finished press-ready
// PDF (drag-and-drop / file pick within the direct-upload bound, or paste
// a share link for the truly huge ones — the existing streamed scan never
// buffers those), automatic Pass/Fail from the finished-file validator,
// a real first-page thumbnail when the server could rasterize one (honest
// generic PDF tile otherwise — never a fake), a magnifier preview window
// with the full check list + override-with-justification, and hover
// replace / trash. Empty cards show the press's placeholder mark.
//
// Operator surface → light admin slate chrome (never the fan navy).

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Check,
  AlertTriangle,
  X,
  Lock,
  Loader2,
  Trash2,
  Download,
  Upload,
  ZoomIn,
  FileText,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { uploadAdminDoc, DOC_UPLOAD_ACCEPT } from "@/lib/adminUpload";
import {
  VENDOR_SPECS,
  defaultCompletedTemplateConfig,
  type VendorId,
  type CompletedTemplateConfig,
  type JacketKind,
  type InnerSleeveKind,
  type LabelColorKind,
  type VinylSize,
  type FinishedComponentSpec,
} from "@shared/vendorSpecs";
import type {
  CompletedTemplateComponent,
  CompletedTemplateVerdict,
  CheckStatus,
} from "@shared/uploadValidation";

type CompletedTemplateResponse = {
  configured: boolean;
  vendorId: VendorId | null;
  config: CompletedTemplateConfig;
  requiredComponents: FinishedComponentSpec[];
  components: CompletedTemplateComponent[];
  status: CompletedTemplateVerdict;
  updatedAt: string | null;
  pressPlaceholderUrl: string | null;
};

const STATUS_STYLE: Record<CheckStatus, { text: string; bg: string; border: string; label: string }> = {
  pass: { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", label: "PASS" },
  warn: { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", label: "WARN" },
  fail: { text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200", label: "FAIL" },
};

function StatusIcon({ s, className = "w-3 h-3" }: { s: CheckStatus; className?: string }) {
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
  return (
    a.size === b.size &&
    a.discs === b.discs &&
    a.jacket === b.jacket &&
    a.innerSleeves === b.innerSleeves &&
    a.labelColor === b.labelColor &&
    !!a.booklet === !!b.booklet
  );
}

// Friendly card titles per Bill's mocks: "Cover: 7" (no spine)",
// "Center Labels: Disk 1", "Booklet: 16 Pages".
function cardTitle(spec: FinishedComponentSpec, config: CompletedTemplateConfig): string {
  if (spec.id === "jacket") {
    const kind =
      config.jacket === "single"
        ? config.size === '7"'
          ? " (no spine)"
          : ""
        : config.jacket === "gatefold"
          ? " (gatefold)"
          : config.jacket === "gatefold_oldstyle"
            ? " (gatefold tip-on)"
            : " (widespine)";
    return `Cover: ${config.size}${kind}`;
  }
  if (spec.id === "labels") {
    const discs = Math.max(1, Math.floor(Number(config.discs) || 1));
    return discs === 1 ? "Center Labels: Disk 1" : `Center Labels: ${discs} Discs`;
  }
  if (spec.id === "booklet") {
    return spec.expectedPages > 0 ? `Booklet: ${spec.expectedPages} Pages` : "Booklet";
  }
  const m = spec.id.match(/^inner_sleeve_(\d+)$/);
  if (m) {
    const discs = Math.max(1, Math.floor(Number(config.discs) || 1));
    return discs > 1 ? `Inner Sleeve: Disc ${m[1]}` : "Inner Sleeve";
  }
  return spec.label;
}

// Short noun for the bottom-left slot: "View Cover" / magnifier + "Cover".
function cardNoun(spec: FinishedComponentSpec | null, component: CompletedTemplateComponent | null): string {
  const id = spec?.id ?? component?.componentId ?? "";
  if (id === "jacket") return "Cover";
  if (id === "labels") return "Labels";
  if (id === "booklet") return "Booklet";
  const m = id.match(/^inner_sleeve_(\d+)$/);
  if (m) return `Sleeve ${m[1]}`;
  return spec?.label ?? component?.label ?? id;
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
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/completed-template/config`, {
        vendorId: vendor,
        config: c,
      });
      return r.json() as Promise<CompletedTemplateResponse>;
    },
    onSuccess: (resp) => {
      queryClient.setQueryData(["/api/admin/albums", albumId, "completed-template"], resp);
      setConfig(resp.config);
    },
    onError: (e: any) =>
      toast({ title: "Couldn't update configuration", description: e?.message, variant: "destructive" }),
  });

  const required = data?.requiredComponents ?? [];
  const components = data?.components ?? [];
  const byId = useMemo(() => new Map(components.map((c) => [c.componentId, c])), [components]);
  const extras = components.filter((c) => c.presence === "extra");
  const effectiveConfig = serverConfig ?? defaultCompletedTemplateConfig();

  const suppliedFiles = components.filter((c) => c.presence !== "missing" && c.assetUrl);

  // Which card's upload dialog / preview window is open.
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);

  const downloadAll = () => {
    // Client-side anchor loop over every supplied file. Small stagger so
    // browsers don't swallow the later clicks.
    suppliedFiles.forEach((c, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = c.assetUrl!;
        a.download = c.fileName ?? "";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 400);
    });
  };

  const updateConfig = (patch: Partial<CompletedTemplateConfig>) =>
    setConfig((c) => ({ ...(c ?? data?.config ?? defaultCompletedTemplateConfig()), ...patch }));

  const selectCls =
    "mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="mb-10" data-testid="panel-completed-template">
      {/* ── Section header ────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-1">Completed Art</h2>
          <p className="text-sm text-slate-500">
            Download the templates. Then drag and drop the art. The system will automatically validate the files.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadAll}
          disabled={suppliedFiles.length === 0}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-200 bg-white text-sm font-medium text-[var(--brand-blue)] hover:border-slate-300 disabled:text-slate-400 disabled:hover:border-slate-200 shrink-0"
          data-testid="button-download-all-artwork"
        >
          <Download className="w-4 h-4" />
          Download all artwork
        </button>
      </div>

      {/* ── Package configuration ─────────────────────────────────────── */}
      <div className="rounded-md border border-slate-200 bg-white p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="text-xs text-slate-600">
            Record size
            <select
              value={config?.size ?? '12"'}
              onChange={(e) => updateConfig({ size: e.target.value as VinylSize })}
              className={selectCls}
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
              onChange={(e) => updateConfig({ discs: Number(e.target.value) })}
              className={selectCls}
              data-testid="select-completed-discs"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "1 (single LP)" : `${n} discs`}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Jacket
            <select
              value={config?.jacket ?? "single"}
              onChange={(e) => updateConfig({ jacket: e.target.value as JacketKind })}
              className={selectCls}
              data-testid="select-completed-jacket"
            >
              {JACKET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Inner sleeves
            <select
              value={config?.innerSleeves ?? "none"}
              onChange={(e) => updateConfig({ innerSleeves: e.target.value as InnerSleeveKind })}
              className={selectCls}
              data-testid="select-completed-inner-sleeves"
            >
              {INNER_SLEEVE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Center labels
            <select
              value={config?.labelColor ?? "process-4c"}
              onChange={(e) => updateConfig({ labelColor: e.target.value as LabelColorKind })}
              className={selectCls}
              data-testid="select-completed-label-color"
            >
              {LABEL_COLOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Booklet
            <select
              value={config?.booklet ? "yes" : "no"}
              onChange={(e) => updateConfig({ booklet: e.target.value === "yes" })}
              className={selectCls}
              data-testid="select-completed-booklet"
            >
              <option value="no">No booklet</option>
              <option value="yes">Includes booklet</option>
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

      {/* ── Verdict + card grid ───────────────────────────────────────── */}
      {configured && (
        <div className="mt-4 space-y-4">
          <VerdictBanner
            verdict={data?.status ?? "empty"}
            vendorLabel={vendorLabel}
            required={required}
            byId={byId}
            extras={extras}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {required.map((spec) => (
              <ArtCard
                key={spec.id}
                albumId={albumId}
                spec={spec}
                component={byId.get(spec.id) ?? null}
                config={effectiveConfig}
                pressPlaceholderUrl={data?.pressPlaceholderUrl ?? null}
                onUpload={() => setUploadFor(spec.id)}
                onPreview={() => setPreviewFor(spec.id)}
              />
            ))}
          </div>

          {extras.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-amber-700">
                Files not matched to a required component
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {extras.map((c) => (
                  <ArtCard
                    key={c.componentId}
                    albumId={albumId}
                    spec={null}
                    component={c}
                    config={effectiveConfig}
                    pressPlaceholderUrl={data?.pressPlaceholderUrl ?? null}
                    onUpload={() => {}}
                    onPreview={() => setPreviewFor(c.componentId)}
                  />
                ))}
              </div>
            </div>
          )}

          {uploadFor && (
            <UploadArtDialog
              albumId={albumId}
              spec={required.find((s) => s.id === uploadFor) ?? null}
              component={byId.get(uploadFor) ?? null}
              config={effectiveConfig}
              pressPlaceholderUrl={data?.pressPlaceholderUrl ?? null}
              onClose={() => setUploadFor(null)}
            />
          )}

          {previewFor && (
            <PreviewArtDialog
              albumId={albumId}
              spec={required.find((s) => s.id === previewFor) ?? null}
              component={
                byId.get(previewFor) ?? extras.find((c) => c.componentId === previewFor) ?? null
              }
              config={effectiveConfig}
              onClose={() => setPreviewFor(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function VerdictBanner({
  verdict,
  vendorLabel,
  required,
  byId,
  extras,
}: {
  verdict: CompletedTemplateVerdict;
  vendorLabel: string;
  required: FinishedComponentSpec[];
  byId: Map<string, CompletedTemplateComponent>;
  extras: CompletedTemplateComponent[];
}) {
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

  if (verdict === "ready") {
    return (
      <div
        className="rounded-md border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2"
        data-testid="banner-completed-verdict"
      >
        <Check className="w-4 h-4 text-emerald-700 shrink-0" />
        <div className="text-sm font-semibold text-emerald-900">Ready to send to {vendorLabel}</div>
      </div>
    );
  }
  if (verdict === "warnings") {
    return (
      <div
        className="rounded-md border border-amber-200 bg-amber-50 p-3 flex items-center gap-2"
        data-testid="banner-completed-verdict"
      >
        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
        <div className="text-sm font-semibold text-amber-900">
          Ready to send to {vendorLabel} · {advisories} {advisories === 1 ? "advisory" : "advisories"}
        </div>
      </div>
    );
  }
  if (verdict === "blocked") {
    return (
      <div
        className="rounded-md border border-rose-200 bg-rose-50 p-3 flex items-center gap-2"
        data-testid="banner-completed-verdict"
      >
        <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
        <div className="text-sm font-semibold text-rose-900">
          Not ready to send · {blockers} {blockers === 1 ? "blocker" : "blockers"}
        </div>
      </div>
    );
  }
  return (
    <div
      className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500"
      data-testid="banner-completed-verdict"
    >
      Upload or paste a link for each required element to begin.
    </div>
  );
}

// ── One card ──────────────────────────────────────────────────────────
function ArtCard({
  albumId,
  spec,
  component,
  config,
  pressPlaceholderUrl,
  onUpload,
  onPreview,
}: {
  albumId: string;
  spec: FinishedComponentSpec | null;
  component: CompletedTemplateComponent | null;
  config: CompletedTemplateConfig;
  pressPlaceholderUrl: string | null;
  onUpload: () => void;
  onPreview: () => void;
}) {
  const { toast } = useToast();
  const componentId = spec?.id ?? component!.componentId;
  const present = !!component && component.presence !== "missing";
  const status: CheckStatus | null = component?.status ?? null;
  const overridden = !!component?.override;
  const noun = cardNoun(spec, component);
  const isLabels = componentId === "labels";
  const [dragOver, setDragOver] = useState(false);

  const remove = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/completed-template/remove`, {
        componentId,
      });
      return r.json() as Promise<CompletedTemplateResponse>;
    },
    onSuccess: (resp) => {
      queryClient.setQueryData(["/api/admin/albums", albumId, "completed-template"], resp);
      toast({ title: "File removed" });
    },
    onError: (e: any) => toast({ title: "Couldn't remove", description: e?.message, variant: "destructive" }),
  });

  const sty = status ? STATUS_STYLE[status] : null;

  return (
    <div
      className={`rounded-lg border bg-white p-3 flex flex-col ${dragOver ? "border-[color:var(--brand-blue)] ring-1 ring-[color:var(--brand-blue)]" : "border-slate-200"}`}
      onDragOver={(e) => {
        if (!spec) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!spec) return;
        e.preventDefault();
        setDragOver(false);
        onUpload();
      }}
      data-testid={`card-completed-${componentId}`}
    >
      <div
        className="text-sm font-semibold text-slate-900 text-center mb-2 truncate"
        title={spec ? cardTitle(spec, config) : component?.label ?? componentId}
        data-testid={`text-completed-label-${componentId}`}
      >
        {spec ? cardTitle(spec, config) : component?.label ?? componentId}
      </div>

      {/* Art area — thumbnail / generic tile / press placeholder. */}
      <div className="relative group mx-auto w-full">
        <div
          className={`aspect-square w-full overflow-hidden bg-slate-50 border border-slate-100 flex items-center justify-center ${isLabels ? "rounded-full" : "rounded-md"}`}
        >
          {present && component?.previewUrl ? (
            <img
              src={component.previewUrl}
              alt=""
              className="w-full h-full object-contain"
              data-testid={`img-completed-preview-${componentId}`}
            />
          ) : present ? (
            <div className="flex flex-col items-center gap-1.5 text-slate-400 px-2 text-center">
              <FileText className="w-8 h-8" />
              <span className="text-xs truncate max-w-full">
                {component?.fileName ?? "PDF on file"}
              </span>
            </div>
          ) : pressPlaceholderUrl ? (
            <img src={pressPlaceholderUrl} alt="" className="w-3/4 h-3/4 object-contain opacity-60" />
          ) : (
            <FileText className="w-8 h-8 text-slate-300" />
          )}
        </div>

        {/* Hover affordances. */}
        {spec && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={onUpload}
              className="w-14 h-14 rounded-full bg-slate-200/90 hover:bg-slate-300 text-slate-700 inline-flex items-center justify-center shadow-sm"
              title={present ? `Replace ${noun}` : `Upload ${noun}`}
              data-testid={`button-completed-upload-${componentId}`}
            >
              {present ? <RefreshCw className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
            </button>
            {present && (
              <button
                type="button"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="w-10 h-10 rounded-full bg-slate-200/90 hover:bg-rose-100 text-slate-600 hover:text-rose-700 inline-flex items-center justify-center shadow-sm disabled:opacity-50"
                title={`Remove ${noun}`}
                data-testid={`button-completed-remove-${componentId}`}
              >
                {remove.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        )}
        {/* Extra (unmatched) file: trash only. */}
        {!spec && component && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              className="w-10 h-10 rounded-full bg-slate-200/90 hover:bg-rose-100 text-slate-600 hover:text-rose-700 inline-flex items-center justify-center shadow-sm disabled:opacity-50"
              title="Remove file"
              data-testid={`button-completed-remove-${componentId}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Footer: View/magnifier + Template link or PASS/FAIL chip. */}
      <div className="mt-2 flex items-center justify-between gap-2 min-h-[24px]">
        {present ? (
          <button
            type="button"
            onClick={onPreview}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-blue)] hover:underline min-w-0"
            data-testid={`button-completed-view-${componentId}`}
          >
            <ZoomIn className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{noun}</span>
          </button>
        ) : (
          <span className="text-xs text-slate-400 truncate">View {noun}</span>
        )}

        {present ? (
          overridden ? (
            <button
              type="button"
              onClick={onPreview}
              className="inline-flex items-center gap-1 rounded-full bg-violet-50 border border-violet-200 text-violet-700 px-2 py-0.5 text-xs font-bold tracking-wider"
              data-testid={`chip-completed-status-${componentId}`}
            >
              <Lock className="w-2.5 h-2.5" /> OVERRIDE
            </button>
          ) : sty ? (
            <button
              type="button"
              onClick={onPreview}
              className={`inline-flex items-center gap-1 rounded-full ${sty.bg} ${sty.text} border ${sty.border} px-2 py-0.5 text-xs font-bold tracking-wider`}
              data-testid={`chip-completed-status-${componentId}`}
            >
              <StatusIcon s={status!} className="w-2.5 h-2.5" /> {sty.label}
            </button>
          ) : (
            <span
              className="inline-flex items-center rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-xs font-bold tracking-wider"
              data-testid={`chip-completed-status-${componentId}`}
            >
              CHECKING…
            </span>
          )
        ) : spec?.templateFileUrl ? (
          <a
            href={spec.templateFileUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-blue)] hover:underline shrink-0"
            data-testid={`link-completed-template-${componentId}`}
          >
            Template <Download className="w-3.5 h-3.5" />
          </a>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

// ── Upload dialog — current file left, drop/pick + paste-a-URL right ──
function UploadArtDialog({
  albumId,
  spec,
  component,
  config,
  pressPlaceholderUrl,
  onClose,
}: {
  albumId: string;
  spec: FinishedComponentSpec | null;
  component: CompletedTemplateComponent | null;
  config: CompletedTemplateConfig;
  pressPlaceholderUrl: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const componentId = spec?.id ?? component?.componentId ?? "";
  const present = !!component && component.presence !== "missing";
  const title = spec ? cardTitle(spec, config) : component?.label ?? componentId;

  const check = useMutation({
    mutationFn: async (body: { url: string; fileName?: string }) => {
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/completed-template/check`, {
        componentId,
        ...body,
      });
      return r.json() as Promise<CompletedTemplateResponse>;
    },
    onSuccess: (resp) => {
      queryClient.setQueryData(["/api/admin/albums", albumId, "completed-template"], resp);
      const c = resp.components.find((x) => x.componentId === componentId);
      toast({
        title: `Checked ${title}`,
        description: c ? `${c.checks.length} check(s) — ${(c.status ?? "?").toUpperCase()}` : "Done.",
      });
      onClose();
    },
    onError: (e: any) =>
      toast({ title: "Check failed", description: e?.message, variant: "destructive" }),
  });

  const busy = uploading || check.isPending;

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setUploading(true);
    try {
      const url = await uploadAdminDoc(file);
      check.mutate({ url, fileName: file.name });
    } catch (e: any) {
      toast({ title: e?.message || "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-2xl gt-admin bg-white">
        <DialogHeader>
          <DialogTitle className="text-slate-900">{title}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Current file. */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Current file
            </div>
            <div className="aspect-square rounded-md border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
              {present && component?.previewUrl ? (
                <img src={component.previewUrl} alt="" className="w-full h-full object-contain" />
              ) : present ? (
                <div className="flex flex-col items-center gap-1.5 text-slate-400 px-3 text-center">
                  <FileText className="w-8 h-8" />
                  <span className="text-xs truncate max-w-full">{component?.fileName ?? "PDF on file"}</span>
                </div>
              ) : pressPlaceholderUrl ? (
                <img src={pressPlaceholderUrl} alt="" className="w-2/3 h-2/3 object-contain opacity-50" />
              ) : (
                <span className="text-xs text-slate-400">No file yet</span>
              )}
            </div>
          </div>

          {/* Replace / upload zone. */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
              {present ? "Replace file" : "Upload file"}
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void handleFile(e.dataTransfer.files?.[0]);
              }}
              className={`w-full rounded-md border-2 border-dashed px-4 py-8 flex flex-col items-center gap-2 text-center transition-colors ${dragOver ? "border-[color:var(--brand-blue)] bg-[color:var(--brand-blue-soft)]" : "border-slate-200 hover:border-slate-300 bg-white"} disabled:opacity-60`}
              data-testid={`dropzone-completed-${componentId}`}
            >
              {busy ? (
                <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
              ) : (
                <Upload className="w-6 h-6 text-slate-400" />
              )}
              <span className="text-sm font-medium text-slate-700">
                {uploading ? "Uploading…" : check.isPending ? "Scanning…" : "Drag a file here, or click to pick"}
              </span>
              <span className="text-xs text-slate-400">Press-ready PDF · validated automatically</span>
            </button>

            <div className="flex items-center gap-2 my-3">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Or paste a URL
              </span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://… (Dropbox etc. for very large files)"
                className="block flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
                disabled={busy}
                data-testid={`input-completed-url-${componentId}`}
              />
              <button
                type="button"
                onClick={() => urlDraft.trim() && check.mutate({ url: urlDraft.trim() })}
                disabled={busy || urlDraft.trim().length === 0}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[var(--brand-blue)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 shrink-0"
                data-testid={`button-completed-check-${componentId}`}
              >
                {check.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {check.isPending ? "Scanning…" : "Use URL"}
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {spec?.templatePageInches ? (
                <>
                  Artboard must be exactly {spec.templatePageInches.w}″ × {spec.templatePageInches.h}″.
                </>
              ) : spec ? (
                <>
                  Checked against computed {spec.finishedInches.w}″ × {spec.finishedInches.h}″ +{" "}
                  {spec.bleedInches}″ bleed (advisory).
                </>
              ) : null}{" "}
              Pasted share links are scanned in place — the file is never re-hosted.
            </p>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={DOC_UPLOAD_ACCEPT}
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </DialogContent>
    </Dialog>
  );
}

// ── Magnifier preview window — big preview, checks, override, download ─
function PreviewArtDialog({
  albumId,
  spec,
  component,
  config,
  onClose,
}: {
  albumId: string;
  spec: FinishedComponentSpec | null;
  component: CompletedTemplateComponent | null;
  config: CompletedTemplateConfig;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [justification, setJustification] = useState("");
  const componentId = spec?.id ?? component?.componentId ?? "";
  const title = spec ? cardTitle(spec, config) : component?.label ?? componentId;
  const status = component?.status ?? null;

  const override = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/albums/${albumId}/completed-template/override`, {
        componentId,
        justification: justification.trim(),
      });
      return r.json() as Promise<CompletedTemplateResponse>;
    },
    onSuccess: (resp) => {
      queryClient.setQueryData(["/api/admin/albums", albumId, "completed-template"], resp);
      setOverrideOpen(false);
      setJustification("");
      toast({ title: "Override saved" });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't save override", description: e?.message, variant: "destructive" }),
  });

  if (!component) return null;
  const canOverride = (status === "fail" || status === "warn") && !component.override;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl gt-admin bg-white max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle className="text-slate-900">{title}</DialogTitle>
            {component.assetUrl && (
              <a
                href={component.assetUrl}
                download={component.fileName ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-xs font-semibold text-[var(--brand-blue)] hover:border-slate-300 shrink-0"
                data-testid={`button-completed-download-${componentId}`}
              >
                <Download className="w-3.5 h-3.5" /> Download
              </a>
            )}
          </div>
        </DialogHeader>

        <div className="rounded-md border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center min-h-[280px]">
          {component.previewUrl ? (
            <img
              src={component.previewUrl}
              alt=""
              className="max-h-[50vh] w-auto object-contain"
              data-testid={`img-completed-large-${componentId}`}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-400 p-8 text-center">
              <FileText className="w-10 h-10" />
              <span className="text-sm">
                No preview could be produced for this file — download it to inspect the pages.
              </span>
              <span className="text-xs truncate max-w-full">{component.fileName ?? component.assetUrl}</span>
            </div>
          )}
        </div>

        {/* Checks. */}
        <div className="space-y-1.5">
          {component.checks.map((c) => {
            const cs = STATUS_STYLE[c.status];
            return (
              <div
                key={c.key}
                className="flex items-start gap-2 text-xs"
                data-testid={`check-completed-${componentId}-${c.key}`}
              >
                <span className={`mt-0.5 inline-flex items-center justify-center rounded-full ${cs.bg} ${cs.text} w-4 h-4 shrink-0`}>
                  <StatusIcon s={c.status} className="w-2.5 h-2.5" />
                </span>
                <div className="flex-1">
                  <div className="font-medium text-slate-800">{c.label}</div>
                  <div className="text-slate-500">{c.message}</div>
                </div>
              </div>
            );
          })}
          {component.checks.length === 0 && (
            <div className="text-xs text-slate-500">No checks recorded for this file.</div>
          )}
        </div>

        {component.override && (
          <div className="rounded-md bg-violet-50 border border-violet-100 p-2 text-xs text-violet-800">
            <span className="font-semibold">Overridden</span>
            {component.override.byDisplayName ? ` by ${component.override.byDisplayName}` : ""} —{" "}
            {component.override.justification}
          </div>
        )}

        {canOverride && !overrideOpen && (
          <button
            type="button"
            onClick={() => setOverrideOpen(true)}
            className="self-start text-xs font-semibold text-[var(--brand-blue)] hover:underline"
            data-testid={`button-completed-override-open-${componentId}`}
          >
            Override with justification
          </button>
        )}
        {overrideOpen && (
          <div className="space-y-2">
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
                onClick={() => {
                  setOverrideOpen(false);
                  setJustification("");
                }}
                className="text-xs text-slate-500 hover:text-slate-700"
                data-testid={`button-completed-override-cancel-${componentId}`}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
