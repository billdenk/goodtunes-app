// Task #2719 — regression coverage for the partner-portal invite
// wrapper routes. All four wrappers used to re-dispatch into the main
// POST /api/admin/invites handler via `(app as any)._router.handle(...)`.
// Express 5 removed `app._router`, so every wrapper 500'd with
// "Cannot read properties of undefined (reading 'handle')" — Bill hit
// this inviting a manager from the artist portal. The fix extracts the
// admin handler into a shared named function the wrappers call directly.
// This file drives the real HTTP surface end-to-end so any future break
// in that hand-off (or an Express upgrade regression) goes red:
//
//   1. POST /api/artist/invites (teammate: manager) → non-500 success,
//      invite row created with role=artist pinned to the caller's scope,
//      invite_role=manager, target_person_id=caller's Person. Because a
//      non-super-admin invited an email not on file for the target
//      Person, the claimed-Person gate holds it for review — proof the
//      central handler's logic actually ran.
//   2. POST /api/label/invites (label→artist) → non-500 success, invite
//      row created with referrer pinned to the caller's label.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/partnerInviteWrappers.routes.db.test.ts
//
// Every row seeded (or created by the routes) is torn down in `after`.

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
const rows = (r: any): any[] => (r as any)?.rows ?? [];

const created = {
  people: new Set<string>(),
  labels: new Set<string>(),
  users: new Set<string>(),
  tokens: new Set<string>(),
  perms: new Set<string>(),
  inviteEmails: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

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

after(async () => {
  try {
    for (const email of created.inviteEmails) {
      // Invites created BY the routes under test — also mop up any
      // placeholder Person/Label the label→artist wrapper minted.
      const inv = rows(await exec(sql`SELECT role, role_scope_id FROM admin_invites WHERE LOWER(email) = ${email}`));
      await exec(sql`DELETE FROM admin_invites WHERE LOWER(email) = ${email}`);
      for (const r of inv) {
        if (!r.role_scope_id) continue;
        if (r.role === "artist" && !created.people.has(r.role_scope_id)) created.people.add(r.role_scope_id);
        if (r.role === "label" && !created.labels.has(r.role_scope_id)) created.labels.add(r.role_scope_id);
      }
    }
    for (const id of created.perms) await exec(sql`DELETE FROM partner_permissions WHERE id = ${id}`);
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`).catch(() => {});
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
    for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
    for (const id of created.labels) await exec(sql`DELETE FROM labels WHERE id = ${id}`);
  } finally {
    if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()));
    await pool.end();
  }
});

async function post(path: string, token: string, body: any): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function seedPerson(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO people (id, name, is_group) VALUES (${id}, ${name}, false)`);
  created.people.add(id);
  return id;
}

async function seedLabel(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO labels (id, name) VALUES (${id}, ${name})`);
  created.labels.add(id);
  return id;
}

async function seedUser(opts: { role: string; roleScopeId: string }): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t2719_" + tag}, ${"x"}, ${"t2719"}, ${"t2719_" + tag + "@example.test"},
            true, ${opts.role}, ${opts.roleScopeId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t2719tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function grantInviteSubusers(scopeKind: string, scopeId: string): Promise<void> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO partner_permissions (id, scope_kind, scope_id, invite_subusers)
    VALUES (${id}, ${scopeKind}, ${scopeId}, true)
  `);
  created.perms.add(id);
}

function freshEmail(): string {
  const e = `t2719_invitee_${randomUUID().slice(0, 8)}@example.test`;
  created.inviteEmails.add(e);
  return e;
}

// ─── 1. Artist portal teammate invite (the exact 500 Bill hit) ────────

test("POST /api/artist/invites (manager) → non-500, invite row pinned to caller's scope", async () => {
  const personId = await seedPerson("t2719 Niina " + personSuffix());
  await grantInviteSubusers("artist", personId);
  const userId = await seedUser({ role: "artist", roleScopeId: personId });
  const token = await tokenFor(userId);

  const email = freshEmail();
  const res = await post("/api/artist/invites", token, { email, inviteRole: "manager" });

  assert.ok(res.status < 500, `wrapper must not 500 (got ${res.status}: ${JSON.stringify(res.json)})`);
  assert.equal(res.status, 200, `teammate invite succeeds (got ${res.status}: ${JSON.stringify(res.json)})`);
  assert.equal(res.json?.email, email);

  const inv = rows(await exec(sql`
    SELECT role, role_scope_id, invite_role, target_person_id, review_status
    FROM admin_invites WHERE LOWER(email) = ${email}
  `));
  assert.equal(inv.length, 1, "exactly one invite row created");
  assert.equal(inv[0].role, "artist");
  assert.equal(inv[0].role_scope_id, personId, "scope force-pinned to the caller's own artist");
  assert.equal(inv[0].invite_role, "manager");
  assert.equal(inv[0].target_person_id, personId, "teammate invites target the caller's own Person");
  // Non-super-admin inviter + email not on file for the Person → the
  // central handler's anti-solicitation gate holds it for review. This
  // proves the shared handler's logic actually ran end-to-end.
  assert.equal(inv[0].review_status, "pending_review", "claimed-Person/anti-solicitation gate ran");
  assert.equal(res.json?.reviewStatus, "pending_review");
});

// ─── 2. Label portal invite (label→artist) ────────────────────────────

test("POST /api/label/invites (label→artist) → non-500, referrer pinned to the label", async () => {
  const labelId = await seedLabel("t2719 Label " + personSuffix());
  await grantInviteSubusers("label", labelId);
  const userId = await seedUser({ role: "label", roleScopeId: labelId });
  const token = await tokenFor(userId);

  const email = freshEmail();
  const res = await post("/api/label/invites", token, {
    email,
    name: "t2719 Fresh Artist " + personSuffix(),
    role: "artist",
  });

  assert.ok(res.status < 500, `wrapper must not 500 (got ${res.status}: ${JSON.stringify(res.json)})`);
  assert.equal(res.status, 200, `label→artist invite succeeds (got ${res.status}: ${JSON.stringify(res.json)})`);

  const inv = rows(await exec(sql`
    SELECT role, role_scope_id, referrer_kind, referrer_scope_id
    FROM admin_invites WHERE LOWER(email) = ${email}
  `));
  assert.equal(inv.length, 1, "exactly one invite row created");
  assert.equal(inv[0].role, "artist");
  assert.ok(inv[0].role_scope_id, "placeholder Person minted for the invitee");
  assert.equal(inv[0].referrer_kind, "label", "referrer kind pinned by the label carveout");
  assert.equal(inv[0].referrer_scope_id, labelId, "referrer pinned to the caller's own label");
});

function personSuffix(): string {
  return randomUUID().slice(0, 8);
}
