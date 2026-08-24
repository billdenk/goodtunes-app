// Task: let EXISTING customers start an estimate project (Adam's signup loop).
//
// POST /api/estimate-link/:token/start must recognize a returning customer:
//   • a valid customer Bearer token starts the project directly (no account
//     form, no new account) — white-label hosts have host-scoped cookies so
//     the stored bearer is often the only credential that travels
//   • mode:"signin" + existing email + CORRECT password signs in and starts
//     (returns a bearer token like account creation does)
//   • mode:"signin" + WRONG password → 401 INVALID_CREDENTIALS (distinct
//     from ACCOUNT_EXISTS) and the estimate stays un-started
//   • mode:"create" (default) + existing email → 409 ACCOUNT_EXISTS (the
//     client pivots to the sign-in form)
//   • new-email create path unchanged: account minted, token returned
//
// Hermetic: no session middleware here (the route must tolerate a missing
// req.session — the bearer path is exactly the white-label reality).
// Real Postgres (DATABASE_URL), Node's built-in runner:
//   npx tsx --test server/pressEstimateStart.db.test.ts
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import express from "express";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { registerPressPortalRoutes } from "./pressPortal";
import { storage } from "./storage";

const scryptAsync = promisify(scrypt);
const exec = (q: any) => db.execute(q);

const created = { presses: new Set<string>(), estimates: new Set<string>(), customers: new Set<string>() };
let server: Server;
let baseUrl: string;

async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(pw, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function seedPress(): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${id}, ${"start-test press " + id.slice(0, 8)})`);
  created.presses.add(id);
  return id;
}

async function seedEstimate(pressId: string, status = "Sent"): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  const token = "tok_" + randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 8);
  const payload = { shareToken: token, clientName: "Adam Client", totalCents: 500000 };
  await exec(sql`
    INSERT INTO press_estimates (id, press_id, kind, display_id, title, status, payload)
    VALUES (${id}, ${pressId}, ${"estimate"}, ${"MRP-START-01"}, ${"Californialand"}, ${status}, ${JSON.stringify(payload)}::jsonb)
  `);
  created.estimates.add(id);
  return { id, token };
}

async function seedCustomer(password: string): Promise<{ id: string; email: string }> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const email = `start-test-${suffix}@example.com`;
  const c = await storage.createCustomer({
    username: `starttest${suffix}`,
    email,
    displayName: "Adam Client",
    realName: null,
    password: await hashPassword(password),
  } as any);
  created.customers.add(c.id);
  return { id: c.id, email };
}

async function loadRow(id: string): Promise<{ status: string; payload: Record<string, any> }> {
  const r = await exec(sql`SELECT status, payload FROM press_estimates WHERE id = ${id} LIMIT 1`);
  const row = ((r as any).rows ?? [])[0];
  return { status: row?.status, payload: row?.payload ?? {} };
}

function postStart(token: string, body: Record<string, any>, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}/api/estimate-link/${token}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

before(async () => {
  const app = express();
  app.use(express.json());
  const noop = (_req: any, _res: any, next: any) => next();
  registerPressPortalRoutes(app, noop, noop);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no server port");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  try {
    for (const id of created.estimates) await exec(sql`DELETE FROM press_estimates WHERE id = ${id}`);
    for (const id of created.customers) {
      await exec(sql`DELETE FROM auth_tokens WHERE customer_user_id = ${id}`);
      await exec(sql`DELETE FROM customer_users WHERE id = ${id}`);
    }
    for (const id of created.presses) await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
});

test("a valid customer bearer starts the project directly — no account form fields needed", async () => {
  const press = await seedPress();
  const est = await seedEstimate(press);
  const cust = await seedCustomer("hunter2secret");
  const bearer = randomBytes(32).toString("hex");
  await storage.createAuthToken(bearer, cust.id, "customer");

  const res = await postStart(est.token, {}, { Authorization: `Bearer ${bearer}` });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);

  const row = await loadRow(est.id);
  assert.equal(row.status, "Converted");
  assert.equal(row.payload.acceptedByCustomerId, cust.id);
});

test("mode:signin + correct password signs in and starts — returns a bearer token", async () => {
  const press = await seedPress();
  const est = await seedEstimate(press);
  const cust = await seedCustomer("correct-horse-1");

  const res = await postStart(est.token, { email: cust.email, password: "correct-horse-1", mode: "signin" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(typeof body.token === "string" && body.token.length > 0, "sign-in start must return a bearer token");

  // The minted token resolves to this customer.
  const resolved = await storage.getAuthBy(body.token);
  assert.deepEqual(resolved, { userId: cust.id, kind: "customer" });

  const row = await loadRow(est.id);
  assert.equal(row.status, "Converted");
  assert.equal(row.payload.acceptedByCustomerId, cust.id);
});

test("mode:signin + wrong password → 401 INVALID_CREDENTIALS, estimate untouched", async () => {
  const press = await seedPress();
  const est = await seedEstimate(press);
  const cust = await seedCustomer("the-real-password");

  const res = await postStart(est.token, { email: cust.email, password: "not-the-password", mode: "signin" });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.code, "INVALID_CREDENTIALS");

  const row = await loadRow(est.id);
  assert.equal(row.status, "Sent", "a failed sign-in must not convert the estimate");
});

test("mode:signin with an unknown email → 401 INVALID_CREDENTIALS (no account enumeration split)", async () => {
  const press = await seedPress();
  const est = await seedEstimate(press);
  const res = await postStart(est.token, { email: `nobody-${randomUUID().slice(0, 8)}@example.com`, password: "whatever123", mode: "signin" });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, "INVALID_CREDENTIALS");
});

test("create attempt with an existing email still → 409 ACCOUNT_EXISTS", async () => {
  const press = await seedPress();
  const est = await seedEstimate(press);
  const cust = await seedCustomer("some-password-9");

  const res = await postStart(est.token, { name: "Adam", email: cust.email, password: "brand-new-pass-1" });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.code, "ACCOUNT_EXISTS");

  const row = await loadRow(est.id);
  assert.equal(row.status, "Sent");
});

test("new-email create path unchanged: account minted, token returned, project started", async () => {
  const press = await seedPress();
  const est = await seedEstimate(press);
  const email = `fresh-${randomUUID().replace(/-/g, "").slice(0, 10)}@example.com`;

  const res = await postStart(est.token, { name: "Fresh Client", email, password: "longenough1" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(typeof body.token === "string" && body.token.length > 0);

  const minted = await storage.getCustomerByEmail(email);
  assert.ok(minted, "customer account must exist");
  created.customers.add(minted!.id);

  const row = await loadRow(est.id);
  assert.equal(row.status, "Converted");
  assert.equal(row.payload.acceptedByCustomerId, minted!.id);
});
