// Task #3356 — File-history revision fetch gating:
//   GET /api/admin/albums/:id/completed-template/file-event/:eventId/file
// streams a historical upload's file by event id, gated exactly like the
// art-file route (operator, the album's own artist/label partners, or the
// album's press). Pins:
//   • the album's OWN press 302s to the stored /objects path
//   • a partner of ANOTHER album is 403'd
//   • an uploaded event with NO stored file_url 404s honestly
//   • an event id belonging to a DIFFERENT album 404s (no cross-album read)
//   • download events 404 (no file of their own), anon 401
//
// Same harness as completedTemplateAccess.routes.db.test.ts.
//   npx tsx --test server/completedTemplateRevisionFile.routes.db.test.ts
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
  manufacturers: new Set<string>(),
  users: new Set<string>(),
  tokens: new Set<string>(),
  people: new Set<string>(),
  albums: new Set<string>(),
  skus: new Set<string>(),
  events: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let ownPressId = "";
let pressToken = ""; // manufacturer scoped to the album's own press
let adminToken = "";
let strangerToken = ""; // artist partner of a DIFFERENT album
let albumId = "";
let otherAlbumId = "";
let eventWithFile = "";
let eventNoFile = "";
let eventDownloaded = "";
let otherAlbumEvent = "";

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
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  ownPressId = await seedManufacturer("t3356 Own Press");
  pressToken = await tokenFor(await seedUser("manufacturer", ownPressId));
  adminToken = await tokenFor(await seedUser("super_admin", null));

  // Album homed to ownPress via the primary artist's invited_by_press_id.
  const personId = randomUUID();
  await exec(sql`INSERT INTO people (id, name, invited_by_press_id) VALUES (${personId}, ${"t3356 artist " + personId.slice(0, 8)}, ${ownPressId})`);
  created.people.add(personId);
  albumId = await seedAlbum(personId);
  await seedVinylSku(albumId);

  // A DIFFERENT album owned by a different artist; its partner must be 403'd
  // from the first album's revisions.
  const strangerPerson = randomUUID();
  await exec(sql`INSERT INTO people (id, name) VALUES (${strangerPerson}, ${"t3356 stranger " + strangerPerson.slice(0, 8)})`);
  created.people.add(strangerPerson);
  otherAlbumId = await seedAlbum(strangerPerson);
  strangerToken = await tokenFor(await seedUser("artist", strangerPerson));

  eventWithFile = await seedEvent(albumId, "uploaded", "/objects/uploads/t3356-rev1.pdf");
  eventNoFile = await seedEvent(albumId, "uploaded", null); // pre-#3356 legacy row
  eventDownloaded = await seedEvent(albumId, "downloaded", null);
  otherAlbumEvent = await seedEvent(otherAlbumId, "uploaded", "/objects/uploads/t3356-other.pdf");
});

async function seedManufacturer(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${id}, ${name})`);
  created.manufacturers.add(id);
  return id;
}

async function seedUser(role: string, scopeId: string | null): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t3356_" + tag}, ${"x"}, ${"t3356"}, ${"t3356_" + tag + "@example.test"}, true, ${role}, ${scopeId})
  `);
  created.users.add(id);
  return id;
}

async function seedAlbum(primaryArtistId: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id)
    VALUES (${id}, ${"t3356 album"}, ${"t3356 artist"}, ${""}, ${primaryArtistId})
  `);
  created.albums.add(id);
  return id;
}

async function seedVinylSku(forAlbumId: string): Promise<void> {
  const id = randomUUID();
  await exec(sql`INSERT INTO album_skus (id, album_id, format, price_cents, active) VALUES (${id}, ${forAlbumId}, ${"12_lp"}, ${3500}, TRUE)`);
  created.skus.add(id);
}

async function seedEvent(forAlbumId: string, event: string, fileUrl: string | null): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO completed_template_file_events (id, album_id, component_id, event, file_name, file_url)
    VALUES (${id}, ${forAlbumId}, ${"jacket"}, ${event}, ${"t3356.pdf"}, ${fileUrl})
  `);
  created.events.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t3356tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

const path = (album: string, eventId: string) =>
  `/api/admin/albums/${album}/completed-template/file-event/${eventId}/file`;

async function get(album: string, eventId: string, token: string | null) {
  return fetch(`${baseUrl}${path(album, eventId)}`, {
    redirect: "manual",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

test("anon → 401", async () => {
  const res = await get(albumId, eventWithFile, null);
  assert.equal(res.status, 401);
});

test("operator: 302 to the stored /objects path", async () => {
  const res = await get(albumId, eventWithFile, adminToken);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/objects/uploads/t3356-rev1.pdf");
});

test("the album's OWN press reads a revision (302)", async () => {
  const res = await get(albumId, eventWithFile, pressToken);
  assert.equal(res.status, 302, "the album's press must be able to view revisions");
});

test("a partner of ANOTHER album is 403'd", async () => {
  const res = await get(albumId, eventWithFile, strangerToken);
  assert.equal(res.status, 403, "cross-album partner read must fail");
});

test("an uploaded event with no stored file 404s honestly", async () => {
  const res = await get(albumId, eventNoFile, adminToken);
  assert.equal(res.status, 404, "legacy pre-#3356 rows have no file to reopen");
});

test("a download event 404s — it has no file of its own", async () => {
  const res = await get(albumId, eventDownloaded, adminToken);
  assert.equal(res.status, 404);
});

test("an event id from a DIFFERENT album 404s under this album's path", async () => {
  const res = await get(albumId, otherAlbumEvent, adminToken);
  assert.equal(res.status, 404, "event must belong to the album in the path");
});

after(async () => {
  for (const id of created.events) await exec(sql`DELETE FROM completed_template_file_events WHERE id = ${id}`);
  for (const id of created.albums) await exec(sql`DELETE FROM completed_template_checks WHERE album_id = ${id}`);
  for (const id of created.skus) await exec(sql`DELETE FROM album_skus WHERE id = ${id}`);
  for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
  for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
  for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
  for (const id of created.users) await exec(sql`DELETE FROM users WHERE id = ${id}`);
  for (const id of created.manufacturers) await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  httpServer?.close();
  await pool.end();
});
