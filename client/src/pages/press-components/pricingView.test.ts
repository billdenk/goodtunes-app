// Task #3047 — pure view helpers for the per-size Pricing page: size chip
// filtering, grouping, per-size price binding, and the priced counter.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIZE_CHIPS,
  defaultSizeChip,
  groupPricingRows,
  priceForSize,
  pricedCountForSize,
  rowInSize,
  visibleRowsForSize,
} from "./pricingView";
import type { PricingRow } from "@shared/pressComponents";

const row = (over: Partial<PricingRow>): PricingRow => ({
  key: "k",
  label: "x",
  detail: "",
  kind: "type",
  sizes: [],
  priceCents: null,
  pricesBySize: {},
  ...over,
});

const rows: PricingRow[] = [
  row({ key: "type:black", kind: "type", sizes: ['7"', '10"', '12"'], pricesBySize: { '7"': 100 } }),
  row({ key: "color:black:classic", kind: "color", sizes: ['7"', '10"', '12"'] }),
  row({ key: "type:splatter", kind: "type", sizes: ['10"', '12"'], pricesBySize: { '12"': 250 } }),
  row({ key: "color:splatter:cosmic", kind: "color", sizes: ['12"'] }),
  row({ key: "type:legacy-nosizes", kind: "type", sizes: [], pricesBySize: { '7"': 5, '12"': 5 } }),
];

test("rowInSize: sized rows filter; size-less rows show everywhere", () => {
  assert.equal(rowInSize(rows[2], '7"'), false); // Splatter not in 7"
  assert.equal(rowInSize(rows[2], '10"'), true);
  assert.equal(rowInSize(rows[4], '7"'), true); // no sizes = every chip
});

test("groupPricingRows: a type hidden for the size hides its color rows too", () => {
  const g7 = groupPricingRows(rows, '7"');
  assert.deepEqual(g7.out.map((g) => g.type.key), ["type:black", "type:legacy-nosizes"]);
  // splatter's cosmic color must NOT leak into orphans when its type is hidden
  assert.deepEqual(g7.orphans, []);
  const g12 = groupPricingRows(rows, '12"');
  const splatter = g12.out.find((g) => g.type.key === "type:splatter")!;
  assert.deepEqual(splatter.colors.map((c) => c.key), ["color:splatter:cosmic"]);
});

test("groupPricingRows: color rows filter within a visible type (cosmic is 12\"-only)", () => {
  const g10 = groupPricingRows(rows, '10"');
  const splatter = g10.out.find((g) => g.type.key === "type:splatter")!;
  assert.deepEqual(splatter.colors, []);
});

test("priceForSize: a price typed under 7\" does not appear under 12\"", () => {
  assert.equal(priceForSize(rows[0], '7"'), 100);
  assert.equal(priceForSize(rows[0], '12"'), null);
});

test("pricedCountForSize counts only the selected size's visible priced cells", () => {
  // 7": black(100) + legacy-nosizes(5) priced of 3 visible
  assert.equal(visibleRowsForSize(rows, '7"').length, 3);
  assert.equal(pricedCountForSize(rows, '7"'), 2);
  // 12": splatter(250) + legacy-nosizes(5) of 5 visible
  assert.equal(pricedCountForSize(rows, '12"'), 2);
  // 10": nothing priced under 10"
  assert.equal(pricedCountForSize(rows, '10"'), 0);
});

test("defaultSizeChip picks the first chip with rows; 12\" fallback when empty", () => {
  // Chips are largest-first (size-pill canon, Aug 2026), so a mixed-size
  // press opens on 12″; a 7″-only press opens on 7″.
  assert.equal(defaultSizeChip(rows), '12"');
  assert.equal(defaultSizeChip([row({ sizes: ['7"'] })]), '7"');
  assert.equal(defaultSizeChip([row({ sizes: ['12"'] })]), '12"');
  assert.equal(defaultSizeChip([]), '12"');
  assert.equal(SIZE_CHIPS.length, 3);
});
