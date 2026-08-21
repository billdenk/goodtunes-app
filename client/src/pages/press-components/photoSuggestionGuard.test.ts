import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canApplyPhotoSuggestion } from './photoSuggestionGuard';

const pristine = { touched: false, alreadyApplied: false, lockedStyleId: null as string | null, colors: ['', '', ''] };

test('pristine sheet: suggestion may apply', () => {
  assert.equal(canApplyPhotoSuggestion(pristine), true);
});

test('one-shot: an already-applied suggestion never fires again', () => {
  assert.equal(canApplyPhotoSuggestion({ ...pristine, alreadyApplied: true }), false);
});

test('locked style (editing a gen color) blocks the suggestion', () => {
  assert.equal(canApplyPhotoSuggestion({ ...pristine, lockedStyleId: 'splatter' }), false);
});

test('any operator interaction before the photo decodes blocks the suggestion', () => {
  // e.g. the press clicked a style tile or an option while the image loaded
  assert.equal(canApplyPhotoSuggestion({ ...pristine, touched: true }), false);
});

test('a PARTIAL half-typed hex blocks the suggestion (not just valid hexes)', () => {
  assert.equal(canApplyPhotoSuggestion({ ...pristine, colors: ['#E7', '', ''] }), false);
});

test('a complete valid hex blocks the suggestion', () => {
  assert.equal(canApplyPhotoSuggestion({ ...pristine, colors: ['', '#E76184', ''] }), false);
});

test('whitespace-only color entries still count as untouched', () => {
  assert.equal(canApplyPhotoSuggestion({ ...pristine, colors: ['  ', ''] }), true);
});

test('delayed photo load into a truly untouched sheet still applies', () => {
  // colors seeded empty at open; no interaction; not locked; not applied
  assert.equal(canApplyPhotoSuggestion({ touched: false, alreadyApplied: false, lockedStyleId: undefined, colors: [] }), true);
});
