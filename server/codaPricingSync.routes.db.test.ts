// Task #3310 — Coda pricing-sync route auth coverage over a real loopback
// socket + real DB (same harness as demoteArtist.routes.db.test.ts;
// 127.0.0.1 is an unknown host so the host/kind boundary is skipped):
//
//   1. All Coda connection + sync routes are operator (god-view) ONLY:
//      anonymous callers 401; a press-scoped manufacturer partner (who CAN
//      reach the ordinary catalog routes) gets 403 — the token entry
//      surface never opens to partners.
//   2. Saving a connection works for a super_admin, and the GET readback
//      NEVER contains the API token (one-time entry).
//   3. Preview without a picked table/mapping fails loudly (400 with a
//      clear message), never a silent empty sync.
//
//   GT_TEST=1 npx tsx --test server/codaPricingSync.routes.db.test.ts
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

process.env.TOTP_ENC_KEY = process.env.TOTP_ENC_KEY || "t3310-test-totp-enc-key";

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

const API_TOKEN = "t3310-coda-api-token-" + randomUUID().replace(/-/g, "");

async function seedUser(opts: { role: string; roleScopeId: string | null }): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t3310_" + tag}, ${"x"}, ${"t3310"}, ${"t3310_" + tag + "@example.test"},
            true, ${opts.role}, ${opts.roleScopeId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t3310tok_" + randomUUID().replace(/-/g, "");
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
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${pressId}, ${"t3310 Press"})`);
  created.manufacturers.add(pressId);

  opToken = await tokenFor(await seedUser({ role: "super_admin", roleScopeId: null }));
  // In-scope press partner: passes requirePressScope on ordinary catalog
  // routes, but must NOT reach the Coda connection/token surface.
  partnerToken = await tokenFor(await seedUser({ role: "manufacturer", roleScopeId: pressId }));
});

after(async () => {
  try {
    await exec(sql`DELETE FROM press_coda_connections WHERE press_id = ${pressId}`);
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

const ROUTES: [string, string, unknown?][] = [
  ["GET", "/coda-connection"],
  ["PUT", "/coda-connection", { apiToken: "x".repeat(24), docId: "abc" }],
  ["DELETE", "/coda-connection"],
  ["POST", "/coda-connection/test", {}],
  ["POST", "/pricing-sync/coda/preview", {}],
  ["POST", "/pricing-sync/coda/commit", {}],
];

test("anonymous callers 401 on every Coda route", async () => {
  for (const [method, suffix, body] of ROUTES) {
    const r = await call(method, `/api/admin/manufacturers/${pressId}${suffix}`, null, body);
    assert.equal(r.status, 401, `${method} ${suffix} must 401 anonymously`);
  }
});

test("in-scope press partner 403s on every Coda route (operator-only)", async () => {
  for (const [method, suffix, body] of ROUTES) {
    const r = await call(method, `/api/admin/manufacturers/${pressId}${suffix}`, partnerToken, body);
    assert.equal(r.status, 403, `${method} ${suffix} must 403 for a press partner`);
    assert.match(String(r.json?.message ?? ""), /operators only/i);
  }
});

test("operator saves a connection; readback never exposes the token", async () => {
  const put = await call("PUT", `/api/admin/manufacturers/${pressId}/coda-connection`, opToken, {
    apiToken: API_TOKEN,
    docId: "t3310doc",
    tableId: "grid-t3310",
    tableName: "Pricing",
    columnMapping: {
      tierColumnId: "c-tier",
      qtyColumnId: "c-qty",
      priceColumnId: "c-price",
      priceKind: "unit",
      formatColumnId: null,
      defaultFormat: "12_lp",
    },
  });
  assert.equal(put.status, 200, JSON.stringify(put.json));
  assert.equal(put.json.configured, true);
  assert.ok(!JSON.stringify(put.json).includes(API_TOKEN), "PUT response must not echo the token");

  const get = await call("GET", `/api/admin/manufacturers/${pressId}/coda-connection`, opToken);
  assert.equal(get.status, 200);
  assert.equal(get.json.configured, true);
  assert.equal(get.json.docId, "t3310doc");
  assert.equal(get.json.tableId, "grid-t3310");
  assert.equal(get.json.columnMapping.tierColumnId, "c-tier");
  const raw = JSON.stringify(get.json);
  assert.ok(!raw.includes(API_TOKEN), "GET must never contain the raw token");
  assert.ok(!raw.toLowerCase().includes("apitokenencrypted"), "GET must not leak the encrypted blob either");

  // The stored row is encrypted — the raw token never lands in the DB.
  const [row] = (await exec(sql`SELECT api_token_encrypted FROM press_coda_connections WHERE press_id = ${pressId}`)).rows as any[];
  assert.ok(row, "connection row exists");
  assert.notEqual(row.api_token_encrypted, API_TOKEN, "token must be stored encrypted");
});

test("preview without a usable mapping fails loudly, never silently", async () => {
  // Wipe the mapping/table to simulate a half-configured connection.
  await exec(sql`UPDATE press_coda_connections SET table_id = NULL, column_mapping = NULL WHERE press_id = ${pressId}`);
  const r = await call("POST", `/api/admin/manufacturers/${pressId}/pricing-sync/coda/preview`, opToken, {});
  assert.ok(r.status >= 400 && r.status < 500, `must be a 4xx error status (got ${r.status})`);
  assert.match(String(r.json?.message ?? ""), /table|map/i, "message names what's missing");
});

test("create requires token + doc id", async () => {
  await exec(sql`DELETE FROM press_coda_connections WHERE press_id = ${pressId}`);
  const r = await call("PUT", `/api/admin/manufacturers/${pressId}/coda-connection`, opToken, {
    docId: "no-token-doc",
  });
  assert.equal(r.status, 400);
  assert.match(String(r.json?.message ?? ""), /token/i);
});
