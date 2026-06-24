// Task #2092 — regression coverage for the server-side scope lockdown that
// keeps a press (manufacturer-role admin) inside its own data island. The
// boundary was verified by hand (curl + a one-off e2e) but had no automated
// test, so a refactor of the auth/scope helpers (pressRoleInfo,
// getUserIdFromRequest, requirePressScope, resolveReportScope) could silently
// re-open it. This locks the guarantee in.
//
// A press scoped to ONE manufacturers row must get:
//   - 403 on the global operator registry GET /api/admin/people
//   - 403 on the global press list GET /api/manufacturers
//   - 403 on ANOTHER press's detail GET /api/manufacturers/:otherId
//   - 403 on ANOTHER press's catalog GET /api/admin/manufacturers/:otherId/catalog
//   - 200 on its OWN detail GET /api/manufacturers/:ownId
//   - 200 on its OWN catalog GET /api/admin/manufacturers/:ownId/catalog
//   - 200 on its OWN format-costs GET /api/admin/manufacturers/:ownId/format-costs
//   - role=manufacturer scoped to its own row on GET /api/partner/reports/scope
//
// The 403/200 boundary on the press guards is exercised under BOTH auth modes:
// a Bearer token (the admin SPA's real path) AND a session cookie. The
// session-only check WAS a real bypass earlier — the SPA presents a token with
// no cookie, so a guard that only read the session let a press slip past every
// gate. `pressRoleInfo` now resolves the caller via getUserIdFromRequest
// (session OR bearer), and this test pins both paths.
//
// /api/partner/reports/scope reads req.session.userId directly (resolveReportScope
// is session-based by design), so it is exercised over the session cookie.
//
// We mount the full route tree exactly as server/index.ts does and exercise it
// over a real loopback socket (127.0.0.1 is an unknown host, so the host/kind
// boundary is skipped and the token/session kind is trusted — same as the
// adminAlbumDelete + identityLink route tests). A test-only /__test/login seam
// (mounted AFTER registerRoutes so the real express-session middleware is in
// scope) parks req.session.userId the way a completed 2FA login would, without
// standing up the full OTP dance.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/pressDataIsolation.db.test.ts
//
// Every row seeded here is tracked and torn down in the `after` hook.
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
  manufacturers: new Set<string>(),
  users: new Set<string>(),
  tokens: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

// IDs shared across the tests, seeded once in `before`.
let ownPressId = "";
let otherPressId = "";
let pressUserId = "";
let pressToken = "";

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
  // middleware (installed inside registerRoutes) is already in scope —
  // req.session is therefore the same store getAuthFromRequest /
  // resolveReportScope read from. registerRoutes adds no catch-all, so this
  // resolves normally.
  app.post("/__test/login", (req, res) => {
    req.session.userId = req.body?.userId;
    (req.session as any).kind = "admin";
    req.session.save(() => res.json({ ok: true }));
  });
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  ownPressId = await seedManufacturer("t2092 Own Press");
  otherPressId = await seedManufacturer("t2092 Other Press");
  pressUserId = await seedManufacturerUser(ownPressId);
  pressToken = await tokenFor(pressUserId);
});

async function seedManufacturer(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${id}, ${name})`);
  created.manufacturers.add(id);
  return id;
}

// Seed an admin user whose ONLY hat is a manufacturer scoped to `pressId`.
// getUserRole / findMembershipForScope synthesize exactly one membership from
// these legacy role columns when the account has no memberships rows, so this
// is sufficient for both the pressRoleInfo guard and requirePressScope.
async function seedManufacturerUser(pressId: string): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t2092_" + tag}, ${"x"}, ${"t2092"}, ${"t2092_" + tag + "@example.test"},
            true, ${"manufacturer"}, ${pressId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t2092tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

// GET with a Bearer token (the admin SPA's real auth path).
async function getWithToken(path: string, token: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.status, json: await safeJson(res) };
}

// A cookie-jar client that authenticates via a real express-session cookie
// (secure + sameSite:none → needs x-forwarded-proto:https with trust proxy on).
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
  // Establish the session before returning the client.
  const login = await post("/__test/login", { userId });
  assert.equal(login.status, 200, "test login seam established a session");
  return { get };
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Bearer-token path (the admin SPA's real auth) ────────────────────

test("BEARER: press is 403'd on the global People registry", async () => {
  const res = await getWithToken("/api/admin/people", pressToken);
  assert.equal(res.status, 403, "a press must never read the global People registry");
});

test("BEARER: press is 403'd on the global press list", async () => {
  const res = await getWithToken("/api/manufacturers", pressToken);
  assert.equal(res.status, 403, "a press can't browse the global press registry");
});

test("BEARER: press is 403'd on ANOTHER press's detail", async () => {
  const res = await getWithToken(`/api/manufacturers/${otherPressId}`, pressToken);
  assert.equal(res.status, 403, "a press can't read another press's detail");
});

test("BEARER: press is 403'd on ANOTHER press's catalog", async () => {
  const res = await getWithToken(`/api/admin/manufacturers/${otherPressId}/catalog`, pressToken);
  assert.equal(res.status, 403, "a press can't read another press's catalog");
});

test("BEARER: press CAN read its OWN detail (200)", async () => {
  const res = await getWithToken(`/api/manufacturers/${ownPressId}`, pressToken);
  assert.equal(res.status, 200, "a press reads its own manufacturer record");
  assert.equal(res.json?.id, ownPressId, "the row returned is the press's own");
});

test("BEARER: press CAN read its OWN catalog (200)", async () => {
  const res = await getWithToken(`/api/admin/manufacturers/${ownPressId}/catalog`, pressToken);
  assert.equal(res.status, 200, "a press reads its own catalog");
});

test("BEARER: press CAN read its OWN format-costs (200)", async () => {
  const res = await getWithToken(`/api/admin/manufacturers/${ownPressId}/format-costs`, pressToken);
  assert.equal(res.status, 200, "a press reads its own format-cost ladder");
});

// ─── Session-cookie path (the bypass that was real earlier) ───────────

test("SESSION: the same boundary holds for a session-authenticated press", async () => {
  const client = await makeSessionClient(pressUserId);

  const people = await client.get("/api/admin/people");
  assert.equal(people.status, 403, "session press is 403'd on global People");

  const list = await client.get("/api/manufacturers");
  assert.equal(list.status, 403, "session press is 403'd on the global press list");

  const otherDetail = await client.get(`/api/manufacturers/${otherPressId}`);
  assert.equal(otherDetail.status, 403, "session press is 403'd on another press's detail");

  const otherCatalog = await client.get(`/api/admin/manufacturers/${otherPressId}/catalog`);
  assert.equal(otherCatalog.status, 403, "session press is 403'd on another press's catalog");

  // The manufacturer detail route is gated by routes.ts requireAdmin, which
  // resolves the caller from the session OR a bearer token, so the press reads
  // its own row over a cookie session.
  const ownDetail = await client.get(`/api/manufacturers/${ownPressId}`);
  assert.equal(ownDetail.status, 200, "session press reads its own detail");
  assert.equal(ownDetail.json?.id, ownPressId);

  // The catalog + format-cost admin endpoints live in commerce.ts behind a
  // SEPARATE, bearer-only requireAdmin (it rejects any request without an
  // Authorization: Bearer header). So a cookie-session press is 401'd on its
  // OWN catalog/format-costs even though the isolation guard above would let
  // it through — these surfaces are reached with a bearer token in practice
  // (covered by the BEARER 200 tests). Locking in the 401 documents that the
  // session bypass cannot reach commerce admin reads, and that the only
  // session-reachable own-read is the detail route above.
  const ownCatalog = await client.get(`/api/admin/manufacturers/${ownPressId}/catalog`);
  assert.equal(ownCatalog.status, 401, "session is bearer-only on commerce catalog reads");

  const ownFormatCosts = await client.get(`/api/admin/manufacturers/${ownPressId}/format-costs`);
  assert.equal(ownFormatCosts.status, 401, "session is bearer-only on commerce format-cost reads");
});

// ─── Partner-reports scope resolves to the press's own row ────────────

test("SESSION: /api/partner/reports/scope resolves role=manufacturer scoped to its own row", async () => {
  // resolveReportScope reads req.session.userId directly, so this surface is
  // session-only by design.
  const client = await makeSessionClient(pressUserId);
  const res = await client.get("/api/partner/reports/scope");
  assert.equal(res.status, 200, "a press resolves a report scope");
  assert.equal(res.json?.role, "manufacturer", "scope role is manufacturer");
  assert.equal(res.json?.roleScopeId, ownPressId, "scope is pinned to the press's own row");
  assert.equal(res.json?.viewAs, null, "a real press caller is not impersonating");
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
    for (const id of created.manufacturers) {
      await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
    }
  } finally {
    await pool.end();
  }
});
