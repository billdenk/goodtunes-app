// Task #2999 — regression coverage for catalog restore (unarchive).
// Pins in the restore boundary:
//   (1) GET catalog/archived lists archived tiers and individually-archived
//       colors whose parent tier is still active (cascade-archived colors
//       are NOT listed — they ride back on tier restore).
//   (2) POST tiers/:id/unarchive restores the tier + same-stamp sibling 12"
//       tier + the colors archived in the SAME cascade, while a color
//       archived individually BEFORE the tier stays archived.
//   (3) POST colors/:id/unarchive restores the color plus its same-stamp
//       colorGroupId group-mates.
//   (4) Collision guards: an ACTIVE same-named replacement — in the picked
//       tier's format, in the sibling 12" format, or in ANY destination tier
//       of a group restore — 409s the WHOLE restore without changing rows.
//   (5) Restoring a color whose parent tier is archived 409s (restore the
//       type instead); unarchiving an already-active row is idempotent.
//
// Same harness as pressCatalogArchive.routes.db.test.ts: full route tree on
// a loopback socket; bearer token authenticates requireAdmin.
//
//   npx tsx --test server/pressCatalogUnarchive.routes.db.test.ts
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
let lpTierId = ""; // 12" LP "House Mix"
let dblTierId = ""; // 12" Double LP "House Mix" (same name → sibling)
let lpRed = "";
let lpBlue = "";
let dblRed = "";

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
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${pressId}, ${"t2999 Press"})`);
  created.manufacturers.add(pressId);
  await exec(sql`INSERT INTO press_formats (press_id, format) VALUES (${pressId}, '12_lp'), (${pressId}, '12_double') ON CONFLICT DO NOTHING`);

  const adminId = randomUUID();
  const tag = adminId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${adminId}, ${"t2999_" + tag}, ${"x"}, ${"t2999"}, ${"t2999_" + tag + "@example.test"},
            true, ${"super_admin"})
  `);
  created.users.add(adminId);
  adminToken = "t2999tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(adminToken, adminId, "admin");
  created.tokens.add(adminToken);

  lpTierId = await mkTier("12_lp", "House Mix", 0);
  dblTierId = await mkTier("12_double", "House Mix", 0);
  lpRed = await mkColor(lpTierId, "Red", 0);
  lpBlue = await mkColor(lpTierId, "Blue", 1);
  dblRed = await mkColor(dblTierId, "Red", 0);
});

async function mkTier(format: string, name: string, position: number) {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO press_color_tiers (id, press_id, format, name, position, price_ladder)
    VALUES (${id}, ${pressId}, ${format}, ${name}, ${position}, '[]'::jsonb)
  `);
  return id;
}
async function mkColor(tierId: string, name: string, position: number, groupId?: string) {
  const id = randomUUID();
  await exec(sql`
    INSERT INTO press_colors (id, tier_id, name, position, color_group_id)
    VALUES (${id}, ${tierId}, ${name}, ${position}, ${groupId ?? null})
  `);
  return id;
}

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminToken}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json };
}

const archivedList = async () => {
  const { status, json } = await req("GET", `/api/admin/manufacturers/${pressId}/catalog/archived`);
  assert.equal(status, 200);
  return json as { tiers: any[]; colors: any[] };
};

const rowArchived = async (table: "press_color_tiers" | "press_colors", id: string) => {
  const r = await exec(sql.raw(`SELECT archived_at FROM ${table} WHERE id = '${id}'`));
  return Boolean((r.rows as any[])[0]?.archived_at);
};

test("archived list: cascade-archived colors ride the tier; individually-archived colors listed on active tiers", async () => {
  // Archive one color individually FIRST (its own stamp), then the tier.
  await req("POST", `/api/admin/manufacturers/${pressId}/catalog/colors/${lpBlue}/archive`);
  const { status } = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/tiers/${lpTierId}/archive`);
  assert.equal(status, 200);

  const list = await archivedList();
  const tierIds = list.tiers.map((t) => t.id);
  assert.ok(tierIds.includes(lpTierId), "archived LP tier listed");
  assert.ok(tierIds.includes(dblTierId), "cascade-archived sibling Double tier listed");
  // No colors listed separately — their parent tiers are archived.
  assert.equal(list.colors.length, 0, "colors under archived tiers are not listed separately");
});

test("tier unarchive restores tier + sibling + same-stamp colors; the earlier individual archive is preserved", async () => {
  const { status } = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/tiers/${lpTierId}/unarchive`);
  assert.equal(status, 200);
  assert.equal(await rowArchived("press_color_tiers", lpTierId), false, "LP tier active again");
  assert.equal(await rowArchived("press_color_tiers", dblTierId), false, "sibling Double tier active again");
  assert.equal(await rowArchived("press_colors", lpRed), false, "cascade-archived color restored");
  assert.equal(await rowArchived("press_colors", dblRed), false, "sibling cascade color restored");
  assert.equal(await rowArchived("press_colors", lpBlue), true, "individually-archived color stays archived");

  // ...and it now shows in the archived list as a color on an ACTIVE tier.
  const list = await archivedList();
  assert.ok(list.colors.some((c) => c.id === lpBlue), "pre-archived color listed once its tier is active");

  // Idempotent on an already-active tier.
  const again = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/tiers/${lpTierId}/unarchive`);
  assert.equal(again.status, 200);
});

test("color unarchive restores the color; 409 when the parent tier is archived", async () => {
  const { status } = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/colors/${lpBlue}/unarchive`);
  assert.equal(status, 200);
  assert.equal(await rowArchived("press_colors", lpBlue), false);

  // Archive the tier again → its colors carry the cascade stamp; restoring a
  // color under an archived tier must divert to "restore the type".
  await req("POST", `/api/admin/manufacturers/${pressId}/catalog/tiers/${lpTierId}/archive`);
  const blocked = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/colors/${lpRed}/unarchive`);
  assert.equal(blocked.status, 409);
  assert.match(String(blocked.json?.message ?? ""), /restore the type/i);
});

test("tier unarchive 409s when an active same-named replacement exists — in its own format AND in the sibling format", async () => {
  // Replacement in the tier's own format.
  const replacementLp = await mkTier("12_lp", "House Mix", 5);
  const own = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/tiers/${lpTierId}/unarchive`);
  assert.equal(own.status, 409, "own-format replacement blocks restore");
  assert.equal(await rowArchived("press_color_tiers", lpTierId), true, "nothing changed on 409");
  await exec(sql`DELETE FROM press_color_tiers WHERE id = ${replacementLp}`);

  // Replacement only in the SIBLING format: restoring the LP would also
  // reactivate the same-stamp Double sibling next to it → whole op 409s.
  const replacementDbl = await mkTier("12_double", "House Mix", 5);
  const viaSibling = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/tiers/${lpTierId}/unarchive`);
  assert.equal(viaSibling.status, 409, "sibling-format replacement blocks the whole restore");
  assert.equal(await rowArchived("press_color_tiers", lpTierId), true, "picked tier untouched");
  assert.equal(await rowArchived("press_color_tiers", dblTierId), true, "sibling tier untouched");
  await exec(sql`DELETE FROM press_color_tiers WHERE id = ${replacementDbl}`);

  // With replacements gone the restore goes through.
  const ok = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/tiers/${lpTierId}/unarchive`);
  assert.equal(ok.status, 200);
});

test("grouped color unarchive restores same-stamp group-mates; 409s when ANY destination tier has an active replacement", async () => {
  const gid = randomUUID();
  const lpGold = await mkColor(lpTierId, "Gold", 7, gid);
  const dblGold = await mkColor(dblTierId, "Gold", 7, gid);
  // Archive via the group cascade (one stamp across both rows).
  await req("POST", `/api/admin/manufacturers/${pressId}/catalog/colors/${lpGold}/archive`);
  assert.equal(await rowArchived("press_colors", dblGold), true, "group cascade archived the mate");

  // An active replacement "Gold" appears in the DESTINATION (Double) tier.
  const replacement = await mkColor(dblTierId, "Gold", 8);
  const blocked = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/colors/${lpGold}/unarchive`);
  assert.equal(blocked.status, 409, "destination-tier replacement blocks the whole group restore");
  assert.equal(await rowArchived("press_colors", lpGold), true, "picked color untouched");
  assert.equal(await rowArchived("press_colors", dblGold), true, "group-mate untouched");
  await exec(sql`DELETE FROM press_colors WHERE id = ${replacement}`);

  // Restore goes through and brings the whole group back.
  const ok = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/colors/${lpGold}/unarchive`);
  assert.equal(ok.status, 200);
  assert.equal(await rowArchived("press_colors", lpGold), false);
  assert.equal(await rowArchived("press_colors", dblGold), false);

  // Idempotent on an already-active color.
  const again = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/colors/${lpGold}/unarchive`);
  assert.equal(again.status, 200);
});

after(async () => {
  try {
    await exec(sql`DELETE FROM press_colors WHERE tier_id IN (SELECT id FROM press_color_tiers WHERE press_id = ${pressId})`);
    await exec(sql`DELETE FROM press_color_tiers WHERE press_id = ${pressId}`);
    await exec(sql`DELETE FROM press_formats WHERE press_id = ${pressId}`);
    for (const t of created.tokens) await exec(sql`DELETE FROM auth_tokens WHERE token = ${t}`);
    for (const u of created.users) await exec(sql`DELETE FROM users WHERE id = ${u}`);
    for (const m of created.manufacturers) await exec(sql`DELETE FROM manufacturers WHERE id = ${m}`);
  } finally {
    httpServer?.close();
    await pool.end();
  }
});
