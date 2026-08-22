// Task #3291 — Estimates & White Label are PAID features, hidden per press
// until an operator flips manufacturers.estimates_white_label_enabled.
//
// Drives the real routes over a loopback socket and proves, fail-closed:
//   1. A press-scoped login on a NOT-unveiled press gets 403 on the estimate
//      routes (list/create/update/delete/send) and the branding GET/PUT +
//      brand-suggest.
//   2. kind=package (saved builds) stays fully open for the same press user —
//      Packages is not part of the paid feature even though it shares routes.
//   3. A super_admin is unaffected either way.
//   4. Flipping the flag on restores press access.
//   5. The public estimate share link and /api/whitelabel/branding stay
//      public (they serve recipients/fans, not press users).
//   6. The unveil flag itself is staff-only on PUT /api/admin/manufacturers/:id
//      — the press cannot self-toggle its own paywall (403, flag unchanged).
//
// Harness mirrors pressEstimateSendGate.routes.db.test.ts. Real DB:
//
//   npx tsx --test server/pressEstimatesUnveil.routes.db.test.ts
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "t3291-test-session-secret";

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

const PASSWORD = "t3291-correct-horse";
let baseUrl = "";
let httpServer: HttpServer | undefined;
let pressId = "";
let adminAuth = { cookie: "", bearer: "" };
let pressAuth = { cookie: "", bearer: "" };
const shareToken = "t3291-" + randomUUID().replace(/-/g, "") + randomUUID().slice(0, 8);
let sentEstimateId = "";

const created = { users: new Set<string>(), presses: new Set<string>(), estimates: new Set<string>() };

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

const apiAs = async (auth: { cookie: string; bearer: string }, method: string, path: string, body?: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-proto": "https",
      ...(auth.cookie ? { cookie: auth.cookie } : {}),
      ...(auth.bearer ? { authorization: `Bearer ${auth.bearer}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function seedLogin(role: string, roleScopeId: string | null): Promise<{ cookie: string; bearer: string; id: string }> {
  const id = randomUUID();
  created.users.add(id);
  const email = `t3291_${role}_${id.slice(0, 8)}@example.test`;
  const pw = await hashPassword(PASSWORD);
  await exec(sql`
    INSERT INTO users (id, email, username, password, display_name, is_admin, role, role_scope_id)
    VALUES (${id}, ${email}, ${email}, ${pw}, ${"T3291 " + role}, true, ${role}, ${roleScopeId})
  `);
  const login = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
    body: JSON.stringify({ username: email, password: PASSWORD, kind: "admin" }),
  });
  assert.equal(login.status, 200, `login failed for ${role}: ${await login.clone().text()}`);
  const body = await login.json();
  return {
    id,
    bearer: String(body.token ?? ""),
    cookie: login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "),
  };
}

const setUnveiled = (on: boolean) =>
  exec(sql`UPDATE manufacturers SET estimates_white_label_enabled = ${on} WHERE id = ${pressId}`);

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

  // Guard against dev-clone schema drift (see memory: createuser full-row).
  await exec(sql`ALTER TABLE manufacturers ADD COLUMN IF NOT EXISTS estimates_white_label_enabled boolean NOT NULL DEFAULT false`);

  pressId = randomUUID();
  created.presses.add(pressId);
  await exec(sql`
    INSERT INTO manufacturers (id, name, does_vinyl)
    VALUES (${pressId}, ${"T3291 Press " + pressId.slice(0, 8)}, true)
  `);

  const admin = await seedLogin("super_admin", null);
  adminAuth = admin;
  const press = await seedLogin("manufacturer", pressId);
  pressAuth = press;

  // A SENT estimate whose public share link must keep working while locked.
  sentEstimateId = randomUUID();
  created.estimates.add(sentEstimateId);
  await exec(sql`
    INSERT INTO press_estimates (id, press_id, kind, display_id, title, status, payload)
    VALUES (${sentEstimateId}, ${pressId}, 'estimate', 'T3291-01', 'T3291 sent', 'Sent',
            ${JSON.stringify({ shareToken, clientName: "T3291 client", totalCents: 100000 })}::jsonb)
  `);
});

after(async () => {
  try {
    for (const id of created.presses) {
      await exec(sql`DELETE FROM press_estimates WHERE press_id = ${id}`);
      await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
    }
    for (const id of created.users) {
      await exec(sql`DELETE FROM user_sessions WHERE sess::text LIKE ${"%" + id + "%"}`);
      await exec(sql`DELETE FROM auth_tokens WHERE admin_user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
  } finally {
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
  }
});

test("locked press: estimate + branding routes 403 the press user, packages stay open", async () => {
  await setUnveiled(false);

  // /me reports the flag off so the portal hides the surfaces.
  const me = await apiAs(pressAuth, "GET", `/api/press/${pressId}/me`);
  assert.equal(me.status, 200);
  assert.equal((await me.json()).estimatesWhiteLabelEnabled, false);

  const list = await apiAs(pressAuth, "GET", `/api/press/${pressId}/estimates?kind=estimate`);
  assert.equal(list.status, 403, "estimate list must 403 while locked");

  const create = await apiAs(pressAuth, "POST", `/api/press/${pressId}/estimates`, { kind: "estimate", title: "locked" });
  assert.equal(create.status, 403, "estimate create must 403 while locked");

  const put = await apiAs(pressAuth, "PUT", `/api/press/${pressId}/estimates/${sentEstimateId}`, { title: "locked rename" });
  assert.equal(put.status, 403, "estimate update must 403 while locked");

  const del = await apiAs(pressAuth, "DELETE", `/api/press/${pressId}/estimates/${sentEstimateId}`);
  assert.equal(del.status, 403, "estimate delete must 403 while locked");

  const send = await apiAs(pressAuth, "POST", `/api/press/${pressId}/estimates/${sentEstimateId}/send`, {
    artistName: "X", recipients: [{ name: "X", email: "x@example.test" }],
  });
  assert.equal(send.status, 403, "estimate send must 403 while locked");

  const brandGet = await apiAs(pressAuth, "GET", `/api/press/${pressId}/branding`);
  assert.equal(brandGet.status, 403, "branding GET must 403 while locked");

  const brandPut = await apiAs(pressAuth, "PUT", `/api/press/${pressId}/branding`, { accentColor: "#123456" });
  assert.equal(brandPut.status, 403, "branding PUT must 403 while locked");

  const suggest = await apiAs(pressAuth, "POST", `/api/press/${pressId}/brand-suggest`, { url: "https://example.com" });
  assert.equal(suggest.status, 403, "brand-suggest must 403 while locked");

  // Saved builds (kind=package) are NOT part of the paid feature.
  const pkgList = await apiAs(pressAuth, "GET", `/api/press/${pressId}/estimates?kind=package`);
  assert.equal(pkgList.status, 200, "package list must stay open while locked");
  const pkgCreate = await apiAs(pressAuth, "POST", `/api/press/${pressId}/estimates`, { kind: "package", title: "T3291 pkg" });
  assert.equal(pkgCreate.status, 201, "package create must stay open while locked");
  const pkg = await pkgCreate.json();
  const pkgPut = await apiAs(pressAuth, "PUT", `/api/press/${pressId}/estimates/${pkg.id}`, { title: "T3291 pkg renamed" });
  assert.equal(pkgPut.status, 200, "package update must stay open while locked");
  const pkgDel = await apiAs(pressAuth, "DELETE", `/api/press/${pressId}/estimates/${pkg.id}`);
  assert.equal(pkgDel.status, 200, "package delete must stay open while locked");
});

test("locked press: super admin keeps full access (god view unaffected)", async () => {
  await setUnveiled(false);
  const list = await apiAs(adminAuth, "GET", `/api/press/${pressId}/estimates?kind=estimate`);
  assert.equal(list.status, 200);
  const brandGet = await apiAs(adminAuth, "GET", `/api/press/${pressId}/branding`);
  assert.equal(brandGet.status, 200);
  const brandPut = await apiAs(adminAuth, "PUT", `/api/press/${pressId}/branding`, { accentColor: "#22AA33" });
  assert.equal(brandPut.status, 200);
  const create = await apiAs(adminAuth, "POST", `/api/press/${pressId}/estimates`, { kind: "estimate", title: "T3291 admin draft" });
  assert.equal(create.status, 201);
  created.estimates.add((await create.json()).id);
});

test("public estimate share link and whitelabel branding stay public while locked", async () => {
  await setUnveiled(false);
  const pub = await fetch(`${baseUrl}/api/estimate-link/${shareToken}`);
  assert.equal(pub.status, 200, "public estimate link must keep working while locked");
  const wl = await fetch(`${baseUrl}/api/whitelabel/branding`);
  assert.equal(wl.status, 200, "public whitelabel branding must stay unauthenticated");
});

test("unveiling restores press access end to end", async () => {
  await setUnveiled(true);
  const me = await apiAs(pressAuth, "GET", `/api/press/${pressId}/me`);
  assert.equal((await me.json()).estimatesWhiteLabelEnabled, true);
  const list = await apiAs(pressAuth, "GET", `/api/press/${pressId}/estimates?kind=estimate`);
  assert.equal(list.status, 200);
  const create = await apiAs(pressAuth, "POST", `/api/press/${pressId}/estimates`, { kind: "estimate", title: "T3291 unveiled draft" });
  assert.equal(create.status, 201, `unveiled create failed: ${await create.clone().text()}`);
  created.estimates.add((await create.json()).id);
  const brandGet = await apiAs(pressAuth, "GET", `/api/press/${pressId}/branding`);
  assert.equal(brandGet.status, 200);
  const brandPut = await apiAs(pressAuth, "PUT", `/api/press/${pressId}/branding`, { contactLine: "T3291 line" });
  assert.equal(brandPut.status, 200);
});

test("the unveil flag is staff-only: press cannot self-toggle via the admin manufacturers PUT", async () => {
  await setUnveiled(false);
  const flip = await apiAs(pressAuth, "PUT", `/api/admin/manufacturers/${pressId}`, { estimatesWhiteLabelEnabled: true });
  assert.equal(flip.status, 403, "press self-toggle must 403");
  const row = (await exec(sql`SELECT estimates_white_label_enabled AS v FROM manufacturers WHERE id = ${pressId}`)) as any;
  assert.equal((row.rows ?? [])[0]?.v, false, "flag must be unchanged after the rejected write");

  const staffFlip = await apiAs(adminAuth, "PUT", `/api/admin/manufacturers/${pressId}`, { estimatesWhiteLabelEnabled: true });
  assert.equal(staffFlip.status, 200, `staff flip failed: ${await staffFlip.clone().text()}`);
  const row2 = (await exec(sql`SELECT estimates_white_label_enabled AS v FROM manufacturers WHERE id = ${pressId}`)) as any;
  assert.equal((row2.rows ?? [])[0]?.v, true, "staff flip must persist");
});
