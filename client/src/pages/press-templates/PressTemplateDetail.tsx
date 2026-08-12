// PressTemplateDetail — the template DETAIL screen, merging Ruby's Ingestion
// (Surface 1) and Certification (Surface 2) mocks into one live-data view.
// The BODY only: renders INSIDE OperatorShell, no mock shell chrome. Theme mode
// comes from useAdminDark(); the THEMES color maps are copied handoff-verbatim.
//
// Live data: GET /api/press/:id/templates → find the spec by id. Ingestion
// shows the REAL measured geometry (operator-entered vs measured-from-template),
// replacing the mock's MOCK_RULES / hardcoded millimetres. Certification lets an
// editor run a finished-file test (upload or paste a URL) and certify a passing
// run — everything driven by the API, no fabricated data.
//
// House rules: statuses are icon + word (never color-only); data-testid on every
// interactive element; rows/zones with no measurement are omitted, never faked.

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, Download, FileText, Cpu, Eye, Loader2, ChevronDown, ChevronRight,
  BadgeCheck, Clock3, XCircle, AlertTriangle, HelpCircle, ShieldCheck, Upload, Link2, X,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAdminDark } from "@/lib/adminAppearance";
import { uploadAdminDoc, DOC_UPLOAD_ACCEPT } from "@/lib/adminUpload";
import {
  PrintedAreasStudy,
  STUDY_DARK,
  STUDY_LIGHT,
  type StudySpec,
  type StudyZone,
  type StudyPanel,
} from "@/components/press/PrintedAreasStudy";
import type {
  TemplatesPayload,
  TemplateSpecWithHistory,
  TemplateRevision,
  TemplateTestRun,
  TemplateCheck,
} from "./types";

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ─── Themes — handoff-verbatim (light = apple-canon, dark = canon charcoal) ──
type Theme = {
  canvas: string;
  card: string;
  soft: string;
  hairline: string;
  ink: string;
  subink: string;
  faint: string;
  blue: string;
  ready: string;
  warn: string;
  crit: string;
  readyWash: string;
  warnWash: string;
  critWash: string;
  neutralWash: string;
  hoverWash: string;
  modalScrim: string;
  modalShadow: string;
};

const THEMES: Record<"light" | "dark", Theme> = {
  light: {
    canvas: "#f5f5f7",
    card: "#ffffff",
    soft: "#f0f0f2",
    hairline: "#e6e6ea",
    ink: "#1d1d1f",
    subink: "#6e6e73",
    faint: "#a1a1a6",
    blue: "#319ED8",
    ready: "#1c8a5b",
    warn: "#c98a00",
    crit: "#e0245e",
    readyWash: "rgba(28,138,91,0.10)",
    warnWash: "rgba(201,138,0,0.10)",
    critWash: "rgba(224,36,94,0.10)",
    neutralWash: "rgba(0,0,0,0.05)",
    hoverWash: "hover:bg-black/5",
    modalScrim: "rgba(0,0,0,0.42)",
    modalShadow: "0 24px 80px rgba(0,0,0,0.24)",
  },
  dark: {
    canvas: "#161617",
    card: "#1e1e20",
    soft: "#26262a",
    hairline: "rgba(255,255,255,0.10)",
    ink: "#f5f5f7",
    subink: "#98989d",
    faint: "#6e6e73",
    blue: "#319ED8",
    ready: "#34c98e",
    warn: "#e8b34b",
    crit: "#ff5d8f",
    readyWash: "rgba(52,201,142,0.12)",
    warnWash: "rgba(232,179,75,0.12)",
    critWash: "rgba(255,93,143,0.12)",
    neutralWash: "rgba(255,255,255,0.06)",
    hoverWash: "hover:bg-white/5",
    modalScrim: "rgba(0,0,0,0.72)",
    modalShadow: "0 24px 80px rgba(0,0,0,0.6)",
  },
};

// ─── Slot vocabulary → human label ───────────────────────────────────
const FORMAT_LABELS: Record<string, string> = {
  "7_inch": '7" vinyl',
  "12_lp": '12" LP',
  "12_double": '12" Double LP',
  cassette: "Cassette",
  cd: "CD",
};

const COMPONENT_LABELS: Record<string, string> = {
  jacket: "Jacket",
  labels: "Center labels",
  inner_sleeve: "Inner sleeve",
  booklet: "Insert / booklet",
  shell: "Shell print",
  j_card: "J-card",
  o_card: "O-card",
  sticker: "Shell labels",
};

const VARIANT_LABELS: Record<string, string> = {
  single: "Single",
  widespine: "Widespine",
  gatefold: "Gatefold",
  gatefold_oldstyle: "Gatefold (old style)",
};

/** Human label for a spec, e.g. "Gatefold jacket · 12″ Double LP". */
function slotLabel(spec: TemplateSpecWithHistory): { lead: string; rest: string } {
  const comp = COMPONENT_LABELS[spec.componentKey] ?? spec.componentKey;
  const variant = spec.variantKey ? VARIANT_LABELS[spec.variantKey] ?? spec.variantKey : "";
  const lead =
    spec.componentKey === "jacket" && variant ? `${variant} jacket` : comp;
  const fmt = FORMAT_LABELS[spec.format] ?? spec.format;
  const rest = spec.discCount > 0 && spec.format !== "12_double" ? `${fmt} · ${spec.discCount} discs` : fmt;
  return { lead, rest };
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

const INCHES_TO_MM = (n: number) => Math.round(n * 25.4 * 10) / 10;

// ─── Revision status → icon + word (never color-only) ────────────────
function revisionStatusMeta(status: TemplateRevision["status"]) {
  switch (status) {
    case "certified":
      return { word: "Certified", Icon: BadgeCheck, tone: "ready" as const };
    case "pending":
      return { word: "Pending", Icon: Clock3, tone: "warn" as const };
    case "superseded":
      return { word: "Superseded", Icon: ChevronDown, tone: "neutral" as const };
    case "archived":
    default:
      return { word: "Archived", Icon: XCircle, tone: "neutral" as const };
  }
}

// ─── Verdict → icon + word ────────────────────────────────────────────
function verdictMeta(verdict: TemplateTestRun["verdict"]) {
  switch (verdict) {
    case "pass":
      return { word: "Ready", Icon: BadgeCheck, tone: "ready" as const };
    case "warn":
      return { word: "Warnings", Icon: AlertTriangle, tone: "warn" as const };
    case "fail":
      return { word: "Blocked", Icon: XCircle, tone: "crit" as const };
    case "unverified":
    default:
      return { word: "Unverified", Icon: HelpCircle, tone: "neutral" as const };
  }
}

function checkStatusMeta(status: TemplateCheck["status"]) {
  switch (status) {
    case "pass":
      return { word: "Pass", Icon: BadgeCheck, tone: "ready" as const };
    case "warn":
      return { word: "Warning", Icon: AlertTriangle, tone: "warn" as const };
    case "fail":
      return { word: "Fail", Icon: XCircle, tone: "crit" as const };
    case "unverified":
    default:
      return { word: "Unverified", Icon: HelpCircle, tone: "neutral" as const };
  }
}

function toneColor(t: Theme, tone: "ready" | "warn" | "crit" | "neutral"): string {
  return tone === "ready" ? t.ready : tone === "warn" ? t.warn : tone === "crit" ? t.crit : t.subink;
}
function toneWash(t: Theme, tone: "ready" | "warn" | "crit" | "neutral"): string {
  return tone === "ready" ? t.readyWash : tone === "warn" ? t.warnWash : tone === "crit" ? t.critWash : t.neutralWash;
}

// Small pill: icon + word (colorblind-safe).
function StatusPill({ Icon, word, tone, t, testId }: { Icon: typeof BadgeCheck; word: string; tone: "ready" | "warn" | "crit" | "neutral"; t: Theme; testId?: string }) {
  const color = toneColor(t, tone);
  return (
    <span
      className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[12.5px] font-semibold flex-shrink-0"
      style={{ color, border: `1px solid ${color}59`, backgroundColor: toneWash(t, tone) }}
      data-testid={testId}
    >
      <Icon className="w-3.5 h-3.5" />
      {word}
    </span>
  );
}

// ─── A geometry / rule row (present-only) ─────────────────────────────
function GeoRow({ label, value, sub, source, t }: { label: string; value: string; sub?: string; source: "measured" | "press-entered"; t: Theme }) {
  const SourceIcon = source === "measured" ? Cpu : Eye;
  const sourceLabel = source === "measured" ? "Measured from template" : "Press-entered";
  return (
    <div className="flex items-start justify-between gap-4 py-2.5" style={{ borderBottom: `1px solid ${t.hairline}` }}>
      <div className="min-w-0">
        <div className="text-[12px]" style={{ color: t.subink }}>{label}</div>
        <div className="text-[13.5px] font-medium mt-0.5" style={{ color: t.ink }}>{value}</div>
        {sub && <div className="text-[12px] mt-0.5" style={{ color: t.faint }}>{sub}</div>}
      </div>
      <span className="inline-flex items-center gap-1 text-[11.5px] flex-shrink-0 mt-0.5" style={{ color: t.faint }} title={sourceLabel}>
        <SourceIcon className="w-3.5 h-3.5" />
        {sourceLabel}
      </span>
    </div>
  );
}

// ─── Build a StudySpec from real spec data — zones only for measured values ──
function buildStudySpec(spec: TemplateSpecWithHistory, lead: string, rest: string): StudySpec {
  const zones: StudyZone[] = [];
  const printRules = (spec.printRules ?? {}) as Record<string, unknown>;

  const bleed = spec.bleedLineInches ?? spec.measuredBleedLineInches;
  if (typeof bleed === "number") {
    zones.push({ id: "bleed", word: "Bleed", detail: `${INCHES_TO_MM(bleed)} mm — art must reach`, inset: "0%" });
  }
  const artW = spec.artboardWInches ?? spec.measuredArtboardWInches;
  if (typeof artW === "number") {
    zones.push({ id: "cut", word: "Cut", detail: `${INCHES_TO_MM(artW)} mm — trimmed edge`, inset: "3.5%" });
  }
  const safety = typeof printRules.safetyMarginInches === "number" ? (printRules.safetyMarginInches as number) : undefined;
  if (typeof safety === "number") {
    zones.push({ id: "safe", word: "Safe", detail: `${INCHES_TO_MM(safety)} mm — text stays inside`, inset: "8%" });
  }

  const shape: "circle" | "square" = spec.componentKey === "labels" ? "circle" : "square";

  const pages = spec.measuredPages ?? spec.expectedPages ?? 0;
  const panels: StudyPanel[] = [];
  if (pages > 0) {
    for (let i = 0; i < Math.min(pages, 8); i++) {
      panels.push({ label: `Area ${i + 1}`, sub: `Page ${i + 1}` });
    }
  }

  const caption = spec.templateFileName
    ? `${spec.templateFileName}${pages > 0 ? ` · ${pages} ${pages === 1 ? "page" : "pages"}` : ""}`
    : `${lead} · ${rest}`;

  const defaultZone = zones.find((z) => z.id === "safe")?.id ?? zones[0]?.id ?? "";

  return { title: "Template.", titleRest: `${lead} ${rest}`, caption, shape, defaultZone, zones, panels };
}

// ═════════════════════════════════════════════════════════════════════
// The screen
// ═════════════════════════════════════════════════════════════════════
export function PressTemplateDetail({ pressId, specId, canEdit, onBack }: { pressId: string; specId: string; canEdit: boolean; onBack: () => void }) {
  const dark = useAdminDark();
  const t = THEMES[dark ? "dark" : "light"];
  const studyTheme = dark ? STUDY_DARK : STUDY_LIGHT;
  const { toast } = useToast();

  const templatesKey = ["/api/press/" + pressId + "/templates"];
  const { data, isLoading, isError } = useQuery<TemplatesPayload>({ queryKey: templatesKey });

  const spec = data?.specs.find((s) => s.id === specId);

  // ─── Certification: run-a-test dialog + certify mutation ───
  const [testOpen, setTestOpen] = useState(false);
  const [testSource, setTestSource] = useState<"upload" | "url">("upload");
  const [pasteUrl, setPasteUrl] = useState("");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const stripStatus = (msg: string) => msg.replace(/^\d{3}:\s*/, "");

  const runTest = useMutation({
    mutationFn: async (payload: { url: string; fileName?: string | null }) => {
      const r = await apiRequest("POST", `/api/press/${pressId}/templates/${specId}/test`, payload);
      return (await r.json()) as { run: TemplateTestRun };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templatesKey });
      setTestOpen(false);
      setPasteUrl("");
      toast({ title: "Test complete", description: "The finished-file check finished running." });
    },
    onError: (e: any) => {
      toast({ title: "Couldn't run the test", description: stripStatus(e?.message ?? ""), variant: "destructive" });
    },
  });

  const certify = useMutation({
    mutationFn: async (runId: string) => {
      const r = await apiRequest("POST", `/api/press/${pressId}/templates/${specId}/runs/${runId}/certify`, {});
      return (await r.json()) as { ok: boolean; certifiedAt: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templatesKey });
      toast({ title: "Template certified", description: "This revision is now the live canon." });
    },
    onError: (e: any) => {
      toast({ title: "Couldn't certify", description: stripStatus(e?.message ?? ""), variant: "destructive" });
    },
  });

  const [uploading, setUploading] = useState(false);
  const onUploadTestFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAdminDoc(file);
      runTest.mutate({ url, fileName: file.name });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const onPasteTest = () => {
    const url = pasteUrl.trim();
    if (!/^https:\/\//i.test(url)) {
      toast({ title: "Check the link", description: "Paste an https:// URL to the finished file.", variant: "destructive" });
      return;
    }
    runTest.mutate({ url });
  };

  // ─── Loading / not-found ───
  if (isLoading) {
    return (
      <div className="mx-auto w-full flex items-center justify-center" style={{ maxWidth: 1240, padding: "80px 40px" }}>
        <div className="flex items-center gap-2 text-[13.5px]" style={{ color: t.subink }} data-testid="detail-loading">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading template…
        </div>
      </div>
    );
  }
  if (isError || !spec) {
    return (
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: "40px 40px 96px" }}>
        <button type="button" onClick={onBack} className={cn("inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-medium transition-colors", t.hoverWash)} style={{ color: t.subink, border: `1px solid ${t.hairline}` }} data-testid="button-back">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="mt-8 rounded-2xl px-6 py-10 text-center" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="detail-not-found">
          <div className="text-[15px] font-semibold" style={{ color: t.ink }}>Template not found</div>
          <div className="mt-1.5 text-[13px]" style={{ color: t.subink }}>This slot may have been removed. Head back to the Templates library.</div>
        </div>
      </div>
    );
  }

  const { lead, rest } = slotLabel(spec);
  const liveRev = spec.revisions.find((r) => r.status === "certified" || r.status === "pending") ?? null;
  const liveMeta = liveRev ? revisionStatusMeta(liveRev.status) : null;
  const studySpec = buildStudySpec(spec, lead, rest);

  // Newest-first runs; a pass/warn run that isn't certified is certifiable.
  const runs = [...spec.runs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // ─── Ingestion geometry rows (present-only) ───
  const geoRows: React.ReactNode[] = [];
  const push = (node: React.ReactNode) => geoRows.push(node);
  const artW = spec.artboardWInches ?? spec.measuredArtboardWInches;
  const artH = spec.artboardHInches ?? spec.measuredArtboardHInches;
  if (typeof artW === "number" && typeof artH === "number") {
    push(<GeoRow key="artboard" label="Artboard" value={`${artW} × ${artH} in`} source={spec.artboardWInches != null ? "press-entered" : "measured"} t={t} />);
  } else if (typeof artW === "number") {
    push(<GeoRow key="artboardW" label="Artboard width" value={`${artW} in`} source={spec.artboardWInches != null ? "press-entered" : "measured"} t={t} />);
  }
  const pages = spec.measuredPages ?? spec.expectedPages;
  if (typeof pages === "number") {
    push(<GeoRow key="pages" label="Pages" value={`${pages}`} source={spec.expectedPages != null ? "press-entered" : "measured"} t={t} />);
  }
  const bleed = spec.bleedLineInches ?? spec.measuredBleedLineInches;
  if (typeof bleed === "number") {
    push(<GeoRow key="bleed" label="Bleed line" value={`${bleed} in (${INCHES_TO_MM(bleed)} mm)`} sub="Art must reach this line" source={spec.bleedLineInches != null ? "press-entered" : "measured"} t={t} />);
  }
  const boolRow = (key: string, label: string, val: boolean | null, sub?: string) => {
    if (val == null) return;
    push(<GeoRow key={key} label={label} value={val ? "Yes" : "No"} sub={sub} source="measured" t={t} />);
  };
  boolRow("cmyk", "CMYK color", spec.measuredHasCmyk);
  boolRow("rgb", "RGB color", spec.measuredHasRgb, spec.measuredHasRgb ? "RGB objects detected — should be CMYK" : undefined);
  boolRow("spot", "Spot inks", spec.measuredHasSpot);
  boolRow("livetext", "Live text", spec.measuredHasLiveText);
  boolRow("fonts", "Embedded fonts", spec.measuredHasEmbeddedFonts);
  boolRow("dieline", "Dieline", spec.measuredHasDieline);

  return (
    <div className="mx-auto w-full font-sans" style={{ fontFamily: "Inter, system-ui, sans-serif", maxWidth: 1240, padding: "32px 40px 96px", color: t.ink }}>
      {/* Back */}
      <button type="button" onClick={onBack} className={cn("inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-medium transition-colors", t.hoverWash)} style={{ color: t.subink, border: `1px solid ${t.hairline}` }} data-testid="button-back">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      {/* Header */}
      <div className="mt-4 flex items-end justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <h1 style={{ fontSize: 30, letterSpacing: "-0.02em", fontWeight: 600, lineHeight: 1.12 }}>
            <span style={{ color: t.ink }}>{lead}. </span>
            <span style={{ color: t.subink, fontWeight: 500 }}>{rest}.</span>
          </h1>
          {/* Live revision + file */}
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            {liveRev && liveMeta && (
              <span className="inline-flex items-center gap-2 text-[13.5px]" style={{ color: t.subink }} data-testid="live-revision">
                <span className="font-medium" style={{ color: t.ink }}>{liveRev.revLabel}</span>
                <StatusPill Icon={liveMeta.Icon} word={liveMeta.word} tone={liveMeta.tone} t={t} testId="pill-live-status" />
              </span>
            )}
            {spec.templateFileUrl ? (
              <a
                href={spec.templateFileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] hover:opacity-80"
                style={{ color: t.blue }}
                data-testid="link-download-template"
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="truncate max-w-[280px]">{spec.templateFileName ?? "Template file"}</span>
                <Download className="w-3.5 h-3.5" />
              </a>
            ) : (
              <span className="text-[13px]" style={{ color: t.faint }} data-testid="no-file">No file attached yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Measured error */}
      {spec.measuredError && (
        <div className="mt-4 rounded-xl px-4 py-3 flex items-start gap-2.5" style={{ backgroundColor: t.critWash, border: `1px solid ${t.crit}59` }} data-testid="measured-error">
          <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: t.crit }} />
          <div className="text-[12.5px]" style={{ color: t.ink }}>
            <span className="font-semibold">Couldn’t measure this template.</span> <span style={{ color: t.subink }}>{spec.measuredError}</span>
          </div>
        </div>
      )}

      {/* ─── Ingestion: printed areas study ─── */}
      <div className="mt-5">
        <PrintedAreasStudy spec={studySpec} embedded theme={studyTheme} />
      </div>

      {/* ─── Ingestion: measured geometry ─── */}
      <div className="mt-4 rounded-2xl px-5 pt-4 pb-2" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="card-geometry">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold" style={{ color: t.ink }}>Measured geometry</h3>
          <span className="text-[11.5px]" style={{ color: t.faint }}>Press-entered + measured from the template</span>
        </div>
        <div className="mt-2">
          {geoRows.length > 0 ? geoRows : (
            <div className="py-4 text-[13px]" style={{ color: t.faint }} data-testid="geometry-empty">No geometry measured yet — attach a template file to populate this.</div>
          )}
        </div>
      </div>

      {/* ─── Revision history ─── */}
      <div className="mt-4 rounded-2xl px-5 pt-4 pb-3" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="card-revisions">
        <h3 className="text-[14px] font-semibold" style={{ color: t.ink }}>Revision history</h3>
        <div className="mt-2">
          {spec.revisions.length > 0 ? (
            [...spec.revisions]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((rev, i, arr) => {
                const meta = revisionStatusMeta(rev.status);
                return (
                  <div key={rev.id} className="flex items-start justify-between gap-4 py-2.5" style={{ borderBottom: i < arr.length - 1 ? `1px solid ${t.hairline}` : undefined }} data-testid={`revision-${rev.id}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-medium" style={{ color: t.ink }}>{rev.revLabel}</span>
                        <StatusPill Icon={meta.Icon} word={meta.word} tone={meta.tone} t={t} />
                      </div>
                      {rev.note && <div className="text-[12px] mt-0.5" style={{ color: t.faint }}>{rev.note}</div>}
                      {rev.certifiedAt && <div className="text-[12px] mt-0.5" style={{ color: t.ready }}>Certified {fmtDate(rev.certifiedAt)}</div>}
                    </div>
                    <span className="text-[12px] flex-shrink-0 mt-0.5" style={{ color: t.faint }}>{fmtDate(rev.createdAt)}</span>
                  </div>
                );
              })
          ) : (
            <div className="py-4 text-[13px]" style={{ color: t.faint }} data-testid="revisions-empty">No revisions yet.</div>
          )}
        </div>
      </div>

      {/* ─── Certification ─── */}
      <div className="mt-4 rounded-2xl px-5 pt-4 pb-3" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="card-certification">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-[14px] font-semibold" style={{ color: t.ink }}>Certification</h3>
            <div className="mt-0.5 text-[12px]" style={{ color: t.faint }}>Run a finished file you know is right — every check runs against this template.</div>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setTestOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-[13px] font-medium flex-shrink-0"
              style={{ backgroundColor: t.blue, color: "#fff" }}
              data-testid="button-run-test"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Run a test
            </button>
          )}
        </div>

        <div className="mt-3">
          {runs.length > 0 ? (
            runs.map((run) => {
              const meta = verdictMeta(run.verdict);
              const open = expandedRun === run.id;
              const canCertifyThis = canEdit && !run.certifiedAt && (run.verdict === "pass" || run.verdict === "warn");
              return (
                <div key={run.id} className="py-3" style={{ borderTop: `1px solid ${t.hairline}` }} data-testid={`run-${run.id}`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setExpandedRun(open ? null : run.id)}
                      className="flex items-center gap-2.5 min-w-0 text-left"
                      data-testid={`button-toggle-run-${run.id}`}
                    >
                      {open ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} /> : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />}
                      <StatusPill Icon={meta.Icon} word={meta.word} tone={meta.tone} t={t} testId={`pill-verdict-${run.id}`} />
                      <span className="text-[13px] truncate" style={{ color: t.ink }}>
                        {run.fileName ?? run.fileUrl}
                      </span>
                      <span className="text-[12px] flex-shrink-0" style={{ color: t.faint }}>{fmtDate(run.createdAt)}</span>
                    </button>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {run.certifiedAt ? (
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: t.ready }} data-testid={`run-certified-${run.id}`}>
                          <BadgeCheck className="w-3.5 h-3.5" /> Certified {fmtDate(run.certifiedAt)}
                        </span>
                      ) : canCertifyThis ? (
                        <button
                          type="button"
                          onClick={() => certify.mutate(run.id)}
                          disabled={certify.isPending}
                          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[12.5px] font-medium disabled:opacity-50"
                          style={{ color: t.ready, border: `1px solid ${t.ready}59`, backgroundColor: t.readyWash }}
                          data-testid={`button-certify-${run.id}`}
                        >
                          {certify.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                          Certify
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {open && (
                    <div className="mt-3 rounded-xl overflow-hidden" style={{ marginLeft: 26, border: `1px solid ${t.hairline}` }} data-testid={`run-checks-${run.id}`}>
                      {run.checks.length > 0 ? run.checks.map((c, i) => {
                        const cm = checkStatusMeta(c.status);
                        const color = toneColor(t, cm.tone);
                        return (
                          <div key={c.key} className="flex items-start gap-3 px-4 py-2.5" style={{ borderBottom: i < run.checks.length - 1 ? `1px solid ${t.hairline}` : undefined, backgroundColor: t.soft }}>
                            <cm.Icon className="w-4 h-4 flex-shrink-0" style={{ color, marginTop: 1 }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[12.5px] font-semibold" style={{ color: t.ink }}>{c.label}</span>
                                <span className="text-[11.5px] font-semibold" style={{ color }}>{cm.word}</span>
                              </div>
                              <div className="text-[12.5px] mt-0.5" style={{ color: t.subink }}>{c.message}</div>
                              {c.source && <div className="text-[11.5px] mt-0.5" style={{ color: t.faint }}>{c.source}</div>}
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="px-4 py-3 text-[12.5px]" style={{ color: t.faint, backgroundColor: t.soft }}>No checks recorded for this run.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-4 text-[13px]" style={{ color: t.faint, borderTop: `1px solid ${t.hairline}` }} data-testid="runs-empty">No test runs yet. {canEdit ? "Run a test to certify this template." : ""}</div>
          )}
        </div>
      </div>

      {/* ─── Run-a-test dialog ─── */}
      {testOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: t.modalScrim }} onClick={() => !runTest.isPending && !uploading && setTestOpen(false)} data-testid="overlay-run-test">
          <div className="rounded-3xl px-8 pt-7 pb-8" style={{ width: 540, backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.modalShadow }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-[17px] font-semibold" style={{ color: t.ink }}>Test this template.</div>
                <div className="mt-1 text-[12.5px]" style={{ color: t.subink }}>Upload a finished file, or paste a link to one. We’ll run every check against this template.</div>
              </div>
              <button type="button" className="text-[13px] hover:opacity-80 flex-shrink-0 disabled:opacity-40" style={{ color: t.subink }} onClick={() => setTestOpen(false)} disabled={runTest.isPending || uploading} data-testid="button-close-test">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Source toggle */}
            <div className="mt-5 inline-flex rounded-full p-1" style={{ backgroundColor: t.soft }}>
              {(["upload", "url"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTestSource(s)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium"
                  style={{ color: testSource === s ? t.ink : t.subink, backgroundColor: testSource === s ? t.card : "transparent" }}
                  data-testid={`toggle-source-${s}`}
                >
                  {s === "upload" ? <Upload className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                  {s === "upload" ? "Upload file" : "Paste a URL"}
                </button>
              ))}
            </div>

            {(runTest.isPending || uploading) ? (
              <div className="mt-5 rounded-2xl flex flex-col items-center justify-center text-center px-6 py-12" style={{ border: `1.5px dashed ${t.hairline}`, backgroundColor: t.soft }} data-testid="test-scanning">
                <Loader2 className="w-6 h-6 mb-2.5 animate-spin" style={{ color: t.blue }} />
                <div className="text-[13.5px] font-medium" style={{ color: t.ink }}>Scanning the file…</div>
                <div className="mt-1 text-[12px]" style={{ color: t.faint }}>This can take 30–60 seconds. Keep this open.</div>
              </div>
            ) : testSource === "upload" ? (
              <div className="mt-5 rounded-2xl flex flex-col items-center justify-center text-center px-6 py-10" style={{ border: `1.5px dashed ${t.hairline}`, backgroundColor: t.soft }}>
                <FileText className="w-6 h-6 mb-2.5" style={{ color: t.faint }} />
                <div className="text-[13.5px] font-medium" style={{ color: t.ink }}>Choose the finished file</div>
                <div className="mt-1 text-[12px]" style={{ color: t.faint }}>PDF with bleed included · layered vector preferred</div>
                <label className={cn("mt-4 h-9 px-4 rounded-full text-[13px] font-medium transition-colors inline-flex items-center cursor-pointer", t.hoverWash)} style={{ color: t.subink, border: `1px solid ${t.hairline}` }} data-testid="button-choose-test-file">
                  Choose file…
                  <input
                    type="file"
                    accept={DOC_UPLOAD_ACCEPT}
                    className="hidden"
                    onChange={(e) => onUploadTestFile(e.target.files?.[0])}
                    data-testid="input-test-file"
                  />
                </label>
              </div>
            ) : (
              <div className="mt-5">
                <input
                  type="url"
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  placeholder="https://…/finished-file.pdf"
                  className="w-full rounded-lg px-3 py-2 text-[13px] outline-none"
                  style={{ backgroundColor: t.soft, border: `1px solid ${t.hairline}`, color: t.ink }}
                  data-testid="input-test-url"
                />
                <div className="mt-3 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onPasteTest}
                    disabled={!pasteUrl.trim()}
                    className="h-9 px-4 rounded-full text-[13px] font-medium disabled:opacity-40"
                    style={{ backgroundColor: t.blue, color: "#fff" }}
                    data-testid="button-submit-url"
                  >
                    Run the test
                  </button>
                  <button type="button" onClick={() => setTestOpen(false)} className="text-[13px] hover:opacity-80" style={{ color: t.subink }} data-testid="button-cancel-test">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PressTemplateDetail;
