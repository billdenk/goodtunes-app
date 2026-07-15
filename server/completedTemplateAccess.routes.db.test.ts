// Task #2725 — regression coverage for the Completed Art press-portal
// access boundary + the catalog-derived Inner Sleeve card.
//
// The boundaries that matter:
//   • GET /completed-template and POST /check now admit a press-scoped
//     manufacturer account, but ONLY for the album's OWN resolved press
//     (invited → default → unambiguous-SKU chain). A different press's
//     account must be 403'd or one plant could read another's art state.
//   • override and remove stay operator-only — a press must never wave
//     through (or delete) its own failing art. Press accounts get 403.
//   • Albums with NO resolvable press fail CLOSED for press accounts.
//   • The Inner Sleeve card derives from the press catalog: when the
//     resolved press's press_template_specs carries an inner_sleeve row
//     for the album's format, config.innerSleeves flips to "printed" and
//     the per-disc inner-sleeve cards join requiredComponents.
//
// Same harness as pressAudioSpec.routes.db.test.ts: full route tree over a
// loopback socket, bearer-only auth (requireAdminBearer). Every seeded row
// is torn down in `after`.
//
//   npx tsx --test server/completedTemplateAccess.routes.db.test.ts
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
  specs: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let ownPressId = "";
let otherPressId = "";
let pressToken = ""; // manufacturer scoped to ownPress
let otherPressToken = ""; // manufacturer scoped to otherPress
let adminToken = "";
let albumId = ""; // 12_lp album homed to ownPress via artist invited_by_press_id
let pressLessAlbumId = ""; // vinyl SKU but no resolvable press

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

  ownPressId = await seedManufacturer("t2725 Own Press");
  otherPressId = await seedManufacturer("t2725 Other Press");
  pressToken = await tokenFor(await seedManufacturerUser(ownPressId));
  otherPressToken = await tokenFor(await seedManufacturerUser(otherPressId));
  adminToken = await tokenFor(await seedAdminUser());

  // Album homed to ownPress: primary artist carries invited_by_press_id.
  const personId = randomUUID();
  await exec(sql`
    INSERT INTO people (id, name, invited_by_press_id)
    VALUES (${personId}, ${"t2725 artist " + personId.slice(0, 8)}, ${ownPressId})
  `);
  created.people.add(personId);
  albumId = await seedAlbum(personId);
  await seedVinylSku(albumId);

  // Album with a vinyl SKU but no press anywhere in the chain.
  const lonePersonId = randomUUID();
  await exec(sql`
    INSERT INTO people (id, name) VALUES (${lonePersonId}, ${"t2725 lone " + lonePersonId.slice(0, 8)})
  `);
  created.people.add(lonePersonId);
  pressLessAlbumId = await seedAlbum(lonePersonId);
  await seedVinylSku(pressLessAlbumId);
});

async function seedManufacturer(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${id}, ${name})`);
  created.manufacturers.add(id);
  return id;
}

async function seedManufacturerUser(pressId: string): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t2725_" + tag}, ${"x"}, ${"t2725"}, ${"t2725_" + tag + "@example.test"},
            true, ${"manufacturer"}, ${pressId})
  `);
  created.users.add(id);
  return id;
}

async function seedAdminUser(): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${id}, ${"t2725a_" + tag}, ${"x"}, ${"t2725a"}, ${"t2725a_" + tag + "@example.test"},
            true, ${"super_admin"})
  `);
  created.users.add(id);
  return id;
}

async function seedAlbum(primaryArtistId: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id)
    VALUES (${id}, ${"t2725 album"}, ${"t2725 artist"}, ${""}, ${primaryArtistId})
  `);
  created.albums.add(id);
  return id;
}

async function seedVinylSku(forAlbumId: string): Promise<void> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO album_skus (id, album_id, format, price_cents, active)
    VALUES (${id}, ${forAlbumId}, ${"12_lp"}, ${3500}, TRUE)
  `);
  created.skus.add(id);
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t2725tok_" + randomUUID().replace(/-/g, "");
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

const getPath = (id: string) => `/api/admin/albums/${id}/completed-template`;

// ─── Auth boundary ─────────────────────────────────────────────────────

test("no bearer → 401", async () => {
  const res = await req("GET", getPath(albumId), null);
  assert.equal(res.status, 401);
});

test("operator reads the completed-template payload", async () => {
  const res = await req("GET", getPath(albumId), adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.json.configured, true, "12_lp SKU → configured");
});

test("the album's own press reads the completed-template payload", async () => {
  const res = await req("GET", getPath(albumId), pressToken);
  assert.equal(res.status, 200, "own press is admitted to the READ");
  assert.equal(res.json.configured, true);
});

test("a DIFFERENT press is 403'd from the read", async () => {
  const res = await req("GET", getPath(albumId), otherPressToken);
  assert.equal(res.status, 403, "cross-press read must fail");
});

test("an album with no resolvable press fails CLOSED for press accounts", async () => {
  const res = await req("GET", getPath(pressLessAlbumId), pressToken);
  assert.equal(res.status, 403, "no resolved press → no press access");
  const admin = await req("GET", getPath(pressLessAlbumId), adminToken);
  assert.equal(admin.status, 200, "operator still reads it");
});

test("the album's own press may POST a check (upload path gate)", async () => {
  // Bad URL → the gate must PASS (not 403); the body/scan fails later
  // with a 4xx that is NOT the access error. We only pin the gate here.
  const res = await req("POST", `${getPath(albumId)}/check`, pressToken, {
    url: "not-a-url",
  });
  assert.notEqual(res.status, 401);
  assert.notEqual(res.status, 403, "own press must clear the check gate");
});

test("a DIFFERENT press is 403'd from POST /check", async () => {
  const res = await req("POST", `${getPath(albumId)}/check`, otherPressToken, {
    url: "not-a-url",
  });
  assert.equal(res.status, 403, "cross-press check must fail the gate");
});

test("override and remove stay operator-only — press gets 403", async () => {
  const override = await req("POST", `${getPath(albumId)}/override`, pressToken, {
    componentId: "jacket",
    justification: "press trying to wave itself through",
  });
  assert.equal(override.status, 403, "press must not override its own failing art");
  const remove = await req("POST", `${getPath(albumId)}/remove`, pressToken, {
    componentId: "jacket",
  });
  assert.equal(remove.status, 403, "press must not remove files");
});

// ─── Inner-sleeve derivation from the press catalog ───────────────────

test("no inner_sleeve catalog row → innerSleeves stays 'none'", async () => {
  const res = await req("GET", getPath(albumId), adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.json.config.innerSleeves, "none");
  const ids = (res.json.requiredComponents as { id: string }[]).map((c) => c.id);
  assert.ok(!ids.some((i) => i.startsWith("inner_sleeve")), "no inner-sleeve card yet");
});

test("an inner_sleeve catalog row for the album's format derives 'printed'", async () => {
  const specId = randomUUID();
  await exec(sql`
    INSERT INTO press_template_specs (id, press_id, format, component_key, variant_key, disc_count)
    VALUES (${specId}, ${ownPressId}, ${"12_lp"}, ${"inner_sleeve"}, ${""}, 0)
  `);
  created.specs.add(specId);

  const res = await req("GET", getPath(albumId), adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.json.config.innerSleeves, "printed", "catalog row → derived printed");
  const ids = (res.json.requiredComponents as { id: string }[]).map((c) => c.id);
  assert.ok(ids.includes("inner_sleeve_1"), "inner-sleeve card joins the required set");

  // The catalog row belongs to ownPress — the press-less album (different
  // resolution chain: none) must NOT pick it up.
  const other = await req("GET", getPath(pressLessAlbumId), adminToken);
  assert.equal(other.status, 200);
  assert.equal(other.json.config.innerSleeves, "none", "no resolved press → no derivation");
});

after(async () => {
  for (const id of created.specs) await exec(sql`DELETE FROM press_template_specs WHERE id = ${id}`);
  for (const id of created.skus) await exec(sql`DELETE FROM album_skus WHERE id = ${id}`);
  for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
  for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
  for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
  for (const id of created.users) await exec(sql`DELETE FROM users WHERE id = ${id}`);
  for (const id of created.manufacturers) await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  httpServer?.close();
  await pool.end();
});
