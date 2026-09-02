// Task #1963 — pins the pure break-even formula without a database, so
// the operator Sell panel, artist dashboard, and shared quote can't drift.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeBreakEven,
  cardFeeCents,
  quoteCardSurcharge,
  cardFeeConditionsFromStripe,
  US_BANK_TRANSFER_COPY,
  MECH_RATE_CENTS_PER_TRACK,
  PLATFORM_MARGIN_CENTS,
} from "./breakEven";

test("cardFeeCents is 2.9% + 30¢, zero for non-positive amounts", () => {
  assert.equal(cardFeeCents(0), 0);
  assert.equal(cardFeeCents(-100), 0);
  // 3000 * 0.029 = 87 → +30 = 117
  assert.equal(cardFeeCents(3000), 117);
});

test("domestic card surcharge gross-ups the percentage charged on itself", () => {
  const quote = quoteCardSurcharge(3000, {
    cardOrigin: "domestic",
    currencyConversion: false,
  });
  assert.equal(quote.supported, true);
  if (!quote.supported) return;
  assert.equal(quote.surchargeCents, 120);
  assert.equal(quote.totalChargeCents, 3120);
  assert.equal(
    quote.surchargeCents,
    Math.round(quote.totalChargeCents * 0.029) + 30,
  );
});

test("bank-transfer copy distinguishes rails without promising fee-free processing", () => {
  assert.match(US_BANK_TRANSFER_COPY.mechanism, /ACH credit/);
  assert.match(US_BANK_TRANSFER_COPY.mechanism, /not ACH Direct Debit/);
  assert.match(US_BANK_TRANSFER_COPY.mechanism, /domestic USD wire/);
  assert.match(US_BANK_TRANSFER_COPY.mechanism, /push payment/);
  assert.match(US_BANK_TRANSFER_COPY.timing, /1–2 business days/);
  assert.match(US_BANK_TRANSFER_COPY.timing, /same business day/);
  assert.match(US_BANK_TRANSFER_COPY.surcharge, /No card surcharge/);
  assert.match(US_BANK_TRANSFER_COPY.surcharge, /Stripe may still charge/);
  assert.doesNotMatch(US_BANK_TRANSFER_COPY.surcharge, /no processing fee/i);
});

test("international card quote includes issuer and conversion premiums", () => {
  const international = quoteCardSurcharge(3000, {
    cardOrigin: "international",
    currencyConversion: false,
  });
  const converted = quoteCardSurcharge(3000, {
    cardOrigin: "international",
    currencyConversion: true,
  });
  assert.equal(international.supported, true);
  assert.equal(converted.supported, true);
  if (!international.supported || !converted.supported) return;
  assert.equal(international.rateBps, 440);
  assert.equal(international.surchargeCents, 169);
  assert.equal(converted.rateBps, 540);
  assert.equal(converted.surchargeCents, 203);
});

test("Stripe card metadata authoritatively classifies issuer and conversion", () => {
  assert.deepEqual(
    cardFeeConditionsFromStripe({
      issuerCountry: "CA",
      accountCountry: "US",
      presentmentCurrency: "cad",
      settlementCurrency: "usd",
    }),
    { cardOrigin: "international", currencyConversion: true },
  );
  assert.deepEqual(
    cardFeeConditionsFromStripe({
      issuerCountry: null,
      accountCountry: "US",
      presentmentCurrency: "usd",
      settlementCurrency: "usd",
    }),
    { cardOrigin: "unknown", currencyConversion: false },
  );
});

test("unknown card fee conditions fail honestly", () => {
  assert.deepEqual(
    quoteCardSurcharge(3000, {
      cardOrigin: "unknown",
      currencyConversion: false,
    }),
    {
      supported: false,
      reason:
        "The card's issuing country is not known, so an exact card surcharge is unavailable.",
    },
  );
  assert.equal(
    quoteCardSurcharge(3000, {
      cardOrigin: "domestic",
      currencyConversion: "unknown",
    }).supported,
    false,
  );
});

test("gross-up uses the minimum covering cent at rounding boundaries", () => {
  for (const amount of [1, 99, 100, 101, 999, 10_001]) {
    const quote = quoteCardSurcharge(amount, {
      cardOrigin: "domestic",
      currencyConversion: false,
    });
    assert.equal(quote.supported, true);
    if (!quote.supported) continue;
    const fee = (surcharge: number) =>
      Math.round((amount + surcharge) * 0.029) + 30;
    assert.ok(quote.surchargeCents >= fee(quote.surchargeCents));
    assert.ok(quote.surchargeCents - 1 < fee(quote.surchargeCents - 1));
  }
});

test("vinyl-only break-even ceils fixed cost over net per copy", () => {
  // 100 copies × $5 mfg + $200 prep + (10 tracks × 26.2¢ → 262¢) × 100
  //  = 50000 + 20000 + 26200 = 96200¢ fixed.
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
  assert.equal(r.fixedRunCostCents, 96200);
  assert.equal(r.vinylNetCents, 2433);
  assert.equal(r.vinylBreakEvenUnits, Math.ceil(96200 / 2433)); // 40
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
  assert.equal(MECH_RATE_CENTS_PER_TRACK, 26.2);
  assert.equal(PLATFORM_MARGIN_CENTS, 450);
});
