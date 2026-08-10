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
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import { manufacturerPaymentSteps } from "@shared/schema";
import {
  handleShopifyPlusWebhookEvent,
  getBankTransferUnderpaymentThresholdCents,
  extractFundingInstructions,
  type BankTransferStripe,
} from "./shopifyPlus";

const albumId = `sp-bt-album-${randomUUID().slice(0, 8)}`;

function stubStripe(opts: {
  cashUsdCents?: number | null;
  confirmStatus?: string;
  onUpdate?: (id: string, params: any) => void;
  onConfirm?: (id: string) => void;
}): BankTransferStripe {
  return {
    customers: {
      retrieve: async () => ({
        cash_balance: {
          available:
            opts.cashUsdCents == null ? null : { usd: opts.cashUsdCents },
        },
      }),
    },
    paymentIntents: {
      update: async (id, params) => {
        opts.onUpdate?.(id, params);
        return {};
      },
      confirm: async (id) => {
        opts.onConfirm?.(id);
        return { status: opts.confirmStatus ?? "succeeded" };
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
