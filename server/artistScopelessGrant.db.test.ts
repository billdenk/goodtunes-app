// Task #2866 — regression coverage for accept-time auto-Person creation
// when an artist invite has no roleScopeId.
//
// Before this fix, accepting such an invite handed the account an artist
// membership with scope=null — no catalog scope, invisible in People list.
// The fix in applyAdminInviteGrant now auto-creates a Person from the
// user's display name and wires users.role_scope_id + the memberships row.
//
// This file drives the accept endpoint (POST /invite/:token/accept)
// against a real Postgres so the SQL side-effects are verified end-to-end:
//
//   1. Accepting a person-less artist invite creates a new Person row.
//   2. users.role_scope_id is set to that Person's id.
//   3. A memberships row with scope_kind='artist' and the correct scope_id
//      exists (and is not a NULL-scope god-hat row).
//   4. Accepting an invite that ALREADY has a roleScopeId does NOT create
//      a second Person (the existing scope is preserved).
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/artistScopelessGrant.db.test.ts
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
const rows = (r: any): any[] => (r as any)?.rows ?? [];

const created = {
  users: new Set<string>(),
  people: new Set<string>(),
  invites: new Set<string>(),
  tokens: new Set<string>(),
  memberships: new Set<string>(), // user_ids whose memberships we want to clean up
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

async function safeJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return null; }
}

/** Seed an admin_invites row with a fresh token. roleScopeId may be null. */
async function seedInvite(opts: {
  email: string;
  role: string;
  roleScopeId?: string | null;
}): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  const token = "t2866tok_" + id.replace(/-/g, "");
  await exec(sql`
    INSERT INTO admin_invites
      (id, email, role, role_scope_id, token, expires_at, created_by_user_id, review_status)
    VALUES
      (${id}, ${opts.email}, ${opts.role}, ${opts.roleScopeId ?? null},
       ${token}, ${new Date(Date.now() + 7 * 864e5)}, ${"00000000-0000-0000-0000-000000000001"},
       'approved')
  `);
  created.invites.add(id);
  return { id, token };
}

/** POST /api/invites/:token/accept with a fresh username + password. */
async function acceptInvite(
  token: string,
  username: string,
  displayName: string,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/api/invites/${token}/accept`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-proto": "https",
    },
    body: JSON.stringify({
      username,
      displayName,
      password: "Password123!",
    }),
  });
  return { status: res.status, json: await safeJson(res) };
}

// ─── Test 1: accept with NO scope → Person auto-created ──────────────────

test("accept scopeless artist invite: auto-creates a Person and wires scope", async () => {
  const tag = randomUUID().slice(0, 8);
  const email = `t2866_noscp_${tag}@example.test`;
  const { token } = await seedInvite({ email, role: "artist", roleScopeId: null });

  const result = await acceptInvite(token, `t2866u_${tag}`, "T2866 Artist");
  assert.equal(result.status, 200, `accept returned ${result.status}: ${JSON.stringify(result.json)}`);

  // Find the created user by email
  const ur = rows(await exec(sql`SELECT id, role_scope_id FROM users WHERE email = ${email} LIMIT 1`));
  assert.equal(ur.length, 1, "users row was created");
  const userId = ur[0].id as string;
  const scopeId = ur[0].role_scope_id as string | null;
  created.users.add(userId);
  created.memberships.add(userId);

  assert.ok(scopeId && scopeId.length > 0, "users.role_scope_id must be set (not null/empty)");

  // Person row must exist
  const pr = rows(await exec(sql`SELECT id, name FROM people WHERE id = ${scopeId} LIMIT 1`));
  assert.equal(pr.length, 1, "a Person row was auto-created for the scopeless artist");
  created.people.add(pr[0].id);

  // memberships must have the correct scoped row
  const mr = rows(await exec(sql`
    SELECT scope_kind, scope_id FROM memberships
    WHERE user_id = ${userId} AND role = 'artist'
  `));
  const scoped = mr.filter((m: any) => m.scope_id !== null && m.scope_id !== "");
  assert.equal(scoped.length, 1, "exactly one scoped artist membership should exist");
  assert.equal(scoped[0].scope_kind, "artist", "scope_kind must be 'artist'");
  assert.equal(scoped[0].scope_id, scopeId, "memberships.scope_id must match users.role_scope_id");

  // Must NOT have a NULL-scope artist membership (that's the god-hat slot, wrong for artist)
  const nullScoped = mr.filter((m: any) => m.scope_id === null || m.scope_id === "");
  assert.equal(nullScoped.length, 0, "no NULL-scope artist membership should exist");
});

// ─── Test 2: accept with an existing scope → Person NOT duplicated ────────

test("accept artist invite with existing Person: scope is preserved, no extra Person created", async () => {
  const tag = randomUUID().slice(0, 8);
  const email = `t2866_hascope_${tag}@example.test`;

  // Pre-seed a Person
  const person = await storage.createPerson({ name: `T2866 Existing ${tag}`, isGroup: false } as any);
  created.people.add(person.id);

  const { token } = await seedInvite({ email, role: "artist", roleScopeId: person.id });

  const result = await acceptInvite(token, `t2866v_${tag}`, "T2866 Scoped Artist");
  assert.equal(result.status, 200, `accept returned ${result.status}: ${JSON.stringify(result.json)}`);

  // Find the created user by email
  const ur = rows(await exec(sql`SELECT id, role_scope_id FROM users WHERE email = ${email} LIMIT 1`));
  assert.equal(ur.length, 1, "users row was created");
  const userId = ur[0].id as string;
  created.users.add(userId);
  created.memberships.add(userId);

  assert.equal(ur[0].role_scope_id, person.id, "role_scope_id must point to the pre-seeded Person");

  // Confirm no extra Person was created for this email
  const extraPeople = rows(await exec(sql`
    SELECT id FROM people WHERE contact_email = ${email}
  `));
  assert.equal(extraPeople.length, 0, "no extra Person should be created when invite already had a scope");

  // Check memberships scope
  const mr = rows(await exec(sql`
    SELECT scope_kind, scope_id FROM memberships
    WHERE user_id = ${userId} AND role = 'artist'
  `));
  const scoped = mr.filter((m: any) => m.scope_id !== null);
  assert.equal(scoped.length, 1, "exactly one scoped artist membership");
  assert.equal(scoped[0].scope_id, person.id, "membership scope_id matches pre-seeded Person");
});

// ─── Teardown ─────────────────────────────────────────────────────────────

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));

    // Remove in FK-safe order: memberships → users → people → invites
    for (const userId of created.memberships) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${userId}`).catch(() => {});
    }
    for (const userId of created.users) {
      await exec(sql`DELETE FROM auth_tokens WHERE admin_user_id = ${userId}`).catch(() => {});
      await exec(sql`DELETE FROM users WHERE id = ${userId}`).catch(() => {});
    }
    for (const personId of created.people) {
      await exec(sql`DELETE FROM people WHERE id = ${personId}`).catch(() => {});
    }
    for (const inviteId of created.invites) {
      await exec(sql`DELETE FROM admin_invites WHERE id = ${inviteId}`).catch(() => {});
    }
  } finally {
    await pool.end();
  }
});
