// Task #3060 — build the PrintedAreasStudy spec from what's REALLY in the
// uploaded template file + the product type of the catalog slot. The preview
// must never default to center-label geometry: labels get the circle with
// Bleed/Cut/Safe/Hole; everything else is a rectangle at the file's true
// aspect ratio, with fold/score lines only where a fold spec exists for that
// exact variant. Panels are one-per-real-page, captions state the measured
// facts, and nothing is fabricated.
import type { StudySpec, StudyZone, StudyPanel } from "@/components/press/PrintedAreasStudy";
import { guidesHaveGeometry, type GuideEdges, type MeasuredTemplateGuides } from "@shared/templateGuides";
import type { TemplateSpecWithHistory } from "./types";

export const INCHES_TO_MM = (n: number) => Math.round(n * 25.4 * 10) / 10;

/** Standard vinyl spindle hole — 7.26 mm (0.286″). Drawn only on labels. */
const SPINDLE_HOLE_INCHES = 0.286;

// Product types that physically fold or carry a pocket — when we have no
// fold/pocket geometry spec for the exact variant, the preview says so
// instead of borrowing another product's lines.
const FOLDED_COMPONENTS = new Set(["jacket", "inner_sleeve", "booklet", "j_card", "o_card"]);

// Task #3156 — multi-up label templates (e.g. Hellbender's two-up 12" page,
// 215.8 × 107.8 mm with Side A / Side B dies side by side). The single-die
// circle model assumes the page IS the die; a page whose aspect is far from
// square carries more than one die, and forcing it into a 1:1 circle both
// crops the render and paints an invented page-spanning oval. Detection is
// aspect-based (we have no per-die centers client-side): beyond this ratio
// the page cannot be one circular die. MRP's real single-die label page is
// 6.5 × 7.6811 in (ratio ≈ 1.18) and must stay on the circle model.
const LABEL_MULTI_UP_RATIO = 1.45;

/** True when a labels page's measured dims can't be a single circular die. */
function isMultiUpLabelPage(w: number | null | undefined, h: number | null | undefined): boolean {
  if (typeof w !== "number" || typeof h !== "number" || !(w > 0 && h > 0)) return false;
  return Math.max(w, h) / Math.min(w, h) > LABEL_MULTI_UP_RATIO;
}

/**
 * Fold/score line spec for the slot's exact product variant, as left-%
 * positions across the flat spread. Only variants whose fold geometry we
 * actually know return lines — gatefold spreads fold at the center spine.
 * Everything else (single, widespine, gusseted pockets, …) has no spec yet
 * and must NOT inherit these.
 */
export function foldLinesFor(spec: Pick<TemplateSpecWithHistory, "componentKey" | "variantKey">): string[] | null {
  if (spec.componentKey !== "jacket") return null;
  if (spec.variantKey === "gatefold" || spec.variantKey === "gatefold_oldstyle") return ["50%"];
  return null;
}

/** Shared template-derived geometry: zones, shape, aspect, dims — the ONE
 *  source of truth for both the template preview and the certification
 *  proof view (rings always come from the TEMPLATE, never the artwork). */
// Task #3097 — turn guide edge insets (inches from each artboard edge) into
// a CSS inset string for the zone ring: "top right bottom left" percents.
function guideInsetPct(e: GuideEdges, w: number, h: number): string {
  const pct = (v: number, dim: number) => `${Math.round((v / dim) * 1000) / 10}%`;
  return `${pct(e.top, h)} ${pct(e.right, w)} ${pct(e.bottom, h)} ${pct(e.left, w)}`;
}

/** The spec row's measured dieline guides, when they carry drawable geometry. */
function measuredGuidesOf(spec: TemplateSpecWithHistory): MeasuredTemplateGuides | null {
  const g = (spec.measuredGuides ?? null) as MeasuredTemplateGuides | null;
  return guidesHaveGeometry(g) ? g : null;
}

function templateGeometry(spec: TemplateSpecWithHistory): {
  zones: StudyZone[];
  shape: "circle" | "square";
  isLabel: boolean;
  aspect: number;
  mmDims: string | null;
  pages: number;
  foldLines: string[] | null;
  foldLinesY: string[] | null;
} {
  const zones: StudyZone[] = [];
  const printRules = (spec.printRules ?? {}) as Record<string, unknown>;
  const isLabelComponent = spec.componentKey === "labels";

  // The uploaded file drives the panel: measured dimensions + page count win;
  // operator-entered values fill in only when measurement is absent.
  const w = spec.measuredArtboardWInches ?? spec.artboardWInches;
  const h = spec.measuredArtboardHInches ?? spec.artboardHInches;
  const pages = spec.measuredPages ?? spec.expectedPages ?? 0;

  // Task #3156 — a labels page whose aspect can't be one circular die (two-up
  // pages like Hellbender's) drops the circle model entirely: the page renders
  // at its TRUE aspect with rectangular rings and no Hole ring, never a
  // fabricated page-spanning oval. Single-die labels keep the circle.
  const isLabel = isLabelComponent && !isMultiUpLabelPage(w, h);
  const shape: "circle" | "square" = isLabel ? "circle" : "square";

  const mmDims =
    typeof w === "number" && typeof h === "number"
      ? `${INCHES_TO_MM(w)} × ${INCHES_TO_MM(h)} mm`
      : typeof w === "number"
        ? `${INCHES_TO_MM(w)} mm`
        : null;

  // Task #3097 — guide geometry measured out of the template's own dieline
  // separation. When present, the rings sit exactly where the PDF draws its
  // guides (labels keep the concentric-circle model — the die is circular,
  // guide rectangles don't map onto it).
  // Labels — single-die AND multi-up — never consume guide rectangles: on a
  // circle they don't map, and on a multi-die page the classifier's merged
  // bounding boxes could span multiple dies (Task #3156 — bail conservatively).
  const guides = !isLabelComponent && typeof w === "number" && typeof h === "number" && w > 0 && h > 0 ? measuredGuidesOf(spec) : null;

  // Bleed line: like the dims/pages above, the PREVIEW shows what's in the
  // uploaded file — measured first (box metadata, then dieline guides),
  // operator-entered only when measurement is absent. (Checks/validators
  // keep their own operator-wins resolution; this surface's contract is
  // "what the PDF actually contains".)
  const bleed = spec.measuredBleedLineInches ?? guides?.bleedLineInches ?? spec.bleedLineInches;
  if (guides?.bleed) {
    zones.push({
      id: "bleed",
      word: "Bleed",
      detail: `${typeof bleed === "number" ? `${INCHES_TO_MM(bleed)} mm — ` : ""}art must reach`,
      inset: guideInsetPct(guides.bleed, w as number, h as number),
    });
  } else if (typeof bleed === "number") {
    zones.push({ id: "bleed", word: "Bleed", detail: `${INCHES_TO_MM(bleed)} mm — art must reach`, inset: "0%" });
  }
  if (guides?.cut) {
    const cutW = (w as number) - guides.cut.left - guides.cut.right;
    const cutH = (h as number) - guides.cut.top - guides.cut.bottom;
    zones.push({
      id: "cut",
      word: "Cut",
      detail: `${INCHES_TO_MM(cutW)} × ${INCHES_TO_MM(cutH)} mm — trimmed edge`,
      inset: guideInsetPct(guides.cut, w as number, h as number),
    });
  } else if (typeof w === "number") {
    zones.push({ id: "cut", word: "Cut", detail: `${mmDims} — trimmed edge`, inset: "3.5%" });
  }
  // Task #3101 — operator-entered fold/safety geometry, for templates whose
  // PDFs carry no readable guides. Operator values ALWAYS win over measured
  // guides where they overlap (the spec row's operator-wins convention).
  const opFoldX = Array.isArray(spec.foldXInches) && spec.foldXInches.length > 0 ? spec.foldXInches : null;
  const opFoldY = Array.isArray(spec.foldYInches) && spec.foldYInches.length > 0 ? spec.foldYInches : null;
  const opSafety = typeof spec.safetyInsetInches === "number" ? spec.safetyInsetInches : null;

  const safety = typeof printRules.safetyMarginInches === "number" ? (printRules.safetyMarginInches as number) : undefined;
  if (opSafety != null && typeof w === "number" && typeof h === "number" && w > 0 && h > 0) {
    // Safety inset is inches per side INSIDE the cut line: measured cut
    // edges when the dieline gave us any, else the bleed line (artboard →
    // trim) as the cut basis.
    const cutBase = guides?.cut ?? null;
    const edge = (typeof bleed === "number" ? bleed : 0) + opSafety;
    const e: GuideEdges = cutBase
      ? { top: cutBase.top + opSafety, right: cutBase.right + opSafety, bottom: cutBase.bottom + opSafety, left: cutBase.left + opSafety }
      : { top: edge, right: edge, bottom: edge, left: edge };
    zones.push({
      id: "safe",
      word: "Safe",
      detail: `${INCHES_TO_MM(opSafety)} mm — text stays inside`,
      inset: guideInsetPct(e, w, h),
    });
  } else if (guides?.safety) {
    const safeMm = guides.safetyInsetInches ?? safety;
    zones.push({
      id: "safe",
      word: "Safe",
      detail: `${typeof safeMm === "number" ? `${INCHES_TO_MM(safeMm)} mm — ` : ""}text stays inside`,
      inset: guideInsetPct(guides.safety, w as number, h as number),
    });
  } else if (typeof safety === "number") {
    zones.push({ id: "safe", word: "Safe", detail: `${INCHES_TO_MM(safety)} mm — text stays inside`, inset: "8%" });
  }
  // Hole ring — labels ONLY, sized from the real artboard so the ring is to
  // scale. Never drawn on jackets/sleeves/cards.
  if (isLabel && typeof w === "number" && w > 0) {
    const pct = Math.min(60, Math.max(2, (SPINDLE_HOLE_INCHES / w) * 100));
    zones.push({
      id: "hole",
      word: "Hole",
      detail: `${INCHES_TO_MM(SPINDLE_HOLE_INCHES)} mm — spindle hole`,
      centered: [`${Math.round(pct * 10) / 10}%`],
    });
  }

  // Fold/score lines — operator-entered positions win (Task #3101), then
  // measured score lines from the dieline; otherwise only where a spec
  // exists for this exact variant (gatefold inference).
  const pctOf = (v: number, dim: number) => `${Math.round((v / dim) * 1000) / 10}%`;
  const opFoldLines =
    opFoldX && typeof w === "number" && w > 0 ? opFoldX.map((x) => pctOf(x, w)) : null;
  const opFoldLinesY =
    opFoldY && typeof h === "number" && h > 0 ? opFoldY.map((y) => pctOf(y, h)) : null;
  const guideFoldX =
    guides && guides.foldXInches.length > 0 ? guides.foldXInches.map((x) => pctOf(x, w as number)) : null;
  const guideFoldY =
    guides && guides.foldYInches.length > 0 ? guides.foldYInches.map((y) => pctOf(y, h as number)) : null;
  const foldLines = opFoldLines ?? guideFoldX ?? foldLinesFor(spec);
  const foldLinesY = opFoldLinesY ?? guideFoldY;
  if (foldLines || foldLinesY) {
    zones.push({
      id: "fold",
      word: "Fold",
      detail:
        opFoldLines || opFoldLinesY || guideFoldX || guideFoldY
          ? "Score lines — folds here"
          : "Spine — spread folds here",
      fold: true,
    });
  }

  // Panels render at the file's true aspect ratio — except labels, whose die
  // is circular: the panel stays a 1:1 circle regardless of the PDF's page
  // rectangle (the caption still states the measured page).
  const aspect = !isLabel && typeof w === "number" && typeof h === "number" && h > 0 ? w / h : 1;

  return { zones, shape, isLabel, aspect, mmDims, pages, foldLines, foldLinesY };
}

export function buildStudySpec(spec: TemplateSpecWithHistory, lead: string, rest: string): StudySpec {
  const { zones, shape, isLabel, aspect, mmDims, pages, foldLines, foldLinesY } = templateGeometry(spec);

  // One panel per REAL page. Task #3099 — each panel shows the template
  // PDF's own rendered page under the rings (Ruby's mockup); a page whose
  // render failed stays an honest blank panel, never a borrowed image.
  const previews = spec.previewUrls ?? [];
  const panels: StudyPanel[] = [];
  for (let i = 0; i < Math.min(Math.max(pages, 0), 8); i++) {
    panels.push({
      label: `Page ${i + 1}`,
      sub: mmDims ?? undefined,
      img: previews[i] ?? undefined,
      aspect,
      foldLines: foldLines ?? undefined,
      foldLinesY: foldLinesY ?? undefined,
    });
  }

  // Honest caption: filename + measured facts, nothing more.
  const facts = [
    spec.templateFileName,
    mmDims,
    pages > 0 ? `${pages} ${pages === 1 ? "page" : "pages"}` : null,
  ].filter(Boolean) as string[];
  const caption = facts.length > 0 ? facts.join(" · ") : `${lead} · ${rest}`;

  // Foldable product with no fold source yet (neither measured score lines
  // nor a variant fold spec): say so, don't borrow.
  const footnote =
    !isLabel && FOLDED_COMPONENTS.has(spec.componentKey) && !foldLines && !foldLinesY && panels.length > 0
      ? "Fold and pocket lines pending spec"
      : undefined;

  const defaultZone = zones.find((z) => z.id === "safe")?.id ?? zones[0]?.id ?? "";

  return { title: "Template.", titleRest: `${lead} ${rest}`, caption, shape, defaultZone, zones, panels, footnote };
}

// Task #3090 — the certification PROOF variant (`*Niina` studies): the run's
// rendered ARTWORK is the image under the rings, but every zone ring still
// comes from the TEMPLATE's measured/entered geometry — identical to the
// template preview above it, never derived from the artwork. Returns null
// when the run has no renderable image yet (the row degrades to the checks
// list — no broken panel).
// Per-zone ✓/✕ status on the proof chips (Ruby's certification mock):
// ONLY where a run check maps cleanly onto a ring, and never from advisory
// rows (they always "pass" without machine-verifying anything — a ✓ would
// overclaim). Zones with no mapped machine check stay status-less.
const ZONE_CHECK_KEYS: Record<string, string> = {
  bleed: "tmpl.bleed",
  cut: "tmpl.size",
  safe: "tmpl.safety",
};

export function buildProofSpec(
  spec: TemplateSpecWithHistory,
  run: {
    fileName: string | null;
    fileUrl: string;
    previewUrl: string | null;
    previewUrl2: string | null;
    checks?: { key: string; status: string; tier?: string }[];
  },
  lead: string,
  rest: string,
): StudySpec | null {
  if (!run.previewUrl) return null;
  const { zones: baseZones, shape, isLabel, aspect, mmDims, foldLines, foldLinesY } = templateGeometry(spec);

  const zones: StudyZone[] = baseZones.map((z) => {
    const key = ZONE_CHECK_KEYS[z.id];
    if (!key) return z;
    const check = (run.checks ?? []).find((c) => c.key === key && c.tier !== "advisory");
    if (!check) return z;
    if (check.status === "pass") return { ...z, status: "ok" as const };
    if (check.status === "fail" || check.status === "warn") return { ...z, status: "attention" as const };
    return z; // unverified — no claim either way
  });

  // Labels get one circle per rendered face (Side A / Side B, Niina-style);
  // everything else is one panel at the template's true aspect ratio.
  const panels: StudyPanel[] = [];
  if (isLabel) {
    panels.push({ label: "Side A", sub: mmDims ?? undefined, img: run.previewUrl, aspect: 1 });
    if (run.previewUrl2) {
      panels.push({ label: "Side B", sub: mmDims ?? undefined, img: run.previewUrl2, aspect: 1 });
    }
  } else {
    panels.push({
      label: foldLines ? "Spread" : "Page 1",
      sub: mmDims ?? undefined,
      img: run.previewUrl,
      aspect,
      foldLines: foldLines ?? undefined,
      foldLinesY: foldLinesY ?? undefined,
    });
  }

  // Proof-style caption: the test file, then whose zones it sits under.
  const testName = run.fileName ?? run.fileUrl.split("/").pop() ?? "Test file";
  const zonesName = spec.templateFileName ?? `${lead} ${rest}`;
  const caption = `${testName} · ${zonesName} zones · ${panels.length === 2 ? "2 pages → 2 areas" : foldLines ? "1 page → 1 spread" : "1 page → 1 panel"}`;

  const defaultZone = zones.find((z) => z.id === "safe")?.id ?? zones[0]?.id ?? "";
  return { title: "Proof.", titleRest: `${lead} ${rest}`, caption, shape, defaultZone, zones, panels };
}
