/**
 * Task #3226 — regression coverage for the MRP Tier 3 ladder load,
 * the surcharge pricing mode, and named price lists.
 *
 * MRP ladders are ALL-IN (record(s) + printed jacket + insertion), 140 g on
 * priceLadder and 180 g on priceLadder180; Splatter is a SURCHARGE tier
 * (+$0.75 @300 / +$0.55 @500+) over the fan-selected base color tier.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeUnitCents,
  mergeLadder,
  jacketLadderKey,
  RECORD_BOOKS,
  TIER_BOOK,
  SPLATTER_SURCHARGE,
  INSERTION_CENTS,
  QTYS,
  SOURCE,
  type Rung,
} from "../scripts/load-mrp-tier3-pricing";
import { snapSurchargeAmountCents } from "./pressCatalog";

test('12" Opaque single jacket rung is all-in: record + 4/0 jacket + insertion', () => {
  // 300: $2.35 record + $2.0709… jacket (→207¢) + $0.12 insertion = 454¢
  assert.equal(
    composeUnitCents({ format: "12_lp", bookKey: "opaque", jacketName: "Single Jacket", heavyweight: false, qty: 300 }),
    235 + 207 + INSERTION_CENTS,
  );
});

test("180 g book prices the heavyweight ladder; 7\" prices the 49 g book", () => {
  // 12" Black 180 g @300 = $2.25 + 207 + 12
  assert.equal(
    composeUnitCents({ format: "12_lp", bookKey: "black", jacketName: "Single Jacket", heavyweight: true, qty: 300 }),
    225 + 207 + INSERTION_CENTS,
  );
  // 7" Black @300 = $1.7857…(→179) + 7" 4/0 jacket $1.2142…(→121) + 12
  assert.equal(
    composeUnitCents({ format: "7_inch", bookKey: "black", jacketName: "Single Jacket", heavyweight: false, qty: 300 }),
    179 + 121 + INSERTION_CENTS,
  );
});

test("double LP = 2 records + 1 jacket + 2 insertions", () => {
  const single = composeUnitCents({ format: "12_lp", bookKey: "black", jacketName: "Gatefold Jacket", heavyweight: false, qty: 1000 })!;
  const dbl = composeUnitCents({ format: "12_double", bookKey: "black", jacketName: "Gatefold Jacket", heavyweight: false, qty: 1000 })!;
  // Doubling adds exactly one more record + one more insertion.
  assert.equal(dbl - single, 165 + INSERTION_CENTS);
});

test("prices vary across quantity rungs (jacket ladder is real, not flat)", () => {
  const at300 = composeUnitCents({ format: "12_lp", bookKey: "neon", jacketName: "Tri-Fold Gatefold", heavyweight: false, qty: 300 })!;
  const at25000 = composeUnitCents({ format: "12_lp", bookKey: "neon", jacketName: "Tri-Fold Gatefold", heavyweight: false, qty: 25000 })!;
  assert.ok(at300 > at25000, "300-unit rung must cost more than 25000");
});

test("unpriced legs return null: Tip-On jackets, Eco-Mix 7\", Picture Disc 180 g", () => {
  assert.equal(jacketLadderKey("Old-Style Tip-On Single Jacket", "12_lp"), null);
  assert.equal(
    composeUnitCents({ format: "7_inch", bookKey: "ecoMix", jacketName: "Single Jacket", heavyweight: false, qty: 300 }),
    null,
  );
  assert.equal(
    composeUnitCents({ format: "12_lp", bookKey: "pictureDisc", jacketName: "Single Jacket", heavyweight: true, qty: 300 }),
    null,
  );
});

test("Eco-Mix uses black pricing; blend families map to standard/deluxe books", () => {
  assert.deepEqual(RECORD_BOOKS.ecoMix.g140, RECORD_BOOKS.black.g140);
  assert.equal(TIER_BOOK["Smoke Blends"], "standardMix");
  assert.equal(TIER_BOOK["Shimmer Blends"], "deluxeMix");
  assert.equal(TIER_BOOK["Half"], "split2");
  assert.equal(TIER_BOOK["Color In Color"], "split2");
  assert.equal(TIER_BOOK["Splatter"], undefined, "Splatter is a surcharge tier, never book-priced");
});

test("mergeLadder overwrites placeholder estimates but never operator-confirmed rungs", () => {
  const existing: Rung[] = [
    { qty: 300, unitCents: 1279, confirmed: true, source: "placeholder-estimate", estimated: true },
    { qty: 500, unitCents: 695, confirmed: true }, // operator rung — untouched
    { qty: 100, unitCents: 920, confirmed: true, source: "placeholder-estimate" }, // off-grid → dropped
  ];
  const merged = mergeLadder(existing, (qty) => (qty === 300 || qty === 500 ? 454 : null), "2026-08-21T00:00:00.000Z")!;
  assert.ok(merged, "merge must report changes");
  assert.equal(merged.find((r) => r.qty === 100), undefined, "off-grid placeholder dropped");
  const r300 = merged.find((r) => r.qty === 300)!;
  assert.equal(r300.unitCents, 454);
  assert.equal(r300.source, SOURCE);
  assert.equal(r300.lockedFromSync, true);
  const r500 = merged.find((r) => r.qty === 500)!;
  assert.equal(r500.unitCents, 695, "operator-confirmed rung preserved");
});

test("mergeLadder is idempotent — second run returns null (no changes)", () => {
  const first = mergeLadder([], (qty) => (QTYS.includes(qty as any) ? 400 : null), "2026-08-21T00:00:00.000Z")!;
  assert.equal(first.length, QTYS.length);
  assert.equal(mergeLadder(first, (qty) => (QTYS.includes(qty as any) ? 400 : null), "2026-08-21T00:00:00.000Z"), null);
});

test("splatter surcharge snaps with floor semantics: +$0.75 @300, +$0.55 @500+", () => {
  assert.equal(snapSurchargeAmountCents(SPLATTER_SURCHARGE, 300), 75);
  assert.equal(snapSurchargeAmountCents(SPLATTER_SURCHARGE, 499), 75);
  assert.equal(snapSurchargeAmountCents(SPLATTER_SURCHARGE, 500), 55);
  assert.equal(snapSurchargeAmountCents(SPLATTER_SURCHARGE, 25000), 55);
  // Below the first rung snaps UP to the first rung; empty ladder = null.
  assert.equal(snapSurchargeAmountCents(SPLATTER_SURCHARGE, 100), 75);
  assert.equal(snapSurchargeAmountCents([], 300), null);
  assert.equal(snapSurchargeAmountCents(null, 300), null);
});
