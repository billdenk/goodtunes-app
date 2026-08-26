// Task #3385 — Press ERP identifiers on orders + press customer profile.
// The two generic press-ERP reference numbers (press job/master # + press
// sales-order #) are operator-entered on pressing_order_requests — the
// press assigns them out-of-band in Phase 1, so blank is normal. Display
// labels are per-press (manufacturers.erp_ref_labels; MRP: "MRP #"/"SO #")
// with generic defaults. The press-scoped customer profile (category /
// pricing tier / payment terms / billing basis) is internal ops data:
// requireAdmin admits every partner bearer, so both the profile routes
// and the erp-refs PATCH must ALSO be super_admin-gated — a press must
// never read/write how we're classified in its own ERP from our side.
//
// Same harness as pressAudioSpec.routes.db.test.ts: full route tree over
// a real loopback socket; bearer tokens; seeded rows torn down in `after`.
//
//   npx tsx --test server/pressErpIdentifiers.routes.db.test.ts
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
  manufacturers: new Set<string>(),
  albums: new Set<string>(),
  orders: new Set<string>(),
  users: new Set<string>(),
  tokens: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let pressId = "";
let albumId = "";
let orderId = "";
let pressToken = ""; // manufacturer-scoped partner (must be locked out)
let adminToken = ""; // super_admin operator

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  pressId = randomUUID();
  await exec(sql`
    INSERT INTO manufacturers (id, name, erp_ref_labels)
    VALUES (${pressId}, ${"t3385 ERP Press"}, ${'{"jobNumber":"MRP #","salesOrder":"SO #"}'}::jsonb)
  `);
  created.manufacturers.add(pressId);

  albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${albumId}, ${"t3385 Album"}, ${"t3385 Artist"}, ${"/album-placeholder.svg"})
  `);
  created.albums.add(albumId);

  orderId = randomUUID();
  await exec(sql`
    INSERT INTO pressing_order_requests
      (id, album_id, status, package_snapshot, quantity, unit_cents, total_cents)
    VALUES
      (${orderId}, ${albumId}, ${"pending"},
       ${JSON.stringify({ pressId, pressName: "t3385 ERP Press" })}::jsonb,
       100, 1000, 100000)
  `);
  created.orders.add(orderId);

  const pressUserId = randomUUID();
  const ptag = pressUserId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${pressUserId}, ${"t3385p_" + ptag}, ${"x"}, ${"t3385p"},
            ${"t3385p_" + ptag + "@example.test"}, true, ${"manufacturer"}, ${pressId})
  `);
  created.users.add(pressUserId);
  pressToken = await tokenFor(pressUserId);

  const adminUserId = randomUUID();
  const atag = adminUserId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${adminUserId}, ${"t3385a_" + atag}, ${"x"}, ${"t3385a"},
            ${"t3385a_" + atag + "@example.test"}, true, ${"super_admin"})
  `);
  created.users.add(adminUserId);
  adminToken = await tokenFor(adminUserId);
});

async function tokenFor(userId: string): Promise<string> {
  const token = "t3385tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function req(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

// ─── ERP reference numbers on the pressing order ─────────────────────

test("the album pressing-order GET threads the press's own labels", async () => {
  const res = await req("GET", `/api/admin/albums/${albumId}/pressing-order`, adminToken);
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.erpLabels, { jobNumber: "MRP #", salesOrder: "SO #" });
  assert.equal(res.json.pressJobNumber, null, "blank until the press assigns one");
  assert.equal(res.json.pressSalesOrderNumber, null);
});

test("an operator sets, edits, and clears the ERP reference numbers", async () => {
  const set = await req("PATCH", `/api/admin/pressing-orders/${orderId}/erp-refs`, adminToken, {
    pressJobNumber: "  MRP-4711  ",
    pressSalesOrderNumber: "SO-2026-88",
  });
  assert.equal(set.status, 200);
  assert.equal(set.json.pressJobNumber, "MRP-4711", "values are trimmed");
  assert.equal(set.json.pressSalesOrderNumber, "SO-2026-88");
  assert.deepEqual(set.json.erpLabels, { jobNumber: "MRP #", salesOrder: "SO #" });

  // Partial update: only the SO number changes, the job number persists.
  const edit = await req("PATCH", `/api/admin/pressing-orders/${orderId}/erp-refs`, adminToken, {
    pressSalesOrderNumber: "SO-2026-99",
  });
  assert.equal(edit.status, 200);
  assert.equal(edit.json.pressJobNumber, "MRP-4711", "untouched field persists");
  assert.equal(edit.json.pressSalesOrderNumber, "SO-2026-99", "a reorder gets a new SO");

  // Blank/empty clears back to NULL — the press hasn't assigned one yet.
  const clear = await req("PATCH", `/api/admin/pressing-orders/${orderId}/erp-refs`, adminToken, {
    pressJobNumber: "   ",
  });
  assert.equal(clear.status, 200);
  assert.equal(clear.json.pressJobNumber, null, "blank clears to NULL, never stored as whitespace");
  assert.equal(clear.json.pressSalesOrderNumber, "SO-2026-99");
});

test("the queue GET surfaces values + per-press labels on the row", async () => {
  const res = await req("GET", "/api/admin/pressing-orders", adminToken);
  assert.equal(res.status, 200);
  const row = (res.json as any[]).find((r) => r.id === orderId);
  assert.ok(row, "the seeded order is in the queue");
  assert.equal(row.pressSalesOrderNumber, "SO-2026-99");
  assert.deepEqual(row.erpLabels, { jobNumber: "MRP #", salesOrder: "SO #" });
});

test("a press-scoped partner cannot write ERP reference numbers", async () => {
  const res = await req("PATCH", `/api/admin/pressing-orders/${orderId}/erp-refs`, pressToken, {
    pressJobNumber: "should never land",
  });
  assert.equal(res.status, 403, "erp-refs PATCH is an operator verb (super_admin only)");
});

// ─── Press-scoped customer profile ───────────────────────────────────

test("GET customer-profile returns the brokered default before any save", async () => {
  const res = await req("GET", `/api/admin/manufacturers/${pressId}/customer-profile`, adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.json.id, null, "virtual default — nothing persisted yet");
  assert.equal(res.json.category, "broker", "GoodTunes is customer-of-record for brokered orders");
  assert.equal(res.json.pricingTier, null);
});

test("PUT upserts the profile and a second PUT updates the same row", async () => {
  const put = await req("PUT", `/api/admin/manufacturers/${pressId}/customer-profile`, adminToken, {
    category: "broker",
    pricingTier: "2",
    paymentTerms: "Net 30",
    billingBasis: "per finished unit",
  });
  assert.equal(put.status, 200);
  assert.ok(put.json.id, "row persisted");
  assert.equal(put.json.pricingTier, "2");

  const put2 = await req("PUT", `/api/admin/manufacturers/${pressId}/customer-profile`, adminToken, {
    pricingTier: "1",
  });
  assert.equal(put2.status, 200);
  assert.equal(put2.json.id, put.json.id, "same row updated, no duplicate");
  assert.equal(put2.json.pricingTier, "1");
  assert.equal(put2.json.paymentTerms, "Net 30", "omitted fields persist");

  const get = await req("GET", `/api/admin/manufacturers/${pressId}/customer-profile`, adminToken);
  assert.equal(get.json.pricingTier, "1", "read-back matches");
});

test("a press-scoped partner can neither read nor write the customer profile", async () => {
  const get = await req("GET", `/api/admin/manufacturers/${pressId}/customer-profile`, pressToken);
  assert.equal(get.status, 403, "internal ops data — not visible to the press itself");
  const put = await req("PUT", `/api/admin/manufacturers/${pressId}/customer-profile`, pressToken, {
    pricingTier: "3",
  });
  assert.equal(put.status, 403);
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const id of created.manufacturers)
      await exec(sql`DELETE FROM press_customer_profiles WHERE press_id = ${id}`);
    for (const id of created.orders)
      await exec(sql`DELETE FROM pressing_order_requests WHERE id = ${id}`);
    for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
    for (const id of created.manufacturers)
      await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  } finally {
    await pool.end();
  }
});
