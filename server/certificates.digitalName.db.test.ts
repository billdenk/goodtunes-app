// Task #1480 — Coverage for the DIGITAL GoodDeed cert name editor
// (`GET`/`POST /api/orders/:orderId/cert/digital-name`, server/certificates.ts,
// shipped in Task #1467).
//
// Digital-only GoodDeed owners never mint a `signed_cert_certificates`
// row, so the cert PDF synthesizes the recipient name. This pair of
// endpoints lets such an owner review + override that name on a
// lightweight per-order field (orders.cert_confirmed_name). The rules
// are load-bearing — a regression would either:
//   • expose another fan's order (ownership gate),
//   • let a name be saved on a physical signed-cert copy (the 409
//     refusal keeps those out of the editor so the admin print queue
//     stays clean), or
//   • revert the cert PDF to the synthesized name (Path-2 preference).
//
// We register the real cert routes onto a throwaway Express app, listen
// on an ephemeral port, and drive the endpoints over HTTP with a real
// customer Bearer token — so the auth gate, ownership check, the
// finalized-status / GoodDeed-number guards, the real-cert-row 409, and
// the trim + length validation all run end-to-end against a real
// Postgres (DATABASE_URL).
//
//   npx tsx --test server/certificates.digitalName.db.test.ts
//
// Every row seeded here is tracked and torn down in the `after` hook.

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import express from "express";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { registerCertificateRoutes } from "./certificates";

const exec = (q: any) => db.execute(q);

const created = {
  authTokens: new Set<string>(),
  orders: new Set<string>(),
  albums: new Set<string>(),
  customers: new Set<string>(),
};

let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  app.use(express.json());
  registerCertificateRoutes(app);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no server port");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  try {
    for (const t of created.authTokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    // signed_cert_certificates cascades on orders delete (FK onDelete: cascade).
    for (const id of created.orders) await exec(sql`DELETE FROM orders WHERE id = ${id}`);
    for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    for (const id of created.customers) await exec(sql`DELETE FROM customer_users WHERE id = ${id}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
});

async function seedCustomer(opts: { realName?: string | null } = {}): Promise<string> {
  const id = randomUUID();
  const uniq = id.slice(0, 8);
  await exec(sql`
    INSERT INTO customer_users (id, username, email, display_name, real_name)
    VALUES (${id}, ${"t1480_" + uniq}, ${"t1480_" + uniq + "@example.test"},
            ${"t1480 Display"}, ${opts.realName ?? null})
  `);
  created.customers.add(id);
  return id;
}

async function seedCustomerToken(customerId: string): Promise<string> {
  const token = "t1480_tok_" + randomUUID();
  await exec(sql`
    INSERT INTO auth_tokens (token, customer_user_id, kind)
    VALUES (${token}, ${customerId}, ${"customer"})
  `);
  created.authTokens.add(token);
  return token;
}

async function seedAlbum(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${id}, ${"t1480 album"}, ${"t1480 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

async function seedOrder(opts: {
  customerId: string;
  albumId: string;
  status: string;
  goodDeedNumber: number | null;
}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO orders (id, customer_id, album_id, total_cents, status, good_deed_number)
    VALUES (${id}, ${opts.customerId}, ${opts.albumId}, ${3500}, ${opts.status}, ${opts.goodDeedNumber})
  `);
  created.orders.add(id);
  return id;
}

async function seedCertRow(opts: { orderId: string; confirmedName: string }): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO signed_cert_certificates
      (id, order_id, short_id, name_status, confirmed_identity_kind, confirmed_name, paper_size)
    VALUES (${id}, ${opts.orderId}, ${"t1480" + opts.orderId.slice(0, 8)},
            ${"printed"}, ${"display"}, ${opts.confirmedName}, ${"letter"})
  `);
  return id;
}

function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function getDigitalName(orderId: string, token: string | null) {
  return fetch(`${baseUrl}/api/orders/${orderId}/cert/digital-name`, {
    headers: authHeaders(token),
  });
}

function postDigitalName(orderId: string, token: string | null, body: unknown) {
  return fetch(`${baseUrl}/api/orders/${orderId}/cert/digital-name`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

// ─── GET — ownership + gating ───────────────────────────────────────

test("GET: unauthenticated request is rejected (401)", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: 10 });

  const res = await getDigitalName(orderId, null);
  assert.equal(res.status, 401, "no Bearer token must 401");
});

test("GET: a non-owner cannot read another fan's cert name (404)", async () => {
  const ownerId = await seedCustomer();
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId: ownerId, albumId, status: "paid", goodDeedNumber: 11 });

  const otherId = await seedCustomer();
  const otherToken = await seedCustomerToken(otherId);

  const res = await getDigitalName(orderId, otherToken);
  assert.equal(res.status, 404, "a non-owner must 404, not leak the order");
});

test("GET: a non-finalized order 404s even with a GoodDeed number", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "pending", goodDeedNumber: 12 });

  const res = await getDigitalName(orderId, token);
  assert.equal(res.status, 404, "non-finalized status must 404");
});

test("GET: an order without a GoodDeed number 404s", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: null });

  const res = await getDigitalName(orderId, token);
  assert.equal(res.status, 404, "no GoodDeed number → nothing to certify → 404");
});

test("GET: digital order is editable and falls back to realName as the default", async () => {
  const customerId = await seedCustomer({ realName: "Reece Allman" });
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: 13 });

  const res = await getDigitalName(orderId, token);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.editable, true, "no cert row → editable");
  assert.equal(body.confirmed, false, "nothing confirmed yet");
  assert.equal(body.defaultName, "Reece Allman", "realName wins the synthesized default");
  assert.equal(body.currentName, "Reece Allman", "currentName falls back to the default");
});

test("GET: a real signed-cert row makes the name non-editable", async () => {
  const customerId = await seedCustomer({ realName: "Owner Person" });
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "complete", goodDeedNumber: 14 });
  await seedCertRow({ orderId, confirmedName: "From The Print Queue" });

  const res = await getDigitalName(orderId, token);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.editable, false, "a real cert row is owned by the print-queue flow, not the editor");
});

// ─── POST — ownership + gating ──────────────────────────────────────

test("POST: unauthenticated request is rejected (401)", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: 20 });

  const res = await postDigitalName(orderId, null, { name: "Anything" });
  assert.equal(res.status, 401);
});

test("POST: a non-owner cannot write another fan's cert name (404)", async () => {
  const ownerId = await seedCustomer();
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId: ownerId, albumId, status: "paid", goodDeedNumber: 21 });

  const otherId = await seedCustomer();
  const otherToken = await seedCustomerToken(otherId);

  const res = await postDigitalName(orderId, otherToken, { name: "Hijack" });
  assert.equal(res.status, 404, "a non-owner must 404, not mutate the order");

  // Prove nothing was written.
  const [row] = (await exec(
    sql`SELECT cert_confirmed_name FROM orders WHERE id = ${orderId}`,
  )).rows as Array<{ cert_confirmed_name: string | null }>;
  assert.equal(row.cert_confirmed_name, null, "the order's name must be untouched");
});

test("POST: a non-finalized order 404s", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "pending", goodDeedNumber: 22 });

  const res = await postDigitalName(orderId, token, { name: "Too Early" });
  assert.equal(res.status, 404);
});

test("POST: an order without a GoodDeed number 404s", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: null });

  const res = await postDigitalName(orderId, token, { name: "No Number" });
  assert.equal(res.status, 404);
});

test("POST: a real signed-cert row refuses the edit (409)", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: 23 });
  await seedCertRow({ orderId, confirmedName: "Physical Copy Name" });

  const res = await postDigitalName(orderId, token, { name: "Try To Override" });
  assert.equal(res.status, 409, "physical signed-cert copies are managed elsewhere");

  // The real cert row's name must be untouched (no pollution of the queue).
  const [row] = (await exec(
    sql`SELECT cert_confirmed_name FROM orders WHERE id = ${orderId}`,
  )).rows as Array<{ cert_confirmed_name: string | null }>;
  assert.equal(row.cert_confirmed_name, null, "the 409 must not write the per-order field");
});

// ─── POST — validation ──────────────────────────────────────────────

test("POST: an empty / whitespace-only name is rejected (400)", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: 30 });

  assert.equal((await postDigitalName(orderId, token, { name: "" })).status, 400);
  assert.equal((await postDigitalName(orderId, token, { name: "    " })).status, 400, "whitespace trims to empty");
  assert.equal((await postDigitalName(orderId, token, {})).status, 400, "missing name field");
});

test("POST: a name longer than 80 chars is rejected, 80 is accepted", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: 31 });

  assert.equal((await postDigitalName(orderId, token, { name: "a".repeat(81) })).status, 400, "81 chars is too long");
  assert.equal((await postDigitalName(orderId, token, { name: "a".repeat(80) })).status, 200, "exactly 80 is allowed");
});

test("POST: the name is trimmed, persisted, and read back via GET", async () => {
  const customerId = await seedCustomer({ realName: "Default From Profile" });
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: 32 });

  const postRes = await postDigitalName(orderId, token, { name: "   Padded Recipient   " });
  assert.equal(postRes.status, 200);
  const postBody = await postRes.json();
  assert.equal(postBody.ok, true);
  assert.equal(postBody.confirmedName, "Padded Recipient", "POST trims surrounding whitespace");

  // Read back through GET — the confirmed name now wins over the default.
  const getRes = await getDigitalName(orderId, token);
  const getBody = await getRes.json();
  assert.equal(getBody.confirmed, true, "GET reports the name is now confirmed");
  assert.equal(getBody.currentName, "Padded Recipient", "GET returns the persisted confirmed name");
  assert.equal(getBody.defaultName, "Default From Profile", "defaultName still reflects the synthesized fallback");
  assert.equal(getBody.editable, true, "still editable — no real cert row was minted");

  // The per-order field is the only thing written — no cert row was minted.
  const [certCount] = (await exec(
    sql`SELECT count(*)::int AS n FROM signed_cert_certificates WHERE order_id = ${orderId}`,
  )).rows as Array<{ n: number }>;
  assert.equal(certCount.n, 0, "the editor must NOT mint a signed_cert_certificates row");
});

// ─── Cert PDF Path 2 prefers the confirmed digital name ─────────────
// The synthesized cert filename slug is derived from the resolved
// recipient name (certFilename → ctx.cert.confirmedName), so the
// Content-Disposition header is a faithful witness of which name Path 2
// chose without parsing pdfkit's binary output. With a confirmed name
// set, the filename must carry it — NOT the realName→displayName→username
// synthesis.

async function certPdfDisposition(orderId: string, token: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/orders/${orderId}/cert/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200, "expected a 200 PDF response");
  assert.equal(res.headers.get("content-type"), "application/pdf");
  // Drain the body so the socket frees up.
  await res.arrayBuffer();
  return res.headers.get("content-disposition") ?? "";
}

test("cert PDF Path 2 prefers certConfirmedName over the synthesized realName", async () => {
  const customerId = await seedCustomer({ realName: "Synthesized Realname" });
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: 40 });

  // Before confirming: the filename slug reflects the synthesized realName.
  const before = await certPdfDisposition(orderId, token);
  assert.ok(before.includes("Synthesized-Realname"), `expected synthesized name in filename, got: ${before}`);

  // Confirm a distinct digital name.
  const postRes = await postDigitalName(orderId, token, { name: "Chosen Digital Name" });
  assert.equal(postRes.status, 200);

  // After confirming: Path 2 must prefer the confirmed name in the slug.
  const afterDisp = await certPdfDisposition(orderId, token);
  assert.ok(afterDisp.includes("Chosen-Digital-Name"), `expected confirmed name in filename, got: ${afterDisp}`);
  assert.ok(
    !afterDisp.includes("Synthesized-Realname"),
    `the synthesized realName must no longer appear, got: ${afterDisp}`,
  );
});
