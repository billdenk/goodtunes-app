// Automated coverage for the album-delete branches on
// DELETE /api/admin/albums/:id. The route has three branches that are
// easy to regress silently:
//
//   1. super_admin / admin → DIRECT delete (soft-delete stamps
//      albums.deleted_at). No review queue.
//   2. An in-scope partner (artist/label) on a SOLD album → hard 403
//      with `sold:true`, and NOTHING is deleted — a sold album's record
//      is frozen. "Sold" = first_sold_at stamped OR (belt-and-suspenders)
//      any live paid order on the album.
//   3. An in-scope partner on an UNSOLD album → DIRECT soft-delete
//      (200, deleted_at stamped, no pending_changes divert) — artists
//      self-delete their own unsold drafts; operators can restore from
//      Trash.
//
// Plus two scope controls a code review would want: an out-of-scope partner is
// rejected 403 before anything is written, and an in-scope OWNER — even with a
// scope-wide edit_metadata=false — still gets owner-self-serve (direct
// delete), because the owner default overrides partner_permissions.
//
// The branching lives inside the real Express handler (scope resolution +
// the sold check + createPendingChange), so a faithful guard must drive
// the actual route, not a re-implementation. We mount the full route tree
// exactly as server/index.ts does and exercise it over a real loopback
// socket, authenticating with a Bearer token (127.0.0.1 is an unknown
// host, so the host/kind boundary is skipped and the token kind is
// trusted — same as the identityLink route test).
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/adminAlbumDelete.db.test.ts
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
  people: new Set<string>(),
  labels: new Set<string>(),
  albums: new Set<string>(),
  users: new Set<string>(),
  tokens: new Set<string>(),
  perms: new Set<string>(),
  customers: new Set<string>(),
  orders: new Set<string>(),
  manufacturers: new Set<string>(),
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

async function del(path: string, token: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "DELETE",
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

async function seedPerson(): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO people (id, name) VALUES (${id}, ${"t1266 person " + id.slice(0, 8)})`);
  created.people.add(id);
  return id;
}

async function seedAlbum(
  opts: {
    primaryArtistId?: string;
    sold?: boolean;
    labelId?: string;
    createdByScopeKind?: string;
    createdByScopeId?: string;
    createdByUserId?: string;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id, first_sold_at,
                        label_id, created_by_user_id, created_by_scope_kind, created_by_scope_id)
    VALUES (${id}, ${"t1266 album"}, ${"t1266 artist"}, ${""},
            ${opts.primaryArtistId ?? null}, ${opts.sold ? new Date() : null},
            ${opts.labelId ?? null}, ${opts.createdByUserId ?? null},
            ${opts.createdByScopeKind ?? null}, ${opts.createdByScopeId ?? null})
  `);
  created.albums.add(id);
  return id;
}

async function seedLabel(): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO labels (id, name) VALUES (${id}, ${"t1266 label " + id.slice(0, 8)})`);
  created.labels.add(id);
  return id;
}

async function seedPress(): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${id}, ${"t1266 press " + id.slice(0, 8)})`);
  created.manufacturers.add(id);
  return id;
}

// Seed a user with the legacy role columns set. getUserRole synthesizes a
// single membership from these when the user has no memberships rows, so
// this is sufficient for both god-role and partner-scope resolution.
async function seedUser(opts: { role: string; roleScopeId: string | null }): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t1266_" + tag}, ${"x"}, ${"t1266"}, ${"t1266_" + tag + "@example.test"},
            true, ${opts.role}, ${opts.roleScopeId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t1266tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function seedPartnerPermission(scopeId: string, editMetadata: boolean, scopeKind = "artist"): Promise<void> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO partner_permissions (id, scope_kind, scope_id, edit_metadata)
    VALUES (${id}, ${scopeKind}, ${scopeId}, ${editMetadata})
  `);
  created.perms.add(id);
}

async function albumDeletedAt(albumId: string): Promise<Date | null> {
  const r = rows(await exec(sql`SELECT deleted_at FROM albums WHERE id = ${albumId}`))[0];
  return (r?.deleted_at as Date | null) ?? null;
}

async function pendingDeleteRows(albumId: string): Promise<any[]> {
  return rows(await exec(sql`
    SELECT id, target_table, target_id, scope_kind, scope_id, status, patch
      FROM pending_changes
     WHERE target_id = ${albumId}
  `));
}

// ─── 1. Operators delete directly ─────────────────────────────────────

test("super_admin deletes an album directly (soft-delete, no review queue)", async () => {
  const op = await seedUser({ role: "super_admin", roleScopeId: null });
  const token = await tokenFor(op);
  const albumId = await seedAlbum();

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 200, "operator delete returns 200");
  assert.equal(res.json?.message, "Deleted");
  assert.notEqual(await albumDeletedAt(albumId), null, "album is soft-deleted (deleted_at stamped)");
  assert.equal((await pendingDeleteRows(albumId)).length, 0, "operators never queue a request");
});

test("admin (god-view ops tier) also deletes directly", async () => {
  const op = await seedUser({ role: "admin", roleScopeId: null });
  const token = await tokenFor(op);
  const albumId = await seedAlbum();

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 200, "admin delete returns 200");
  assert.notEqual(await albumDeletedAt(albumId), null, "album is soft-deleted");
});

// ─── 2. In-scope partner on a SOLD album → hard 403, nothing queued ───

test("an in-scope artist CANNOT delete a SOLD album (403 sold:true, no pending change)", async () => {
  const person = await seedPerson();
  await seedPartnerPermission(person, true); // has edit_metadata — the sold-block is what bites
  const artist = await seedUser({ role: "artist", roleScopeId: person });
  const token = await tokenFor(artist);
  const albumId = await seedAlbum({ primaryArtistId: person, sold: true });

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 403, "a sold album is hard-blocked for partners");
  assert.equal(res.json?.sold, true, "the block carries sold:true so the UI can explain why");
  assert.equal(await albumDeletedAt(albumId), null, "the album is left intact");
  assert.equal((await pendingDeleteRows(albumId)).length, 0, "a sold-block must NOT queue a request");
});

// ─── 3. In-scope partner on an UNSOLD album → direct soft-delete ──────

test("an in-scope artist deletes an UNSOLD album directly (200, soft-deleted, nothing queued)", async () => {
  const person = await seedPerson();
  await seedPartnerPermission(person, true);
  const artist = await seedUser({ role: "artist", roleScopeId: person });
  const token = await tokenFor(artist);
  const albumId = await seedAlbum({ primaryArtistId: person, sold: false });

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 200, "an unsold album is deleted directly, no review divert");
  assert.equal(res.json?.message, "Deleted");
  assert.notEqual(await albumDeletedAt(albumId), null, "album is soft-deleted (deleted_at stamped)");
  assert.equal((await pendingDeleteRows(albumId)).length, 0, "no pending_changes row is queued");
});

// Belt-and-suspenders: an album whose first_sold_at was never stamped but
// that has a live paid order is still treated as SOLD (403, untouched).
test("an unstamped album with a live paid order is still sold-blocked (403)", async () => {
  const person = await seedPerson();
  await seedPartnerPermission(person, true);
  const artist = await seedUser({ role: "artist", roleScopeId: person });
  const token = await tokenFor(artist);
  const albumId = await seedAlbum({ primaryArtistId: person, sold: false });

  const customerId = randomUUID();
  const tag = customerId.slice(0, 8);
  await exec(sql`
    INSERT INTO customer_users (id, username, email, display_name)
    VALUES (${customerId}, ${"t1266c_" + tag}, ${"t1266c_" + tag + "@example.test"}, ${"t1266 fan"})
  `);
  created.customers.add(customerId);
  const orderId = randomUUID();
  await exec(sql`
    INSERT INTO orders (id, customer_id, album_id, total_cents, status)
    VALUES (${orderId}, ${customerId}, ${albumId}, ${1999}, ${"paid"})
  `);
  created.orders.add(orderId);

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 403, "a paid order sold-blocks even without first_sold_at");
  assert.equal(res.json?.sold, true, "the block carries sold:true");
  assert.equal(await albumDeletedAt(albumId), null, "album untouched");
});

// ─── Scope controls: out-of-scope 403, owner-self-serve 202 ───────────

test("an OUT-OF-SCOPE artist is rejected (403) and queues nothing", async () => {
  const ownerScope = await seedPerson(); // the album's real owner
  const otherScope = await seedPerson(); // the caller manages a different artist
  await seedPartnerPermission(otherScope, true);
  const artist = await seedUser({ role: "artist", roleScopeId: otherScope });
  const token = await tokenFor(artist);
  const albumId = await seedAlbum({ primaryArtistId: ownerScope, sold: false });

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 403, "a partner can't touch an album outside their scope");
  assert.equal(await albumDeletedAt(albumId), null, "album untouched");
  assert.equal((await pendingDeleteRows(albumId)).length, 0, "nothing queued");
});

// An artist-scope OWNER (their role_scope_id IS the album's primary_artist_id,
// with no memberships row — so getUserRole synthesizes an owner membership,
// subRole=null) implicitly holds the OWNER_SELF_SERVE_VERBS, including
// edit_metadata, via resolveVerbAllowed — REGARDLESS of partner_permissions. So
// a scope-wide edit_metadata=false does NOT lock an owner out of their own
// release: the unsold delete goes through directly. partner_permissions only
// constrains invited teammates, who carry a subRole.
test("an in-scope OWNER without an explicit edit_metadata grant still gets owner-self-serve (direct delete), not 403", async () => {
  const person = await seedPerson();
  await seedPartnerPermission(person, false); // scope-wide edit_metadata denied…
  const artist = await seedUser({ role: "artist", roleScopeId: person }); // …but this user OWNS the scope
  const token = await tokenFor(artist);
  const albumId = await seedAlbum({ primaryArtistId: person, sold: false });

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 200, "an owner's unsold delete succeeds despite edit_metadata=false");
  assert.notEqual(await albumDeletedAt(albumId), null, "album is soft-deleted");
  assert.equal((await pendingDeleteRows(albumId)).length, 0, "no pending_changes row is queued");
});

// ─── Press/label delete for self-created albums (creation provenance) ──
//
// A press (manufacturer) or label may delete an UNSOLD album ONLY when its
// scope is the album's recorded creator (created_by_scope_kind/_id). NULL
// provenance = legacy/artist-created, never partner-deletable by press/label.
// Artist deletes stay provenance-independent.

test("a press deletes its OWN unsold press-created album (200, soft-deleted)", async () => {
  const pressId = await seedPress();
  const person = await seedPerson();
  const pressUser = await seedUser({ role: "manufacturer", roleScopeId: pressId });
  const token = await tokenFor(pressUser);
  const albumId = await seedAlbum({
    primaryArtistId: person,
    createdByScopeKind: "manufacturer",
    createdByScopeId: pressId,
    createdByUserId: pressUser,
  });

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 200, "press deletes its own created album directly");
  assert.notEqual(await albumDeletedAt(albumId), null, "album is soft-deleted (30-day trash)");
  assert.equal((await pendingDeleteRows(albumId)).length, 0, "no review queue row");
});

test("a press CANNOT delete an artist-created (null-provenance) album (403 with clear reason)", async () => {
  const pressId = await seedPress();
  const person = await seedPerson();
  const pressUser = await seedUser({ role: "manufacturer", roleScopeId: pressId });
  const token = await tokenFor(pressUser);
  // No provenance stamped — legacy/artist-created.
  const albumId = await seedAlbum({ primaryArtistId: person });

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 403, "press is refused on an album its press didn't create");
  assert.equal(res.json?.createdByArtist, true, "refusal carries createdByArtist so the UI can explain");
  assert.equal(await albumDeletedAt(albumId), null, "album untouched");
});

test("a press CANNOT delete an album created by a DIFFERENT press", async () => {
  const pressA = await seedPress();
  const pressB = await seedPress();
  const person = await seedPerson();
  const pressUser = await seedUser({ role: "manufacturer", roleScopeId: pressA });
  const token = await tokenFor(pressUser);
  const albumId = await seedAlbum({
    primaryArtistId: person,
    createdByScopeKind: "manufacturer",
    createdByScopeId: pressB,
  });

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 403, "creator scope must match the caller's press");
  assert.equal(res.json?.createdByArtist, true);
  assert.equal(await albumDeletedAt(albumId), null, "album untouched");
});

test("a press CANNOT delete its own created album after a sale (403 sold:true)", async () => {
  const pressId = await seedPress();
  const person = await seedPerson();
  const pressUser = await seedUser({ role: "manufacturer", roleScopeId: pressId });
  const token = await tokenFor(pressUser);
  const albumId = await seedAlbum({
    primaryArtistId: person,
    sold: true,
    createdByScopeKind: "manufacturer",
    createdByScopeId: pressId,
    createdByUserId: pressUser,
  });

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 403, "sold albums stay hard-blocked even for the creator press");
  assert.equal(res.json?.sold, true, "the block carries sold:true");
  assert.equal(await albumDeletedAt(albumId), null, "album untouched");
});

test("a label deletes its OWN unsold label-created album (200, soft-deleted)", async () => {
  const labelId = await seedLabel();
  await seedPartnerPermission(labelId, true, "label"); // labels need the edit_metadata grant (no owner-self-serve)
  const labelUser = await seedUser({ role: "label", roleScopeId: labelId });
  const token = await tokenFor(labelUser);
  const albumId = await seedAlbum({
    labelId,
    createdByScopeKind: "label",
    createdByScopeId: labelId,
    createdByUserId: labelUser,
  });

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 200, "label deletes its own created album directly");
  assert.notEqual(await albumDeletedAt(albumId), null, "album is soft-deleted");
});

test("a label CANNOT delete an artist-created (null-provenance) album on its roster (403 with clear reason)", async () => {
  const labelId = await seedLabel();
  const person = await seedPerson();
  const labelUser = await seedUser({ role: "label", roleScopeId: labelId });
  const token = await tokenFor(labelUser);
  // In the label's scope (label_id set) but NOT created by the label.
  const albumId = await seedAlbum({ labelId, primaryArtistId: person });

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 403, "label is refused on an album it didn't create");
  assert.equal(res.json?.createdByArtist, true, "refusal carries createdByArtist");
  assert.equal(await albumDeletedAt(albumId), null, "album untouched");
});

test("a label CANNOT delete its own created album after a sale (403 sold:true)", async () => {
  const labelId = await seedLabel();
  await seedPartnerPermission(labelId, true, "label");
  const labelUser = await seedUser({ role: "label", roleScopeId: labelId });
  const token = await tokenFor(labelUser);
  const albumId = await seedAlbum({
    labelId,
    sold: true,
    createdByScopeKind: "label",
    createdByScopeId: labelId,
  });

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 403, "sold hard-block wins over creator provenance");
  assert.equal(res.json?.sold, true);
  assert.equal(await albumDeletedAt(albumId), null, "album untouched");
});

test("an artist still deletes their own unsold album even when a press created it (provenance-independent)", async () => {
  const pressId = await seedPress();
  const person = await seedPerson();
  await seedPartnerPermission(person, true);
  const artist = await seedUser({ role: "artist", roleScopeId: person });
  const token = await tokenFor(artist);
  const albumId = await seedAlbum({
    primaryArtistId: person,
    createdByScopeKind: "manufacturer",
    createdByScopeId: pressId,
  });

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 200, "artist self-delete is unchanged by provenance");
  assert.notEqual(await albumDeletedAt(albumId), null, "album is soft-deleted");
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const id of created.orders) await exec(sql`DELETE FROM orders WHERE id = ${id}`);
    for (const id of created.customers) await exec(sql`DELETE FROM customer_users WHERE id = ${id}`);
    for (const id of created.albums) {
      await exec(sql`DELETE FROM pending_changes WHERE target_id = ${id}`);
      await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    }
    for (const id of created.perms) await exec(sql`DELETE FROM partner_permissions WHERE id = ${id}`);
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const id of created.users) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${id}`);
      await exec(sql`DELETE FROM users WHERE id = ${id}`);
    }
    for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
    for (const id of created.labels) await exec(sql`DELETE FROM labels WHERE id = ${id}`);
    for (const id of created.manufacturers) await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  } finally {
    await pool.end();
  }
});
