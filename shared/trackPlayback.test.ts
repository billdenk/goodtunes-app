// Task #1095 — unit coverage for the shared track playback-state rule.
//
// Pure function, no DB dependency, so we import the real module directly.
// Runs with Node's built-in test runner, no extra framework:
//
//   npx tsx --test shared/trackPlayback.test.ts
//
// Mirrors the pattern in shared/albumStage.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { trackPlaybackState } from "./trackPlayback";

test("owned albums always render the full track", () => {
  assert.equal(trackPlaybackState({ isOwned: true, isPreviewable: true }), "full");
  assert.equal(trackPlaybackState({ isOwned: true, isPreviewable: false }), "full");
  // Owner wins even when previewability is unknown.
  assert.equal(trackPlaybackState({ isOwned: true, isPreviewable: null }), "full");
  assert.equal(trackPlaybackState({ isOwned: true }), "full");
});

test("not-owned + previewable renders a preview row", () => {
  assert.equal(trackPlaybackState({ isOwned: false, isPreviewable: true }), "preview");
});

test("not-owned + preview hidden renders a locked row", () => {
  assert.equal(trackPlaybackState({ isOwned: false, isPreviewable: false }), "locked");
});

test("not-owned with unknown/missing previewability locks the row", () => {
  // Mirrors the surfaces' falsy handling: null/undefined preview is locked.
  assert.equal(trackPlaybackState({ isOwned: false, isPreviewable: null }), "locked");
  assert.equal(trackPlaybackState({ isOwned: false }), "locked");
  assert.equal(trackPlaybackState({}), "locked");
});
