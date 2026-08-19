// Task #3189 — PDF art placement decision for the Template Test viewers.
// Pure module, no jsdom needed: full-sheet-size PDF exports seat edge-to-edge,
// bleed/cut-sized exports keep the centered-on-anchor placement, and a
// near-tie stays on the anchor (the safer placement).

import test from 'node:test';
import assert from 'node:assert/strict';
import { computePdfArtRect, type BoxMm } from './artPlacement';

// The repro geometry: PMP 2.0 12JKSP jacket — 638.1 × 365.5 mm sheet with a
// bleed box (~637.8 × 339.9 mm) OFF-CENTER in the sheet (fold-over flap edge).
const template = { wMm: 638.1, hMm: 365.5 };
const bleed: BoxMm = { xMm: 0.15, yMm: 20.0, wMm: 637.8, hMm: 339.9 };

test('full-artboard PDF (page == sheet) seats edge-to-edge at the sheet origin', () => {
  const r = computePdfArtRect(template, bleed, { wMm: 638.1, hMm: 365.5 });
  assert.deepEqual(r, { xMm: 0, yMm: 0, wMm: 638.1, hMm: 365.5 });
});

test('full-artboard match is tolerance-based, not exact (sub-1% rounding drift)', () => {
  const r = computePdfArtRect(template, bleed, { wMm: 638.0, hMm: 365.4 });
  assert.equal(r.xMm, 0);
  assert.equal(r.yMm, 0);
  assert.equal(r.wMm, 638.0);
  assert.equal(r.hMm, 365.4);
});

test('transposed (rotated) full-artboard export is NOT promoted — viewers render unrotated', () => {
  // A 365.5 × 638.1 page over the 638.1 × 365.5 sheet would occupy a narrow
  // over-tall region if pinned at the origin; it must keep the centered
  // fallback (the safer placement) at its own rendered dimensions.
  const art = { wMm: 365.5, hMm: 638.1 };
  const r = computePdfArtRect(template, bleed, art);
  assert.deepEqual(r, {
    xMm: bleed.xMm + bleed.wMm / 2 - art.wMm / 2,
    yMm: bleed.yMm + bleed.hMm / 2 - art.hMm / 2,
    wMm: art.wMm,
    hMm: art.hMm,
  });
});

test('bleed-sized PDF export keeps the centered-on-bleed placement', () => {
  const art = { wMm: 637.8, hMm: 339.9 };
  const r = computePdfArtRect(template, bleed, art);
  assert.deepEqual(r, {
    xMm: bleed.xMm + bleed.wMm / 2 - art.wMm / 2,
    yMm: bleed.yMm + bleed.hMm / 2 - art.hMm / 2,
    wMm: art.wMm,
    hMm: art.hMm,
  });
});

test('cut-sized (smaller) art stays centered on the anchor', () => {
  const cut: BoxMm = { xMm: 3.15, yMm: 23.0, wMm: 631.8, hMm: 333.9 };
  const art = { wMm: 631.8, hMm: 333.9 };
  const r = computePdfArtRect(template, cut, art);
  assert.ok(Math.abs(r.xMm - cut.xMm) < 1e-9);
  assert.ok(Math.abs(r.yMm - cut.yMm) < 1e-9);
});

test('near-tie (bleed box ~= full sheet) stays on the anchor — never promoted', () => {
  // Template whose bleed frame nearly fills the sheet: an art page matching
  // both must NOT be promoted (ties keep the safer centered placement).
  const tpl = { wMm: 300, hMm: 300 };
  const nearFull: BoxMm = { xMm: 0.5, yMm: 0.5, wMm: 299, hMm: 299 };
  // Art matching the ANCHOR exactly is within tolerance of the sheet too —
  // but the sheet isn't a strictly BETTER match, so it must stay centered.
  const art = { wMm: 299, hMm: 299 };
  const r = computePdfArtRect(tpl, nearFull, art);
  assert.ok(Math.abs(r.xMm - nearFull.xMm) < 1e-9);
  assert.ok(Math.abs(r.yMm - nearFull.yMm) < 1e-9);
});

test('exact tie stays on the anchor (strictly-better guard)', () => {
  const tpl = { wMm: 300, hMm: 300 };
  const sameAsSheet: BoxMm = { xMm: 0, yMm: 0, wMm: 300, hMm: 300 };
  const art = { wMm: 300, hMm: 300 };
  const r = computePdfArtRect(tpl, sameAsSheet, art);
  // Identical outcome either way here, but the decision path must be the
  // centered branch: centered on a full-sheet anchor == origin.
  assert.deepEqual(r, { xMm: 0, yMm: 0, wMm: 300, hMm: 300 });
});

test('no GT boxes at all (layerless PDF): anchor falls back to the full page', () => {
  const art = { wMm: 400, hMm: 200 };
  const r = computePdfArtRect(template, null, art);
  assert.equal(r.xMm, template.wMm / 2 - art.wMm / 2);
  assert.equal(r.yMm, template.hMm / 2 - art.hMm / 2);
});
