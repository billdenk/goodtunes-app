// Per-press setup-fee rules engine (Task #3387): press-generic rule
// vocabulary, MRP's Day-2 values as the FIRST configuration. Presses with
// no rules must resolve exactly like before (honest pricing, no defaults).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateStamperFee,
  evaluateColorSetupFee,
  evaluatePressSetupFee,
  polyBagUnitLine,
  computeSetupLines,
  computeQuotePendingIds,
  computeQuoteEmailBreakdown,
  QUOTE_SETUP_SERVICE_KEYS,
  type SetupRuleContext,
} from "./quotePricing";
import { setupFeeRulesSchema, type PricingRow, type SetupFeeRules } from "./pressComponents";

// ── MRP's values (mirrors scripts/seed-mrp-setup-rules.ts) ──────────────
const MRP: SetupFeeRules = setupFeeRulesSchema.parse({
  source: "test",
  stamper: {
    reordersAlwaysPay: true,
    rules: [
      { tierMatch: ["picture", "glitter", "ghostly", "torrent", "manual effect", "special effect"], perUnitCents: 24, label: "Picture disc / glitter / manual effects" },
      { sizes: ["7"], perUnitCents: 15, label: '7" stamper fee' },
      { weights: ["180"], perUnitCents: 24, freeUnits: 500 },
      { weights: ["140"], perUnitCents: 14, freeUnits: 1000 },
    ],
  },
  colorSetup: {
    perColorCents: 9500,
    perDisc: true,
    categories: [
      { match: ["black"], colors: 0 },
      { match: ["ecomix", "eco-mix", "eco mix"], colors: 0 },
      { match: ["3-color", "3 color", "three-color", "three color", "split"], colors: 3 },
      { match: ["blend", "half", "color in color", "double double", "two-color", "2-color"], colors: 2 },
    ],
    splatter: { match: ["splatter"], baseColors: 1, perSplatterColorCents: 3500, maxSplatterColors: 3 },
    defaultColors: 1,
  },
  pressSetup: { amountCents: 9500, underQty: 500 },
  polyBag: { label: "Open-top poly bag", bagCents: 25, insertionCents: 12 },
});

const ctx = (over: Partial<SetupRuleContext>): SetupRuleContext => ({
  sizeId: "12" as SetupRuleContext["sizeId"],
  qty: 1000,
  discs: 1,
  weightId: "140",
  colorKind: "opaque",
  colorTierName: "Opaque",
  ...over,
});

// ── 16.1 Stamper fee ─────────────────────────────────────────────────────
test("stamper: 140g new audio — free first 1,000 units, per-record above", () => {
  assert.equal(evaluateStamperFee(MRP, ctx({ qty: 500 }))!.dollars, 0);
  assert.match(evaluateStamperFee(MRP, ctx({ qty: 500 }))!.note, /first 1,000 units included/);
  const above = evaluateStamperFee(MRP, ctx({ qty: 2000 }))!;
  assert.equal(above.dollars, 140); // (2000-1000) × $0.14
  assert.match(above.note, /over the first 1,000/);
});

test("stamper: reorders pay at ALL quantities", () => {
  const r = evaluateStamperFee(MRP, ctx({ qty: 500, reorder: true }))!;
  assert.equal(r.dollars, 70); // 500 × $0.14
  assert.match(r.note, /Reorder/);
});

test("stamper: 180g free first 500; 7\" and picture-disc/glitter pay always", () => {
  assert.equal(evaluateStamperFee(MRP, ctx({ qty: 1000, weightId: "180" }))!.dollars, 120); // 500 × $0.24
  assert.equal(evaluateStamperFee(MRP, ctx({ qty: 300, sizeId: "7" as SetupRuleContext["sizeId"] }))!.dollars, 45); // 300 × $0.15
  // Manual-effect tier wins over the weight rule (rule order).
  const pd = evaluateStamperFee(MRP, ctx({ qty: 300, colorTierName: "Glitter Blends" }))!;
  assert.equal(pd.dollars, 72); // 300 × $0.24, no free allowance
  assert.equal(evaluateStamperFee(MRP, ctx({ qty: 300, colorTierName: "Ghostly Effect" }))!.dollars, 72);
});

test("stamper: fees are per RECORD — 2LP doubles", () => {
  assert.equal(evaluateStamperFee(MRP, ctx({ qty: 2000, discs: 2 }))!.dollars, 280);
});

// ── 16.2 Color setup ─────────────────────────────────────────────────────
test("color setup: solid=1, black/EcoMix=0, blends/Half/CIC=2, 3-Color Split=3", () => {
  assert.equal(evaluateColorSetupFee(MRP, ctx({}))!.dollars, 95); // Opaque solid
  assert.equal(evaluateColorSetupFee(MRP, ctx({ colorTierName: "Black", colorKind: "black" }))!.dollars, 0);
  assert.equal(evaluateColorSetupFee(MRP, ctx({ colorTierName: "EcoMix" }))!.dollars, 0);
  assert.equal(evaluateColorSetupFee(MRP, ctx({ colorTierName: "Smoke Blends" }))!.dollars, 190);
  assert.equal(evaluateColorSetupFee(MRP, ctx({ colorTierName: "Half" }))!.dollars, 190);
  assert.equal(evaluateColorSetupFee(MRP, ctx({ colorTierName: "Color In Color" }))!.dollars, 190);
  assert.equal(evaluateColorSetupFee(MRP, ctx({ colorTierName: "3-Color Split" }))!.dollars, 285);
});

test("color setup: 2LP doubles; splatter composes base + $35/splatter color", () => {
  assert.equal(evaluateColorSetupFee(MRP, ctx({ discs: 2 }))!.dollars, 190);
  const sp = evaluateColorSetupFee(MRP, ctx({ colorTierName: "Splatter", colorKind: "splatter", splatterColors: 2 }))!;
  assert.equal(sp.dollars, 165); // $95 base + 2 × $35
  assert.match(sp.note, /2 splatter colors/);
  // 2LP splatter doubles the whole composition.
  assert.equal(evaluateColorSetupFee(MRP, ctx({ colorTierName: "Splatter", colorKind: "splatter", splatterColors: 2, discs: 2 }))!.dollars, 330);
  // Unknown splatter-color count → cannot derive (falls back to manual row).
  assert.equal(evaluateColorSetupFee(MRP, ctx({ colorTierName: "Splatter", colorKind: "splatter", splatterColors: null })), null);
});

test("color setup: splatter counts are capped at the press's configured maximum", () => {
  const sp = (n: number) =>
    evaluateColorSetupFee(MRP, ctx({ colorTierName: "Splatter", colorKind: "splatter", splatterColors: n }));
  const refused = (r: ReturnType<typeof sp>) => !!r && "refused" in r && r.refused === true;
  // At the maximum (MRP: 3) the fee still prices…
  const atMax = sp(3)!;
  assert.ok(!("refused" in atMax));
  assert.equal((atMax as { dollars: number }).dollars, 200); // $95 base + 3 × $35
  // …one above it is REFUSED (press doesn't offer it) — a refusal, NOT a
  // null, so it can never fall back to a stale manual row.
  assert.ok(refused(sp(4)));
  assert.ok(refused(sp(6)));
  assert.ok(refused(sp(1_000_000)));
  // Forged/invalid counts (non-integer, zero, negative) are refused too.
  assert.ok(refused(sp(2.5)));
  assert.ok(refused(sp(0)));
  assert.ok(refused(sp(-1)));
  // A press with NO configured maximum keeps pricing any whole count ≥ 1.
  const noMax = setupFeeRulesSchema.parse({
    colorSetup: { perColorCents: 9500, categories: [], splatter: { perSplatterColorCents: 3500 } },
  });
  const six = evaluateColorSetupFee(noMax, ctx({ colorTierName: "Splatter", colorKind: "splatter", splatterColors: 6 }))!;
  assert.equal((six as { dollars: number }).dollars, 305);
});

// ── 16.3 Press setup ─────────────────────────────────────────────────────
test("press setup: $95 under 500 units, waived (Included) at 500+", () => {
  assert.equal(evaluatePressSetupFee(MRP, ctx({ qty: 300 }))!.dollars, 95);
  assert.equal(evaluatePressSetupFee(MRP, ctx({ qty: 500 }))!.dollars, 0);
});

// ── 16.4 Poly bag: ONE folded 37¢ line ───────────────────────────────────
test("poly bag: bag + insertion fold into a single 37¢/unit line", () => {
  const pb = polyBagUnitLine(MRP)!;
  assert.equal(pb.v, 0.37);
  assert.equal(pb.laddered, true);
  assert.equal(pb.note, "Insertion included");
  assert.equal(polyBagUnitLine(null), null);
});

// ── computeSetupLines resolution order ──────────────────────────────────
const row = (partial: Partial<PricingRow>): PricingRow => ({
  key: "type:black", label: "Black", detail: "", kind: "type", sizes: [],
  priceCents: null, pricesBySize: {}, ...partial,
});
const flatRow = (key: string, cents: number | null): PricingRow =>
  row({ key, kind: "service", label: key, priceCents: cents });
const SETUP_ROWS: PricingRow[] = QUOTE_SETUP_SERVICE_KEYS.map((k) => flatRow(k, 100));

test("computeSetupLines with NO rules = the manual rows exactly; overrides ignored; no press-setup line", () => {
  const lines = computeSetupLines(SETUP_ROWS, null, ctx({ overrides: { stampers: 5000 } }));
  assert.deepEqual(lines.map((l) => l.id), ["cutting", "plating", "test", "stampers", "colorfee"]);
  for (const l of lines) {
    assert.equal(l.amount, 1);
    assert.equal(l.derived ?? false, false);
    assert.equal(l.overridden ?? false, false);
  }
});

test("computeSetupLines with rules: stampers/colorfee derived (rule wins over stale row), press setup appended, override wins", () => {
  const lines = computeSetupLines(SETUP_ROWS, MRP, ctx({ qty: 300 }));
  assert.deepEqual(lines.map((l) => l.id), ["cutting", "plating", "test", "stampers", "colorfee", "setup"]);
  const by = Object.fromEntries(lines.map((l) => [l.id, l]));
  assert.equal(by.cutting.amount, 1); // row-based lines untouched
  assert.equal(by.stampers.amount, 0); // 140g new, under the free 1,000
  assert.ok(by.stampers.derived);
  assert.equal(by.colorfee.amount, 95);
  assert.ok(by.colorfee.note);
  assert.equal(by.setup.amount, 95); // under 500 units
  // Per-quote operator override wins and says so.
  const over = computeSetupLines(SETUP_ROWS, MRP, ctx({ qty: 300, overrides: { colorfee: 12345 } }));
  const c = over.find((l) => l.id === "colorfee")!;
  assert.equal(c.amount, 123.45);
  assert.ok(c.overridden);
  assert.match(c.note!, /override/i);
});

test("computeSetupLines: a rule that can't evaluate falls back to the manual row (honest)", () => {
  // Splatter with UNKNOWN splatter-color count → colorfee = row value.
  const lines = computeSetupLines(SETUP_ROWS, MRP, ctx({ colorTierName: "Splatter", colorKind: "splatter", splatterColors: null }));
  assert.equal(lines.find((l) => l.id === "colorfee")!.amount, 1);
});

test("computeSetupLines: a REFUSED count stays pending even with a priced stale manual row", () => {
  // SETUP_ROWS prices service:colorfee at $1 — the refusal must NOT fall
  // back to it: the line stays pending (amount null).
  for (const forged of [4, 6, 1e9, 2.5, 0, -1]) {
    const lines = computeSetupLines(SETUP_ROWS, MRP, ctx({ colorTierName: "Splatter", colorKind: "splatter", splatterColors: forged }));
    const c = lines.find((l) => l.id === "colorfee")!;
    assert.equal(c.amount, null, `expected pending for splatterColors=${forged}`);
    assert.ok(c.derived);
    assert.ok(c.note);
  }
});

// ── End-to-end: pending gate + email breakdown parity ────────────────────
const FULL_ROWS: PricingRow[] = [
  row({ key: "type:black", label: "Black", pricesBySize: { '12"': 176 } }),
  row({ key: "color:black:classic", kind: "color", label: "Classic Black", detail: "Black", pricesBySize: { '12"': 176 } }),
  flatRow("labels:blank", 8),
  flatRow("jackets:single", 165),
  flatRow("sleeves:unprinted", 0),
  flatRow("service:assembly", 11),
  flatRow("service:shrink", 15),
  ...SETUP_ROWS,
];
const FULL_STATE = {
  sizeId: "12", weightId: "140", qty: 300,
  colorName: "Classic Black", colorTierName: "Black", colorKind: "black",
  labelId: "blank", jacketId: "single", sleeveId: "unprinted",
  insertId: "none", stickerShapeId: "none",
  done: ["size", "discs", "weight", "ctype", "color", "label", "jacket", "sleeve", "insert", "sticker", "qty"],
};

test("no-rules presses are byte-identical: pendingIds and email breakdown unchanged by the rules param", () => {
  assert.deepEqual(computeQuotePendingIds(FULL_STATE, FULL_ROWS), computeQuotePendingIds(FULL_STATE, FULL_ROWS, null));
  assert.deepEqual(computeQuoteEmailBreakdown(FULL_STATE, FULL_ROWS), computeQuoteEmailBreakdown(FULL_STATE, FULL_ROWS, null));
});

test("poly-bag pick fails CLOSED without a poly-bag rule, prices as one line with it", () => {
  const bs = { ...FULL_STATE, polyBag: true };
  assert.ok(computeQuotePendingIds(bs, FULL_ROWS, null).includes("polybag"));
  assert.deepEqual(computeQuotePendingIds(bs, FULL_ROWS, MRP), []);
  const b = computeQuoteEmailBreakdown(bs, FULL_ROWS, MRP)!;
  const pb = b.unitLines.find((l) => l.id === "polybag")!;
  assert.equal(pb.unitDollars, 0.37); // fixed cents — the run-size curve never rescales it
  assert.equal(pb.note, "Insertion included");
  // No separate insertion line anywhere.
  assert.ok(!b.unitLines.some((l) => /insertion/i.test(l.name)));
});

test("send gate fails closed on forged/out-of-range splatterColors in persisted state", () => {
  // The stale manual colorfee row is PRICED ($1) — a refused count must
  // still pend (no row fallback) so /send blocks.
  const splatterRows = [
    ...FULL_ROWS,
    row({ key: "type:splatter", label: "Splatter", pricesBySize: { '12"': 320 } }),
    row({ key: "color:splatter:o22", kind: "color", label: "O22 w/ T03 splatter", detail: "Splatter", pricesBySize: { '12"': 320 } }),
  ];
  const splatterState = (splatterColors: unknown) => ({
    ...FULL_STATE,
    colorName: "O22 w/ T03 splatter", colorTierName: "Splatter", colorKind: "splatter",
    splatterColors,
  });
  // Within the press's maximum: prices, nothing pending.
  assert.deepEqual(computeQuotePendingIds(splatterState(3), splatterRows, MRP), []);
  // One above the maximum, absurdly large, non-integer, zero, negative, or
  // an outright forged non-number persisted value (string/boolean/object/
  // array/NaN/Infinity) — all REFUSED, colorfee pends despite the priced
  // row, the send gate blocks.
  for (const forged of [4, 6, 1e9, 2.5, -1, 0, Number.NaN, Infinity, "3", "lots", true, false, {}, [], [2]]) {
    assert.ok(
      computeQuotePendingIds(splatterState(forged), splatterRows, MRP).includes("colorfee"),
      `expected colorfee pending for splatterColors=${JSON.stringify(forged)}`,
    );
  }
  // Genuinely ABSENT count (never picked: null/undefined) keeps the honest
  // manual-row fallback.
  assert.deepEqual(computeQuotePendingIds(splatterState(null), splatterRows, MRP), []);
  assert.deepEqual(computeQuotePendingIds(splatterState(undefined), splatterRows, MRP), []);
});

test("email breakdown carries the SAME derived setup lines (derivation notes included)", () => {
  const b = computeQuoteEmailBreakdown(FULL_STATE, FULL_ROWS, MRP)!;
  const by = Object.fromEntries(b.setupLines.map((l) => [l.id, l]));
  assert.equal(by.stampers.dollars, 0); // 300 new-audio 140g units — included
  assert.equal(by.colorfee.dollars, 0); // black = no color setup
  assert.match(by.colorfee.note!, /No color setup/);
  assert.equal(by.setup.dollars, 95); // press setup under 500
  // Reorder flips the stamper allowance off through the persisted state.
  const re = computeQuoteEmailBreakdown({ ...FULL_STATE, reorder: true }, FULL_ROWS, MRP)!;
  assert.equal(re.setupLines.find((l) => l.id === "stampers")!.dollars, 42); // 300 × $0.14
});
