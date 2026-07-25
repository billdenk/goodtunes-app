// #2820 — regression coverage for artist-scoped album creation.
//
// POST /api/admin/albums is gated by requireAdmin, which admits partner
// accounts. An artist-scoped account must only be able to create albums
// under its OWN person scope:
//   - artist posting an arbitrary primaryArtistId → 403
//   - artist posting no primaryArtistId → created with their own scope forced
//   - scope-less artist → 403 (fails closed)
//   - operator (super_admin) keeps free choice of primaryArtistId
//
// Same harness as partnerOrderPeopleScope.db.test.ts: full route tree over a
// loopback socket, Bearer tokens via storage.createAuthToken. Real DB
// (DATABASE_URL). Every row seeded here is torn down in `after`.
//
//   npx tsx --test server/artistAlbumCreateScope.db.test.ts
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
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let artistPersonId = "";
let otherPersonId = "";
let scopedArtistToken = "";
let scopelessArtistToken = "";
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

  artistPersonId = await seedPerson(`T2820 Artist ${tag}`);
  otherPersonId = await seedPerson(`T2820 Other ${tag}`);

  scopedArtistToken = await tokenFor(await seedAdminUser("artist", artistPersonId, tag + "a"));
  scopelessArtistToken = await tokenFor(await seedAdminUser("artist", null, tag + "b"));
  operatorToken = await tokenFor(await seedAdminUser("super_admin", null, tag + "c"));
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
    VALUES (${id}, ${"t2820_" + tag}, ${"x"}, ${"t2820"}, ${"t2820_" + tag + "@example.test"},
            true, ${role}, ${scopeId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t2820tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function postAlbum(
  token: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/api/admin/albums`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      title: `T2820 Album ${randomUUID().slice(0, 8)}`,
      artist: "T2820",
      artwork: "/album-placeholder.svg",
      ...body,
    }),
  });
  let json: any = null;
  try { json = await res.json(); } catch {}
  if (res.status === 201 || res.status === 200) {
    const id = json?.id ?? json?.album?.id;
    if (id) created.albums.add(String(id));
  }
  return { status: res.status, json };
}

test("scoped artist posting a foreign primaryArtistId is rejected", async () => {
  const r = await postAlbum(scopedArtistToken, { primaryArtistId: otherPersonId });
  assert.equal(r.status, 403);
});

test("scoped artist creating without primaryArtistId gets their own scope forced", async () => {
  const r = await postAlbum(scopedArtistToken, {});
  assert.ok(r.status === 200 || r.status === 201, `expected create, got ${r.status}`);
  const id = r.json?.id ?? r.json?.album?.id;
  assert.ok(id, "create response carries the album id");
  const row = await exec(sql`SELECT primary_artist_id FROM albums WHERE id = ${String(id)}`);
  assert.equal(((row as any).rows ?? [])[0]?.primary_artist_id, artistPersonId);
});

test("scoped artist posting their OWN primaryArtistId is allowed", async () => {
  const r = await postAlbum(scopedArtistToken, { primaryArtistId: artistPersonId });
  assert.ok(r.status === 200 || r.status === 201, `expected create, got ${r.status}`);
});

test("scope-less artist cannot create albums at all", async () => {
  const r = await postAlbum(scopelessArtistToken, {});
  assert.equal(r.status, 403);
});

test("artist cannot seed an album via from-apple-url (operator-only)", async () => {
  const res = await fetch(`${baseUrl}/api/admin/albums/from-apple-url`, {
    method: "POST",
    headers: { authorization: `Bearer ${scopedArtistToken}`, "content-type": "application/json" },
    body: JSON.stringify({ url: "https://music.apple.com/us/album/test/123456789" }),
  });
  assert.equal(res.status, 403);
});

test("operator keeps free choice of primaryArtistId", async () => {
  const r = await postAlbum(operatorToken, { primaryArtistId: otherPersonId });
  assert.ok(r.status === 200 || r.status === 201, `expected create, got ${r.status}`);
  const id = r.json?.id ?? r.json?.album?.id;
  const row = await exec(sql`SELECT primary_artist_id FROM albums WHERE id = ${String(id)}`);
  assert.equal(((row as any).rows ?? [])[0]?.primary_artist_id, otherPersonId);
});

after(async () => {
  for (const id of created.albums) {
    await exec(sql`DELETE FROM albums WHERE id = ${id}`);
  }
  for (const t of created.tokens) {
    await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
  }
  for (const id of created.users) {
    await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
    await exec(sql`DELETE FROM users WHERE id = ${id}`);
  }
  for (const id of created.people) {
    await exec(sql`DELETE FROM people WHERE id = ${id}`);
  }
  try { httpServer?.close(); } catch {}
  try { await pool.end(); } catch {}
});
