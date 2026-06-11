// Task #1963 — pins the pure break-even formula without a database, so
// the operator Sell panel, artist dashboard, and shared quote can't drift.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeBreakEven,
  cardFeeCents,
  MECH_RATE_CENTS_PER_TRACK,
  PLATFORM_MARGIN_CENTS,
} from "./breakEven";

test("cardFeeCents is 2.9% + 30¢, zero for non-positive amounts", () => {
  assert.equal(cardFeeCents(0), 0);
  assert.equal(cardFeeCents(-100), 0);
  // 3000 * 0.029 = 87 → +30 = 117
  assert.equal(cardFeeCents(3000), 117);
});

test("vinyl-only break-even ceils fixed cost over net per copy", () => {
  // 100 copies × $5 mfg + $200 prep + (10 tracks × 25.4¢ → 254¢) × 100
  //  = 50000 + 20000 + 25400 = 95400¢ fixed.
  // net = 3000 − cardFee(3000)=117 − donation 0 − 450 = 2433¢.
  const r = computeBreakEven({
    runQty: 100,
    unitMfgCents: 500,
    mastersPrepCents: 20000,
    trackCount: 10,
    vinylRetailCents: 3000,
    donationPerUnitCents: 0,
    goodDeed: null,
  });
  assert.equal(r.computable, true);
  assert.equal(r.fixedRunCostCents, 95400);
  assert.equal(r.vinylNetCents, 2433);
  assert.equal(r.vinylBreakEvenUnits, Math.ceil(95400 / 2433)); // 40
  assert.equal(r.goodDeed, null);
});

test("a non-positive net per copy is not computable (null units)", () => {
  // Retail barely above the platform margin + fee → net ≤ 0.
  const r = computeBreakEven({
    runQty: 100,
    unitMfgCents: 500,
    mastersPrepCents: 0,
    trackCount: 0,
    vinylRetailCents: PLATFORM_MARGIN_CENTS, // 450, fee+margin swamp it
    donationPerUnitCents: 0,
    goodDeed: null,
  });
  assert.ok(r.vinylNetCents <= 0);
  assert.equal(r.computable, false);
  assert.equal(r.vinylBreakEvenUnits, null);
});

test("donation carve-out lowers net and raises the break-even count", () => {
  const base = computeBreakEven({
    runQty: 100, unitMfgCents: 500, mastersPrepCents: 20000,
    trackCount: 10, vinylRetailCents: 3000, donationPerUnitCents: 0, goodDeed: null,
  });
  const withDonation = computeBreakEven({
    runQty: 100, unitMfgCents: 500, mastersPrepCents: 20000,
    trackCount: 10, vinylRetailCents: 3000, donationPerUnitCents: 500, goodDeed: null,
  });
  assert.equal(withDonation.vinylNetCents, base.vinylNetCents - 500);
  assert.ok((withDonation.vinylBreakEvenUnits ?? 0) > (base.vinylBreakEvenUnits ?? 0));
});

test("expected GoodDeed attach blends in a lower break-even count", () => {
  const r = computeBreakEven({
    runQty: 100,
    unitMfgCents: 500,
    mastersPrepCents: 20000,
    trackCount: 10,
    vinylRetailCents: 3000,
    donationPerUnitCents: 0,
    goodDeed: {
      certRetailCents: 5000,
      certWholesalePerUnitCents: 1500,
      plannedCertQty: 100, // attach ratio 1.0
    },
  });
  assert.ok(r.goodDeed);
  // cert net = 5000 − 1500 − cardFee(5000)=175 = 3325¢
  assert.equal(r.goodDeed!.netCents, 5000 - 1500 - cardFeeCents(5000));
  assert.equal(r.goodDeed!.attachRatio, 1);
  // blended net (2433 + 3325) > vinyl net → fewer copies to break even.
  assert.ok(r.goodDeed!.breakEvenUnits != null);
  assert.ok(r.goodDeed!.breakEvenUnits! < r.vinylBreakEvenUnits!);
});

test("no/zero planned cert quantity yields no with-GoodDeeds break-even", () => {
  const r = computeBreakEven({
    runQty: 100, unitMfgCents: 500, mastersPrepCents: 20000,
    trackCount: 10, vinylRetailCents: 3000, donationPerUnitCents: 0,
    goodDeed: { certRetailCents: 5000, certWholesalePerUnitCents: 1500, plannedCertQty: 0 },
  });
  assert.equal(r.goodDeed, null);
});

test("mechanicals rate and platform margin are the shared constants", () => {
  assert.equal(MECH_RATE_CENTS_PER_TRACK, 25.4);
  assert.equal(PLATFORM_MARGIN_CENTS, 450);
});
