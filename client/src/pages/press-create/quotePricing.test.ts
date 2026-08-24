// Honest component-quote pricing (Task #3243): no demo defaults, ever.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeQuotePricer, rowDollars, pricedSum, pendingLines, scaledUnitDollars, computeQuotePendingIds, QUOTE_SETUP_SERVICE_KEYS, type QuoteLine } from "./quotePricing";
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

// ── Imported quantity ladders + style inheritance (Task #3325) ────────────
const LADDER_ROWS: PricingRow[] = [
  row({
    key: "type:opaque",
    label: "Opaque",
    rungsBySize: { '12"': [{ qty: 300, unitCents: 235 }, { qty: 1000, unitCents: 230 }, { qty: 25000, unitCents: 225 }] },
    rungsBySizeHeavy: { '12"': [{ qty: 300, unitCents: 310 }, { qty: 25000, unitCents: 305 }] },
  }),
  row({ key: "color:opaque:ruby", kind: "color", label: "Ruby", detail: "Opaque" }),
  row({
    key: "type:splatter",
    label: "Splatter",
    surchargeOver: "type:opaque",
    rungsBySize: { '12"': [{ qty: 300, unitCents: 75 }, { qty: 1000, unitCents: 55 }] },
  }),
  row({ key: "color:splatter:cosmic", kind: "color", label: "Cosmic", detail: "Splatter" }),
  row({
    key: "service:stampers", kind: "service", label: "Stampers", sizes: [], oneTime: true,
    rungsBySize: { '12"': [{ qty: 1000, unitCents: 0 }, { qty: 2000, unitCents: 14000 }] },
  }),
  row({
    key: "jackets:gatefold", kind: "jackets", label: "Gatefold", sizes: [],
    rungsBySize: { '12"': [{ qty: 1000, unitCents: 231 }, { qty: 2000, unitCents: 146 }] },
  }),
];

test("vinyl ladders: color inherits the style rung at qty; snap UP between rungs; 180g uses the heavy ladder", () => {
  const pricer = makeQuotePricer(LADDER_ROWS);
  assert.equal(pricer.vinyl("Ruby", "Opaque", "12", "140", 1000), 2.3);
  // 600 snaps UP to the 1,000 rung
  assert.equal(pricer.vinyl("Ruby", "Opaque", "12", "140", 600), 2.3);
  assert.equal(pricer.vinyl("Ruby", "Opaque", "12", "140", 25000), 2.25);
  // 180g resolves ONLY the heavy ladder
  assert.equal(pricer.vinyl("Ruby", "Opaque", "12", "180", 300), 3.1);
  // no 7" ladder → pending
  assert.equal(pricer.vinyl("Ruby", "Opaque", "7", "140", 1000), null);
});

test("splatter = surcharge over the base style, laddered", () => {
  const pricer = makeQuotePricer(LADDER_ROWS);
  // base opaque 2.30 + adder 0.55 at 1,000
  assert.equal(pricer.vinyl("Cosmic", "Splatter", "12", "140", 1000), 2.85);
  // at 300: 2.35 + 0.75
  assert.equal(pricer.vinyl("Cosmic", "Splatter", "12", "140", 300), 3.1);
});

test("surcharge provenance split: operator-entered portions still ride the run-size factor", () => {
  // Operator overrides the BASE style with a flat cell (manual): the splatter
  // total must split into manual base + laddered adder, and only the manual
  // portion scales with the synthetic run-size factor.
  const manualBase = LADDER_ROWS.map((r) =>
    r.key === "type:opaque" ? { ...r, pricesBySize: { '12"': 200 } } : r,
  );
  let p = makeQuotePricer(manualBase).vinylEx("Cosmic", "Splatter", "12", "140", 1000)!;
  assert.equal(p.v, 2.55); // 2.00 manual + 0.55 laddered adder
  assert.equal(p.laddered, false);
  assert.deepEqual(p.parts, { manualV: 2, ladderV: 0.55 });
  // At a non-reference factor (e.g. 1.2), only the manual $2.00 scales.
  assert.equal(scaledUnitDollars(p, 1.2), 2.95);

  // Operator overrides the ADDER instead: base stays laddered, adder manual.
  const manualAdder = LADDER_ROWS.map((r) =>
    r.key === "type:splatter" ? { ...r, pricesBySize: { '12"': 100 } } : r,
  );
  p = makeQuotePricer(manualAdder).vinylEx("Cosmic", "Splatter", "12", "140", 1000)!;
  assert.equal(p.v, 3.3); // 2.30 laddered base + 1.00 manual adder
  assert.deepEqual(p.parts, { manualV: 1, ladderV: 2.3 });
  assert.equal(scaledUnitDollars(p, 1.5), 2.3 + 1.5);

  // Fully imported composition stays laddered (factor never applies).
  p = makeQuotePricer(LADDER_ROWS).vinylEx("Cosmic", "Splatter", "12", "140", 1000)!;
  assert.equal(p.laddered, true);
  assert.equal(scaledUnitDollars(p, 1.7), 2.85);
});

test("scaledUnitDollars: manual lines scale, laddered lines don't, pending = 0", () => {
  assert.equal(scaledUnitDollars({ v: 2, laddered: false }, 1.3), 2.6);
  assert.equal(scaledUnitDollars({ v: 2, laddered: true }, 1.3), 2);
  assert.equal(scaledUnitDollars({ v: null }, 1.3), 0);
});

test("operator per-color override beats the inherited ladder", () => {
  const rows = LADDER_ROWS.map((r) =>
    r.key === "color:opaque:ruby" ? { ...r, pricesBySize: { '12"': 999 } } : r,
  );
  assert.equal(makeQuotePricer(rows).vinyl("Ruby", "Opaque", "12", "140", 1000), 9.99);
});

test("flatEx: ladders carry laddered=true; oneTime rows resolve totals at qty", () => {
  const pricer = makeQuotePricer(LADDER_ROWS);
  assert.deepEqual(pricer.flatEx("jackets:gatefold", "12", 2000), { v: 1.46, laddered: true, oneTime: false });
  // stampers one-time total: $0 at 1,000 (genuine "Included"), $140 at 2,000
  assert.deepEqual(pricer.flatEx("service:stampers", "12", 1000), { v: 0, laddered: true, oneTime: true });
  assert.equal(pricer.flat("service:stampers", "12", 2000), 140);
  // beyond the top rung → pending, never extrapolated
  assert.equal(pricer.flat("jackets:gatefold", "12", 5000), null);
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
