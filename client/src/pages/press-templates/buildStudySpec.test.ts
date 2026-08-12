// Task #3060 — the template preview must reflect the uploaded file's
// measured facts and the slot's product type, never default label geometry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStudySpec, foldLinesFor, INCHES_TO_MM } from "./buildStudySpec";
import type { TemplateSpecWithHistory } from "./types";

function makeSpec(over: Partial<TemplateSpecWithHistory>): TemplateSpecWithHistory {
  return {
    id: "spec-1",
    pressId: "press-1",
    format: "12_lp",
    componentKey: "jacket",
    variantKey: "single",
    discCount: 0,
    templateFileUrl: "/objects/uploads/x",
    templateFileName: "template.pdf",
    artboardWInches: null,
    artboardHInches: null,
    expectedPages: null,
    color: null,
    minPpi: null,
    bleedLineInches: null,
    printRules: null,
    measuredArtboardWInches: null,
    measuredArtboardHInches: null,
    measuredPages: null,
    measuredBleedLineInches: null,
    measuredHasCmyk: null,
    measuredHasRgb: null,
    measuredHasSpot: null,
    measuredHasLiveText: null,
    measuredHasEmbeddedFonts: null,
    measuredHasDieline: null,
    measuredError: null,
    revisions: [],
    runs: [],
    ...over,
  };
}

// 779.4 × 539.3 mm in inches — the real 3D gusseted jacket measurements.
const GUSSET_W = 779.4 / 25.4;
const GUSSET_H = 539.3 / 25.4;

test("wide single-page jacket: rectangle at true aspect, no Hole chip, honest caption", () => {
  const spec = makeSpec({
    componentKey: "jacket",
    variantKey: "single",
    templateFileName: "12in Single 3D Jacket with Gusseted Pocket.pdf",
    measuredArtboardWInches: GUSSET_W,
    measuredArtboardHInches: GUSSET_H,
    measuredPages: 1,
    measuredBleedLineInches: 0.125,
  });
  const s = buildStudySpec(spec, "Single jacket", '12" LP');

  assert.equal(s.shape, "square");
  assert.equal(s.panels?.length, 1);
  const panel = s.panels![0];
  assert.ok(Math.abs((panel.aspect ?? 1) - GUSSET_W / GUSSET_H) < 1e-9, "panel keeps the page's true aspect");
  assert.equal(panel.foldLines, undefined, "no borrowed fold lines");
  assert.ok(s.caption.includes("779.4 × 539.3 mm"), `caption states measured mm: ${s.caption}`);
  assert.ok(s.caption.includes("1 page"), `caption states real page count: ${s.caption}`);
  const ids = (s.zones ?? []).map((z) => z.id);
  assert.ok(!ids.includes("hole"), "no Hole zone on a jacket");
  assert.ok(ids.includes("bleed") && ids.includes("cut"), "bleed/cut only");
  assert.equal(s.footnote, "Fold and pocket lines pending spec");
});

test("labels: circle with Bleed/Cut/Safe/Hole, hole ring scaled to the artboard", () => {
  const spec = makeSpec({
    componentKey: "labels",
    variantKey: "",
    measuredArtboardWInches: 3.875,
    measuredArtboardHInches: 3.875,
    measuredPages: 2,
    bleedLineInches: 0.125,
    printRules: { safetyMarginInches: 0.125 },
  });
  const s = buildStudySpec(spec, "Center labels", '12" LP');

  assert.equal(s.shape, "circle");
  assert.deepEqual((s.zones ?? []).map((z) => z.id), ["bleed", "cut", "safe", "hole"]);
  const hole = s.zones!.find((z) => z.id === "hole")!;
  assert.ok(hole.centered && hole.centered.length === 1, "hole is a centered ring");
  assert.ok(hole.detail.includes(`${INCHES_TO_MM(0.286)} mm`), "hole detail states the spindle size");
  assert.equal(s.panels?.length, 2, "one panel per real page");
  assert.equal(s.footnote, undefined, "labels never claim pending fold spec");
});

test("non-square measured label PDF: panel stays a 1:1 circle, caption stays honest", () => {
  // MRP's real 12" label template measures 6.5 × 7.6811 in per page.
  const spec = makeSpec({
    componentKey: "labels",
    variantKey: "",
    measuredArtboardWInches: 6.5,
    measuredArtboardHInches: 7.6811,
    measuredPages: 4,
  });
  const s = buildStudySpec(spec, "Center labels", '12" LP');
  assert.equal(s.shape, "circle");
  assert.equal(s.panels?.length, 4);
  for (const p of s.panels!) {
    assert.equal(p.aspect ?? 1, 1, "label panel never stretches into an ellipse");
  }
  assert.ok(s.caption.includes(`${INCHES_TO_MM(6.5)} × ${INCHES_TO_MM(7.6811)} mm`), `caption states page size: ${s.caption}`);
});

test("gatefold jacket: spine fold line from the variant spec, no pending note", () => {
  const spec = makeSpec({
    componentKey: "jacket",
    variantKey: "gatefold",
    measuredArtboardWInches: 24.25,
    measuredArtboardHInches: 12.25,
    measuredPages: 2,
  });
  const s = buildStudySpec(spec, "Gatefold jacket", '12" LP');
  const ids = (s.zones ?? []).map((z) => z.id);
  assert.ok(ids.includes("fold"), "fold zone present");
  assert.ok(!ids.includes("hole"));
  assert.deepEqual(s.panels![0].foldLines, ["50%"], "spine at the center of the spread");
  assert.equal(s.footnote, undefined);
});

test("measured values win over operator-entered; operator fills in only when absent", () => {
  const measured = makeSpec({
    artboardWInches: 12,
    artboardHInches: 12,
    expectedPages: 2,
    measuredArtboardWInches: GUSSET_W,
    measuredArtboardHInches: GUSSET_H,
    measuredPages: 1,
  });
  const s1 = buildStudySpec(measured, "Single jacket", '12" LP');
  assert.ok(s1.caption.includes("779.4 × 539.3 mm"));
  assert.equal(s1.panels?.length, 1);

  const operatorOnly = makeSpec({ artboardWInches: 12, artboardHInches: 12, expectedPages: 2 });
  const s2 = buildStudySpec(operatorOnly, "Single jacket", '12" LP');
  assert.ok(s2.caption.includes("304.8 × 304.8 mm"));
  assert.equal(s2.panels?.length, 2);
});

test("conflicting bleed: measured bleed wins in the preview; operator value fills in only when unmeasured", () => {
  const conflicting = makeSpec({ bleedLineInches: 0.25, measuredBleedLineInches: 0.125 });
  const s1 = buildStudySpec(conflicting, "Single jacket", '12" LP');
  const bleed1 = s1.zones!.find((z) => z.id === "bleed")!;
  assert.ok(bleed1.detail.startsWith(`${INCHES_TO_MM(0.125)} mm`), `measured bleed shown: ${bleed1.detail}`);

  const operatorOnly = makeSpec({ bleedLineInches: 0.25 });
  const s2 = buildStudySpec(operatorOnly, "Single jacket", '12" LP');
  const bleed2 = s2.zones!.find((z) => z.id === "bleed")!;
  assert.ok(bleed2.detail.startsWith(`${INCHES_TO_MM(0.25)} mm`), `operator fallback shown: ${bleed2.detail}`);
});

test("no phantom pages: zero measured/expected pages renders zero panels and no page caption", () => {
  const spec = makeSpec({ templateFileName: "empty.pdf" });
  const s = buildStudySpec(spec, "Single jacket", '12" LP');
  assert.equal(s.panels?.length, 0);
  assert.ok(!s.caption.includes("page"), `caption claims no pages: ${s.caption}`);
  assert.equal(s.footnote, undefined, "no pending-spec note when there is nothing to draw");
});

test("foldLinesFor: only jacket variants with a known spec", () => {
  assert.deepEqual(foldLinesFor({ componentKey: "jacket", variantKey: "gatefold" }), ["50%"]);
  assert.deepEqual(foldLinesFor({ componentKey: "jacket", variantKey: "gatefold_oldstyle" }), ["50%"]);
  assert.equal(foldLinesFor({ componentKey: "jacket", variantKey: "single" }), null);
  assert.equal(foldLinesFor({ componentKey: "jacket", variantKey: "widespine" }), null);
  assert.equal(foldLinesFor({ componentKey: "inner_sleeve", variantKey: "" }), null);
});
