// Regression tests for the Full-Template sharp-render invalidation rules
// (Task #3212 completion review): a slow async render finishing AFTER a
// template swap or a zoom-out must be rejected, and a template swap must
// drop every cached zoom tier.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFullSharpController } from './fullSharpRender';

test('delayed render completing after a template swap is stale', async () => {
  const c = createFullSharpController();
  const token = c.begin(); // render for template A kicked off at zoom 2
  // Template replaced while the render is still in flight (even if the new
  // state is zoom 1 / no document, so no new begin() would have followed).
  c.invalidate();
  await Promise.resolve(); // the slow render "finishes" later
  assert.equal(token.isCurrent(), false, 'stale render must not apply');
});

test('delayed render completing after zoom-out is stale', () => {
  const c = createFullSharpController();
  const inFlight = c.begin(); // zoom 2 render in flight
  const zoomOut = c.begin();  // effect re-runs for zoom 1 (disabled branch)
  assert.equal(inFlight.isCurrent(), false, 'zoomed-out render must not apply');
  assert.equal(zoomOut.isCurrent(), true);
});

test('latest attempt stays current until superseded', () => {
  const c = createFullSharpController();
  const a = c.begin();
  assert.equal(a.isCurrent(), true);
  const b = c.begin();
  assert.equal(a.isCurrent(), false);
  assert.equal(b.isCurrent(), true);
  c.invalidate();
  assert.equal(b.isCurrent(), false);
});

test('template swap drops every cached zoom tier', () => {
  const c = createFullSharpController();
  c.cache.set('z2', 'dataA-z2');
  c.cache.set('z4', 'dataA-z4');
  c.invalidate(); // new template
  assert.equal(c.cache.size, 0, 'old template rasters must not survive');
});
