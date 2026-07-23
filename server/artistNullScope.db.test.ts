// Regression coverage for the null-roleScopeId data leak.
//
// An artist account created via a generic referral link (e.g. MRP's /join/…)
// gets role=artist but roleScopeId=null — no Person record has been linked yet.
// Several admin endpoints previously guarded artist scoping with
//   `if (role === "artist" && roleScopeId) { … }`
// and silently fell through to the UNSCOPED query when roleScopeId was null,
// exposing the entire platform's data to that account.
//
// This test pins that every patched endpoint fails CLOSED (returns [] or 403)
// for a null-scope artist rather than leaking unscoped data.
//
// Endpoints covered:
//   GET /api/admin/orders        → must return []   (commerce.ts, bearer-only)
//   GET /api/artist/summary      → must return 403  (artistReports.ts, session)
//   GET /api/people              → must return []   (routes.ts, session)
//   GET /api/admin/people/:id    → must return 403  (routes.ts, bearer)
//   GET /api/instruments         → must return []   (routes.ts, session)
//   GET /api/non-profits         → must return []   (routes.ts, session)
//   GET /api/non-profits/:id     → must return 403  (routes.ts, session)
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/artistNullScope.db.test.ts
//
// All seeded rows are torn down in the `after` hook.
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
  users: new Set<string>(),
  tokens: new Set<string>(),
  organizations: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let nullArtistUserId = "";
let nullArtistToken = "";

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  // Test-only seam: park a verified admin session the way a finished 2FA
  // login would. Mounted AFTER registerRoutes so the real express-session
  // middleware is already in scope — same pattern as pressDataIsolation.
  app.post("/__test/login", (req, res) => {
    req.session.userId = req.body?.userId;
    (req.session as any).kind = "admin";
    req.session.save(() => res.json({ ok: true }));
  });
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  nullArtistUserId = await seedArtistUser(null);
  nullArtistToken = await tokenFor(nullArtistUserId);
});

// Seed an admin user with role=artist and the given roleScopeId (null = unlinked).
async function seedArtistUser(roleScopeId: string | null): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t2808_" + tag}, ${"x"}, ${"t2808"}, ${"t2808_" + tag + "@example.test"},
            true, ${"artist"}, ${roleScopeId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t2808tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function makeSessionClient(userId: string) {
  let cookie = "";
  async function get(path: string): Promise<{ status: number; json: any }> {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: {
        "x-forwarded-proto": "https",
        ...(cookie ? { cookie } : {}),
      },
    });
    captureCookie(res);
    return { status: res.status, json: await safeJson(res) };
  }
  async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    captureCookie(res);
    return { status: res.status, json: await safeJson(res) };
  }
  function captureCookie(res: Response) {
    const setCookies = (res.headers as any).getSetCookie?.() ?? [];
    for (const sc of setCookies as string[]) {
      const first = sc.split(";")[0];
      if (first.startsWith("connect.sid=")) cookie = first;
    }
  }
  const login = await post("/__test/login", { userId });
  assert.equal(login.status, 200, "test login seam established a session");
  return { get };
}

async function safeJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return null; }
}

async function getWithToken(path: string, token: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.status, json: await safeJson(res) };
}

// ─── Orders (bearer-only commerce.ts route) ───────────────────────────────

test("null-scope artist: GET /api/admin/orders returns [] not all orders", async () => {
  const res = await getWithToken("/api/admin/orders", nullArtistToken);
  assert.equal(res.status, 200, "endpoint succeeds");
  assert.ok(Array.isArray(res.json), "response is an array");
  assert.equal(res.json.length, 0, "null-scope artist sees zero orders");
});

// ─── Artist dashboard summary (session-based requireRole gate) ────────────

test("null-scope artist: GET /api/artist/summary returns 403", async () => {
  const client = await makeSessionClient(nullArtistUserId);
  const res = await client.get("/api/artist/summary");
  assert.equal(res.status, 403, "null-scope artist is 403'd on their own dashboard summary");
});

// ─── People list (session, falls through to full catalog when null) ────────

test("null-scope artist: GET /api/people returns [] (not the full platform roster)", async () => {
  const client = await makeSessionClient(nullArtistUserId);
  const res = await client.get("/api/people");
  assert.equal(res.status, 200, "endpoint succeeds");
  assert.ok(Array.isArray(res.json), "response is an array");
  assert.equal(res.json.length, 0, "null-scope artist sees an empty people list");
});

// ─── Single person (bearer route behind requireAdmin) ─────────────────────

test("null-scope artist: GET /api/admin/people/:id returns 403", async () => {
  // Use a known valid UUID shape — the guard fires before any DB lookup.
  const fakePersonId = randomUUID();
  const res = await getWithToken(`/api/admin/people/${fakePersonId}`, nullArtistToken);
  assert.equal(res.status, 403, "null-scope artist is 403'd on any person detail lookup");
});

// ─── Instruments (session, falls through to full catalog when null) ────────

test("null-scope artist: GET /api/instruments returns [] (not all instruments)", async () => {
  const client = await makeSessionClient(nullArtistUserId);
  const res = await client.get("/api/instruments");
  assert.equal(res.status, 200, "endpoint succeeds");
  assert.ok(Array.isArray(res.json), "response is an array");
  assert.equal(res.json.length, 0, "null-scope artist sees an empty instruments list");
});

// ─── Non-profits (session) ─────────────────────────────────────────────────

test("null-scope artist: GET /api/non-profits returns [] (not all NPOs)", async () => {
  const client = await makeSessionClient(nullArtistUserId);
  const res = await client.get("/api/non-profits");
  assert.equal(res.status, 200, "endpoint succeeds");
  assert.ok(Array.isArray(res.json), "response is an array");
  assert.equal(res.json.length, 0, "null-scope artist sees an empty NPO list");
});

test("null-scope artist: GET /api/non-profits/:id returns 403", async () => {
  const client = await makeSessionClient(nullArtistUserId);
  const fakeOrgId = randomUUID();
  const res = await client.get(`/api/non-profits/${fakeOrgId}`);
  assert.equal(res.status, 403, "null-scope artist is 403'd on any NPO detail lookup");
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
    for (const id of created.organizations) {
      await exec(sql`DELETE FROM organizations WHERE id = ${id}`);
    }
  } finally {
    await pool.end();
  }
});
