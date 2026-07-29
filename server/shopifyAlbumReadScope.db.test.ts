// Task #2925 — regression coverage for album-scope gating on the Shopify
// READ routes under /api/admin/albums/:id/*.
//
// requireAdmin admits ALL partner accounts, and before this task the GET
// routes (shopify-push / shopify-mappings / shopify-sales) had no album
// scope gate at all — any partner could read any album's push metadata,
// audit trail and store mappings, and the shopify-push stores list leaked
// EVERY connected store's name platform-wide.
//
// Locked-in behavior:
//   - out-of-scope artist → 403 on all three GETs
//   - in-scope artist holding map_shopify → 200, and the shopify-push
//     stores list contains ONLY stores attributed to their own scope
//   - operator (super_admin) → 200 with the full stores list
//
// Same harness as artistAlbumCreateScope.db.test.ts: full route tree over
// a loopback socket, Bearer tokens via storage.createAuthToken. Real DB.
// Every row seeded here is torn down in `after`.
//
//   npx tsx --test server/shopifyAlbumReadScope.db.test.ts
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
  albums: new Set<string>(),
  stores: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let ownScopeId = "";
let otherScopeId = "";
let ownAlbumId = "";
let otherAlbumId = "";
let ownStoreId = "";
let otherStoreId = "";
let inScopeToken = "";
let outOfScopeToken = "";
let operatorToken = "";

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
  ownScopeId = await seedPerson(`T2925 Own ${tag}`);
  otherScopeId = await seedPerson(`T2925 Other ${tag}`);
  ownAlbumId = await seedAlbum(ownScopeId, `T2925 Own Album ${tag}`);
  otherAlbumId = await seedAlbum(otherScopeId, `T2925 Other Album ${tag}`);
  ownStoreId = await seedStore(ownScopeId, `t2925-own-${tag}.myshopify.com`);
  otherStoreId = await seedStore(otherScopeId, `t2925-other-${tag}.myshopify.com`);

  const inScopeUser = await seedAdminUser("artist", ownScopeId, tag + "a");
  // map_shopify is NOT an owner-self-serve verb — grant it on the scope.
  await exec(sql`
    INSERT INTO partner_permissions (scope_kind, scope_id, map_shopify)
    VALUES ('artist', ${ownScopeId}, true)
    ON CONFLICT (scope_kind, scope_id) DO UPDATE SET map_shopify = true
  `);
  inScopeToken = await tokenFor(inScopeUser);
  outOfScopeToken = await tokenFor(await seedAdminUser("artist", otherScopeId, tag + "b"));
  operatorToken = await tokenFor(await seedAdminUser("super_admin", null, tag + "c"));
});

async function seedPerson(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO people (id, name) VALUES (${id}, ${name})`);
  created.people.add(id);
  return id;
}

async function seedAlbum(primaryArtistId: string, title: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id)
    VALUES (${id}, ${title}, ${"T2925"}, ${"/album-placeholder.svg"}, ${primaryArtistId})
  `);
  created.albums.add(id);
  return id;
}

async function seedStore(personId: string, shopDomain: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO shopify_stores (id, shop_domain, store_name, access_token, person_id)
    VALUES (${id}, ${shopDomain}, ${shopDomain}, ${"x"}, ${personId})
  `);
  created.stores.add(id);
  return id;
}

async function seedAdminUser(role: string, scopeId: string | null, tag: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t2925_" + tag}, ${"x"}, ${"t2925"}, ${"t2925_" + tag + "@example.test"},
            true, ${role}, ${scopeId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t2925tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

function get(path: string, token: string) {
  return fetch(baseUrl + path, { headers: { Authorization: `Bearer ${token}` } });
}

const READ_PATHS = (albumId: string) => [
  `/api/admin/albums/${albumId}/shopify-push`,
  `/api/admin/albums/${albumId}/shopify-mappings`,
  `/api/admin/albums/${albumId}/shopify-sales`,
];

test("out-of-scope artist is 403'd on every Shopify read route", async () => {
  for (const path of READ_PATHS(ownAlbumId)) {
    const res = await get(path, outOfScopeToken);
    assert.equal(res.status, 403, `${path} should 403 for an out-of-scope partner`);
  }
});

test("in-scope artist with map_shopify reads their own album (200)", async () => {
  for (const path of READ_PATHS(ownAlbumId)) {
    const res = await get(path, inScopeToken);
    assert.equal(res.status, 200, `${path} should 200 for the in-scope partner`);
  }
});

test("shopify-push stores list is scoped to the partner's own stores", async () => {
  const res = await get(`/api/admin/albums/${ownAlbumId}/shopify-push`, inScopeToken);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { stores: Array<{ id: string }> };
  const ids = body.stores.map((s) => s.id);
  assert.ok(ids.includes(ownStoreId), "partner must see their own store");
  assert.ok(!ids.includes(otherStoreId), "partner must NOT see another scope's store");
});

test("operator sees the full stores list", async () => {
  const res = await get(`/api/admin/albums/${ownAlbumId}/shopify-push`, operatorToken);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { stores: Array<{ id: string }> };
  const ids = body.stores.map((s) => s.id);
  assert.ok(ids.includes(ownStoreId) && ids.includes(otherStoreId), "operator sees every connected store");
});

test("operator reads the other album too (no partner gate for operators)", async () => {
  for (const path of READ_PATHS(otherAlbumId)) {
    const res = await get(path, operatorToken);
    assert.equal(res.status, 200, `${path} should 200 for an operator`);
  }
});

after(async () => {
  for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
  await exec(sql`DELETE FROM partner_permissions WHERE scope_kind='artist' AND scope_id = ${ownScopeId}`);
  for (const id of created.stores) await exec(sql`DELETE FROM shopify_stores WHERE id = ${id}`);
  for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
  for (const id of created.users) {
    await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
    await exec(sql`DELETE FROM users WHERE id = ${id}`);
  }
  for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
  httpServer?.close();
  await pool.end().catch(() => {});
});
