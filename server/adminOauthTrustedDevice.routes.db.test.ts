// Regression coverage for two prod bugs in the Google/Apple OAuth ADMIN
// sign-in flow (server/routes.ts handleProviderCallback admin branch):
//
//   BUG 1 — double-issued OTP, first never mailed. The email-pref admin OAuth
//     callback used to pre-mint + store a 6-digit code (via setAdminEmailOtp)
//     WITHOUT ever sending it, then redirect to /login?...next=emailOtp. The
//     login page auto-POSTs /api/auth/email-otp/start, which is the real mint
//     + send site. The callback's stored row either got replaced (double
//     issue) or its lastSentAt tripped /start's 60s resend cooldown → 429 →
//     NO email at all. Fix: the callback no longer stores an OTP row, so
//     /start mints + sends the one true code with no cooldown collision.
//
//   BUG 2 — OAuth callback ignored the trusted-device cookie. The password
//     leg of /api/login honors a valid gt_trusted_device cookie and skips
//     2FA; the OAuth admin callback did not. Fix: the callback runs the same
//     shared trustedDeviceBypassAllowed() check BEFORE the emailOtp/TOTP/
//     enroll split, and on a hit completes sign-in by minting an admin token
//     and redirecting with the token in the URL fragment (same shape the
//     customer branch uses).
//
// Harness mirrors server/auth/identityLink.db.test.ts: we mount the full
// route tree over a loopback socket and drive the REAL callback offline via
// two seams installed after registerRoutes — /__test/sign-oauth-state (signs
// the state bag the callback validates) and __setTestOauthExchange (stubs the
// provider token exchange to return a parked identity). registerRoutes runs
// with { forceProductionAuth: true } so the dev-only 2FA bypass is closed and
// the real trusted-device / email-OTP branches execute — no NODE_ENV flip
// (see .agents/memory/admin-trusted-device-cookie.md).
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/adminOauthTrustedDevice.routes.db.test.ts
//
// Every row seeded here is tracked and torn down in the `after` hook.
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "toauth-test-session-secret";
process.env.TOTP_ENC_KEY = process.env.TOTP_ENC_KEY || "toauth-test-totp-enc-key";

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db } from "./db";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes, __setTestOauthExchange } from "./routes";
import { storage } from "./storage";
import { setUserRole } from "./auth/roles";

const scryptAsync = promisify(_scrypt);
const exec = (q: any) => db.execute(q);

const created = {
  users: new Set<string>(),
  tokens: new Set<string>(),
  deviceHashes: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

// The identity the stubbed token exchange returns for the next callback hit.
// Set per-test right before driving /api/auth/<provider>/callback.
let nextOauthIdentity:
  | { sub: string; email: string | null; emailVerified: boolean; picture?: string | null; name?: string | null }
  | null = null;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

const PASSWORD = "toauth-correct-horse";

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app, { forceProductionAuth: true });
  // Seams installed AFTER registerRoutes so the real express-session
  // middleware is already in scope (same store the callback reads/writes).
  app.post("/__test/sign-oauth-state", async (req, res) => {
    const { signOAuthState } = await import("./auth/oauth");
    const bag = req.body?.state ?? {};
    const { state: nonce, ...rest } = bag;
    const signedState = signOAuthState({ nonce: nonce ?? "testnonce", ...rest });
    (req.session as any).__testSeam = true;
    await new Promise<void>((resolve, reject) =>
      req.session.save((err: unknown) => (err ? reject(err) : resolve())),
    );
    res.json({ ok: true, signedState });
  });
  __setTestOauthExchange(async () => {
    if (!nextOauthIdentity) throw new Error("test exchange called without a parked identity");
    return nextOauthIdentity;
  });
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
  // Warm up the pool (see memory note on cold-pool races producing confusing
  // failures on the first storage-touching request).
  await db.execute(sql`SELECT 1`);
});

after(async () => {
  try {
    __setTestOauthExchange(null);
    for (const h of created.deviceHashes) {
      await exec(sql`DELETE FROM admin_trusted_devices WHERE token_hash = ${h}`);
    }
    for (const t of created.tokens) {
      await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    }
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM admin_identities WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM admin_trusted_devices WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM auth_tokens WHERE admin_user_id = ${id}`);
      await exec(sql`DELETE FROM admin_totp WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM admin_email_otp WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM user_sessions WHERE sess::text LIKE ${"%" + id + "%"}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
  } finally {
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
  }
});

// Seed an admin with the given factor preference and an already-linked OAuth
// identity so handleProviderCallback resolves to the SIGN-IN branch (not
// invite/signup). Returns the admin's id, email, and provider sub.
async function seedOauthAdmin(
  provider: "google" | "apple",
  factorPref: "email" | "totp",
): Promise<{ id: string; email: string; sub: string }> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  const email = `toauth_${tag}@example.test`;
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, factor_pref)
    VALUES (${id}, ${"toauth_" + tag}, ${await hashPassword(PASSWORD)}, ${"toauth"},
            ${email}, true, ${factorPref})
  `);
  created.users.add(id);
  const sub = `${provider}-sub-${tag}`;
  await storage.linkIdentity("admin", { userId: id, provider, providerUserId: sub, email });
  return { id, email, sub };
}

// Create a trusted-device DB row (store only the SHA-256 hash) and return the
// raw token that belongs in the cookie. Negative ageMs ⇒ already expired.
async function mintTrustedDevice(userId: string, ageMs = 30 * 24 * 60 * 60 * 1000): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(rawToken).digest("hex");
  await storage.createAdminTrustedDevice(userId, hash, new Date(Date.now() + ageMs));
  created.deviceHashes.add(hash);
  return rawToken;
}

async function signState(provider: "google" | "apple", sub: string): Promise<string> {
  const res = await fetch(`${baseUrl}/__test/sign-oauth-state`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
    body: JSON.stringify({ state: { state: "st_" + sub, kind: "admin", provider } }),
  });
  const json: any = await res.json();
  assert.ok(json?.signedState, "sign-oauth-state must return a signed state bag");
  return json.signedState;
}

// Drive the real Google callback (GET) offline. Returns {status, location,
// setCookies}. `deviceToken` (optional) is sent as the gt_trusted_device cookie.
async function googleCallback(
  admin: { sub: string },
  deviceToken?: string,
): Promise<{ status: number; location: string | null; setCookies: string[] }> {
  const signedState = await signState("google", admin.sub);
  nextOauthIdentity = { sub: admin.sub, email: null, emailVerified: false };
  const headers: Record<string, string> = { "x-forwarded-proto": "https" };
  if (deviceToken) headers["cookie"] = `gt_trusted_device=${encodeURIComponent(deviceToken)}`;
  try {
    const res = await fetch(
      `${baseUrl}/api/auth/google/callback?state=${encodeURIComponent(signedState)}&code=testcode`,
      { method: "GET", redirect: "manual", headers },
    );
    const setCookies = ((res.headers as any).getSetCookie?.() ?? []) as string[];
    return { status: res.status, location: res.headers.get("location"), setCookies };
  } finally {
    nextOauthIdentity = null;
  }
}

function tokenFromLocation(location: string | null): string | null {
  if (!location) return null;
  const idx = location.indexOf("#token=");
  if (idx < 0) return null;
  return decodeURIComponent(location.slice(idx + "#token=".length));
}

test("OAuth callback with a valid trusted-device cookie completes sign-in with no challenge (email-pref)", async () => {
  const admin = await seedOauthAdmin("google", "email");
  const deviceToken = await mintTrustedDevice(admin.id);

  const { status, location } = await googleCallback(admin, deviceToken);
  assert.equal(status, 302, "callback must redirect");
  const token = tokenFromLocation(location);
  assert.ok(token, `bypass must redirect with #token= (got ${location})`);
  if (token) created.tokens.add(token);
  // The bypass lands on /login (the fragment-token consumer) but is NOT a 2FA
  // challenge — it carries #token= and no next=emailOtp/totp/enroll phase.
  assert.ok(
    !/next=(emailOtp|totp|enroll)/.test(location ?? ""),
    `a valid trusted device must NOT be sent to a 2FA challenge (got ${location})`,
  );
  // No email-OTP row should have been minted on the bypass path.
  const otp = await storage.getAdminEmailOtp(admin.id);
  assert.equal(otp, undefined, "bypass path must not store an email-OTP row");
});

test("OAuth callback with a valid trusted-device cookie completes sign-in with no challenge (totp-pref)", async () => {
  const admin = await seedOauthAdmin("google", "totp");
  const deviceToken = await mintTrustedDevice(admin.id);

  const { status, location } = await googleCallback(admin, deviceToken);
  assert.equal(status, 302, "callback must redirect");
  const token = tokenFromLocation(location);
  assert.ok(token, `TOTP-pref admin with a valid device must also bypass with #token= (got ${location})`);
  if (token) created.tokens.add(token);
  assert.ok(
    !/next=(emailOtp|totp|enroll)/.test(location ?? ""),
    `trusted device bypasses TOTP too — must match password-path semantics (got ${location})`,
  );
});

test("OAuth callback with NO trusted-device cookie still challenges (email-pref)", async () => {
  const admin = await seedOauthAdmin("google", "email");
  const { location } = await googleCallback(admin);
  assert.ok(
    (location ?? "").startsWith("/login?") && (location ?? "").includes("next=emailOtp"),
    `no device ⇒ email-OTP challenge expected (got ${location})`,
  );
  assert.equal(tokenFromLocation(location), null, "no bypass token when unchallenged");
});

test("OAuth callback with an EXPIRED trusted-device cookie still challenges", async () => {
  const admin = await seedOauthAdmin("google", "email");
  const deviceToken = await mintTrustedDevice(admin.id, -60_000); // expired 1 min ago
  const { location } = await googleCallback(admin, deviceToken);
  assert.ok(
    (location ?? "").startsWith("/login?") && (location ?? "").includes("next=emailOtp"),
    `expired device ⇒ still challenged (got ${location})`,
  );
  assert.equal(tokenFromLocation(location), null, "expired device ⇒ no bypass token");
});

test("OAuth callback with an OTHER-USER trusted-device cookie still challenges", async () => {
  const admin = await seedOauthAdmin("google", "totp");
  const other = await seedOauthAdmin("google", "totp");
  const otherToken = await mintTrustedDevice(other.id); // bound to the OTHER admin
  const { location } = await googleCallback(admin, otherToken);
  assert.ok(
    (location ?? "").startsWith("/login?") && !(location ?? "").includes("#token="),
    `wrong-user device ⇒ still challenged (got ${location})`,
  );
  assert.equal(tokenFromLocation(location), null, "wrong-user device ⇒ no bypass token");
});

test("BUG 1: email-pref OAuth callback stores NO OTP row; the follow-up /start mints + sends the one true code (no 429)", async () => {
  const admin = await seedOauthAdmin("google", "email");

  // Drive the callback WITHOUT a trusted device → routes into the emailOtp
  // challenge. It must set pendingTotpUserId but store NO OTP row.
  const signedState = await signState("google", admin.sub);
  nextOauthIdentity = { sub: admin.sub, email: null, emailVerified: false };
  let sessionCookie = "";
  try {
    const res = await fetch(
      `${baseUrl}/api/auth/google/callback?state=${encodeURIComponent(signedState)}&code=testcode`,
      { method: "GET", redirect: "manual", headers: { "x-forwarded-proto": "https" } },
    );
    assert.equal(res.status, 302, "callback must redirect into the emailOtp phase");
    assert.ok((res.headers.get("location") ?? "").includes("next=emailOtp"), "must land on emailOtp phase");
    const setCookies = ((res.headers as any).getSetCookie?.() ?? []) as string[];
    for (const sc of setCookies) {
      const first = sc.split(";")[0];
      if (first.startsWith("connect.sid=")) sessionCookie = first;
    }
  } finally {
    nextOauthIdentity = null;
  }
  assert.ok(sessionCookie, "callback must set a session cookie carrying pendingTotpUserId");

  // The core of BUG 1: the callback must not have pre-minted a code (which
  // would either be replaced or trip the /start cooldown).
  const preStart = await storage.getAdminEmailOtp(admin.id);
  assert.equal(preStart, undefined, "callback must NOT store an OTP row (single mint site is /start)");

  // The login page's auto-request. It is the single mint + send site, so it
  // must succeed (200, not 429 — there is no prior lastSentAt to collide).
  const startRes = await fetch(`${baseUrl}/api/auth/email-otp/start`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-proto": "https", cookie: sessionCookie },
    body: JSON.stringify({}),
  });
  const startJson: any = await startRes.json().catch(() => null);
  assert.equal(startRes.status, 200, `/start must succeed with no cooldown 429 (got ${startRes.status})`);
  assert.equal(startJson?.ok, true, "/start must report ok");

  // A single code is now on file (the one /start minted and mailed).
  const afterStart = await storage.getAdminEmailOtp(admin.id);
  assert.ok(afterStart, "one OTP row must exist after /start (the single mailed code)");
  assert.ok(afterStart?.lastSentAt, "the mailed code must carry a lastSentAt stamp");
});

test("BUG 2 handoff: a PARTNER-role bypass redirects to the /login route with a fragment token that authenticates bearer-only", async () => {
  const admin = await seedOauthAdmin("google", "email");
  // Give this admin a partner (label) hat so landingPathForUser resolves to a
  // partner portal (/label), NOT /admin. A random scope id is fine — the
  // landing resolver only reads the role, and setUserRole requires a non-null
  // scope for partner roles.
  await setUserRole(admin.id, "label" as any, randomUUID());
  const deviceToken = await mintTrustedDevice(admin.id);

  const { status, location } = await googleCallback(admin, deviceToken);
  assert.equal(status, 302, "callback must redirect");
  // CRITICAL: the fragment MUST land on the /login route — the ONLY consumer
  // of a plain #token= handoff. Redirecting straight to /label would silently
  // drop the bearer (main.tsx ignores a bare #token=). The role landing is
  // carried as a validated `next` query param instead.
  const [pathAndQuery, frag] = (location ?? "").split("#");
  assert.ok(
    pathAndQuery.startsWith("/login?"),
    `partner bypass must land on the /login route so Login.tsx stashes the token (got ${location})`,
  );
  const q = new URLSearchParams(pathAndQuery.slice(pathAndQuery.indexOf("?") + 1));
  assert.equal(q.get("next"), "/label", "the role landing must ride as a validated next= param");
  assert.ok(frag?.startsWith("token="), `the bearer must be in the URL fragment (got ${location})`);
  const token = decodeURIComponent(frag.slice("token=".length));
  assert.ok(token, "fragment must carry a non-empty token");
  created.tokens.add(token);

  // The token must authenticate bearer-only (no session cookie) — this is the
  // handoff the fragment enables and that redirecting to /label would break.
  const meRes = await fetch(`${baseUrl}/api/me`, {
    method: "GET",
    headers: { "x-forwarded-proto": "https", authorization: `Bearer ${token}` },
  });
  assert.equal(meRes.status, 200, "bearer-only /api/me must succeed");
  const me: any = await meRes.json().catch(() => null);
  assert.equal(me?.id, admin.id, "bearer must resolve to the signing-in admin");
  assert.equal(me?.kind, "admin", "bearer must resolve to an admin-kind session");
});
