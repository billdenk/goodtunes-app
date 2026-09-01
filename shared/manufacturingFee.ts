/**
 * Manufacturing-project platform fee policy.
 *
 * Amounts are integer minor units (cents today). The eligible principal is
 * setup + manufacturing only; tax, shipping, and payment-processing charges
 * are deliberately separate inputs and never enter this calculation.
 */
export const MANUFACTURING_PLATFORM_FEE_BPS = 300;
export const MANUFACTURING_PLATFORM_FEE_PERCENT = 3;

export type ManufacturingFeeComponents = {
  setupCents?: number;
  manufacturingCents?: number;
  taxCents?: number;
  shippingCents?: number;
  paymentProcessingCents?: number;
};

export function eligibleManufacturingPrincipalCents(
  components: ManufacturingFeeComponents,
): number {
  // The excluded fields are accepted deliberately so callers do not have to
  // pre-filter an invoice and accidentally expand the fee base later.
  const included = [
    components.setupCents ?? 0,
    components.manufacturingCents ?? 0,
  ];
  const all = [
    ...included,
    components.taxCents ?? 0,
    components.shippingCents ?? 0,
    components.paymentProcessingCents ?? 0,
  ];
  if (all.some((v) => !Number.isSafeInteger(v) || v < 0)) {
    throw new Error("Manufacturing fee components must be non-negative integer cents");
  }
  return included[0] + included[1];
}

export function manufacturingFeeSnapshot(
  components: ManufacturingFeeComponents,
  rateBps = MANUFACTURING_PLATFORM_FEE_BPS,
): {
  eligiblePrincipalCents: number;
  platformFeeRateBps: number;
  platformFeeCents: number;
} {
  const eligiblePrincipalCents = eligibleManufacturingPrincipalCents(components);
  return {
    eligiblePrincipalCents,
    platformFeeRateBps: rateBps,
    platformFeeCents: manufacturingPlatformFeeCents(
      eligiblePrincipalCents,
      rateBps,
    ),
  };
}

export function manufacturingPlatformFeeCents(
  eligiblePrincipalCents: number,
  rateBps = MANUFACTURING_PLATFORM_FEE_BPS,
): number {
  if (!Number.isSafeInteger(eligiblePrincipalCents) || eligiblePrincipalCents < 0) {
    throw new Error("Eligible manufacturing principal must be non-negative integer cents");
  }
  if (!Number.isSafeInteger(rateBps) || rateBps < 0) {
    throw new Error("Manufacturing platform fee rate must be non-negative basis points");
  }
  return Math.floor((eligiblePrincipalCents * rateBps + 5_000) / 10_000);
}

/**
 * Allocate a staged fee from cumulative principal. The difference-of-totals
 * method guarantees all stages sum to the fee on the full project subtotal,
 * including when individual stages land on half-cent boundaries.
 */
export function allocateManufacturingPlatformFeeCents(input: {
  priorEligiblePrincipalCents: number;
  priorAllocatedFeeCents: number;
  stepEligiblePrincipalCents: number;
  rateBps?: number;
}): number {
  const rateBps = input.rateBps ?? MANUFACTURING_PLATFORM_FEE_BPS;
  const cumulative = input.priorEligiblePrincipalCents + input.stepEligiblePrincipalCents;
  return Math.max(
    manufacturingPlatformFeeCents(cumulative, rateBps) -
      input.priorAllocatedFeeCents,
    0,
  );
}

/** Cumulative refund allocation, bounded by the payment's stored snapshots. */
export function manufacturingRefundAllocation(input: {
  eligiblePrincipalCents: number;
  platformFeeCents: number;
  refundedPrincipalCents: number;
  refundedFeeCents: number;
  newRefundPrincipalCents: number;
}): { principalCents: number; feeCents: number } {
  const nextPrincipal = Math.min(
    input.eligiblePrincipalCents,
    Math.max(0, input.refundedPrincipalCents + input.newRefundPrincipalCents),
  );
  const targetFee =
    input.eligiblePrincipalCents === 0
      ? 0
      : Math.min(
          input.platformFeeCents,
          Math.floor(
            (nextPrincipal * input.platformFeeCents +
              Math.floor(input.eligiblePrincipalCents / 2)) /
              input.eligiblePrincipalCents,
          ),
        );
  return {
    principalCents: nextPrincipal - input.refundedPrincipalCents,
    feeCents: Math.max(0, targetFee - input.refundedFeeCents),
  };
}