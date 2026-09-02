// Task #1963 — Break-even calculator (shared, pure).
//
// "How many copies do I have to sell before this release pays for
// itself?" The answer is DERIVED from the same numbers the Sell panel
// and the early-cut press-floor already use — it is never written back
// to the DB. Two readouts ride on top of it:
//
//   1. Break-even — the vinyl-only copy count that recoups the fixed
//      run cost, plus a lower count once expected GoodDeed™ certificate
//      attach is folded in.
//   2. Start-the-press — the press's minimum-run floor (handled by the
//      early-cut press-floor; surfaced alongside break-even for
//      context, not recomputed here).
//
// Keeping the math in one pure function lets the server gather the DB
// inputs once and the client render them without re-deriving anything,
// and lets a unit test pin the formula without a database.

// Single source of truth for the current U.S. mechanical rate used by
// publishing settlement and the Sell/break-even cost stack. One side is
// $0.131 per track per unit; package economics reserve both vinyl + digital,
// so that projection uses 26.2¢ per track.
export const MECHANICAL_RATE_MICROS_PER_TRACK_SIDE = 131_000;
export const MECHANICAL_RATE_DOLLARS_PER_TRACK_SIDE =
  MECHANICAL_RATE_MICROS_PER_TRACK_SIDE / 1_000_000;
export const MECH_RATE_CENTS_PER_TRACK =
  (MECHANICAL_RATE_MICROS_PER_TRACK_SIDE * 2) / 10_000;

// Platform margin per unit, in cents. Mirrors the Sell panel cost
// snapshot's GoodTunes line (payout_format_costs.goodtunes_cents
// default) so the artist's net-per-copy here matches the breakdown.
export const PLATFORM_MARGIN_CENTS = 450;

// Stripe's US standard online-card terms, verified against Stripe's official
// pricing page on 2026-09-01. Keep the effective date/source beside the values:
// Stripe can change published terms, and custom account pricing must replace
// this profile rather than silently inheriting it.
export const STRIPE_US_CARD_FEE_TERMS = {
  effectiveDate: "2026-09-01",
  sourceUrl: "https://stripe.com/pricing/local-payment-methods",
  domesticRateBps: 290,
  internationalPremiumBps: 150,
  currencyConversionPremiumBps: 100,
  fixedCents: 30,
} as const;

export const US_BANK_TRANSFER_COPY = {
  mechanism:
    "Choose an ACH credit (not ACH Direct Debit) or a domestic USD wire from a US bank. This is a push payment — GoodTunes never debits your account.",
  timing:
    "ACH credits usually take 1–2 business days; domestic wires usually land the same business day.",
  surcharge:
    "No card surcharge is added to bank transfer. Stripe may still charge GoodTunes a rail-specific fee.",
} as const;

export type CardFeeConditions = {
  cardOrigin: "domestic" | "international" | "unknown";
  currencyConversion: boolean | "unknown";
};

export function cardFeeConditionsFromStripe(input: {
  issuerCountry: string | null | undefined;
  accountCountry: string;
  presentmentCurrency: string | null | undefined;
  settlementCurrency: string | null | undefined;
}): CardFeeConditions {
  const issuer = input.issuerCountry?.trim().toUpperCase();
  const account = input.accountCountry.trim().toUpperCase();
  const presentment = input.presentmentCurrency?.trim().toLowerCase();
  const settlement = input.settlementCurrency?.trim().toLowerCase();
  return {
    cardOrigin:
      !issuer || !account
        ? "unknown"
        : issuer === account
          ? "domestic"
          : "international",
    currencyConversion:
      !presentment || !settlement ? "unknown" : presentment !== settlement,
  };
}

export type CardSurchargeQuote =
  | {
      supported: true;
      baseAmountCents: number;
      surchargeCents: number;
      totalChargeCents: number;
      rateBps: number;
      fixedCents: number;
      conditions: Exclude<CardFeeConditions, { cardOrigin: "unknown" }> & {
        currencyConversion: boolean;
      };
      effectiveDate: string;
    }
  | {
      supported: false;
      reason: string;
    };

// Fee Stripe retains from an already-known charged amount. This remains the
// break-even/reporting helper; a surcharge added on top must use the gross-up
// helper below because Stripe also charges its percentage on the surcharge.
export function cardFeeCents(amountCents: number): number {
  if (amountCents <= 0) return 0;
  return (
    Math.round(
      amountCents * (STRIPE_US_CARD_FEE_TERMS.domesticRateBps / 10_000),
    ) + STRIPE_US_CARD_FEE_TERMS.fixedCents
  );
}

/**
 * Return the smallest whole-cent surcharge that covers Stripe's complete fee
 * on base + surcharge. Unknown issuer/conversion conditions intentionally do
 * not produce a falsely exact number.
 */
export function quoteCardSurcharge(
  baseAmountCents: number,
  conditions: CardFeeConditions,
): CardSurchargeQuote {
  if (!Number.isSafeInteger(baseAmountCents) || baseAmountCents <= 0) {
    return { supported: false, reason: "The payment amount is invalid." };
  }
  if (conditions.cardOrigin === "unknown") {
    return {
      supported: false,
      reason:
        "The card's issuing country is not known, so an exact card surcharge is unavailable.",
    };
  }
  if (conditions.currencyConversion === "unknown") {
    return {
      supported: false,
      reason:
        "Whether Stripe must convert currency is not known, so an exact card surcharge is unavailable.",
    };
  }

  const terms = STRIPE_US_CARD_FEE_TERMS;
  const rateBps =
    terms.domesticRateBps +
    (conditions.cardOrigin === "international"
      ? terms.internationalPremiumBps
      : 0) +
    (conditions.currencyConversion ? terms.currencyConversionPremiumBps : 0);
  const rate = rateBps / 10_000;
  if (rate <= 0 || rate >= 1) {
    return { supported: false, reason: "The configured card fee rate is invalid." };
  }

  // Algebra gives an upper-bound candidate. Walk down across Stripe's
  // whole-cent rounding boundary so the result is the minimum covering cent.
  let surchargeCents = Math.ceil(
    (baseAmountCents * rate + terms.fixedCents) / (1 - rate),
  );
  const chargedFee = (surcharge: number) =>
    Math.round((baseAmountCents + surcharge) * rate) + terms.fixedCents;
  while (
    surchargeCents > 0 &&
    surchargeCents - 1 >= chargedFee(surchargeCents - 1)
  ) {
    surchargeCents--;
  }
  while (surchargeCents < chargedFee(surchargeCents)) {
    surchargeCents++;
  }

  return {
    supported: true,
    baseAmountCents,
    surchargeCents,
    totalChargeCents: baseAmountCents + surchargeCents,
    rateBps,
    fixedCents: terms.fixedCents,
    conditions: {
      cardOrigin: conditions.cardOrigin,
      currencyConversion: conditions.currencyConversion,
    },
    effectiveDate: terms.effectiveDate,
  };
}

export type BreakEvenGoodDeedInput = {
  // Fan-facing retail price of the signed-certificate add-on, in cents.
  certRetailCents: number;
  // Per-unit wholesale cost of producing one certificate (the tiered
  // ladder rung resolved at the planned run quantity), in cents.
  certWholesalePerUnitCents: number;
  // Artist's planned certificate quantity for the run — the planning
  // number on the signed_cert add-on. Drives expected attach.
  plannedCertQty: number;
};

export type BreakEvenInput = {
  // Minimum press run (the start-the-press floor's quantity).
  runQty: number;
  // Per-unit manufacturing cost at the min-run rung, in cents.
  unitMfgCents: number;
  // One-time masters-prep cost for the picked tier, in cents.
  mastersPrepCents: number;
  // Track count used for mechanicals (snapshot if saved, else live).
  trackCount: number;
  // Fan-facing vinyl retail price, in cents.
  vinylRetailCents: number;
  // Sum of per-unit NPO donation carve-outs, in cents (0 when none).
  donationPerUnitCents: number;
  // Expected GoodDeed attach, or null when the add-on is inactive /
  // unplanned (no with-GoodDeeds break-even is computed in that case).
  goodDeed: BreakEvenGoodDeedInput | null;
};

export type BreakEvenGoodDeed = {
  // Artist net per attached certificate, in cents.
  netCents: number;
  // Expected certificates per vinyl copy (plannedCertQty / runQty).
  attachRatio: number;
  // Lower break-even copy count once expected cert attach is folded in,
  // or null when the blended net per copy is not positive.
  breakEvenUnits: number | null;
  // Roughly how many certificates that with-GoodDeeds break-even
  // implies (breakEvenUnits × attachRatio), or null.
  goodDeedsAtBreakEven: number | null;
};

export type BreakEvenResult = {
  // False when there isn't enough to compute a vinyl break-even (no
  // priced run, no retail price, or a non-positive net per copy).
  computable: boolean;
  runQty: number;
  // Fixed cost to recoup across the run: manufacturing + masters prep +
  // mechanicals, in cents.
  fixedRunCostCents: number;
  // Artist net per vinyl copy after card fee, donation, and platform
  // margin, in cents (can be ≤ 0).
  vinylNetCents: number;
  // Vinyl-only break-even copy count, or null when net per copy ≤ 0.
  vinylBreakEvenUnits: number | null;
  // Lower with-GoodDeeds break-even, or null when no active/planned
  // cert add-on (or the blended net is ≤ 0).
  goodDeed: BreakEvenGoodDeed | null;
};

// Wire shape returned by GET /api/admin/albums/:id/break-even — the
// pure result plus the album-level context the bar renders. Lives in
// shared/ so both the server gatherer and the client bar import it.
export type AlbumBreakEven = BreakEvenResult & {
  albumId: string;
  // False when the album has no live, priced press tier.
  hasPressTier: boolean;
  // Name of the press whose catalog is missing pricing rungs, when a
  // tier IS selected but has no confirmed price ladder. Null when there
  // is no tier at all, or when the tier is fully priced and computable.
  pressName: string | null;
  format: string | null;
  tierName: string | null;
  // Paid, un-refunded format units sold so far.
  unitsSold: number;
  // Fan-facing vinyl retail used in the math, in cents (null when no SKU).
  vinylRetailCents: number | null;
  // Start-the-press floor: the press min run + its total cost.
  pressFloorUnits: number;
  pressFloorTotalCents: number;
  // True when a with-GoodDeeds break-even was computed.
  goodDeedActive: boolean;
};

// Pure break-even computation. No I/O — the server gathers inputs.
export function computeBreakEven(input: BreakEvenInput): BreakEvenResult {
  const runQty = Math.max(0, Math.floor(input.runQty) || 0);
  const mechPerCopy = Math.round(input.trackCount * MECH_RATE_CENTS_PER_TRACK);
  const fixedRunCostCents =
    runQty * input.unitMfgCents +
    input.mastersPrepCents +
    mechPerCopy * runQty;

  const vinylNetCents =
    input.vinylRetailCents -
    cardFeeCents(input.vinylRetailCents) -
    input.donationPerUnitCents -
    PLATFORM_MARGIN_CENTS;

  const vinylBreakEvenUnits =
    vinylNetCents > 0 && fixedRunCostCents > 0
      ? Math.ceil(fixedRunCostCents / vinylNetCents)
      : null;

  let goodDeed: BreakEvenGoodDeed | null = null;
  const gd = input.goodDeed;
  if (gd && gd.plannedCertQty > 0 && runQty > 0) {
    const netCents =
      gd.certRetailCents -
      gd.certWholesalePerUnitCents -
      cardFeeCents(gd.certRetailCents);
    const attachRatio = gd.plannedCertQty / runQty;
    const blendedNet = vinylNetCents + attachRatio * netCents;
    const breakEvenUnits =
      blendedNet > 0 && fixedRunCostCents > 0
        ? Math.ceil(fixedRunCostCents / blendedNet)
        : null;
    goodDeed = {
      netCents,
      attachRatio,
      breakEvenUnits,
      goodDeedsAtBreakEven:
        breakEvenUnits != null ? Math.round(breakEvenUnits * attachRatio) : null,
    };
  }

  return {
    computable: vinylBreakEvenUnits != null,
    runQty,
    fixedRunCostCents,
    vinylNetCents,
    vinylBreakEvenUnits,
    goodDeed,
  };
}
