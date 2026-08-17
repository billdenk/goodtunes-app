// Task #3060 — the template preview must reflect the uploaded file's
// measured facts and the slot's product type, never default label geometry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStudySpec, buildProofSpec, foldLinesFor, INCHES_TO_MM } from "./buildStudySpec";
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

// ---------------------------------------------------------------------------
// Task #3156 — two-up label pages (Hellbender's 12" template: 8.5 × 4.25 in,
// two circular dies side by side) must never be forced into a single-die
// circle or gain a fabricated page-spanning oval ring.
// ---------------------------------------------------------------------------
test("two-up labels: page renders at true aspect with rectangular rings, no Hole, no oval", () => {
  const spec = makeSpec({
    componentKey: "labels",
    variantKey: "",
    templateFileName: "GoodTunes_CenterLabels_12InchTemplate_HELLBENDER-2.pdf",
    measuredArtboardWInches: 8.5,
    measuredArtboardHInches: 4.25,
    measuredPages: 1,
    bleedLineInches: 0.125,
    printRules: { safetyMarginInches: 0.125 },
  });
  const s = buildStudySpec(spec, "Center labels", '12" LP');
  assert.equal(s.shape, "square", "multi-up label page drops the circle model — no oval");
  const ids = (s.zones ?? []).map((z) => z.id);
  assert.ok(!ids.includes("hole"), "no single spindle Hole ring on a two-up page");
  assert.ok(ids.includes("bleed") && ids.includes("cut") && ids.includes("safe"));
  assert.equal(s.panels?.length, 1);
  assert.ok(Math.abs((s.panels![0].aspect ?? 1) - 2) < 1e-9, "panel keeps the page's true 2:1 aspect");
  assert.ok(s.caption.includes(`${INCHES_TO_MM(8.5)} × ${INCHES_TO_MM(4.25)} mm`), s.caption);
  assert.equal(s.footnote, undefined, "labels never claim pending fold spec");
});

test("two-up labels: measured guides stay ignored (no merged multi-die bounding box)", () => {
  const spec = makeSpec({
    componentKey: "labels",
    variantKey: "",
    measuredArtboardWInches: 8.5,
    measuredArtboardHInches: 4.25,
    measuredPages: 1,
    bleedLineInches: 0.125,
    measuredGuides: JKTWS_GUIDES, // classifier output must never shape label rings
  });
  const s = buildStudySpec(spec, "Center labels", '12" LP');
  const bleed = s.zones!.find((z) => z.id === "bleed")!;
  assert.equal(bleed.inset, "0%", "rings stay page-edge insets, never guide-derived");
  const ids = (s.zones ?? []).map((z) => z.id);
  assert.ok(!ids.includes("fold"), "guide score lines never leak onto a label page");
});

test("two-up labels: proof view inherits the corrected geometry (true aspect, square)", () => {
  const spec = makeSpec({
    componentKey: "labels",
    variantKey: "",
    measuredArtboardWInches: 8.5,
    measuredArtboardHInches: 4.25,
    measuredPages: 1,
  });
  const run = {
    fileName: "labels.pdf",
    fileUrl: "/objects/uploads/run-src",
    previewUrl: "/objects/uploads/a.png",
    previewUrl2: null,
  };
  const proof = buildProofSpec(spec, run, "Center labels", '12" LP');
  assert.ok(proof);
  assert.equal(proof!.shape, "square");
  assert.ok(Math.abs((proof!.panels![0].aspect ?? 1) - 2) < 1e-9, "proof panel keeps the true aspect");
});

test("single-die labels near square (MRP 6.5 × 7.6811) keep the circle model", () => {
  const spec = makeSpec({
    componentKey: "labels",
    variantKey: "",
    measuredArtboardWInches: 6.5,
    measuredArtboardHInches: 7.6811,
    measuredPages: 4,
  });
  const s = buildStudySpec(spec, "Center labels", '12" LP');
  assert.equal(s.shape, "circle");
  assert.ok((s.zones ?? []).some((z) => z.id === "hole"));
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

// Task #3090 — certification proof view: artwork under TEMPLATE rings.
test("proof spec: run artwork panel, template-derived zones, Niina proof caption", () => {
  const spec = makeSpec({
    componentKey: "jacket",
    variantKey: "single",
    templateFileName: "12-JKTSG3D-100.pdf",
    measuredArtboardWInches: GUSSET_W,
    measuredArtboardHInches: GUSSET_H,
    measuredPages: 1,
    measuredBleedLineInches: 0.125,
    printRules: { safetyMarginInches: 0.25 },
  });
  const run = {
    fileName: "niina-jacket-final.pdf",
    fileUrl: "/objects/uploads/run-src",
    previewUrl: "/objects/uploads/preview-1.png",
    previewUrl2: null,
  };
  const proof = buildProofSpec(spec, run, "Single jacket", '12" LP');
  assert.ok(proof);
  assert.equal(proof!.title, "Proof.");
  // The artwork is the panel image; zones come from the TEMPLATE, matching
  // the template preview's ring set exactly.
  assert.equal(proof!.panels![0].img, "/objects/uploads/preview-1.png");
  const tmpl = buildStudySpec(spec, "Single jacket", '12" LP');
  assert.deepEqual(proof!.zones!.map((z) => z.id), tmpl.zones!.map((z) => z.id));
  // Proof caption names the test file AND whose zones it sits under.
  assert.match(proof!.caption!, /niina-jacket-final\.pdf/);
  assert.match(proof!.caption!, /12-JKTSG3D-100\.pdf zones/);
});

test("proof spec: two label faces render Side A / Side B circles", () => {
  const spec = makeSpec({
    componentKey: "labels",
    variantKey: "standard",
    measuredArtboardWInches: 4.646,
    measuredArtboardHInches: 4.646,
    measuredPages: 2,
  });
  const run = {
    fileName: "labels.pdf",
    fileUrl: "/objects/uploads/run-src",
    previewUrl: "/objects/uploads/a.png",
    previewUrl2: "/objects/uploads/b.png",
  };
  const proof = buildProofSpec(spec, run, "Center labels", '12" LP');
  assert.ok(proof);
  assert.equal(proof!.shape, "circle");
  assert.deepEqual(proof!.panels!.map((p) => p.label), ["Side A", "Side B"]);
  assert.match(proof!.caption!, /2 pages → 2 areas/);
});

test("proof spec: no rendered image → null (row degrades to checks list)", () => {
  const spec = makeSpec({ measuredPages: 1 });
  const run = { fileName: "x.pdf", fileUrl: "https://ext/x.pdf", previewUrl: null, previewUrl2: null };
  assert.equal(buildProofSpec(spec, run, "Single jacket", '12" LP'), null);
});

test("proof spec: run checks map onto zone chip statuses; advisory rows never claim ✓", () => {
  const spec = makeSpec({
    componentKey: "jacket",
    variantKey: "single",
    measuredArtboardWInches: GUSSET_W,
    measuredArtboardHInches: GUSSET_H,
    measuredPages: 1,
    measuredBleedLineInches: 0.125,
    printRules: { safetyMarginInches: 0.25 },
  });
  const run = {
    fileName: "x.pdf",
    fileUrl: "/objects/uploads/x",
    previewUrl: "/objects/uploads/p.png",
    previewUrl2: null,
    checks: [
      { key: "tmpl.bleed", status: "pass" },
      { key: "tmpl.size", status: "fail" },
      { key: "tmpl.safety", status: "pass", tier: "advisory" },
    ],
  };
  const proof = buildProofSpec(spec, run, "Single jacket", '12" LP');
  const byId = Object.fromEntries(proof!.zones!.map((z) => [z.id, z.status]));
  assert.equal(byId.bleed, "ok");
  assert.equal(byId.cut, "attention");
  assert.equal(byId.safe, undefined); // advisory — no machine claim
});

// ---------------------------------------------------------------------------
// Task #3097 — dieline guide facts drive Bleed/Cut/Safe/Fold rings.
// ---------------------------------------------------------------------------
const JKTWS_GUIDES = {
  version: 1,
  sepNames: ["MRP DIELINE - Does Not Print"],
  bleed: { left: 3.074, top: 3.073, right: 3.075, bottom: 3.08 },
  cut: { left: 3.2, top: 3.388, right: 3.203, bottom: 3.388 },
  safety: { left: 3.325, top: 3.524, right: 3.336, bottom: 3.515 },
  foldXInches: [15.584, 15.806],
  foldYInches: [],
  bleedLineInches: 0.126,
  safetyInsetInches: 0.125,
};

test("guides: widespine jacket renders Bleed/Cut/Safe/Fold, folds from score lines, no pending note", () => {
  const spec = makeSpec({
    componentKey: "jacket",
    variantKey: "widespine",
    templateFileName: "12-JKTWS-200.pdf",
    measuredArtboardWInches: 31.4058,
    measuredArtboardHInches: 19.1256,
    measuredPages: 1,
    measuredBleedLineInches: null, // TrimBox == MediaBox — box metadata gave nothing
    measuredGuides: JKTWS_GUIDES,
  });
  const s = buildStudySpec(spec, "Widespine jacket", '12" LP');
  const ids = (s.zones ?? []).map((z) => z.id);
  assert.deepEqual(ids, ["bleed", "cut", "safe", "fold"]);
  const bleed = s.zones!.find((z) => z.id === "bleed")!;
  // Four-value inset computed from the guide edges (top right bottom left).
  assert.match(String(bleed.inset), /^[\d.]+% [\d.]+% [\d.]+% [\d.]+%$/);
  assert.ok(bleed.detail.includes(`${INCHES_TO_MM(0.126)} mm`), bleed.detail);
  const safe = s.zones!.find((z) => z.id === "safe")!;
  assert.ok(safe.detail.includes(`${INCHES_TO_MM(0.125)} mm`), safe.detail);
  // Cut detail states the CUT dims (between the cut guides), not the artboard.
  const cut = s.zones!.find((z) => z.id === "cut")!;
  assert.ok(cut.detail.includes(`${INCHES_TO_MM(31.4058 - 3.2 - 3.203)} ×`), cut.detail);
  // Spine folds at the measured x positions (≈49.6% / 50.3%).
  const panel = s.panels![0];
  assert.equal(panel.foldLines?.length, 2);
  assert.equal(panel.foldLines![0], `${Math.round((15.584 / 31.4058) * 1000) / 10}%`);
  assert.equal(s.footnote, undefined, "measured folds suppress the pending-spec note");
});

test("guides: empty guide object (scanned, nothing drawn) behaves exactly like today", () => {
  const spec = makeSpec({
    componentKey: "jacket",
    variantKey: "widespine",
    measuredArtboardWInches: 31.4058,
    measuredArtboardHInches: 19.1256,
    measuredPages: 1,
    measuredGuides: {
      version: 1, sepNames: [], bleed: null, cut: null, safety: null,
      foldXInches: [], foldYInches: [], bleedLineInches: null, safetyInsetInches: null,
    },
  });
  const s = buildStudySpec(spec, "Widespine jacket", '12" LP');
  assert.deepEqual((s.zones ?? []).map((z) => z.id), ["cut"]);
  assert.equal(s.footnote, "Fold and pocket lines pending spec");
});

test("guides: labels keep the concentric-circle model even when guides exist", () => {
  const spec = makeSpec({
    componentKey: "labels",
    variantKey: "",
    measuredArtboardWInches: 3.875,
    measuredArtboardHInches: 3.875,
    measuredPages: 2,
    bleedLineInches: 0.125,
    measuredGuides: JKTWS_GUIDES, // pathological; must be ignored on circles
  });
  const s = buildStudySpec(spec, "Center labels", '12" LP');
  const bleed = s.zones!.find((z) => z.id === "bleed")!;
  assert.equal(bleed.inset, "0%", "circle rings stay concentric");
});

// ---------------------------------------------------------------------------
// Task #3101 — operator-entered fold/safety lines: rendered when no guides
// exist, and preferred over measured guides when both exist.
// ---------------------------------------------------------------------------
test("operator guides: folds + safety render with no measured guides, pending note clears", () => {
  const spec = makeSpec({
    componentKey: "jacket",
    variantKey: "widespine",
    measuredArtboardWInches: 31.4058,
    measuredArtboardHInches: 19.1256,
    measuredPages: 1,
    measuredBleedLineInches: 0.125,
    foldXInches: [15.584, 15.806],
    foldYInches: [6.2],
    safetyInsetInches: 0.25,
  });
  const s = buildStudySpec(spec, "Widespine jacket", '12" LP');
  const ids = (s.zones ?? []).map((z) => z.id);
  assert.deepEqual(ids, ["bleed", "cut", "safe", "fold"], "operator safety inset draws the Safe ring");
  const safe = s.zones!.find((z) => z.id === "safe")!;
  assert.ok(safe.detail.includes(`${INCHES_TO_MM(0.25)} mm`), safe.detail);
  // Safe ring inset = bleed line + safety inset from the artboard edge.
  const expectedPctW = `${Math.round(((0.125 + 0.25) / 31.4058) * 1000) / 10}%`;
  assert.ok(String(safe.inset).includes(expectedPctW), `inset uses bleed+safety basis: ${safe.inset}`);
  const panel = s.panels![0];
  assert.equal(panel.foldLines?.length, 2, "operator vertical folds render");
  assert.equal(panel.foldLines![0], `${Math.round((15.584 / 31.4058) * 1000) / 10}%`);
  assert.equal(panel.foldLinesY?.length, 1, "operator horizontal folds render");
  assert.equal(s.footnote, undefined, "operator folds suppress the pending-spec note");
});

test("operator guides: operator values win over measured guides (operator-wins convention)", () => {
  const spec = makeSpec({
    componentKey: "jacket",
    variantKey: "widespine",
    measuredArtboardWInches: 31.4058,
    measuredArtboardHInches: 19.1256,
    measuredPages: 1,
    measuredGuides: JKTWS_GUIDES,
    foldXInches: [10],
    safetyInsetInches: 0.5,
  });
  const s = buildStudySpec(spec, "Widespine jacket", '12" LP');
  const panel = s.panels![0];
  assert.equal(panel.foldLines?.length, 1, "operator folds replace the measured score lines");
  assert.equal(panel.foldLines![0], `${Math.round((10 / 31.4058) * 1000) / 10}%`);
  const safe = s.zones!.find((z) => z.id === "safe")!;
  assert.ok(safe.detail.includes(`${INCHES_TO_MM(0.5)} mm`), `operator safety wins: ${safe.detail}`);
  // Operator safety sits inside the MEASURED cut basis when guides exist.
  const expectedTop = `${Math.round(((3.388 + 0.5) / 19.1256) * 1000) / 10}%`;
  assert.ok(String(safe.inset).startsWith(expectedTop), `safety rides the measured cut basis: ${safe.inset}`);
});

test("operator guides: absent values change nothing (measured guides still drive)", () => {
  const spec = makeSpec({
    componentKey: "jacket",
    variantKey: "widespine",
    measuredArtboardWInches: 31.4058,
    measuredArtboardHInches: 19.1256,
    measuredPages: 1,
    measuredGuides: JKTWS_GUIDES,
    foldXInches: null,
    foldYInches: [],
    safetyInsetInches: null,
  });
  const s = buildStudySpec(spec, "Widespine jacket", '12" LP');
  assert.equal(s.panels![0].foldLines?.length, 2, "measured score lines still render");
  const safe = s.zones!.find((z) => z.id === "safe")!;
  assert.ok(safe.detail.includes(`${INCHES_TO_MM(0.125)} mm`), safe.detail);
});

test("guides: proof spec inherits the same guide-driven rings and folds", () => {
  const spec = makeSpec({
    componentKey: "jacket",
    variantKey: "widespine",
    templateFileName: "12-JKTWS-200.pdf",
    measuredArtboardWInches: 31.4058,
    measuredArtboardHInches: 19.1256,
    measuredPages: 1,
    measuredGuides: JKTWS_GUIDES,
  });
  const run = { fileName: "art.pdf", fileUrl: "/objects/uploads/x", previewUrl: "/objects/uploads/p.png", previewUrl2: null };
  const proof = buildProofSpec(spec, run, "Widespine jacket", '12" LP')!;
  assert.deepEqual(proof.zones!.map((z) => z.id), ["bleed", "cut", "safe", "fold"]);
  assert.equal(proof.panels![0].foldLines?.length, 2);
});
