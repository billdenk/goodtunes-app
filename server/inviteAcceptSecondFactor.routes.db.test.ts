// Task #3329 follow-up (review) — an invite link is forwardable, so the
// existing-account "sign in to accept" branch must NOT let link possession +
// password bypass the account's enrolled second factor. Under production
// auth policy (forceProductionAuth), accepting an invite for an EXISTING
// admin account must:
//   1. grant + consume the invite (same as the OAuth invite-accept path),
//   2. return requiresSecondFactor WITHOUT a session/bearer,
//   3. refuse authed reads until the factor completes,
//   4. mint the session/bearer only via the normal email-OTP verify leg.
//
//   npx tsx --test server/inviteAcceptSecondFactor.routes.db.test.ts

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db } from "./db";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";

const scryptAsync = promisify(scrypt);
const exec = (q: any) => db.execute(q);
const rows = (r: any): any[] => (r as any)?.rows ?? [];

const created = {
  users: new Set<string>(),
  people: new Set<string>(),
  invites: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

const WL_HOST = "mrp.makesvinyl.com";
const PASSWORD = "t3329-second-factor-pass";

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  // forceProductionAuth closes the dev 2FA bypass at the server-instance
  // level (no NODE_ENV flip → no cross-file race).
  await registerRoutes(httpServer, app, { forceProductionAuth: true });
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
  await db.execute(sql`SELECT 1`);
});

function cookieHeaderFrom(res: Response): string {
  const setCookies = (res.headers as any).getSetCookie?.() as string[] | undefined;
  return (setCookies ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function safeJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return null; }
}

async function seedInvite(email: string): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  const token = "t3329mfa_" + id.replace(/-/g, "");
  await exec(sql`
    INSERT INTO admin_invites
      (id, email, role, role_scope_id, token, expires_at, created_by_user_id, review_status)
    VALUES
      (${id}, ${email}, 'artist', ${null},
       ${token}, ${new Date(Date.now() + 7 * 864e5)}, ${"00000000-0000-0000-0000-000000000001"},
       'approved')
  `);
  created.invites.add(id);
  return { id, token };
}

test("existing-account accept cannot bypass the second factor; email-OTP verify completes it", async () => {
  const tag = randomUUID().slice(0, 8);
  const email = `t3329mfa_${tag}@example.test`;

  // Pre-existing, second-factor-enrolled (email pref) admin account.
  const userId = randomUUID();
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, factor_pref)
    VALUES (${userId}, ${"t3329mfa_" + tag}, ${await hashPassword(PASSWORD)},
            ${"T3329 MFA"}, ${email}, true, 'email')
  `);
  created.users.add(userId);

  const { token: inviteToken } = await seedInvite(email);
  const wl = { host: WL_HOST, "x-forwarded-proto": "https" } as const;

  // Sign-in-to-accept under production auth: grant happens, but NO session
  // or bearer is minted — the response demands the second factor.
  const accept = await fetch(`${baseUrl}/api/invites/${inviteToken}/accept`, {
    method: "POST",
    headers: { ...wl, "content-type": "application/json" },
    body: JSON.stringify({ signin: true, password: PASSWORD }),
  });
  const acceptJson = await safeJson(accept);
  assert.equal(accept.status, 200, `accept returned ${accept.status}: ${JSON.stringify(acceptJson)}`);
  assert.equal(acceptJson?.requiresSecondFactor, true, "must demand the second factor");
  assert.equal(acceptJson?.next, "emailOtp");
  assert.equal(acceptJson?.token, undefined, "must NOT mint a bearer before the factor");

  const cookie = cookieHeaderFrom(accept);
  assert.ok(cookie.includes("connect.sid="), "accept must set the pending-factor session cookie");

  // The pending session must NOT authorize anything.
  const preMe = await fetch(`${baseUrl}/api/me`, { headers: { ...wl, cookie } });
  assert.notEqual(preMe.status, 200, "pending-factor session must not authorize /api/me");

  // The grant side ran (same policy as OAuth invite-accept): invite consumed.
  const spent = await fetch(`${baseUrl}/api/invites/${inviteToken}`, { headers: wl });
  assert.equal(spent.status, 410, "invite must be consumed by the granted accept");

  // Track the granted artist scope for cleanup.
  const ur = rows(await exec(sql`SELECT role_scope_id FROM users WHERE id = ${userId}`));
  if (ur[0]?.role_scope_id) created.people.add(ur[0].role_scope_id);

  // Complete the factor through the NORMAL email-OTP legs.
  const start = await fetch(`${baseUrl}/api/auth/email-otp/start`, {
    method: "POST",
    headers: { ...wl, cookie, "content-type": "application/json" },
  });
  const startJson = await safeJson(start);
  assert.equal(start.status, 200, `otp start returned ${start.status}: ${JSON.stringify(startJson)}`);
  assert.ok(startJson?.devCode, "non-production start must return devCode");

  const verify = await fetch(`${baseUrl}/api/auth/email-otp/verify`, {
    method: "POST",
    headers: { ...wl, cookie, "content-type": "application/json" },
    body: JSON.stringify({ code: startJson.devCode }),
  });
  const verifyJson = await safeJson(verify);
  assert.equal(verify.status, 200, `otp verify returned ${verify.status}: ${JSON.stringify(verifyJson)}`);
  assert.ok(verifyJson?.token, "verify must mint the bearer");

  // Only NOW is the invitee authorized — with the granted artist hat.
  const me = await fetch(`${baseUrl}/api/me/role`, {
    headers: { ...wl, authorization: `Bearer ${verifyJson.token}` },
  });
  const meJson = await safeJson(me);
  assert.equal(me.status, 200, `authed read returned ${me.status}: ${JSON.stringify(meJson)}`);
  assert.equal(meJson?.role, "artist", `grant must be applied: ${JSON.stringify(meJson)}`);
});

after(async () => {
  try {
    for (const id of created.invites) await exec(sql`DELETE FROM admin_invites WHERE id = ${id}`);
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM auth_tokens WHERE admin_user_id = ${id}`);
      await exec(sql`DELETE FROM admin_email_otp WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM user_sessions WHERE sess::text LIKE ${"%" + id + "%"}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
    for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
  } finally {
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
    // shared pool left open for sibling test files; --test-force-exit reaps it.
  }
});
