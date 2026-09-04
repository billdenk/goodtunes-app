import assert from "node:assert/strict";
import test from "node:test";
import { classifyLightMonochromeMarkPixels } from "./adminAppearance";

function pixels(values: Array<[number, number, number, number?]>): Uint8ClampedArray {
  return new Uint8ClampedArray(values.flatMap(([r, g, b, a = 255]) => [r, g, b, a]));
}

test("detects a near-white monochrome mark with grayscale antialiasing", () => {
  const sample = pixels([
    ...Array.from({ length: 90 }, () => [248, 248, 248] as [number, number, number]),
    ...Array.from({ length: 10 }, () => [190, 190, 190] as [number, number, number]),
  ]);
  assert.equal(classifyLightMonochromeMarkPixels(sample), true);
});

test("rejects a mostly-white logo with a material colored accent", () => {
  const sample = pixels([
    ...Array.from({ length: 96 }, () => [248, 248, 248] as [number, number, number]),
    ...Array.from({ length: 4 }, () => [20, 110, 235] as [number, number, number]),
  ]);
  assert.equal(classifyLightMonochromeMarkPixels(sample), false);
});

test("ignores transparent chromatic pixels outside the rendered mark", () => {
  const sample = pixels([
    ...Array.from({ length: 98 }, () => [245, 245, 245] as [number, number, number]),
    ...Array.from({ length: 2 }, () => [255, 0, 0, 0] as [number, number, number, number]),
  ]);
  assert.equal(classifyLightMonochromeMarkPixels(sample), true);
});

test("returns no verdict for an entirely transparent image", () => {
  assert.equal(classifyLightMonochromeMarkPixels(pixels([[255, 255, 255, 0]])), null);
});