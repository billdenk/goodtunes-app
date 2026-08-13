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

import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, Download, FileText, Cpu, Eye, Loader2, ChevronDown, ChevronRight,
  BadgeCheck, Clock3, XCircle, AlertTriangle, HelpCircle, ShieldCheck, Upload,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAdminDark } from "@/lib/adminAppearance";
import { uploadAdminDoc } from "@/lib/adminUpload";
import {
  PrintedAreasStudy,
  STUDY_DARK,
  STUDY_LIGHT,
} from "@/components/press/PrintedAreasStudy";
import { buildStudySpec, buildProofSpec, INCHES_TO_MM } from "./buildStudySpec";
import type {
  TemplatesPayload,
  TemplateSpecWithHistory,
  TemplateRevision,
  TemplateTestRun,
  TemplateCheck,
} from "./types";
import { variantOptionsNote } from "./types";
import { certifyRunPath } from "./apiPaths";

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ─── Themes — handoff-verbatim (light = apple-canon, dark = canon charcoal) ──
export type Theme = {
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

export const THEMES: Record<"light" | "dark", Theme> = {
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
export const FORMAT_LABELS: Record<string, string> = {
  "7_inch": '7" vinyl',
  "10_inch": '10" vinyl',
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
export function slotLabel(
  spec: TemplateSpecWithHistory,
  customName?: string | null,
): { lead: string; rest: string } {
  // Task #3065 — operator-defined slots read their display name off the
  // custom-slot row (componentKey "custom_<slug>" is not human-friendly).
  const comp = customName ?? COMPONENT_LABELS[spec.componentKey] ?? spec.componentKey;
  const variant = spec.variantKey ? VARIANT_LABELS[spec.variantKey] ?? spec.variantKey : "";
  const lead =
    spec.componentKey === "jacket" && variant ? `${variant} jacket` : comp;
  const fmt = FORMAT_LABELS[spec.format] ?? spec.format;
  const rest = spec.discCount > 0 && spec.format !== "12_double" ? `${fmt} · ${spec.discCount} discs` : fmt;
  return { lead, rest };
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}


// ─── Revision status → icon + word (never color-only) ────────────────
function revisionStatusMeta(status: TemplateRevision["status"]) {
  switch (status) {
    case "certified":
      return { word: "Certified", Icon: BadgeCheck, tone: "ready" as const };
    case "pending":
      return { word: "Pending", Icon: Clock3, tone: "warn" as const };
    case "review":
      return { word: "Needs review", Icon: AlertTriangle, tone: "warn" as const };
    case "superseded":
      return { word: "Superseded", Icon: ChevronDown, tone: "neutral" as const };
    case "archived":
    default:
      return { word: "Archived", Icon: XCircle, tone: "neutral" as const };
  }
}

// ─── Verdict → icon + word ────────────────────────────────────────────
export function verdictMeta(verdict: TemplateTestRun["verdict"]) {
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

export function checkStatusMeta(status: TemplateCheck["status"]) {
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

export function toneColor(t: Theme, tone: "ready" | "warn" | "crit" | "neutral"): string {
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

// ─── StudySpec builder lives in ./buildStudySpec (Task #3060) — the preview
// is driven by the uploaded file's measured facts + the slot's product type.

// ═════════════════════════════════════════════════════════════════════
// The screen
// ═════════════════════════════════════════════════════════════════════
export function PressTemplateDetail({ pressId, specId, canEdit, onBack, onOpenTest }: { pressId: string; specId: string; canEdit: boolean; onBack: () => void; onOpenTest?: () => void }) {
  const dark = useAdminDark();
  const t = THEMES[dark ? "dark" : "light"];
  const studyTheme = dark ? STUDY_DARK : STUDY_LIGHT;
  const { toast } = useToast();

  const templatesKey = ["/api/press/" + pressId + "/templates"];
  const { data, isLoading, isError } = useQuery<TemplatesPayload>({ queryKey: templatesKey });

  const spec = data?.specs.find((s) => s.id === specId);

  // ─── Certification — test runs now live on the dedicated Test page
  // (Task #3098); this screen keeps the run history + certify actions.
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const stripStatus = (msg: string) => msg.replace(/^\d{3}:\s*/, "");

  const certify = useMutation({
    mutationFn: async (runId: string) => {
      const r = await apiRequest("POST", certifyRunPath(pressId, specId, runId), {});
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

  // ─── Task #3044 — broken-link recovery: attach the PDF instead ───
  // When the stored link isn't a PDF (e.g. a vendor download PAGE), measuring
  // fails and the error used to be a dead end. This path uploads the real PDF
  // to our own object storage and swaps it in via the existing template PUT,
  // which clears old measurements and re-measures — so the row permanently
  // stores the file itself, not the breakable external link.
  const attachFileRef = useRef<HTMLInputElement | null>(null);
  const [attachBusy, setAttachBusy] = useState<"uploading" | "measuring" | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const attachTemplate = useMutation({
    mutationFn: async (payload: { fileUrl: string; fileName: string }) => {
      if (!spec) throw new Error("Template not loaded yet.");
      const r = await apiRequest("PUT", `/api/press/${pressId}/templates`, {
        format: spec.format,
        componentKey: spec.componentKey,
        variantKey: spec.variantKey ?? "",
        discCount: spec.discCount,
        fileUrl: payload.fileUrl,
        fileName: payload.fileName,
      });
      return (await r.json()) as { spec: TemplateSpecWithHistory };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: templatesKey });
      if (data.spec.measuredError) {
        toast({
          title: "File attached, but it couldn't be measured",
          description: data.spec.measuredError,
          variant: "destructive",
        });
      } else {
        toast({ title: "Template attached", description: "The PDF was measured and saved as this template's file." });
      }
    },
    onError: (e: any) => {
      toast({ title: "Couldn't attach the PDF", description: stripStatus(e?.message ?? ""), variant: "destructive" });
    },
    onSettled: () => setAttachBusy(null),
  });

  const onAttachPdf = async (file: File | undefined | null) => {
    if (!file || attachBusy) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      toast({ title: "PDF only", description: "Attach the template as a PDF file.", variant: "destructive" });
      return;
    }
    setAttachBusy("uploading");
    try {
      const url = await uploadAdminDoc(file);
      setAttachBusy("measuring");
      attachTemplate.mutate({ fileUrl: url, fileName: file.name });
    } catch (e: any) {
      setAttachBusy(null);
      toast({ title: "Upload failed", description: e?.message, variant: "destructive" });
    } finally {
      if (attachFileRef.current) attachFileRef.current.value = "";
    }
  };

  // ─── Task #3101 — operator-entered fold/safety lines ───
  // For templates whose PDF carries no readable dieline guides: fold/score
  // positions (inches from the left/top edge) + a safety inset (inches per
  // side inside the cut line). Press-entered values win over measured
  // guides. Local edit state re-seeds ONLY on spec-id switch so a sibling
  // save's refetch can't wipe in-progress edits.
  const [guidesOpen, setGuidesOpen] = useState(false);
  const [foldXText, setFoldXText] = useState("");
  const [foldYText, setFoldYText] = useState("");
  const [safetyText, setSafetyText] = useState("");
  const [guidesSeededFor, setGuidesSeededFor] = useState<string | null>(null);
  if (spec && guidesSeededFor !== spec.id) {
    setGuidesSeededFor(spec.id);
    setFoldXText((spec.foldXInches ?? []).join(", "));
    setFoldYText((spec.foldYInches ?? []).join(", "));
    setSafetyText(spec.safetyInsetInches != null ? String(spec.safetyInsetInches) : "");
  }

  const saveGuides = useMutation({
    mutationFn: async (payload: { foldXInches: number[] | null; foldYInches: number[] | null; safetyInsetInches: number | null }) => {
      const r = await apiRequest("PUT", `/api/press/${pressId}/templates/${specId}/guides`, payload);
      return (await r.json()) as { spec: TemplateSpecWithHistory };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templatesKey });
      toast({ title: "Fold & safety lines saved", description: "Press-entered values now drive the printed-areas study." });
    },
    onError: (e: any) => {
      toast({ title: "Couldn't save", description: stripStatus(e?.message ?? ""), variant: "destructive" });
    },
  });

  /** "12.25, 24.5" → sorted number list; null = empty; undefined = invalid. */
  const parseInchList = (text: string): number[] | null | undefined => {
    const parts = text.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    const nums = parts.map(Number);
    if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 120)) return undefined;
    return nums.sort((a, b) => a - b);
  };

  const onSaveGuides = () => {
    const foldX = parseInchList(foldXText);
    const foldY = parseInchList(foldYText);
    if (foldX === undefined || foldY === undefined) {
      toast({ title: "Check the fold positions", description: "Enter inch values (0–120) separated by commas.", variant: "destructive" });
      return;
    }
    const safetyTrim = safetyText.trim();
    const safetyNum = safetyTrim === "" ? null : Number(safetyTrim);
    if (safetyNum !== null && (!Number.isFinite(safetyNum) || safetyNum < 0 || safetyNum > 2)) {
      toast({ title: "Check the safety inset", description: "Enter inches between 0 and 2, or leave it blank.", variant: "destructive" });
      return;
    }
    saveGuides.mutate({ foldXInches: foldX, foldYInches: foldY, safetyInsetInches: safetyNum });
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

  const customSlot = spec.componentKey.startsWith("custom_")
    ? (data?.customSlots ?? []).find((c) => c.format === spec.format && c.slotKey === spec.componentKey)
    : undefined;
  const { lead, rest } = slotLabel(spec, customSlot?.displayName ?? null);
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
  // Task #3101 — press-entered fold/safety geometry rows (product geometry,
  // kept across template replaces; wins over measured guides in the study).
  if (spec.foldXInches?.length) {
    push(<GeoRow key="foldX" label="Fold / score lines (vertical)" value={spec.foldXInches.map((v) => `${v} in`).join(", ")} sub="From the left edge" source="press-entered" t={t} />);
  }
  if (spec.foldYInches?.length) {
    push(<GeoRow key="foldY" label="Fold / score lines (horizontal)" value={spec.foldYInches.map((v) => `${v} in`).join(", ")} sub="From the top edge" source="press-entered" t={t} />);
  }
  if (typeof spec.safetyInsetInches === "number") {
    push(<GeoRow key="safetyInset" label="Safety inset" value={`${spec.safetyInsetInches} in (${INCHES_TO_MM(spec.safetyInsetInches)} mm)`} sub="Text stays inside the cut line by this much" source="press-entered" t={t} />);
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
          {/* Task #3065 — one file, multiple options (confirmed at attach). */}
          {spec.variantOptions?.length ? (
            <div className="mt-1.5 text-[13px]" style={{ color: t.subink }} data-testid="text-variant-options">
              {variantOptionsNote(spec.variantOptions)}
            </div>
          ) : null}
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
        {/* Task #3098 — "Test" pill opens the dedicated Test page. */}
        {onOpenTest && (
          <button
            type="button"
            onClick={onOpenTest}
            className={cn("inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-semibold flex-shrink-0 transition-colors", t.hoverWash)}
            style={{ color: t.ink, border: `1px solid ${t.hairline}` }}
            data-testid="button-open-test-page"
          >
            <ShieldCheck className="w-4 h-4" style={{ color: t.blue }} />
            Test
          </button>
        )}
      </div>

      {/* Measured error */}
      {spec.measuredError && (
        <div className="mt-4 rounded-xl px-4 py-3 flex items-start gap-2.5" style={{ backgroundColor: t.critWash, border: `1px solid ${t.crit}59` }} data-testid="measured-error">
          <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: t.crit }} />
          <div className="min-w-0 flex-1 text-[12.5px]" style={{ color: t.ink }}>
            <span className="font-semibold">Couldn’t measure this template.</span> <span style={{ color: t.subink }}>{spec.measuredError}</span>
            {canEdit && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => attachFileRef.current?.click()}
                  disabled={attachBusy != null}
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[12.5px] font-medium disabled:opacity-60"
                  style={{ color: "#fff", backgroundColor: t.blue }}
                  data-testid="button-attach-pdf-instead"
                >
                  {attachBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {attachBusy === "uploading" ? "Uploading…" : attachBusy === "measuring" ? "Measuring…" : "Attach the PDF instead"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden PDF picker shared by the error banner and the geometry dropzone */}
      {canEdit && (
        <input
          ref={attachFileRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => onAttachPdf(e.target.files?.[0])}
          data-testid="input-attach-pdf"
        />
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
          {geoRows.length > 0 ? geoRows : canEdit ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => attachFileRef.current?.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); attachFileRef.current?.click(); } }}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); onAttachPdf(e.dataTransfer.files?.[0]); }}
              className="my-3 rounded-xl px-4 py-6 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center"
              style={{
                border: `1.5px dashed ${dragActive ? t.blue : t.hairline}`,
                backgroundColor: dragActive ? `${t.blue}14` : "transparent",
              }}
              data-testid="geometry-dropzone"
            >
              {attachBusy ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: t.blue }} /> : <Upload className="w-4 h-4" style={{ color: t.blue }} />}
              <div className="text-[13px] font-medium" style={{ color: t.ink }}>
                {attachBusy === "uploading" ? "Uploading…" : attachBusy === "measuring" ? "Measuring…" : "Attach the template PDF"}
              </div>
              <div className="text-[12px]" style={{ color: t.faint }}>
                No geometry measured yet — drop a PDF here or click to upload. It'll be measured automatically.
              </div>
            </div>
          ) : (
            <div className="py-4 text-[13px]" style={{ color: t.faint }} data-testid="geometry-empty">No geometry measured yet — attach a template file to populate this.</div>
          )}
        </div>

        {/* Task #3101 — hand-entered fold & safety lines. For templates whose
            PDF has no readable guides; press-entered values win over measured
            guides and survive a template replace (product geometry). */}
        {canEdit && (
          <div className="pt-2 pb-3" style={{ borderTop: `1px solid ${t.hairline}` }} data-testid="section-operator-guides">
            <button
              type="button"
              onClick={() => setGuidesOpen((v) => !v)}
              className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium"
              style={{ color: t.blue }}
              data-testid="button-toggle-operator-guides"
            >
              {guidesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Enter fold & safety lines
            </button>
            {guidesOpen && (
              <div className="mt-2">
                <div className="text-[12px]" style={{ color: t.faint }}>
                  For templates whose PDF has no readable guide lines. Positions are inches from the artboard's left/top edge; the safety inset is inches per side inside the cut line. Press-entered values win over measured guides and are kept when the file is replaced.
                </div>
                <div className="mt-2.5 grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 160px" }}>
                  <label className="block">
                    <span className="text-[12px]" style={{ color: t.subink }}>Vertical fold lines (in, from left)</span>
                    <input
                      type="text"
                      value={foldXText}
                      onChange={(e) => setFoldXText(e.target.value)}
                      placeholder="e.g. 12.25, 24.5"
                      className="mt-1 w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                      style={{ backgroundColor: t.soft, color: t.ink, border: `1px solid ${t.hairline}` }}
                      data-testid="input-fold-x"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[12px]" style={{ color: t.subink }}>Horizontal fold lines (in, from top)</span>
                    <input
                      type="text"
                      value={foldYText}
                      onChange={(e) => setFoldYText(e.target.value)}
                      placeholder="e.g. 6.125"
                      className="mt-1 w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                      style={{ backgroundColor: t.soft, color: t.ink, border: `1px solid ${t.hairline}` }}
                      data-testid="input-fold-y"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[12px]" style={{ color: t.subink }}>Safety inset (in)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={safetyText}
                      onChange={(e) => setSafetyText(e.target.value)}
                      placeholder="e.g. 0.125"
                      className="mt-1 w-full h-9 px-3 rounded-lg text-[13px] outline-none"
                      style={{ backgroundColor: t.soft, color: t.ink, border: `1px solid ${t.hairline}` }}
                      data-testid="input-safety-inset"
                    />
                  </label>
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onSaveGuides}
                    disabled={saveGuides.isPending}
                    className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-[13px] font-medium disabled:opacity-60"
                    style={{ color: "#fff", backgroundColor: t.blue }}
                    data-testid="button-save-operator-guides"
                  >
                    {saveGuides.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Save
                  </button>
                  <span className="text-[12px]" style={{ color: t.faint }}>Leave a field blank to clear it.</span>
                </div>
              </div>
            )}
          </div>
        )}
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
          {onOpenTest && (
            <button
              type="button"
              onClick={onOpenTest}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-[13px] font-medium flex-shrink-0"
              style={{ backgroundColor: t.blue, color: "#fff" }}
              data-testid="button-run-test"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> {canEdit ? "Run a test" : "View tests"}
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
                  {open && (() => {
                    // Task #3090 — proof view: the run's rendered artwork
                    // under the TEMPLATE's zone rings (same geometry as the
                    // template preview above). No renderable image yet →
                    // checks list only, no broken panel.
                    const proofSpec = buildProofSpec(spec, run, lead, rest);
                    return proofSpec ? (
                      <div className="mt-3" style={{ marginLeft: 26 }} data-testid={`run-proof-${run.id}`}>
                        <PrintedAreasStudy spec={proofSpec} embedded theme={studyTheme} />
                      </div>
                    ) : null;
                  })()}
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

    </div>
  );
}

export default PressTemplateDetail;
