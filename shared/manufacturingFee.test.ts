import test from "node:test";
import assert from "node:assert/strict";
import {
  MANUFACTURING_PLATFORM_FEE_BPS,
  allocateManufacturingPlatformFeeCents,
  manufacturingFeeSnapshot,
  manufacturingPlatformFeeCents,
  manufacturingRefundAllocation,
} from "./manufacturingFee";

test("fee base includes setup + manufacturing and excludes tax, shipping, processing", () => {
  assert.deepEqual(
    manufacturingFeeSnapshot({
      setupCents: 10_001,
      manufacturingCents: 89_999,
      taxCents: 8_250,
      shippingCents: 4_500,
      paymentProcessingCents: 3_200,
    }),
    {
      eligiblePrincipalCents: 100_000,
      platformFeeRateBps: 300,
      platformFeeCents: 3_000,
    },
  );
});

test("3% rounds deterministically to the nearest cent", () => {
  assert.equal(manufacturingPlatformFeeCents(16), 0);
  assert.equal(manufacturingPlatformFeeCents(17), 1);
  assert.equal(manufacturingPlatformFeeCents(50), 2);
  assert.equal(manufacturingPlatformFeeCents(100), 3);
});

test("staged allocation reconciles exactly to the project-level fee", () => {
  const stages = [17, 17, 17, 17, 17, 15];
  let priorPrincipal = 0;
  let priorFee = 0;
  const fees = stages.map((stepEligiblePrincipalCents) => {
    const fee = allocateManufacturingPlatformFeeCents({
      priorEligiblePrincipalCents: priorPrincipal,
      priorAllocatedFeeCents: priorFee,
      stepEligiblePrincipalCents,
    });
    priorPrincipal += stepEligiblePrincipalCents;
    priorFee += fee;
    return fee;
  });
  assert.deepEqual(fees, [1, 0, 1, 0, 1, 0]);
  assert.equal(priorFee, manufacturingPlatformFeeCents(100));
});

test("refund allocation is proportional, cumulative, bounded and replay-safe", () => {
  const first = manufacturingRefundAllocation({
    eligiblePrincipalCents: 10_000,
    platformFeeCents: 300,
    refundedPrincipalCents: 0,
    refundedFeeCents: 0,
    newRefundPrincipalCents: 3_333,
  });
  assert.deepEqual(first, { principalCents: 3_333, feeCents: 100 });
  const replay = manufacturingRefundAllocation({
    eligiblePrincipalCents: 10_000,
    platformFeeCents: 300,
    refundedPrincipalCents: 3_333,
    refundedFeeCents: 100,
    newRefundPrincipalCents: 0,
  });
  assert.deepEqual(replay, { principalCents: 0, feeCents: 0 });
  const rest = manufacturingRefundAllocation({
    eligiblePrincipalCents: 10_000,
    platformFeeCents: 300,
    refundedPrincipalCents: 3_333,
    refundedFeeCents: 100,
    newRefundPrincipalCents: 99_999,
  });
  assert.deepEqual(rest, { principalCents: 6_667, feeCents: 200 });
});

test("snapshots preserve rate and currency-independent cent math", () => {
  const usd = manufacturingFeeSnapshot({ manufacturingCents: 12_345 });
  const cad = manufacturingFeeSnapshot(
    { manufacturingCents: 12_345 },
    MANUFACTURING_PLATFORM_FEE_BPS,
  );
  assert.deepEqual(cad, usd);
  assert.equal(usd.platformFeeCents, 370);
  // Currency is stored by the payment row, not converted by fee policy.
});