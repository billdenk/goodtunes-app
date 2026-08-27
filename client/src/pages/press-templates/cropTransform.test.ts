// Crop transform / rendered-extent math (Task #3290) — proves the crop raster
// shares the overlay's coordinate frame for rotated / offset-origin pages and
// that the displayed rect derives from the exact rendered canvas extent.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCropCanvasSize,
  computeCropTransform,
  cropFrameMatrix,
  cropRenderedRectMm,
  rasterCssLayout,
  mulMat,
  invMat,
  applyMat,
  PT_PER_MM,
  type Mat2D,
} from './cropDimensions.js';

const PT_TO_MM = 25.4 / 72;
const approx = (a: number, b: number, eps = 1e-9, msg?: string) =>
  assert.ok(Math.abs(a - b) < eps, msg ?? `${a} !== ${b}`);

// pdf.js PageViewport transform for viewBox [x0,y0,x1,y1] at scale s.
const vpTransform = (viewBox: number[], s: number, rotation: 0 | 90 | 180 | 270): Mat2D => {
  const [x0, y0, x1, y1] = viewBox;
  switch (rotation) {
    case 0: return [s, 0, 0, -s, -x0 * s, y1 * s];
    case 90: return [0, s, s, 0, -y0 * s, -x0 * s];
    case 180: return [-s, 0, 0, s, x1 * s, -y0 * s];
    case 270: return [0, -s, -s, 0, y1 * s, x1 * s];
  }
};
const vp1Height = (viewBox: number[], rotation: number) => {
  const [x0, y0, x1, y1] = viewBox;
  return rotation % 180 === 0 ? y1 - y0 : x1 - x0;
};

describe('mulMat / invMat', () => {
  it('inverse composes to identity', () => {
    const m: Mat2D = [0, 2, -2, 0, 5, -7];
    const id = mulMat(m, invMat(m));
    const expect: Mat2D = [1, 0, 0, 1, 0, 0];
    id.forEach((v, i) => approx(v, expect[i]));
  });
});

describe('computeCropTransform', () => {
  // The invariant: P·T must equal the overlay-frame matrix N exactly, for
  // ANY viewport transform T — that's what "shares the overlay's frame" means.
  const focus = { x: 10.25, y: 33.75 };
  const scale = 11.7;

  const cases: Array<[string, number[], 0 | 90 | 180 | 270]> = [
    ['unrotated, origin (0,0)', [0, 0, 900, 620], 0],
    ['unrotated, offset origin', [12, -30, 912, 590], 0],
    ['rotated 90, offset origin', [12, -30, 912, 590], 90],
    ['rotated 180', [0, 0, 900, 620], 180],
    ['rotated 270, offset origin', [-4, 8, 896, 628], 270],
  ];

  for (const [name, viewBox, rot] of cases) {
    it(`P·T == overlay-frame N — ${name}`, () => {
      const h = vp1Height(viewBox, rot);
      const T = vpTransform(viewBox, scale, rot);
      const P = computeCropTransform(focus, scale, h, T);
      const N = cropFrameMatrix(focus, scale, h);
      mulMat(P, T).forEach((v, i) => approx(v, N[i], 1e-6, `${name}: [${i}] ${v} != ${N[i]}`));
    });
  }

  it('unrotated (0,0)-origin page reduces to the legacy pure translation', () => {
    const T = vpTransform([0, 0, 900, 620], scale, 0);
    const P = computeCropTransform(focus, scale, 620, T);
    const k = PT_PER_MM * scale;
    approx(P[0], 1); approx(P[1], 0); approx(P[2], 0); approx(P[3], 1);
    approx(P[4], -focus.x * k, 1e-9);
    approx(P[5], -focus.y * k, 1e-9);
  });

  it('a user-space point lands at its overlay-mm position minus focus origin', () => {
    // Offset-origin rotated page: pick a user-space point, map it through the
    // effective render transform P·T, and check it sits where the overlay
    // engine would place it (overlay mm − focus origin, times k).
    const viewBox = [12, -30, 912, 590];
    const rot = 90 as const;
    const h = vp1Height(viewBox, rot); // = 900 pt
    const T = vpTransform(viewBox, scale, rot);
    const P = computeCropTransform(focus, scale, h, T);
    const eff = mulMat(P, T);
    const k = PT_PER_MM * scale;
    const [X, Y] = [200, 140]; // arbitrary user-space pt
    // extractGtLayers overlay frame: xMm = X·PT_TO_MM, yMm = (h − Y)·PT_TO_MM
    const xMm = X * PT_TO_MM;
    const yMm = (h - Y) * PT_TO_MM;
    const [cx, cy] = applyMat(eff, X, Y);
    approx(cx, (xMm - focus.x) * k, 1e-6);
    approx(cy, (yMm - focus.y) * k, 1e-6);
  });
});

describe('rasterCssLayout (Task #3374) — MRP 12-JKTSG3D-100 spine crop registration', () => {
  // Real measured template: "12in Single 3D Jacket with Gusseted Pocket,
  // 3.5mm Spine" — page 2209.36 × 1528.8 pt, unrotated, userUnit 1.
  const wMm = 2209.36 * (25.4 / 72); // 779.413 mm
  const hMm = 1528.8 * (25.4 / 72);  // 539.327 mm
  // GT SPINE layer box + the template's own printed spine dielines (mm).
  const spine = { x: 387.9246849907769, y: 113.99345540364581, w: 3.525280083550347, h: 311.37364052666555 };
  const dielinesX = [384.419, 387.949, 391.438, 394.928];
  // Spine focus rect at the viewer's 4% pad, as picked in production.
  const focus = { x: 375.4697, y: 101.5389, w: 28.4352, h: 336.2841 };
  const viewScale = wMm / focus.w; // zoom 1 → ~27.41: the pathological scale

  const parseLayout = (l: ReturnType<typeof rasterCssLayout>) => {
    const widthPct = parseFloat(l.width);
    const heightPct = parseFloat(l.height);
    const m = /translate\((-?[\d.]+)%, (-?[\d.]+)%\) scale\(([\d.e-]+)\)/.exec(l.transform)!;
    assert.ok(m, `transform parse: ${l.transform}`);
    const [txPct, tyPct, invS] = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
    // CSS composes translate∘scale: displayed left = translate offset
    // (a % of the element's own LAYOUT box), displayed width = layout/s.
    return {
      leftFrac: (txPct / 100) * (widthPct / 100),
      topFrac: (tyPct / 100) * (heightPct / 100) * (hMm / wMm), // top % resolves vs frame height
      widthFrac: (widthPct / 100) * invS,
      heightFrac: (heightPct / 100) * invS,
      widthPct,
      invS,
    };
  };

  // The crop raster actually rendered for this focus (dpr 1, max zoom 4).
  const { targetW, targetH, scale } = computeCropCanvasSize(focus.w, focus.h, 1440 * 4);
  const rect = cropRenderedRectMm(focus, targetW, targetH, scale);

  it('produces the real 346×4096 canvas for the spine focus', () => {
    assert.equal(targetW, 346);
    assert.equal(targetH, 4096);
  });

  it('layout box is full-size — paint snapping stays sub-layout-pixel', () => {
    const l = parseLayout(rasterCssLayout(rect, wMm, hMm, viewScale));
    // The regression: the naive layout box was rect.w/wMm ≈ 3.6% of the frame
    // (~3.8 CSS px), and Chromium's whole-pixel image paint snap × the 27.4×
    // frame scale squeezed the raster ~0.8× (a ~3.5 mm drift at the spine).
    // The fixed layout box must be ~frame-sized so a ±0.5 px snap stays sub-mm.
    const naivePct = (rect.w / wMm) * 100;
    assert.ok(naivePct < 4, `precondition: naive box tiny (${naivePct}%)`);
    assert.ok(l.widthPct > 50, `layout box must be full-size, got ${l.widthPct}%`);
    approx(l.widthPct, naivePct * viewScale, 1e-3);
    approx(l.invS, 1 / viewScale, 1e-7); // scale() serialized at 8 decimals
  });

  it('composed CSS placement reproduces the exact rectMm frame fractions', () => {
    const l = parseLayout(rasterCssLayout(rect, wMm, hMm, viewScale));
    approx(l.leftFrac, rect.x / wMm, 1e-7);
    approx(l.topFrac, (rect.y / hMm) * (hMm / wMm), 1e-7);
    approx(l.widthFrac, rect.w / wMm, 1e-7);
    approx(l.heightFrac, rect.h / hMm, 1e-7);
  });

  it('every printed spine dieline maps through canvas + CSS onto its overlay position', () => {
    const l = parseLayout(rasterCssLayout(rect, wMm, hMm, viewScale));
    const k = PT_PER_MM * scale;
    for (const mmX of dielinesX) {
      // Painted position: canvas px → fraction of the raster → frame fraction.
      const canvasPx = (mmX - rect.x) * k;
      const frameFrac = l.leftFrac + (canvasPx / targetW) * l.widthFrac;
      // Overlay position: the SVG draws at mm/wMm of the same frame.
      const errMm = Math.abs(frameFrac - mmX / wMm) * wMm;
      assert.ok(errMm < 0.01, `dieline at ${mmX} mm drifts ${errMm} mm`);
    }
    // Sanity: the GT spine box edges register the same way.
    for (const mmX of [spine.x, spine.x + spine.w]) {
      const frameFrac = l.leftFrac + (((mmX - rect.x) * k) / targetW) * l.widthFrac;
      assert.ok(Math.abs(frameFrac - mmX / wMm) * wMm < 0.01);
    }
  });

  it('wide-panel (Front/Back) crops keep the same registration', () => {
    // Representative 12" front panel on this template: ~313 mm square + 4% pad.
    const front = { x: 58.2, y: 101.5389, w: 338.25, h: 336.2841 };
    const s = wMm / front.w; // ~2.3
    const dims = computeCropCanvasSize(front.w, front.h, 1440 * 4);
    const r = cropRenderedRectMm(front, dims.targetW, dims.targetH, dims.scale);
    const l = parseLayout(rasterCssLayout(r, wMm, hMm, s));
    approx(l.leftFrac, r.x / wMm, 1e-7);
    approx(l.widthFrac, r.w / wMm, 1e-7);
    const k = PT_PER_MM * dims.scale;
    for (const mmX of [front.x + 12.5, front.x + front.w / 2, front.x + front.w - 12.5]) {
      const frameFrac = l.leftFrac + (((mmX - r.x) * k) / dims.targetW) * l.widthFrac;
      assert.ok(Math.abs(frameFrac - mmX / wMm) * wMm < 0.01);
    }
  });

  it('full-view rasters (whole template, s=1..4) stay identity-registered', () => {
    for (const s of [1, 2, 4]) {
      const l = parseLayout(rasterCssLayout({ x: 0, y: 0, w: wMm, h: hMm }, wMm, hMm, s));
      approx(l.leftFrac, 0, 1e-9);
      approx(l.widthFrac, 1, 1e-7);
      approx(l.heightFrac, 1, 1e-7);
    }
  });
});

describe('rasterCssLayout — browser-resolved on-screen geometry (Task #3406)', () => {
  // Regression: the pure string math above was correct while every on-screen
  // <img> was WRONG — Tailwind's preflight `img { max-width: 100% }` clamped
  // the full-size layout box (width > 100% in every crop view), the translate
  // % then resolved against the clamped box, and the Back tab painted the
  // front-cover slice. This suite resolves the style the way the BROWSER
  // does — element box (honoring max-width) + transform → frame-relative
  // rect — so a missing max-width opt-out fails loudly.
  const wMm = 2209.36 * (25.4 / 72); // 779.413 mm — MRP 12-JKTSG3D-100
  const hMm = 1528.8 * (25.4 / 72);  // 539.327 mm

  /** Emulate Chromium: used box = min(width, max-width) for an <img> under
   *  Tailwind preflight; translate % resolves against the USED border box;
   *  scale(1/s) about origin 0 0. Returns the frame-fraction rect. */
  const browserRect = (l: ReturnType<typeof rasterCssLayout>) => {
    const widthPct = parseFloat(l.width);
    const heightPct = parseFloat(l.height);
    const maxW = (l as { maxWidth?: string }).maxWidth === 'none' ? Infinity : 100;
    const maxH = (l as { maxHeight?: string }).maxHeight === 'none' ? Infinity : Infinity; // preflight sets no max-height
    const usedW = Math.min(widthPct, maxW) / 100; // frame-width fractions
    const usedH = Math.min(heightPct, maxH) / 100; // frame-height fractions
    const m = /translate\((-?[\d.]+)%, (-?[\d.]+)%\) scale\(([\d.e-]+)\)/.exec(l.transform)!;
    assert.ok(m, `transform parse: ${l.transform}`);
    const [txPct, tyPct, invS] = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
    return {
      // frame-fraction of frame WIDTH / HEIGHT respectively
      left: (txPct / 100) * usedW,
      top: (tyPct / 100) * usedH,
      width: usedW * invS,
      height: usedH * invS,
    };
  };

  const assertLandsAt = (rect: { x: number; y: number; w: number; h: number }, s: number) => {
    const r = browserRect(rasterCssLayout(rect, wMm, hMm, s));
    approx(r.left, rect.x / wMm, 1e-6, `left ${r.left} != ${rect.x / wMm}`);
    approx(r.top, rect.y / hMm, 1e-6, `top ${r.top} != ${rect.y / hMm}`);
    approx(r.width, rect.w / wMm, 1e-6, `width ${r.width} != ${rect.w / wMm}`);
    approx(r.height, rect.h / hMm, 1e-6, `height ${r.height} != ${rect.h / hMm}`);
  };

  it('opts out of the Tailwind img max-width clamp', () => {
    const l = rasterCssLayout({ x: 0, y: 0, w: wMm, h: hMm }, wMm, hMm, 2.3);
    assert.equal(l.maxWidth, 'none');
    assert.equal(l.maxHeight, 'none');
  });

  it('full sheet at s=1 fills the frame exactly', () => {
    assertLandsAt({ x: 0, y: 0, w: wMm, h: hMm }, 1);
  });

  it('full sheet in a Back crop (s≈2.3) — the clamp case that showed the wrong panel', () => {
    // Back panel (left of the spine on a jacket spread) + 4% pad → the frame
    // scale that made widthPct = 230% and triggered the preflight clamp.
    const back = { x: 58.2, y: 113.993, w: 313.4, h: 311.374 };
    const pad = Math.max(back.w, back.h) * 0.04;
    const s = wMm / (back.w + pad * 2); // ≈ 2.3
    const sheet = rasterCssLayout({ x: 0, y: 0, w: wMm, h: hMm }, wMm, hMm, s);
    assert.ok(parseFloat(sheet.width) > 200, 'precondition: layout box far wider than the frame');
    assertLandsAt({ x: 0, y: 0, w: wMm, h: hMm }, s);
    // A back-panel art rect in the same crop stays seated in the back panel.
    assertLandsAt({ x: back.x + 1.0, y: back.y, w: back.h, h: back.h }, s);
  });

  it('skinny-spine extreme (s≈27.4, Task #3374) keeps a full-size box AND lands true', () => {
    const focus = { x: 375.4697, y: 101.5389, w: 28.4352, h: 336.2841 };
    const s = wMm / focus.w; // ~27.41
    const { targetW, targetH, scale } = computeCropCanvasSize(focus.w, focus.h, 1440 * 4);
    const rect = cropRenderedRectMm(focus, targetW, targetH, scale);
    const l = rasterCssLayout(rect, wMm, hMm, s);
    // The #3374 paint-snap fix must hold: layout box stays frame-sized.
    assert.ok(parseFloat(l.width) > 50, `layout box must stay full-size, got ${l.width}`);
    assertLandsAt(rect, s);
  });
});

describe('cropRenderedRectMm', () => {
  it('tall-narrow spine under the 4096px cap — rect matches the rounded canvas exactly', () => {
    const focus = { x: 158.3, y: 6.1, w: 3.5 + 2 * 4.94, h: 120 + 2 * 4.94 }; // spine + 4% pad
    const desired = Math.round(1440 * 4 * 2);
    const { targetW, targetH, scale } = computeCropCanvasSize(focus.w, focus.h, desired);
    const rect = cropRenderedRectMm(focus, targetW, targetH, scale);
    const k = PT_PER_MM * scale;
    // Origin is exact (canvas (0,0) == focus top-left by construction).
    assert.equal(rect.x, focus.x);
    assert.equal(rect.y, focus.y);
    // Extent derives from the INTEGER canvas size, not the requested focus —
    // stretching the raster over rect keeps mm-per-canvas-px uniform.
    approx(rect.w * k, targetW, 1e-9);
    approx(rect.h * k, targetH, 1e-9);
    // And it never drifts more than the half-pixel the rounding introduced.
    assert.ok(Math.abs(rect.w - focus.w) * k <= 0.5 + 1e-9);
    assert.ok(Math.abs(rect.h - focus.h) * k <= 0.5 + 1e-9);
  });
});
