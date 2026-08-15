// Press-templates flow (Ruby handoff wiring) — one shared contract for the
// Templates index / upload / ingestion / certification screens. Mirrors the
// press-portal API in server/pressTemplatesPortal.ts exactly.
import type { MeasuredTemplateGuides } from "@shared/templateGuides";

export type { MeasuredTemplateGuides };

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
  status: "pending" | "certified" | "superseded" | "archived" | "review";
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
  // Task #3097 — guide geometry extracted from the template's own dieline
  // separation (bleed/cut/safety rings + fold/score lines). Null/absent =
  // never guide-scanned; an object with null zones = scanned, none drawn.
  measuredGuides?: MeasuredTemplateGuides | null;
  // Task #3099 — rendered PNGs of the template file's own pages, one per
  // page. null = never rendered (server backfills lazily on view); [] =
  // rasterize genuinely failed (honest blank panel, no fabrication).
  previewUrls?: string[] | null;
  measuredError: string | null;
  // Task #3101 — operator-entered fold/score positions (inches from the
  // artboard's left/top edge) + safety inset (inches per side inside the
  // cut line). Set on the detail screen when the PDF has no readable
  // guides; ALWAYS wins over measuredGuides where they overlap. Kept on
  // template replace (product geometry, not file geometry).
  foldXInches?: number[] | null;
  foldYInches?: number[] | null;
  safetyInsetInches?: number | null;
  // Task #3065 — option families this ONE template file covers (e.g. small
  // + large center-label holes). Stamped only after the operator confirms
  // the detection prompt; null/absent = single-option template.
  variantOptions?: Array<{ key: string; label: string }> | null;
  revisions: TemplateRevision[];
  runs: TemplateTestRun[];
};

/** Task #3065 — operator-defined template slot (press_custom_template_slots). */
export type CustomTemplateSlot = {
  id: string;
  pressId: string;
  format: string;
  slotKey: string; // "custom_<slug>" — the spec row's componentKey
  displayName: string;
  note: string | null;
  iconKind: "jacket" | "sleeve" | "labels" | "booklet" | string;
  createdAt: string;
};

/** press_live_template_tests row — one art file's verdict in the trail. */
export type LiveTemplateTest = {
  id: string;
  liveTemplateId: string;
  artName: string;
  verdict: string; // "Pass" | "Flagged" | "Visual only"
  testedAt: string;
};

/** press_live_templates row (saved shelf on the Templates page) + trail. */
export type LiveTemplate = {
  id: string;
  pressId: string;
  name: string;
  component: string | null;
  fileUrl: string;
  fileName: string | null;
  previewImg: string | null; // small page-1 data URL
  wMm: number | null;
  hMm: number | null;
  layerCount: number;
  // Archived off the shelf (Bill, Aug 15 2026) — history, never deletion.
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tests: LiveTemplateTest[];
};

export type TemplatesPayload = {
  canEdit: boolean;
  customSlots?: CustomTemplateSlot[];
  liveTemplates?: LiveTemplate[];
  specs: TemplateSpecWithHistory[];
  // Standard slots this press archived off the shelf ("Archived — not
  // offered"), keyed "format:componentKey:variantKey:discCount".
  archivedSlots?: string[];
};

/** Human note for a multi-option template ("small / large hole" canon case). */
export function variantOptionsNote(options: Array<{ key: string; label: string }>): string {
  const keys = options.map((o) => o.key).sort();
  if (keys.length === 2 && keys[0] === "large_hole" && keys[1] === "small_hole") {
    return "One template — serves both small and large holes";
  }
  return `One template — covers ${options.map((o) => o.label.toLowerCase()).join(" and ")}`;
}

/** Slot status derived for the index tiles. */
export type SlotStatus = "certified" | "pending" | "failed" | "empty" | "review";

export function slotStatus(spec: TemplateSpecWithHistory | undefined): SlotStatus {
  if (!spec || !spec.templateFileUrl) return "empty";
  const live = spec.revisions.find((r) => r.status === "certified" || r.status === "pending");
  // Auto-imported legacy uploads that couldn't be confidently matched to
  // this slot sit in "review" until the press re-attaches or archives.
  if (!live && spec.revisions.some((r) => r.status === "review")) return "review";
  if (live?.status === "certified") return "certified";
  // A failed finished-file run only fails the tile if it tested the file
  // that's live NOW. A run pinned to (or predating) a superseded revision
  // is history — replacing the template must clear the red chip, not
  // inherit a verdict from a file that no longer exists on the slot.
  const latestRun = spec.runs[0];
  const runIsCurrent =
    !!latestRun &&
    (latestRun.revisionId
      ? latestRun.revisionId === live?.id
      : !live?.createdAt || latestRun.createdAt >= live.createdAt);
  if (latestRun && latestRun.verdict === "fail" && runIsCurrent) return "failed";
  return "pending";
}
