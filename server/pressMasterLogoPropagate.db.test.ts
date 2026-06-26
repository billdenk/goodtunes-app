// Task #2237 — propagating a press master-logo change to riding albums.
//
// When a press edits (or clears) its master logo
// (manufacturers.vinyl_placeholder_url, the default vinyl jacket image),
// every album still riding that press's PREVIOUS branded default must move
// to the new value at once. Albums with a real custom cover, albums NOT
// homed to this press, and soft-deleted albums must be left untouched. When
// the logo is cleared the riding albums fall back to the standard
// placeholder sentinel ("/album-placeholder.svg"), never a dead URL.
//
// The single write chokepoint is PUT /api/admin/manufacturers/:id (both the
// operator admin page and the press-portal catalog editor go through it), so
// these tests drive the real route over a loopback socket with a Bearer
// token — same harness as adminAlbumDuplicate.db.test.ts (127.0.0.1 is an
// unknown host, so the host/kind boundary is skipped and the token kind is
// trusted).
//
//   npx tsx --test server/pressMasterLogoPropagate.db.test.ts
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

const SENTINEL = "/album-placeholder.svg";

const created = {
  people: new Set<string>(),
  labels: new Set<string>(),
  albums: new Set<string>(),
  presses: new Set<string>(),
  pors: new Set<string>(),
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

async function put(path: string, token: string, body: any): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
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

async function seedPress(vinylPlaceholderUrl: string | null): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO manufacturers (id, name, vinyl_placeholder_url)
    VALUES (${id}, ${"t2237 press " + id.slice(0, 8)}, ${vinylPlaceholderUrl})
  `);
  created.presses.add(id);
  return id;
}

async function seedPerson(opts: { defaultPressId?: string | null } = {}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO people (id, name, default_press_id)
    VALUES (${id}, ${"t2237 person " + id.slice(0, 8)}, ${opts.defaultPressId ?? null})
  `);
  created.people.add(id);
  return id;
}

async function seedLabel(opts: { defaultPressId?: string | null } = {}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO labels (id, name, default_press_id)
    VALUES (${id}, ${"t2237 label " + id.slice(0, 8)}, ${opts.defaultPressId ?? null})
  `);
  created.labels.add(id);
  return id;
}

async function seedAlbum(opts: {
  artwork: string;
  primaryArtistId?: string | null;
  labelId?: string | null;
  deleted?: boolean;
}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id, label_id, deleted_at)
    VALUES (${id}, ${"t2237 album"}, ${"t2237 artist"}, ${opts.artwork},
            ${opts.primaryArtistId ?? null}, ${opts.labelId ?? null},
            ${opts.deleted ? sql`now()` : null})
  `);
  created.albums.add(id);
  return id;
}

// Homes an album to a press via a pressing-order request snapshot — the
// "Press it!" path that snapshots the picked press at submit time.
async function homeViaPor(albumId: string, pressId: string): Promise<void> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO pressing_order_requests
      (id, album_id, status, package_snapshot, quantity, unit_cents, total_cents)
    VALUES (${id}, ${albumId}, ${"pending"},
            ${JSON.stringify({ pressId })}::jsonb, ${0}, ${0}, ${0})
  `);
  created.pors.add(id);
}

async function seedSuperAdmin(): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t2237_" + tag}, ${"x"}, ${"t2237"}, ${"t2237_" + tag + "@example.test"},
            true, ${"super_admin"}, ${null})
  `);
  created.users.add(id);
  const token = "t2237tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, id, "admin");
  created.tokens.add(token);
  return token;
}

async function artworkOf(albumId: string): Promise<string | null> {
  const r = rows(await exec(sql`SELECT artwork FROM albums WHERE id = ${albumId}`))[0];
  return r?.artwork ?? null;
}

// ─── 1. Updating the logo migrates riding albums; spares the rest ─────

test("updating a press logo repoints riding albums, leaving custom/unhomed/deleted untouched", async () => {
  const token = await seedSuperAdmin();
  const OLD = `https://cdn.example.test/press-old-${randomUUID()}.png`;
  const NEW = `https://cdn.example.test/press-new-${randomUUID()}.png`;
  const CUSTOM = `https://cdn.example.test/custom-${randomUUID()}.png`;

  const press = await seedPress(OLD);

  // A — rides the old default, homed via pressing-order snapshot → repointed.
  const albumViaPor = await seedAlbum({ artwork: OLD });
  await homeViaPor(albumViaPor, press);

  // B — rides the old default, homed via primary artist's default press → repointed.
  const artist = await seedPerson({ defaultPressId: press });
  const albumViaArtist = await seedAlbum({ artwork: OLD, primaryArtistId: artist });

  // B2 — rides the old default, homed via label's default press → repointed.
  const label = await seedLabel({ defaultPressId: press });
  const albumViaLabel = await seedAlbum({ artwork: OLD, labelId: label });

  // C — real custom cover, homed to the press → MUST stay untouched.
  const albumCustom = await seedAlbum({ artwork: CUSTOM, primaryArtistId: artist });

  // D — rides the old default URL but NOT homed to this press → untouched (collision guard).
  const albumUnhomed = await seedAlbum({ artwork: OLD });

  // E — rides the old default, homed, but soft-deleted → untouched.
  const albumDeleted = await seedAlbum({ artwork: OLD, primaryArtistId: artist, deleted: true });

  const res = await put(`/api/admin/manufacturers/${press}`, token, { vinylPlaceholderUrl: NEW });
  assert.equal(res.status, 200, "logo update saves");
  assert.equal(res.json?.vinylPlaceholderUrl, NEW, "the new logo is persisted on the press");

  assert.equal(await artworkOf(albumViaPor), NEW, "album homed via pressing-order moves to the new logo");
  assert.equal(await artworkOf(albumViaArtist), NEW, "album homed via artist default press moves");
  assert.equal(await artworkOf(albumViaLabel), NEW, "album homed via label default press moves");
  assert.equal(await artworkOf(albumCustom), CUSTOM, "a real custom cover is never touched");
  assert.equal(await artworkOf(albumUnhomed), OLD, "an album not homed to this press is left alone");
  assert.equal(await artworkOf(albumDeleted), OLD, "a soft-deleted album is left alone");
});

// ─── 2. Clearing the logo falls riding albums back to the sentinel ───

test("clearing a press logo repoints riding albums to the placeholder sentinel", async () => {
  const token = await seedSuperAdmin();
  const OLD = `https://cdn.example.test/press-clear-${randomUUID()}.png`;

  const press = await seedPress(OLD);
  const artist = await seedPerson({ defaultPressId: press });
  const album = await seedAlbum({ artwork: OLD, primaryArtistId: artist });

  const res = await put(`/api/admin/manufacturers/${press}`, token, { vinylPlaceholderUrl: "" });
  assert.equal(res.status, 200, "clearing the logo saves");
  assert.ok(!res.json?.vinylPlaceholderUrl, "the press logo is cleared (empty/null)");

  assert.equal(
    await artworkOf(album),
    SENTINEL,
    "a riding album falls back to the standard placeholder, not a dead URL",
  );
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const id of created.pors) await exec(sql`DELETE FROM pressing_order_requests WHERE id = ${id}`);
    for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    for (const id of created.presses) await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
    for (const id of created.labels) await exec(sql`DELETE FROM labels WHERE id = ${id}`);
    for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
  } finally {
    await pool.end();
  }
});
