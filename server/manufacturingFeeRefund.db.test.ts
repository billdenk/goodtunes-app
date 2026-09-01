import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "./db";
import {
  manufacturerPaymentSteps,
  payoutEarmarks,
} from "@shared/schema";
import {
  adjustedManufacturingStepAmounts,
  handleShopifyPlusWebhookEvent,
  manufacturingStepTotalCents,
  reallocateEditableManufacturingFees,
  reconcileManufacturingStepRefund,
  type BankTransferStripe,
} from "./shopifyPlus";

const ids: string[] = [];

async function seedPaidStep() {
  const [step] = await db
    .insert(manufacturerPaymentSteps)
    .values({
      albumId: `fee-refund-album-${randomUUID()}`,
      description: "Setup and manufacturing",
      amountCents: 10_000,
      marginCents: 0,
      eligiblePrincipalCents: 10_000,
      platformFeeRateBps: 300,
      platformFeeCents: 300,
      currency: "cad",
      status: "paid",
      amountReceivedCents: 10_300,
      stripePaymentIntentId: `pi_${randomUUID()}`,
    })
    .returning();
  ids.push(step.id);
  return step;
}

after(async () => {
  if (ids.length) {
    await db
      .delete(payoutEarmarks)
      .where(
        and(
          eq(payoutEarmarks.sourceKind, "shopify_plus_step"),
          // Test runner uses a fresh DB worker; source refs are unique.
          eq(payoutEarmarks.ownerId, "fee-refund-test-plant"),
        ),
      );
    for (const id of ids) {
      await db
        .delete(manufacturerPaymentSteps)
        .where(eq(manufacturerPaymentSteps.id, id));
    }
  }
  await pool.end();
});

test("historical completed rows keep their stored fixed usage fee", () => {
  assert.equal(
    manufacturingStepTotalCents({
      amountCents: 10_000,
      marginCents: 725,
      platformFeeCents: null,
    } as any),
    10_725,
  );
});

test("partial settlement shrinks principal and fee to the actual collected total", () => {
  assert.deepEqual(
    adjustedManufacturingStepAmounts(
      {
        amountCents: 10_000,
        marginCents: 0,
        eligiblePrincipalCents: 10_000,
        platformFeeRateBps: 300,
        platformFeeCents: 300,
      } as any,
      5_150,
    ),
    {
      amountCents: 5_000,
      marginCents: 0,
      eligiblePrincipalCents: 5_000,
      platformFeeCents: 150,
    },
  );
});

test("partial refund reduces held plant funds and reverses stored fee proportionally", async () => {
  const step = await seedPaidStep();
  const [earmark] = await db
    .insert(payoutEarmarks)
    .values({
      sourceKind: "shopify_plus_step",
      sourceRef: step.id,
      albumId: step.albumId,
      ownerKind: "manufacturer",
      ownerId: "fee-refund-test-plant",
      amountCents: 10_000,
      currency: "cad",
      status: "held",
    })
    .returning();

  assert.equal(
    await reconcileManufacturingStepRefund({
      stepId: step.id,
      cumulativeRefundedCents: 5_150,
    }),
    true,
  );
  const [freshStep] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  const [freshEarmark] = await db
    .select()
    .from(payoutEarmarks)
    .where(eq(payoutEarmarks.id, earmark.id));
  assert.equal(freshStep.refundedPrincipalCents, 5_000);
  assert.equal(freshStep.refundedPlatformFeeCents, 150);
  assert.equal(freshEarmark.amountCents, 5_000);

  await reconcileManufacturingStepRefund({
    stepId: step.id,
    cumulativeRefundedCents: 5_150,
  });
  const [replayed] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(replayed.refundedPrincipalCents, 5_000);
  assert.equal(replayed.refundedPlatformFeeCents, 150);
});

test("refund after payout reverses only the refunded plant principal", async () => {
  const step = await seedPaidStep();
  await db.insert(payoutEarmarks).values({
    sourceKind: "shopify_plus_step",
    sourceRef: step.id,
    albumId: step.albumId,
    ownerKind: "manufacturer",
    ownerId: "fee-refund-test-plant",
    amountCents: 10_000,
    currency: "cad",
    status: "released",
    stripeTransferId: "tr_fee_refund_test",
    releasedAt: new Date(),
  });
  const reversals: number[] = [];
  const stripe = {
    transfers: {
      createReversal: async (_id: string, params: { amount: number }) => {
        reversals.push(params.amount);
        return {};
      },
    },
  } as unknown as BankTransferStripe;
  await reconcileManufacturingStepRefund({
    stepId: step.id,
    cumulativeRefundedCents: 2_575,
    stripe,
  });
  assert.deepEqual(reversals, [2_500]);
  const [earmark] = await db
    .select()
    .from(payoutEarmarks)
    .where(
      and(
        eq(payoutEarmarks.sourceKind, "shopify_plus_step"),
        eq(payoutEarmarks.sourceRef, step.id),
      ),
    );
  assert.equal(earmark.reversedAmountCents, 2_500);
});

test("charge.refunded resolves a manufacturing step from payment_intent identity", async () => {
  const step = await seedPaidStep();
  await db.insert(payoutEarmarks).values({
    sourceKind: "shopify_plus_step",
    sourceRef: step.id,
    albumId: step.albumId,
    ownerKind: "manufacturer",
    ownerId: "fee-refund-test-plant",
    amountCents: 10_000,
    currency: "usd",
    status: "held",
  });
  const handled = await handleShopifyPlusWebhookEvent({
    type: "charge.refunded",
    data: {
      object: {
        id: "ch_refund_shape",
        payment_intent: step.stripePaymentIntentId,
        amount_refunded: 1_030,
        metadata: {},
      },
    },
  });
  assert.equal(handled, true);
  const [fresh] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(fresh.refundedPrincipalCents, 1_000);
  assert.equal(fresh.refundedPlatformFeeCents, 30);
});

test("editable stages allocate after frozen snapshots regardless of display order", async () => {
  const albumId = `fee-order-album-${randomUUID()}`;
  const inserted = await db
    .insert(manufacturerPaymentSteps)
    .values([
      {
        albumId,
        description: "Already paid",
        amountCents: 17,
        marginCents: 0,
        eligiblePrincipalCents: 17,
        platformFeeRateBps: 300,
        platformFeeCents: 1,
        status: "paid",
        sortOrder: 20,
      },
      {
        albumId,
        description: "Inserted before paid",
        amountCents: 17,
        marginCents: 0,
        eligiblePrincipalCents: 17,
        platformFeeRateBps: 300,
        platformFeeCents: 1,
        status: "unpaid",
        sortOrder: 10,
      },
      {
        albumId,
        description: "In flight",
        amountCents: 17,
        marginCents: 0,
        eligiblePrincipalCents: 17,
        platformFeeRateBps: 300,
        platformFeeCents: 1,
        status: "processing",
        sortOrder: 30,
      },
      {
        albumId,
        description: "Editable tail",
        amountCents: 49,
        marginCents: 0,
        eligiblePrincipalCents: 49,
        platformFeeRateBps: 300,
        platformFeeCents: 0,
        status: "unpaid",
        sortOrder: 40,
      },
    ])
    .returning();
  ids.push(...inserted.map((row) => row.id));

  await reallocateEditableManufacturingFees(albumId);
  let rows = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.albumId, albumId));
  const paid = rows.find((row) => row.description === "Already paid")!;
  const processing = rows.find((row) => row.description === "In flight")!;
  assert.equal(paid.platformFeeCents, 1);
  assert.equal(processing.platformFeeCents, 1);
  assert.equal(
    rows.reduce((sum, row) => sum + (row.platformFeeCents ?? 0), 0),
    3,
  );

  const before = rows.find((row) => row.description === "Inserted before paid")!;
  await db
    .update(manufacturerPaymentSteps)
    .set({
      sortOrder: 99,
      amountCents: 50,
      eligiblePrincipalCents: 50,
    })
    .where(eq(manufacturerPaymentSteps.id, before.id));
  await reallocateEditableManufacturingFees(albumId);
  rows = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.albumId, albumId));
  assert.equal(
    rows.reduce((sum, row) => sum + (row.platformFeeCents ?? 0), 0),
    4,
  );
  assert.equal(
    rows.find((row) => row.description === "Already paid")!.platformFeeCents,
    1,
  );

  await db
    .delete(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, before.id));
  await reallocateEditableManufacturingFees(albumId);
  rows = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.albumId, albumId));
  assert.equal(
    rows.reduce((sum, row) => sum + (row.platformFeeCents ?? 0), 0),
    2,
  );
  assert.equal(
    rows.find((row) => row.description === "In flight")!.platformFeeCents,
    1,
  );
});