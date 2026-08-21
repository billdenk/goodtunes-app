// Task #3254 — the press-portal profile PATCH must NEVER persist a
// `/objects/uploads/...` logo URL whose object couldn't be published
// (public ACL set + verified). Previously ACL failures were swallowed
// best-effort AFTER the write, which is how Memphis Record Pressing's prod
// logos ended up persisted-but-404ing.
//
// Drives the real routes over a loopback socket (real DB via DATABASE_URL):
//   1. PATCH with an upload URL whose object does NOT exist in the bucket
//      → 4xx/5xx and the column is NOT updated (fail-closed).
//   2. PATCH with a pasted absolute external URL → 200, persisted untouched
//      (no ACL work for external URLs).
//   3. PATCH with plain non-logo fields still saves normally.
//
//   npx tsx --test server/pressProfileLogoAcl.routes.db.test.ts
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "t3254-test-session-secret";

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db } from "./db";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";

const scryptAsync = promisify(_scrypt);
const exec = (q: any) => db.execute(q);

const PASSWORD = "t3254-correct-horse";
let baseUrl = "";
let httpServer: HttpServer | undefined;
let cookie = "";
let bearer = "";
let adminId = "";
let pressId = "";

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

const api = async (method: string, path: string, body?: unknown) => {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-proto": "https",
      ...(cookie ? { cookie } : {}),
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

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
  await db.execute(sql`SELECT 1`);

  adminId = randomUUID();
  const email = `t3254_${adminId.slice(0, 8)}@example.test`;
  const pw = await hashPassword(PASSWORD);
  await exec(sql`
    INSERT INTO users (id, email, username, password, display_name, is_admin, role)
    VALUES (${adminId}, ${email}, ${email}, ${pw}, 'T3254 Admin', true, 'super_admin')
  `);
  const login = await api("POST", "/api/login", { username: email, password: PASSWORD, kind: "admin" });
  assert.equal(login.status, 200, `login failed: ${await login.clone().text()}`);
  const loginBody = await login.json();
  bearer = String(loginBody.token ?? "");
  cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

  pressId = randomUUID();
  await exec(sql`
    INSERT INTO manufacturers (id, name, does_vinyl, logo_url)
    VALUES (${pressId}, ${"T3254 Press " + pressId.slice(0, 8)}, true, '/objects/uploads/t3254-original.png')
  `);
});

after(async () => {
  try {
    await exec(sql`DELETE FROM manufacturers WHERE id = ${pressId}`);
    await exec(sql`DELETE FROM user_sessions WHERE sess::text LIKE ${"%" + adminId + "%"}`);
    await exec(sql`DELETE FROM auth_tokens WHERE admin_user_id = ${adminId}`);
    await exec(sql`DELETE FROM users WHERE id = ${adminId}`);
  } finally {
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
  }
});

async function logoUrlInDb(): Promise<string | null> {
  const [row] = (await exec(sql`SELECT logo_url FROM manufacturers WHERE id = ${pressId}`)).rows as any[];
  return row?.logo_url ?? null;
}

test("PATCH refuses to persist an upload URL whose object can't be published", async () => {
  // Object never uploaded — publication must fail and the save must NOT land.
  const bogus = `/objects/uploads/${randomUUID()}.png`;
  const res = await api("PATCH", `/api/press/${pressId}/profile`, { logoUrl: bogus });
  assert.ok(res.status >= 400, `expected a failed save, got ${res.status}`);
  assert.equal(await logoUrlInDb(), "/objects/uploads/t3254-original.png", "logo_url must be unchanged");
});

test("admin manufacturers PUT refuses the same unpublished upload URL", async () => {
  const bogus = `/objects/uploads/${randomUUID()}.png`;
  const res = await api("PUT", `/api/admin/manufacturers/${pressId}`, { logoUrl: bogus });
  assert.ok(res.status >= 400, `expected a failed save, got ${res.status}`);
  assert.equal(await logoUrlInDb(), "/objects/uploads/t3254-original.png", "logo_url must be unchanged");
});

test("pasted absolute external URLs persist untouched (no ACL work)", async () => {
  const ext = "https://example.test/t3254-logo.svg";
  const res = await api("PATCH", `/api/press/${pressId}/profile`, { logoUrl: ext });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(await logoUrlInDb(), ext);
});

test("non-logo profile fields still save normally", async () => {
  const res = await api("PATCH", `/api/press/${pressId}/profile`, { bio: "T3254 bio" });
  assert.equal(res.status, 200, await res.clone().text());
  const [row] = (await exec(sql`SELECT bio FROM manufacturers WHERE id = ${pressId}`)).rows as any[];
  assert.equal(row?.bio, "T3254 bio");
});
