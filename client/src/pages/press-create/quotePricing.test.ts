// Honest component-quote pricing (Task #3243): no demo defaults, ever.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeQuotePricer, rowDollars, pricedSum, pendingLines, computeQuotePendingIds, QUOTE_SETUP_SERVICE_KEYS, type QuoteLine } from "./quotePricing";
import type { PricingRow } from "@shared/pressComponents";

const row = (partial: Partial<PricingRow>): PricingRow => ({
  key: "type:black",
  label: "Black",
  detail: "",
  kind: "type",
  sizes: ['7"', '12"'],
  priceCents: null,
  pricesBySize: {},
  ...partial,
});

test("rowDollars: per-size cell wins, legacy priceCents fallback, null when blank", () => {
  const r = row({ pricesBySize: { '12"': 176, '7"': 142 } });
  assert.equal(rowDollars(r, "12"), 1.76);
  assert.equal(rowDollars(r, "7"), 1.42);
  assert.equal(rowDollars(row({ priceCents: 30 })), 0.3);
  assert.equal(rowDollars(row({}), "12"), null);
  assert.equal(rowDollars(undefined), null);
});

test("flat: unknown key (gatefold jacket with no row) is pending, priced jackets row flows", () => {
  const pricer = makeQuotePricer([row({ key: "jackets:gatefold", kind: "jackets", label: "Gatefold", priceCents: 260 })]);
  assert.equal(pricer.flat("jackets:gatefold"), 2.6);
  assert.equal(pricer.flat("jackets:single"), null);
  assert.equal(makeQuotePricer([]).flat("jackets:gatefold"), null);
});

test("vinyl: color row by name wins over type row; blank rows are pending, never a demo price", () => {
  const rows = [
    row({ key: "type:opaque", label: "Opaque", pricesBySize: { '12"': 206 } }),
    row({ key: "color:opaque:ruby", kind: "color", label: "Ruby", detail: "Opaque", pricesBySize: { '12"': 210 } }),
  ];
  const pricer = makeQuotePricer(rows);
  assert.equal(pricer.vinyl("Ruby", "Opaque", "12", "140"), 2.1);
  // no color row → tier's type row
  assert.equal(pricer.vinyl("Jet", "Opaque", "12", "140"), 2.06);
  // size with no cell → pending
  assert.equal(pricer.vinyl("Ruby", "Opaque", "7", "140"), null);
  // unknown tier → pending
  assert.equal(pricer.vinyl("Ruby", "Splatter", "12", "140"), null);
  // 180 g has no component slot yet → pending
  assert.equal(pricer.vinyl("Ruby", "Opaque", "12", "180"), null);
});

test("pricedSum excludes pending lines; pendingLines finds them", () => {
  const lines: QuoteLine[] = [
    { id: "vinyl", name: "12\" Black", v: 1.76 },
    { id: "jacket", name: "Gatefold jacket", v: null },
    { id: "shrink", name: "Shrinkwrap", v: 0.15 },
  ];
  assert.equal(pricedSum(lines), 1.91);
  assert.deepEqual(pendingLines(lines).map((l) => l.id), ["jacket"]);
});

// ── Server-owned pending derivation (computeQuotePendingIds) ─────────────
const flatRow = (key: string, cents: number | null): PricingRow =>
  row({ key, kind: key.startsWith("service:") ? "service" : (key.split(":")[0] as PricingRow["kind"]), label: key, sizes: [], priceCents: cents, pricesBySize: {} });

const FULL_ROWS: PricingRow[] = [
  row({ key: "type:black", label: "Black", pricesBySize: { '12"': 176, '7"': 142 } }),
  row({ key: "color:black:classic", kind: "color", label: "Classic Black", detail: "Black", pricesBySize: { '12"': 176 } }),
  flatRow("labels:blank", 8),
  flatRow("jackets:single", 165),
  flatRow("jackets:gatefold", null), // ← Viryl's Custom Quote gatefold
  flatRow("sleeves:unprinted", 0),
  flatRow("service:assembly", 11),
  flatRow("service:shrink", 15),
  ...QUOTE_SETUP_SERVICE_KEYS.map((k) => flatRow(k, k === "service:stampers" ? 0 : 100)),
];

const FULL_STATE = {
  sizeId: "12",
  weightId: "140",
  colorName: "Classic Black",
  colorTierName: "Black",
  labelId: "blank",
  jacketId: "single",
  sleeveId: "unprinted",
  insertId: "none",
  stickerShapeId: "none",
  done: ["size", "weight", "color", "label", "jacket", "sleeve", "insert", "sticker", "qty"],
};

test("computeQuotePendingIds: a fully priced build has NO pending lines", () => {
  assert.deepEqual(computeQuotePendingIds(FULL_STATE, FULL_ROWS), []);
});

test("computeQuotePendingIds: an unpriced gatefold jacket blocks; swapping the row's price unblocks with no code change", () => {
  const bs = { ...FULL_STATE, jacketId: "gatefold" };
  assert.deepEqual(computeQuotePendingIds(bs, FULL_ROWS), ["jacket"]);
  const priced = FULL_ROWS.map((r) => (r.key === "jackets:gatefold" ? { ...r, priceCents: 350 } : r));
  assert.deepEqual(computeQuotePendingIds(bs, priced), []);
});

test("computeQuotePendingIds fails CLOSED: pre-name drafts, missing service rows, empty state", () => {
  // old draft without persisted color names → vinyl pending
  const noNames = { ...FULL_STATE, colorName: undefined, colorTierName: undefined };
  assert.ok(computeQuotePendingIds(noNames, FULL_ROWS).includes("vinyl"));
  // a missing setup service row → its id pending
  const noCutting = FULL_ROWS.filter((r) => r.key !== "service:cutting");
  assert.deepEqual(computeQuotePendingIds(FULL_STATE, noCutting), ["cutting"]);
  // no rows at all → everything picked is pending
  const all = computeQuotePendingIds(FULL_STATE, []);
  for (const id of ["vinyl", "assembly", "shrink", "label", "jacket", "sleeve", "cutting", "plating", "test", "stampers", "colorfee"]) {
    assert.ok(all.includes(id), `expected ${id} pending`);
  }
});
