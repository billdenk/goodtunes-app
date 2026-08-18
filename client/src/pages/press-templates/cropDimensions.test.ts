// Tests for the crop-canvas dimension helper (Task #3162).
// Verifies that neither targetW nor targetH ever exceeds MAX_CROP_PX and
// that the scale is correctly bounded for key edge cases (spine, cover, landscape).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeCropCanvasSize, MAX_CROP_PX } from './cropDimensions.js';

// Desired pixels: 1440px viewport × 4× max zoom × 2× devicePixelRatio
const DESIRED = 1440 * 4 * 2;

describe('computeCropCanvasSize', () => {
  it('square cover — caps both dimensions at MAX_CROP_PX', () => {
    const { targetW, targetH } = computeCropCanvasSize(150, 150, DESIRED);
    assert.ok(targetW <= MAX_CROP_PX, `width ${targetW} > MAX_CROP_PX`);
    assert.ok(targetH <= MAX_CROP_PX, `height ${targetH} > MAX_CROP_PX`);
    // Square crop → square canvas
    assert.equal(targetW, targetH);
  });

  it('narrow spine (3.5 mm × 120 mm) — height capped, width tiny', () => {
    const { targetW, targetH } = computeCropCanvasSize(3.5, 120, DESIRED);
    assert.ok(targetW <= MAX_CROP_PX, `width ${targetW} > MAX_CROP_PX`);
    assert.ok(targetH <= MAX_CROP_PX, `height ${targetH} > MAX_CROP_PX`);
    // Height is the constraining dimension; width should be << MAX_CROP_PX
    assert.ok(targetH > targetW * 10, `expected height >> width for spine (got ${targetH} × ${targetW})`);
  });

  it('wide landscape (300 mm × 50 mm) — width capped, height short', () => {
    const { targetW, targetH } = computeCropCanvasSize(300, 50, DESIRED);
    assert.ok(targetW <= MAX_CROP_PX, `width ${targetW} > MAX_CROP_PX`);
    assert.ok(targetH <= MAX_CROP_PX, `height ${targetH} > MAX_CROP_PX`);
    // Width is the constraining dimension; height should be smaller
    assert.ok(targetW > targetH, `expected width > height for landscape (got ${targetW} × ${targetH})`);
  });

  it('desiredPx smaller than cap — desired dimension wins, not the cap', () => {
    // If the desired render is small (e.g. 200 px wide) and both dimensions
    // would be well under MAX_CROP_PX at that scale, respect the desired size.
    const desired = 200;
    const { targetW, targetH } = computeCropCanvasSize(100, 100, desired);
    assert.ok(targetW <= desired + 1, `expected width ≈ ${desired}, got ${targetW}`);
    assert.ok(targetH <= desired + 1, `expected height ≈ ${desired}, got ${targetH}`);
  });

  it('custom maxPx respected for both dimensions', () => {
    const custom = 512;
    const { targetW, targetH } = computeCropCanvasSize(50, 200, DESIRED, custom);
    assert.ok(targetW <= custom, `width ${targetW} > custom maxPx ${custom}`);
    assert.ok(targetH <= custom, `height ${targetH} > custom maxPx ${custom}`);
  });

  it('outputs are always integers ≥ 1', () => {
    for (const [w, h] of [[0.5, 0.5], [3.5, 120], [1, 1], [300, 0.1]]) {
      const { targetW, targetH } = computeCropCanvasSize(w, h, DESIRED);
      assert.ok(Number.isInteger(targetW) && targetW >= 1, `targetW=${targetW}`);
      assert.ok(Number.isInteger(targetH) && targetH >= 1, `targetH=${targetH}`);
    }
  });
});
