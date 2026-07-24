// #2793 / #2821 — regression coverage for two fail-close access-control fixes
// reimplemented on main:
//
// #2793 (fail-close partner order/fan visibility):
//   - GET /api/admin/orders (commerce.ts): only super_admin/admin see the
//     global fan-order list; a scoped artist sees ONLY orders for their own
//     albums; a scope-less artist gets []; every other partner role admitted
//     by requireAdmin (manufacturer here as the representative) gets [].
//   - GET /api/admin/customers (+/geo, /:id): same allow-list — manufacturer
//     gets empty list / empty geo / 403 on detail.
//
// #2821 (artist People-tab god-view):
//   - GET /api/people resolves the caller session-OR-Bearer (admin-kind only),
//     so a Bearer-authed artist is scoped to people credited on their own
//     albums (a session-only read made them look anonymous → full catalog).
//     Scope-less artist → []. Anonymous callers keep the full public list.
//   - GET /api/admin/people (PersonPicker typeahead) applies the same credited
//     scope: an artist can't name-search the whole People catalog.
//
// Same harness as labelManagerNpoIsolation.db.test.ts: full route tree over a
// loopback socket, Bearer tokens via storage.createAuthToken. Real DB
// (DATABASE_URL). Every row seeded here is torn down in `after`.
//
//   npx tsx --test server/partnerOrderPeopleScope.db.test.ts
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
  users: new Set<string>(),
  tokens: new Set<string>(),
  people: new Set<string>(),
  albums: new Set<string>(),
  songs: new Set<string>(),
  credits: new Set<string>(),
  customers: new Set<string>(),
  orders: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

// Seeded ids, filled in `before`.
let artistPersonId = "";       // scoped artist's own person row
let creditedPersonId = "";     // credited on the artist's album
let strangerPersonId = "";     // NOT credited anywhere near the artist
let myAlbumId = "";            // artist's own album
let otherAlbumId = "";         // someone else's album
let myOrderId = "";
let otherOrderId = "";

let scopedArtistToken = "";
let scopelessArtistToken = "";
let manufacturerToken = "";
let strangerName = "";

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

  const tag = randomUUID().slice(0, 8);

  // People: the artist, a person credited on their album, and a stranger.
  artistPersonId = await seedPerson(`T2793 Artist ${tag}`);
  creditedPersonId = await seedPerson(`T2793 Credited ${tag}`);
  strangerName = `T2793 Stranger ${tag}`;
  strangerPersonId = await seedPerson(strangerName);

  // Albums: one owned by the artist, one by nobody in this cast.
  myAlbumId = await seedAlbum(`T2793 Mine ${tag}`, artistPersonId);
  otherAlbumId = await seedAlbum(`T2793 Other ${tag}`, null);

  // Credit the credited person on the artist's album.
  const creditId = randomUUID();
  await exec(sql`
    INSERT INTO album_credits (id, album_id, person_id, name, role)
    VALUES (${creditId}, ${myAlbumId}, ${creditedPersonId}, ${"T2793 Credited " + tag}, ${"Producer"})
  `);
  created.credits.add(creditId);

  // A fan + one order per album.
  const fanId = randomUUID();
  await exec(sql`
    INSERT INTO customer_users (id, username, email, display_name)
    VALUES (${fanId}, ${"t2793_fan_" + tag}, ${"t2793_fan_" + tag + "@example.test"}, ${"T2793 Fan"})
  `);
  created.customers.add(fanId);
  myOrderId = await seedOrder(fanId, myAlbumId);
  otherOrderId = await seedOrder(fanId, otherAlbumId);

  // Admin accounts: scoped artist, scope-less artist, manufacturer.
  scopedArtistToken = await tokenFor(await seedAdminUser("artist", artistPersonId, tag + "a"));
  scopelessArtistToken = await tokenFor(await seedAdminUser("artist", null, tag + "b"));
  manufacturerToken = await tokenFor(await seedAdminUser("manufacturer", randomUUID(), tag + "c"));
});

async function seedPerson(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO people (id, name) VALUES (${id}, ${name})`);
  created.people.add(id);
  return id;
}

async function seedAlbum(title: string, primaryArtistId: string | null): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id)
    VALUES (${id}, ${title}, ${"T2793"}, ${"/album-placeholder.svg"}, ${primaryArtistId})
  `);
  created.albums.add(id);
  return id;
}

async function seedOrder(customerId: string, albumId: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO orders (id, customer_id, album_id, total_cents, status)
    VALUES (${id}, ${customerId}, ${albumId}, ${2500}, ${"paid"})
  `);
  created.orders.add(id);
  return id;
}

async function seedAdminUser(role: string, scopeId: string | null, tag: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t2793_" + tag}, ${"x"}, ${"t2793"}, ${"t2793_" + tag + "@example.test"},
            true, ${role}, ${scopeId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t2793tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function get(path: string, token?: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  let json: any = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

// ─── #2793: /api/admin/orders ───────────────────────────────────────

test("orders: scoped artist sees ONLY their own album's orders", async () => {
  const res = await get("/api/admin/orders", scopedArtistToken);
  assert.equal(res.status, 200);
  const ids = new Set((res.json as any[]).map((o) => o.id));
  assert.ok(ids.has(myOrderId), "artist sees their own album's order");
  assert.ok(!ids.has(otherOrderId), "artist must NOT see another album's order");
});

test("orders: scope-less artist gets an empty list", async () => {
  const res = await get("/api/admin/orders", scopelessArtistToken);
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, []);
});

test("orders: manufacturer gets an empty list (no god-view)", async () => {
  const res = await get("/api/admin/orders", manufacturerToken);
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, []);
});

// ─── #2793: /api/admin/customers family ─────────────────────────────

test("customers: manufacturer gets empty list, empty geo, 403 detail", async () => {
  const list = await get("/api/admin/customers", manufacturerToken);
  assert.equal(list.status, 200);
  assert.deepEqual(list.json?.rows, []);
  const geo = await get("/api/admin/customers/geo", manufacturerToken);
  assert.equal(geo.status, 200);
  assert.deepEqual(geo.json?.points, []);
  const detail = await get(`/api/admin/customers/${randomUUID()}`, manufacturerToken);
  assert.equal(detail.status, 403);
});

// ─── #2821: /api/people ─────────────────────────────────────────────

test("people: Bearer-authed scoped artist is filtered to credited people", async () => {
  const res = await get("/api/people", scopedArtistToken);
  assert.equal(res.status, 200);
  const ids = new Set((res.json as any[]).map((p) => p.id));
  assert.ok(ids.has(artistPersonId), "artist sees themselves");
  assert.ok(ids.has(creditedPersonId), "artist sees a person credited on their album");
  assert.ok(!ids.has(strangerPersonId), "artist must NOT see an uncredited stranger");
});

test("people: scope-less artist gets an empty list", async () => {
  const res = await get("/api/people", scopelessArtistToken);
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, []);
});

test("people: anonymous caller keeps the full public list", async () => {
  const res = await get("/api/people");
  assert.equal(res.status, 200);
  const ids = new Set((res.json as any[]).map((p) => p.id));
  assert.ok(ids.has(strangerPersonId), "public list still includes every person");
});

// ─── #2821: /api/admin/people typeahead ─────────────────────────────

test("typeahead: scoped artist cannot find an uncredited person by name", async () => {
  const res = await get(
    `/api/admin/people?q=${encodeURIComponent(strangerName.slice(0, 12))}`,
    scopedArtistToken,
  );
  assert.equal(res.status, 200);
  const ids = new Set((res.json as any[]).map((p) => p.id));
  assert.ok(!ids.has(strangerPersonId), "typeahead must not surface uncredited people to an artist");
});

test("typeahead: scoped artist CAN find their credited person", async () => {
  const res = await get(
    `/api/admin/people?q=${encodeURIComponent("T2793 Credited")}`,
    scopedArtistToken,
  );
  assert.equal(res.status, 200);
  const ids = new Set((res.json as any[]).map((p) => p.id));
  assert.ok(ids.has(creditedPersonId), "credited person stays findable in the picker");
});

test("typeahead: scope-less artist gets an empty result", async () => {
  const res = await get("/api/admin/people?q=T2793", scopelessArtistToken);
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, []);
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.orders) await exec(sql`DELETE FROM orders WHERE id = ${id}`);
    for (const id of created.credits) await exec(sql`DELETE FROM album_credits WHERE id = ${id}`);
    for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
    for (const id of created.customers) await exec(sql`DELETE FROM customer_users WHERE id = ${id}`);
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
  } finally {
    await pool.end();
  }
});
