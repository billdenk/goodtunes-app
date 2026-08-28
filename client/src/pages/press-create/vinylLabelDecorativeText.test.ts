// Task #3445 — vinyl center labels are logo-only. The decorative
// "33 ⅓ RPM" / press-code arc text that used to print beneath the press mark
// was removed from every vinyl preview renderer (center-label editor,
// vinyl-type previews, package builder, quote builder — all press skins,
// including MRP). This regression check scans the renderer sources: the
// ornamental arc text must stay gone, while the press-logo label treatment
// (WhiteMarkGlyph / PressLogoImg / PressDiscLabel) must still be present.
// Legitimate RPM copy in audio-spec fields (e.g. PressSpecs "33⅓ RPM"
// side-length inputs) is intentionally untouched and not covered here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..'); // client/src/pages

const RENDERERS: Array<{ file: string; logoMarkers: string[] }> = [
  {
    file: 'press-components/PressLabelsComponent.tsx',
    logoMarkers: ['WhiteMarkGlyph', 'resolvePressMarkLogo'],
  },
  {
    file: 'press-components/PressVinylStyles.tsx',
    logoMarkers: ['WhiteMarkGlyph', 'DiscLabelArt'],
  },
  {
    file: 'press-create/PressPackageBuilder.tsx',
    logoMarkers: ['PressLogoImg', 'DiscLabelArt', 'LabelLogo'],
  },
  {
    file: 'press-create/PressQuoteBuilder.tsx',
    logoMarkers: ['PressLogoImg', 'DiscLabelArt', 'LabelLogo'],
  },
  {
    file: 'PressVinylColors.tsx',
    logoMarkers: ['PressDiscLabel'],
  },
];

// Signatures of the removed ornamental label metadata.
const DECORATIVE = ['33 ⅓ RPM', 'showArcText', 'arcTextFill', '-001 ·'];

for (const { file, logoMarkers } of RENDERERS) {
  test(`${file}: no decorative RPM/press-code label text`, () => {
    const src = readFileSync(resolve(root, file), 'utf8');
    for (const sig of DECORATIVE) {
      assert.ok(
        !src.includes(sig),
        `${file} still contains decorative label text signature: ${JSON.stringify(sig)}`,
      );
    }
    for (const marker of logoMarkers) {
      assert.ok(
        src.includes(marker),
        `${file} lost its press-logo label treatment (missing ${marker})`,
      );
    }
  });
}
