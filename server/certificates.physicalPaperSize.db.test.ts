// Task #1633 — Coverage for the PHYSICAL signed-cert paper-size editor
// (`POST /api/orders/:orderId/cert/paper-size`, server/certificates.ts).
//
// Digital-only owners change paper size via /cert/digital-name; owners of
// a PHYSICAL signed cert (who DO have a signed_cert_certificates row) get
// the matching control via this endpoint. The rules are load-bearing — a
// regression would either:
//   • expose / mutate another fan's cert (ownership gate),
//   • let the paper size change after the cert is locked into a print run
//     (the stock is committed at the printer), or
//   • silently disturb the locked recipient NAME, which must stay frozen.
//
// We register the real cert routes onto a throwaway Express app, listen on
// an ephemeral port, and drive the endpoint over HTTP with a real customer
// Bearer token against a real Postgres (DATABASE_URL).
//
//   npx tsx --test server/certificates.physicalPaperSize.db.test.ts
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
    VALUES (${id}, ${"t1633_" + uniq}, ${"t1633_" + uniq + "@example.test"}, ${"t1633 Display"})
  `);
  created.customers.add(id);
  return id;
}

async function seedCustomerToken(customerId: string): Promise<string> {
  const token = "t1633_tok_" + randomUUID();
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
    VALUES (${id}, ${"t1633 album"}, ${"t1633 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

async function seedOrder(opts: { customerId: string; albumId: string }): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO orders (id, customer_id, album_id, total_cents, status, good_deed_number)
    VALUES (${id}, ${opts.customerId}, ${opts.albumId}, ${3500}, ${"paid"}, ${randInt()})
  `);
  created.orders.add(id);
  return id;
}

let counter = 5000;
function randInt() {
  return counter++;
}

async function seedCertRow(opts: {
  orderId: string;
  nameStatus: string;
  paperSize: string;
  confirmedName?: string;
}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO signed_cert_certificates
      (id, order_id, short_id, name_status, confirmed_identity_kind, confirmed_name, paper_size, paper_size_overridden)
    VALUES (${id}, ${opts.orderId}, ${"t1633" + opts.orderId.slice(0, 8)},
            ${opts.nameStatus}, ${"display"}, ${opts.confirmedName ?? "Locked Recipient"},
            ${opts.paperSize}, ${false})
  `);
  return id;
}

function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function postPaperSize(orderId: string, token: string | null, body: unknown) {
  return fetch(`${baseUrl}/api/orders/${orderId}/cert/paper-size`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

async function readCert(orderId: string) {
  const [row] = (await exec(
    sql`SELECT name_status, paper_size, paper_size_overridden, confirmed_name
        FROM signed_cert_certificates WHERE order_id = ${orderId}`,
  )).rows as Array<{
    name_status: string;
    paper_size: string;
    paper_size_overridden: boolean;
    confirmed_name: string | null;
  }>;
  return row;
}

// ─── ownership + auth ───────────────────────────────────────────────

test("unauthenticated request is rejected (401)", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId });
  await seedCertRow({ orderId, nameStatus: "confirmed", paperSize: "letter" });

  const res = await postPaperSize(orderId, null, { paperSize: "a4" });
  assert.equal(res.status, 401);
});

test("a non-owner cannot change another fan's cert paper size (404)", async () => {
  const ownerId = await seedCustomer();
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId: ownerId, albumId });
  await seedCertRow({ orderId, nameStatus: "confirmed", paperSize: "letter" });

  const otherId = await seedCustomer();
  const otherToken = await seedCustomerToken(otherId);

  const res = await postPaperSize(orderId, otherToken, { paperSize: "a4" });
  assert.equal(res.status, 404, "a non-owner must 404, not mutate the cert");

  const row = await readCert(orderId);
  assert.equal(row.paper_size, "letter", "paper size must be untouched");
});

test("an order with no signed-cert row 404s (digital path owns those)", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId });

  const res = await postPaperSize(orderId, token, { paperSize: "a4" });
  assert.equal(res.status, 404);
});

// ─── validation ─────────────────────────────────────────────────────

test("an invalid paperSize is rejected (400)", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId });
  await seedCertRow({ orderId, nameStatus: "confirmed", paperSize: "letter" });

  assert.equal((await postPaperSize(orderId, token, { paperSize: "legal" })).status, 400);
  assert.equal((await postPaperSize(orderId, token, {})).status, 400);
});

// ─── the happy path + name-lock invariant ───────────────────────────

test("owner changes paper size on a confirmed cert; the locked name is untouched", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId });
  await seedCertRow({
    orderId,
    nameStatus: "confirmed",
    paperSize: "letter",
    confirmedName: "Frozen Name",
  });

  const res = await postPaperSize(orderId, token, { paperSize: "a4" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.paperSize, "a4");

  const row = await readCert(orderId);
  assert.equal(row.paper_size, "a4", "paper size is persisted");
  assert.equal(row.paper_size_overridden, true, "an explicit pick marks the override flag");
  assert.equal(row.name_status, "confirmed", "the name lock status must NOT move");
  assert.equal(row.confirmed_name, "Frozen Name", "the locked recipient name must stay frozen");
});

test("owner can also change paper size on an awaiting (name-unconfirmed) cert", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId });
  await seedCertRow({ orderId, nameStatus: "awaiting", paperSize: "a4" });

  const res = await postPaperSize(orderId, token, { paperSize: "letter" });
  assert.equal(res.status, 200);
  const row = await readCert(orderId);
  assert.equal(row.paper_size, "letter");
  assert.equal(row.name_status, "awaiting", "changing paper must not confirm the name");
});

// ─── print-run lock ─────────────────────────────────────────────────

test("a cert locked_for_print refuses the change (409)", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId });
  await seedCertRow({ orderId, nameStatus: "locked_for_print", paperSize: "letter" });

  const res = await postPaperSize(orderId, token, { paperSize: "a4" });
  assert.equal(res.status, 409, "stock is committed once locked for print");
  const row = await readCert(orderId);
  assert.equal(row.paper_size, "letter", "paper size must be untouched after a 409");
});

test("a printed cert refuses the change (409)", async () => {
  const customerId = await seedCustomer();
  const token = await seedCustomerToken(customerId);
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId });
  await seedCertRow({ orderId, nameStatus: "printed", paperSize: "a4" });

  const res = await postPaperSize(orderId, token, { paperSize: "letter" });
  assert.equal(res.status, 409);
  const row = await readCert(orderId);
  assert.equal(row.paper_size, "a4", "paper size must be untouched after a 409");
});
