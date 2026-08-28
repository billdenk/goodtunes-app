// Task #3448 — generated vinyl previews must not show a pale rim. The PSD
// stencil PNGs carry an antialiased alpha fade at their outer edge; if the
// layer stack renders exactly at the clipping circle, the light fallback
// surface underneath (the "light table" behind translucent bodies) blends
// into the outermost pixels and reads as a white/gray ring on dark
// backgrounds. The fix bleeds the whole layer stack slightly past the
// overflow-hidden circle (GEN_EDGE_BLEED_INSET), so the visible edge is
// fully-covered disc color while the circle itself stays clipped round.
// This check scans the shared renderer source: the bleed treatment must
// stay in place, and must stay a genuine oversize (negative inset).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, 'PressVinylStyles.tsx'), 'utf8');

test('GenDisc keeps the edge-bleed constant, and it oversizes (negative inset)', () => {
  const m = src.match(/const GEN_EDGE_BLEED_INSET = '(-?[\d.]+)%'/);
  assert.ok(m, 'GEN_EDGE_BLEED_INSET missing from PressVinylStyles.tsx — the generated-disc edge bleed was removed');
  const pct = Number(m![1]);
  assert.ok(pct < 0, `GEN_EDGE_BLEED_INSET must be negative (oversize), got ${pct}%`);
  assert.ok(pct >= -3, `GEN_EDGE_BLEED_INSET suspiciously large (${pct}%) — would visibly crop the disc textures`);
});

test('GenDisc layer stack rides inside the bleed wrapper', () => {
  // The wrapper must be applied where the PSD layers render (inside the
  // rotating body), not somewhere decorative.
  assert.ok(
    /inset: GEN_EDGE_BLEED_INSET/.test(src),
    'no element uses GEN_EDGE_BLEED_INSET — the layer stack no longer bleeds past the clip circle',
  );
  // The bleed wrapper must not itself introduce a stacking-context isolator
  // (transform/opacity/isolation) or the layers' mix-blend-modes would stop
  // compositing against the base — keep it a plain positioned div.
  const wrapper = src.match(/\{\{ position: 'absolute', inset: GEN_EDGE_BLEED_INSET[^}]*\}\}/);
  assert.ok(wrapper, 'bleed wrapper style not found in expected shape');
  for (const isolator of ['transform', 'opacity', 'isolation', 'filter']) {
    assert.ok(
      !wrapper![0].includes(isolator),
      `bleed wrapper carries "${isolator}" — this isolates blending and breaks gradient/blend layers`,
    );
  }
});
