import test from 'node:test';
import assert from 'node:assert/strict';
import { pressMarkFilter, pressMarkShellFilter, PRESS_MARK_ON_DARK, PRESS_MARK_ON_LIGHT } from './pressMark';

test('dark surfaces force the whole glyph white regardless of source polarity', () => {
  // brightness(0) FIRST collapses any source (white MRP badge or dark default
  // mark) to a black silhouette; invert(1) then flips it to pure white. Order
  // matters: invert-first is the double-invert regression this guards against.
  assert.equal(pressMarkFilter('dark'), 'brightness(0) invert(1)');
  assert.equal(PRESS_MARK_ON_DARK, 'brightness(0) invert(1)');
});

test('light surfaces force the whole glyph dark', () => {
  assert.equal(pressMarkFilter('light'), 'brightness(0)');
  assert.equal(PRESS_MARK_ON_LIGHT, 'brightness(0)');
});

test('no branch ever uses the old polarity-assuming invert filter', () => {
  for (const s of ['dark', 'light'] as const) {
    assert.ok(!pressMarkFilter(s).startsWith('invert'), `${s} must not invert source colors directly`);
  }
});

test('partner-shell SVG marks are dark on light chrome and unchanged in dark mode', () => {
  assert.equal(pressMarkShellFilter(true, false), PRESS_MARK_ON_LIGHT);
  assert.equal(pressMarkShellFilter(true, true), undefined);
});

test('partner-shell full-color logos keep their original color treatment', () => {
  assert.equal(pressMarkShellFilter(false, false), undefined);
});
