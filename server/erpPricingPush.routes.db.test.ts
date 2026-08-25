// Task #3379 — ERP pricing push route coverage over a real loopback
// socket + real DB (same harness as codaPricingSync.routes.db.test.ts):
//
//   1. Credential + push-review routes are operator (god-view) ONLY:
//      anonymous 401, in-scope press partner 403.
//   2. Mint returns the full key exactly once; readback exposes only the
//      keyId; the secret half lands encrypted in the DB.
//   3. Inbound auth: missing / malformed / wrong / revoked keys 401.
//   4. Validate is a pure dry-run: parsed rows echo back, ladders and
//      pending queue untouched, but the run lands in sync history.
//   5. Submit → pending → preview (no writes) → commit end-to-end,
//      including lockedFromSync rung survival, plus discard + 409 on
//      double-commit, and 422 payload rejection recorded in history.
//
//   GT_TEST=1 npx tsx --test server/erpPricingPush.routes.db.test.ts
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

process.env.TOTP_ENC_KEY = process.env.TOTP_ENC_KEY || "t3379-test-totp-enc-key";

const exec = (q: any) => db.execute(q);

const created = {
  manufacturers: new Set<string>(),
  users: new Set<string>(),
  tokens: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;
let pressId = "";
let opToken = "";
let partnerToken = "";
let tierId = "";
let jacketId = "";

async function seedUser(opts: { role: string; roleScopeId: string | null }): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t3379_" + tag}, ${"x"}, ${"t3379"}, ${"t3379_" + tag + "@example.test"},
            true, ${opts.role}, ${opts.roleScopeId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t3379tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

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
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${pressId}, ${"t3379 Press"})`);
  created.manufacturers.add(pressId);

  // Catalog fixtures: one 12_lp tier "Black" + default jacket + ladder
  // with a LOCKED rung @300 and an unlocked rung @500.
  tierId = randomUUID();
  jacketId = randomUUID();
  await exec(sql`
    INSERT INTO press_color_tiers (id, press_id, format, name)
    VALUES (${tierId}, ${pressId}, ${"12_lp"}, ${"Black"})
  `);
  await exec(sql`
    INSERT INTO press_jackets (id, press_id, name, is_default)
    VALUES (${jacketId}, ${pressId}, ${"t3379 Default Jacket"}, true)
  `);
  await exec(sql`
    INSERT INTO press_tier_jacket_ladders (tier_id, jacket_id, price_ladder)
    VALUES (${tierId}, ${jacketId}, ${JSON.stringify([
      { qty: 300, unitCents: 275, confirmed: true, source: "operator", lockedFromSync: true },
      { qty: 500, unitCents: 260, confirmed: true, source: "operator" },
    ])}::jsonb)
  `);

  opToken = await tokenFor(await seedUser({ role: "super_admin", roleScopeId: null }));
  partnerToken = await tokenFor(await seedUser({ role: "manufacturer", roleScopeId: pressId }));
});

after(async () => {
  try {
    await exec(sql`DELETE FROM press_tier_jacket_ladders WHERE tier_id = ${tierId}`);
    await exec(sql`DELETE FROM press_color_tiers WHERE press_id = ${pressId}`);
    await exec(sql`DELETE FROM press_jackets WHERE press_id = ${pressId}`);
    await exec(sql`DELETE FROM press_push_credentials WHERE press_id = ${pressId}`);
    await exec(sql`DELETE FROM press_pricing_syncs WHERE press_id = ${pressId}`);
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) await exec(sql`DELETE FROM users WHERE id = ${id}`);
    for (const id of created.manufacturers) await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  } finally {
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
    await pool.end();
  }
});

async function call(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function push(path: string, apiKey: string | null, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function ladderRungs(): Promise<any[]> {
  const [row] = (
    await exec(sql`SELECT price_ladder FROM press_tier_jacket_ladders WHERE tier_id = ${tierId} AND jacket_id = ${jacketId}`)
  ).rows as any[];
  return (row?.price_ladder ?? []) as any[];
}

const GOOD_PAYLOAD = {
  version: 1,
  default_format: "12_lp",
  rows: [
    { tier: "Black", quantity: 300, unit_price: 1.11 }, // locked rung — must survive
    { tier: "Black", quantity: 500, unit_price: 2.3 }, // update
    { tier: "Black", quantity: 1000, unit_price: 1.95 }, // new rung
    { tier: "Glow", quantity: 300, unit_price: 3.5 }, // no such tier
  ],
};

const ADMIN_ROUTES: [string, string, unknown?][] = [
  ["GET", "/push-credential"],
  ["POST", "/push-credential"],
  ["DELETE", "/push-credential"],
  ["GET", "/pricing-pushes"],
  ["POST", "/pricing-pushes/00000000-0000-0000-0000-000000000000/preview"],
  ["POST", "/pricing-pushes/00000000-0000-0000-0000-000000000000/commit"],
  ["POST", "/pricing-pushes/00000000-0000-0000-0000-000000000000/discard"],
];

test("anonymous callers 401 on every push admin route", async () => {
  for (const [method, suffix, body] of ADMIN_ROUTES) {
    const r = await call(method, `/api/admin/manufacturers/${pressId}${suffix}`, null, body);
    assert.equal(r.status, 401, `${method} ${suffix} must 401 anonymously`);
  }
});

test("in-scope press partner 403s on every push admin route (operator-only)", async () => {
  for (const [method, suffix, body] of ADMIN_ROUTES) {
    const r = await call(method, `/api/admin/manufacturers/${pressId}${suffix}`, partnerToken, body);
    assert.equal(r.status, 403, `${method} ${suffix} must 403 for a press partner`);
    assert.match(String(r.json?.message ?? ""), /operators only/i);
  }
});

let mintedKey = "";

test("operator mints a key; readback exposes keyId only; secret stored encrypted", async () => {
  const mint = await call("POST", `/api/admin/manufacturers/${pressId}/push-credential`, opToken);
  assert.equal(mint.status, 200, JSON.stringify(mint.json));
  mintedKey = String(mint.json.key);
  assert.match(mintedKey, /^gtpush_[0-9a-f]{12}_[0-9a-f]{48}$/);
  const keyId = mint.json.keyId;
  assert.equal(mintedKey.split("_")[1], keyId);

  const get = await call("GET", `/api/admin/manufacturers/${pressId}/push-credential`, opToken);
  assert.equal(get.status, 200);
  assert.equal(get.json.configured, true);
  assert.equal(get.json.keyId, keyId);
  assert.equal(get.json.lastReceivedAt, null); // nothing pushed yet
  const raw = JSON.stringify(get.json);
  const secret = mintedKey.split("_")[2];
  assert.ok(!raw.includes(secret), "GET must never contain the secret");

  const [row] = (
    await exec(sql`SELECT secret_encrypted FROM press_push_credentials WHERE press_id = ${pressId} AND revoked_at IS NULL`)
  ).rows as any[];
  assert.ok(row, "credential row exists");
  assert.ok(!String(row.secret_encrypted).includes(secret), "secret must be stored encrypted");
});

test("inbound auth: missing, malformed, and wrong keys 401", async () => {
  for (const bad of [null, "nonsense", "gtpush_000000000000_" + "0".repeat(48)]) {
    const r = await push("/api/erp/v1/pricing/validate", bad as any, GOOD_PAYLOAD);
    assert.equal(r.status, 401, `key ${bad} must 401`);
    assert.equal(r.json?.error, "invalid_api_key");
  }
});

test("validate is a pure dry-run: echoes parsed rows, writes nothing but history", async () => {
  const before = await ladderRungs();
  const r = await push("/api/erp/v1/pricing/validate", mintedKey, GOOD_PAYLOAD);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.ok, true);
  assert.equal(r.json.rows_received, 4);
  assert.equal(r.json.rows_accepted, 4);
  assert.deepEqual(r.json.accepted[0], {
    index: 0,
    format: "12_lp",
    tier: "Black",
    quantity: 300,
    unit_price_cents: 111,
  });

  // Ladders untouched, nothing pending.
  assert.deepEqual(await ladderRungs(), before);
  const pend = await call("GET", `/api/admin/manufacturers/${pressId}/pricing-pushes`, opToken);
  assert.deepEqual(pend.json, []);

  // …but the run IS in the sync history.
  const [hist] = (
    await exec(sql`SELECT status, source, products_fetched FROM press_pricing_syncs WHERE id = ${r.json.run_id}`)
  ).rows as any[];
  assert.equal(hist.source, "erp_push");
  assert.equal(hist.status, "validated");
  assert.equal(Number(hist.products_fetched), 4);

  // Freshness: validates do NOT count as "pricing received".
  const cred = await call("GET", `/api/admin/manufacturers/${pressId}/push-credential`, opToken);
  assert.equal(cred.json.lastReceivedAt, null);
});

test("validate with a broken payload returns structured per-row errors (422)", async () => {
  const r = await push("/api/erp/v1/pricing/validate", mintedKey, {
    version: 1,
    rows: [{ tier: "Black", quantity: "soon", unit_price: 2 }],
  });
  assert.equal(r.status, 422);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.errors[0].index, 0);
  assert.equal(r.json.errors[0].code, "quantity_invalid");
});

test("submit rejects a payload with errors and records the rejection", async () => {
  const r = await push("/api/erp/v1/pricing/pushes", mintedKey, {
    version: 1,
    default_format: "12_lp",
    rows: [{ tier: "Black", quantity: 300, unit_price: "TBD" }],
  });
  assert.equal(r.status, 422);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.errors[0].code, "price_invalid");
  const [hist] = (
    await exec(sql`SELECT status, error FROM press_pricing_syncs WHERE id = ${r.json.run_id}`)
  ).rows as any[];
  assert.equal(hist.status, "error");
  assert.match(String(hist.error), /rejected/i);
  // Nothing pending.
  const pend = await call("GET", `/api/admin/manufacturers/${pressId}/pricing-pushes`, opToken);
  assert.deepEqual(pend.json, []);
});

let pushId = "";

test("submit stages a pending push without touching ladders", async () => {
  const before = await ladderRungs();
  const r = await push("/api/erp/v1/pricing/pushes", mintedKey, GOOD_PAYLOAD);
  assert.equal(r.status, 202, JSON.stringify(r.json));
  assert.equal(r.json.status, "pending_review");
  pushId = String(r.json.push_id);
  assert.deepEqual(await ladderRungs(), before);

  const pend = await call("GET", `/api/admin/manufacturers/${pressId}/pricing-pushes`, opToken);
  assert.equal(pend.json.length, 1);
  assert.equal(pend.json[0].id, pushId);
  assert.equal(pend.json[0].rowsAccepted, 4);

  // Freshness now shows a received push.
  const cred = await call("GET", `/api/admin/manufacturers/${pressId}/push-credential`, opToken);
  assert.ok(cred.json.lastReceivedAt, "lastReceivedAt set after a real push");
  assert.equal(cred.json.pendingCount, 1);
});

test("preview diffs the staged push against ladders without writing", async () => {
  const before = await ladderRungs();
  const r = await call(
    "POST",
    `/api/admin/manufacturers/${pressId}/pricing-pushes/${pushId}/preview`,
    opToken,
  );
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const byQty = new Map(r.json.proposal.writes.map((w: any) => [`${w.tierName}|${w.qty}`, w]));
  assert.equal((byQty.get("Black|300") as any).change, "locked");
  assert.equal((byQty.get("Black|500") as any).change, "updated");
  assert.equal((byQty.get("Black|500") as any).oldUnitCents, 260);
  assert.equal((byQty.get("Black|1000") as any).change, "new");
  assert.equal((byQty.get("Glow|300") as any).change, "tier_missing");
  assert.deepEqual(r.json.proposal.tiersMissing, ["12_lp/Glow"]);
  assert.deepEqual(await ladderRungs(), before, "preview must not write");
});

test("commit applies the push; locked rung survives byte-identical", async () => {
  const r = await call(
    "POST",
    `/api/admin/manufacturers/${pressId}/pricing-pushes/${pushId}/commit`,
    opToken,
  );
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.rungsWritten, 2); // 500 updated + 1000 new
  assert.deepEqual(r.json.tiersMissing, ["12_lp/Glow"]);

  const rungs = await ladderRungs();
  const byQty = new Map(rungs.map((x: any) => [Number(x.qty), x]));
  // Locked rung kept exactly.
  assert.deepEqual(byQty.get(300), {
    qty: 300,
    unitCents: 275,
    confirmed: true,
    source: "operator",
    lockedFromSync: true,
  });
  assert.equal(byQty.get(500)!.unitCents, 230);
  assert.equal(byQty.get(500)!.source, "erp_push");
  assert.equal(byQty.get(1000)!.unitCents, 195);
  assert.equal(byQty.get(1000)!.source, "erp_push");

  // Sync row flipped to ok and left the pending queue.
  const [hist] = (
    await exec(sql`SELECT status, rungs_written FROM press_pricing_syncs WHERE id = ${pushId}`)
  ).rows as any[];
  assert.equal(hist.status, "ok");
  assert.equal(Number(hist.rungs_written), 2);
  const pend = await call("GET", `/api/admin/manufacturers/${pressId}/pricing-pushes`, opToken);
  assert.deepEqual(pend.json, []);
});

test("double-commit 409s; unknown push 404s", async () => {
  const again = await call(
    "POST",
    `/api/admin/manufacturers/${pressId}/pricing-pushes/${pushId}/commit`,
    opToken,
  );
  assert.equal(again.status, 409);
  const missing = await call(
    "POST",
    `/api/admin/manufacturers/${pressId}/pricing-pushes/${randomUUID()}/commit`,
    opToken,
  );
  assert.equal(missing.status, 404);
});

test("discard parks a pending push without writing", async () => {
  const r = await push("/api/erp/v1/pricing/pushes", mintedKey, {
    version: 1,
    default_format: "12_lp",
    rows: [{ tier: "Black", quantity: 500, unit_price: 9.99 }],
  });
  assert.equal(r.status, 202);
  const id = r.json.push_id;
  const before = await ladderRungs();
  const d = await call(
    "POST",
    `/api/admin/manufacturers/${pressId}/pricing-pushes/${id}/discard`,
    opToken,
  );
  assert.equal(d.status, 200);
  assert.deepEqual(await ladderRungs(), before, "discard must not write");
  const [hist] = (
    await exec(sql`SELECT status FROM press_pricing_syncs WHERE id = ${id}`)
  ).rows as any[];
  assert.equal(hist.status, "discarded");
  // Discarded pushes can't be committed.
  const c = await call(
    "POST",
    `/api/admin/manufacturers/${pressId}/pricing-pushes/${id}/commit`,
    opToken,
  );
  assert.equal(c.status, 409);
});

test("minting a replacement revokes the old key; revoke kills inbound access", async () => {
  const mint2 = await call("POST", `/api/admin/manufacturers/${pressId}/push-credential`, opToken);
  assert.equal(mint2.status, 200);
  const newKey = String(mint2.json.key);
  assert.notEqual(newKey, mintedKey);

  // Old key is dead, new key works.
  const oldR = await push("/api/erp/v1/pricing/validate", mintedKey, GOOD_PAYLOAD);
  assert.equal(oldR.status, 401);
  const newR = await push("/api/erp/v1/pricing/validate", newKey, GOOD_PAYLOAD);
  assert.equal(newR.status, 200);

  // Explicit revoke kills the new key too.
  const rev = await call("DELETE", `/api/admin/manufacturers/${pressId}/push-credential`, opToken);
  assert.equal(rev.status, 200);
  assert.equal(rev.json.revoked, true);
  const afterRevoke = await push("/api/erp/v1/pricing/validate", newKey, GOOD_PAYLOAD);
  assert.equal(afterRevoke.status, 401);
  const cred = await call("GET", `/api/admin/manufacturers/${pressId}/push-credential`, opToken);
  assert.equal(cred.json.configured, false);
});

test("oversized payload 413s", async () => {
  // Big filler forces content-length past the 1 MB cap while staying
  // under the server's global JSON limit.
  const bigPayload = {
    version: 1,
    default_format: "12_lp",
    filler: "x".repeat(1_100_000),
    rows: [{ tier: "Black", quantity: 300, unit_price: 2 }],
  };
  // A revoked key must not even reach the size check — mint a fresh one.
  const mint3 = await call("POST", `/api/admin/manufacturers/${pressId}/push-credential`, opToken);
  const key = String(mint3.json.key);
  const r = await push("/api/erp/v1/pricing/validate", key, bigPayload);
  assert.equal(r.status, 413);
  assert.equal(r.json.error, "payload_too_large");
});
