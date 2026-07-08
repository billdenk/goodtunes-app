// Task #2637 — coverage for POST /api/admin/people/:id/demote-artist.
//
// Removing an accidental "promote to artist" override is a super-admin-only
// operator tool, and it must refuse (409) whenever the promotion flag is NOT
// the person's only artist signal — otherwise the demote would be a silent
// no-op (the shape wouldn't change) or a way to hide a real artist. These
// tests pin:
//
//   1. super_admin + promotion-only person → 200, flag cleared in the DB.
//   2. Not promoted → 409, nothing written.
//   3. Other signals (manual creative role / primary-artist album /
//      per-track credit / group flag) → 409, flag left intact.
//   4. Partner accounts (isAdmin=true but not operators) → 403.
//   5. Unknown person → 404.
//
// Same loopback harness as adminAlbumDuplicate.db.test.ts: the real route
// tree is mounted on 127.0.0.1 (unknown host → token kind trusted) and
// driven with a Bearer token. Every seeded row is torn down in `after`.
//
//   npx tsx --test server/demoteArtist.routes.db.test.ts

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import { db, pool } from "./db";
import { pgArray } from "./lib/pgArray";
import { storage } from "./storage";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";

const exec = (q: any) => db.execute(q);
const rows = (r: any): any[] => (r as any)?.rows ?? [];

const created = {
  people: new Set<string>(),
  albums: new Set<string>(),
  songs: new Set<string>(),
  users: new Set<string>(),
  tokens: new Set<string>(),
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

async function seedPerson(opts: {
  promoted?: boolean;
  roles?: string[];
  isGroup?: boolean;
} = {}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO people (id, name, is_artist_promoted, roles, is_group)
    VALUES (${id}, ${"t2637 person " + id.slice(0, 8)},
            ${opts.promoted ?? false},
            ${pgArray(opts.roles ?? [])},
            ${opts.isGroup ?? false})
  `);
  created.people.add(id);
  return id;
}

async function seedUser(opts: { role: string; roleScopeId: string | null }): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t2637_" + tag}, ${"x"}, ${"t2637"}, ${"t2637_" + tag + "@example.test"},
            true, ${opts.role}, ${opts.roleScopeId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t2637tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function promotedFlag(personId: string): Promise<boolean> {
  const r = rows(await exec(sql`SELECT is_artist_promoted FROM people WHERE id = ${personId}`))[0];
  return !!r?.is_artist_promoted;
}

let opToken = "";
before(async () => {
  const op = await seedUser({ role: "super_admin", roleScopeId: null });
  opToken = await tokenFor(op);
});

// ─── 1. Happy path ─────────────────────────────────────────────────────

test("promotion-only person → 200, flag cleared", async () => {
  const personId = await seedPerson({ promoted: true });
  const res = await post(`/api/admin/people/${personId}/demote-artist`, opToken);
  assert.equal(res.status, 200, "sole-signal demote succeeds");
  assert.equal(res.json?.isArtistPromoted, false);
  assert.equal(await promotedFlag(personId), false, "flag cleared in the DB");
});

// ─── 2. Nothing to remove ──────────────────────────────────────────────

test("not promoted → 409, no write", async () => {
  const personId = await seedPerson({ promoted: false });
  const res = await post(`/api/admin/people/${personId}/demote-artist`, opToken);
  assert.equal(res.status, 409, "no override to remove");
  assert.match(String(res.json?.message ?? ""), /no artist-profile override/i);
});

// ─── 3. Other artist signals block the demote ──────────────────────────

test("manual creative-credit role → 409, flag intact", async () => {
  const personId = await seedPerson({ promoted: true, roles: ["Vocals"] });
  const res = await post(`/api/admin/people/${personId}/demote-artist`, opToken);
  assert.equal(res.status, 409, "roles block the demote");
  assert.match(String(res.json?.message ?? ""), /creative-credit roles/i);
  assert.equal(await promotedFlag(personId), true, "flag untouched on refusal");
});

test("group flag → 409", async () => {
  const personId = await seedPerson({ promoted: true, isGroup: true });
  const res = await post(`/api/admin/people/${personId}/demote-artist`, opToken);
  assert.equal(res.status, 409, "groups keep the artist shape regardless");
  assert.match(String(res.json?.message ?? ""), /group/i);
});

test("primary-artist album (catalog signal) → 409", async () => {
  const personId = await seedPerson({ promoted: true });
  const albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id)
    VALUES (${albumId}, ${"t2637 album"}, ${"t2637"}, ${""}, ${personId})
  `);
  created.albums.add(albumId);
  const res = await post(`/api/admin/people/${personId}/demote-artist`, opToken);
  assert.equal(res.status, 409, "a release blocks the demote");
  assert.match(String(res.json?.message ?? ""), /primary artist on a release/i);
  assert.equal(await promotedFlag(personId), true);
});

test("per-track writer credit (derived credit) → 409", async () => {
  const personId = await seedPerson({ promoted: true });
  const albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${albumId}, ${"t2637 album"}, ${"t2637"}, ${""})
  `);
  created.albums.add(albumId);
  const songId = randomUUID();
  await exec(sql`
    INSERT INTO songs (id, album_id, title, duration, track_number)
    VALUES (${songId}, ${albumId}, ${"t2637 song"}, 180, 1)
  `);
  created.songs.add(songId);
  await exec(sql`
    INSERT INTO track_writers (song_id, person_id, name, role)
    VALUES (${songId}, ${personId}, ${"t2637 writer"}, ${"Songwriter"})
  `);
  const res = await post(`/api/admin/people/${personId}/demote-artist`, opToken);
  assert.equal(res.status, 409, "a derived credit blocks the demote");
  assert.match(String(res.json?.message ?? ""), /per-track or per-album credits/i);
  assert.equal(await promotedFlag(personId), true);
});

// ─── 4. Authorization boundary ─────────────────────────────────────────

test("a partner account (isAdmin but not operator) → 403, flag intact", async () => {
  const personId = await seedPerson({ promoted: true });
  const scope = await seedPerson();
  const partner = await seedUser({ role: "artist", roleScopeId: scope });
  const token = await tokenFor(partner);
  const res = await post(`/api/admin/people/${personId}/demote-artist`, token);
  assert.equal(res.status, 403, "requireRole(super_admin) rejects partners");
  assert.equal(await promotedFlag(personId), true);
});

// ─── 5. Unknown person ─────────────────────────────────────────────────

test("unknown person id → 404", async () => {
  const res = await post(`/api/admin/people/${randomUUID()}/demote-artist`, opToken);
  assert.equal(res.status, 404);
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const id of created.songs) {
      await exec(sql`DELETE FROM track_writers WHERE song_id = ${id}`);
      await exec(sql`DELETE FROM track_performers WHERE song_id = ${id}`);
      await exec(sql`DELETE FROM songs WHERE id = ${id}`);
    }
    for (const id of created.albums) {
      await exec(sql`DELETE FROM album_credits WHERE album_id = ${id}`);
      await exec(sql`DELETE FROM songs WHERE album_id = ${id}`);
      await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    }
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
