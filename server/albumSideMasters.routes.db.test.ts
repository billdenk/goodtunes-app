// Task #3412 completion-review follow-through — authorization boundary for
// the per-side master intake routes (GET/POST/DELETE
// /api/admin/albums/:id/side-masters). The flaw the review caught: the
// routes cleared only requireAdminBearer, so ANY scoped admin account
// (e.g. a manufacturer for an unrelated press) could enumerate, attach,
// or delete side-master rows for arbitrary album ids, and POST would
// stream any /objects/uploads path onto the album. The fix gates read +
// attach with requireOperatorOrAlbumPress (operators, the album's own
// resolved press, or the album's own artist/label partners — the attach
// authorization for the upload object, since uploads carry no per-object
// owner) and delete with requireOperator. This pins the boundary in.
//
// Same harness as pressAudioSpec.routes.db.test.ts: full route tree over a
// loopback socket, bearer-token auth, real dev DB, all rows torn down.
//
//   npx tsx --test server/albumSideMasters.routes.db.test.ts
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
  albums: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let albumId = "";
let outsiderToken = ""; // manufacturer scoped to a press UNRELATED to the album
let adminToken = ""; // super_admin (operator)

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

  // An album with no press/label/artist affiliation at all — nobody but an
  // operator has scope on it.
  albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${albumId}, ${"t3412 sm album"}, ${"t3412 artist"}, ${""})
  `);
  created.albums.add(albumId);

  // A manufacturer admin scoped to a press that has NOTHING to do with the
  // album (the enumeration/overwrite vector the review flagged).
  const pressId = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${pressId}, ${"t3412 Unrelated Press"})`);
  created.manufacturers.add(pressId);
  const outsiderId = randomUUID();
  const tag = outsiderId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${outsiderId}, ${"t3412_" + tag}, ${"x"}, ${"t3412"}, ${"t3412_" + tag + "@example.test"},
            true, ${"manufacturer"}, ${pressId})
  `);
  created.users.add(outsiderId);
  outsiderToken = await tokenFor(outsiderId);

  const adminId = randomUUID();
  const atag = adminId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${adminId}, ${"t3412a_" + atag}, ${"x"}, ${"t3412a"}, ${"t3412a_" + atag + "@example.test"},
            true, ${"super_admin"})
  `);
  created.users.add(adminId);
  adminToken = await tokenFor(adminId);
});

async function tokenFor(userId: string): Promise<string> {
  const token = "t3412tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function req(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const smPath = () => `/api/admin/albums/${albumId}/side-masters`;

test("no bearer → 401 before any DB read", async () => {
  const res = await req("GET", smPath(), null);
  assert.equal(res.status, 401);
});

test("a scoped admin with NO relation to the album is 403'd listing its side masters", async () => {
  const res = await req("GET", smPath(), outsiderToken);
  assert.equal(res.status, 403, "cross-album enumeration must be refused");
});

test("a scoped admin with NO relation to the album is 403'd attaching an upload to it", async () => {
  const res = await req("POST", smPath(), outsiderToken, {
    side: "A",
    assetUrl: "/objects/uploads/does-not-matter.wav",
    fileName: "sideA.wav",
  });
  assert.equal(
    res.status,
    403,
    "the album-scope gate must run BEFORE the upload object is touched",
  );
  const check = await req("GET", smPath(), adminToken);
  assert.equal(check.status, 200);
  assert.deepEqual(check.json, [], "nothing was attached");
});

test("delete is operator-only: a scoped press admin is 403'd even on a valid side", async () => {
  const res = await req("DELETE", `${smPath()}/A`, outsiderToken);
  assert.equal(res.status, 403, "remove stays operator-only, like completed-art override/remove");
});

test("an operator can list (sanity: the gate admits operators, empty album → [])", async () => {
  const res = await req("GET", smPath(), adminToken);
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, []);
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const id of created.albums) {
      await exec(sql`DELETE FROM album_side_masters WHERE album_id = ${id}`);
      await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    }
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
    for (const id of created.manufacturers)
      await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  } finally {
    await pool.end();
  }
});
