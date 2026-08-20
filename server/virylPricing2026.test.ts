/**
 * Task #3220 — regression coverage for the Viryl 2026 ladder load.
 *
 * The catalog ladders are ALL-IN (record + printed jacket + insertion), so
 * the 2026 loader must keep jacket choice affecting the manufacturing total,
 * and must never clobber operator-confirmed rungs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeUnitCents,
  mergeLadder,
  neutralizeOwnUnpriceableRungs,
  isJacketedJacketName,
  JACKET_CENTS_2026,
  INSERTION_CENTS_2026,
  TIER_CENTS,
  SOURCE,
  type Rung,
} from "../scripts/load-viryl-2026-pricing";

test("jacketed 12\" combo prices record + jacket + insertion (all-in)", () => {
  const jacketed = composeUnitCents({ format: "12_lp", tierName: "Black", jacketed: true, heavyweight: false, qty: 100 });
  assert.equal(jacketed, 176 + JACKET_CENTS_2026[100] + INSERTION_CENTS_2026); // 404
  // Jacket choice must change the price: records-only row = bare record.
  const bare = composeUnitCents({ format: "12_lp", tierName: "Black", jacketed: false, heavyweight: false, qty: 100 });
  assert.equal(bare, 176);
  assert.ok(jacketed! > bare!, "printed jacket must cost more than records-only");
});

test("jacket cost varies by quantity rung on the digital ladder", () => {
  const at50 = composeUnitCents({ format: "12_lp", tierName: "Opaque", jacketed: true, heavyweight: false, qty: 50 })!;
  const at300 = composeUnitCents({ format: "12_lp", tierName: "Opaque", jacketed: true, heavyweight: false, qty: 300 })!;
  assert.equal(at50 - at300, JACKET_CENTS_2026[50] - JACKET_CENTS_2026[300]);
});

test("jacketed 500/1000 rungs are UNQUOTED (offset bulk rows are garbled, never substituted)", () => {
  assert.equal(composeUnitCents({ format: "12_lp", tierName: "Black", jacketed: true, heavyweight: false, qty: 500 }), null);
  assert.equal(composeUnitCents({ format: "12_lp", tierName: "Black", jacketed: true, heavyweight: false, qty: 1000 }), null);
  // Records-only rows remain fully priced at 500/1000 (bare published record price).
  assert.equal(composeUnitCents({ format: "12_lp", tierName: "Black", jacketed: false, heavyweight: false, qty: 1000 }), 176);
});

test("neutralizeOwnUnpriceableRungs reverts script-seeded rungs to unconfirmed TBD", () => {
  const ladder: Rung[] = [
    { qty: 300, unitCents: 352, confirmed: true, source: SOURCE },
    { qty: 500, unitCents: 352, confirmed: true, source: SOURCE, lockedFromSync: true },
    { qty: 1000, unitCents: 2790, confirmed: true }, // operator rung — untouched
  ];
  const changed = neutralizeOwnUnpriceableRungs(ladder, (qty) => qty <= 300);
  assert.equal(changed, true);
  assert.deepEqual(ladder[1], { qty: 500, unitCents: 0, confirmed: false });
  assert.equal(ladder[2].unitCents, 2790);
  assert.equal(ladder[0].unitCents, 352);
});

test("legacy 2024 seed rungs at jacketed 500/1000 also become unquoted, end to end", () => {
  // Start from a ladder exactly as seed-viryl-catalog left it (all-in 2024).
  const existing: Rung[] = [50, 100, 200, 300, 500, 1000].map((qty) => ({
    qty,
    unitCents: 348, // stale 2024 all-in value
    confirmed: true,
    source: "viryl-catalog-2024",
  }));
  const price = (qty: number) =>
    composeUnitCents({ format: "12_lp", tierName: "Black", jacketed: true, heavyweight: false, qty });
  const merged = mergeLadder(existing, price, "2026-08-20T00:00:00Z")!;
  neutralizeOwnUnpriceableRungs(merged, (qty) => price(qty) != null);
  const byQty = new Map(merged.map((r) => [r.qty, r]));
  assert.equal(byQty.get(100)!.unitCents, 176 + JACKET_CENTS_2026[100] + INSERTION_CENTS_2026);
  assert.deepEqual(byQty.get(500), { qty: 500, unitCents: 0, confirmed: false });
  assert.deepEqual(byQty.get(1000), { qty: 1000, unitCents: 0, confirmed: false });
});

test("12_double doubles records + insertions but not the jacket", () => {
  const v = composeUnitCents({ format: "12_double", tierName: "Splatter", jacketed: true, heavyweight: false, qty: 300 });
  assert.equal(v, 2 * 281 + JACKET_CENTS_2026[300] + 2 * INSERTION_CENTS_2026);
});

test("180g pricing rides the heavyweight book / 180g jacket row", () => {
  const v = composeUnitCents({ format: "12_lp", tierName: "Black", jacketed: true, heavyweight: true, qty: 100 });
  assert.equal(v, 221 + JACKET_CENTS_2026[100] + INSERTION_CENTS_2026);
});

test("7\" combos carry the bare record price (jacket is Custom Quote)", () => {
  assert.equal(composeUnitCents({ format: "7_inch", tierName: "Black", jacketed: true, heavyweight: false, qty: 100 }), 142);
  assert.equal(composeUnitCents({ format: "7_inch", tierName: "Black", jacketed: true, heavyweight: true, qty: 100 }), null);
});

test("Premium and Metallic tiers = Opaque + the $0.15 premium adder", () => {
  assert.equal(TIER_CENTS["Premium"][0], TIER_CENTS["Opaque"][0] + 15);
  assert.equal(TIER_CENTS["Metallic / Specialty"][2], TIER_CENTS["Opaque"][2] + 15);
});

test("records-only pseudo-jackets are classified as not jacketed", () => {
  assert.equal(isJacketedJacketName('Standard Digitally Printed Jacket (12")'), true);
  assert.equal(isJacketedJacketName('Standard Digitally Printed Jacket (12" 180g)'), true);
  assert.equal(isJacketedJacketName("7-inch Paper Sleeve Only"), false);
  assert.equal(isJacketedJacketName("Records + Inner Sleeves Only (No Gatefold)"), false);
  assert.equal(isJacketedJacketName("Records + White Inner Sleeve Only"), false);
});

test("mergeLadder never clobbers operator-confirmed rungs", () => {
  const operatorRung: Rung = { qty: 100, unitCents: 2790, confirmed: true }; // no source = operator-entered
  const staleScriptRung: Rung = { qty: 200, unitCents: 310, confirmed: true, source: "viryl-catalog-2024" };
  const unconfirmed: Rung = { qty: 300, unitCents: 0, confirmed: false };
  const merged = mergeLadder([operatorRung, staleScriptRung, unconfirmed], () => 404, "2026-08-20T00:00:00Z")!;
  const byQty = new Map(merged.map((r) => [r.qty, r]));
  assert.equal(byQty.get(100)!.unitCents, 2790, "operator rung must survive");
  assert.equal(byQty.get(200)!.unitCents, 404, "old script rung is replaceable");
  assert.equal(byQty.get(300)!.unitCents, 404, "unconfirmed rung is replaceable");
  assert.equal(byQty.get(300)!.confirmed, true);
  assert.equal(byQty.get(300)!.source, SOURCE);
  assert.equal(byQty.get(50)!.unitCents, 404, "missing rungs are added");
});
