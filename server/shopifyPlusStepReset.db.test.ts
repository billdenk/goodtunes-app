// Task #2929 — operator reset for a Shopify+ payment step stuck on
// "Paying" after an abandoned ACH checkout.
//
// Exercises resetStuckPaymentStep — the authority the
// POST .../steps/:stepId/reset-payment route delegates to — directly
// against a real Postgres with a STUB Stripe surface (the helper takes an
// injected {stripe}, mirroring the materializeOrderFromSession test seam),
// so no network and no real Stripe account are touched:
//
//   • an abandoned open session is expired + the step returns to unpaid
//   • a completed session is refused (409) and the step is untouched
//   • an in-flight payment intent (processing) is refused (409)
//   • non-operator roles are blocked (403)
//
// Real DB (DATABASE_URL), Node's built-in runner:
//   npx tsx --test server/shopifyPlusStepReset.db.test.ts
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { manufacturerPaymentSteps } from "@shared/schema";
import { resetStuckPaymentStep, type StepResetStripe } from "./shopifyPlus";

const albumId = `sp-reset-album-${randomUUID().slice(0, 8)}`;

function stubStripe(opts: {
  sessionStatus?: string;
  paymentStatus?: string;
  sessionIntent?: string | null;
  intentStatus?: string;
  onExpire?: (id: string) => void;
}): StepResetStripe {
  return {
    checkout: {
      sessions: {
        retrieve: async () => ({
          status: opts.sessionStatus ?? "open",
          payment_status: opts.paymentStatus ?? "unpaid",
          payment_intent: opts.sessionIntent ?? null,
        }),
        expire: async (id: string) => {
          opts.onExpire?.(id);
          return {};
        },
      },
    },
    paymentIntents: {
      retrieve: async () => ({ status: opts.intentStatus ?? "requires_payment_method" }),
    },
  };
}

async function seedStep(overrides: Partial<Record<string, unknown>> = {}) {
  const [row] = await db
    .insert(manufacturerPaymentSteps)
    .values({
      albumId,
      description: "Test pressing setup",
      amountCents: 129500,
      marginCents: 0,
      status: "processing",
      stripeCheckoutSessionId: `cs_test_${randomUUID().slice(0, 12)}`,
      ...(overrides as any),
    })
    .returning();
  return row;
}

before(async () => {
  // Belt-and-suspenders cleanup of any prior aborted run.
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

test("resets an abandoned open session back to unpaid and expires it", async () => {
  const step = await seedStep();
  const expired: string[] = [];
  const res = await resetStuckPaymentStep({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({ onExpire: (id) => expired.push(id) }),
  });
  assert.equal(res.ok, true);
  assert.deepEqual(expired, [step.stripeCheckoutSessionId]);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "unpaid");
  assert.equal(after1.stripeCheckoutSessionId, null);
  assert.equal(after1.stripePaymentIntentId, null);
  assert.equal(after1.lastError, null);
});

test("refuses a session Stripe reports as completed", async () => {
  const step = await seedStep();
  const res = await resetStuckPaymentStep({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({ sessionStatus: "complete", paymentStatus: "paid" }),
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "processing");
  assert.ok(after1.stripeCheckoutSessionId);
});

test("refuses when the session's payment intent is mid-debit", async () => {
  const step = await seedStep();
  const res = await resetStuckPaymentStep({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({
      sessionStatus: "open",
      paymentStatus: "unpaid",
      sessionIntent: "pi_inflight_123",
      intentStatus: "processing",
    }),
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "processing");
});

test("refuses when a stored payment intent already succeeded", async () => {
  const step = await seedStep({
    stripePaymentIntentId: `pi_${randomUUID().slice(0, 12)}`,
  });
  const res = await resetStuckPaymentStep({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({ intentStatus: "succeeded" }),
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
});

test("only a processing step can be reset", async () => {
  const step = await seedStep({ status: "paid", stripeCheckoutSessionId: null });
  const res = await resetStuckPaymentStep({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe: stubStripe({}),
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
});

test("non-operator roles are blocked", async () => {
  const step = await seedStep();
  for (const role of ["artist", "label", "manager", null]) {
    const res = await resetStuckPaymentStep({
      albumId,
      stepId: step.id,
      callerRole: role,
      stripe: stubStripe({}),
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 403);
  }
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "processing");
});

test("a transient Stripe error fails CLOSED — the step stays processing", async () => {
  const step = await seedStep();
  const stripe: StepResetStripe = {
    checkout: {
      sessions: {
        retrieve: async () => {
          const err: any = new Error("connection reset");
          err.type = "StripeConnectionError";
          throw err;
        },
        expire: async () => {
          throw new Error("expire must not be called on retrieval failure");
        },
      },
    },
    paymentIntents: { retrieve: async () => ({ status: "processing" }) },
  };
  const res = await resetStuckPaymentStep({
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
  assert.equal(after1.status, "processing");
  assert.ok(after1.stripeCheckoutSessionId);
});

test("a session Stripe positively reports as missing (resource_missing) is treated as dead", async () => {
  const step = await seedStep();
  const stripe: StepResetStripe = {
    checkout: {
      sessions: {
        retrieve: async () => {
          const err: any = new Error("No such checkout.session");
          err.type = "StripeInvalidRequestError";
          err.code = "resource_missing";
          err.statusCode = 404;
          throw err;
        },
        expire: async () => ({}),
      },
    },
    paymentIntents: {
      retrieve: async () => ({ status: "requires_payment_method" }),
    },
  };
  const res = await resetStuckPaymentStep({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe,
  });
  assert.equal(res.ok, true);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "unpaid");
});

test("a payment-intent retrieval error fails CLOSED", async () => {
  const step = await seedStep({
    stripePaymentIntentId: `pi_${randomUUID().slice(0, 12)}`,
  });
  const stripe: StepResetStripe = {
    ...stubStripe({}),
    paymentIntents: {
      retrieve: async () => {
        throw new Error("api unavailable");
      },
    },
  };
  const res = await resetStuckPaymentStep({
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
  assert.equal(after1.status, "processing");
});

test("a webhook that attaches a payment intent mid-reset wins — the reset bails", async () => {
  // Simulate the verify→reset race: the stub's session retrieve fires a
  // concurrent "webhook" write that stores a payment intent on the step
  // AFTER the helper has loaded (and verified) its snapshot. The stricter
  // UPDATE predicate (session id match + PI column unchanged) must then
  // match nothing, leaving the webhook's write intact.
  const step = await seedStep();
  const stripe: StepResetStripe = {
    checkout: {
      sessions: {
        retrieve: async () => {
          await db
            .update(manufacturerPaymentSteps)
            .set({ stripePaymentIntentId: "pi_raced_webhook" })
            .where(eq(manufacturerPaymentSteps.id, step.id));
          return { status: "open", payment_status: "unpaid", payment_intent: null };
        },
        expire: async () => ({}),
      },
    },
    paymentIntents: {
      retrieve: async () => ({ status: "requires_payment_method" }),
    },
  };
  const res = await resetStuckPaymentStep({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe,
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "processing");
  assert.equal(after1.stripePaymentIntentId, "pi_raced_webhook");
  assert.ok(after1.stripeCheckoutSessionId);
});

test("a session that completes between verify and expire is refused", async () => {
  // First retrieve says open/unpaid; expire then throws (session no longer
  // open); the re-verify retrieve reports it completed → must refuse.
  const step = await seedStep();
  let retrieves = 0;
  const stripe: StepResetStripe = {
    checkout: {
      sessions: {
        retrieve: async () => {
          retrieves += 1;
          return retrieves === 1
            ? { status: "open", payment_status: "unpaid", payment_intent: null }
            : { status: "complete", payment_status: "paid", payment_intent: "pi_x" };
        },
        expire: async () => {
          const err: any = new Error("session is not open");
          err.type = "StripeInvalidRequestError";
          throw err;
        },
      },
    },
    paymentIntents: {
      retrieve: async () => ({ status: "requires_payment_method" }),
    },
  };
  const res = await resetStuckPaymentStep({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe,
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "processing");
});

test("an expire failure on a session that turns out truly expired still resets", async () => {
  const step = await seedStep();
  let retrieves = 0;
  const stripe: StepResetStripe = {
    checkout: {
      sessions: {
        retrieve: async () => {
          retrieves += 1;
          return retrieves === 1
            ? { status: "open", payment_status: "unpaid", payment_intent: null }
            : { status: "expired", payment_status: "unpaid", payment_intent: null };
        },
        expire: async () => {
          const err: any = new Error("session is not open");
          err.type = "StripeInvalidRequestError";
          throw err;
        },
      },
    },
    paymentIntents: {
      retrieve: async () => ({ status: "requires_payment_method" }),
    },
  };
  const res = await resetStuckPaymentStep({
    albumId,
    stepId: step.id,
    callerRole: "super_admin",
    stripe,
  });
  assert.equal(res.ok, true);
  const [after1] = await db
    .select()
    .from(manufacturerPaymentSteps)
    .where(eq(manufacturerPaymentSteps.id, step.id));
  assert.equal(after1.status, "unpaid");
});

test("missing step 404s", async () => {
  const res = await resetStuckPaymentStep({
    albumId,
    stepId: randomUUID(),
    callerRole: "super_admin",
    stripe: stubStripe({}),
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 404);
});
