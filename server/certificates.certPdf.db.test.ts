// Task #1466 — Coverage for the fan certificate download endpoint
// `GET /api/orders/:orderId/cert/pdf` (server/certificates.ts).
//
// The endpoint has two rendering paths and a regression in either one
// silently breaks every fan's GoodDeed cert download (exactly the bug
// fixed in Task #1458):
//
//   1. Synthesis path — a finalized, owned order with a GoodDeed number
//      but NO `signed_cert_certificates` row. Plain digital GoodDeed
//      orders + legacy imports never minted a row, so the cert is
//      synthesized in-memory from the order/album/customer.
//   2. Real-row path — a `signed_cert_certificates` row exists; the PDF
//      renders from the row (confirmed name, paper size, etc.).
//
// We register the real cert routes onto a throwaway Express app, listen
// on an ephemeral port, and drive the endpoint over HTTP with a real
// customer Bearer token — so the auth gate, the row-vs-synthesis branch,
// the finalized-status / GoodDeed-number guards, and the actual pdfkit
// render all run end-to-end against a real Postgres (DATABASE_URL).
//
// The album artwork is left empty so the PDF renderer never makes a
// network fetch for cover art — the render is fully self-contained.
//
//   npx tsx --test server/certificates.certPdf.db.test.ts
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

async function seedCustomer(): Promise<string> {
  const id = randomUUID();
  const uniq = id.slice(0, 8);
  await exec(sql`
    INSERT INTO customer_users (id, username, email, display_name)
    VALUES (${id}, ${"t1466_" + uniq}, ${"t1466_" + uniq + "@example.test"}, ${"t1466 Fan"})
  `);
  created.customers.add(id);
  return id;
}

async function seedCustomerToken(customerId: string): Promise<string> {
  const token = "t1466_tok_" + randomUUID();
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
    VALUES (${id}, ${"t1466 album"}, ${"t1466 artist"}, ${""})
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

async function seedCertRow(opts: {
  orderId: string;
  confirmedName: string;
}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO signed_cert_certificates
      (id, order_id, short_id, name_status, confirmed_identity_kind, confirmed_name, paper_size)
    VALUES (${id}, ${opts.orderId}, ${"t1466" + opts.orderId.slice(0, 8)},
            ${"printed"}, ${"display"}, ${opts.confirmedName}, ${"letter"})
  `);
  return id;
}

async function fetchCertPdf(orderId: string, token: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}/api/orders/${orderId}/cert/pdf`, { headers });
}

async function assertValidPdf(res: Response) {
  assert.equal(res.status, 200, "expected a 200 PDF response");
  assert.equal(
    res.headers.get("content-type"),
    "application/pdf",
    "Content-Type must be application/pdf",
  );
  const body = Buffer.from(await res.arrayBuffer());
  assert.ok(body.length > 0, "PDF body must be non-empty");
  assert.equal(body.subarray(0, 5).toString("latin1"), "%PDF-", "body must start with the PDF magic header");
}

test("synthesis path: finalized owned order w/ GoodDeed # and no cert row renders a PDF", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: 142 });

  const res = await fetchCertPdf(orderId, token);
  await assertValidPdf(res);
});

test("real-row path: an existing signed_cert_certificates row renders a PDF", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  // No GoodDeed number on the order — the real-row path must NOT gate on
  // it (legacy imports land here), so this also proves the row path is
  // independent of the synthesis-path finalized/number guards.
  const orderId = await seedOrder({ customerId, albumId, status: "complete", goodDeedNumber: null });
  await seedCertRow({ orderId, confirmedName: "Recipient From Row" });

  const res = await fetchCertPdf(orderId, token);
  await assertValidPdf(res);
});

test("unauthenticated request is rejected (401)", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: 7 });

  const res = await fetchCertPdf(orderId, null);
  assert.equal(res.status, 401, "no Bearer token must 401");
});

test("a non-owner cannot download another fan's certificate (404)", async () => {
  const ownerId = await seedCustomer();
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId: ownerId, albumId, status: "paid", goodDeedNumber: 8 });

  // A different, valid customer's token.
  const otherId = await seedCustomer();
  const otherToken = await seedCustomerToken(otherId);

  const res = await fetchCertPdf(orderId, otherToken);
  assert.equal(res.status, 404, "a non-owner must 404, not leak the cert");
});

test("a non-owner is blocked even when a real cert row exists (404)", async () => {
  const ownerId = await seedCustomer();
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId: ownerId, albumId, status: "paid", goodDeedNumber: 9 });
  await seedCertRow({ orderId, confirmedName: "Owner Name" });

  const otherId = await seedCustomer();
  const otherToken = await seedCustomerToken(otherId);

  const res = await fetchCertPdf(orderId, otherToken);
  assert.equal(res.status, 404, "real-row path must also 404 for a non-owner");
});

test("an order without a GoodDeed number 404s on the synthesis path", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: null });

  const res = await fetchCertPdf(orderId, token);
  assert.equal(res.status, 404, "no GoodDeed number → nothing to certify → 404");
});

test("a non-finalized order 404s even with a GoodDeed number", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "pending", goodDeedNumber: 11 });

  const res = await fetchCertPdf(orderId, token);
  assert.equal(res.status, 404, "non-finalized status must 404");
});
