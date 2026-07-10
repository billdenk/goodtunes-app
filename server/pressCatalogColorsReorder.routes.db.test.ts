// Task #2647 — regression coverage for the bulk color-reorder endpoint
// (POST /api/admin/manufacturers/:id/catalog/tiers/:tierId/colors/reorder).
// Pins in: (1) the submitted id list must be exactly the tier's full color
// set (partial / cross-tier ids are 400'd, not silently written), (2) the
// new order lands as position=index, and (3) unlike the single-color PATCH,
// an explicit reorder IS mirrored to the sibling 12" tier — same-named
// colors follow the new name order, and colors that only exist on the
// sibling keep their relative order after the matched ones.
//
// Same harness as pressAudioSpec.routes.db.test.ts: the full route tree
// mounted on a loopback socket; bearer token authenticates requireAdmin.
//
//   npx tsx --test server/pressCatalogColorsReorder.routes.db.test.ts
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
};

let baseUrl = "";
let httpServer: HttpServer | undefined;

let pressId = "";
let adminToken = "";
let lpTierId = ""; // 12" LP "Standard Colors"
let dblTierId = ""; // 12" Double LP "Standard Colors" (same name → sibling)
let otherTierId = ""; // 7" tier — used for cross-tier id rejection
// LP colors in seeded order: Red(0) Blue(1) Green(2)
let lpRed = "";
let lpBlue = "";
let lpGreen = "";
// Sibling colors: Blue(0) Red(1) Purple(2) — Purple has no LP counterpart.
let dblBlue = "";
let dblRed = "";
let dblPurple = "";
let sevenColor = "";

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

  pressId = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${pressId}, ${"t2647 Press"})`);
  created.manufacturers.add(pressId);

  const adminId = randomUUID();
  const tag = adminId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${adminId}, ${"t2647_" + tag}, ${"x"}, ${"t2647"}, ${"t2647_" + tag + "@example.test"},
            true, ${"super_admin"})
  `);
  created.users.add(adminId);
  adminToken = "t2647tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(adminToken, adminId, "admin");
  created.tokens.add(adminToken);

  const mkTier = async (format: string, name: string, position: number) => {
    const id = randomUUID();
    await exec(sql`
      INSERT INTO press_color_tiers (id, press_id, format, name, position, price_ladder)
      VALUES (${id}, ${pressId}, ${format}, ${name}, ${position}, '[]'::jsonb)
    `);
    return id;
  };
  const mkColor = async (tierId: string, name: string, position: number) => {
    const id = randomUUID();
    await exec(sql`
      INSERT INTO press_colors (id, tier_id, name, position)
      VALUES (${id}, ${tierId}, ${name}, ${position})
    `);
    return id;
  };

  lpTierId = await mkTier("12_lp", "Standard Colors", 0);
  dblTierId = await mkTier("12_double", "Standard Colors", 0);
  otherTierId = await mkTier("7_single", "Standard Colors", 0);

  lpRed = await mkColor(lpTierId, "Red", 0);
  lpBlue = await mkColor(lpTierId, "Blue", 1);
  lpGreen = await mkColor(lpTierId, "Green", 2);
  dblBlue = await mkColor(dblTierId, "Blue", 0);
  dblRed = await mkColor(dblTierId, "Red", 1);
  dblPurple = await mkColor(dblTierId, "Purple", 2);
  sevenColor = await mkColor(otherTierId, "Black", 0);
});

async function req(method: string, path: string, token: string | null, body?: unknown) {
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

const reorderPath = (tierId: string) =>
  `/api/admin/manufacturers/${pressId}/catalog/tiers/${tierId}/colors/reorder`;

async function positionsOf(tierId: string): Promise<Array<{ name: string; position: number }>> {
  const r: any = await exec(sql`
    SELECT name, position FROM press_colors WHERE tier_id = ${tierId} ORDER BY position ASC
  `);
  return r.rows.map((row: any) => ({ name: row.name, position: Number(row.position) }));
}

test("no bearer → 401", async () => {
  const res = await req("POST", reorderPath(lpTierId), null, { colorIds: [lpRed] });
  assert.equal(res.status, 401);
});

test("a partial id list is rejected (must be the tier's full color set)", async () => {
  const res = await req("POST", reorderPath(lpTierId), adminToken, { colorIds: [lpBlue, lpRed] });
  assert.equal(res.status, 400, "missing Green → 400");
});

test("an id from another tier is rejected", async () => {
  const res = await req("POST", reorderPath(lpTierId), adminToken, {
    colorIds: [lpBlue, lpRed, sevenColor],
  });
  assert.equal(res.status, 400, "cross-tier id → 400");
});

test("duplicate ids are rejected", async () => {
  const res = await req("POST", reorderPath(lpTierId), adminToken, {
    colorIds: [lpBlue, lpBlue, lpRed],
  });
  assert.equal(res.status, 400);
});

test("reorder rewrites positions AND mirrors name order to the sibling 12\" tier", async () => {
  // New LP order: Green, Blue, Red.
  const res = await req("POST", reorderPath(lpTierId), adminToken, {
    colorIds: [lpGreen, lpBlue, lpRed],
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.count, 3);

  const lp = await positionsOf(lpTierId);
  assert.deepEqual(
    lp.map((c) => c.name),
    ["Green", "Blue", "Red"],
    "LP tier positions follow the submitted order",
  );
  assert.deepEqual(lp.map((c) => c.position), [0, 1, 2], "positions are compacted 0..n");

  // Sibling: Blue and Red follow the new name order (Blue before Red since
  // Green doesn't exist over there); Purple (unmatched) trails.
  const dbl = await positionsOf(dblTierId);
  assert.deepEqual(
    dbl.map((c) => c.name),
    ["Blue", "Red", "Purple"],
    "sibling same-named colors re-sorted; unmatched color keeps its slot after them",
  );
  assert.deepEqual(dbl.map((c) => c.position), [0, 1, 2]);
});

test("mirroring is symmetric — reordering the 12\" Double LP tier reorders the LP tier too", async () => {
  // New Double LP order: Purple, Red, Blue.
  const res = await req("POST", reorderPath(dblTierId), adminToken, {
    colorIds: [dblPurple, dblRed, dblBlue],
  });
  assert.equal(res.status, 200);

  const dbl = await positionsOf(dblTierId);
  assert.deepEqual(dbl.map((c) => c.name), ["Purple", "Red", "Blue"]);
  assert.deepEqual(dbl.map((c) => c.position), [0, 1, 2]);

  // LP has no Purple; Red before Blue per the new name order, Green
  // (unmatched on the sibling side) trails after the matched pair.
  const lp = await positionsOf(lpTierId);
  assert.deepEqual(
    lp.map((c) => c.name),
    ["Red", "Blue", "Green"],
    "LP mirrors the Double LP name order; LP-only color trails",
  );
  assert.deepEqual(lp.map((c) => c.position), [0, 1, 2]);
});

test("a tier on another press 404s", async () => {
  const foreignPress = randomUUID();
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${foreignPress}, ${"t2647 Other"})`);
  created.manufacturers.add(foreignPress);
  const res = await req(
    "POST",
    `/api/admin/manufacturers/${foreignPress}/catalog/tiers/${lpTierId}/colors/reorder`,
    adminToken,
    { colorIds: [lpGreen, lpBlue, lpRed] },
  );
  assert.equal(res.status, 404, "tier isn't under that press → 404");
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const id of created.manufacturers) {
      await exec(sql`DELETE FROM press_colors WHERE tier_id IN (SELECT id FROM press_color_tiers WHERE press_id = ${id})`);
      await exec(sql`DELETE FROM press_color_tiers WHERE press_id = ${id}`);
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
