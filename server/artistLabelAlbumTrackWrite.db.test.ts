// Task #2896 — an album's PRIMARY ARTIST must be able to add/edit tracks
// even when the album is attached to a label. The partner write gates
// historically resolved an album's scope label-first with artist only as
// fallback, so on a label-attached album the primary artist's artist-scope
// membership never matched → "403: Out of scope" right after a successful
// master upload. The dual-scope resolution (findAlbumScopeMembership +
// the fallbacks in partnerEditGate / checkPartnerVerbForScope /
// requirePartnerPermission) fixes that while staying fail-closed for
// unrelated partners and byte-for-byte unchanged for label members.
//
// Coverage:
//   • primary artist on a PREPPING label-attached album → POST
//     /api/admin/songs creates directly (201) — artist-owner phase policy.
//   • primary artist on a RELEASED (pre-sale) label-attached album →
//     divert (202) and the pending change is stamped with the MATCHED
//     artist scope, not the label-first one.
//   • upload_masters resolves through the same dual-scope path
//     (checkPartnerVerbForScope with the label-first scope passed in).
//   • an artist with NO relationship to the album still gets 403
//     "Out of scope".
//   • a label member keeps working exactly as today (201 with
//     edit_metadata granted + approval off).
//
// Same harness as labelManagerNpoIsolation.db.test.ts: full route tree
// over a loopback socket, bearer-token auth. Real DB (DATABASE_URL):
//
//   npx tsx --test server/artistLabelAlbumTrackWrite.db.test.ts
//
// Every row seeded here is torn down in the `after` hook.
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
import { checkPartnerVerbForScope } from "./auth/partnerPermissions";

const exec = (q: any) => db.execute(q);
const id = (p: string) => `t2896-${p}-${randomUUID().slice(0, 8)}`;

const labelId = id("label");
const artistPersonId = id("artist"); // albums.primary_artist_id → people.id
const otherPersonId = id("other"); // an unrelated artist scope

const artistUser = id("owner"); // primary artist (sub_role NULL) of artistPersonId
const outsiderUser = id("outsider"); // artist on otherPersonId — no relationship
const labelUser = id("labeluser"); // label member on labelId

const preppingAlbumId = id("prep"); // label-attached, is_prepping=true
const releasedAlbumId = id("rel"); // label-attached, is_prepping=false, unsold

let baseUrl = "";
let httpServer: HttpServer | undefined;
const tokens: Record<string, string> = {};

async function seedUser(userId: string, role: string, scopeKind: string, scopeId: string) {
  const uniq = userId.slice(-8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${userId}, ${"t2896_" + uniq}, ${"x"}, ${"t2896"},
            ${"t2896_" + uniq + "@example.test"}, true, ${role}, ${scopeId})
  `);
  await exec(sql`
    INSERT INTO memberships (user_id, role, scope_kind, scope_id, sub_role)
    VALUES (${userId}, ${role}, ${scopeKind}, ${scopeId}, ${null})
  `);
  const token = "t2896tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  tokens[userId] = token;
}

async function post(path: string, userId: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokens[userId]}`,
    },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

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

  await exec(sql`INSERT INTO labels (id, name) VALUES (${labelId}, ${"t2896 label"})`);
  await exec(sql`INSERT INTO people (id, name) VALUES (${artistPersonId}, ${"t2896 artist"})`);
  await exec(sql`INSERT INTO people (id, name) VALUES (${otherPersonId}, ${"t2896 other"})`);

  await seedUser(artistUser, "artist", "artist", artistPersonId);
  await seedUser(outsiderUser, "artist", "artist", otherPersonId);
  await seedUser(labelUser, "label", "label", labelId);

  // Label scope: edit_metadata granted, approval OFF, so the label member
  // creates directly (the "unchanged today" baseline).
  await exec(sql`
    INSERT INTO partner_permissions (scope_kind, scope_id, edit_metadata, metadata_edits_require_approval)
    VALUES ('label', ${labelId}, true, false)
  `);

  // Both albums carry BOTH a labelId and a primaryArtistId — the shape
  // that used to 403 the artist.
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id, label_id, is_prepping)
    VALUES (${preppingAlbumId}, ${"t2896 prepping"}, ${"t2896 artist"}, ${""}, ${artistPersonId}, ${labelId}, true)
  `);
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id, label_id, is_prepping)
    VALUES (${releasedAlbumId}, ${"t2896 released"}, ${"t2896 artist"}, ${""}, ${artistPersonId}, ${labelId}, false)
  `);
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    await exec(sql`DELETE FROM songs WHERE album_id IN (${preppingAlbumId}, ${releasedAlbumId})`);
    await exec(sql`DELETE FROM pending_changes WHERE album_id IN (${preppingAlbumId}, ${releasedAlbumId})`);
    await exec(sql`DELETE FROM albums WHERE id IN (${preppingAlbumId}, ${releasedAlbumId})`);
    await exec(sql`DELETE FROM partner_permissions WHERE scope_kind = 'label' AND scope_id = ${labelId}`);
    for (const t of Object.values(tokens)) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const u of [artistUser, outsiderUser, labelUser]) {
      await exec(sql`DELETE FROM memberships WHERE user_id = ${u}`);
      await exec(sql`DELETE FROM users WHERE id = ${u}`);
    }
    await exec(sql`DELETE FROM people WHERE id IN (${artistPersonId}, ${otherPersonId})`);
    await exec(sql`DELETE FROM labels WHERE id = ${labelId}`);
  } finally {
    await pool.end();
  }
});

test("primary artist can add a track to a PREPPING label-attached album (201)", async () => {
  const res = await post("/api/admin/songs", artistUser, {
    albumId: preppingAlbumId,
    title: "t2896 track one",
    trackNumber: 1,
    duration: 200,
  });
  assert.equal(res.status, 201, `expected direct create, got ${res.status}: ${JSON.stringify(res.json)}`);
  assert.equal(res.json?.albumId, preppingAlbumId);
});

test("primary artist on a RELEASED label-attached album diverts to review, stamped with the ARTIST scope", async () => {
  const res = await post("/api/admin/songs", artistUser, {
    albumId: releasedAlbumId,
    title: "t2896 track two",
    trackNumber: 1,
    duration: 200,
  });
  assert.equal(res.status, 202, `expected divert, got ${res.status}: ${JSON.stringify(res.json)}`);
  assert.ok(res.json?.pendingChange, "divert returns the pending change row");
  // The pending change must carry the scope that actually authorized the
  // request — the matched artist scope, not the label-first resolution.
  assert.equal(res.json.pendingChange.scopeKind, "artist");
  assert.equal(res.json.pendingChange.scopeId, artistPersonId);
});

test("upload_masters resolves through the dual-scope path for the primary artist", async () => {
  // gateAlbumRoute passes the LABEL-first scope for a label-attached album;
  // the dual-scope fallback must still match the artist membership and
  // apply the owner phase policy (prepping → allow → null).
  const gate = await checkPartnerVerbForScope(artistUser, "upload_masters", { kind: "label", id: labelId }, {
    albumIdForLock: preppingAlbumId,
    albumIdForScope: preppingAlbumId,
  });
  assert.equal(gate, null, `expected allow, got ${JSON.stringify(gate)}`);
});

test("an unrelated artist still gets 403 Out of scope (fail-closed)", async () => {
  const res = await post("/api/admin/songs", outsiderUser, {
    albumId: preppingAlbumId,
    title: "t2896 intruder",
    trackNumber: 9,
    duration: 200,
  });
  assert.equal(res.status, 403);
  assert.equal(res.json?.message, "Out of scope");
});

test("label member behavior unchanged: creates directly with edit_metadata granted (201)", async () => {
  const res = await post("/api/admin/songs", labelUser, {
    albumId: preppingAlbumId,
    title: "t2896 label track",
    trackNumber: 2,
    duration: 200,
  });
  assert.equal(res.status, 201, `expected direct create, got ${res.status}: ${JSON.stringify(res.json)}`);
});
