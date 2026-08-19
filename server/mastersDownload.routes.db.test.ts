// Task #3197 — route coverage for the press masters download:
//
//   GET /api/admin/albums/:id/masters/:songId/download
//     • ORIGINAL preferred: streams audioSourceUrl bytes (artist's original
//       upload) with matching extension + X-Master-Source: original
//     • fallback to the served audioUrl when no original exists
//     • fallback to served when the original's object is GONE from storage
//     • no pointers at all → 404 { code: "no_master" }
//     • external-only pointer → 422 { code: "external" }
//     • object pointer(s) but object gone → 404 { code: "missing_object" }
//     • unauthenticated → 401
//   GET /api/admin/albums/:id/masters/health
//     • per-track statuses matching the classes above
//
// Uploads tiny real objects into the shared bucket in before(), removes
// them in after().
//
//   GT_TEST=1 TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test server/mastersDownload.routes.db.test.ts
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
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";

const exec = (q: any) => db.execute(q);

let baseUrl = "";
let httpServer: HttpServer | undefined;
let albumId = "";
let adminId = "";
let adminToken = "";

const tag = randomUUID().slice(0, 8);
const WAV_BYTES = Buffer.from("RIFFxxxxWAVEfmt t3197-original-wav-bytes");
const FLAC_BYTES = Buffer.from("fLaC t3197-served-flac-bytes");

function bucketAndPrefix(): { bucketName: string; prefix: string } {
  const raw = (process.env.PRIVATE_OBJECT_DIR || "").replace(/^\/+/, "").replace(/\/+$/, "");
  const firstSlash = raw.indexOf("/");
  return firstSlash === -1
    ? { bucketName: raw, prefix: "" }
    : { bucketName: raw.slice(0, firstSlash), prefix: raw.slice(firstSlash + 1) };
}
const { bucketName, prefix } = bucketAndPrefix();

const WAV_NAME = `t3197-${tag}-original.wav`;
const FLAC_NAME = `t3197-${tag}-served.flac`;
const WAV_URL = `/objects/uploads/${WAV_NAME}`;
const FLAC_URL = `/objects/uploads/${FLAC_NAME}`;

async function putObject(name: string, bytes: Buffer, contentType: string) {
  const objectName = `${prefix ? `${prefix}/` : ""}uploads/${name}`;
  await objectStorageClient.bucket(bucketName).file(objectName).save(bytes, {
    contentType,
    resumable: false,
  });
}
async function deleteObject(name: string) {
  const objectName = `${prefix ? `${prefix}/` : ""}uploads/${name}`;
  await objectStorageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true } as any).catch(() => {});
}

// song ids by scenario
let songBoth = ""; // original + served, both live → original wins
let songServedOnly = ""; // only audioUrl → served
let songOriginalGone = ""; // original pointer → missing object; served live → fallback
let songNone = ""; // no pointers
let songExternal = ""; // dropbox-style external only
let songAllGone = ""; // object pointers, objects missing

async function seedSong(fields: { audioUrl?: string | null; audioSourceUrl?: string | null; track: number }) {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO songs (id, album_id, title, track_number, audio_url, audio_source_url)
    VALUES (${id}, ${albumId}, ${"t3197 track " + fields.track}, ${fields.track},
            ${fields.audioUrl ?? null}, ${fields.audioSourceUrl ?? null})
  `);
  return id;
}

before(async () => {
  await Promise.all([
    putObject(WAV_NAME, WAV_BYTES, "audio/wav"),
    putObject(FLAC_NAME, FLAC_BYTES, "audio/flac"),
  ]);

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

  albumId = randomUUID();
  await exec(sql`INSERT INTO albums (id, title, artist, artwork) VALUES (${albumId}, ${"t3197 album"}, ${"t3197"}, ${"/x.png"})`);

  adminId = randomUUID();
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${adminId}, ${"t3197_" + tag}, ${"x"}, ${"t3197"}, ${"t3197_" + tag + "@example.test"}, true, ${"super_admin"})
  `);
  adminToken = "t3197tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(adminToken, adminId, "admin");

  songBoth = await seedSong({ audioUrl: FLAC_URL, audioSourceUrl: WAV_URL, track: 1 });
  songServedOnly = await seedSong({ audioUrl: FLAC_URL, track: 2 });
  songOriginalGone = await seedSong({ audioUrl: FLAC_URL, audioSourceUrl: `/objects/uploads/t3197-${tag}-gone.wav`, track: 3 });
  songNone = await seedSong({ track: 4 });
  songExternal = await seedSong({ audioUrl: "https://dl.dropboxusercontent.com/scl/fi/x/y.wav", track: 5 });
  songAllGone = await seedSong({ audioUrl: `/objects/uploads/t3197-${tag}-gone2.flac`, track: 6 });
});

after(async () => {
  await exec(sql`DELETE FROM songs WHERE album_id = ${albumId}`);
  await exec(sql`DELETE FROM albums WHERE id = ${albumId}`);
  await exec(sql`DELETE FROM auth_tokens WHERE token = ${adminToken}`).catch(() => {});
  await exec(sql`DELETE FROM users WHERE id = ${adminId}`);
  await Promise.all([deleteObject(WAV_NAME), deleteObject(FLAC_NAME)]);
  await new Promise<void>((resolve) => (httpServer ? httpServer.close(() => resolve()) : resolve()));
  await pool.end();
});

const authed = (path: string) =>
  fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${adminToken}` } });
const dl = (songId: string) => authed(`/api/admin/albums/${albumId}/masters/${songId}/download`);

test("original preferred: streams the artist's original WAV bytes", async () => {
  const r = await dl(songBoth);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-master-source"), "original");
  const cd = r.headers.get("content-disposition") ?? "";
  assert.match(cd, /\.wav"/);
  const body = Buffer.from(await r.arrayBuffer());
  assert.deepEqual(body, WAV_BYTES);
});

test("fallback to served file when no original exists", async () => {
  const r = await dl(songServedOnly);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-master-source"), "served");
  assert.match(r.headers.get("content-disposition") ?? "", /\.flac"/);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), FLAC_BYTES);
});

test("original pointer whose object is gone falls back to served", async () => {
  const r = await dl(songOriginalGone);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-master-source"), "served");
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), FLAC_BYTES);
});

test("no pointers → 404 no_master with actionable message", async () => {
  const r = await dl(songNone);
  assert.equal(r.status, 404);
  const j = await r.json();
  assert.equal(j.code, "no_master");
  assert.match(j.message, /No master uploaded/i);
});

test("external-only pointer → 422 external", async () => {
  const r = await dl(songExternal);
  assert.equal(r.status, 422);
  const j = await r.json();
  assert.equal(j.code, "external");
  assert.match(j.message, /external link/i);
});

test("object pointer but object gone → 404 missing_object", async () => {
  const r = await dl(songAllGone);
  assert.equal(r.status, 404);
  const j = await r.json();
  assert.equal(j.code, "missing_object");
  assert.match(j.message, /missing from storage/i);
});

test("unauthenticated download → 401", async () => {
  const r = await fetch(`${baseUrl}/api/admin/albums/${albumId}/masters/${songBoth}/download`);
  assert.equal(r.status, 401);
});

test("per-album masters health classifies every track", async () => {
  const r = await authed(`/api/admin/albums/${albumId}/masters/health`);
  assert.equal(r.status, 200);
  const j = await r.json();
  const by = new Map<string, string>(j.tracks.map((t: any) => [t.songId, t.status]));
  assert.equal(by.get(songBoth), "ok_original");
  assert.equal(by.get(songServedOnly), "ok_served");
  assert.equal(by.get(songOriginalGone), "ok_served");
  assert.equal(by.get(songNone), "no_master");
  assert.equal(by.get(songExternal), "external");
  assert.equal(by.get(songAllGone), "missing_object");
});
