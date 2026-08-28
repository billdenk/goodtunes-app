// Task #3446 — background-aware press-mark selection. White product
// surfaces (B&W center labels, sticker previews, and their package/quote
// builder counterparts) must prefer the press's uploaded LIGHT-background
// artwork (e.g. MRP's black mark); dark faces keep the dark-background/
// white mark (labelLogoUrl first, rendered via WhiteMarkGlyph). Fallbacks
// stay sensible when a press has only partial uploads.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolvePressMarkLogo,
  resolvePressMarkLogoOnLight,
  hasDedicatedLightMark,
  type PressComponentsPayload,
} from "./usePressComponents";
import { resolveStickerLogo } from "./PressStickersComponent";

type Press = PressComponentsPayload["press"];
const press = (over: Partial<Press>): Press => ({
  id: "p1",
  name: "Memphis Record Pressing",
  logoUrl: null,
  lightLogoUrl: null,
  squareLogoUrl: null,
  lightSquareLogoUrl: null,
  identityIconUrl: null,
  labelLogoUrl: null,
  labelBgColor: null,
  ...over,
});

test("light surfaces prefer the uploaded light-background mark over the white label mark", () => {
  const mrp = press({
    labelLogoUrl: "/objects/uploads/white-label-mark.svg", // dark-bg/white artwork
    lightLogoUrl: "/objects/uploads/black-light-mark.svg", // light-bg/black artwork
    logoUrl: "/objects/uploads/corporate.svg",
  });
  assert.equal(resolvePressMarkLogoOnLight(mrp), "/objects/uploads/black-light-mark.svg");
  // Sticker previews (white stock) resolve through the same light chain.
  assert.equal(resolveStickerLogo(mrp), "/objects/uploads/black-light-mark.svg");
  assert.equal(hasDedicatedLightMark(mrp), true);
});

test("light square variant outranks the main light variant", () => {
  const p = press({
    lightLogoUrl: "/objects/uploads/light-wide.svg",
    lightSquareLogoUrl: "/objects/uploads/light-square.svg",
  });
  assert.equal(resolvePressMarkLogoOnLight(p), "/objects/uploads/light-square.svg");
});

test("partial uploads: no light variant falls back without picking the white label mark first", () => {
  const p = press({
    labelLogoUrl: "/objects/uploads/white-label-mark.svg",
    logoUrl: "/objects/uploads/corporate.svg",
  });
  // Corporate/main logo (drawn for light pages) beats the white label mark.
  assert.equal(resolvePressMarkLogoOnLight(p), "/objects/uploads/corporate.svg");
  assert.equal(hasDedicatedLightMark(p), false);
  // A press with ONLY a label mark still shows something rather than nothing.
  const labelOnly = press({ labelLogoUrl: "/objects/uploads/white-label-mark.svg" });
  assert.equal(resolvePressMarkLogoOnLight(labelOnly), "/objects/uploads/white-label-mark.svg");
  // And a press with no uploads at all resolves to null (neutral chip).
  assert.equal(resolvePressMarkLogoOnLight(press({})), null);
});

test("dark faces keep the dark-background/white mark first", () => {
  const mrp = press({
    labelLogoUrl: "/objects/uploads/white-label-mark.svg",
    lightLogoUrl: "/objects/uploads/black-light-mark.svg",
    logoUrl: "/objects/uploads/corporate.svg",
  });
  assert.equal(resolvePressMarkLogo(mrp), "/objects/uploads/white-label-mark.svg");
});

// ── Source-marker regression: every light surface routes through the
// background-aware selection (same scan pattern as the decorative-text test).
const here = dirname(fileURLToPath(import.meta.url));
const pages = resolve(here, ".."); // client/src/pages

test("center-label editor picks the light chain for white stock and keeps WhiteMarkGlyph on dark", () => {
  const src = readFileSync(resolve(pages, "press-components/PressLabelsComponent.tsx"), "utf8");
  assert.ok(src.includes("resolvePressMarkLogoOnLight"), "white label stock lost the light-surface resolver");
  assert.ok(src.includes("WhiteMarkGlyph"), "dark label faces lost the white mask treatment");
  assert.ok(
    src.includes("whiteFilter ? resolvePressMarkLogo(press) : resolvePressMarkLogoOnLight(press)"),
    "LabelLogo no longer resolves the mark per surface",
  );
});

test("sticker editor resolves through the light-surface chain", () => {
  const src = readFileSync(resolve(pages, "press-components/PressStickersComponent.tsx"), "utf8");
  assert.ok(
    src.includes("return resolvePressMarkLogoOnLight(press)"),
    "resolveStickerLogo no longer delegates to the light-surface chain",
  );
});

for (const file of ["press-create/PressPackageBuilder.tsx", "press-create/PressQuoteBuilder.tsx"]) {
  test(`${file}: white label + sticker previews use PressLogoOnLightImg`, () => {
    const src = readFileSync(resolve(pages, file), "utf8");
    assert.ok(src.includes("PressLogoOnLightImg"), `${file} lost the light-surface press mark component`);
    // No light-filtered PressLogoImg site should remain — those are exactly
    // the white surfaces that must go through the background-aware component.
    const lightFilteredPressLogo = /<PressLogoImg[^>]*PRESS_MARK_ON_LIGHT/s.test(
      src.replace(/<PressLogoOnLightImg[\s\S]*?\/>/g, ""),
    );
    assert.ok(!lightFilteredPressLogo, `${file} still renders PressLogoImg with the on-light filter`);
    // Dark faces keep the white-mark filter.
    assert.ok(src.includes("PRESS_MARK_ON_DARK"), `${file} lost the dark-face white mark filter`);
  });
}
