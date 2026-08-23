// Task: Monday-demo Stripe payment tap — the artist pays their press bill off
// an ACCEPTED (Converted) estimate.
//
// Hermetic: the two money seams (createEstimatePaySession /
// confirmEstimatePayStatus) take an INJECTED minimal Stripe surface, exactly
// like materializeOrderFromSession's { stripe } dep, so no live Stripe account
// or network is touched. Business rules covered here:
//
//   • pay-session 404 on an unknown token (route-level, before Stripe)
//   • pay-session 422 when the estimate has no totalCents
//   • pay-session 409 when payload.paidAt is already set
//   • pay-session only for Converted estimates (409 otherwise)
//   • pay-status FAILS CLOSED on a session-id mismatch (never stamps paidAt)
//   • pay-status stamps paidAt only when Stripe says paid AND ids match
//
// Real Postgres (DATABASE_URL), Node's built-in runner:
//   npx tsx --test server/pressEstimatePay.db.test.ts
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import express from "express";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import {
  registerPressPortalRoutes,
  createEstimatePaySession,
  confirmEstimatePayStatus,
  type PayEstimateStripe,
  type PayEstimateRow,
} from "./pressPortal";

const exec = (q: any) => db.execute(q);

const created = { presses: new Set<string>(), estimates: new Set<string>() };
let server: Server;
let baseUrl: string;

// Minimal injected Stripe. `create` returns a fixed session; `retrieve` echoes
// whatever the test wants (paid/unpaid, id).
function stubStripe(opts: {
  createId?: string;
  createUrl?: string | null;
  retrieve?: (id: string) => { id: string; payment_status?: string | null; amount_total?: number | null };
} = {}): PayEstimateStripe {
  return {
    checkout: {
      sessions: {
        create: async () => ({ id: opts.createId ?? "cs_test_123", url: opts.createUrl ?? "https://checkout.stripe.test/pay/cs_test_123" }),
        retrieve: async (id: string) => (opts.retrieve ? opts.retrieve(id) : { id, payment_status: "paid", amount_total: 123400 }),
      },
    },
  };
}

async function seedPress(): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${id}, ${"pay-test press " + id.slice(0, 8)})`);
  created.presses.add(id);
  return id;
}

async function seedEstimate(pressId: string, payload: Record<string, any>, status = "Converted"): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  const token = "tok_" + randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 8);
  const full = { shareToken: token, ...payload };
  await exec(sql`
    INSERT INTO press_estimates (id, press_id, kind, display_id, title, status, payload)
    VALUES (${id}, ${pressId}, ${"estimate"}, ${"MRP-PAY-01"}, ${"Californialand"}, ${status}, ${JSON.stringify(full)}::jsonb)
  `);
  created.estimates.add(id);
  return { id, token };
}

async function loadPayload(id: string): Promise<Record<string, any>> {
  const r = await exec(sql`SELECT payload FROM press_estimates WHERE id = ${id} LIMIT 1`);
  return ((r as any).rows ?? [])[0]?.payload ?? {};
}

function payRow(id: string, payload: Record<string, any>, status = "Converted"): PayEstimateRow {
  return { id, title: "Californialand", display_id: "MRP-PAY-01", status, press_name: "MRP", payload };
}

before(async () => {
  const app = express();
  app.use(express.json());
  const noop = (_req: any, _res: any, next: any) => next();
  registerPressPortalRoutes(app, noop, noop, { getStripe: async () => stubStripe() });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no server port");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  try {
    for (const id of created.estimates) await exec(sql`DELETE FROM press_estimates WHERE id = ${id}`);
    for (const id of created.presses) await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
});

test("pay-session 404 on an unknown token", async () => {
  const bogus = "tok_" + "x".repeat(40);
  const res = await fetch(`${baseUrl}/api/estimate-link/${bogus}/pay-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 404);
});

test("pay-session 422 when the estimate has no total", async () => {
  const pressId = await seedPress();
  const { token } = await seedEstimate(pressId, {}); // no totalCents
  const res = await fetch(`${baseUrl}/api/estimate-link/${token}/pay-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 422);
  assert.match((await res.json()).message, /no amount to pay/i);
});

test("pay-session refuses non-Converted estimates (409)", async () => {
  const result = await createEstimatePaySession({
    row: payRow("no-write", { totalCents: 123400 }, "Sent"),
    token: "tok_unused",
    origin: "https://mrp.example.test",
    stripe: stubStripe(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
});

test("pay-session 409 when already paid", async () => {
  const pressId = await seedPress();
  const { token } = await seedEstimate(pressId, { totalCents: 123400, paidAt: new Date().toISOString() });
  const res = await fetch(`${baseUrl}/api/estimate-link/${token}/pay-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 409);
  assert.match((await res.json()).message, /already paid/i);
});

test("pay-session persists the session id atomically and returns the url", async () => {
  const pressId = await seedPress();
  const { id, token } = await seedEstimate(pressId, { totalCents: 123400, other: "keep" });
  const result = await createEstimatePaySession({
    row: payRow(id, await loadPayload(id)),
    token,
    origin: "https://mrp.example.test",
    stripe: stubStripe({ createId: "cs_persist_1", createUrl: "https://checkout.stripe.test/pay/cs_persist_1" }),
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.url, "https://checkout.stripe.test/pay/cs_persist_1");
  const p = await loadPayload(id);
  assert.equal(p.paySessionId, "cs_persist_1");
  assert.equal(p.other, "keep"); // sibling keys survive the merge
  assert.ok(!p.paidAt); // not paid just by creating a session
});

test("pay-status FAILS CLOSED on a session-id mismatch — never stamps paidAt", async () => {
  const pressId = await seedPress();
  const { id, token } = await seedEstimate(pressId, { totalCents: 123400, paySessionId: "cs_ours" });
  const res = await fetch(`${baseUrl}/api/estimate-link/${token}/pay-status?session_id=cs_someone_elses`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).paid, false);
  const p = await loadPayload(id);
  assert.ok(!p.paidAt, "paidAt must NOT be stamped on a mismatch");
});

test("pay-status FAILS CLOSED when Stripe reports unpaid", async () => {
  const pressId = await seedPress();
  const { id } = await seedEstimate(pressId, { totalCents: 123400, paySessionId: "cs_unpaid" });
  const result = await confirmEstimatePayStatus({
    row: payRow(id, await loadPayload(id)),
    sessionId: "cs_unpaid",
    stripe: stubStripe({ retrieve: () => ({ id: "cs_unpaid", payment_status: "unpaid", amount_total: 123400 }) }),
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.paid, false);
  const p = await loadPayload(id);
  assert.ok(!p.paidAt);
});

test("pay-status stamps paidAt only when Stripe says paid AND ids match", async () => {
  const pressId = await seedPress();
  const { id } = await seedEstimate(pressId, { totalCents: 123400, paySessionId: "cs_good" });
  const result = await confirmEstimatePayStatus({
    row: payRow(id, await loadPayload(id)),
    sessionId: "cs_good",
    stripe: stubStripe({ retrieve: () => ({ id: "cs_good", payment_status: "paid", amount_total: 123400 }) }),
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.paid, true);
    assert.equal(result.amountCents, 123400);
  }
  const p = await loadPayload(id);
  assert.ok(p.paidAt, "paidAt stamped");
  assert.equal(p.paidAmountCents, 123400);
  assert.equal(p.paidVia, "stripe");
});
