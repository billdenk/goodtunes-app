// Press-templates flow (Ruby handoff wiring) — one shared contract for the
// Templates index / upload / ingestion / certification screens. Mirrors the
// press-portal API in server/pressTemplatesPortal.ts exactly.

/** shared/uploadValidation.ts CheckResult, as serialized in runs.checks. */
export type TemplateCheck = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail" | "unverified";
  message: string;
  tier?: string;
  source?: string;
};

export type TemplateRevision = {
  id: string;
  specId: string;
  revLabel: string;
  fileUrl: string;
  fileName: string | null;
  status: "pending" | "certified" | "superseded" | "archived";
  note: string | null;
  measuredSnapshot: Record<string, unknown> | null;
  createdAt: string;
  supersededAt: string | null;
  certifiedAt: string | null;
};

export type TemplateTestRun = {
  id: string;
  specId: string;
  revisionId: string | null;
  fileUrl: string;
  fileName: string | null;
  checks: TemplateCheck[];
  verdict: "pass" | "warn" | "fail" | "unverified";
  previewUrl: string | null;
  previewUrl2: string | null;
  createdAt: string;
  certifiedAt: string | null;
};

/** press_template_specs row (camelCase) + joined history. */
export type TemplateSpecWithHistory = {
  id: string;
  pressId: string;
  format: string; // 7_inch | 12_lp | 12_double | cassette | cd
  componentKey: string; // jacket | labels | inner_sleeve | booklet | shell | j_card | o_card | sticker
  variantKey: string | null;
  discCount: number;
  templateFileUrl: string | null;
  templateFileName: string | null;
  artboardWInches: number | null;
  artboardHInches: number | null;
  expectedPages: number | null;
  color: string | null;
  minPpi: number | null;
  bleedLineInches: number | null;
  printRules: Record<string, unknown> | null;
  measuredArtboardWInches: number | null;
  measuredArtboardHInches: number | null;
  measuredPages: number | null;
  measuredBleedLineInches: number | null;
  measuredHasCmyk: boolean | null;
  measuredHasRgb: boolean | null;
  measuredHasSpot: boolean | null;
  measuredHasLiveText: boolean | null;
  measuredHasEmbeddedFonts: boolean | null;
  measuredHasDieline: boolean | null;
  measuredError: string | null;
  revisions: TemplateRevision[];
  runs: TemplateTestRun[];
};

export type TemplatesPayload = {
  canEdit: boolean;
  specs: TemplateSpecWithHistory[];
};

/** Slot status derived for the index tiles. */
export type SlotStatus = "certified" | "pending" | "failed" | "empty";

export function slotStatus(spec: TemplateSpecWithHistory | undefined): SlotStatus {
  if (!spec || !spec.templateFileUrl) return "empty";
  const live = spec.revisions.find((r) => r.status === "certified" || r.status === "pending");
  if (live?.status === "certified") return "certified";
  const latestRun = spec.runs[0];
  if (latestRun && latestRun.verdict === "fail") return "failed";
  return "pending";
}
