// Task #2256 — regression coverage for the press-scoped People + album
// surfaces shipped in Task #2253. Cross-press isolation on these endpoints is
// enforced purely server-side (sqlPersonInPressScope + the PII strip in the
// person-detail handler), so a refactor that loosened scoping — exposing
// another press's artist, mailing address, invite stamp, or flagging an album
// editable that this press never pressed — would ship silently. This locks the
// boundary in.
//
// A press scoped to ONE manufacturers row must get, on /api/press/:id/people*:
//   - GET .../people            → only IN-scope artists (homed here OR primary
//                                  artist on an album this press pressed);
//                                  another press's homed artist never appears.
//   - GET .../people/:personId  → 404 for an OUT-of-scope person; for an
//                                  in-scope person, shippingAddress is stripped
//                                  to null and another press's invite stamp
//                                  (invitedByPressId) comes back null.
//   - GET .../people/:id/albums → editableByThisPress is true only for albums
//                                  this press pressed, false for the artist's
//                                  other-press / un-pressed releases.
//   - POST .../people/:id/remove→ clears default_press_id ONLY when it points
//                                  at THIS press (and writes a
//                                  press_switch_history row); a person merely
//                                  in scope via an awarded album (homed
//                                  elsewhere) is left untouched (unhomed:false,
//                                  no history row).
//
// Same harness as pressDataIsolation.db.test.ts: the full route tree mounted
// over a real loopback socket (127.0.0.1 skips the host/kind boundary so the
// bearer token's kind is trusted), authenticated with a Bearer token (the
// admin SPA's real path). Every seeded row is torn down in `after`.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/pressScopedPeople.db.test.ts
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
  pressingRequests: new Set<string>(),
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

// IDs shared across the tests, seeded once in `before`.
let ownPressId = "";
let otherPressId = "";
let pressUserId = "";
let pressToken = "";

// People:
//   homedHere        — default_press_id = ownPress, invited_by_press_id =
//                      otherPress, shipping_address set (PII + invite-strip
//                      assertions). Primary artist on albumPressed + albumOther.
//   awardedNotHomed  — default_press_id = otherPress but primary artist on an
//                      album this press pressed → in scope via the award, but
//                      remove must NOT clear its home.
//   outOfScope       — default_press_id = otherPress, no awarded album → never
//                      visible to ownPress (404 / absent from the list).
let homedHereId = "";
let awardedNotHomedId = "";
let outOfScopeId = "";
let albumPressedId = "";
let albumOtherId = "";

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  // Test-only seam: park a verified admin session the way a finished 2FA login
  // would. Mounted AFTER registerRoutes so the real express-session middleware
  // (installed inside registerRoutes) is in scope — req.session is the same
  // store the remove endpoint's requirePressEditor reads `userId` from. The
  // GET endpoints resolve the caller via getUserIdFromRequest (session OR
  // bearer) so a Bearer token suffices for them; the remove endpoint reads
  // req.session.userId directly, so it's exercised over the session cookie.
  app.post("/__test/login", (req, res) => {
    req.session.userId = req.body?.userId;
    (req.session as any).kind = "admin";
    req.session.save(() => res.json({ ok: true }));
  });
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  ownPressId = await seedManufacturer("t2256 Own Press");
  otherPressId = await seedManufacturer("t2256 Other Press");
  pressUserId = await seedManufacturerUser(ownPressId);
  pressToken = await tokenFor(pressUserId);

  homedHereId = await seedPerson({
    name: "t2256 Homed Here",
    defaultPressId: ownPressId,
    invitedByPressId: otherPressId, // another press's stamp → must be stripped
    shippingAddress: "1 Test St, Nowhere",
  });
  awardedNotHomedId = await seedPerson({
    name: "t2256 Awarded Not Homed",
    defaultPressId: otherPressId,
  });
  outOfScopeId = await seedPerson({
    name: "t2256 Out Of Scope",
    defaultPressId: otherPressId,
  });

  // homedHere has two GoodTunes releases: one pressed by ownPress, one not.
  albumPressedId = await seedAlbum("t2256 Pressed Here", homedHereId);
  albumOtherId = await seedAlbum("t2256 Pressed Elsewhere", homedHereId);
  await seedPressingRequest(albumPressedId, ownPressId);
  await seedPressingRequest(albumOtherId, otherPressId);

  // awardedNotHomed is in scope ONLY via an album this press pressed.
  const awardedAlbumId = await seedAlbum("t2256 Awarded Album", awardedNotHomedId);
  await seedPressingRequest(awardedAlbumId, ownPressId);
});

async function seedManufacturer(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${id}, ${name})`);
  created.manufacturers.add(id);
  return id;
}

// An admin user whose ONLY hat is a manufacturer scoped to `pressId`.
// getUserRole / findMembershipForScope synthesize exactly one membership from
// these legacy columns when the account has no memberships rows, which is what
// both requirePressScope and pressUserCanEdit (requirePressEditor) read.
async function seedManufacturerUser(pressId: string): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t2256_" + tag}, ${"x"}, ${"t2256"}, ${"t2256_" + tag + "@example.test"},
            true, ${"manufacturer"}, ${pressId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t2256tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function seedPerson(opts: {
  name: string;
  defaultPressId?: string | null;
  invitedByPressId?: string | null;
  shippingAddress?: string | null;
}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO people (id, name, default_press_id, invited_by_press_id, shipping_address)
    VALUES (${id}, ${opts.name}, ${opts.defaultPressId ?? null},
            ${opts.invitedByPressId ?? null}, ${opts.shippingAddress ?? null})
  `);
  created.people.add(id);
  return id;
}

async function seedAlbum(title: string, primaryArtistId: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id, is_goodtunes_release)
    VALUES (${id}, ${title}, ${title}, ${"/album-placeholder.svg"}, ${primaryArtistId}, true)
  `);
  created.albums.add(id);
  return id;
}

// A non-cancelled pressing request whose package snapshot awards the album to
// `pressId` — exactly what sqlPersonInPressScope / editableByThisPress key off.
async function seedPressingRequest(albumId: string, pressId: string): Promise<string> {
  const id = randomUUID();
  const snapshot = JSON.stringify({ pressId });
  await exec(sql`
    INSERT INTO pressing_order_requests
      (id, album_id, status, package_snapshot, quantity, unit_cents, total_cents)
    VALUES (${id}, ${albumId}, ${"approved"}, ${snapshot}::jsonb, 100, 1000, 100000)
  `);
  created.pressingRequests.add(id);
  return id;
}

async function getJson(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${pressToken}` },
  });
  return { status: res.status, json: await safeJson(res) };
}
// A client that authenticates with BOTH a Bearer token AND a real
// express-session cookie — exactly how the press-portal SPA reaches a mutation
// in production. The press portal routes are mounted with commerce.ts's
// bearer-only requireAdmin (it sets req.adminUserId from the token, which
// requirePressScope reads), but requirePressEditor on the remove endpoint reads
// req.session.userId — populated by the 2FA login cookie the browser sends
// alongside the token. A token-only request leaves req.session.userId
// undefined and the edit gate throws, so the realistic combo sends both.
// (secure + sameSite cookie needs x-forwarded-proto:https with trust proxy on.)
async function makeSessionClient(userId: string, token: string) {
  let cookie = "";
  function captureCookie(res: Response) {
    const setCookies = (res.headers as any).getSetCookie?.() ?? [];
    for (const sc of setCookies as string[]) {
      const first = sc.split(";")[0];
      if (first.startsWith("connect.sid=")) cookie = first;
    }
  }
  async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
        authorization: `Bearer ${token}`,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });
    captureCookie(res);
    return { status: res.status, json: await safeJson(res) };
  }
  const login = await post("/__test/login", { userId });
  assert.equal(login.status, 200, "test login seam established a session");
  return { post };
}
async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ─── GET /api/press/:id/people — only in-scope artists ────────────────

test("people list returns in-scope artists only (homed here + awarded), never another press's", async () => {
  const res = await getJson(`/api/press/${ownPressId}/people`);
  assert.equal(res.status, 200, "press reads its own People roster");
  const ids = new Set((res.json as any[]).map((p) => p.id));
  assert.ok(ids.has(homedHereId), "the artist homed to this press is listed");
  assert.ok(ids.has(awardedNotHomedId), "an artist in scope via an awarded album is listed");
  assert.ok(!ids.has(outOfScopeId), "another press's homed artist is NEVER listed");
});

// ─── GET /api/press/:id/people/:personId — scope + PII strip ──────────

test("person detail 404s an out-of-scope person", async () => {
  const res = await getJson(`/api/press/${ownPressId}/people/${outOfScopeId}`);
  assert.equal(res.status, 404, "a press can't read another press's artist");
});

// Task #2364 — the bug this guards: a manufacturer-role session opening a
// person page was bounced off the portal. The bounce was the requirePressScope
// wall mis-firing. Prove the two halves stay correct for the person-detail
// endpoint: a press scoped to its OWN press reaches its OWN artist (200 — the
// page they should be able to see, no redirect), but is hard-walled (403) the
// instant it asks for ANOTHER press's portal endpoint — before scope-within-
// press even matters. (The 404 case above is the in-press scope check; this is
// the cross-press portal wall.)
test("a press reaches its OWN artist (200) but is 403'd on another press's endpoint", async () => {
  // A second admin whose only hat is manufacturer scoped to otherPress.
  const otherUserId = await seedManufacturerUser(otherPressId);
  const otherToken = await tokenFor(otherUserId);
  const otherPress = async (path: string) => {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { authorization: `Bearer ${otherToken}` },
    });
    return { status: res.status };
  };

  // The page they SHOULD see: otherPress reading an artist homed to otherPress.
  const own = await otherPress(`/api/press/${otherPressId}/people/${outOfScopeId}`);
  assert.equal(own.status, 200, "a press stays on its portal for its OWN artist (no bounce)");

  // The wall: otherPress asking for THIS press's portal person endpoint.
  const cross = await otherPress(`/api/press/${ownPressId}/people/${homedHereId}`);
  assert.equal(cross.status, 403, "a press can never reach another press's person endpoint");
});

test("person detail strips shippingAddress + another press's invite stamp", async () => {
  const res = await getJson(`/api/press/${ownPressId}/people/${homedHereId}`);
  assert.equal(res.status, 200, "in-scope artist is readable");
  assert.equal(res.json.id, homedHereId);
  assert.equal(res.json.shippingAddress, null, "mailing address is never exposed to a press");
  assert.equal(res.json.shippingAddressStruct, null, "structured address is stripped too");
  assert.equal(
    res.json.invitedByPressId,
    null,
    "another press's invite stamp is hidden (the person was invited by otherPress)",
  );
});

// ─── GET /api/press/:id/people/:personId/albums — editable flag ──────

test("person albums flag editableByThisPress per album award", async () => {
  const res = await getJson(`/api/press/${ownPressId}/people/${homedHereId}/albums`);
  assert.equal(res.status, 200, "in-scope artist's releases are readable");
  const byId = new Map((res.json as any[]).map((a) => [a.id, a]));
  assert.ok(byId.has(albumPressedId), "the album this press pressed is returned");
  assert.ok(byId.has(albumOtherId), "the album pressed elsewhere is returned too (greyed/locked)");
  assert.equal(
    byId.get(albumPressedId).editableByThisPress,
    true,
    "an album this press pressed is editable by it",
  );
  assert.equal(
    byId.get(albumOtherId).editableByThisPress,
    false,
    "an album pressed by another press is NOT editable",
  );
});

test("person albums 404s an out-of-scope person", async () => {
  const res = await getJson(`/api/press/${ownPressId}/people/${outOfScopeId}/albums`);
  assert.equal(res.status, 404, "a press can't read another press's artist's releases");
});

// ─── POST /api/press/:id/people/:personId/remove ─────────────────────

test("remove un-homes a person homed HERE and records a switch-history row", async () => {
  const client = await makeSessionClient(pressUserId, pressToken);
  const res = await client.post(`/api/press/${ownPressId}/people/${homedHereId}/remove`, {});
  assert.equal(res.status, 200);
  assert.equal(res.json.unhomed, true, "the artist homed here is un-homed");

  const after = await exec(
    sql`SELECT default_press_id, invited_by_press_id FROM people WHERE id = ${homedHereId}`,
  );
  const row = (after as any).rows?.[0];
  assert.equal(row.default_press_id, null, "default_press_id is cleared");
  // invited_by_press_id pointed at otherPress, so the remove leaves it intact
  // (the CASE only nulls it when it pointed at THIS press).
  assert.equal(row.invited_by_press_id, otherPressId, "another press's invite stamp is untouched");

  const hist = await exec(sql`
    SELECT 1 FROM press_switch_history
    WHERE customer_id = ${homedHereId} AND from_press_id = ${ownPressId}
      AND to_press_id IS NULL AND reason = 'removed_by_press'
  `);
  assert.equal((hist as any).rows?.length, 1, "a press_switch_history row was written");
});

test("remove does NOT clear the home of a person homed at another press", async () => {
  const client = await makeSessionClient(pressUserId, pressToken);
  const res = await client.post(`/api/press/${ownPressId}/people/${awardedNotHomedId}/remove`, {});
  assert.equal(res.status, 200, "the person is in scope via an awarded album, so the call resolves");
  assert.equal(res.json.unhomed, false, "nothing is un-homed — they're homed elsewhere");

  const after = await exec(
    sql`SELECT default_press_id FROM people WHERE id = ${awardedNotHomedId}`,
  );
  assert.equal(
    (after as any).rows?.[0]?.default_press_id,
    otherPressId,
    "the other press's home stamp is left intact",
  );

  const hist = await exec(sql`
    SELECT 1 FROM press_switch_history
    WHERE customer_id = ${awardedNotHomedId} AND from_press_id = ${ownPressId}
  `);
  assert.equal((hist as any).rows?.length ?? 0, 0, "no history row when nothing was un-homed");
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const id of created.people)
      await exec(sql`DELETE FROM press_switch_history WHERE customer_id = ${id}`);
    for (const id of created.pressingRequests)
      await exec(sql`DELETE FROM pressing_order_requests WHERE id = ${id}`);
    for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
    for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
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
