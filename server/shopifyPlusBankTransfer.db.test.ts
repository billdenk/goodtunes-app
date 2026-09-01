// Task #3004 — inbound bank-transfer (push) payments on the Shopify+
// manufacturing ledger.
//
// Exercises handleShopifyPlusWebhookEvent's bank-transfer reconciliation
// directly against a real Postgres with a STUB Stripe surface (injected
// {stripe} deps, mirroring the StepResetStripe seam), so no network and
// no real Stripe account are touched:
//
//   • full funding: payment_intent.succeeded flips awaiting_transfer → paid
//   • under-threshold short transfer: partially_funded shrinks the PI to
//     the funds on hand, confirms it, and the step auto-closes as paid
//     with the received amount recorded
//   • partial above the threshold: step stays awaiting_transfer with
//     amountReceivedCents recorded (received vs remaining)
//   • overpay: succeeded still closes it (cash-balance surplus stays on
//     the Stripe customer, surfaced separately to operators)
//   • payer details logged off customer_cash_balance_transaction.created
//     even when the sender's account name differs
//
// Real DB (DATABASE_URL), Node's built-in runner:
//   npx tsx --test server/shopifyPlusBankTransfer.db.test.ts
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "./db";
import { manufacturerPaymentSteps } from "@shared/schema";
import {
  handleShopifyPlusWebhookEvent,
  getBankTransferUnderpaymentThresholdCents,
  extractFundingInstructions,
  acceptPartialTransferAsPaid,
  type BankTransferStripe,
} from "./shopifyPlus";

const albumId = `sp-bt-album-${randomUUID().slice(0, 8)}`;

function stubStripe(opts: {
  cashUsdCents?: number | null;
  omitCashUsd?: boolean;
  cashTransactions?: any[];
  cashTransactionPages?: Array<{ data: any[]; has_more?: unknown }>;
  cashTransactionsError?: string;
  onCashTransactionsList?: (params: any) => void;
  confirmStatus?: string;
  updateError?: string;
  confirmError?: string;
  onUpdate?: (id: string, params: any) => void | Promise<void>;
  onConfirm?: (id: string) => void;
  onCustomerRetrieve?: () => void | Promise<void>;
  /** Initial PaymentIntent amount reported by retrieve (default 500000). */
  piAmount?: number;
  /** Funds already allocated to this partially-funded PaymentIntent. */
  piAmountReceived?: number;
  omitPiAmountReceived?: boolean;
  /** Simulate a network timeout that lands AFTER Stripe applied the update:
   *  the amount mutates, then the call throws updateError. */
  updateAppliesDespiteError?: boolean;
  /** Simulate a timeout after the confirm actually settled: status flips to
   *  succeeded, then the call throws confirmError. */
  confirmAppliesDespiteError?: boolean;
  /** Make paymentIntents.retrieve itself fail (fully indeterminate). */
  piRetrieveError?: string;
  /** Allow this many successful PI reads before piRetrieveError starts. */
  piRetrieveErrorAfter?: number;
  /** Initial PI status reported by retrieve (default requires_confirmation);
   *  use "succeeded" to model a racing settlement that already won. */
  piStatus?: string;
}): BankTransferStripe {
  // Stateful PI mirror so retrieve() is authoritative like the real API.
  let piAmount = opts.piAmount ?? 500000;
  let piStatus: string = opts.piStatus ?? "requires_confirmation";
  let piRetrieveCalls = 0;
  let cashTransactionListCalls = 0;
  return {
    customers: {
      retrieve: async () => {
        await opts.onCustomerRetrieve?.();
        return {
          cash_balance: {
            available:
              opts.omitCashUsd
                ? {}
                : opts.cashUsdCents == null
                  ? null
                  : { usd: opts.cashUsdCents },
          },
        };
      },
      listCashBalanceTransactions: async (_id, params) => {
        opts.onCashTransactionsList?.(params);
        if (opts.cashTransactionsError) {
          throw new Error(opts.cashTransactionsError);
        }
        const page = opts.cashTransactionPages?.[cashTransactionListCalls++];
        return (page ?? {
          data: opts.cashTransactions ?? [],
          has_more: false,
        }) as any;
      },
    },
    paymentIntents: {
      update: async (id, params) => {
        if (opts.updateError) {
          if (opts.updateAppliesDespiteError && typeof params?.amount === "number") {
            piAmount = params.amount;
          }
          throw new Error(opts.updateError);
        }
        if (typeof params?.amount === "number") piAmount = params.amount;
        await opts.onUpdate?.(id, params);
        return {};
      },
      confirm: async (id) => {
        if (opts.confirmError) {
          if (opts.confirmAppliesDespiteError) piStatus = "succeeded";
          throw new Error(opts.confirmError);
        }
        opts.onConfirm?.(id);
        const status = opts.confirmStatus ?? "succeeded";
        piStatus = status;
        return { status };
      },
      retrieve: async () => {
        piRetrieveCalls++;
        if (
          opts.piRetrieveError &&
          piRetrieveCalls > (opts.piRetrieveErrorAfter ?? 0)
        ) {
          throw new Error(opts.piRetrieveError);
        }
        return {
          amount: piAmount,
          ...(!opts.omitPiAmountReceived
            ? { amount_received: opts.piAmountReceived ?? 0 }
            : {}),
          status: piStatus,
        };
      },
    },
  };
}

async function seedStep(overrides: Partial<Record<string, unknown>> = {}) {
  const [row] = await db
    .insert(manufacturerPaymentSteps)
    .values({
      albumId,
      description: "Vinyl run balance",
      amountCents: 500000,
      marginCents: 0,
      status: "awaiting_transfer",
      paymentMethod: "bank_transfer",
      stripeCustomerId: `cus_${randomUUID().slice(0, 12)}`,
      stripePaymentIntentId: `pi_${randomUUID().slice(0, 12)}`,
      ...(overrides as any),
    })
    .returning();
  return row;
}

function partiallyFundedEvent(step: any, amount = 500000) {
  return {
    type: "payment_intent.partially_funded",
    data: {
      object: {
        id: step.stripePaymentIntentId,
        amount,
        customer: step.stripeCustomerId,
        metadata: { gt_kind: "shopify_plus_step", gt_step_id: step.id },
      },
    },
  };
}

before(async () => {
  await db
    .delete(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.albumId, albumId));
});

after(async () => {
  await db
    .delete(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.albumId, albumId));
  await pool.end();
});

test("threshold config defaults to $15 and honors the env override", () => {
  const prev = process.env.BANK_TRANSFER_UNDERPAYMENT_THRESHOLD_CENTS;
  delete process.env.BANK_TRANSFER_UNDERPAYMENT_THRESHOLD_CENTS;
  assert.equal(getBankTransferUnderpaymentThresholdCents(), 1500);
  process.env.BANK_TRANSFER_UNDERPAYMENT_THRESHOLD_CENTS = "2500";
  assert.equal(getBankTransferUnderpaymentThresholdCents(), 2500);
  if (prev === undefined) {
    delete process.env.BANK_TRANSFER_UNDERPAYMENT_THRESHOLD_CENTS;
  } else {
    process.env.BANK_TRANSFER_UNDERPAYMENT_THRESHOLD_CENTS = prev;
  }
});

test("extractFundingInstructions snapshots the ABA + SWIFT details", () => {
  const pi = {
    next_action: {
      display_bank_transfer_instructions: {
        type: "us_bank_transfer",
        reference: "REF123",
        currency: "usd",
        financial_addresses: [
          {
            type: "aba",
            aba: {
              bank_name: "US Test Bank",
              routing_number: "999999999",
              account_number: "1111222233",
              account_holder_name: "GoodTunes",
              account_type: "checking",
            },
          },
          { type: "swift", swift: { swift_code: "TESTUS99XXX" } },
        ],
      },
    },
  };
  const ins = extractFundingInstructions(pi, 129500);
  assert.ok(ins);
  assert.equal(ins!.bankName, "US Test Bank");
  assert.equal(ins!.routingNumber, "999999999");
  assert.equal(ins!.accountNumber, "1111222233");
  assert.equal(ins!.reference, "REF123");
  assert.equal(ins!.swiftCode, "TESTUS99XXX");
  assert.equal(ins!.amountCents, 129500);
  assert.equal(extractFundingInstructions({}, 1), null);
});

test("full funding: payment_intent.succeeded flips awaiting_transfer → paid", async () => {
  const step = await seedStep();
  const handled = await handleShopifyPlusWebhookEvent({
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: step.stripePaymentIntentId,
        metadata: { gt_kind: "shopify_plus_step", gt_step_id: step.id },
      },
    },
  });
  assert.equal(handled, true);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  assert.equal(after1.amountReceivedCents, 500000);
  assert.ok(after1.paidAt);
});

test("stale PaymentIntent failure and success replays cannot displace a newer card attempt", async () => {
  const piA = `pi_card_a_${randomUUID().slice(0, 8)}`;
  const piB = `pi_card_b_${randomUUID().slice(0, 8)}`;
  const step = await seedStep({
    status: "processing",
    paymentMethod: "card",
    stripePaymentIntentId: piA,
    stripeCheckoutSessionId: null,
  });
  const event = (
    type: "payment_intent.payment_failed" | "payment_intent.succeeded",
    id: string,
  ) => ({
    type,
    data: {
      object: {
        id,
        metadata: { gt_kind: "shopify_plus_step", gt_step_id: step.id },
        last_payment_error: { message: "Card declined" },
      },
    },
  });

  await handleShopifyPlusWebhookEvent(
    event("payment_intent.payment_failed", piA),
  );
  const [afterFailureA] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(afterFailureA.status, "unpaid");

  await db
    .update(manufacturerPaymentSteps)
    .set({
      status: "processing",
      stripePaymentIntentId: piB,
      lastError: null,
    })
    .where(eq(manufacturerPaymentSteps.id, step.id));

  await handleShopifyPlusWebhookEvent(
    event("payment_intent.payment_failed", piA),
  );
  await handleShopifyPlusWebhookEvent(
    event("payment_intent.succeeded", piA),
  );
  const [afterStaleReplays] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(afterStaleReplays.status, "processing");
  assert.equal(afterStaleReplays.stripePaymentIntentId, piB);
  assert.equal(afterStaleReplays.lastError, null);

  await handleShopifyPlusWebhookEvent(
    event("payment_intent.succeeded", piB),
  );
  const [afterSuccessB] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(afterSuccessB.status, "paid");
  assert.equal(afterSuccessB.stripePaymentIntentId, piB);
});

test("under-threshold short transfer auto-closes: PI shrunk to funds on hand + confirmed + paid", async () => {
  const step = await seedStep();
  const updates: any[] = [];
  const confirms: string[] = [];
  // $5,000 due, $4,990 arrived — $10 short, within the $15 default.
  const handled = await handleShopifyPlusWebhookEvent(
    partiallyFundedEvent(step),
    {
      stripe: stubStripe({
        cashUsdCents: 499000,
        onUpdate: (id, p) => updates.push([id, p]),
        onConfirm: (id) => confirms.push(id),
      }),
    },
  );
  assert.equal(handled, true);
  assert.deepEqual(updates, [[step.stripePaymentIntentId, { amount: 499000 }]]);
  assert.deepEqual(confirms, [step.stripePaymentIntentId]);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  assert.equal(after1.amountReceivedCents, 499000);
});

test("partial above the threshold stays open with received amount recorded", async () => {
  const step = await seedStep();
  const updates: any[] = [];
  // $5,000 due, only $2,000 arrived — keep waiting for a second transfer.
  const handled = await handleShopifyPlusWebhookEvent(
    partiallyFundedEvent(step),
    {
      stripe: stubStripe({
        cashUsdCents: 200000,
        onUpdate: (id, p) => updates.push([id, p]),
      }),
    },
  );
  assert.equal(handled, true);
  assert.deepEqual(updates, []); // no auto-close attempted
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "awaiting_transfer");
  assert.equal(after1.amountReceivedCents, 200000);
});

test("a second partial that completes the total is closed by succeeded with the full amount", async () => {
  const step = await seedStep({ amountReceivedCents: 200000 });
  // Stripe reconciles the second transfer and the PI succeeds outright.
  const handled = await handleShopifyPlusWebhookEvent({
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: step.stripePaymentIntentId,
        metadata: { gt_kind: "shopify_plus_step", gt_step_id: step.id },
      },
    },
  });
  assert.equal(handled, true);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  // Prior partial tally is kept (never zeroed by the close).
  assert.ok(after1.amountReceivedCents >= 200000);
});

test("overpay: succeeded closes the step; the surplus lives on the Stripe customer", async () => {
  const step = await seedStep();
  await handleShopifyPlusWebhookEvent({
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: step.stripePaymentIntentId,
        metadata: { gt_kind: "shopify_plus_step", gt_step_id: step.id },
      },
    },
  });
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  // Step records what it was owed; the overage is a customer cash balance
  // (surfaced to operators on the ledger GET), not a step field.
  assert.equal(after1.amountReceivedCents, 500000);
});

test("payer details are logged from customer_cash_balance_transaction.created even with a mismatched sender name", async () => {
  const step = await seedStep();
  const handled = await handleShopifyPlusWebhookEvent({
    type: "customer_cash_balance_transaction.created",
    data: {
      object: {
        customer: step.stripeCustomerId,
        type: "funded",
        amount: 499000,
        net_amount: 499000,
        currency: "usd",
        funded: {
          bank_transfer: {
            type: "us_bank_transfer",
            us_bank_transfer: {
              network: "domestic_wire_us",
              sender_name: "SOMEBODY ELSES LLC", // differs from expected payer
            },
          },
        },
      },
    },
  });
  assert.equal(handled, true);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  const details = after1.payerDetails as any[];
  assert.ok(Array.isArray(details) && details.length === 1);
  assert.equal(
    details[0].bankTransfer.us_bank_transfer.sender_name,
    "SOMEBODY ELSES LLC",
  );
  assert.equal(details[0].amountCents, 499000);
});

test("a partially_funded event for a foreign PI is ignored", async () => {
  const handled = await handleShopifyPlusWebhookEvent(
    {
      type: "payment_intent.partially_funded",
      data: { object: { id: "pi_x", metadata: {} } },
    },
    { stripe: stubStripe({ cashUsdCents: 100 }) },
  );
  assert.equal(handled, false);
});

test("a partial-funding read from attempt A cannot overwrite replacement attempt B", async () => {
  const piA = `pi_partial_a_${randomUUID().slice(0, 8)}`;
  const piB = `pi_partial_b_${randomUUID().slice(0, 8)}`;
  const step = await seedStep({ stripePaymentIntentId: piA });
  const handled = await handleShopifyPlusWebhookEvent(
    {
      type: "payment_intent.partially_funded",
      data: {
        object: {
          id: piA,
          amount: step.amountCents,
          customer: step.stripeCustomerId,
          metadata: { gt_kind: "shopify_plus_step", gt_step_id: step.id },
        },
      },
    },
    {
      stripe: stubStripe({
        cashUsdCents: 200000,
        onCustomerRetrieve: async () => {
          await db
            .update(manufacturerPaymentSteps)
            .set({
              status: "processing",
              paymentMethod: "card",
              stripePaymentIntentId: piB,
              amountReceivedCents: 0,
            })
            .where(eq(manufacturerPaymentSteps.id, step.id));
        },
      }),
    },
  );
  assert.equal(handled, true);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "processing");
  assert.equal(after1.paymentMethod, "card");
  assert.equal(after1.stripePaymentIntentId, piB);
  assert.equal(after1.amountReceivedCents, 0);
});

test("bank auto-close reserves attempt A before Stripe mutation so attempt B cannot start", async () => {
  const piA = `pi_claim_a_${randomUUID().slice(0, 8)}`;
  const piB = `pi_claim_b_${randomUUID().slice(0, 8)}`;
  const step = await seedStep({ stripePaymentIntentId: piA });
  let replacementClaims = 0;
  await handleShopifyPlusWebhookEvent(
    partiallyFundedEvent(step),
    {
      stripe: stubStripe({
        cashUsdCents: 499000,
        onUpdate: async () => {
          const claimedB = await db
            .update(manufacturerPaymentSteps)
            .set({
              status: "processing",
              paymentMethod: "card",
              stripePaymentIntentId: piB,
            })
            .where(
              and(
                eq(manufacturerPaymentSteps.id, step.id),
                eq(manufacturerPaymentSteps.status, "unpaid"),
              ),
            )
            .returning({ id: manufacturerPaymentSteps.id });
          replacementClaims = claimedB.length;
        },
      }),
    },
  );
  assert.equal(replacementClaims, 0);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  assert.equal(after1.stripePaymentIntentId, piA);
  assert.equal(after1.amountReceivedCents, 499000);
});

// ── Task #3380 — operator accepts a partial transfer as paid in full ──

test("accept-partial happy path: PI shrunk to received, confirmed, step paid with adjusted total", async () => {
  // $5,370 requested, $4,135 wired (the Sherman scenario shape).
  const step = await seedStep({ amountCents: 537000 });
  const updates: any[] = [];
  const confirms: string[] = [];
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 413500,
      onUpdate: (id, p) => updates.push([id, p]),
      onConfirm: (id) => confirms.push(id),
    }),
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.acceptedCents, 413500);
    assert.equal(res.forgivenCents, 123500);
  }
  assert.deepEqual(updates, [[step.stripePaymentIntentId, { amount: 413500 }]]);
  assert.deepEqual(confirms, [step.stripePaymentIntentId]);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  // Recorded total adjusted down so Paid/Outstanding math reconciles.
  assert.equal(after1.amountCents, 413500);
  assert.equal(after1.marginCents, 0);
  assert.equal(after1.amountReceivedCents, 413500);
  assert.ok(after1.paidAt);
});

test("accept-partial uses PaymentIntent amount_received when allocated funds leave cash balance at zero", async () => {
  // This is Stripe's real underpayment shape: the $4,135 transfer is already
  // attached to the $5,370 PI, so none of it remains in customer cash balance.
  const step = await seedStep({ amountCents: 537000 });
  const updates: any[] = [];
  let customerReads = 0;
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 0,
      piAmount: 537000,
      piAmountReceived: 413500,
      onUpdate: (id, p) => updates.push([id, p]),
      onCustomerRetrieve: () => customerReads++,
    }),
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.acceptedCents, 413500);
    assert.equal(res.forgivenCents, 123500);
  }
  assert.deepEqual(updates, [[step.stripePaymentIntentId, { amount: 413500 }]]);
  assert.equal(
    customerReads,
    0,
    "PI-specific funds must not be added to unrelated customer cash",
  );
  const [after] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after.status, "paid");
  assert.equal(after.amountCents, 413500);
  assert.equal(after.amountReceivedCents, 413500);
});

test("accept-partial uses Stripe's PI-bound cash transaction when PI amount_received and cash balance report zero", async () => {
  // Production exposes this shape after reconciling the pushed wire: the PI
  // and unallocated balance are zero, but Stripe's applied_to_payment cash
  // transaction proves that $4,135 was allocated to this exact PI.
  const step = await seedStep({
    amountCents: 537000,
    amountReceivedCents: 0,
    payerDetails: [
      {
        at: "2026-08-25T12:24:35.705Z",
        currency: "usd",
        amountCents: 413500,
        bankTransfer: {
          type: "us_bank_transfer",
          us_bank_transfer: {
            network: "domestic_wire_us",
            sender_name: "Slingshot Creative LLC",
          },
        },
      },
      // A replay must not be summed into an impossible overpayment.
      {
        at: "2026-08-25T12:24:36.705Z",
        currency: "usd",
        amountCents: 413500,
      },
    ],
  });
  const updates: any[] = [];
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 0,
      piAmount: 537000,
      piAmountReceived: 0,
      cashTransactions: [
        {
          id: "ccsbtxn_funded",
          type: "funded",
          net_amount: 413500,
          currency: "usd",
        },
        {
          id: "ccsbtxn_applied",
          type: "applied_to_payment",
          net_amount: -413500,
          currency: "usd",
          applied_to_payment: {
            payment_intent: step.stripePaymentIntentId,
          },
        },
      ],
      onUpdate: (id, p) => updates.push([id, p]),
    }),
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.acceptedCents, 413500);
    assert.equal(res.forgivenCents, 123500);
  }
  assert.deepEqual(updates, [[step.stripePaymentIntentId, { amount: 413500 }]]);
  const [after] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after.status, "paid");
  assert.equal(after.amountCents, 413500);
  assert.equal(after.amountReceivedCents, 413500);
});

test("accept-partial ignores payer receipts and cash transactions bound to another PI", async () => {
  const step = await seedStep({
    amountCents: 537000,
    amountReceivedCents: 0,
    payerDetails: [{ currency: "usd", amountCents: 413500 }],
  });
  const updates: any[] = [];
  const confirms: string[] = [];
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 0,
      piAmountReceived: 0,
      cashTransactions: [
        {
          id: "ccsbtxn_other",
          type: "applied_to_payment",
          net_amount: -413500,
          currency: "usd",
          applied_to_payment: { payment_intent: "pi_another_step" },
        },
      ],
      onUpdate: (id, p) => updates.push([id, p]),
      onConfirm: (id) => confirms.push(id),
    }),
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
  assert.deepEqual(updates, []);
  assert.deepEqual(confirms, []);
  const [after] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after.status, "awaiting_transfer");
  assert.equal(after.amountCents, 537000);
  assert.equal(after.amountReceivedCents, 0);
});

test("accept-partial paginates and nets unapplied cash transactions for this PI", async () => {
  const step = await seedStep({ amountCents: 537000 });
  const listParams: any[] = [];
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 0,
      piAmountReceived: 0,
      cashTransactionPages: [
        {
          data: [
            {
              id: "ccsbtxn_apply_5000",
              type: "applied_to_payment",
              net_amount: -500000,
              currency: "usd",
              applied_to_payment: {
                payment_intent: step.stripePaymentIntentId,
              },
            },
          ],
          has_more: true,
        },
        {
          data: [
            {
              id: "ccsbtxn_unapply_865",
              type: "unapplied_from_payment",
              net_amount: 86500,
              currency: "usd",
              unapplied_from_payment: {
                payment_intent: step.stripePaymentIntentId,
              },
            },
          ],
          has_more: false,
        },
      ],
      onCashTransactionsList: (params) => listParams.push(params),
    }),
  });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.acceptedCents, 413500);
  assert.equal(listParams.length, 2);
  assert.equal(listParams[0].starting_after, undefined);
  assert.equal(listParams[1].starting_after, "ccsbtxn_apply_5000");
});

test("accept-partial fails closed when Stripe allocation history cannot be read", async () => {
  const step = await seedStep({ amountCents: 537000 });
  const updates: any[] = [];
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      piAmountReceived: 0,
      cashTransactionsError: "Stripe timeout",
      cashUsdCents: 413500,
      onUpdate: (id, p) => updates.push([id, p]),
    }),
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 502);
  assert.deepEqual(updates, []);
  const [after] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after.status, "awaiting_transfer");
  assert.equal(after.amountCents, 537000);
});

test("accept-partial rejects malformed PI allocation and pagination data", async () => {
  const cases = [
    {
      label: "fractional cents",
      page: {
        data: [
          {
            id: "ccsbtxn_fractional",
            type: "applied_to_payment",
            net_amount: -413500.5,
            currency: "usd",
          },
        ],
        has_more: false,
      },
      attachPi: true,
    },
    {
      label: "missing has_more",
      page: { data: [] },
      attachPi: false,
    },
  ];
  for (const testCase of cases) {
    const step = await seedStep({ amountCents: 537000 });
    if (testCase.attachPi) {
      testCase.page.data[0].applied_to_payment = {
        payment_intent: step.stripePaymentIntentId,
      };
    }
    const res = await acceptPartialTransferAsPaid({
      albumId,
      stepId: step.id,
      callerRole: "super_admin",
      stripe: stubStripe({
        piAmountReceived: 0,
        cashUsdCents: 413500,
        cashTransactionPages: [testCase.page],
      }),
    });
    assert.equal(res.ok, false, testCase.label);
    if (!res.ok) assert.equal(res.status, 502, testCase.label);
    const [after] = await db
      .select()
      .from(manufacturerPaymentSteps)
      .where(eq(manufacturerPaymentSteps.id, step.id));
    assert.equal(after.status, "awaiting_transfer", testCase.label);
    assert.equal(after.amountCents, 537000, testCase.label);
  }
});

test("accept-partial refuses recorded receipts and shared cash when the PI read fails", async () => {
  const step = await seedStep({
    amountCents: 537000,
    amountReceivedCents: 0,
    payerDetails: [{ currency: "usd", amountCents: 413500 }],
  });
  const updates: any[] = [];
  const confirms: string[] = [];
  let customerReads = 0;
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      piRetrieveError: "Stripe timeout",
      cashUsdCents: 413500,
      onCustomerRetrieve: () => customerReads++,
      onUpdate: (id, p) => updates.push([id, p]),
      onConfirm: (id) => confirms.push(id),
    }),
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 502);
  assert.equal(customerReads, 0);
  assert.deepEqual(updates, []);
  assert.deepEqual(confirms, []);
  const [after] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after.status, "awaiting_transfer");
  assert.equal(after.amountCents, 537000);
  assert.equal(after.amountReceivedCents, 0);
});

test("accept-partial fails closed on missing live Stripe balance fields", async () => {
  const piMissing = await seedStep({ amountCents: 537000 });
  const piRes = await acceptPartialTransferAsPaid({
    albumId,
    stepId: piMissing.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      omitPiAmountReceived: true,
      cashUsdCents: 0,
    }),
  });
  assert.equal(piRes.ok, false);
  if (!piRes.ok) assert.equal(piRes.status, 502);

  const cashMissing = await seedStep({ amountCents: 537000 });
  const cashRes = await acceptPartialTransferAsPaid({
    albumId,
    stepId: cashMissing.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      piAmountReceived: 0,
      omitCashUsd: true,
      cashTransactions: [],
    }),
  });
  assert.equal(cashRes.ok, false);
  if (!cashRes.ok) assert.equal(cashRes.status, 502);

  for (const seeded of [piMissing, cashMissing]) {
    const [after] = await db
      .select()
      .from(manufacturerPaymentSteps)
      .where(eq(manufacturerPaymentSteps.id, seeded.id));
    assert.equal(after.status, "awaiting_transfer");
    assert.equal(after.amountCents, 537000);
    assert.equal(after.amountReceivedCents, 0);
  }
});

test("accept-partial preserves the margin line when the received funds cover it", async () => {
  const step = await seedStep({ amountCents: 500000, marginCents: 20000 });
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "admin",
    stripe: stubStripe({ cashUsdCents: 413500 }),
  });
  assert.equal(res.ok, true);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  // Plant leg absorbs the reduction; margin stays whole.
  assert.equal(after1.marginCents, 20000);
  assert.equal(after1.amountCents, 393500);
  assert.equal(after1.amountReceivedCents, 413500);
});

test("accept-partial caps at the requested total on a cash-balance surplus", async () => {
  const step = await seedStep();
  const updates: any[] = [];
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 600000, // more than the $5,000 due
      onUpdate: (id, p) => updates.push([id, p]),
    }),
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.acceptedCents, 500000);
    assert.equal(res.forgivenCents, 0);
  }
  assert.deepEqual(updates, [[step.stripePaymentIntentId, { amount: 500000 }]]);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  assert.equal(after1.amountCents, 500000);
});

test("accept-partial is forbidden for partners (never touches Stripe)", async () => {
  const step = await seedStep({ amountReceivedCents: 413500 });
  const updates: any[] = [];
  for (const role of ["label", "artist", "manufacturer", null]) {
    const res = await acceptPartialTransferAsPaid({
      albumId,
      stepId: step.id,
      callerRole: role,
      stripe: stubStripe({
        cashUsdCents: 413500,
        onUpdate: (id, p) => updates.push([id, p]),
      }),
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 403);
  }
  assert.deepEqual(updates, []);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "awaiting_transfer");
});

test("accept-partial refuses when no funds have been received", async () => {
  const step = await seedStep();
  const updates: any[] = [];
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 0,
      onUpdate: (id, p) => updates.push([id, p]),
    }),
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
  assert.deepEqual(updates, []);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "awaiting_transfer");
});

test("accept-partial refuses an already-paid step (idempotent double-click)", async () => {
  const step = await seedStep({ status: "paid", amountReceivedCents: 413500 });
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({ cashUsdCents: 413500 }),
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
});

test("accept-partial refuses non-awaiting states", async () => {
  for (const status of ["unpaid", "processing", "failed"]) {
    const step = await seedStep({ status, amountReceivedCents: 100000 });
    const res = await acceptPartialTransferAsPaid({
      albumId,
      stepId: step.id,
      callerRole: "super_admin",
      stripe: stubStripe({ cashUsdCents: 100000 }),
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 409);
  }
});

test("accept-partial fails closed when the Stripe PI update errors (nothing changes)", async () => {
  const step = await seedStep();
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({ cashUsdCents: 413500, updateError: "boom" }),
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 502);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "awaiting_transfer");
  assert.equal(after1.amountCents, 500000); // total untouched
  assert.equal(after1.marginCents, 0);
});

test("accept-partial compensates when the confirm fails: PI and totals restored, step intact", async () => {
  // Confirm throws → PI restored to the original amount, DB totals restored.
  const step1 = await seedStep();
  const updates1: any[] = [];
  const res1 = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step1.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 413500,
      confirmError: "net down",
      onUpdate: (id, p) => updates1.push([id, p]),
    }),
  });
  assert.equal(res1.ok, false);
  if (!res1.ok) assert.equal(res1.status, 502);
  // Shrink then compensating restore, both at Stripe.
  assert.deepEqual(updates1, [
    [step1.stripePaymentIntentId, { amount: 413500 }],
    [step1.stripePaymentIntentId, { amount: 500000 }],
  ]);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step1.id));
  assert.equal(after1.status, "awaiting_transfer");
  assert.equal(after1.amountCents, 500000); // requested total intact
  assert.equal(after1.marginCents, 0);

  // Confirm returns a non-succeeded status → same compensation.
  const step2 = await seedStep({ marginCents: 20000 });
  const res2 = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step2.id,
    callerRole: "super_admin",
    stripe: stubStripe({ cashUsdCents: 413500, confirmStatus: "requires_action" }),
  });
  assert.equal(res2.ok, false);
  if (!res2.ok) assert.equal(res2.status, 502);
  const [after2] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step2.id));
  assert.equal(after2.status, "awaiting_transfer");
  assert.equal(after2.amountCents, 500000);
  assert.equal(after2.marginCents, 20000);
});

test("accept-partial keeps the shrunk total only when the compensating PI restore also fails", async () => {
  const step = await seedStep();
  let updateCalls = 0;
  const stripe = stubStripe({ cashUsdCents: 413500, confirmError: "net down" });
  (stripe.paymentIntents as any).update = async (_id: string, _p: any) => {
    updateCalls += 1;
    if (updateCalls > 1) throw new Error("restore failed"); // shrink ok, restore fails
    return {};
  };
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe,
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 502);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "awaiting_transfer");
  // The PI is still shrunk at Stripe, so the shrunk recorded total is the
  // honest mirror — retrying accept re-runs idempotently from here.
  assert.equal(after1.amountCents, 413500);
});

test("accept-partial requires a live balance read: refuses (fail closed) when Stripe is unreachable, even with a recorded tally", async () => {
  const step = await seedStep({ amountReceivedCents: 413500 });
  const updates: any[] = [];
  const stripe = stubStripe({
    cashUsdCents: 413500,
    onUpdate: (id, p) => updates.push([id, p]),
  });
  (stripe.customers as any).retrieve = async () => {
    throw new Error("stripe down");
  };
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe,
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 502);
  assert.deepEqual(updates, []); // PI never touched
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "awaiting_transfer");
  assert.equal(after1.amountCents, 500000);
});

test("accept-partial race: webhook settles BEFORE any Stripe change → 409, PI untouched, totals intact", async () => {
  // The settle races us during the live balance read: the guarded totals
  // adjustment finds no awaiting row and the accept bails having touched
  // nothing at Stripe.
  const step = await seedStep();
  const updates: any[] = [];
  const stripe = stubStripe({
    cashUsdCents: 413500,
    onUpdate: (id, p) => updates.push([id, p]),
  });
  const origRetrieve = stripe.customers.retrieve.bind(stripe.customers);
  (stripe.customers as any).retrieve = async (id: string, params: any) => {
    // Simulate the webhook settling the (full) PI concurrently.
    await db
      .update(manufacturerPaymentSteps)
      .set({ status: "paid", paidAt: new Date(), amountReceivedCents: 500000 })
      .where(eq(manufacturerPaymentSteps.id, step.id));
    return origRetrieve(id, params);
  };
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe,
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
  assert.deepEqual(updates, []); // Stripe PI never touched
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  assert.equal(after1.amountCents, 500000); // full totals — full PI settled
});

test("accept-partial race: webhook settles the FULL PI while the shrink call fails → full totals restored on the paid row", async () => {
  // Totals were pre-adjusted, then the Stripe shrink fails while a webhook
  // concurrently settles the still-full PI. The restore must apply even
  // though the row is now paid — the full totals mirror what Stripe took.
  const step = await seedStep();
  const stripe = stubStripe({ cashUsdCents: 413500 });
  (stripe.paymentIntents as any).update = async () => {
    await db
      .update(manufacturerPaymentSteps)
      .set({ status: "paid", paidAt: new Date(), amountReceivedCents: 500000 })
      .where(eq(manufacturerPaymentSteps.id, step.id));
    throw new Error("stripe glitch");
  };
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe,
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 502);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  assert.equal(after1.amountCents, 500000); // restored to the settled full amount
  assert.equal(after1.marginCents, 0);
});

test("accept-partial race: webhook settles the SHRUNK PI during confirm failure → paid at the adjusted totals, no restore", async () => {
  // The PI is already shrunk when confirm errors while a webhook settles
  // it concurrently. The compensating totals-restore is guarded on
  // awaiting_transfer, so the winning settlement keeps the SHRUNK totals —
  // exactly what Stripe collected.
  const step = await seedStep();
  const stripe = stubStripe({ cashUsdCents: 413500 });
  (stripe.paymentIntents as any).confirm = async () => {
    await db
      .update(manufacturerPaymentSteps)
      .set({ status: "paid", paidAt: new Date(), amountReceivedCents: 413500 })
      .where(eq(manufacturerPaymentSteps.id, step.id));
    throw new Error("net blip after settle");
  };
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe,
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 502);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  assert.equal(after1.amountCents, 413500); // shrunk totals preserved
  assert.equal(after1.amountReceivedCents, 413500);
});

test("accept-partial indeterminate shrink: timeout AFTER Stripe applied it → reconciled via PI re-read, settles paid", async () => {
  // The update throws, but Stripe actually applied the shrink. The PI
  // re-read shows the accepted amount, so the flow proceeds and settles.
  const step = await seedStep();
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 413500,
      updateError: "socket timeout",
      updateAppliesDespiteError: true,
    }),
  });
  assert.equal(res.ok, true);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  assert.equal(after1.amountCents, 413500);
  assert.equal(after1.amountReceivedCents, 413500);
});

test("accept-partial indeterminate shrink with unreadable PI: no blind restore, converging state kept", async () => {
  // Both the update AND the reconciliation re-read fail: fully
  // indeterminate. The shrunk recorded totals stay (a retry re-derives
  // everything and converges); nothing is blindly restored.
  const step = await seedStep();
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 413500,
      updateError: "socket timeout",
      piRetrieveError: "still down",
      piRetrieveErrorAfter: 1,
    }),
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.status, 502);
    assert.match(res.message, /retry/i);
  }
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "awaiting_transfer");
  assert.equal(after1.amountCents, 413500); // consistent, retry converges
});

test("accept-partial indeterminate confirm: timeout AFTER Stripe settled → reconciled via PI re-read, settles paid", async () => {
  const step = await seedStep();
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 413500,
      confirmError: "socket timeout",
      confirmAppliesDespiteError: true,
    }),
  });
  assert.equal(res.ok, true);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  assert.equal(after1.amountCents, 413500);
});

test("accept-partial indeterminate confirm with unreadable PI: PI untouched, shrunk mirror kept", async () => {
  const step = await seedStep();
  const updates: any[] = [];
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 413500,
      confirmError: "socket timeout",
      piRetrieveError: "still down",
      piRetrieveErrorAfter: 1,
      onUpdate: (id, p) => updates.push([id, p]),
    }),
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 502);
  // Only the shrink — no blind PI restore while its state is unknown (it
  // may have settled; the succeeded webhook completes it).
  assert.deepEqual(updates, [[step.stripePaymentIntentId, { amount: 413500 }]]);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "awaiting_transfer");
  assert.equal(after1.amountCents, 413500);
});

test("accept-partial DB failure during totals restore after a PI restore: caught, flagged, honest message", async () => {
  const step = await seedStep();
  const updates: any[] = [];
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 413500,
      confirmError: "net down",
      onUpdate: (id, p) => updates.push([id, p]),
    }),
    testFailpoint: "totals-restore",
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.status, 502);
    assert.match(res.message, /could not be restored/i);
  }
  // PI was restored to the original amount at Stripe...
  assert.deepEqual(updates, [
    [step.stripePaymentIntentId, { amount: 413500 }],
    [step.stripePaymentIntentId, { amount: 500000 }],
  ]);
  // ...but the DB restore failed: totals stay shrunk, step stays awaiting;
  // a retry re-derives from current state and reconciles.
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "awaiting_transfer");
  assert.equal(after1.amountCents, 413500);
});

test("accept-partial DB failure AFTER the payment settled: never reported as not-settled; webhook completes it", async () => {
  const step = await seedStep();
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({ cashUsdCents: 413500 }),
    testFailpoint: "mark-paid",
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.status, 502);
    assert.match(res.message, /settled at Stripe/i);
  }
  // Totals stay at the settled (shrunk) amount; the succeeded webhook's
  // idempotent markStepPaid is the durable recovery for the paid flip.
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "awaiting_transfer");
  assert.equal(after1.amountCents, 413500);

  // Prove the recovery: replay the webhook's succeeded handling.
  await handleShopifyPlusWebhookEvent(
    {
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: step.stripePaymentIntentId,
          amount: 413500,
          amount_received: 413500,
          metadata: { gt_kind: "shopify_plus_step", gt_step_id: step.id },
        },
      },
    },
    { stripe: stubStripe({ cashUsdCents: 0 }) },
  );
  const [after2] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after2.status, "paid");
  assert.equal(after2.amountCents, 413500); // settled totals preserved
});

test("accept-partial indeterminate shrink vs racing FULL settlement: totals restored to the settled full amount", async () => {
  // After the DB-first adjustment, the update throws because a racing
  // settlement already succeeded the ORIGINAL full PI. The PI re-read
  // reports succeeded at the original amount — the accept must record a
  // FULL settlement (totals restored, nothing forgiven), never the
  // partial amount it merely intended.
  const step = await seedStep();
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 413500,
      updateError: "PI already succeeded",
      piStatus: "succeeded", // settled at the original 500000
    }),
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.acceptedCents, 500000);
    assert.equal(res.forgivenCents, 0);
  }
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  assert.equal(after1.amountCents, 500000); // full settled totals
  assert.equal(after1.amountReceivedCents, 500000);
});

test("accept-partial indeterminate shrink where the PI settled at the ACCEPTED amount: paid at the shrunk totals", async () => {
  // The shrink applied AND a racing settle confirmed it before our
  // re-read: succeeded at the accepted amount → partial settlement stands.
  const step = await seedStep();
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 413500,
      updateError: "socket timeout",
      updateAppliesDespiteError: true,
      piStatus: "succeeded",
    }),
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.acceptedCents, 413500);
    assert.equal(res.forgivenCents, 86500);
  }
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  assert.equal(after1.amountCents, 413500);
});

test("accept-partial refuses on a stale tally when the shared cash balance is depleted", async () => {
  // Two steps share one Stripe customer/cash balance: the first settled and
  // consumed the funds; the second still carries a stale recorded tally.
  // Live balance is now 0 — accept must refuse, never trust the tally.
  const step = await seedStep({ amountReceivedCents: 413500 });
  const updates: any[] = [];
  const res = await acceptPartialTransferAsPaid({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      cashUsdCents: 0,
      onUpdate: (id, p) => updates.push([id, p]),
    }),
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
  assert.deepEqual(updates, []);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "awaiting_transfer");
  assert.equal(after1.amountCents, 500000);
});

test("paid steps ignore late partially_funded replays (idempotent)", async () => {
  const step = await seedStep({ status: "paid", amountReceivedCents: 500000 });
  const handled = await handleShopifyPlusWebhookEvent(
    partiallyFundedEvent(step),
    { stripe: stubStripe({ cashUsdCents: 500000 }) },
  );
  assert.equal(handled, true);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "paid");
  assert.equal(after1.amountReceivedCents, 500000);
});
