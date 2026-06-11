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

// Single source of truth for the mechanicals rate used by the Sell
// panel Publishing line and the break-even fixed-cost stack. $0.127 ×
// 2 (vinyl + digital mechanicals) = 25.4¢ per track. Imported by
// SellPanel so the two paths can never drift.
export const MECH_RATE_CENTS_PER_TRACK = 25.4;

// Platform margin per unit, in cents. Mirrors the Sell panel cost
// snapshot's GoodTunes line (payout_format_costs.goodtunes_cents
// default) so the artist's net-per-copy here matches the breakdown.
export const PLATFORM_MARGIN_CENTS = 450;

// Stripe card fee on a charged amount: 2.9% + 30¢, rounded the same
// way the Sell panel breakdown rounds it.
export function cardFeeCents(amountCents: number): number {
  if (amountCents <= 0) return 0;
  return Math.round(amountCents * 0.029) + 30;
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
