// Task #3005 — press payouts via Stripe Connect.
//
// Covers the boundaries the task pins:
//   1. Authorization — every vendor-payout route is super-admin only.
//      requireAdmin elsewhere admits ALL partner accounts, so a partner
//      (manufacturer-role) admin must get 403, not a scoped view.
//   2. Not-Active blocking — a press without a payouts-enabled Connect
//      account cannot be paid (409), and the failed attempt is logged.
//   3. Insufficient balance — a Stripe transfer error surfaces as a
//      clean 502-style failure with the Stripe message, never a raw 500,
//      the earmark lands `failed`, and the attempt is logged.
//   4. Ledger recording — a successful payVendor releases the earmark
//      with transfer id, acting admin, album linkage and inbound refs,
//      and logs a succeeded attempt.
//
// HTTP harness mirrors adminAlbumDuplicate.db.test.ts (real route tree
// over loopback + Bearer tokens); the transfer path is exercised by
// calling payVendor() directly with a stubbed Stripe client.
//
//   GT_TEST=1 npx tsx --test server/vendorPayouts.db.test.ts
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
import { payVendor } from "./vendorPayouts";

const exec = (q: any) => db.execute(q);
const rows = (r: any): any[] => (r as any)?.rows ?? [];

const created = {
  albums: new Set<string>(),
  users: new Set<string>(),
  tokens: new Set<string>(),
  manufacturers: new Set<string>(),
  payoutAccounts: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

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
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

async function req(method: string, path: string, token: string, body?: any): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

async function seedUser(opts: { role: string; roleScopeId: string | null }): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t3005_" + tag}, ${"x"}, ${"t3005"}, ${"t3005_" + tag + "@example.test"},
            true, ${opts.role}, ${opts.roleScopeId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t3005tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function seedManufacturer(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO manufacturers (id, name, contact_email)
    VALUES (${id}, ${"t3005 press " + id.slice(0, 8)}, ${"press_" + id.slice(0, 8) + "@example.test"})
  `);
  created.manufacturers.add(id);
  return id;
}

async function seedAlbum(): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${id}, ${"t3005 album"}, ${"t3005 artist"}, ${""})
  `);
  created.albums.add(id);
  return id;
}

async function seedPayoutAccount(manufacturerId: string, payoutsEnabled: boolean): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO payout_accounts (id, owner_kind, owner_id, stripe_account_id, payouts_enabled, details_submitted)
    VALUES (${id}, 'manufacturer', ${manufacturerId}, ${"acct_t3005_" + id.slice(0, 8)}, ${payoutsEnabled}, true)
  `);
  created.payoutAccounts.add(id);
  return id;
}

const stubStripeOk = {
  transfers: {
    create: async (_params: any, _opts: any) => ({ id: "tr_t3005_" + randomUUID().slice(0, 8) }),
  },
};
const stubStripeBroke = {
  transfers: {
    create: async () => {
      throw new Error("Insufficient funds in your Stripe balance");
    },
  },
};

// ─── 1. Authorization ─────────────────────────────────────────────────

test("partner (manufacturer-role) admin gets 403 on every vendor-payout route", async () => {
  const pressId = await seedManufacturer();
  const partner = await seedUser({ role: "manufacturer", roleScopeId: pressId });
  const token = await tokenFor(partner);
  const albumId = await seedAlbum();

  const list = await req("GET", "/api/admin/vendor-payees", token);
  assert.equal(list.status, 403, "list is super-admin only");
  const invite = await req("POST", `/api/admin/vendor-payees/${pressId}/invite`, token, {});
  assert.equal(invite.status, 403, "invite is super-admin only");
  const pay = await req("POST", `/api/admin/albums/${albumId}/pay-vendor`, token, {
    manufacturerId: pressId,
    amountCents: 1000,
    requestId: randomUUID(),
  });
  assert.equal(pay.status, 403, "pay-vendor is super-admin only");
  const ledger = await req("GET", `/api/admin/albums/${albumId}/vendor-ledger`, token);
  assert.equal(ledger.status, 403, "vendor-ledger is super-admin only");
});

test("super_admin can read the vendor-payees list and the seeded press appears with derived status", async () => {
  const op = await seedUser({ role: "super_admin", roleScopeId: null });
  const token = await tokenFor(op);
  const pressId = await seedManufacturer();
  await seedPayoutAccount(pressId, true);

  const res = await req("GET", "/api/admin/vendor-payees", token);
  assert.equal(res.status, 200);
  const row = (res.json as any[]).find((r) => r.manufacturerId === pressId);
  assert.ok(row, "seeded press is listed");
  assert.equal(row.onboardingStatus, "active", "payouts-enabled account derives 'active'");
});

// ─── 2. Not-Active blocking ───────────────────────────────────────────

test("paying a press that hasn't finished onboarding is blocked (409) and the attempt is logged", async () => {
  const op = await seedUser({ role: "super_admin", roleScopeId: null });
  const albumId = await seedAlbum();
  const pressId = await seedManufacturer();
  await seedPayoutAccount(pressId, false); // onboarding, not active

  const result = await payVendor(
    { albumId, manufacturerId: pressId, amountCents: 5000, actingUserId: op, requestId: randomUUID() },
    { stripe: stubStripeOk },
  );
  assert.equal(result.ok, false);
  assert.equal((result as any).status, 409, "not-Active press is a 409, not a transfer");

  const attempts = rows(await exec(sql`SELECT * FROM vendor_transfer_attempts WHERE album_id = ${albumId}`));
  assert.equal(attempts.length, 1, "the blocked attempt is still audited");
  assert.equal(attempts[0].status, "failed");
  assert.equal(attempts[0].acting_user_id, op);
});

test("a press with NO connect account at all is also blocked (409)", async () => {
  const op = await seedUser({ role: "super_admin", roleScopeId: null });
  const albumId = await seedAlbum();
  const pressId = await seedManufacturer();

  const result = await payVendor(
    { albumId, manufacturerId: pressId, amountCents: 5000, actingUserId: op, requestId: randomUUID() },
    { stripe: stubStripeOk },
  );
  assert.equal(result.ok, false);
  assert.equal((result as any).status, 409);
});

// ─── 3. Insufficient balance surfaces cleanly ─────────────────────────

test("a Stripe insufficient-balance error surfaces cleanly (502, message), earmark fails, attempt logged", async () => {
  const op = await seedUser({ role: "super_admin", roleScopeId: null });
  const albumId = await seedAlbum();
  const pressId = await seedManufacturer();
  await seedPayoutAccount(pressId, true);

  const result = await payVendor(
    { albumId, manufacturerId: pressId, amountCents: 123400, actingUserId: op, requestId: randomUUID() },
    { stripe: stubStripeBroke },
  );
  assert.equal(result.ok, false);
  assert.equal((result as any).status, 502, "Stripe failure is a 502, never a raw 500");
  assert.match((result as any).message, /Insufficient funds/, "the Stripe message is surfaced");

  const earmarks = rows(
    await exec(sql`SELECT * FROM payout_earmarks WHERE album_id = ${albumId} AND source_kind = 'vendor_payout'`),
  );
  assert.equal(earmarks.length, 1);
  assert.equal(earmarks[0].status, "failed", "the ledger row records the failure");
  assert.match(earmarks[0].transfer_error, /Insufficient funds/);

  const attempts = rows(await exec(sql`SELECT * FROM vendor_transfer_attempts WHERE album_id = ${albumId}`));
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].status, "failed");
  assert.match(attempts[0].error_message, /Insufficient funds/);
});

// ─── 4. Successful payout + ledger recording ──────────────────────────

test("a successful payVendor releases the earmark with transfer id, acting admin, inbound refs; attempt logged", async () => {
  const op = await seedUser({ role: "super_admin", roleScopeId: null });
  const albumId = await seedAlbum();
  const pressId = await seedManufacturer();
  await seedPayoutAccount(pressId, true);
  // A paid inbound step for the same album — should be linked as an inbound ref.
  const stepId = randomUUID();
  await exec(sql`
    INSERT INTO manufacturer_payment_steps (id, album_id, manufacturer_id, description, amount_cents, status)
    VALUES (${stepId}, ${albumId}, ${pressId}, ${"t3005 step"}, 9000, 'paid')
  `);

  const requestId = randomUUID();
  const result = await payVendor(
    { albumId, manufacturerId: pressId, amountCents: 7500, actingUserId: op, requestId },
    { stripe: stubStripeOk },
  );
  assert.equal(result.ok, true, "transfer succeeds");
  assert.match((result as any).transferId, /^tr_t3005_/, "the Stripe transfer id is returned");

  const [em] = rows(
    await exec(sql`SELECT * FROM payout_earmarks WHERE album_id = ${albumId} AND source_kind = 'vendor_payout'`),
  );
  assert.equal(em.status, "released");
  assert.equal(em.stripe_transfer_id, (result as any).transferId);
  assert.equal(em.created_by_user_id, op, "initiating admin recorded");
  assert.equal(em.released_by_user_id, op);
  assert.equal(em.amount_cents, 7500);
  const inbound = typeof em.inbound_refs === "string" ? JSON.parse(em.inbound_refs) : em.inbound_refs;
  assert.deepEqual(inbound, [stepId], "inbound paid step linked");
  assert.equal(em.source_ref, `manual_${requestId}`);

  const attempts = rows(await exec(sql`SELECT * FROM vendor_transfer_attempts WHERE album_id = ${albumId}`));
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].status, "succeeded");
  assert.equal(attempts[0].stripe_transfer_id, (result as any).transferId);

  // Double-submit safety: replaying the same requestId returns the same
  // transfer without a second Stripe call / ledger row.
  const replay = await payVendor(
    { albumId, manufacturerId: pressId, amountCents: 7500, actingUserId: op, requestId },
    { stripe: stubStripeBroke }, // would throw if actually called
  );
  assert.equal(replay.ok, true);
  assert.equal((replay as any).transferId, (result as any).transferId);
  const again = rows(
    await exec(sql`SELECT * FROM payout_earmarks WHERE album_id = ${albumId} AND source_kind = 'vendor_payout'`),
  );
  assert.equal(again.length, 1, "no duplicate ledger row on replay");
});

// ─── Teardown ─────────────────────────────────────────────────────────

after(async () => {
  try {
    for (const id of created.albums) {
      await exec(sql`DELETE FROM vendor_transfer_attempts WHERE album_id = ${id}`);
      await exec(sql`DELETE FROM payout_earmarks WHERE album_id = ${id}`);
      await exec(sql`DELETE FROM manufacturer_payment_steps WHERE album_id = ${id}`);
      await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    }
    for (const id of created.payoutAccounts) await exec(sql`DELETE FROM payout_accounts WHERE id = ${id}`);
    for (const id of created.manufacturers) await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) await exec(sql`DELETE FROM users WHERE id = ${id}`);
  } finally {
    httpServer?.close();
    await pool.end().catch(() => {});
  }
});
