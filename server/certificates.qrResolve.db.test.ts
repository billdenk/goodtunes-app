// Task #1883 — Coverage for the public GoodDeed provenance lookup
// `GET /api/g/:shortId` (server/certificates.ts).
//
// A GoodDeed cert's QR encodes `<origin>/g/<shortId>`. There are two
// shapes of shortId and the resolver must handle BOTH or the scanned QR
// dead-ends on "Certificate not found" (the exact bug this task fixes):
//
//   1. Real-row id — a `signed_cert_certificates` row stores a random
//      shortId (physical signed-cert add-on). Looked up directly.
//   2. Synthetic / preview id — digital-only GoodDeed orders and legacy
//      gogoods imports never mint a cert row; their PDF synthesizes the
//      cert in-memory with `synthetic<orderId>` / `preview<orderId>`.
//      The resolver strips the prefix and maps it back to the owned,
//      finalized order (FULL id = exact; legacy 8-char = prefix match).
//
// We register the real cert routes onto a throwaway Express app, listen
// on an ephemeral port, and drive the endpoint over HTTP against a real
// Postgres (DATABASE_URL). The payload must never leak PII — only album,
// GoodDeed #, recipient name, and issued date.
//
//   npx tsx --test server/certificates.qrResolve.db.test.ts
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
    // signed_cert_certificates cascades on orders delete (FK onDelete: cascade).
    for (const id of created.orders) await exec(sql`DELETE FROM orders WHERE id = ${id}`);
    for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    for (const id of created.customers) await exec(sql`DELETE FROM customer_users WHERE id = ${id}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
});

async function seedCustomer(opts?: {
  realName?: string | null;
  displayName?: string | null;
}): Promise<string> {
  const id = randomUUID();
  const uniq = id.slice(0, 8);
  await exec(sql`
    INSERT INTO customer_users (id, username, email, display_name, real_name)
    VALUES (${id}, ${"t1883_" + uniq}, ${"t1883_" + uniq + "@example.test"},
            ${opts?.displayName ?? "t1883 Display"}, ${opts?.realName ?? null})
  `);
  created.customers.add(id);
  return id;
}

async function seedAlbum(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${id}, ${"t1883 album"}, ${"t1883 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

async function seedOrder(opts: {
  customerId: string;
  albumId: string;
  status: string;
  goodDeedNumber: number | null;
  certConfirmedName?: string | null;
}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO orders (id, customer_id, album_id, total_cents, status, good_deed_number, cert_confirmed_name)
    VALUES (${id}, ${opts.customerId}, ${opts.albumId}, ${3500}, ${opts.status},
            ${opts.goodDeedNumber}, ${opts.certConfirmedName ?? null})
  `);
  created.orders.add(id);
  return id;
}

async function seedCertRow(opts: { orderId: string; confirmedName: string }): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO signed_cert_certificates
      (id, order_id, short_id, name_status, confirmed_identity_kind, confirmed_name, paper_size)
    VALUES (${id}, ${opts.orderId}, ${"t1883" + opts.orderId.slice(0, 8)},
            ${"printed"}, ${"display"}, ${opts.confirmedName}, ${"letter"})
  `);
  return id;
}

async function getG(shortId: string) {
  return fetch(`${baseUrl}/api/g/${shortId}`);
}

test("real-row id resolves to the row's confirmed name + order GoodDeed #", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "complete", goodDeedNumber: 501 });
  await seedCertRow({ orderId, confirmedName: "Recipient From Row" });

  const res = await getG("t1883" + orderId.slice(0, 8));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.goodDeedNumber, 501);
  assert.equal(body.recipientName, "Recipient From Row");
  assert.equal(body.albumTitle, "t1883 album");
  // PII guard — no email/address fields ever cross the wire.
  assert.deepEqual(
    Object.keys(body).sort(),
    ["albumArtist", "albumArtwork", "albumTitle", "goodDeedNumber", "issuedAt", "nameStatus", "recipientName", "shortId"],
  );
});

test("synthetic<fullOrderId> resolves a finalized order with no cert row", async () => {
  const customerId = await seedCustomer({ displayName: "Synth Fan" });
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: 502 });

  const res = await getG("synthetic" + orderId);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.goodDeedNumber, 502);
  assert.equal(body.recipientName, "Synth Fan");
});

test("preview<fullOrderId> resolves the same way as synthetic", async () => {
  const customerId = await seedCustomer({ displayName: "Preview Fan" });
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: 503 });

  const res = await getG("preview" + orderId);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.goodDeedNumber, 503);
  assert.equal(body.recipientName, "Preview Fan");
});

test("legacy synthetic<8-char prefix> still resolves (already-printed QRs)", async () => {
  const customerId = await seedCustomer({ displayName: "Legacy Fan" });
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "complete", goodDeedNumber: 504 });

  const res = await getG("synthetic" + orderId.slice(0, 8));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.goodDeedNumber, 504);
});

test("certConfirmedName wins over the customer name fallback", async () => {
  const customerId = await seedCustomer({ realName: "Real Name", displayName: "Display Name" });
  const albumId = await seedAlbum();
  const orderId = await seedOrder({
    customerId,
    albumId,
    status: "paid",
    goodDeedNumber: 505,
    certConfirmedName: "Fan Confirmed Name",
  });

  const res = await getG("synthetic" + orderId);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.recipientName, "Fan Confirmed Name");
});

test("realName is preferred over displayName when no certConfirmedName", async () => {
  const customerId = await seedCustomer({ realName: "Real Name", displayName: "Display Name" });
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: 506 });

  const res = await getG("synthetic" + orderId);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.recipientName, "Real Name");
});

test("synthetic id for a non-finalized order 404s", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "pending", goodDeedNumber: 507 });

  const res = await getG("synthetic" + orderId);
  assert.equal(res.status, 404);
});

test("synthetic id for an order with no GoodDeed number 404s", async () => {
  const customerId = await seedCustomer();
  const albumId = await seedAlbum();
  const orderId = await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: null });

  const res = await getG("synthetic" + orderId);
  assert.equal(res.status, 404);
});

test("an unknown plain shortId 404s", async () => {
  const res = await getG("notarealshortid");
  assert.equal(res.status, 404);
});

test("a synthetic id pointing at no order 404s", async () => {
  const res = await getG("synthetic" + randomUUID());
  assert.equal(res.status, 404);
});

// Security regression — the id tail must be strictly validated before it
// ever reaches a SQL LIKE, or `%`/`_` wildcards would turn the resolver
// into a record-discovery hole (return a stranger's provenance payload).
test("LIKE-wildcard abuse in a synthetic id 404s (no record discovery)", async () => {
  // Seed a finalized cert so there IS something a wildcard could match.
  const customerId = await seedCustomer({ displayName: "Should Not Leak" });
  const albumId = await seedAlbum();
  await seedOrder({ customerId, albumId, status: "paid", goodDeedNumber: 599 });

  // Underscores survive URL-decoding and reach the resolver, so they
  // directly prove the regex rejects a LIKE single-char wildcard. Percent
  // probes are bounced upstream by Express's URI decoder (400) — either
  // way the invariant is the same: never a 200 with someone's payload.
  for (const probe of [
    "synthetic________", // 8 LIKE `_` wildcards — reaches handler, must be rejected
    "synthetic%%%%%%%%",
    "synthetic%",
    "preview%%%%%%%%",
  ]) {
    const res = await getG(probe);
    assert.notEqual(res.status, 200, `wildcard probe ${probe} must never resolve to a record`);
  }
});
