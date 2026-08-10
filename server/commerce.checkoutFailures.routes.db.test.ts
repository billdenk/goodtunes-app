// Task #2993 — Failed Stripe checkout ingestion + support lookup.
//
// Pins in:
//   (1) a `payment_intent.payment_failed` webhook creates EXACTLY ONE
//       checkout_failure_events row (kind 'payment_failed', decline code
//       captured), and a retry of the same event id is a no-op;
//   (2) a `checkout.session.expired` webhook creates exactly one row
//       (kind 'session_expired'), idempotent on retry;
//   (3) GET /api/admin/checkout-failures?email= returns the rows filtered
//       by buyer email with human-readable reason labels, operator-only.
//
// The webhook is exercised through the real HTTP route with the raw-body
// middleware mounted the same way server/index.ts does. The dev unsigned
// fallback (no stripe-signature header, NODE_ENV !== production) is used
// so no Stripe network access or signing key is needed — hermetic.
//
//   npx tsx --test server/commerce.checkoutFailures.routes.db.test.ts
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "./db";
import { storage } from "./storage";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";

const exec = (q: any) => db.execute(q);

const created = {
  users: new Set<string>(),
  customers: new Set<string>(),
  albums: new Set<string>(),
  events: new Set<string>(), // stripe_event_id values
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let adminToken = "";
let customerId = "";
let albumId = "";
const buyerEmail = `t2993_${randomUUID().slice(0, 8)}@example.test`;

const piEventId = `evt_t2993_pi_${randomUUID().replace(/-/g, "")}`;
const sessEventId = `evt_t2993_cs_${randomUUID().replace(/-/g, "")}`;

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  // Mirror server/index.ts: the Stripe webhook gets the RAW body; JSON
  // parsing runs everywhere else.
  app.use("/api/webhooks/stripe", express.raw({ type: "*/*", limit: "1mb" }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  // Operator (super_admin) bearer for the support lookup route.
  const adminId = randomUUID();
  const tag = adminId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${adminId}, ${"t2993_" + tag}, ${"x"}, ${"t2993"}, ${"t2993_" + tag + "@example.test"},
            true, ${"super_admin"})
  `);
  created.users.add(adminId);
  adminToken = "t2993tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(adminToken, adminId, "admin");

  // A fan the webhook should resolve via gt_customer_id metadata.
  customerId = randomUUID();
  await exec(sql`
    INSERT INTO customer_users (id, username, email, display_name)
    VALUES (${customerId}, ${buyerEmail}, ${buyerEmail}, ${"T2993 Fan"})
  `);
  created.customers.add(customerId);

  albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${albumId}, ${"T2993 Test Album"}, ${"T2993 Artist"}, ${"/album-placeholder.svg"})
  `);
  created.albums.add(albumId);
});

async function postWebhook(event: unknown) {
  // No stripe-signature header → dev unsigned fallback path.
  const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  let json: any = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

async function countRows(eventId: string): Promise<number> {
  const r = await exec(sql`SELECT COUNT(*)::int AS c FROM checkout_failure_events WHERE stripe_event_id = ${eventId}`);
  return Number((r as any).rows?.[0]?.c ?? 0);
}

function piFailedEvent() {
  return {
    id: piEventId,
    type: "payment_intent.payment_failed",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "pi_t2993_" + piEventId.slice(-8),
        object: "payment_intent",
        amount: 4599,
        receipt_email: null,
        metadata: {
          gt_customer_id: customerId,
          gt_album_id: albumId,
          gt_sku_format: "vinyl_12",
          gt_quantity: "1",
        },
        last_payment_error: {
          code: "card_declined",
          decline_code: "insufficient_funds",
          message: "Your card has insufficient funds.",
          payment_method: { billing_details: { email: buyerEmail, name: "T2993 Fan" } },
        },
      },
    },
  };
}

function sessionExpiredEvent() {
  return {
    id: sessEventId,
    type: "checkout.session.expired",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "cs_t2993_" + sessEventId.slice(-8),
        object: "checkout.session",
        amount_total: 4599,
        payment_intent: null,
        customer_details: { email: buyerEmail, name: "T2993 Fan" },
        metadata: {
          gt_customer_id: customerId,
          gt_album_id: albumId,
          gt_sku_format: "vinyl_12",
          gt_quantity: "2",
        },
      },
    },
  };
}

test("payment_intent.payment_failed creates exactly one row, idempotent on retry", async () => {
  created.events.add(piEventId);
  const first = await postWebhook(piFailedEvent());
  assert.equal(first.status, 200, JSON.stringify(first.json));
  assert.equal(await countRows(piEventId), 1);

  // Stripe retry: same event id → still exactly one row, still 200.
  const retry = await postWebhook(piFailedEvent());
  assert.equal(retry.status, 200);
  assert.equal(await countRows(piEventId), 1);

  const r = await exec(sql`SELECT * FROM checkout_failure_events WHERE stripe_event_id = ${piEventId}`);
  const row = (r as any).rows[0];
  assert.equal(row.kind, "payment_failed");
  assert.equal(row.failure_code, "insufficient_funds");
  assert.equal(row.customer_id, customerId);
  assert.equal(row.album_id, albumId);
  assert.equal(row.buyer_email, buyerEmail.toLowerCase());
  assert.equal(Number(row.amount_cents), 4599);
});

test("checkout.session.expired creates exactly one row, idempotent on retry", async () => {
  created.events.add(sessEventId);
  const first = await postWebhook(sessionExpiredEvent());
  assert.equal(first.status, 200, JSON.stringify(first.json));
  assert.equal(await countRows(sessEventId), 1);

  const retry = await postWebhook(sessionExpiredEvent());
  assert.equal(retry.status, 200);
  assert.equal(await countRows(sessEventId), 1);

  const r = await exec(sql`SELECT * FROM checkout_failure_events WHERE stripe_event_id = ${sessEventId}`);
  const row = (r as any).rows[0];
  assert.equal(row.kind, "session_expired");
  assert.equal(row.failure_code, null);
  assert.equal(row.buyer_email, buyerEmail.toLowerCase());
  assert.equal(Number(row.quantity), 2);
});

test("support lookup returns rows filtered by buyer email with reason labels", async () => {
  const res = await fetch(
    `${baseUrl}/api/admin/checkout-failures?email=${encodeURIComponent(buyerEmail.toUpperCase())}`,
    { headers: { authorization: `Bearer ${adminToken}` } },
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  const rows = body.rows as any[];
  assert.equal(rows.length, 2);
  const decline = rows.find((r) => r.kind === "payment_failed");
  const expired = rows.find((r) => r.kind === "session_expired");
  assert.ok(decline && expired);
  assert.equal(decline.reasonLabel, "Insufficient funds");
  assert.equal(expired.reasonLabel, "Checkout expired");
  assert.equal(decline.albumTitle, "T2993 Test Album");

  // Filtering actually filters: a different email returns nothing.
  const other = await fetch(
    `${baseUrl}/api/admin/checkout-failures?email=${encodeURIComponent("nobody_" + buyerEmail)}`,
    { headers: { authorization: `Bearer ${adminToken}` } },
  );
  assert.equal(other.status, 200);
  assert.equal(((await other.json()).rows as any[]).length, 0);

  // Unauthenticated callers are rejected.
  const anon = await fetch(`${baseUrl}/api/admin/checkout-failures`);
  assert.equal(anon.status, 401);
});

test("failed attempts surface on the admin customer profile next to orders", async () => {
  const res = await fetch(`${baseUrl}/api/admin/customers/${customerId}`, {
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.failedCheckouts));
  assert.equal(body.failedCheckouts.length, 2);
  const kinds = body.failedCheckouts.map((f: any) => f.kind).sort();
  assert.deepEqual(kinds, ["payment_failed", "session_expired"]);
  assert.equal(body.failedCheckouts[0].albumTitle, "T2993 Test Album");
});

after(async () => {
  for (const e of created.events) {
    await exec(sql`DELETE FROM checkout_failure_events WHERE stripe_event_id = ${e}`);
  }
  await exec(sql`DELETE FROM auth_tokens WHERE token = ${adminToken}`);
  for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
  for (const id of created.customers) await exec(sql`DELETE FROM customer_users WHERE id = ${id}`);
  for (const id of created.users) await exec(sql`DELETE FROM users WHERE id = ${id}`);
  httpServer?.close();
  await pool.end();
});
