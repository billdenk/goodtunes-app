// Task #2252 — regression coverage for the *mint* side of the admin 2FA
// "Remember this device for 30 days" trusted-device cookie.
//
// Task #2231 fixed the cookie (SameSite=Lax, not None) and shipped
// server/adminTrustedDevice.routes.db.test.ts — but that file only proves the
// *read/bypass* side: it seeds the trusted-device row directly via storage and
// checks that a valid cookie skips 2FA. It never drives the endpoints that
// actually SET the cookie, so a future edit could silently revert SameSite,
// drop httpOnly/secure, or shorten the 30-day Max-Age without any test failing.
//
// This file closes that gap. It drives the two real mint sites end to end —
// POST /api/auth/totp/verify and POST /api/auth/email-otp/verify, each with
// rememberDevice=true — and asserts:
//   1. the response's `Set-Cookie: gt_trusted_device=…` carries SameSite=Lax,
//      HttpOnly, Secure, Path=/, and a ~30-day Max-Age, and
//   2. a hash-only row is actually written to admin_trusted_devices.
//
// Harness notes (mirrors adminTrustedDevice.routes.db.test.ts):
//  - We mount the full route tree over a loopback socket and force
//    NODE_ENV=production *after* registerRoutes() — registration in production
//    mounts serveStaticAssets (__dirname, throws under tsx ESM), but the routes
//    we exercise read NODE_ENV at request time and the password leg's dev-only
//    2FA bypass must be closed so the second-factor flow actually runs.
//  - The verify endpoints need `req.session.pendingTotpUserId`, which only the
//    password leg of /api/login sets. So each test drives the password leg
//    first, captures the session cookie, and replays it on the verify call.
//  - The PgSession session cookie is `secure: true`, so express-session only
//    emits it when the request is deemed secure: we set `trust proxy` and send
//    `X-Forwarded-Proto: https` on every request.
//  - 127.0.0.1 is an unknown host, so authKind for /api/auth/totp/* and
//    /api/auth/email-otp/* is resolved path-based to "admin" (see auth/host.ts),
//    and /api/login takes the admin side via `kind: "admin"` in the body.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/adminTrustedDeviceMint.routes.db.test.ts
//
// Every row seeded here is tracked and torn down in the `after` hook.
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "t2252-test-session-secret";
process.env.TOTP_ENC_KEY = process.env.TOTP_ENC_KEY || "t2252-test-totp-enc-key";

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
import { encryptSecret } from "./auth/crypto";
import { generateTotpSecret, currentTotp } from "./auth/totp";
import { hashCode } from "./commerce";

const scryptAsync = promisify(_scrypt);
const exec = (q: any) => db.execute(q);

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_SECONDS = THIRTY_DAYS_MS / 1000;

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

const PASSWORD = "t2252-correct-horse";

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

  // Flip to production AFTER registration so the request-time dev-bypass gate
  // in /api/login is closed and the real second-factor flow runs.
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
      await exec(sql`DELETE FROM admin_totp WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM admin_email_otp WHERE user_id = ${id}`);
      // PgSession stores the verified userId inside the JSON session blob.
      await exec(sql`DELETE FROM user_sessions WHERE sess::text LIKE ${"%" + id + "%"}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
  } finally {
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
    await pool.end();
    // Restore the env we flipped in `before`.
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
  }
});

// Seed an admin with the given second-factor preference and return its
// id + email. The plaintext password is the shared PASSWORD constant.
async function seedAdmin(factorPref: "totp" | "email"): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  const email = `t2252_${tag}@example.test`;
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, factor_pref)
    VALUES (${id}, ${"t2252_" + tag}, ${await hashPassword(PASSWORD)}, ${"t2252"},
            ${email}, true, ${factorPref})
  `);
  created.users.add(id);
  return { id, email };
}

// Join the Set-Cookie array from a response into a single request `cookie`
// header (name=value pairs only — attributes are dropped on the way back).
function cookieHeaderFrom(res: Response): string {
  const setCookies = (res.headers as any).getSetCookie?.() as string[] | undefined;
  const list = setCookies ?? [];
  return list.map((c) => c.split(";")[0]).join("; ");
}

// Drive the password leg as `email`, returning the session cookie header the
// follow-up verify call must replay.
async function passwordLeg(email: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
    body: JSON.stringify({ username: email, password: PASSWORD, kind: "admin" }),
  });
  // We never bypass here (no trusted-device cookie), so the password leg must
  // hand back a session cookie carrying pendingTotpUserId.
  const cookie = cookieHeaderFrom(res);
  assert.ok(cookie.includes("connect.sid="), "password leg must set the session cookie");
  return cookie;
}

// Pull the single Set-Cookie line for `name` out of a response.
function setCookieLine(res: Response, name: string): string | undefined {
  const setCookies = (res.headers as any).getSetCookie?.() as string[] | undefined;
  return (setCookies ?? []).find((c) => c.startsWith(`${name}=`));
}

// Assert the gt_trusted_device cookie carries every security attribute and
// return the raw token value (for the DB hash check).
function assertTrustedDeviceCookie(line: string | undefined): string {
  assert.ok(line, "verify must emit a gt_trusted_device Set-Cookie when rememberDevice=true");
  const lower = line!.toLowerCase();
  assert.match(lower, /samesite=lax/, "must be SameSite=Lax (not None — Safari ITP drops None)");
  assert.match(lower, /httponly/, "must be HttpOnly");
  assert.match(lower, /(^|;|\s)secure(;|$)/, "must be Secure");
  assert.match(lower, /path=\//, "must be Path=/");
  const maxAge = /max-age=(\d+)/.exec(lower)?.[1];
  assert.ok(maxAge, "must carry a Max-Age");
  const ageSeconds = Number(maxAge);
  // Express derives Max-Age (seconds) from maxAge (ms); allow a tiny slop.
  assert.ok(
    Math.abs(ageSeconds - THIRTY_DAYS_SECONDS) <= 5,
    `Max-Age must be ~30 days (${THIRTY_DAYS_SECONDS}s), got ${ageSeconds}s`,
  );
  const raw = line!.slice("gt_trusted_device=".length).split(";")[0];
  return decodeURIComponent(raw);
}

// Confirm the verify endpoint actually wrote a hash-only trusted-device row
// bound to this user, and track the hash for teardown.
async function assertDeviceRow(userId: string, rawToken: string): Promise<void> {
  const hash = createHash("sha256").update(rawToken).digest("hex");
  created.deviceHashes.add(hash);
  const row = await storage.getAdminTrustedDevice(hash);
  assert.ok(row, "a trusted-device row must be written for the minted token's hash");
  assert.equal(row!.userId, userId, "the row must be bound to the signing-in admin");
}

test("TOTP verify with rememberDevice mints the trusted-device cookie + DB row", async () => {
  const admin = await seedAdmin("totp");
  const secret = generateTotpSecret();
  await storage.setAdminTotp(admin.id, encryptSecret(secret), []);

  const cookie = await passwordLeg(admin.email);
  const res = await fetch(`${baseUrl}/api/auth/totp/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-proto": "https", cookie },
    body: JSON.stringify({ code: currentTotp(secret), rememberDevice: true }),
  });
  const json: any = await res.json().catch(() => null);
  assert.equal(res.status, 200, "valid TOTP must succeed");
  assert.ok(json?.token, "verify must issue a bearer token");
  if (json?.token) created.tokens.add(json.token);

  const rawToken = assertTrustedDeviceCookie(setCookieLine(res, "gt_trusted_device"));
  await assertDeviceRow(admin.id, rawToken);
});

test("email-OTP verify with rememberDevice mints the trusted-device cookie + DB row", async () => {
  const admin = await seedAdmin("email");
  const cookie = await passwordLeg(admin.email);

  // The password leg already issued a random code; overwrite it with one we
  // control so we can submit the matching digits.
  const code = "424242";
  await storage.setAdminEmailOtp(admin.id, await hashCode(code), new Date(Date.now() + 10 * 60_000));

  const res = await fetch(`${baseUrl}/api/auth/email-otp/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-proto": "https", cookie },
    body: JSON.stringify({ code, rememberDevice: true }),
  });
  const json: any = await res.json().catch(() => null);
  assert.equal(res.status, 200, "valid email code must succeed");
  assert.ok(json?.token, "verify must issue a bearer token");
  if (json?.token) created.tokens.add(json.token);

  const rawToken = assertTrustedDeviceCookie(setCookieLine(res, "gt_trusted_device"));
  await assertDeviceRow(admin.id, rawToken);
});

test("email-OTP verify without rememberDevice mints NO cookie and NO row", async () => {
  const admin = await seedAdmin("email");
  const cookie = await passwordLeg(admin.email);
  const code = "313131";
  await storage.setAdminEmailOtp(admin.id, await hashCode(code), new Date(Date.now() + 10 * 60_000));

  const res = await fetch(`${baseUrl}/api/auth/email-otp/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-proto": "https", cookie },
    body: JSON.stringify({ code }), // rememberDevice omitted
  });
  const json: any = await res.json().catch(() => null);
  assert.equal(res.status, 200, "valid email code must still succeed without rememberDevice");
  if (json?.token) created.tokens.add(json.token);

  assert.equal(
    setCookieLine(res, "gt_trusted_device"),
    undefined,
    "no gt_trusted_device cookie when rememberDevice is omitted",
  );
  const rows = await exec(sql`SELECT 1 FROM admin_trusted_devices WHERE user_id = ${admin.id}`);
  assert.equal((rows as any).rowCount ?? (rows as any).rows?.length ?? 0, 0, "no trusted-device row written");
});
