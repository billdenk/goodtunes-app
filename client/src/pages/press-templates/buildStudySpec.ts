// Task #3060 — build the PrintedAreasStudy spec from what's REALLY in the
// uploaded template file + the product type of the catalog slot. The preview
// must never default to center-label geometry: labels get the circle with
// Bleed/Cut/Safe/Hole; everything else is a rectangle at the file's true
// aspect ratio, with fold/score lines only where a fold spec exists for that
// exact variant. Panels are one-per-real-page, captions state the measured
// facts, and nothing is fabricated.
import type { StudySpec, StudyZone, StudyPanel } from "@/components/press/PrintedAreasStudy";
import type { TemplateSpecWithHistory } from "./types";

export const INCHES_TO_MM = (n: number) => Math.round(n * 25.4 * 10) / 10;

/** Standard vinyl spindle hole — 7.26 mm (0.286″). Drawn only on labels. */
const SPINDLE_HOLE_INCHES = 0.286;

// Product types that physically fold or carry a pocket — when we have no
// fold/pocket geometry spec for the exact variant, the preview says so
// instead of borrowing another product's lines.
const FOLDED_COMPONENTS = new Set(["jacket", "inner_sleeve", "booklet", "j_card", "o_card"]);

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

export function buildStudySpec(spec: TemplateSpecWithHistory, lead: string, rest: string): StudySpec {
  const zones: StudyZone[] = [];
  const printRules = (spec.printRules ?? {}) as Record<string, unknown>;
  const isLabel = spec.componentKey === "labels";
  const shape: "circle" | "square" = isLabel ? "circle" : "square";

  // The uploaded file drives the panel: measured dimensions + page count win;
  // operator-entered values fill in only when measurement is absent.
  const w = spec.measuredArtboardWInches ?? spec.artboardWInches;
  const h = spec.measuredArtboardHInches ?? spec.artboardHInches;
  const pages = spec.measuredPages ?? spec.expectedPages ?? 0;

  const mmDims =
    typeof w === "number" && typeof h === "number"
      ? `${INCHES_TO_MM(w)} × ${INCHES_TO_MM(h)} mm`
      : typeof w === "number"
        ? `${INCHES_TO_MM(w)} mm`
        : null;

  // Bleed line: like the dims/pages above, the PREVIEW shows what's in the
  // uploaded file — measured first, operator-entered only when measurement is
  // absent. (Checks/validators keep their own operator-wins resolution; this
  // surface's contract is "what the PDF actually contains".)
  const bleed = spec.measuredBleedLineInches ?? spec.bleedLineInches;
  if (typeof bleed === "number") {
    zones.push({ id: "bleed", word: "Bleed", detail: `${INCHES_TO_MM(bleed)} mm — art must reach`, inset: "0%" });
  }
  if (typeof w === "number") {
    zones.push({ id: "cut", word: "Cut", detail: `${mmDims} — trimmed edge`, inset: "3.5%" });
  }
  const safety = typeof printRules.safetyMarginInches === "number" ? (printRules.safetyMarginInches as number) : undefined;
  if (typeof safety === "number") {
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

  // Fold/score lines — only where a spec exists for this exact variant.
  const foldLines = foldLinesFor(spec);
  if (foldLines) {
    zones.push({ id: "fold", word: "Fold", detail: "Spine — spread folds here", fold: true });
  }

  // One panel per REAL page, each at the file's true aspect ratio — except
  // labels, whose die is circular: the panel stays a 1:1 circle regardless of
  // the PDF's page rectangle (the caption still states the measured page).
  const aspect = !isLabel && typeof w === "number" && typeof h === "number" && h > 0 ? w / h : 1;
  const panels: StudyPanel[] = [];
  for (let i = 0; i < Math.min(Math.max(pages, 0), 8); i++) {
    panels.push({
      label: `Page ${i + 1}`,
      sub: mmDims ?? undefined,
      aspect,
      foldLines: foldLines ?? undefined,
    });
  }

  // Honest caption: filename + measured facts, nothing more.
  const facts = [
    spec.templateFileName,
    mmDims,
    pages > 0 ? `${pages} ${pages === 1 ? "page" : "pages"}` : null,
  ].filter(Boolean) as string[];
  const caption = facts.length > 0 ? facts.join(" · ") : `${lead} · ${rest}`;

  // Foldable product with no fold/pocket spec yet: say so, don't borrow.
  const footnote =
    !isLabel && FOLDED_COMPONENTS.has(spec.componentKey) && !foldLines && panels.length > 0
      ? "Fold and pocket lines pending spec"
      : undefined;

  const defaultZone = zones.find((z) => z.id === "safe")?.id ?? zones[0]?.id ?? "";

  return { title: "Template.", titleRest: `${lead} ${rest}`, caption, shape, defaultZone, zones, panels, footnote };
}
