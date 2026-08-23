// Overview rebuild follow-up — regression coverage for the album-scope gate on
// GET /api/admin/albums/:id/npo-beneficiaries. requireAdmin admits ALL partner
// accounts, and this route previously returned any album's donation split to
// any partner with a valid admin token. The gate now allows operators through
// unconditionally and requires everyone else to hold a membership in one of
// the album's owning scopes (label OR primary artist).
//
//   npx tsx --test server/npoBeneficiariesScope.db.test.ts
//
// Same harness as labelManagerNpoIsolation.db.test.ts: full route tree over a
// loopback socket, Bearer-token auth. Every row seeded here is torn down.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";
import express from "express";

const exec = (q: any) => db.execute(q);

const created = {
  users: new Set<string>(),
  tokens: new Set<string>(),
  people: new Set<string>(),
  albums: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let albumId = "";
let ownerToken = "";     // artist whose person IS the album's primary artist
let strangerToken = "";  // artist partner with a different scope
let operatorToken = "";  // super_admin

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

  // Album owned by a person; that person's user is the in-scope partner.
  const ownerPersonId = randomUUID();
  await exec(sql`INSERT INTO people (id, name) VALUES (${ownerPersonId}, ${"NPO Scope Owner"})`);
  created.people.add(ownerPersonId);

  albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id)
    VALUES (${albumId}, ${"NPO Scope Album"}, ${"NPO Scope Owner"}, ${"/album-placeholder.svg"}, ${ownerPersonId})
  `);
  created.albums.add(albumId);

  ownerToken = await seedUser("artist", ownerPersonId);
  strangerToken = await seedUser("artist", randomUUID());
  operatorToken = await seedUser("super_admin", null);
});

async function seedUser(role: string, scopeId: string | null): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"tnpo_" + tag}, ${"x"}, ${"tnpo"}, ${"tnpo_" + tag + "@example.test"},
            true, ${role}, ${scopeId})
  `);
  created.users.add(id);
  const token = "tnpotok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, id, "admin");
  created.tokens.add(token);
  return token;
}

async function get(path: string, token: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

test("operator reads any album's donation split (200)", async () => {
  const r = await get(`/api/admin/albums/${albumId}/npo-beneficiaries`, operatorToken);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json?.beneficiaries));
});

test("the album's own artist partner reads its split (200)", async () => {
  const r = await get(`/api/admin/albums/${albumId}/npo-beneficiaries`, ownerToken);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json?.beneficiaries));
});

test("an out-of-scope partner is 403'd, never handed the split", async () => {
  const r = await get(`/api/admin/albums/${albumId}/npo-beneficiaries`, strangerToken);
  assert.equal(r.status, 403);
  assert.equal(r.json?.beneficiaries, undefined);
});

after(async () => {
  for (const id of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${id}`).catch(() => {});
  for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
  for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
  for (const id of created.users) await exec(sql`DELETE FROM users WHERE id = ${id}`);
  httpServer?.close();
});
