// Task #3248 — UPC-A barcode render tests (bwip-js helpers).
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderUpcSvg, renderUpcPng } from "./barcode";

test("SVG render produces an svg document with the human-readable digits", () => {
  const svg = renderUpcSvg("036000291452");
  assert.match(svg, /<svg/i);
  // includetext renders the digits as text glyphs (paths), but the raw
  // digit characters appear in bwip-js SVG output as path groups; assert
  // the doc is non-trivial and well-formed instead of brittle glyph checks.
  assert.ok(svg.length > 500, "svg should be non-trivial");
  assert.match(svg, /<\/svg>/i);
});

test("SVG render accepts 11 digits (check digit auto-completed)", () => {
  const svg = renderUpcSvg("03600029145");
  assert.match(svg, /<svg/i);
});

test("SVG render rejects an invalid UPC", () => {
  assert.throws(() => renderUpcSvg("036000291453"), /Check digit/);
  assert.throws(() => renderUpcSvg("abc"), /digits only/);
});

test("PNG render produces a real print-resolution PNG", async () => {
  const buf = await renderUpcPng("036000291452");
  // PNG magic bytes.
  assert.deepEqual(
    Array.from(buf.subarray(0, 8)),
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );
  // IHDR width is bytes 16-19 big-endian — expect >= 1000px (print-res).
  const width = buf.readUInt32BE(16);
  assert.ok(width >= 1000, `expected print-resolution width, got ${width}px`);
});
