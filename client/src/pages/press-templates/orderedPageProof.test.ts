import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { analyzePdfArtPage, buildImageColorIndex, type PdfPageAnalysis } from './pdfPageAnalysis';
import { aggregatePagePass, pageVerdicts } from './pageProof';
import { DEFAULT_TEMPLATE_OPACITY, templateCompositeStyle } from './proofComposite';

const OPS = {
  save: 1, restore: 2, transform: 3,
  setFillCMYKColor: 4, setFillRGBColor: 5, setFillGray: 6, setFillColorN: 7,
  setStrokeCMYKColor: 8, setStrokeRGBColor: 9, setStrokeGray: 10, setStrokeColorN: 11,
  fill: 12, eoFill: 13, stroke: 14, closeStroke: 15, fillStroke: 16, eoFillStroke: 17, closeFillStroke: 18, closeEOFillStroke: 19,
  showText: 20, showSpacedText: 21, nextLineShowText: 22, nextLineSetSpacingShowText: 23,
  paintImageMaskXObject: 24, paintImageMaskXObjectRepeat: 25, paintImageMaskXObjectGroup: 26, paintSolidColorImageMask: 27,
  paintImageXObject: 28, paintInlineImageXObject: 29, paintImageXObjectRepeat: 30, paintInlineImageXObjectGroup: 31,
} as const;

function documentWith(ops: Array<[number, unknown[]]>) {
  return {
    getPage: async () => ({
      getOperatorList: async () => ({
        fnArray: ops.map(([fn]) => fn),
        argsArray: ops.map(([, args]) => args),
      }),
    }),
  } as any;
}

const passAnalysis = (): PdfPageAnalysis => ({
  rasterImageCount: 1,
  unresolvedRasterImages: 0,
  minEffectivePpi: 300,
  hasCmyk: true,
  hasRgb: false,
  hasGray: false,
  hasSpot: false,
});

test('four ordered page pairs aggregate only when every page passes', () => {
  const bleed = { name: 'GT BLEED LINE', zone: 'Bleed', kind: 'line' as const, xMm: 0, yMm: 0, wMm: 161.3, hMm: 188.2 };
  const templates = Array.from({ length: 4 }, () => ({ layers: [bleed] }));
  const art = Array.from({ length: 4 }, () => ({ wMm: 161.3, hMm: 188.2, gtLayerNames: [], analysis: passAnalysis() }));
  const states = pageVerdicts(templates, art, false, () => 'pass', () => 'pass');
  assert.deepEqual(states, ['pass', 'pass', 'pass', 'pass']);
  assert.equal(aggregatePagePass(states), true);

  const failed = art.map((page, index) => index === 2 ? { ...page, gtLayerNames: ['GT PREVIEW'] } : page);
  const failedStates = pageVerdicts(templates, failed, false, () => 'pass', () => 'pass');
  assert.equal(failedStates[0], 'pass');
  assert.equal(failedStates[2], 'fail');
  assert.equal(aggregatePagePass(failedStates), false);
  assert.equal(aggregatePagePass(pageVerdicts(templates, art.slice(0, 3), true, () => 'pass', () => 'pass')), false);
});

test('effective PPI uses embedded pixels divided by painted CTM size and only painted colors', async () => {
  const doc = documentWith([
    [OPS.setFillRGBColor, []], // assigned but never painted: must not count
    [OPS.setFillCMYKColor, []],
    [OPS.fill, []],
    [OPS.transform, [457.2, 0, 0, 533.52, 0, 0]], // 6.35 × 7.41 inches
    [OPS.paintImageXObject, ['Im1', 1905, 2223]],
  ]);
  const result = await analyzePdfArtPage(doc, 1, new Map([['1905x2223', ['cmyk']]]), OPS as any);
  assert.equal(Math.round(result.minEffectivePpi!), 300);
  assert.equal(result.hasCmyk, true);
  assert.equal(result.hasRgb, false);
});

test('vector-only pages remain truthful and soft-mask image dictionaries are excluded', async () => {
  const vector = await analyzePdfArtPage(
    documentWith([[OPS.setFillCMYKColor, []], [OPS.fill, []]]),
    1,
    new Map(),
    OPS as any,
  );
  assert.equal(vector.rasterImageCount, 0);
  assert.equal(vector.minEffectivePpi, null);
  assert.equal(vector.hasCmyk, true);

  const bytes = new TextEncoder().encode(
    '%PDF\n1 0 obj << /Subtype /Image /Width 100 /Height 100 /ColorSpace /DeviceCMYK /SMask 2 0 R >> stream\n' +
    '2 0 obj << /Subtype /Image /Width 100 /Height 100 /ColorSpace /DeviceGray >> stream\n',
  );
  assert.deepEqual(buildImageColorIndex(bytes).get('100x100'), ['cmyk']);
});

test('the exact handoff fixtures are present and unchanged', async () => {
  const fixtures = [
    ['12-LBL100M-2_12in_Center_Labels_for_2LP_R091125.pdf', '9f27216c1558294ef83d5faa9dd1d2fa15dc44c02422d48a32e9901976443219'],
    ['CenterLabels_Finished.pdf', '02c60b6a8861d32afa8957dd970fc8923a189f260ac62937ef81d2eddc3de28f'],
  ] as const;
  for (const [name, expected] of fixtures) {
    const bytes = await readFile(`handoff/otis-final-canon-readiness-2026-09-04/test-fixtures/${name}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected);
  }
});

test('main and thumbnail template layers share 55% multiply semantics', () => {
  assert.equal(DEFAULT_TEMPLATE_OPACITY, 0.55);
  const main = templateCompositeStyle(true, DEFAULT_TEMPLATE_OPACITY);
  const thumbnail = templateCompositeStyle(true, DEFAULT_TEMPLATE_OPACITY);
  assert.deepEqual(main, { opacity: 0.55, mixBlendMode: 'multiply' });
  assert.deepEqual(thumbnail, main);
  assert.deepEqual(templateCompositeStyle(false, 0.2), { opacity: 1, mixBlendMode: 'normal' });
  // Visibility is deliberately not an input: an off/on toggle cannot reset
  // the operator's selected opacity; only a new template resets component state.
  assert.deepEqual(templateCompositeStyle(true, 0.37), { opacity: 0.37, mixBlendMode: 'multiply' });
});