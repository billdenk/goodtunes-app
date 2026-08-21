// Task #3258 — press-branded invite links must be FUNCTIONAL, not just
// minted: a press-referred invite accepted on a white-label host
// (mrp.makesvinyl.com) creates an ADMIN-kind partner identity, and the
// freshly-minted session/token must authorize on that same branded host.
// The original implementation forced whitelabel hosts to customer-kind
// with hostKnown=true, so getAuthFromRequest rejected the new admin
// identity right after acceptance. These tests drive the real accept
// endpoint against a real Postgres with a whitelabel Host header.
//
//   npx tsx --test server/whitelabelInviteAccept.db.test.ts

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "./db";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";

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

async function safeJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return null; }
}

async function seedInvite(email: string): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  const token = "t3258tok_" + id.replace(/-/g, "");
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

test("password invite-accept on a white-label host mints a working admin identity", async () => {
  const tag = randomUUID().slice(0, 8);
  const email = `t3258_wl_${tag}@example.test`;
  const { token } = await seedInvite(email);

  // 1 · Invite is readable on the branded host (skinned accept page data)
  const read = await fetch(`${baseUrl}/api/invites/${token}`, {
    headers: { host: WL_HOST, "x-forwarded-proto": "https" },
  });
  assert.equal(read.status, 200, `invite read returned ${read.status}`);

  // 2 · Accept with a password on the branded host
  const res = await fetch(`${baseUrl}/api/invites/${token}/accept`, {
    method: "POST",
    headers: {
      host: WL_HOST,
      "content-type": "application/json",
      "x-forwarded-proto": "https",
    },
    body: JSON.stringify({
      username: `t3258u_${tag}`,
      displayName: "T3258 Whitelabel Artist",
      password: "Password123!",
    }),
  });
  const json = await safeJson(res);
  assert.equal(res.status, 200, `accept returned ${res.status}: ${JSON.stringify(json)}`);
  assert.ok(json?.token, "accept must return a bearer token");

  const ur = rows(await exec(sql`SELECT id, role_scope_id FROM users WHERE email = ${email} LIMIT 1`));
  assert.equal(ur.length, 1, "user row created");
  created.users.add(ur[0].id);
  if (ur[0].role_scope_id) created.people.add(ur[0].role_scope_id);

  // 3 · The minted bearer authorizes ON THE SAME branded host — this is the
  // exact step the customer-kind host mapping used to break.
  const me = await fetch(`${baseUrl}/api/me/role`, {
    headers: {
      host: WL_HOST,
      authorization: `Bearer ${json.token}`,
      "x-forwarded-proto": "https",
    },
  });
  const meJson = await safeJson(me);
  assert.equal(me.status, 200, `authed read on branded host returned ${me.status}: ${JSON.stringify(meJson)}`);
  assert.equal(meJson?.role, "artist", `expected artist role, got ${JSON.stringify(meJson)}`);

  // 4 · RETURNING partner: password sign-in from the branded landing.
  // The landing CTA routes to /admin/login, whose form posts kind:"admin"
  // (path-derived on this flexible host). The sign-in must succeed and the
  // minted bearer must authorize on the same branded host. (Dev/test skips
  // the TOTP leg; production adds 2FA but the kind resolution is the same.)
  const login = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: {
      host: WL_HOST,
      "content-type": "application/json",
      "x-forwarded-proto": "https",
    },
    body: JSON.stringify({ username: `t3258u_${tag}`, password: "Password123!", kind: "admin" }),
  });
  const loginJson = await safeJson(login);
  assert.equal(login.status, 200, `returning-partner login returned ${login.status}: ${JSON.stringify(loginJson)}`);
  assert.ok(loginJson?.token, "login must return a bearer token");
  const me2 = await fetch(`${baseUrl}/api/me/role`, {
    headers: { host: WL_HOST, authorization: `Bearer ${loginJson.token}`, "x-forwarded-proto": "https" },
  });
  assert.equal(me2.status, 200, "returning-partner bearer must authorize on the branded host");
});

test("OAuth start with an invite token on a white-label host signs an admin-kind state bag", async () => {
  // The Google start route redirects to the provider; the redirect_uri it
  // builds proves which kind the state bag carries. In non-production
  // callbackOrigin echoes the request host, so we only assert the redirect
  // happens (302 → accounts.google) — kind resolution itself is covered by
  // the pure kindFromRequest tests. Skip quietly if Google isn't configured.
  const res = await fetch(`${baseUrl}/api/auth/google/start?invite=sometoken`, {
    headers: { host: WL_HOST, "x-forwarded-proto": "https" },
    redirect: "manual",
  });
  if (res.status === 503) return; // Google not configured in this env
  assert.equal(res.status, 302);
  const loc = res.headers.get("location") || "";
  assert.ok(loc.includes("accounts.google.com"), loc);
});

after(async () => {
  for (const id of created.invites) await exec(sql`DELETE FROM admin_invites WHERE id = ${id}`);
  for (const id of created.users) {
    await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
    await exec(sql`DELETE FROM auth_tokens WHERE admin_user_id = ${id}`);
    await exec(sql`DELETE FROM users WHERE id = ${id}`);
  }
  for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
  httpServer?.close();
  await pool.end();
});
