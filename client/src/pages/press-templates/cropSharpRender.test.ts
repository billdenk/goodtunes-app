// runWithRetry rules (Task #3213) — the bounded-retry policy behind the
// hi-DPI crop render in PressTemplateLiveTest and TemplateArtViewer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWithRetry, CROP_RETRY_DELAYS_MS } from './cropSharpRender';

const noSleep = async () => {};

test('succeeds first try — one attempt, no sleeps', async () => {
  let calls = 0;
  const res = await runWithRetry(async () => { calls++; return 'img'; }, () => true, CROP_RETRY_DELAYS_MS, noSleep);
  assert.deepEqual(res, { ok: true, value: 'img' });
  assert.equal(calls, 1);
});

test('retries after failures and returns the eventual success', async () => {
  let calls = 0;
  const slept: number[] = [];
  const res = await runWithRetry(
    async () => { calls++; if (calls < 3) throw new Error('transient'); return 'sharp'; },
    () => true,
    [10, 20],
    async (ms) => { slept.push(ms); },
  );
  assert.deepEqual(res, { ok: true, value: 'sharp' });
  assert.equal(calls, 3);
  assert.deepEqual(slept, [10, 20]);
});

test('bounded: exhausts retries then reports failure (not superseded)', async () => {
  let calls = 0;
  const res = await runWithRetry(async () => { calls++; throw new Error('nope'); }, () => true, [1, 1], noSleep);
  assert.deepEqual(res, { ok: false, superseded: false });
  assert.equal(calls, 3); // initial + 2 retries
});

test('superseded before an attempt — bails without calling attempt', async () => {
  let calls = 0;
  const res = await runWithRetry(async () => { calls++; return 'x'; }, () => false, [1], noSleep);
  assert.deepEqual(res, { ok: false, superseded: true });
  assert.equal(calls, 0);
});

test('a value landing after supersession is never committed', async () => {
  let current = true;
  const res = await runWithRetry(
    async () => { current = false; return 'stale'; },
    () => current,
    [1],
    noSleep,
  );
  assert.deepEqual(res, { ok: false, superseded: true });
});

test('supersession during backoff stops further attempts', async () => {
  let calls = 0;
  let current = true;
  const res = await runWithRetry(
    async () => { calls++; throw new Error('fail'); },
    () => current,
    [1, 1],
    async () => { current = false; },
  );
  assert.deepEqual(res, { ok: false, superseded: true });
  assert.equal(calls, 1);
});
