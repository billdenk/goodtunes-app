// Task #3047 — pure view helpers for the per-size Pricing page: size chip
// filtering, grouping, per-size price binding, and the priced counter.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIZE_CHIPS,
  colorEffectiveCents,
  defaultSizeChip,
  effectiveTypeCentsForSize,
  groupPricingRows,
  ladderCentsForSize,
  priceForSize,
  pricedCountForSize,
  rowInSize,
  styleRowsForSize,
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

test("pricedCountForSize is style-first: colors excluded from the denominator (Task #3325)", () => {
  // 7": styles = black + legacy-nosizes (classic color excluded)
  assert.equal(styleRowsForSize(rows, '7"').length, 2);
  assert.equal(pricedCountForSize(rows, '7"'), 2);
  // 12": styles = black, splatter, legacy; priced = splatter(250) + legacy(5)
  assert.equal(styleRowsForSize(rows, '12"').length, 3);
  assert.equal(pricedCountForSize(rows, '12"'), 2);
  // 10": nothing priced under 10"
  assert.equal(pricedCountForSize(rows, '10"'), 0);
});

// ── Imported quantity ladders + style inheritance (Task #3325) ────────────
const laddered: PricingRow[] = [
  row({
    key: "type:opaque",
    kind: "type",
    sizes: ['12"'],
    rungsBySize: { '12"': [{ qty: 300, unitCents: 235 }, { qty: 1000, unitCents: 230 }, { qty: 25000, unitCents: 230 }] },
  }),
  row({ key: "color:opaque:ruby", kind: "color", sizes: ['12"'] }),
  row({ key: "color:opaque:jade", kind: "color", sizes: ['12"'], pricesBySize: { '12"': 999 } }),
  row({
    key: "type:splatter",
    kind: "type",
    sizes: ['12"'],
    surchargeOver: "type:opaque",
    rungsBySize: { '12"': [{ qty: 300, unitCents: 75 }, { qty: 1000, unitCents: 55 }] },
  }),
  row({ key: "color:splatter:cosmic", kind: "color", sizes: ['12"'] }),
];

test("ladderCentsForSize reads the 1,000-unit reference rung", () => {
  assert.equal(ladderCentsForSize(laddered[0], '12"'), 230);
  assert.equal(ladderCentsForSize(laddered[0], '7"'), null);
});

test("effectiveTypeCentsForSize: operator cell wins over the imported ladder", () => {
  assert.equal(effectiveTypeCentsForSize(laddered[0], '12"'), 230);
  const overridden = { ...laddered[0], pricesBySize: { '12"': 300 } };
  assert.equal(effectiveTypeCentsForSize(overridden, '12"'), 300);
});

test("colorEffectiveCents: colors inherit the style price; overrides win; surcharge adds on base", () => {
  // plain inheritance
  assert.deepEqual(colorEffectiveCents(laddered[1], laddered, '12"'), { cents: 230, inherited: true });
  // per-color operator override
  assert.deepEqual(colorEffectiveCents(laddered[2], laddered, '12"'), { cents: 999, inherited: false });
  // splatter color = base opaque (230) + adder (55)
  assert.deepEqual(colorEffectiveCents(laddered[4], laddered, '12"'), { cents: 285, inherited: true });
});

test("pricedCountForSize counts ladder-priced styles as priced", () => {
  // styles: opaque (laddered) + splatter (laddered adder) = 2 of 2
  assert.equal(styleRowsForSize(laddered, '12"').length, 2);
  assert.equal(pricedCountForSize(laddered, '12"'), 2);
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
