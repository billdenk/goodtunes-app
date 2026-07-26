// Task #2867 — HTTP-level proof that GET /api/people and GET /api/admin/people
// apply the artist credit scope when the caller authenticates via Bearer token
// (as the partner SPA does — no session cookie on the admin host).
//
// Prior to this fix, resolving the caller from req.session?.userId caused a
// Bearer-authed artist to appear anonymous, bypassing the artist-scoping
// branch entirely and returning the full platform catalog (209 people).
//
// Scenarios covered:
//   1. Bearer-authed null-scope artist  → /api/people           → []
//   2. Bearer-authed null-scope artist  → /api/admin/people?q=  → []
//   3. Bearer-authed scoped artist      → /api/people           → only credited person + themselves
//   4. Bearer-authed scoped artist      → /api/admin/people?q=  → only matching credited people
//   5. Anonymous caller (no auth)       → /api/people           → full public list (no scoping)
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/artistPeopleScope.db.test.ts
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

const tag = randomUUID().slice(0, 8);

// Null-scope artist (no linked person record).
const nullArtistUserId = `t2867-null-${tag}`;

// Scoped artist: linked to personA; album credits personB.
const scopedArtistUserId = `t2867-scpd-${tag}`;
const personA = `t2867-pA-${tag}`; // the artist themselves
const personB = `t2867-pB-${tag}`; // credited on their album
const personC = `t2867-pC-${tag}`; // unrelated — must NOT appear in scoped view
const album1 = `t2867-alb-${tag}`;
const song1 = `t2867-sng-${tag}`;

let nullToken = "";
let scopedToken = "";

let baseUrl = "";
let httpServer: HttpServer | undefined;

const created = {
  tokens: new Set<string>(),
  users: new Set<string>(),
};

async function tokenFor(userId: string, label: string): Promise<string> {
  const token = label + "_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function bearer(path: string, token: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  try { return { status: res.status, json: await res.json() }; }
  catch { return { status: res.status, json: null }; }
}

async function anon(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`);
  try { return { status: res.status, json: await res.json() }; }
  catch { return { status: res.status, json: null }; }
}

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

  // Seed null-scope artist (role='artist', role_scope_id=NULL).
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${nullArtistUserId}, ${"t2867n_" + tag}, ${"x"}, ${"t2867 NullArtist"},
            ${"t2867n_" + tag + "@example.test"}, true, ${"artist"}, ${null})
  `);
  created.users.add(nullArtistUserId);
  nullToken = await tokenFor(nullArtistUserId, "t2867null");

  // Seed three person rows (A = artist scope, B = credited, C = unrelated).
  await exec(sql`
    INSERT INTO people (id, name)
    VALUES (${personA}, ${"t2867 ArtistPerson"}),
           (${personB}, ${"t2867 CreditedPerson"}),
           (${personC}, ${"t2867 UnrelatedPerson"})
  `);

  // Seed scoped artist user (linked to personA).
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${scopedArtistUserId}, ${"t2867s_" + tag}, ${"x"}, ${"t2867 ScopedArtist"},
            ${"t2867s_" + tag + "@example.test"}, true, ${"artist"}, ${personA})
  `);
  created.users.add(scopedArtistUserId);
  scopedToken = await tokenFor(scopedArtistUserId, "t2867scpd");

  // Seed an album owned by personA and a song with personB as a performer.
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id)
    VALUES (${album1}, ${"t2867 Album"}, ${"t2867 ArtistPerson"}, ${"/album-placeholder.svg"}, ${personA})
  `);
  await exec(sql`
    INSERT INTO songs (id, album_id, title, track_number)
    VALUES (${song1}, ${album1}, ${"t2867 Track"}, ${1})
  `);
  // Credit personB as a performer on song1 (role + name are NOT NULL).
  await exec(sql`
    INSERT INTO track_performers (song_id, person_id, role, name)
    VALUES (${song1}, ${personB}, ${"performer"}, ${"t2867 CreditedPerson"})
  `);
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
    await exec(sql`DELETE FROM track_performers WHERE song_id = ${song1} AND person_id = ${personB}`);
    await exec(sql`DELETE FROM songs WHERE id = ${song1}`);
    await exec(sql`DELETE FROM albums WHERE id = ${album1}`);
    await exec(sql`DELETE FROM people WHERE id IN (${personA}, ${personB}, ${personC})`);
  } finally {
    await pool.end();
  }
});

// ─── 1. Null-scope artist via Bearer → /api/people returns [] ─────────────

test("Bearer null-scope artist: GET /api/people returns [] not the full catalog", async () => {
  const res = await bearer("/api/people", nullToken);
  assert.equal(res.status, 200, "endpoint succeeds (200)");
  assert.ok(Array.isArray(res.json), "response is an array");
  assert.equal(res.json.length, 0, "null-scope artist via Bearer sees zero people");
});

// ─── 2. Null-scope artist via Bearer → /api/admin/people typeahead returns [] ──

test("Bearer null-scope artist: GET /api/admin/people?q= returns [] not catalog matches", async () => {
  // 't2867' matches all three seeded people by name prefix — scope must block them.
  const res = await bearer("/api/admin/people?q=t2867", nullToken);
  assert.equal(res.status, 200, "endpoint succeeds (200)");
  assert.ok(Array.isArray(res.json), "response is an array");
  assert.equal(res.json.length, 0, "null-scope artist via Bearer typeahead sees zero people");
});

// ─── 3. Scoped artist via Bearer → /api/people returns only credited set ──

test("Bearer scoped artist: GET /api/people returns only credited people (not all catalog)", async () => {
  const res = await bearer("/api/people", scopedToken);
  assert.equal(res.status, 200, "endpoint succeeds (200)");
  assert.ok(Array.isArray(res.json), "response is an array");
  const ids = new Set(res.json.map((p: any) => p.id));
  // personA (the artist themselves) and personB (credited) must appear.
  assert.ok(ids.has(personA), "artist's own person record is included");
  assert.ok(ids.has(personB), "credited person is included");
  // personC is unrelated and must NOT appear.
  assert.ok(!ids.has(personC), "unrelated person is NOT included");
});

// ─── 4. Scoped artist via Bearer → /api/admin/people typeahead respects scope ──

test("Bearer scoped artist: GET /api/admin/people?q= searches only credited people", async () => {
  // Query by the seeded name prefix so it would match all three if unscoped.
  const res = await bearer("/api/admin/people?q=t2867", scopedToken);
  assert.equal(res.status, 200, "endpoint succeeds (200)");
  assert.ok(Array.isArray(res.json), "response is an array");
  const ids = new Set(res.json.map((p: any) => p.id));
  // Only personA and personB should appear; personC must be excluded.
  assert.ok(!ids.has(personC), "unrelated person is excluded from scoped typeahead");
});

// ─── 5. Anonymous caller → /api/people returns full public list ───────────

test("Anonymous caller: GET /api/people returns full public list (no artist scoping)", async () => {
  const res = await anon("/api/people");
  assert.equal(res.status, 200, "endpoint is publicly accessible (200)");
  assert.ok(Array.isArray(res.json), "response is an array");
  // All three seeded people should be present (unscoped full catalog view).
  const ids = new Set(res.json.map((p: any) => p.id));
  assert.ok(ids.has(personA), "personA visible to anonymous caller");
  assert.ok(ids.has(personB), "personB visible to anonymous caller");
  assert.ok(ids.has(personC), "personC visible to anonymous caller (no scoping for anon)");
});
