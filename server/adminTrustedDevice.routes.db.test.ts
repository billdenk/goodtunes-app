// Task #2231 — regression coverage for the admin 2FA "Remember this device
// for 30 days" trusted-device bypass on the password leg of POST /api/login.
//
// The bug (Task #2172 shipped the feature; this task fixes it): the
// gt_trusted_device cookie was minted with SameSite=None, which Safari ITP and
// proxies cap/drop on a first-party login, so a remembered browser was still
// asked for the email/TOTP code. The mint sites now use SameSite=Lax. This file
// pins the *server-side* contract the cookie drives so it can't silently
// regress again: a valid, live, right-user trusted-device token skips 2FA and
// returns a session token, while a missing / expired / wrong-user token still
// forces the second factor.
//
// We mount the full route tree over a loopback socket exactly like
// server/previewPass.routes.db.test.ts. The dev-only TOTP bypass in /api/login
// only fires when NODE_ENV !== "production", so we force production for this
// process (and supply a SESSION_SECRET, required at registration in prod) to
// exercise the real trusted-device branch. 127.0.0.1 is an unknown host, so the
// host/kind boundary is skipped and we drive the admin side via `kind` in the
// body. The trusted-device row is created directly via storage (the cookie mint
// itself is covered implicitly — we feed the same SHA-256(token) the verify
// endpoints would store).
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/adminTrustedDevice.routes.db.test.ts
//
// NOTE on NODE_ENV: the /api/login route reads process.env.NODE_ENV at REQUEST
// time (the dev-only 2FA bypass only fires when it's not "production"). We must
// flip it to "production" to reach the trusted-device branch — but only AFTER
// registerRoutes(), because registration in production mounts serveStaticAssets
// (server/static.ts) which uses __dirname and throws under tsx (ESM). So we
// register in the default env and flip the flag at the end of `before`.
//
// Every row seeded here is tracked and torn down in the `after` hook.
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "t2231-test-session-secret";

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "./db";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";
import { storage } from "./storage";

const scryptAsync = promisify(_scrypt);
const exec = (q: any) => db.execute(q);

const created = {
  users: new Set<string>(),
  tokens: new Set<string>(),
  deviceHashes: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;
const priorNodeEnv = process.env.NODE_ENV;

// Mirror server/routes.ts hashPassword so the seeded admin's stored hash
// verifies against the plaintext we POST.
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

const PASSWORD = "t2231-correct-horse";
let adminId = "";
let adminEmail = "";

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

  // Seed an admin with factor_pref='totp' (no enrolled TOTP) so the negative
  // cases resolve to a clean `requiresEnrollment` response — no email side
  // effects — while still proving 2FA was NOT skipped.
  adminId = randomUUID();
  const tag = adminId.slice(0, 8);
  adminEmail = `t2231_${tag}@example.test`;
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, factor_pref)
    VALUES (${adminId}, ${"t2231_" + tag}, ${await hashPassword(PASSWORD)}, ${"t2231"},
            ${adminEmail}, true, ${"totp"})
  `);
  created.users.add(adminId);

  // Flip to production AFTER registration so the request-time dev-bypass gate
  // is closed and the trusted-device branch actually runs.
  process.env.NODE_ENV = "production";
});

after(async () => {
  try {
    for (const h of created.deviceHashes) {
      await exec(sql`DELETE FROM admin_trusted_devices WHERE token_hash = ${h}`);
    }
    for (const t of created.tokens) {
      await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    }
    for (const id of created.users) {
      await exec(sql`DELETE FROM admin_trusted_devices WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM auth_tokens WHERE admin_user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
  } finally {
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
    await pool.end();
    // Restore the env we flipped in `before` so nothing leaks if the runner
    // ever shares a process across files.
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
  }
});

// Create a trusted-device DB row exactly as the verify endpoints do (store only
// the SHA-256 hash) and return the *raw* token that belongs in the cookie.
async function mintTrustedDevice(userId: string, ageMs = 30 * 24 * 60 * 60 * 1000): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + ageMs); // negative ageMs ⇒ already expired
  await storage.createAdminTrustedDevice(userId, hash, expiresAt);
  created.deviceHashes.add(hash);
  return rawToken;
}

async function login(deviceToken?: string): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (deviceToken) headers["cookie"] = `gt_trusted_device=${encodeURIComponent(deviceToken)}`;
  const res = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ username: adminEmail, password: PASSWORD, kind: "admin" }),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (json?.token) created.tokens.add(json.token);
  return { status: res.status, json };
}

test("valid trusted-device cookie skips 2FA and returns a session token", async () => {
  const token = await mintTrustedDevice(adminId);
  const { status, json } = await login(token);
  assert.equal(status, 200, "password + valid trusted device must succeed");
  assert.ok(json?.token, "bypass must issue a bearer token");
  assert.equal(json?.requires2fa, undefined, "2FA must be skipped");
  assert.equal(json?.requiresEnrollment, undefined, "enrollment must not be requested");
  assert.equal(json?.requiresEmailCode, undefined, "email code must not be requested");
});

test("no trusted-device cookie still requires the second factor", async () => {
  const { json } = await login();
  assert.ok(!json?.token, "no cookie ⇒ no bypass token");
  assert.equal(json?.requiresEnrollment, true, "TOTP-pref admin without device ⇒ enrollment step");
});

test("an expired trusted-device cookie still requires the second factor", async () => {
  const token = await mintTrustedDevice(adminId, -60_000); // expired 1 min ago
  const { json } = await login(token);
  assert.ok(!json?.token, "expired device ⇒ no bypass token");
  assert.equal(json?.requiresEnrollment, true, "expired device ⇒ still 2FA");
});

test("a trusted-device cookie bound to a different user does not bypass", async () => {
  const otherId = randomUUID();
  const otag = otherId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, factor_pref)
    VALUES (${otherId}, ${"t2231o_" + otag}, ${"x"}, ${"t2231o"},
            ${"t2231o_" + otag + "@example.test"}, true, ${"totp"})
  `);
  created.users.add(otherId);
  // Token belongs to the OTHER admin, but we sign in as our admin.
  const token = await mintTrustedDevice(otherId);
  const { json } = await login(token);
  assert.ok(!json?.token, "wrong-user device ⇒ no bypass token");
  assert.equal(json?.requiresEnrollment, true, "wrong-user device ⇒ still 2FA");
});
