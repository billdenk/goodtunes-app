// PressTemplateTest — Task #3098: the dedicated template TEST page, built from
// Ruby's PressTemplateCertification handoff. BODY only: renders INSIDE
// OperatorShell, no mock shell chrome. Theme from useAdminDark(); colors reuse
// the handoff-verbatim THEMES map shared with PressTemplateDetail.
//
// Live data: GET /api/press/:id/templates → find the spec, take the LATEST
// run. Side-by-side studies (template left, test file right, pop-out one at a
// time), then the two comparison cards: control values derived from the real
// spec geometry, per-check Pass/Fail rows from the run. Upload-again (file or
// HTTPS URL) hits the existing test endpoint; a passing run can be certified
// via the existing certify endpoint. canEdit gates every write affordance.
//
// House rules: statuses are icon + word (never color-only); data-testid on
// every interactive element; rows with no data are omitted, never faked.

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ChevronRight, FileText, ShieldCheck, CheckCircle2, XCircle, AlertTriangle,
  HelpCircle, Loader2, Upload, Link2, X,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAdminDark } from "@/lib/adminAppearance";
import { uploadAdminDoc, DOC_UPLOAD_ACCEPT } from "@/lib/adminUpload";
import { PrintedAreasStudy, STUDY_DARK, STUDY_LIGHT } from "@/components/press/PrintedAreasStudy";
import { buildStudySpec, buildProofSpec, INCHES_TO_MM } from "./buildStudySpec";
import type { TemplatesPayload, TemplateSpecWithHistory, TemplateTestRun, TemplateCheck } from "./types";
import { templateTestPath, certifyRunPath } from "./apiPaths";
import { THEMES, FORMAT_LABELS, slotLabel, fmtDate, type Theme } from "./PressTemplateDetail";

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// Handoff-only theme extras (hover-ink + pop-out scrim) keyed off the mode —
// the shared THEMES map doesn't carry them.
const EXTRAS: Record<"light" | "dark", { hoverInk: string; overlayScrim: string; overlayShadow: string }> = {
  light: { hoverInk: "hover:text-black", overlayScrim: "rgba(0,0,0,0.42)", overlayShadow: "0 24px 80px rgba(0,0,0,0.24)" },
  dark: { hoverInk: "hover:text-white", overlayScrim: "rgba(0,0,0,0.72)", overlayShadow: "0 24px 80px rgba(0,0,0,0.6)" },
};

// Handoff constants — exact row heights so both columns sit on the same lines.
const ROW_H = 64;
const HEADER_H = 96;

/** Breadcrumb format crumb, handoff-style: "Vinyl · 12″" etc. */
function formatCrumb(format: string): string {
  switch (format) {
    case "7_inch": return "Vinyl · 7″";
    case "10_inch": return "Vinyl · 10″";
    case "12_lp": return "Vinyl · 12″";
    case "12_double": return "Vinyl · 12″ Double";
    case "cassette": return "Cassette";
    case "cd": return "CD";
    default: return FORMAT_LABELS[format] ?? format;
  }
}

function checkTone(status: TemplateCheck["status"]): { word: string; Icon: typeof CheckCircle2; kind: "pass" | "fail" | "warn" | "unverified" } {
  switch (status) {
    case "pass": return { word: "Pass", Icon: CheckCircle2, kind: "pass" };
    case "fail": return { word: "Fail", Icon: XCircle, kind: "fail" };
    case "warn": return { word: "Warning", Icon: AlertTriangle, kind: "warn" };
    default: return { word: "Unverified", Icon: HelpCircle, kind: "unverified" };
  }
}
function checkColor(t: Theme, kind: "pass" | "fail" | "warn" | "unverified"): string {
  return kind === "pass" ? t.ready : kind === "fail" ? t.crit : kind === "warn" ? t.warn : t.subink;
}

// Handoff ResultCell — Pass/Fail icon + word + detail, fixed row height.
function ResultCell({ check, t }: { check: TemplateCheck; t: Theme }) {
  const { word, Icon, kind } = checkTone(check.status);
  const color = checkColor(t, kind);
  return (
    <div className="flex items-start gap-2.5 py-3" style={{ height: ROW_H, overflow: "hidden", borderBottom: `1px solid ${t.hairline}` }}>
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color, marginTop: 1 }} />
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold" style={{ color }}>{word}</div>
        <div className="text-[12.5px] mt-0.5" style={{ color: t.subink }}>{check.message}</div>
      </div>
    </div>
  );
}

// Handoff Verdict header for the test-file card.
function Verdict({ tone, title, sub, t }: { tone: "pass" | "fail" | "warn"; title: string; sub: string; t: Theme }) {
  const color = tone === "pass" ? t.ready : tone === "warn" ? t.warn : t.crit;
  const wash = tone === "pass" ? t.readyWash : tone === "warn" ? t.warnWash : t.critWash;
  const Icon = tone === "pass" ? CheckCircle2 : tone === "warn" ? AlertTriangle : XCircle;
  return (
    <div className="flex items-center gap-3.5 px-6 py-5">
      <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: wash }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </span>
      <div className="min-w-0">
        <div className="text-[16px] font-semibold" style={{ color: t.ink, letterSpacing: "-0.01em" }}>{title}</div>
        <div className="text-[12.5px] mt-0.5" style={{ color: t.subink }}>{sub}</div>
      </div>
    </div>
  );
}

/** Control-card rows derived from REAL spec geometry — present-only, never faked. */
function controlRows(spec: TemplateSpecWithHistory): Array<{ param: string; value: string }> {
  const rows: Array<{ param: string; value: string }> = [];
  const w = spec.measuredArtboardWInches ?? spec.artboardWInches;
  const h = spec.measuredArtboardHInches ?? spec.artboardHInches;
  if (typeof w === "number" && typeof h === "number") {
    rows.push({ param: "Trim", value: `${INCHES_TO_MM(w)} × ${INCHES_TO_MM(h)} mm cut` });
  } else if (typeof w === "number") {
    rows.push({ param: "Trim", value: `${INCHES_TO_MM(w)} mm cut` });
  }
  const bleed = spec.bleedLineInches ?? spec.measuredBleedLineInches;
  if (typeof bleed === "number") {
    rows.push({ param: "Bleed", value: `${INCHES_TO_MM(bleed)} mm — art must reach this line` });
  }
  const printRules = (spec.printRules ?? {}) as Record<string, unknown>;
  if (typeof printRules.safetyMarginInches === "number") {
    rows.push({ param: "Safety", value: `Text stays inside ${INCHES_TO_MM(printRules.safetyMarginInches as number)} mm` });
  }
  const pages = spec.measuredPages ?? spec.expectedPages;
  if (typeof pages === "number" && pages > 0) {
    rows.push({ param: "Pages", value: `${pages} ${pages === 1 ? "page" : "pages"}` });
  }
  if (spec.color) rows.push({ param: "Color", value: spec.color });
  if (typeof spec.minPpi === "number") rows.push({ param: "Resolution", value: `${spec.minPpi} ppi floor` });
  return rows;
}

export function PressTemplateTest({
  pressId,
  specId,
  canEdit,
  onBack,
  onBackToIndex,
}: {
  pressId: string;
  specId: string;
  canEdit: boolean;
  /** Back to the template detail page. */
  onBack: () => void;
  /** Back to the Templates index. */
  onBackToIndex: () => void;
}) {
  const dark = useAdminDark();
  const t = THEMES[dark ? "dark" : "light"];
  const x = EXTRAS[dark ? "dark" : "light"];
  const studyTheme = dark ? STUDY_DARK : STUDY_LIGHT;
  const { toast } = useToast();

  const templatesKey = [`/api/press/${pressId}/templates`];
  const { data, isLoading } = useQuery<TemplatesPayload>({ queryKey: templatesKey });
  const spec = data?.specs.find((s) => s.id === specId);
  const customName = data?.customSlots?.find((s) => s.slotKey === spec?.componentKey)?.displayName ?? null;

  // Pop-out review — one card at a time, never both (handoff behavior).
  const [popout, setPopout] = useState<"template" | "test" | null>(null);

  // ─── Run-a-test dialog (upload file OR paste HTTPS URL — moved here from
  //     the detail page's legacy modal, capabilities preserved) ───
  const [testOpen, setTestOpen] = useState(false);
  const [testSource, setTestSource] = useState<"upload" | "url">("upload");
  const [pasteUrl, setPasteUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const stripStatus = (msg: string) => msg.replace(/^\d{3}:\s*/, "");

  const runTest = useMutation({
    mutationFn: async (payload: { url: string; fileName?: string | null }) => {
      const r = await apiRequest("POST", templateTestPath(pressId, specId), payload);
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
      const r = await apiRequest("POST", certifyRunPath(pressId, specId, runId), {});
      return await r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templatesKey });
      toast({ title: "Template certified", description: "This template is now the certified canon." });
    },
    onError: (e: any) => {
      toast({ title: "Couldn't certify", description: stripStatus(e?.message ?? ""), variant: "destructive" });
    },
  });

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
      <div className="flex items-center justify-center py-24" data-testid="test-loading">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: t.faint }} />
      </div>
    );
  }
  if (!spec) {
    return (
      <div className="mx-auto w-full text-center py-24" style={{ maxWidth: 640 }} data-testid="test-not-found">
        <div className="text-[15px] font-semibold" style={{ color: t.ink }}>Template not found.</div>
        <button type="button" onClick={onBackToIndex} className="mt-3 text-[13px] underline" style={{ color: t.subink }} data-testid="button-test-back-index">
          Back to Templates
        </button>
      </div>
    );
  }

  const { lead, rest } = slotLabel(spec, customName);
  const latestRun = spec.runs[0] ?? null;
  const certifiedRev = spec.revisions.find((r) => r.status === "certified") ?? null;
  const certifiedAt = latestRun?.certifiedAt ?? certifiedRev?.certifiedAt ?? null;
  const templateSpec = buildStudySpec(spec, lead, rest);
  const proofSpec = latestRun ? buildProofSpec(spec, latestRun, lead, rest) : null;

  const checks = latestRun?.checks ?? [];
  const passed = checks.filter((c) => c.status === "pass").length;
  const verdictTone: "pass" | "fail" | "warn" =
    latestRun?.verdict === "pass" ? "pass" : latestRun?.verdict === "warn" ? "warn" : "fail";
  const testFileName = latestRun ? (latestRun.fileName ?? latestRun.fileUrl.split("/").pop() ?? "Test file") : null;
  const canCertifyLatest = canEdit && !!latestRun && !latestRun.certifiedAt && (latestRun.verdict === "pass" || latestRun.verdict === "warn");

  const uploadAgainBtn = canEdit ? (
    <button
      type="button"
      onClick={() => setTestOpen(true)}
      className={cn("mr-8 inline-flex items-center gap-1.5 text-[12.5px] font-medium flex-shrink-0 transition-colors", x.hoverInk)}
      style={{ color: t.subink }}
      data-testid="button-upload-again"
    >
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 9.5V2.5M7 2.5 4.5 5M7 2.5 9.5 5M2 9.5v1.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9.5" />
      </svg>
      Upload again
    </button>
  ) : undefined;

  const ctrlRows = controlRows(spec);

  return (
    <div className="mx-auto w-full font-sans" style={{ fontFamily: "Inter, system-ui, sans-serif", maxWidth: 1240, padding: "32px 40px 96px", color: t.ink }}>
      {/* Canon breadcrumb — faint links, ChevronRight separators, current in ink. */}
      <nav aria-label="breadcrumb" data-testid="breadcrumb-test">
        <ol className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: t.faint }}>
          <li className="inline-flex items-center">
            <button type="button" onClick={onBackToIndex} className={cn("transition-colors", x.hoverInk)} data-testid="crumb-templates">Templates</button>
          </li>
          <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
          <li className="inline-flex items-center">
            <button type="button" onClick={onBackToIndex} className={cn("transition-colors", x.hoverInk)} data-testid="crumb-format">{formatCrumb(spec.format)}</button>
          </li>
          <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
          <li className="inline-flex items-center">
            <button type="button" onClick={onBack} className={cn("transition-colors", x.hoverInk)} data-testid="crumb-component">{lead}</button>
          </li>
          <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
          <li className="inline-flex items-center"><span aria-current="page" style={{ color: t.ink }}>Test</span></li>
        </ol>
      </nav>

      {/* Header */}
      <div className="mt-3 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 style={{ fontSize: 30, letterSpacing: "-0.02em", fontWeight: 600, lineHeight: 1.12 }}>
            <span style={{ color: t.ink }}>Test. </span>
            <span style={{ color: t.subink, fontWeight: 500 }}>{lead} {rest}.</span>
          </h1>
          <p className="mt-1.5 text-[13.5px]" style={{ color: t.subink, maxWidth: 720 }}>
            Upload a finished file you know is right. Every check runs against the template — the verdict
            proves the canon works before any customer file touches it.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {certifiedAt ? (
            <span className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-semibold" style={{ color: t.ready, border: `1px solid ${t.ready}59`, backgroundColor: t.readyWash }} data-testid="pill-certified">
              <ShieldCheck className="w-4 h-4" />
              Certified · {fmtDate(certifiedAt)}
            </span>
          ) : canCertifyLatest ? (
            <button
              type="button"
              onClick={() => certify.mutate(latestRun!.id)}
              disabled={certify.isPending}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-semibold disabled:opacity-50"
              style={{ color: t.ready, border: `1px solid ${t.ready}59`, backgroundColor: t.readyWash }}
              data-testid="button-certify-latest"
            >
              {certify.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Certify
            </button>
          ) : null}
        </div>
      </div>

      {/* Side-by-side review — template left, the uploaded test file right.
          Pop-out reviews ONE at a time, full width; never both at once. */}
      {latestRun && proofSpec ? (
        <>
          <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {([
              { key: "template" as const, spec: templateSpec, label: "template" },
              { key: "test" as const, spec: { ...proofSpec, title: "Test." }, label: "test file" },
            ]).map(({ key, spec: s, label }) => (
              <div key={key} className="relative group/pop">
                <PrintedAreasStudy
                  spec={s}
                  embedded
                  panelSize={190}
                  theme={studyTheme}
                  headerAction={key === "test" ? uploadAgainBtn : undefined}
                />
                <button
                  type="button"
                  onClick={() => setPopout(key)}
                  title={`Review the ${label} full width`}
                  aria-label={`Review the ${label} full width`}
                  className="absolute z-10 flex items-center justify-center opacity-0 group-hover/pop:opacity-60 hover:!opacity-100 transition-opacity"
                  style={{ top: 18, right: 16, width: 22, height: 22, color: t.subink }}
                  data-testid={`button-popout-${key}`}
                >
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                    <path d="M7.5 1.5h3v3M10.5 1.5 7 5M4.5 10.5h-3v-3M1.5 10.5 5 7" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          {popout && (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-12 px-10" style={{ backgroundColor: x.overlayScrim }} onClick={() => setPopout(null)} data-testid="overlay-test-popout">
              <div className="w-full" style={{ maxWidth: 1080, boxShadow: x.overlayShadow }} onClick={(e) => e.stopPropagation()}>
                <PrintedAreasStudy spec={popout === "template" ? templateSpec : { ...proofSpec, title: "Test." }} embedded theme={studyTheme} />
              </div>
            </div>
          )}
        </>
      ) : latestRun && !proofSpec ? (
        // A run exists but no rendered preview — show the template study full
        // width; the checks below still tell the whole story.
        <div className="mt-6">
          <PrintedAreasStudy spec={templateSpec} embedded theme={studyTheme} headerAction={uploadAgainBtn} />
        </div>
      ) : (
        // ─── Empty state: no test run yet ───
        <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <PrintedAreasStudy spec={templateSpec} embedded panelSize={190} theme={studyTheme} />
          <div className="rounded-2xl flex flex-col items-center justify-center text-center px-8 py-12" style={{ border: `1.5px dashed ${t.hairline}`, backgroundColor: t.card }} data-testid="test-empty">
            <ShieldCheck className="w-6 h-6 mb-2.5" style={{ color: t.faint }} />
            <div className="text-[14px] font-semibold" style={{ color: t.ink }}>No test run yet</div>
            <div className="mt-1 text-[12.5px]" style={{ color: t.subink, maxWidth: 340 }}>
              Run a finished file you know is right — every check runs against this template.
            </div>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setTestOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-medium"
                style={{ backgroundColor: t.blue, color: "#fff" }}
                data-testid="button-run-first-test"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Run a test
              </button>
            ) : (
              <div className="mt-3 text-[12px]" style={{ color: t.faint }}>An editor on your team can run the first test.</div>
            )}
          </div>
        </div>
      )}

      {/* Two columns — the fine print of the cards above: control values under
          the template, check results under the test file. */}
      {latestRun && (
        <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {/* 1 · The control template */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="card-control-template">
            <div className="flex items-center gap-3.5 px-6 py-5" style={{ height: HEADER_H, overflow: "hidden" }}>
              <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: t.neutralWash }}>
                <FileText className="w-5 h-5" style={{ color: t.subink }} />
              </span>
              <div className="min-w-0">
                <div className="text-[16px] font-semibold" style={{ color: t.ink, letterSpacing: "-0.01em" }}>The control template</div>
                <div className="text-[12.5px] mt-0.5 truncate" style={{ color: t.subink }}>
                  {spec.templateFileName ?? `${lead} ${rest}`} · the canon this file is measured against
                </div>
              </div>
            </div>
            <div className="px-6" style={{ borderTop: `1px solid ${t.hairline}` }}>
              {/* Rows align 1:1 with the check rows on the right — same fixed
                  height. Control values only where they exist for that check;
                  the check's own basis (source) fills the rest. */}
              {checks.map((c) => {
                const ctrl = ctrlRows.find((r) => r.param.toLowerCase() === c.label.toLowerCase())
                  ?? (c.key === "tmpl.size" ? ctrlRows.find((r) => r.param === "Trim") : undefined)
                  ?? (c.key === "tmpl.bleed" ? ctrlRows.find((r) => r.param === "Bleed") : undefined)
                  ?? (c.key === "tmpl.safety" ? ctrlRows.find((r) => r.param === "Safety") : undefined);
                return (
                  <div key={c.key} className="py-3" style={{ height: ROW_H, overflow: "hidden", borderBottom: `1px solid ${t.hairline}` }}>
                    <div className="text-[12.5px] font-semibold" style={{ color: t.ink }}>{c.label}</div>
                    <div className="text-[12.5px] mt-0.5" style={{ color: t.subink }}>
                      {ctrl?.value ?? c.source ?? "Template canon"}
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center py-3.5 text-[12.5px]">
                <span style={{ color: t.faint }} data-testid="text-control-footer">
                  {certifiedAt ? `Confirmed as canon · ${fmtDate(certifiedAt)}` : certifiedRev ? `Confirmed as canon · ${fmtDate(certifiedRev.createdAt)}` : "Not yet confirmed as canon"}
                </span>
              </div>
            </div>
          </div>

          {/* 2 · The test file */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="card-test-file">
            <div style={{ height: HEADER_H, overflow: "hidden" }}>
              <Verdict
                tone={verdictTone}
                title="The test file"
                sub={`${testFileName} · ${
                  verdictTone === "pass"
                    ? "passed clean"
                    : verdictTone === "warn"
                      ? "passed with warnings"
                      : `${checks.filter((c) => c.status === "fail").length} ${checks.filter((c) => c.status === "fail").length === 1 ? "check" : "checks"} failed`
                }`}
                t={t}
              />
            </div>
            <div className="px-6" style={{ borderTop: `1px solid ${t.hairline}` }}>
              {checks.length > 0 ? (
                checks.map((c) => <ResultCell key={c.key} check={c} t={t} />)
              ) : (
                <div className="py-4 text-[12.5px]" style={{ color: t.faint }}>No checks recorded for this run.</div>
              )}
              <div className="flex items-center justify-between py-3.5 text-[12.5px]">
                <span style={{ color: t.subink }} data-testid="text-checks-passed">{passed} of {checks.length} checks passed</span>
                <span style={{ color: t.faint }}>{latestRun.previewUrl ? "Preview rendered" : fmtDate(latestRun.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {latestRun && (
        <p className="mt-4 text-[12px]" style={{ color: t.faint }}>
          If this template is superseded by a new revision, the test file stays attached and re-runs
          automatically against the new canon.
        </p>
      )}

      {/* ─── Run-a-test dialog (upload / paste URL) ─── */}
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

export default PressTemplateTest;
