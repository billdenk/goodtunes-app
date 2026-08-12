// Task #3079 — Preview eligibility on Print prep template tiles.
// templateStudySpecFor gates the ⋯-menu Preview item: it must return a
// meaningful study spec ONLY when the slot has an attached file AND the
// study-spec builder can produce zones + panels for it; product-category
// shape rules (labels = circle + spindle hole, jackets = rectangle, never a
// hole) come straight from buildStudySpec and are asserted here through the
// adapter.
import test from "node:test";
import assert from "node:assert/strict";
import { templateStudySpecFor } from "./press-templates/catalogStudySpec";

const base = {
  id: "spec-1",
  format: "12_lp" as any,
  variantKey: "",
  discCount: 0,
  artboardWInches: null,
  artboardHInches: null,
  expectedPages: null,
  minPpi: null,
  color: null,
  fontsRule: null,
  templateFileUrl: "/objects/uploads/tpl.pdf",
  templateFileName: "tpl.pdf",
  printRules: null,
  bleedLineInches: null,
  measuredArtboardWInches: 12.5,
  measuredArtboardHInches: 12.5,
  measuredPages: 2,
  measuredBleedLineInches: 0.125,
};

test("no file attached → not eligible (null)", () => {
  assert.equal(templateStudySpecFor(null, "Jacket", "12″ LP"), null);
  assert.equal(
    templateStudySpecFor({ ...base, componentKey: "jacket", templateFileUrl: null }, "Jacket", "12″ LP"),
    null,
  );
});

test("file attached but nothing measured/entered → no meaningful spec (null)", () => {
  const spec = templateStudySpecFor(
    {
      ...base,
      componentKey: "booklet",
      measuredArtboardWInches: null,
      measuredArtboardHInches: null,
      measuredPages: null,
      measuredBleedLineInches: null,
    },
    "Booklet",
    "12″ LP",
  );
  assert.equal(spec, null);
});

test("operator-entered dims/pages alone (no measured facts) → not eligible (null)", () => {
  // buildStudySpec would happily fall back to entered values, but Preview's
  // contract is the MEASURED PDF facts — an attached-but-unmeasured file
  // with legacy configured dims must not surface Preview.
  const spec = templateStudySpecFor(
    {
      ...base,
      componentKey: "jacket",
      artboardWInches: 25,
      artboardHInches: 12.5,
      expectedPages: 2,
      measuredArtboardWInches: null,
      measuredArtboardHInches: null,
      measuredPages: null,
      measuredBleedLineInches: null,
    },
    "Jacket",
    "12″ LP",
  );
  assert.equal(spec, null);
});

test("measured jacket → rectangle spec with pages, no spindle hole", () => {
  const spec = templateStudySpecFor({ ...base, componentKey: "jacket" }, "Jacket", "12″ LP");
  assert.ok(spec);
  assert.equal(spec!.shape, "square");
  assert.ok(!(spec!.zones ?? []).some((z) => z.id === "hole"));
  assert.equal(spec!.panels?.length, 2);
});

test("measured labels → circle spec with spindle hole", () => {
  const spec = templateStudySpecFor(
    { ...base, componentKey: "labels", measuredArtboardWInches: 4, measuredArtboardHInches: 4, measuredPages: 2 },
    "Center labels",
    "12″ LP",
  );
  assert.ok(spec);
  assert.equal(spec!.shape, "circle");
  assert.ok((spec!.zones ?? []).some((z) => z.id === "hole"));
});
