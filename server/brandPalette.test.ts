// Task #3257 — pure unit tests for the white-label palette suggester.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHex,
  isValidAccentHex,
  hexLuminance,
  isPlausibleAccent,
  extractPaletteFromHtml,
} from "./brandPalette";

test("normalizeHex expands 3-digit and uppercases", () => {
  assert.equal(normalizeHex("#b3282d"), "#B3282D");
  assert.equal(normalizeHex("#f00"), "#FF0000");
  assert.equal(normalizeHex("not-a-hex"), null);
  assert.equal(normalizeHex("#12345"), null);
});

test("isValidAccentHex accepts only #RRGGBB", () => {
  assert.ok(isValidAccentHex("#319ED8"));
  assert.ok(!isValidAccentHex("319ED8"));
  assert.ok(!isValidAccentHex("#fff"));
});

test("hexLuminance orders black < mid < white", () => {
  const black = hexLuminance("#000000");
  const mid = hexLuminance("#B3282D");
  const white = hexLuminance("#FFFFFF");
  assert.ok(black < mid && mid < white);
});

test("isPlausibleAccent drops near-white, near-black, and greys", () => {
  assert.ok(!isPlausibleAccent("#FFFFFF"));
  assert.ok(!isPlausibleAccent("#F8F8F8"));
  assert.ok(!isPlausibleAccent("#000000"));
  assert.ok(!isPlausibleAccent("#888888")); // grey — no saturation
  assert.ok(isPlausibleAccent("#B3282D")); // MRP red
  assert.ok(isPlausibleAccent("#1E5AA8"));
});

test("extractPaletteFromHtml weights theme-color first, then frequency", () => {
  const html = `
    <html><head>
      <meta name="theme-color" content="#B3282D">
      <style>
        .a { color: #1E5AA8; } .b { color: #1E5AA8; } .c { color: #1E5AA8; }
        .d { color: #1F6E43; }
        .grey { color: #888888; } .white { background: #ffffff; }
      </style>
    </head><body></body></html>`;
  const palette = extractPaletteFromHtml(html);
  assert.equal(palette[0], "#B3282D"); // theme-color wins
  assert.equal(palette[1], "#1E5AA8"); // most frequent plausible
  assert.ok(palette.includes("#1F6E43"));
  assert.ok(!palette.includes("#888888"));
  assert.ok(!palette.includes("#FFFFFF"));
});

test("extractPaletteFromHtml caps at max and handles empty input", () => {
  assert.deepEqual(extractPaletteFromHtml(""), []);
  const many = Array.from({ length: 10 }, (_, i) => `<i style="color:#${(i + 1).toString(16).padStart(2, "0")}40A0"></i>`).join("");
  assert.ok(extractPaletteFromHtml(many, 3).length <= 3);
});
