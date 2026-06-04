// Task #1259 — unit coverage for the self-diagnosing error-report parser.
//
// `parseComponentName` turns React's `componentStack` into the name of the
// component closest to the throw, so a tap-to-report lands in the inbox
// already pointing at the screen that broke — even in prod where the JS
// stack is otherwise minified. This pins the parsing rules: skip lowercase
// host elements, prefer the first real (capitalized) component, and never
// throw on malformed/empty input.
//
// Pure function, no DOM needed — runs under Node's built-in runner via tsx:
//   npx tsx --test client/src/components/globalErrorBoundary.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import { parseComponentName } from "./GlobalErrorBoundary";

test("picks the throwing component (deepest frame) over host elements", () => {
  const stack = "\n    at AlbumDetail (https://app/x.js)\n    at div\n    at TooltipProvider";
  assert.equal(parseComponentName(stack), "AlbumDetail");
});

test("skips leading lowercase host elements to the first real component", () => {
  const stack = "\n    at div\n    at span\n    at BottomNav (https://app/x.js)";
  assert.equal(parseComponentName(stack), "BottomNav");
});

test("supports the `in Component` frame style too", () => {
  const stack = "\n    in VendorProfile\n    in div";
  assert.equal(parseComponentName(stack), "VendorProfile");
});

test("falls back to the first frame when no capitalized component exists", () => {
  assert.equal(parseComponentName("\n    at div\n    at span"), "div");
});

test("returns null for empty / missing input", () => {
  assert.equal(parseComponentName(null), null);
  assert.equal(parseComponentName(undefined), null);
  assert.equal(parseComponentName(""), null);
  assert.equal(parseComponentName("no frames here"), null);
});

test("keeps dotted display names (e.g. Foo.Bar) intact", () => {
  assert.equal(parseComponentName("\n    at Menu.Item (https://app/x.js)"), "Menu.Item");
});
