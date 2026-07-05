// Task #1266 — automated coverage for the artist request-to-delete flow
// on DELETE /api/admin/albums/:id (built in Task #1250). The route has
// three branches that are easy to regress silently:
//
//   1. super_admin / admin → DIRECT delete (soft-delete stamps
//      albums.deleted_at). No review queue.
//   2. An in-scope partner (artist/label) on a SOLD album → hard 403
//      with `sold:true`, and NOTHING is queued — a sold album's record
//      is frozen.
//   3. An in-scope partner on an UNSOLD album → 202 + a pending_changes
//      row whose patch is `{__op:"delete"}`, and the album is left
//      present (deleted_at still NULL) until a super-admin approves it.
//
// Plus two scope controls a code review would want: an out-of-scope partner is
// rejected 403 before anything is written, and an in-scope OWNER — even with a
// scope-wide edit_metadata=false — still gets owner-self-serve (202 + a queued
// request), because the owner default overrides partner_permissions.
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

async function seedAlbum(opts: { primaryArtistId?: string; sold?: boolean } = {}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id, first_sold_at)
    VALUES (${id}, ${"t1266 album"}, ${"t1266 artist"}, ${""},
            ${opts.primaryArtistId ?? null}, ${opts.sold ? new Date() : null})
  `);
  created.albums.add(id);
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

async function seedPartnerPermission(scopeId: string, editMetadata: boolean): Promise<void> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO partner_permissions (id, scope_kind, scope_id, edit_metadata)
    VALUES (${id}, ${"artist"}, ${scopeId}, ${editMetadata})
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

// ─── 3. In-scope partner on an UNSOLD album → 202 + queued request ────

test("an in-scope artist's delete on an UNSOLD album queues a request (202), album stays present", async () => {
  const person = await seedPerson();
  await seedPartnerPermission(person, true);
  const artist = await seedUser({ role: "artist", roleScopeId: person });
  const token = await tokenFor(artist);
  const albumId = await seedAlbum({ primaryArtistId: person, sold: false });

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 202, "a partner delete request is accepted-for-review, not applied");
  assert.ok(res.json?.pendingChange?.id, "the response returns the queued pending_changes row");

  const pending = await pendingDeleteRows(albumId);
  assert.equal(pending.length, 1, "exactly one delete request is queued");
  assert.equal(pending[0].target_table, "albums");
  assert.equal(pending[0].scope_kind, "artist");
  assert.equal(pending[0].scope_id, person);
  assert.equal(pending[0].status, "pending");
  assert.equal((pending[0].patch as any)?.__op, "delete", "the patch is the delete discriminator");

  assert.equal(await albumDeletedAt(albumId), null, "the album is NOT deleted — it waits for review");
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
// release: the delete still diverts to the review queue (202 + a queued
// request). partner_permissions only constrains invited teammates, who carry a
// subRole. (An earlier version of this test asserted an owner without an
// explicit grant got 403; that was stale — the owner-self-serve default landed
// after the test was first written.)
test("an in-scope OWNER without an explicit edit_metadata grant still gets owner-self-serve (202 + queued), not 403", async () => {
  const person = await seedPerson();
  await seedPartnerPermission(person, false); // scope-wide edit_metadata denied…
  const artist = await seedUser({ role: "artist", roleScopeId: person }); // …but this user OWNS the scope
  const token = await tokenFor(artist);
  const albumId = await seedAlbum({ primaryArtistId: person, sold: false });

  const res = await del(`/api/admin/albums/${albumId}`, token);

  assert.equal(res.status, 202, "an owner's delete is accepted-for-review despite edit_metadata=false");
  assert.ok(res.json?.pendingChange?.id, "the queued delete request is returned");

  const pending = await pendingDeleteRows(albumId);
  assert.equal(pending.length, 1, "exactly one delete request is queued");
  assert.equal(pending[0].status, "pending");
  assert.equal((pending[0].patch as any)?.__op, "delete", "the patch is the delete discriminator");

  assert.equal(await albumDeletedAt(albumId), null, "the album is NOT deleted — it waits for review");
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
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
  } finally {
    await pool.end();
  }
});
