// Task #2063 — Coverage for the per-copy gift backend exposed in the buyer
// UI (server/gifts.ts): the new
//   POST   /api/orders/:id/copies/:copyId/gift          (create)
//   PATCH  /api/orders/:id/copies/:copyId/gift          (change recipient)
//   POST   /api/orders/:id/copies/:copyId/gift/resend   (rotate + resend)
//   POST   /api/orders/:id/copies/:copyId/gift/revoke   (buyer revoke)
// plus the shared serializeGiftForBuyer() projection the Welcome + Orders
// surfaces read.
//
// These rules are load-bearing — a regression would either:
//   • expose/let another fan gift a copy they don't own (ownership gate),
//   • let whole-order and per-copy gifting coexist (mutually-exclusive 409s),
//   • re-gift an already-gifted/claimed copy (duplicate 409 / claimed 400),
//   • let a buyer revoke after physical fulfillment started (locked 400), or
//   • leak the claim token to a non-buyer viewer (serializer projection).
//
// We register the real gift routes onto a throwaway Express app, listen on
// an ephemeral port, and drive the endpoints over HTTP with a real customer
// Bearer token against a real Postgres (DATABASE_URL). Every seeded row is
// tracked and torn down in `after`.
//
//   npx tsx --test server/gifts.perCopy.db.test.ts

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import express from "express";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { registerGiftRoutes, serializeGiftForBuyer } from "./gifts";

const exec = (q: any) => db.execute(q);
const P = "t2063_";

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
  registerGiftRoutes(app);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no server port");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  try {
    for (const t of created.authTokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    // gifts + order_copies cascade on orders delete (FK onDelete: cascade).
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
    VALUES (${id}, ${P + uniq}, ${P + uniq + "@example.test"}, ${"t2063 Display"})
  `);
  created.customers.add(id);
  return id;
}

async function seedToken(customerId: string): Promise<string> {
  const token = P + "tok_" + randomUUID();
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
    VALUES (${id}, ${"t2063 album"}, ${"t2063 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

// A paid, in-window, multi-copy order with two copies. Returns the order id
// and its two copy ids.
async function seedMultiCopyOrder(opts: {
  customerId: string;
  albumId: string;
  fulfillmentStatus?: string | null;
}): Promise<{ orderId: string; copyIds: [string, string] }> {
  const orderId = randomUUID();
  await exec(sql`
    INSERT INTO orders (id, customer_id, album_id, total_cents, status, fulfillment_status)
    VALUES (${orderId}, ${opts.customerId}, ${opts.albumId}, ${7000}, ${"paid"},
            ${opts.fulfillmentStatus ?? null})
  `);
  created.orders.add(orderId);
  const copyIds: string[] = [];
  for (let i = 1; i <= 2; i++) {
    const cid = randomUUID();
    await exec(sql`
      INSERT INTO order_copies (id, order_id, album_id, position, format, format_price_cents)
      VALUES (${cid}, ${orderId}, ${opts.albumId}, ${i}, ${"vinyl"}, ${3500})
    `);
    copyIds.push(cid);
  }
  return { orderId, copyIds: [copyIds[0], copyIds[1]] };
}

function headers(token: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

const RECIPIENT = { firstName: "Pat", lastName: "Recipient", email: "pat@example.test" };

function createCopyGift(orderId: string, copyId: string, token: string | null, body: unknown = RECIPIENT) {
  return fetch(`${baseUrl}/api/orders/${orderId}/copies/${copyId}/gift`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body),
  });
}
function createWholeGift(orderId: string, token: string | null, body: unknown = RECIPIENT) {
  return fetch(`${baseUrl}/api/orders/${orderId}/gift`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body),
  });
}
function resendCopyGift(orderId: string, copyId: string, token: string | null) {
  return fetch(`${baseUrl}/api/orders/${orderId}/copies/${copyId}/gift/resend`, {
    method: "POST",
    headers: headers(token),
  });
}
function patchCopyGift(orderId: string, copyId: string, token: string | null, body: unknown) {
  return fetch(`${baseUrl}/api/orders/${orderId}/copies/${copyId}/gift`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify(body),
  });
}
function revokeCopyGift(orderId: string, copyId: string, token: string | null) {
  return fetch(`${baseUrl}/api/orders/${orderId}/copies/${copyId}/gift/revoke`, {
    method: "POST",
    headers: headers(token),
  });
}

// ─── serializeGiftForBuyer — pure projection contract ────────────────────

test("serializer: buyer sees claim token + per-copy + revoke/revert flags", () => {
  const now = new Date();
  const g: any = {
    id: "g1", copyId: "c1", buyerUserId: "u1",
    recipientFirstName: "Pat", recipientLastName: "R",
    recipientEmail: "p@e.test", recipientPhone: null,
    claimToken: "secret-token", claimedAt: null,
    buyerRevokedAt: now, revertedAt: null,
    deliverOn: null, deliveredAt: null, expiresAt: now, createdAt: now,
    resendCount: 0,
  };
  const out = serializeGiftForBuyer(g, "u1");
  assert.equal(out.isBuyer, true);
  assert.equal(out.copyId, "c1", "per-copy id surfaced");
  assert.equal(out.claimToken, "secret-token", "buyer sees the claim token");
  assert.equal(out.revokedAt, now, "revokedAt maps to buyerRevokedAt");
  assert.equal(out.reverted, false, "reverted is !!revertedAt");
});

test("serializer: non-buyer viewer never receives the claim token", () => {
  const g: any = {
    id: "g1", copyId: "c1", buyerUserId: "u1",
    recipientFirstName: "Pat", recipientLastName: "R",
    recipientEmail: null, recipientPhone: null,
    claimToken: "secret-token", claimedAt: null,
    buyerRevokedAt: null, revertedAt: new Date(),
    deliverOn: null, deliveredAt: null, expiresAt: new Date(), createdAt: new Date(),
    resendCount: 0,
  };
  const out = serializeGiftForBuyer(g, "someone-else");
  assert.equal(out.isBuyer, false);
  assert.equal(out.claimToken, null, "claim token withheld from non-buyer");
  assert.equal(out.reverted, true, "reverted reflects revertedAt");
});

// ─── create — auth, ownership, happy path ────────────────────────────────

test("create: unauthenticated request is rejected (401)", async () => {
  const owner = await seedCustomer();
  const album = await seedAlbum();
  const { orderId, copyIds } = await seedMultiCopyOrder({ customerId: owner, albumId: album });
  const res = await createCopyGift(orderId, copyIds[0], null);
  assert.equal(res.status, 401);
});

test("create: a non-owner can't gift someone else's copy (403)", async () => {
  const owner = await seedCustomer();
  const album = await seedAlbum();
  const { orderId, copyIds } = await seedMultiCopyOrder({ customerId: owner, albumId: album });
  const strangerToken = await seedToken(await seedCustomer());
  const res = await createCopyGift(orderId, copyIds[0], strangerToken);
  assert.equal(res.status, 403);
});

test("create: a copy not on the order is rejected (404)", async () => {
  const owner = await seedCustomer();
  const token = await seedToken(owner);
  const album = await seedAlbum();
  const { orderId } = await seedMultiCopyOrder({ customerId: owner, albumId: album });
  const res = await createCopyGift(orderId, randomUUID(), token);
  assert.equal(res.status, 404);
});

test("create: owner gifts one copy → 200 with copyId, claim token, share url", async () => {
  const owner = await seedCustomer();
  const token = await seedToken(owner);
  const album = await seedAlbum();
  const { orderId, copyIds } = await seedMultiCopyOrder({ customerId: owner, albumId: album });
  const res = await createCopyGift(orderId, copyIds[0], token);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.gift.copyId, copyIds[0], "gift is bound to the chosen copy");
  assert.ok(body.gift.claimToken, "a claim token is minted");
  assert.ok(typeof body.shareUrl === "string" && body.shareUrl.includes(body.gift.claimToken));
  // The OTHER copy stays ungifted/owned by the buyer.
  const [other] = (await exec(
    sql`SELECT gift_id FROM order_copies WHERE id = ${copyIds[1]}`,
  )).rows as any[];
  assert.equal(other.gift_id, null, "the kept copy is untouched");
});

// ─── mutual exclusivity ──────────────────────────────────────────────────

test("guard: can't re-gift a copy that's already gifted (409)", async () => {
  const owner = await seedCustomer();
  const token = await seedToken(owner);
  const album = await seedAlbum();
  const { orderId, copyIds } = await seedMultiCopyOrder({ customerId: owner, albumId: album });
  assert.equal((await createCopyGift(orderId, copyIds[0], token)).status, 200);
  const dup = await createCopyGift(orderId, copyIds[0], token);
  assert.equal(dup.status, 409);
});

test("guard: per-copy gift blocks a later whole-order gift (409)", async () => {
  const owner = await seedCustomer();
  const token = await seedToken(owner);
  const album = await seedAlbum();
  const { orderId, copyIds } = await seedMultiCopyOrder({ customerId: owner, albumId: album });
  assert.equal((await createCopyGift(orderId, copyIds[0], token)).status, 200);
  const whole = await createWholeGift(orderId, token);
  assert.equal(whole.status, 409, "can't whole-order-gift once a copy is gifted");
});

test("guard: whole-order gift blocks a later per-copy gift (409)", async () => {
  const owner = await seedCustomer();
  const token = await seedToken(owner);
  const album = await seedAlbum();
  const { orderId, copyIds } = await seedMultiCopyOrder({ customerId: owner, albumId: album });
  assert.equal((await createWholeGift(orderId, token)).status, 200);
  const copy = await createCopyGift(orderId, copyIds[0], token);
  assert.equal(copy.status, 409, "can't per-copy-gift once the order is gifted whole");
});

test("guard: concurrent whole-order + per-copy create — exactly one wins (race)", async () => {
  const owner = await seedCustomer();
  const token = await seedToken(owner);
  const album = await seedAlbum();
  const { orderId, copyIds } = await seedMultiCopyOrder({ customerId: owner, albumId: album });
  // Fire both creates at once. The SELECT ... FOR UPDATE row lock in
  // createGiftRecord serializes them on the order row — the loser sees the
  // winner's committed gift and returns 409. (The partial unique indexes
  // alone can't enforce this: a whole-order row and a per-copy row don't
  // collide on either index.)
  const [whole, copy] = await Promise.all([
    createWholeGift(orderId, token),
    createCopyGift(orderId, copyIds[0], token),
  ]);
  const statuses = [whole.status, copy.status].sort();
  assert.deepEqual(statuses, [200, 409], "exactly one create succeeds, the other 409s");
  // And the DB only ever holds one gift for the order — never both kinds.
  const rows = (await exec(sql`SELECT copy_id FROM gifts WHERE order_id = ${orderId}`)).rows as any[];
  assert.equal(rows.length, 1, "only one gift row persisted for the order");
});

// ─── manage — resend, change recipient, revoke ───────────────────────────

test("manage: resend rotates the claim token and bumps resendCount", async () => {
  const owner = await seedCustomer();
  const token = await seedToken(owner);
  const album = await seedAlbum();
  const { orderId, copyIds } = await seedMultiCopyOrder({ customerId: owner, albumId: album });
  const first = await (await createCopyGift(orderId, copyIds[0], token)).json();
  const res = await resendCopyGift(orderId, copyIds[0], token);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.notEqual(body.gift.claimToken, first.gift.claimToken, "token rotated");
  assert.equal(body.gift.resendCount, first.gift.resendCount + 1);
});

test("manage: change recipient updates the stored name (200)", async () => {
  const owner = await seedCustomer();
  const token = await seedToken(owner);
  const album = await seedAlbum();
  const { orderId, copyIds } = await seedMultiCopyOrder({ customerId: owner, albumId: album });
  await createCopyGift(orderId, copyIds[0], token);
  const res = await patchCopyGift(orderId, copyIds[0], token, {
    firstName: "New", lastName: "Person", email: "new@example.test",
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.gift.recipientFirstName, "New");
  assert.equal(body.gift.recipientLastName, "Person");
});

test("manage: revoke before claim/fulfillment stamps buyerRevokedAt (200)", async () => {
  const owner = await seedCustomer();
  const token = await seedToken(owner);
  const album = await seedAlbum();
  const { orderId, copyIds } = await seedMultiCopyOrder({ customerId: owner, albumId: album });
  await createCopyGift(orderId, copyIds[0], token);
  const res = await revokeCopyGift(orderId, copyIds[0], token);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.gift.buyerRevokedAt, "revoke stamps buyerRevokedAt");
  // Revoke is terminal for that copy — it mirrors the legacy whole-order
  // contract (order.giftId persists after revoke). The copy returns to the
  // buyer ("cancelled — stays with you"); the slot is NOT re-opened, so a
  // second gift on the same copy is refused (409). The UI surfaces this as a
  // terminal "cancelled" state with no re-gift affordance.
  const reGift = await createCopyGift(orderId, copyIds[0], token);
  assert.equal(reGift.status, 409, "a revoked copy can't be re-gifted");
});

test("manage: can't revoke once physical fulfillment has started (400)", async () => {
  const owner = await seedCustomer();
  const token = await seedToken(owner);
  const album = await seedAlbum();
  const { orderId, copyIds } = await seedMultiCopyOrder({
    customerId: owner, albumId: album, fulfillmentStatus: "shipped",
  });
  await createCopyGift(orderId, copyIds[0], token);
  const res = await revokeCopyGift(orderId, copyIds[0], token);
  assert.equal(res.status, 400, "shipped orders are locked from revoke");
});

test("manage: a claimed copy can't be revoked or re-targeted (400)", async () => {
  const owner = await seedCustomer();
  const token = await seedToken(owner);
  const album = await seedAlbum();
  const { orderId, copyIds } = await seedMultiCopyOrder({ customerId: owner, albumId: album });
  const made = await (await createCopyGift(orderId, copyIds[0], token)).json();
  await exec(sql`UPDATE gifts SET claimed_at = now() WHERE id = ${made.gift.id}`);
  assert.equal((await revokeCopyGift(orderId, copyIds[0], token)).status, 400);
  assert.equal(
    (await patchCopyGift(orderId, copyIds[0], token, RECIPIENT)).status,
    400,
  );
});
