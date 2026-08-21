// Task #3265 — route coverage for the album-level masters zip download:
//
//   GET /api/admin/albums/:id/masters/download-all
//     • one zip named after the album (ASCII filename + RFC 5987 filename*)
//     • entries = the same files the per-track download delivers (original
//       upload preferred, served playback fallback), named
//       "NN Title.ext"
//     • unusable tracks (no master / external link / object gone) are
//       SKIPPED, not fatal
//     • album with zero usable masters → 404 { code: "no_masters" }
//     • access: operator + the album's OWN press only; a different press
//       is 403'd; unauthenticated is 401
//
// Uploads tiny real objects into the shared bucket in before(), removes
// them in after().
//
//   GT_TEST=1 TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test server/mastersZipDownload.routes.db.test.ts
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { sql } from "drizzle-orm";
import express from "express";
import AdmZip from "adm-zip";
import { db, pool } from "./db";
import { storage } from "./storage";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";

const exec = (q: any) => db.execute(q);

let baseUrl = "";
let httpServer: HttpServer | undefined;
let albumId = "";
let emptyAlbumId = "";
let ownPressId = "";
let otherPressId = "";
let adminToken = "";
let pressToken = "";
let otherPressToken = "";

const created = {
  users: new Set<string>(),
  tokens: new Set<string>(),
  people: new Set<string>(),
  manufacturers: new Set<string>(),
};

const tag = randomUUID().slice(0, 8);
const WAV_BYTES = Buffer.from("RIFFxxxxWAVEfmt t3265-original-wav-bytes");
const FLAC_BYTES = Buffer.from("fLaC t3265-served-flac-bytes");

function bucketAndPrefix(): { bucketName: string; prefix: string } {
  const raw = (process.env.PRIVATE_OBJECT_DIR || "").replace(/^\/+/, "").replace(/\/+$/, "");
  const firstSlash = raw.indexOf("/");
  return firstSlash === -1
    ? { bucketName: raw, prefix: "" }
    : { bucketName: raw.slice(0, firstSlash), prefix: raw.slice(firstSlash + 1) };
}
const { bucketName, prefix } = bucketAndPrefix();

const WAV_NAME = `t3265-${tag}-original.wav`;
const FLAC_NAME = `t3265-${tag}-served.flac`;
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

async function seedSong(fields: { albumId: string; title: string; audioUrl?: string | null; audioSourceUrl?: string | null; track: number }) {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO songs (id, album_id, title, track_number, audio_url, audio_source_url)
    VALUES (${id}, ${fields.albumId}, ${fields.title}, ${fields.track},
            ${fields.audioUrl ?? null}, ${fields.audioSourceUrl ?? null})
  `);
  return id;
}

async function seedManufacturer(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${id}, ${name})`);
  created.manufacturers.add(id);
  return id;
}

async function seedUser(role: string, roleScopeId: string | null): Promise<string> {
  const id = randomUUID();
  const utag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t3265_" + utag}, ${"x"}, ${"t3265"}, ${"t3265_" + utag + "@example.test"},
            true, ${role}, ${roleScopeId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t3265tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
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

  ownPressId = await seedManufacturer("t3265 Own Press");
  otherPressId = await seedManufacturer("t3265 Other Press");
  adminToken = await tokenFor(await seedUser("super_admin", null));
  pressToken = await tokenFor(await seedUser("manufacturer", ownPressId));
  otherPressToken = await tokenFor(await seedUser("manufacturer", otherPressId));

  // Album homed to ownPress via the primary artist's invited_by_press_id.
  const personId = randomUUID();
  await exec(sql`
    INSERT INTO people (id, name, invited_by_press_id)
    VALUES (${personId}, ${"t3265 artist " + personId.slice(0, 8)}, ${ownPressId})
  `);
  created.people.add(personId);

  albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id)
    VALUES (${albumId}, ${"t3265 Hope Album"}, ${"t3265"}, ${"/x.png"}, ${personId})
  `);

  emptyAlbumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${emptyAlbumId}, ${"t3265 Empty Album"}, ${"t3265"}, ${"/x.png"})
  `);

  // downloadable: original preferred
  await seedSong({ albumId, title: "t3265 track 1", track: 1, audioUrl: FLAC_URL, audioSourceUrl: WAV_URL });
  // downloadable: served only
  await seedSong({ albumId, title: "t3265 track 2", track: 2, audioUrl: FLAC_URL });
  // skipped: no pointers
  await seedSong({ albumId, title: "t3265 track 3", track: 3 });
  // skipped: external-only
  await seedSong({ albumId, title: "t3265 track 4", track: 4, audioUrl: "https://dl.dropboxusercontent.com/scl/fi/x/y.wav" });
  // skipped: pointer whose object is gone
  await seedSong({ albumId, title: "t3265 track 5", track: 5, audioUrl: `/objects/uploads/t3265-${tag}-gone.flac` });
  // empty album: only an unusable track
  await seedSong({ albumId: emptyAlbumId, title: "t3265 empty 1", track: 1 });
});

after(async () => {
  await exec(sql`DELETE FROM songs WHERE album_id IN (${albumId}, ${emptyAlbumId})`);
  await exec(sql`DELETE FROM albums WHERE id IN (${albumId}, ${emptyAlbumId})`);
  for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`).catch(() => {});
  for (const u of created.users) await exec(sql`DELETE FROM users WHERE id = ${u}`);
  for (const p of created.people) await exec(sql`DELETE FROM people WHERE id = ${p}`);
  for (const m of created.manufacturers) await exec(sql`DELETE FROM manufacturers WHERE id = ${m}`);
  await Promise.all([deleteObject(WAV_NAME), deleteObject(FLAC_NAME)]);
  await new Promise<void>((resolve) => (httpServer ? httpServer.close(() => resolve()) : resolve()));
  await pool.end();
});

const dlAll = (id: string, token: string | null) =>
  fetch(`${baseUrl}/api/admin/albums/${id}/masters/download-all`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

test("operator gets ONE zip named after the album with the downloadable entries", async () => {
  const r = await dlAll(albumId, adminToken);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "application/zip");
  const cd = r.headers.get("content-disposition") ?? "";
  assert.match(cd, /filename="t3265 Hope Album\.zip"/);
  assert.match(cd, /filename\*=UTF-8''t3265%20Hope%20Album\.zip/);

  const zip = new AdmZip(Buffer.from(await r.arrayBuffer()));
  const entries = zip.getEntries().map((e) => e.entryName).sort();
  assert.deepEqual(entries, ["01 t3265 track 1.wav", "02 t3265 track 2.flac"]);
  assert.deepEqual(zip.readFile("01 t3265 track 1.wav"), WAV_BYTES, "original upload preferred");
  assert.deepEqual(zip.readFile("02 t3265 track 2.flac"), FLAC_BYTES, "served fallback");
});

test("album with zero usable masters → 404 no_masters (not an empty zip)", async () => {
  const r = await dlAll(emptyAlbumId, adminToken);
  assert.equal(r.status, 404);
  const j = await r.json();
  assert.equal(j.code, "no_masters");
});

test("the album's own press downloads the zip", async () => {
  const r = await dlAll(albumId, pressToken);
  assert.equal(r.status, 200);
  const zip = new AdmZip(Buffer.from(await r.arrayBuffer()));
  assert.equal(zip.getEntries().length, 2);
});

test("a DIFFERENT press is 403'd", async () => {
  const r = await dlAll(albumId, otherPressToken);
  assert.equal(r.status, 403);
});

test("unauthenticated → 401", async () => {
  const r = await dlAll(albumId, null);
  assert.equal(r.status, 401);
});

// ─── Signed streaming link (client streams via plain navigation) ────────

const mintLink = (id: string, token: string | null) =>
  fetch(`${baseUrl}/api/admin/albums/${id}/masters/download-all/link`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

test("minted link downloads the zip with NO bearer (plain navigation path)", async () => {
  const mint = await mintLink(albumId, adminToken);
  assert.equal(mint.status, 200);
  const { url } = await mint.json();
  assert.match(url, /\/masters\/download-all\?dt=/);
  const r = await fetch(`${baseUrl}${url}`); // no auth header — like an <a> click
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "application/zip");
  const zip = new AdmZip(Buffer.from(await r.arrayBuffer()));
  assert.equal(zip.getEntries().length, 2);
});

test("tampered token → 401", async () => {
  const mint = await mintLink(albumId, adminToken);
  const { url } = await mint.json();
  const r = await fetch(`${baseUrl}${url}x`);
  assert.equal(r.status, 401);
});

test("token minted for one album doesn't open another", async () => {
  const mint = await mintLink(albumId, adminToken);
  const { url } = await mint.json();
  const dt = new URL(`${baseUrl}${url}`).searchParams.get("dt")!;
  const r = await fetch(`${baseUrl}/api/admin/albums/${emptyAlbumId}/masters/download-all?dt=${encodeURIComponent(dt)}`);
  assert.equal(r.status, 401);
});

test("a DIFFERENT press cannot mint a link", async () => {
  const mint = await mintLink(albumId, otherPressToken);
  assert.equal(mint.status, 403);
});

test("mint without bearer → 401", async () => {
  const mint = await mintLink(albumId, null);
  assert.equal(mint.status, 401);
});
