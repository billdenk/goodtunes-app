// Team accounts roster — GET /api/admin/team-accounts.
//
// The roster is the ACCOUNT-centric complement to the invite directory:
// every non-operator admin account with its scope attachments. Coverage:
//   - super_admin: 200; sees a membership-backed account (sub_role kept)
//     AND a legacy-only account (no memberships rows → attachment synth
//     from users.role/role_scope_id, sub_role null = Owner)
//   - partner (artist) token: 403 (fail closed — requireAdmin admits
//     partners, the requireRole("super_admin") gate must refuse them)
//   - anonymous: 401/403
//
// Same harness as artistAlbumCreateScope.db.test.ts: full route tree over
// a loopback socket, Bearer tokens via storage.createAuthToken. Real DB
// (DATABASE_URL). Every row seeded here is torn down in `after`.
//
//   npx tsx --test server/teamAccounts.db.test.ts
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
  people: new Set<string>(),
  memberships: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let personId = "";
let memberUserId = "";
let legacyUserId = "";
let multiHatUserId = "";
let operatorToken = "";
let artistToken = "";
let personName = "";

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

  const tag = randomUUID().slice(0, 8);
  personName = `TTEAM Artist ${tag}`;
  personId = await seedPerson(personName);

  // Membership-backed teammate: artist-scoped account with an explicit
  // memberships row carrying sub_role='manager'.
  memberUserId = await seedAdminUser("artist", personId, tag + "a");
  const mid = randomUUID();
  await exec(sql`
    INSERT INTO memberships (id, user_id, role, scope_kind, scope_id, sub_role)
    VALUES (${mid}, ${memberUserId}, 'artist', 'artist', ${personId}, 'manager')
  `);
  created.memberships.add(mid);

  // Legacy-only account: same scope via users.role/role_scope_id, NO
  // memberships rows — must still appear via the synth fallback.
  legacyUserId = await seedAdminUser("artist", personId, tag + "b");

  // Multi-hat operator: legacy users.role still says 'artist' but a god
  // membership (scope_id NULL) grants super_admin. Effective role is
  // membership-based, so this account is an OPERATOR and must be
  // excluded from the roster.
  multiHatUserId = await seedAdminUser("artist", personId, tag + "d");
  const gid = randomUUID();
  await exec(sql`
    INSERT INTO memberships (id, user_id, role)
    VALUES (${gid}, ${multiHatUserId}, 'super_admin')
  `);
  created.memberships.add(gid);

  operatorToken = await tokenFor(await seedAdminUser("super_admin", null, tag + "c"));
  artistToken = await tokenFor(memberUserId);
});

async function seedPerson(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO people (id, name) VALUES (${id}, ${name})`);
  created.people.add(id);
  return id;
}

async function seedAdminUser(role: string, scopeId: string | null, tag: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"tteam_" + tag}, ${"x"}, ${"tteam"}, ${"tteam_" + tag + "@example.test"},
            true, ${role}, ${scopeId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "tteamtok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function getRoster(token?: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/api/admin/team-accounts`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

test("operator sees membership-backed and legacy-only accounts", async () => {
  const r = await getRoster(operatorToken);
  assert.equal(r.status, 200);
  const accts = r.json.accounts as any[];
  assert.ok(Array.isArray(accts));

  const member = accts.find((a) => a.id === memberUserId);
  assert.ok(member, "membership-backed account must appear");
  assert.equal(member.attachments.length, 1);
  assert.equal(member.attachments[0].scopeKind, "artist");
  assert.equal(member.attachments[0].scopeId, personId);
  assert.equal(member.attachments[0].subRole, "manager");
  assert.equal(member.attachments[0].scopeName, personName);

  const legacy = accts.find((a) => a.id === legacyUserId);
  assert.ok(legacy, "legacy-only account (no memberships rows) must still appear");
  assert.equal(legacy.attachments.length, 1);
  assert.equal(legacy.attachments[0].scopeKind, "artist");
  assert.equal(legacy.attachments[0].scopeId, personId);
  assert.equal(legacy.attachments[0].subRole, null);
  assert.equal(legacy.attachments[0].scopeName, personName);
});

test("multi-hat operator (god membership + legacy partner role) is excluded", async () => {
  const r = await getRoster(operatorToken);
  assert.equal(r.status, 200);
  const accts = r.json.accounts as any[];
  assert.ok(
    !accts.some((a) => a.id === multiHatUserId),
    "account with a super_admin membership must not appear in the partner roster",
  );
});

test("partner token is refused", async () => {
  const r = await getRoster(artistToken);
  assert.equal(r.status, 403);
});

test("anonymous is refused", async () => {
  const r = await getRoster();
  assert.ok(r.status === 401 || r.status === 403, `expected 401/403, got ${r.status}`);
});

after(async () => {
  try {
    if (created.memberships.size) {
      for (const id of created.memberships) {
        await exec(sql`DELETE FROM memberships WHERE id = ${id}`);
      }
    }
    for (const token of created.tokens) {
      await exec(sql`DELETE FROM auth_tokens WHERE token = ${token}`);
    }
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
    for (const id of created.people) {
      await exec(sql`DELETE FROM people WHERE id = ${id}`);
    }
  } finally {
    await new Promise<void>((resolve) => (httpServer ? httpServer.close(() => resolve()) : resolve()));
    await pool.end();
  }
});
