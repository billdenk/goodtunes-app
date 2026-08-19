// Task #3207 — safe dedupe reuse in press Add-artist (no silent re-homing).
//
// Background: the Aug 19 prod 500 (duplicate people_spotify_url_active_uniq on
// POST /api/press/:id/people) is recovered centrally — storage.createPerson
// catches the 23505 and returns the EXISTING active person. But the press
// Add-artist route used to unconditionally stamp default_press_id on whatever
// came back and reply 201, so a dedupe hit silently re-homed an artist that
// belonged to another press, bypassing the scope-checked claim/re-home prompt
// the catalog-match path uses. These tests lock in the fixed contract:
//
//   - brand-new spotifyUrl            → 201, reused:false, homed to this press
//   - reuse, person IN press scope    → 200, reused:true, needsClaim:false,
//                                       default_press_id untouched
//   - reuse, person OUT of scope      → 200, reused:true, needsClaim:true,
//                                       default_press_id untouched (the client
//                                       must go through POST .../claim)
//
// Same harness as pressScopedPeople.db.test.ts: full route tree on a real
// loopback socket, Bearer token + express-session cookie (the route's edit
// gate reads the session). Every seeded row torn down in `after`.
//
//   npx tsx --test server/pressAddArtistDedupe.db.test.ts
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
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let ownPressId = "";
let otherPressId = "";
let pressUserId = "";
let pressToken = "";

// Pre-seeded people carrying Spotify URLs the add attempts will collide with.
let inScopeSpotifyUrl = "";
let inScopePersonId = "";
let outOfScopeSpotifyUrl = "";
let outOfScopePersonId = "";
let unhomedSpotifyUrl = "";
let unhomedPersonId = "";

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(authKindMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  // Test-only seam: park a verified admin session the way a finished 2FA login
  // would — the Add-artist route's editor gate reads req.session.userId.
  app.post("/__test/login", (req, res) => {
    req.session.userId = req.body?.userId;
    (req.session as any).kind = "admin";
    req.session.save(() => res.json({ ok: true }));
  });
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const addr = httpServer!.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  ownPressId = await seedManufacturer("t3207 Own Press");
  otherPressId = await seedManufacturer("t3207 Other Press");
  pressUserId = await seedManufacturerUser(ownPressId);
  pressToken = await tokenFor(pressUserId);

  inScopeSpotifyUrl = spotifyUrlFor();
  inScopePersonId = await seedPerson({
    name: "t3207 In Scope",
    defaultPressId: ownPressId,
    spotifyUrl: inScopeSpotifyUrl,
  });
  outOfScopeSpotifyUrl = spotifyUrlFor();
  outOfScopePersonId = await seedPerson({
    name: "t3207 Out Of Scope",
    defaultPressId: otherPressId,
    spotifyUrl: outOfScopeSpotifyUrl,
    // PII the reuse response must never leak cross-press.
    contactEmail: "t3207-private@example.test",
    shippingAddress: "1 Private Lane, Nowhere",
    invitedByPressId: otherPressId,
  });
  unhomedSpotifyUrl = spotifyUrlFor();
  unhomedPersonId = await seedPerson({
    name: "t3207 Unhomed",
    defaultPressId: null,
    spotifyUrl: unhomedSpotifyUrl,
  });
});

function spotifyUrlFor(): string {
  return `https://open.spotify.com/artist/t3207${randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

async function seedManufacturer(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${id}, ${name})`);
  created.manufacturers.add(id);
  return id;
}

// An admin user whose ONLY hat is a manufacturer scoped to `pressId` — the
// legacy columns getUserRole synthesizes a membership from, which is what
// requirePressScopeRoute + requirePressEditorRoute read.
async function seedManufacturerUser(pressId: string): Promise<string> {
  const id = randomUUID();
  const tag = id.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${id}, ${"t3207_" + tag}, ${"x"}, ${"t3207"}, ${"t3207_" + tag + "@example.test"},
            true, ${"manufacturer"}, ${pressId})
  `);
  created.users.add(id);
  return id;
}

async function tokenFor(userId: string): Promise<string> {
  const token = "t3207tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(token, userId, "admin");
  created.tokens.add(token);
  return token;
}

async function seedPerson(opts: {
  name: string;
  defaultPressId: string | null;
  spotifyUrl: string;
  contactEmail?: string | null;
  shippingAddress?: string | null;
  invitedByPressId?: string | null;
}): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO people (id, name, default_press_id, spotify_url,
                        contact_email, shipping_address, invited_by_press_id)
    VALUES (${id}, ${opts.name}, ${opts.defaultPressId}, ${opts.spotifyUrl},
            ${opts.contactEmail ?? null}, ${opts.shippingAddress ?? null},
            ${opts.invitedByPressId ?? null})
  `);
  created.people.add(id);
  return id;
}

async function defaultPressOf(personId: string): Promise<string | null> {
  const row = ((await exec(
    sql`SELECT default_press_id FROM people WHERE id = ${personId}`,
  )) as any).rows?.[0];
  return row?.default_press_id ?? null;
}

// Bearer + session-cookie client (see pressScopedPeople.db.test.ts for why
// both are needed on press mutations).
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

// ─── POST /api/press/:id/people — dedupe-aware add ────────────────────

test("brand-new artist still creates and homes to the press (201, reused:false)", async () => {
  const client = await makeSessionClient(pressUserId, pressToken);
  const freshUrl = spotifyUrlFor();
  const res = await client.post(`/api/press/${ownPressId}/people`, {
    name: "t3207 Fresh Artist",
    spotifyUrl: freshUrl,
  });
  assert.equal(res.status, 201, "genuinely new artist creates");
  created.people.add(res.json.id);
  assert.equal(res.json.reused, false);
  assert.equal(res.json.defaultPressId, ownPressId);
  assert.equal(await defaultPressOf(res.json.id), ownPressId, "new person homed to this press");
});

test("duplicate spotifyUrl, person already in this press's scope → 200 reuse, no duplicate, no restamp", async () => {
  const client = await makeSessionClient(pressUserId, pressToken);
  const res = await client.post(`/api/press/${ownPressId}/people`, {
    name: "t3207 In Scope AGAIN",
    spotifyUrl: inScopeSpotifyUrl,
  });
  assert.equal(res.status, 200, "reuse is a 200, not a 201 create");
  assert.equal(res.json.id, inScopePersonId, "existing person returned, no duplicate row");
  assert.equal(res.json.reused, true);
  assert.equal(res.json.needsClaim, false, "already in scope — no claim prompt needed");
  // No duplicate person minted for that spotify URL.
  const count = ((await exec(
    sql`SELECT count(*)::int AS n FROM people WHERE spotify_url = ${inScopeSpotifyUrl} AND deleted_at IS NULL`,
  )) as any).rows?.[0]?.n;
  assert.equal(count, 1, "still exactly one active person for the URL");
  assert.equal(await defaultPressOf(inScopePersonId), ownPressId, "home stamp untouched");
});

test("duplicate spotifyUrl, person homed to ANOTHER press → 200 needsClaim, home NOT stolen", async () => {
  const client = await makeSessionClient(pressUserId, pressToken);
  const res = await client.post(`/api/press/${ownPressId}/people`, {
    name: "t3207 Steal Attempt",
    spotifyUrl: outOfScopeSpotifyUrl,
  });
  assert.equal(res.status, 200, "no 500, no 201 — dedupe reuse");
  assert.equal(res.json.id, outOfScopePersonId);
  assert.equal(res.json.reused, true);
  assert.equal(res.json.needsClaim, true, "out of scope → explicit claim flow required");
  assert.equal(
    await defaultPressOf(outOfScopePersonId),
    otherPressId,
    "the other press's home stamp is intact — no silent re-homing",
  );
  // PII boundary: the reuse payload is a whitelisted claim-candidate shape,
  // never the raw DB row — another press's contact/shipping/invite/home data
  // (which the scoped person GET would 404) must not leak through this POST.
  const allowed = new Set(["id", "name", "photoUrl", "itunesArtistId", "reused", "needsClaim"]);
  for (const key of Object.keys(res.json)) {
    assert.ok(allowed.has(key), `unexpected field in reuse payload: ${key}`);
  }
  const body = JSON.stringify(res.json);
  assert.ok(!body.includes("t3207-private@example.test"), "contact email not leaked");
  assert.ok(!body.includes("1 Private Lane"), "shipping address not leaked");
  assert.ok(!body.includes(otherPressId), "home/invite press stamps not leaked");
});

test("duplicate spotifyUrl, unhomed person → 200 needsClaim, still unhomed (claim route does the homing)", async () => {
  const client = await makeSessionClient(pressUserId, pressToken);
  const res = await client.post(`/api/press/${ownPressId}/people`, {
    name: "t3207 Unhomed Again",
    spotifyUrl: unhomedSpotifyUrl,
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.id, unhomedPersonId);
  assert.equal(res.json.reused, true);
  assert.equal(res.json.needsClaim, true, "unhomed + no awarded album = out of scope");
  assert.equal(await defaultPressOf(unhomedPersonId), null, "no automatic stamp — claim is explicit");
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const id of created.people)
      await exec(sql`DELETE FROM press_switch_history WHERE customer_id = ${id}`);
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
