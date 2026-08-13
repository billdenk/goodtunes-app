// Task #3097 — measured dieline-guide facts extracted from a press template
// PDF's "does not print" spot separation (e.g. "MRP DIELINE - Does Not
// Print"). Real vendor templates export TrimBox == MediaBox, so the box-
// metadata bleed path reads nothing; the guides themselves are vector
// strokes in a dieline separation. The server-side scanner classifies them
// conservatively (nested boundary rings → bleed/cut/safety; deep-interior
// full-span lines → fold/score) and persists the result on the spec row's
// measured_guides jsonb so the Printed-areas study can draw the full
// Bleed/Cut/Safe/Fold view. All values are INCHES relative to the artboard
// (MediaBox): edge values are per-side insets from the artboard edge, fold
// positions measure from the artboard's left (X) / top (Y) edge.
//
// A row that was guide-scanned but whose PDF carries no classifiable guides
// stores the object with null zones/empty folds (NOT null): jsonb NULL means
// "never guide-scanned" and drives the one-time re-measure backfill.

/** Per-side insets from the artboard edges, in inches. */
export type GuideEdges = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type MeasuredTemplateGuides = {
  version: 1;
  /** Decoded names of the guide separations the geometry came from. */
  sepNames: string[];
  /** Outer bleed boundary (art must reach) — null when not drawn/classified. */
  bleed: GuideEdges | null;
  /** Cut / die boundary (bounding box of the die outline). */
  cut: GuideEdges | null;
  /** Safety boundary (union of the per-panel safety rectangles). */
  safety: GuideEdges | null;
  /** Vertical fold/score lines — inches from the artboard's LEFT edge. */
  foldXInches: number[];
  /** Horizontal fold/score lines — inches from the artboard's TOP edge. */
  foldYInches: number[];
  /** Min per-side distance bleed → cut (the template's drawn bleed line). */
  bleedLineInches: number | null;
  /** Min per-side distance cut → safety. */
  safetyInsetInches: number | null;
};

/** True when the guides object carries anything the study can draw. */
export function guidesHaveGeometry(g: MeasuredTemplateGuides | null | undefined): g is MeasuredTemplateGuides {
  if (!g || g.version !== 1) return false;
  return !!(g.cut || g.bleed || g.safety || g.foldXInches?.length || g.foldYInches?.length);
}

/** The honest "scanned, nothing found" object (never persist plain null). */
export function emptyMeasuredGuides(): MeasuredTemplateGuides {
  return {
    version: 1,
    sepNames: [],
    bleed: null,
    cut: null,
    safety: null,
    foldXInches: [],
    foldYInches: [],
    bleedLineInches: null,
    safetyInsetInches: null,
  };
}
