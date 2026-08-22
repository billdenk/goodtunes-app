// Task #3306 — shared GT layer eligibility predicate: both the press
// live-test viewer and the artist template test filter extracted layers
// with this one definition, so junk layers (a raw "Layer 1" from art
// content) never become toggle chips.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGtEligibleLayer } from './gtOverlayEngine';

test('GT-prefixed and LINE/AREA layers are eligible', () => {
  for (const name of ['GT CUT LINE', 'GT BLEED AREA', 'gt spine line', 'Front Safety LINE', 'Back Cover Area', 'GTX']) {
    assert.equal(isGtEligibleLayer(name), true, name);
  }
});

test('non-GT content layers are filtered out', () => {
  for (const name of ['Layer 1', 'Artwork', 'Background', 'Photo', 'guides']) {
    assert.equal(isGtEligibleLayer(name), false, name);
  }
});
