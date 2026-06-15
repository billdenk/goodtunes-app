// Unit coverage for the gear PhotoLightbox carousel transform.
//
// Regression guard: a 2+-photo lightbox used to show every slide after the
// first as a blank frame because the track translate used the viewport-relative
// offset directly instead of dividing by the slide count (the track is
// `count * 100%` wide, so a CSS percentage translate is `count`× too strong).
//
// Pure function — no DOM needed. Run via Node's built-in test runner:
//   npx tsx --test client/src/lib/lightboxCarousel.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { lightboxTranslatePct } from "./lightboxCarousel";

test("single photo stays put", () => {
  assert.equal(lightboxTranslatePct(0, 0, 420, 1), 0);
});

test("second of two photos is fully in view (regression: blank slide 2)", () => {
  // Track is 200% wide; -50% of the track == -100% of the viewport, i.e. the
  // second slide centered. The old bug returned -100 (the viewport-relative
  // value), which shifted the 200%-wide track a full two viewports → blank.
  assert.equal(lightboxTranslatePct(1, 0, 420, 2), -50);
});

test("third of three photos is fully in view", () => {
  assert.ok(Math.abs(lightboxTranslatePct(2, 0, 420, 3) - -200 / 3) < 1e-9);
});

test("drag follows the finger 1:1 in viewport terms", () => {
  // A full-viewport drag shifts the track by exactly one slide-width: +100% of
  // the viewport == +50% of a two-slide track.
  const width = 420;
  assert.equal(lightboxTranslatePct(0, width, width, 2), 50);
});

test("guards against an empty photo set", () => {
  assert.equal(lightboxTranslatePct(0, 0, 420, 0), 0);
});
