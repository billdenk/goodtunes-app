// Task #2989 — Regression tests for the fan signup verify/confirm →
// signup-with-code flow after the prod 500 hardening:
//
//  * confirm consumes the code and mints the verify ticket ATOMICALLY —
//    if the ticket insert fails, the code must NOT be consumed, so the
//    route's retryable 503 ("try again") stays honest.
//  * signup-with-code turns account-collision races into friendly
//    responses instead of generic 500s: an existing email → 409, and a
//    happy-path signup still completes 201 end-to-end.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   GT_TEST=1 npx tsx --test server/commerce.signupWithCode.routes.db.test.ts

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "t2989-test-session-secret";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import session from "express-session";
import { db, pool } from "./db";
import { registerCommerceRoutes, consumeCodeAndMintVerifyToken } from "./commerce";

const exec = (q: any) => db.execute(q);
const rows = (r: any): any[] => (r as any)?.rows ?? [];

let baseUrl = "";
let httpServer: HttpServer | undefined;

const createdEmails = new Set<string>();
const createdTokens = new Set<string>();

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "t2989", resave: false, saveUninitialized: false }));
  registerCommerceRoutes(app);
  httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  try {
    for (const email of createdEmails) {
      await exec(sql`DELETE FROM auth_tokens WHERE customer_user_id IN (SELECT id FROM customer_users WHERE email = ${email})`);
      await exec(sql`DELETE FROM customer_users WHERE email = ${email}`);
      await exec(sql`DELETE FROM email_verifications WHERE email = ${email}`);
      await exec(sql`DELETE FROM signup_verify_tokens WHERE email = ${email}`);
    }
    for (const token of createdTokens) {
      await exec(sql`DELETE FROM signup_verify_tokens WHERE token = ${token}`);
    }
  } finally {
    try { httpServer?.close(); } catch {}
    await pool.end();
  }
});

function freshEmail(): string {
  const email = `t2989_${randomUUID().slice(0, 8)}@example.test`;
  createdEmails.add(email);
  return email;
}

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(baseUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: any = undefined;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

test("happy path: start → confirm → signup-with-code completes 201, and the code/token are single-use", async () => {
  const email = freshEmail();

  const start = await post("/api/email-verifications/start", { email });
  assert.equal(start.status, 200, `start must 200 (got ${start.status})`);
  const code = start.json?.devCode;
  assert.match(String(code ?? ""), /^\d{6}$/, "dev start must return the devCode");

  const confirm = await post("/api/email-verifications/confirm", { email, code });
  assert.equal(confirm.status, 200, `confirm must 200 (got ${confirm.status}: ${JSON.stringify(confirm.json)})`);
  const verifyToken = confirm.json?.verifyToken;
  assert.ok(typeof verifyToken === "string" && verifyToken.startsWith("vt_"), "confirm must mint a vt_ ticket");

  // The code was consumed atomically with the ticket mint.
  const evRows = rows(await exec(sql`SELECT consumed_at FROM email_verifications WHERE email = ${email}`));
  assert.ok(evRows.length >= 1 && evRows.every((r) => r.consumed_at !== null), "code row must be consumed");

  // Replaying the same code must not mint a second ticket.
  const replay = await post("/api/email-verifications/confirm", { email, code });
  assert.equal(replay.status, 400, "replaying a consumed code must 400");

  const signup = await post("/api/customer/signup-with-code", { email, password: "password123", verifyToken });
  assert.equal(signup.status, 201, `signup must 201 (got ${signup.status}: ${JSON.stringify(signup.json)})`);
  assert.equal(signup.json?.email, email);
  assert.ok(signup.json?.token, "signup must mint a bearer token");

  // The verify ticket is single-use.
  const reuse = await post("/api/customer/signup-with-code", { email, password: "password123", verifyToken });
  assert.notEqual(reuse.status, 201, "reusing a spent verify ticket must not create a second account");
});

test("existing email → friendly 409, never a 500", async () => {
  const email = freshEmail();
  await exec(sql`
    INSERT INTO customer_users (id, username, email, display_name, password)
    VALUES (${randomUUID()}, ${"t2989_" + randomUUID().slice(0, 8)}, ${email}, ${"t2989 fan"}, ${"deadbeef.cafe"})
  `);

  const start = await post("/api/email-verifications/start", { email });
  // start either flags the account or still issues a code; either way the
  // signup endpoint must answer 409, not 500.
  const code = start.json?.devCode;
  let verifyToken: string | undefined;
  if (code) {
    const confirm = await post("/api/email-verifications/confirm", { email, code });
    verifyToken = confirm.json?.verifyToken;
  }
  const signup = await post("/api/customer/signup-with-code", {
    email,
    password: "password123",
    verifyToken: verifyToken ?? "vt_bogus-but-well-formed",
  });
  assert.ok(signup.status === 409 || signup.status === 400, `must be a friendly 4xx (got ${signup.status})`);
  assert.notEqual(signup.status, 500);
  if (signup.status === 409) {
    assert.match(String(signup.json?.message ?? ""), /already exists/i);
  }
});

test("atomicity: a failed verify-ticket mint rolls back the code consumption so a retry can still succeed", async () => {
  const email = freshEmail();

  // Seed an unconsumed verification row directly.
  const evId = randomUUID();
  await exec(sql`
    INSERT INTO email_verifications (id, email, code_hash, attempts, expires_at)
    VALUES (${evId}, ${email}, ${"x"}, 0, NOW() + INTERVAL '15 minutes')
  `);

  // Squat the ticket token so the transaction's insert hits the PK unique.
  const squattedToken = `vt_t2989_${randomUUID().slice(0, 8)}`;
  createdTokens.add(squattedToken);
  await exec(sql`INSERT INTO signup_verify_tokens (token, email) VALUES (${squattedToken}, ${"other@example.test"})`);

  await assert.rejects(
    () => consumeCodeAndMintVerifyToken(evId, email, squattedToken),
    "duplicate ticket insert must throw",
  );

  // The rollback must leave the code UNCONSUMED — this is what makes the
  // confirm route's retryable 503 honest.
  const evRows = rows(await exec(sql`SELECT consumed_at FROM email_verifications WHERE id = ${evId}`));
  assert.equal(evRows.length, 1);
  assert.equal(evRows[0].consumed_at, null, "consumed_at must roll back when the ticket mint fails");

  // And a retry with a fresh token succeeds.
  const freshToken = `vt_t2989_${randomUUID().slice(0, 8)}`;
  createdTokens.add(freshToken);
  await consumeCodeAndMintVerifyToken(evId, email, freshToken);
  const evRows2 = rows(await exec(sql`SELECT consumed_at FROM email_verifications WHERE id = ${evId}`));
  assert.ok(evRows2[0].consumed_at !== null, "retry must consume the code");
});
