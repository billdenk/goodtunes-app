// Task #3219 — an artist whose profile was never formally invited by a press
// (no invited_by_press_id on the person or label) must still see the resolved
// EFFECTIVE press's real catalog in the Package designer, instead of the
// "hasn't published a vinyl catalog yet" empty state. The
// /api/admin/albums/:id/invited-press endpoint keeps `press: null` (invited
// vs effective provenance stays distinguishable via `effectivePressSource`),
// but now serves the effective press's filtered catalog:
//
//   (1) No invitation + artist default_press_id → that press's non-hidden
//       formats (with live tiers) land in `catalog`, source "artist_default".
//   (2) No invitation + no default press + no SKUs → MRP platform fallback:
//       effectivePress = MRP, source "platform_default", MRP catalog served
//       (decision documented at the route — MRP is the platform default press).
//   (3) A default press whose only formats are hidden (or whose tiers are all
//       archived) yields no usable formats → the client keeps the honest
//       empty state.
//   (4) A genuinely invited press behaves exactly as before: `press` non-null,
//       source "invited", catalog served.
//
// Same loopback harness as labelManagerNpoIsolation.db.test.ts. Real DB
// (DATABASE_URL), Node's built-in runner:
//
//   npx tsx --test server/effectivePressCatalog.db.test.ts
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
import { MRP_DOMAIN } from "./pressCatalog";

const exec = (q: any) => db.execute(q);

let baseUrl = "";
let httpServer: HttpServer | undefined;
let adminToken = "";
let adminUserId = "";

const FORMAT = "12_lp" as const;
const LADDER = [{ qty: 100, unitCents: 1200, confirmed: true }];

// Press A: live catalog (one visible format with a live tier + one hidden format).
let pressAId = "";
let pressATierId = "";
// Press B: only a hidden format + an archived tier on a visible format.
let pressBId = "";

// Albums under test.
let albumDefaultPressId = ""; // artist default_press → press A
let albumInvitedId = ""; // artist invited_by_press → press A
let albumNoPressId = ""; // nothing resolves → MRP platform fallback
let albumHiddenOnlyId = ""; // artist default_press → press B (no usable catalog)

const created = {
  users: new Set<string>(),
  tokens: new Set<string>(),
  people: new Set<string>(),
  albums: new Set<string>(),
  presses: new Set<string>(),
};

async function seedPress(name: string): Promise<string> {
  const id = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${id}, ${name})`);
  created.presses.add(id);
  return id;
}

async function seedFormat(pressId: string, format: string, hidden: boolean) {
  await exec(sql`
    INSERT INTO press_formats (press_id, format, hidden_at)
    VALUES (${pressId}, ${format}, ${hidden ? sql`now()` : sql`NULL`})
    ON CONFLICT DO NOTHING
  `);
}

async function seedTier(pressId: string, format: string, name: string, archived: boolean): Promise<string> {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO press_color_tiers (id, press_id, format, name, position, price_ladder, archived_at)
    VALUES (${id}, ${pressId}, ${format}, ${name}, 0, ${JSON.stringify(LADDER)}::jsonb,
            ${archived ? sql`now()` : sql`NULL`})
  `);
  return id;
}

async function seedArtistAlbum(opts: { defaultPressId?: string | null; invitedByPressId?: string | null }): Promise<string> {
  const personId = randomUUID();
  await exec(sql`
    INSERT INTO people (id, name, default_press_id, invited_by_press_id)
    VALUES (${personId}, ${"t3219 artist " + personId.slice(0, 8)},
            ${opts.defaultPressId ?? null}, ${opts.invitedByPressId ?? null})
  `);
  created.people.add(personId);
  const albumId = randomUUID();
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id)
    VALUES (${albumId}, ${"t3219 album " + albumId.slice(0, 8)}, ${"t3219 artist"}, ${""}, ${personId})
  `);
  created.albums.add(albumId);
  return albumId;
}

async function getInvitedPress(albumId: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/api/admin/albums/${albumId}/invited-press`, {
    headers: { authorization: `Bearer ${adminToken}` },
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

  // Operator account (requireAdmin) via Bearer token.
  adminUserId = randomUUID();
  const tag = adminUserId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${adminUserId}, ${"t3219_" + tag}, ${"x"}, ${"t3219 op"}, ${"t3219_" + tag + "@example.test"},
            true, ${"super_admin"})
  `);
  created.users.add(adminUserId);
  adminToken = "t3219tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(adminToken, adminUserId, "admin");
  created.tokens.add(adminToken);

  // Press A — live catalog: visible 12_lp with a live tier, plus a hidden 7_inch.
  pressAId = await seedPress("t3219 Press A");
  await seedFormat(pressAId, FORMAT, false);
  await seedFormat(pressAId, "7_inch", true);
  pressATierId = await seedTier(pressAId, FORMAT, "t3219 Opaque", false);
  await seedTier(pressAId, "7_inch", "t3219 Hidden Opaque", false);

  // Press B — nothing artist-usable: hidden 12_lp with a live tier, and a
  // visible 7_inch whose only tier is archived.
  pressBId = await seedPress("t3219 Press B");
  await seedFormat(pressBId, FORMAT, true);
  await seedTier(pressBId, FORMAT, "t3219 B Hidden", false);
  await seedFormat(pressBId, "7_inch", false);
  await seedTier(pressBId, "7_inch", "t3219 B Archived", true);

  albumDefaultPressId = await seedArtistAlbum({ defaultPressId: pressAId });
  albumInvitedId = await seedArtistAlbum({ invitedByPressId: pressAId });
  albumNoPressId = await seedArtistAlbum({});
  albumHiddenOnlyId = await seedArtistAlbum({ defaultPressId: pressBId });
});

after(async () => {
  for (const id of created.albums) await exec(sql`DELETE FROM albums WHERE id = ${id}`);
  for (const id of created.people) await exec(sql`DELETE FROM people WHERE id = ${id}`);
  for (const id of created.presses) {
    await exec(sql`DELETE FROM press_colors WHERE tier_id IN (SELECT id FROM press_color_tiers WHERE press_id = ${id})`);
    await exec(sql`DELETE FROM press_tier_jacket_ladders WHERE tier_id IN (SELECT id FROM press_color_tiers WHERE press_id = ${id})`);
    await exec(sql`DELETE FROM press_color_tiers WHERE press_id = ${id}`);
    await exec(sql`DELETE FROM press_jackets WHERE press_id = ${id}`);
    await exec(sql`DELETE FROM press_formats WHERE press_id = ${id}`);
    await exec(sql`DELETE FROM manufacturers WHERE id = ${id}`);
  }
  for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
  for (const id of created.users) await exec(sql`DELETE FROM users WHERE id = ${id}`);
  await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
  await pool.end();
});

test("no invitation + artist default press → that press's live catalog is served", async () => {
  const { status, json } = await getInvitedPress(albumDefaultPressId);
  assert.equal(status, 200);
  assert.equal(json.press, null, "no invited press — press stays null");
  assert.equal(json.effectivePressSource, "artist_default");
  assert.equal(json.effectivePress?.id, pressAId);
  const formats = json.catalog?.formats ?? [];
  const lp = formats.find((f: any) => f.format === FORMAT);
  assert.ok(lp, "visible 12_lp format is served");
  assert.ok(
    lp.tiers.some((t: any) => t.id === pressATierId),
    "live tier rides along",
  );
  assert.ok(
    !formats.some((f: any) => f.format === "7_inch"),
    "hidden format is filtered from the artist-facing catalog",
  );
});

test("no invitation + no default press → MRP platform fallback serves MRP's catalog", async () => {
  const mrp = await storage.getManufacturerByDomain(MRP_DOMAIN);
  const { status, json } = await getInvitedPress(albumNoPressId);
  assert.equal(status, 200);
  assert.equal(json.press, null);
  if (mrp) {
    assert.equal(json.effectivePressSource, "platform_default");
    assert.equal(json.effectivePress?.id, mrp.id);
    assert.ok(
      (json.catalog?.formats ?? []).length > 0,
      "MRP's seeded catalog is served as the platform default",
    );
  } else {
    // Environment without the MRP seed row: honest empty state.
    assert.equal(json.effectivePress, null);
    assert.deepEqual(json.catalog?.formats ?? [], []);
  }
});

test("default press with only hidden formats / archived tiers → no usable catalog", async () => {
  const { status, json } = await getInvitedPress(albumHiddenOnlyId);
  assert.equal(status, 200);
  assert.equal(json.press, null);
  assert.equal(json.effectivePressSource, "artist_default");
  assert.equal(json.effectivePress?.id, pressBId);
  const formats = json.catalog?.formats ?? [];
  assert.ok(!formats.some((f: any) => f.format === FORMAT), "hidden format filtered");
  const seven = formats.find((f: any) => f.format === "7_inch");
  if (seven) {
    assert.equal(seven.tiers.length, 0, "archived tier excluded — no usable tiers");
  }
  // Either way: nothing the client's usable-format filter (tiers.length > 0)
  // would render — the empty state stays.
  assert.ok(
    !formats.some((f: any) => (f.tiers ?? []).length > 0),
    "no artist-usable formats survive",
  );
});

test("invited press behavior unchanged: press non-null, source invited, catalog served", async () => {
  const { status, json } = await getInvitedPress(albumInvitedId);
  assert.equal(status, 200);
  assert.equal(json.press?.id, pressAId);
  assert.equal(json.effectivePressSource, "invited");
  const formats = json.catalog?.formats ?? [];
  const lp = formats.find((f: any) => f.format === FORMAT);
  assert.ok(lp && lp.tiers.some((t: any) => t.id === pressATierId));
  assert.ok(!formats.some((f: any) => f.format === "7_inch"), "hidden format still filtered");
});
