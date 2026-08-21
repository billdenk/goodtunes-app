// Crop transform / rendered-extent math (Task #3290) — proves the crop raster
// shares the overlay's coordinate frame for rotated / offset-origin pages and
// that the displayed rect derives from the exact rendered canvas extent.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCropCanvasSize,
  computeCropTransform,
  cropFrameMatrix,
  cropRenderedRectMm,
  mulMat,
  invMat,
  applyMat,
  PT_PER_MM,
  type Mat2D,
} from './cropDimensions.js';

const PT_TO_MM = 25.4 / 72;
const approx = (a: number, b: number, eps = 1e-9, msg?: string) =>
  assert.ok(Math.abs(a - b) < eps, msg ?? `${a} !== ${b}`);

// pdf.js PageViewport transform for viewBox [x0,y0,x1,y1] at scale s.
const vpTransform = (viewBox: number[], s: number, rotation: 0 | 90 | 180 | 270): Mat2D => {
  const [x0, y0, x1, y1] = viewBox;
  switch (rotation) {
    case 0: return [s, 0, 0, -s, -x0 * s, y1 * s];
    case 90: return [0, s, s, 0, -y0 * s, -x0 * s];
    case 180: return [-s, 0, 0, s, x1 * s, -y0 * s];
    case 270: return [0, -s, -s, 0, y1 * s, x1 * s];
  }
};
const vp1Height = (viewBox: number[], rotation: number) => {
  const [x0, y0, x1, y1] = viewBox;
  return rotation % 180 === 0 ? y1 - y0 : x1 - x0;
};

describe('mulMat / invMat', () => {
  it('inverse composes to identity', () => {
    const m: Mat2D = [0, 2, -2, 0, 5, -7];
    const id = mulMat(m, invMat(m));
    const expect: Mat2D = [1, 0, 0, 1, 0, 0];
    id.forEach((v, i) => approx(v, expect[i]));
  });
});

describe('computeCropTransform', () => {
  // The invariant: P·T must equal the overlay-frame matrix N exactly, for
  // ANY viewport transform T — that's what "shares the overlay's frame" means.
  const focus = { x: 10.25, y: 33.75 };
  const scale = 11.7;

  const cases: Array<[string, number[], 0 | 90 | 180 | 270]> = [
    ['unrotated, origin (0,0)', [0, 0, 900, 620], 0],
    ['unrotated, offset origin', [12, -30, 912, 590], 0],
    ['rotated 90, offset origin', [12, -30, 912, 590], 90],
    ['rotated 180', [0, 0, 900, 620], 180],
    ['rotated 270, offset origin', [-4, 8, 896, 628], 270],
  ];

  for (const [name, viewBox, rot] of cases) {
    it(`P·T == overlay-frame N — ${name}`, () => {
      const h = vp1Height(viewBox, rot);
      const T = vpTransform(viewBox, scale, rot);
      const P = computeCropTransform(focus, scale, h, T);
      const N = cropFrameMatrix(focus, scale, h);
      mulMat(P, T).forEach((v, i) => approx(v, N[i], 1e-6, `${name}: [${i}] ${v} != ${N[i]}`));
    });
  }

  it('unrotated (0,0)-origin page reduces to the legacy pure translation', () => {
    const T = vpTransform([0, 0, 900, 620], scale, 0);
    const P = computeCropTransform(focus, scale, 620, T);
    const k = PT_PER_MM * scale;
    approx(P[0], 1); approx(P[1], 0); approx(P[2], 0); approx(P[3], 1);
    approx(P[4], -focus.x * k, 1e-9);
    approx(P[5], -focus.y * k, 1e-9);
  });

  it('a user-space point lands at its overlay-mm position minus focus origin', () => {
    // Offset-origin rotated page: pick a user-space point, map it through the
    // effective render transform P·T, and check it sits where the overlay
    // engine would place it (overlay mm − focus origin, times k).
    const viewBox = [12, -30, 912, 590];
    const rot = 90 as const;
    const h = vp1Height(viewBox, rot); // = 900 pt
    const T = vpTransform(viewBox, scale, rot);
    const P = computeCropTransform(focus, scale, h, T);
    const eff = mulMat(P, T);
    const k = PT_PER_MM * scale;
    const [X, Y] = [200, 140]; // arbitrary user-space pt
    // extractGtLayers overlay frame: xMm = X·PT_TO_MM, yMm = (h − Y)·PT_TO_MM
    const xMm = X * PT_TO_MM;
    const yMm = (h - Y) * PT_TO_MM;
    const [cx, cy] = applyMat(eff, X, Y);
    approx(cx, (xMm - focus.x) * k, 1e-6);
    approx(cy, (yMm - focus.y) * k, 1e-6);
  });
});

describe('cropRenderedRectMm', () => {
  it('tall-narrow spine under the 4096px cap — rect matches the rounded canvas exactly', () => {
    const focus = { x: 158.3, y: 6.1, w: 3.5 + 2 * 4.94, h: 120 + 2 * 4.94 }; // spine + 4% pad
    const desired = Math.round(1440 * 4 * 2);
    const { targetW, targetH, scale } = computeCropCanvasSize(focus.w, focus.h, desired);
    const rect = cropRenderedRectMm(focus, targetW, targetH, scale);
    const k = PT_PER_MM * scale;
    // Origin is exact (canvas (0,0) == focus top-left by construction).
    assert.equal(rect.x, focus.x);
    assert.equal(rect.y, focus.y);
    // Extent derives from the INTEGER canvas size, not the requested focus —
    // stretching the raster over rect keeps mm-per-canvas-px uniform.
    approx(rect.w * k, targetW, 1e-9);
    approx(rect.h * k, targetH, 1e-9);
    // And it never drifts more than the half-pixel the rounding introduced.
    assert.ok(Math.abs(rect.w - focus.w) * k <= 0.5 + 1e-9);
    assert.ok(Math.abs(rect.h - focus.h) * k <= 0.5 + 1e-9);
  });
});
