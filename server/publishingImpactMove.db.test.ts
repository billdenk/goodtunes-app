// Task #1363 — coverage for the pre-delete publishing-data guard:
//
//   GET  /api/admin/albums/:id/publishing-impact
//        reports the mechanical-settlement splits (counted via the SAME
//        song→split join the settlement engine uses) and the units-pressed
//        figure that the album's soft-delete cascade would silently take
//        down, so the delete-confirm dialog can warn before destroying it.
//
//   POST /api/admin/albums/:id/move-publishing-data { targetAlbumId }
//        re-points the SONGS that carry non-deleted splits onto another
//        album (the splits ride song_id) and transfers the operator-recorded
//        units-pressed figure, so an operator can preserve the data instead
//        of losing it on delete.
//
// The logic lives inside the real Express handlers (operator gate, the
// song→split join, the units transfer in a transaction), so the test drives
// the actual routes over a loopback socket with a Bearer token — same harness
// as adminAlbumDelete.db.test.ts.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/publishingImpactMove.db.test.ts
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

async function get(path: string, token: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
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

async function post(
  path: string,
  token: string,
  body: any,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
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

async function seedAlbum(opts: { units?: number | null; trashed?: boolean } = {}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, mechanical_units_pressed, deleted_at)
    VALUES (${id}, ${"t1363 album"}, ${"t1363 artist"}, ${""},
            ${opts.units ?? null}, ${opts.trashed ? new Date() : null})
  `);
  created.albums.add(id);
  return id;
}

async function seedSong(albumId: string, trackNumber: number): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO songs (id, album_id, title, track_number)
    VALUES (${id}, ${albumId}, ${"t1363 song " + trackNumber}, ${trackNumber})
  `);
  created.songs.add(id);
  return id;
}

async function seedSplit(songId: string, percentBp: number, deleted = false): Promise<void> {
  await exec(sql`
    INSERT INTO track_publishing_splits (song_id, name, role, percent_bp, deleted_at)
    VALUES (${songId}, ${"t1363 writer"}, ${"Writer"}, ${percentBp},
            ${deleted ? new Date() : null})
  `);
}

async function seedUser(role: string): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t1363_" + tag}, ${"x"}, ${"t1363"}, ${"t1363_" + tag + "@example.test"},
            true, ${role}, ${null})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t1363tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function songAlbumId(songId: string): Promise<string | null> {
  const r = rows(await exec(sql`SELECT album_id FROM songs WHERE id = ${songId}`))[0];
  return (r?.album_id as string | null) ?? null;
}

async function albumUnits(albumId: string): Promise<number | null> {
  const r = rows(await exec(sql`SELECT mechanical_units_pressed FROM albums WHERE id = ${albumId}`))[0];
  const v = r?.mechanical_units_pressed;
  return v == null ? null : Number(v);
}

// ─── impact probe ─────────────────────────────────────────────────────

test("impact reports split + units counts via the song→split join", async () => {
  const op = await seedUser("super_admin");
  const token = await tokenFor(op);
  const albumId = await seedAlbum({ units: 500 });
  const s1 = await seedSong(albumId, 1);
  const s2 = await seedSong(albumId, 2);
  await seedSong(albumId, 3); // a track with NO splits
  await seedSplit(s1, 5000);
  await seedSplit(s1, 5000); // two splits on one song
  await seedSplit(s2, 10000);
  await seedSplit(s2, 0, true); // a soft-deleted split must NOT count

  const res = await get(`/api/admin/albums/${albumId}/publishing-impact`, token);

  assert.equal(res.status, 200);
  assert.equal(res.json.splitCount, 3, "counts only the 3 non-deleted splits");
  assert.equal(res.json.songsWithSplits, 2, "two distinct songs carry splits");
  assert.equal(res.json.unitsPressed, 500, "units come from mechanical_units_pressed");
  assert.equal(res.json.hasPublishingData, true);
});

test("impact reports hasPublishingData=false for a clean album", async () => {
  const op = await seedUser("super_admin");
  const token = await tokenFor(op);
  const albumId = await seedAlbum();
  await seedSong(albumId, 1);

  const res = await get(`/api/admin/albums/${albumId}/publishing-impact`, token);

  assert.equal(res.status, 200);
  assert.equal(res.json.splitCount, 0);
  assert.equal(res.json.unitsPressed, 0);
  assert.equal(res.json.hasPublishingData, false);
});

// ─── move ─────────────────────────────────────────────────────────────

test("move re-points split-carrying songs to the target and transfers units", async () => {
  const op = await seedUser("super_admin");
  const token = await tokenFor(op);
  const source = await seedAlbum({ units: 500 });
  const target = await seedAlbum({ units: 100 });
  const carrier = await seedSong(source, 1);
  const noSplit = await seedSong(source, 2);
  await seedSplit(carrier, 10000);

  const res = await post(
    `/api/admin/albums/${source}/move-publishing-data`,
    token,
    { targetAlbumId: target },
  );

  assert.equal(res.status, 200);
  assert.equal(res.json.movedSongs, 1, "only the song carrying a split moves");
  assert.equal(res.json.movedSplits, 1);
  assert.equal(res.json.unitsMoved, 500);
  assert.equal(await songAlbumId(carrier), target, "carrier song now points at the target");
  assert.equal(await songAlbumId(noSplit), source, "the split-less song stays put");
  assert.equal(await albumUnits(target), 600, "units add onto the target (100 + 500)");
  assert.equal(await albumUnits(source), null, "source units are cleared");
});

test("move rejects a same-album target (400)", async () => {
  const op = await seedUser("super_admin");
  const token = await tokenFor(op);
  const albumId = await seedAlbum({ units: 10 });
  const s1 = await seedSong(albumId, 1);
  await seedSplit(s1, 10000);

  const res = await post(
    `/api/admin/albums/${albumId}/move-publishing-data`,
    token,
    { targetAlbumId: albumId },
  );

  assert.equal(res.status, 400);
});

test("move rejects a trashed/missing target (404)", async () => {
  const op = await seedUser("super_admin");
  const token = await tokenFor(op);
  const source = await seedAlbum({ units: 10 });
  const trashed = await seedAlbum({ trashed: true });
  const s1 = await seedSong(source, 1);
  await seedSplit(s1, 10000);

  const res = await post(
    `/api/admin/albums/${source}/move-publishing-data`,
    token,
    { targetAlbumId: trashed },
  );

  assert.equal(res.status, 404);
  assert.equal(await songAlbumId(s1), source, "nothing moved");
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const id of created.songs) {
      await exec(sql`DELETE FROM track_publishing_splits WHERE song_id = ${id}`);
    }
    // Splits/songs may have been re-pointed across albums; delete by tracked id.
    for (const id of created.songs) await exec(sql`DELETE FROM songs WHERE id = ${id}`);
    for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
  } finally {
    await pool.end();
  }
});
