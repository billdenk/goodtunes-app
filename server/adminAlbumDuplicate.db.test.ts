// Task #1494 — authorization coverage for POST /api/admin/albums/:id/duplicate.
//
// Duplicating a release mints a brand-new draft album rather than editing an
// existing scoped one, so it is intentionally OPERATOR-ONLY — it is NOT a
// partner-permission verb. Because partner (artist/label) accounts are also
// `isAdmin`, `requireAdmin` alone is not enough; the route resolves the role
// and rejects non-operators with a 403. These tests pin that boundary so it
// can't regress silently:
//
//   1. super_admin / admin → 201 + a fresh isPrepping draft titled "… (Copy)".
//   2. An artist partner — even WITH edit_metadata granted — → 403, and NO
//      new album is created (the partner-permission grant must not buy access
//      to duplication).
//
// Same harness as adminAlbumDelete.db.test.ts: the real route tree is mounted
// over a loopback socket and driven with a Bearer token (127.0.0.1 is an
// unknown host, so the host/kind boundary is skipped and the token kind is
// trusted).
//
//   npx tsx --test server/adminAlbumDuplicate.db.test.ts
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
const rows = (r: any): any[] => (r as any)?.rows ?? [];

const created = {
  people: new Set<string>(),
  albums: new Set<string>(),
  users: new Set<string>(),
  tokens: new Set<string>(),
  perms: new Set<string>(),
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

async function post(path: string, token: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function seedPerson(): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO people (id, name) VALUES (${id}, ${"t1494 person " + id.slice(0, 8)})`);
  created.people.add(id);
  return id;
}

async function seedAlbum(opts: { primaryArtistId?: string } = {}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id)
    VALUES (${id}, ${"t1494 album"}, ${"t1494 artist"}, ${""}, ${opts.primaryArtistId ?? null})
  `);
  created.albums.add(id);
  return id;
}

// getUserRole synthesizes a single membership from the legacy role columns
// when the user has no memberships rows, so this is sufficient for both
// god-role and partner-scope resolution.
async function seedUser(opts: { role: string; roleScopeId: string | null }): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t1494_" + tag}, ${"x"}, ${"t1494"}, ${"t1494_" + tag + "@example.test"},
            true, ${opts.role}, ${opts.roleScopeId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t1494tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function seedPartnerPermission(scopeId: string, editMetadata: boolean): Promise<void> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO partner_permissions (id, scope_kind, scope_id, edit_metadata)
    VALUES (${id}, ${"artist"}, ${scopeId}, ${editMetadata})
  `);
  created.perms.add(id);
}

async function albumCountForArtist(personId: string): Promise<number> {
  const r = rows(await exec(sql`SELECT count(*)::int AS n FROM albums WHERE primary_artist_id = ${personId}`))[0];
  return Number(r?.n ?? 0);
}

// ─── 1. Operators duplicate directly ──────────────────────────────────

test("super_admin duplicates an album (201, fresh isPrepping draft titled '… (Copy)')", async () => {
  const op = await seedUser({ role: "super_admin", roleScopeId: null });
  const token = await tokenFor(op);
  const albumId = await seedAlbum();

  const res = await post(`/api/admin/albums/${albumId}/duplicate`, token);

  assert.equal(res.status, 201, "operator duplicate returns 201");
  assert.ok(res.json?.id, "the new draft album is returned");
  assert.notEqual(res.json.id, albumId, "the duplicate is a brand-new row, not the source");
  assert.equal(res.json.isPrepping, true, "the duplicate lands as a Prepping draft");
  assert.match(String(res.json.title), /\(Copy\)$/, "the title is suffixed '(Copy)'");
  if (res.json?.id) created.albums.add(res.json.id);
});

test("admin (god-view ops tier) also duplicates directly", async () => {
  const op = await seedUser({ role: "admin", roleScopeId: null });
  const token = await tokenFor(op);
  const albumId = await seedAlbum();

  const res = await post(`/api/admin/albums/${albumId}/duplicate`, token);

  assert.equal(res.status, 201, "admin duplicate returns 201");
  if (res.json?.id) created.albums.add(res.json.id);
});

// ─── 2. Partners are denied — even WITH edit_metadata ─────────────────

test("an artist partner CANNOT duplicate (403), even with edit_metadata, and nothing is created", async () => {
  const person = await seedPerson();
  // Grant edit_metadata to prove duplication is NOT gated by the partner verb:
  // operator-only means even a fully-permissioned partner is refused.
  await seedPartnerPermission(person, true);
  const artist = await seedUser({ role: "artist", roleScopeId: person });
  const token = await tokenFor(artist);
  const albumId = await seedAlbum({ primaryArtistId: person });

  const before = await albumCountForArtist(person);
  const res = await post(`/api/admin/albums/${albumId}/duplicate`, token);

  assert.equal(res.status, 403, "a partner is refused duplication outright");
  assert.equal(
    await albumCountForArtist(person),
    before,
    "no new album row is created on a denied duplicate",
  );
});

test("a label partner is likewise refused (403)", async () => {
  const person = await seedPerson();
  const label = await seedUser({ role: "label", roleScopeId: person });
  const token = await tokenFor(label);
  const albumId = await seedAlbum({ primaryArtistId: person });

  const before = await albumCountForArtist(person);
  const res = await post(`/api/admin/albums/${albumId}/duplicate`, token);

  assert.equal(res.status, 403, "label partners can't duplicate either");
  assert.equal(await albumCountForArtist(person), before, "nothing created");
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const id of created.albums) {
      // Sweep any clone children too (songs/credits), keyed off album_id.
      await exec(sql`DELETE FROM track_writers WHERE song_id IN (SELECT id FROM songs WHERE album_id = ${id})`);
      await exec(sql`DELETE FROM track_performers WHERE song_id IN (SELECT id FROM songs WHERE album_id = ${id})`);
      await exec(sql`DELETE FROM album_credits WHERE album_id = ${id}`);
      await exec(sql`DELETE FROM songs WHERE album_id = ${id}`);
      await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    }
    for (const id of created.perms) await exec(sql`DELETE FROM partner_permissions WHERE id = ${id}`);
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
    for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
  } finally {
    await pool.end();
  }
});
