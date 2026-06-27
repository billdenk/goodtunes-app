// Task #2086 / GAP-7 — regression coverage for the server-side registry deny
// that keeps the three reporting-portal partners (label / manager / non_profit)
// out of the operator's global god-view registries. The client App-level route
// guard already bounces these roles off every /admin/* page, and the album list
// / detail / reports surfaces are scope-filtered server-side — but these roles
// carry is_admin=true, so a hand-rolled API call with a valid partner token
// could still read the operator-only registries the nav never links to. The new
// `denyReportingPartnerRegistry` guard closes that, and this test pins it in.
//
// A label / manager / non_profit account must get 403 on every operator-only
// global registry it has no portal for: the press/manufacturer registry + its
// catalogs, the gear (instruments) registry, the label registry, the manager
// registry, the organization/NPO registry, the fulfillment-partner registry
// (both /api/admin/fulfillment-partners and /api/fulfillment-partners), the
// global press-format index, the partner-notification config, the vendor
// (Maker/Reseller) registry list + detail, the global omnibox search, the fan
// customer registry (list/geo/per-customer detail) + editorial playlists, and
// the operator transactional/ops registries (fan orders, pressing orders, the
// wholesale RFQ queue, the admin event log, and payout accounts/stuck).
//
// And, to prove the deny is NOT over-broad, it must STILL get:
//   - 200 on GET /api/admin/people (the AddPeopleMenu roster builder embedded in
//     the label + NPO portals legitimately reads/creates global People rows;
//     denying it would break a working portal feature).
//   - a NON-deny response on GET /api/admin/vendors/:id/gooddeed-services — the
//     one vendor read that backs the NPO-reachable /admin/gooddeed-pricing page,
//     which must fall through to requireAdmin rather than hit the registry deny.
//
// The boundary is exercised under BOTH auth modes: a Bearer token (the admin
// SPA's real path) AND a session cookie. The deny guard resolves the caller via
// getUserIdFromRequest (session OR bearer), exactly like the press guards, so a
// session-only or bearer-only check would each be a real bypass.
//
// Same harness as pressDataIsolation.db.test.ts: mount the full route tree over
// a loopback socket (127.0.0.1 is an unknown host, so the host/kind boundary is
// skipped and the token/session kind is trusted) with a test-only /__test/login
// seam parking req.session.userId the way a finished 2FA login would.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/labelManagerNpoIsolation.db.test.ts
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
  users: new Set<string>(),
  tokens: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

// One account per reporting-portal role, seeded once in `before`. The deny
// guard keys off the ROLE only, so a synthetic role_scope_id (random uuid) is
// enough — these tests never need a valid label / org / person scope row.
type RoleName = "label" | "manager" | "non_profit";
const PARTNER_ROLES: RoleName[] = ["label", "manager", "non_profit"];
const userIdByRole: Record<RoleName, string> = {
  label: "",
  manager: "",
  non_profit: "",
};
const tokenByRole: Record<RoleName, string> = {
  label: "",
  manager: "",
  non_profit: "",
};

// A throwaway id used to address per-:id registry sub-routes. The deny guard
// fires on the prefix BEFORE the route runs, so the id never needs to exist.
const DUMMY_ID = randomUUID();

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  // Test-only seam: park a verified admin session the way a finished 2FA login
  // would. Mounted AFTER registerRoutes so the real express-session middleware
  // is already in scope (same store getAuthFromRequest / resolveReportScope
  // read from). registerRoutes adds no catch-all, so this resolves normally.
  app.post("/__test/login", (req, res) => {
    req.session.userId = req.body?.userId;
    (req.session as any).kind = "admin";
    req.session.save(() => res.json({ ok: true }));
  });
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  for (const role of PARTNER_ROLES) {
    const userId = await seedPartnerUser(role);
    userIdByRole[role] = userId;
    tokenByRole[role] = await tokenFor(userId);
  }
});

// Seed an admin user whose ONLY hat is one of the three reporting-portal roles.
// getUserRole synthesizes exactly one membership from these legacy role columns
// when the account has no memberships rows, so this is sufficient for the deny
// guard's role lookup.
async function seedPartnerUser(role: RoleName): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t2086_" + tag}, ${"x"}, ${"t2086"}, ${"t2086_" + tag + "@example.test"},
            true, ${role}, ${randomUUID()})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t2086tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function getWithToken(path: string, token: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.status, json: await safeJson(res) };
}

// A cookie-jar client that authenticates via a real express-session cookie
// (secure + sameSite:lax → needs x-forwarded-proto:https with trust proxy on).
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
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// The operator-only global registries these roles must NEVER read. Each is a
// real route behind requireAdmin; without the deny guard a partner token would
// read operator data there.
const DENIED_REGISTRY_PATHS = [
  "/api/manufacturers",
  `/api/manufacturers/${DUMMY_ID}`,
  `/api/admin/manufacturers/${DUMMY_ID}/catalog`,
  `/api/admin/instruments/${DUMMY_ID}/usage`,
  `/api/admin/labels/${DUMMY_ID}/invited-press`,
  "/api/admin/managers",
  "/api/admin/organizations",
  "/api/admin/fulfillment-partners",
  `/api/admin/fulfillment-partners/${DUMMY_ID}`,
  "/api/fulfillment-partners",
  `/api/fulfillment-partners/${DUMMY_ID}`,
  "/api/admin/press-formats",
  `/api/admin/partner-notifications/manufacturer/${DUMMY_ID}/recipients`,
  // The vendor (Maker/Reseller) registry: list + detail are denied to all three
  // reporting roles. Only the GET .../:id/gooddeed-services read is carved out
  // (exercised separately below).
  "/api/admin/vendors",
  `/api/admin/vendors/${DUMMY_ID}`,
  // Global omnibox + fan customer registry + editorial playlists. Search returns
  // people/vendors/labels/customers-with-email/etc in one call; customers is the
  // fan PII registry (list, geo map, per-customer detail). The artist-only scoped
  // customer branch is unaffected (deny covers only label/manager/non_profit).
  "/api/admin/search?q=t2086_no_such",
  "/api/admin/customers",
  "/api/admin/customers/geo",
  `/api/admin/customers/${DUMMY_ID}`,
  `/api/admin/playlists/${DUMMY_ID}`,
  // Operator-only transactional + ops registries. The /api/admin/orders and
  // /api/admin/payouts handlers live in commerce.ts / payouts.ts, which
  // registerRoutes mounts AFTER the deny block — so the prefix mount still wins.
  "/api/admin/orders",
  "/api/admin/pressing-orders",
  "/api/admin/rfqs",
  `/api/admin/rfqs/${DUMMY_ID}`,
  "/api/admin/events/recent",
  "/api/admin/payouts/accounts",
  "/api/admin/payouts/stuck",
];

// The exact body the deny guard emits, so the vendors carve-out test can prove a
// response came from the deny (vs. a legitimate downstream 403/404).
const DENY_MESSAGE = "Out of scope for this partner account.";
// The one vendor sub-path the deny guard must NOT block: the GoodDeed-services
// read that backs the NPO-reachable /admin/gooddeed-pricing page.
const VENDOR_GOODDEED_PATH = `/api/admin/vendors/${DUMMY_ID}/gooddeed-services`;
// The carve-out is EXACT — only `/:id/gooddeed-services` (optionally a trailing
// slash) falls through to requireAdmin. A nested sub-path must NOT; it falls back
// to the registry deny. Pinning this stops a future regex loosening from silently
// re-opening a vendor sub-route under the carve-out.
const VENDOR_GOODDEED_SUBPATH = `/api/admin/vendors/${DUMMY_ID}/gooddeed-services/extra`;

// ─── Bearer-token path (the admin SPA's real auth) ────────────────────

for (const role of PARTNER_ROLES) {
  test(`BEARER: ${role} is 403'd on every operator global registry`, async () => {
    for (const path of DENIED_REGISTRY_PATHS) {
      const res = await getWithToken(path, tokenByRole[role]);
      assert.equal(
        res.status,
        403,
        `${role} must be denied the operator registry ${path}`,
      );
    }
  });
}

// ─── The deny is NOT over-broad: People stays open ────────────────────

for (const role of PARTNER_ROLES) {
  test(`BEARER: ${role} CAN still reach the shared People roster builder (200)`, async () => {
    // GET /api/admin/people backs the AddPeopleMenu roster builder embedded in
    // the label + NPO portals. It is deliberately excluded from the registry
    // deny set; a 403 here would mean the deny went too far and broke a working
    // portal feature.
    const res = await getWithToken("/api/admin/people?q=t2086_no_such_person", tokenByRole[role]);
    assert.equal(
      res.status,
      200,
      `${role} must keep access to the shared People roster builder`,
    );
  });
}

// ─── The vendors carve-out: the GoodDeed-services read stays reachable ──

for (const role of PARTNER_ROLES) {
  test(`BEARER: ${role} keeps the vendor GoodDeed-services read (not the registry)`, async () => {
    // The vendor list + detail are already covered by DENIED_REGISTRY_PATHS
    // above. Here we prove the carve-out: the single GET .../:id/gooddeed-services
    // read backs the NPO gooddeed-pricing page and must fall THROUGH the deny
    // guard to requireAdmin. With a nonexistent vendor id the handler answers
    // 404 ("Vendor not found") — never the deny guard's 403 body. Asserting on
    // the body (not just the status) is what proves the deny guard didn't fire.
    const res = await getWithToken(VENDOR_GOODDEED_PATH, tokenByRole[role]);
    assert.notEqual(
      res.json?.message,
      DENY_MESSAGE,
      `${role} GoodDeed-services read must not be short-circuited by the registry deny`,
    );
  });
}

// ─── The carve-out is exact: a NESTED gooddeed-services sub-path is denied ──

for (const role of PARTNER_ROLES) {
  test(`BEARER: ${role} is denied a NESTED vendor gooddeed-services sub-path`, async () => {
    // Only `/:id/gooddeed-services` itself is carved out. A deeper sub-path must
    // hit the registry deny (asserting the body proves it was the deny, not a
    // downstream 404), locking the tightened exact-match regex.
    const res = await getWithToken(VENDOR_GOODDEED_SUBPATH, tokenByRole[role]);
    assert.equal(res.status, 403, `${role} must be denied ${VENDOR_GOODDEED_SUBPATH}`);
    assert.equal(
      res.json?.message,
      DENY_MESSAGE,
      `${role} nested gooddeed-services sub-path must hit the registry deny, not fall through`,
    );
  });
}

// ─── Session-cookie path (a session-only guard would be a real bypass) ─

test("SESSION: the registry deny holds for a session-authenticated label", async () => {
  const client = await makeSessionClient(userIdByRole.label);
  for (const path of DENIED_REGISTRY_PATHS) {
    const res = await client.get(path);
    assert.equal(res.status, 403, `session label is 403'd on ${path}`);
  }
  // People still open over a session cookie too.
  const people = await client.get("/api/admin/people?q=t2086_no_such_person");
  assert.equal(people.status, 200, "session label keeps the People roster builder");
  // …and the vendor GoodDeed-services carve-out still falls through.
  const gd = await client.get(VENDOR_GOODDEED_PATH);
  assert.notEqual(
    gd.json?.message,
    DENY_MESSAGE,
    "session label keeps the vendor GoodDeed-services read",
  );
  // …but the exact carve-out doesn't leak to a nested sub-path over a session.
  const gdSub = await client.get(VENDOR_GOODDEED_SUBPATH);
  assert.equal(
    gdSub.status,
    403,
    "session label is denied a nested vendor gooddeed-services sub-path",
  );
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
  } finally {
    await pool.end();
  }
});
