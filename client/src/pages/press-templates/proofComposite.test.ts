import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_TEMPLATE_OPACITY,
  proofCompositeOrder,
  selectTemplateRaster,
  templateCompositeStyle,
} from "./proofComposite";

test("proof canon seats art below a multiplied translucent template and overlays", () => {
  assert.deepEqual(proofCompositeOrder(true, true), [
    "surface",
    "art",
    "template",
    "overlays",
  ]);
  assert.deepEqual(templateCompositeStyle(true, DEFAULT_TEMPLATE_OPACITY), {
    opacity: 0.55,
    mixBlendMode: "multiply",
  });
});

test("proof canon keeps a template-only proof fully opaque", () => {
  assert.deepEqual(proofCompositeOrder(false, true), [
    "surface",
    "template",
    "overlays",
  ]);
  assert.deepEqual(templateCompositeStyle(false, 0.2), {
    opacity: 1,
    mixBlendMode: "normal",
  });
});

test("artist template visibility stays independent from art opacity", () => {
  const source = readFileSync("client/src/pages/press-templates/TemplateArtViewer.tsx", "utf8");
  assert.match(source, /onClick=\{\(\) => setShowTemplate\(\(v\) => !v\)\}/);
  assert.match(source, /backgroundColor: '#ffffff'/);
  assert.doesNotMatch(source, /if \(on\) setArtOpacity/);
  assert.match(source, /data-testid="slider-template-opacity"/);
  assert.match(source, /data-testid="slider-art-opacity"/);
});

test("sharp template rasters replace the base instead of stacking over it", () => {
  assert.equal(selectTemplateRaster({
    hasFullSharp: false,
    hasCropSharp: false,
    fullView: true,
    zoom: 1,
  }), "base");
  assert.equal(selectTemplateRaster({
    hasFullSharp: true,
    hasCropSharp: false,
    fullView: true,
    zoom: 2,
  }), "full");
  assert.equal(selectTemplateRaster({
    hasFullSharp: false,
    hasCropSharp: true,
    fullView: false,
    zoom: 1,
  }), "crop");
});