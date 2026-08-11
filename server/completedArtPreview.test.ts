// Task #3020 — unit tests for the Completed Art trim-area preview geometry.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePdfBoxes,
  pdfBoxToPx,
  frontPanelRect,
  resolveFinishedRectPx,
  clampCrop,
} from "./completedArtPreview";

const pdfinfoOut = (
  page: number,
  media: number[],
  crop: number[],
  trim: number[],
) =>
  `Pages:           2\n` +
  `Page    ${page} MediaBox:      ${media.join("     ")}\n` +
  `Page    ${page} CropBox:       ${crop.join("     ")}\n` +
  `Page    ${page} BleedBox:      ${media.join("     ")}\n` +
  `Page    ${page} TrimBox:       ${trim.join("     ")}\n` +
  `Page    ${page} ArtBox:        ${media.join("     ")}\n`;

test("parsePdfBoxes: real TrimBox is kept", () => {
  const out = pdfinfoOut(1, [0, 0, 2209.36, 1528.8], [0, 0, 2209.36, 1528.8], [232.7, 132.4, 1976.7, 996.4]);
  const boxes = parsePdfBoxes(out, 1);
  assert.deepEqual(boxes.trim, { x0: 232.7, y0: 132.4, x1: 1976.7, y1: 996.4 });
});

test("parsePdfBoxes: poppler-defaulted TrimBox (== MediaBox) is treated as absent", () => {
  const dims = [0, 0, 2209.36, 1528.8];
  const boxes = parsePdfBoxes(pdfinfoOut(1, dims, dims, dims), 1);
  assert.equal(boxes.trim, null);
  assert.deepEqual(boxes.media, { x0: 0, y0: 0, x1: 2209.36, y1: 1528.8 });
});

test("parsePdfBoxes: TrimBox equal to CropBox (within 1pt) is absent; page selector matches", () => {
  const out = pdfinfoOut(2, [0, 0, 468, 553], [10, 10, 458, 543], [10.4, 9.6, 458.3, 543.2]);
  const boxes = parsePdfBoxes(out, 2);
  assert.equal(boxes.trim, null);
  // asking for a page not in the output yields nulls
  assert.deepEqual(parsePdfBoxes(out, 1), { media: null, crop: null, trim: null });
});

test("pdfBoxToPx maps PDF (bottom-up) into raster (top-down) pixels", () => {
  const render = { x0: 0, y0: 0, x1: 720, y1: 720 }; // 10in sq
  const rect = { x0: 72, y0: 72, x1: 648, y1: 648 }; // 1in inset
  // 960px render → 96 dpi
  const px = pdfBoxToPx(rect, render, 960, 960);
  assert.deepEqual(px, { left: 96, top: 96, width: 768, height: 768 });
});

test("pdfBoxToPx: rect at PDF top maps to raster top", () => {
  const render = { x0: 0, y0: 0, x1: 720, y1: 1440 }; // 10×20in
  const topSquare = { x0: 0, y0: 720, x1: 720, y1: 1440 }; // top half in PDF space
  const px = pdfBoxToPx(topSquare, render, 960, 1920);
  assert.deepEqual(px, { left: 0, top: 0, width: 960, height: 960 });
});

test("frontPanelRect: wide jacket spread → RIGHT square, upright", () => {
  const { rect, rotate180 } = frontPanelRect("jacket", { left: 100, top: 50, width: 2400, height: 1200 });
  assert.deepEqual(rect, { left: 1300, top: 50, width: 1200, height: 1200 });
  assert.equal(rotate180, false);
});

test("frontPanelRect: tall stacked jacket → TOP square, rotated 180°", () => {
  const { rect, rotate180 } = frontPanelRect("jacket", { left: 0, top: 0, width: 1200, height: 2400 });
  assert.deepEqual(rect, { left: 0, top: 0, width: 1200, height: 1200 });
  assert.equal(rotate180, true);
});

test("frontPanelRect: near-square jacket (TrimBox marking a single front face) passes through whole, upright", () => {
  const trim = { left: 10, top: 10, width: 1210, height: 1200 };
  const { rect, rotate180 } = frontPanelRect("jacket", trim);
  assert.deepEqual(rect, trim);
  assert.equal(rotate180, false);
});

test("frontPanelRect: tall inner sleeve → TOP square, upright", () => {
  const { rect, rotate180 } = frontPanelRect("inner_sleeve_2", { left: 20, top: 30, width: 1176, height: 2300 });
  assert.deepEqual(rect, { left: 20, top: 30, width: 1176, height: 1176 });
  assert.equal(rotate180, false);
});

test("frontPanelRect: labels always keep the whole trim square", () => {
  const trim = { left: 126, top: 183, width: 372, height: 372 };
  assert.deepEqual(frontPanelRect("labels", trim), { rect: trim, rotate180: false });
});

test("frontPanelRect: booklet/unknown components are untouched even when wide", () => {
  const trim = { left: 0, top: 0, width: 2400, height: 1200 };
  assert.deepEqual(frontPanelRect("booklet", trim).rect, trim);
});

test("resolveFinishedRectPx: real TrimBox wins and gets NO bleed inset (TrimBox already excludes bleed)", () => {
  const boxes = {
    media: { x0: 0, y0: 0, x1: 720, y1: 720 },
    crop: { x0: 0, y0: 0, x1: 720, y1: 720 },
    trim: { x0: 72, y0: 72, x1: 648, y1: 648 },
  };
  const rect = resolveFinishedRectPx({
    componentId: "jacket",
    boxes,
    pxW: 960,
    pxH: 960,
    finishedInches: { w: 12, h: 12 },
    bleedInches: 0.125,
    contentBBox: { left: 0, top: 0, width: 960, height: 960 }, // must be ignored
  });
  assert.deepEqual(rect, { left: 96, top: 96, width: 768, height: 768 });
});

test("resolveFinishedRectPx: labels fall back to the spec finished square centered", () => {
  const dims = { x0: 0, y0: 0, x1: 468, y1: 553.04 }; // 6.5×7.68in artboard
  const boxes = { media: dims, crop: dims, trim: null };
  const pxW = 624, pxH = 737; // 96dpi
  const rect = resolveFinishedRectPx({
    componentId: "labels",
    boxes,
    pxW,
    pxH,
    finishedInches: { w: 3.875, h: 3.875 },
    bleedInches: 0.125,
  });
  assert.ok(rect);
  assert.equal(rect!.width, 372); // 3.875in @96dpi
  assert.equal(rect!.height, 372);
  assert.equal(rect!.left, Math.round((pxW - 372) / 2));
  assert.equal(rect!.top, Math.round((pxH - 372) / 2));
});

test("resolveFinishedRectPx: labels square larger than the artboard → null (full page)", () => {
  const dims = { x0: 0, y0: 0, x1: 200, y1: 200 };
  const rect = resolveFinishedRectPx({
    componentId: "labels",
    boxes: { media: dims, crop: dims, trim: null },
    pxW: 266,
    pxH: 266,
    finishedInches: { w: 3.875, h: 3.875 },
  });
  assert.equal(rect, null);
});

test("resolveFinishedRectPx: jacket content bbox is inset by bleed (content = art + bleed)", () => {
  const dims = { x0: 0, y0: 0, x1: 2209.36, y1: 1528.8 };
  const boxes = { media: dims, crop: dims, trim: null };
  const rect = resolveFinishedRectPx({
    componentId: "jacket",
    boxes,
    pxW: 2946,
    pxH: 2039,
    finishedInches: { w: 12, h: 12 },
    bleedInches: 0.125,
    contentBBox: { left: 269, top: 402, width: 2409, height: 1234 },
  });
  // bleed = 0.125in ≈ 12px @96dpi
  assert.deepEqual(rect, { left: 281, top: 414, width: 2385, height: 1210 });
});

test("resolveFinishedRectPx: tiny/failed content bbox → null (full-page fallback)", () => {
  const dims = { x0: 0, y0: 0, x1: 720, y1: 720 };
  const rect = resolveFinishedRectPx({
    componentId: "jacket",
    boxes: { media: dims, crop: dims, trim: null },
    pxW: 960,
    pxH: 960,
    contentBBox: { left: 0, top: 0, width: 100, height: 100 },
  });
  assert.equal(rect, null);
});

test("resolveFinishedRectPx: no boxes, no content bbox → null", () => {
  const rect = resolveFinishedRectPx({
    componentId: "inner_sleeve_1",
    boxes: { media: null, crop: null, trim: null },
    pxW: 960,
    pxH: 960,
  });
  assert.equal(rect, null);
});

test("clampCrop bounds the rect into the raster and rejects degenerate crops", () => {
  assert.deepEqual(clampCrop({ left: -10, top: -10, width: 2000, height: 2000 }, 960, 960), {
    left: 0,
    top: 0,
    width: 960,
    height: 960,
  });
  assert.equal(clampCrop({ left: 955, top: 0, width: 100, height: 100 }, 960, 960), null);
});

test("end-to-end geometry: wide jacket with real TrimBox spread → right square in pixels", () => {
  // 30×15in sheet, TrimBox = 24×12 spread centered.
  const media = { x0: 0, y0: 0, x1: 2160, y1: 1080 };
  const boxes = { media, crop: media, trim: { x0: 216, y0: 108, x1: 1944, y1: 972 } };
  const pxW = 2880, pxH = 1440; // 96dpi
  const finished = resolveFinishedRectPx({ componentId: "jacket", boxes, pxW, pxH });
  assert.deepEqual(finished, { left: 288, top: 144, width: 2304, height: 1152 });
  const { rect, rotate180 } = frontPanelRect("jacket", finished!);
  assert.deepEqual(rect, { left: 1440, top: 144, width: 1152, height: 1152 });
  assert.equal(rotate180, false);
  assert.deepEqual(clampCrop(rect, pxW, pxH), rect);
});
