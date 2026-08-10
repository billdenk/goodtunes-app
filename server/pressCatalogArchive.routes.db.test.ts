// Task #2998 — regression coverage for catalog soft-retire (archive).
// Pins in the retirement boundary:
//   (1) POST tiers/:id/archive cascades archived_at onto the tier, its
//       colors, AND the same-named sibling 12" tier + its colors.
//   (2) Archived rows disappear from the catalog GET (editor + new picks).
//   (3) Historical SKU snapshots keep resolving: resolveCatalogIdentity
//       still returns the archived tier/color by id.
//   (4) Archived rows never participate in active-catalog management:
//       adding a color to an archived tier 404s, PATCHing an archived
//       color 404s, mirror-to-format won't use an archived source (404)
//       and won't treat an archived same-named tier/color as an existing
//       match — a replacement tier with the SAME NAME can be created and
//       shows up in the active catalog.
//
// Same harness as pressCatalogColorsReorder.routes.db.test.ts: full route
// tree on a loopback socket; bearer token authenticates requireAdmin.
//
//   npx tsx --test server/pressCatalogArchive.routes.db.test.ts
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
import { resolveCatalogIdentity } from "./pressCatalog";

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
let keepTierId = ""; // stays active throughout

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
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${pressId}, ${"t2998 Press"})`);
  created.manufacturers.add(pressId);
  await exec(sql`INSERT INTO press_formats (press_id, format) VALUES (${pressId}, '12_lp'), (${pressId}, '12_double') ON CONFLICT DO NOTHING`);

  const adminId = randomUUID();
  const tag = adminId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${adminId}, ${"t2998_" + tag}, ${"x"}, ${"t2998"}, ${"t2998_" + tag + "@example.test"},
            true, ${"super_admin"})
  `);
  created.users.add(adminId);
  adminToken = "t2998tok_" + randomUUID().replace(/-/g, "");
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

  lpTierId = await mkTier("12_lp", "House Mix", 0);
  dblTierId = await mkTier("12_double", "House Mix", 0);
  keepTierId = await mkTier("12_lp", "Keep Me", 1);
  lpRed = await mkColor(lpTierId, "Red", 0);
  lpBlue = await mkColor(lpTierId, "Blue", 1);
  dblRed = await mkColor(dblTierId, "Red", 0);
  await mkColor(keepTierId, "Black", 0);
});

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

const catalogTiers = async () => {
  const { status, json } = await req("GET", `/api/admin/manufacturers/${pressId}/catalog`);
  assert.equal(status, 200);
  const tiers: any[] = [];
  for (const f of json.formats ?? []) for (const t of f.tiers ?? []) tiers.push({ ...t, format: f.format });
  return tiers;
};

test("archive tier cascades to colors and sibling 12\" tier; catalog hides them", async () => {
  const { status } = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/tiers/${lpTierId}/archive`);
  assert.equal(status, 200);
  const rows = await exec(sql`
    SELECT id, archived_at FROM press_color_tiers WHERE id IN (${lpTierId}, ${dblTierId}, ${keepTierId})
  `);
  const byId = new Map((rows.rows as any[]).map((r) => [r.id, r.archived_at]));
  assert.ok(byId.get(lpTierId), "LP tier archived");
  assert.ok(byId.get(dblTierId), "sibling 12\" Double tier archived too");
  assert.equal(byId.get(keepTierId), null, "unrelated tier untouched");
  const colorRows = await exec(sql`SELECT id, archived_at FROM press_colors WHERE id IN (${lpRed}, ${lpBlue}, ${dblRed})`);
  for (const r of colorRows.rows as any[]) assert.ok(r.archived_at, `color ${r.id} archived via cascade`);

  const tiers = await catalogTiers();
  assert.ok(!tiers.some((t) => t.id === lpTierId || t.id === dblTierId), "archived tiers absent from catalog");
  assert.ok(tiers.some((t) => t.id === keepTierId), "active tier still listed");
});

test("historical snapshot lookup still resolves archived tier + color by id", async () => {
  const identity = await resolveCatalogIdentity({ tierId: lpTierId, colorId: lpRed, format: "12_lp" as any });
  assert.ok(identity, "archived tier still resolvable");
  assert.equal(identity!.tierName, "House Mix");
  assert.equal(identity!.colorName, "Red");
});

test("archived rows are excluded from active management", async () => {
  // Add color to archived tier → 404
  const add = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/tiers/${lpTierId}/colors`, { name: "Green" });
  assert.equal(add.status, 404, "archived tier can't take new colors");
  // PATCH archived color → 404
  const patch = await req("PATCH", `/api/admin/manufacturers/${pressId}/catalog/colors/${lpRed}`, { name: "Crimson" });
  assert.equal(patch.status, 404, "archived color is read-only history");
  // mirror-to-format with archived source color → 404
  const mirror = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/colors/${lpRed}/mirror-to-format`, { targetFormat: "12_double" });
  assert.equal(mirror.status, 404, "archived source color can't seed copies");
});

test("a same-named replacement tier can be created and appears active", async () => {
  const createRes = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/formats/12_lp/tiers`, { name: "House Mix" });
  assert.equal(createRes.status, 200, "archived name doesn't block a replacement");
  const newTierId = createRes.json.id as string;
  assert.notEqual(newTierId, lpTierId);
  const tiers = await catalogTiers();
  assert.ok(tiers.some((t) => t.id === newTierId && t.format === "12_lp"), "replacement listed in active catalog");
  // The create mirrored a fresh "House Mix" onto 12_double (archived sibling doesn't count as existing)
  const mirrored = tiers.find((t) => t.format === "12_double" && t.name === "House Mix" && t.id !== dblTierId);
  assert.ok(mirrored, "sibling mirror created a fresh active tier, not the archived one");
  // New colors land on the replacement fine
  const add = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/tiers/${newTierId}/colors`, { name: "Red" });
  assert.equal(add.status, 200, "same-named color allowed on the replacement");
});

test("archive color propagates to same-named sibling color and hides from catalog", async () => {
  // Fresh active pair from the replacement test.
  const tiers = await catalogTiers();
  const lp = tiers.find((t) => t.format === "12_lp" && t.name === "House Mix")!;
  const red = (lp.colors ?? []).find((c: any) => c.name === "Red");
  assert.ok(red, "replacement Red present before archive");
  const { status } = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/colors/${red.id}/archive`);
  assert.equal(status, 200);
  const tiersAfter = await catalogTiers();
  for (const t of tiersAfter) {
    if (t.name !== "House Mix") continue;
    assert.ok(!(t.colors ?? []).some((c: any) => c.name === "Red"), `Red hidden on ${t.format}`);
  }
});

test("hard DELETE cannot destroy archived history; identity still resolves", async () => {
  // DELETE the archived tier → 409, row survives.
  const delTier = await req("DELETE", `/api/admin/manufacturers/${pressId}/catalog/tiers/${lpTierId}`);
  assert.equal(delTier.status, 409, "archived tier can't be hard-deleted");
  // DELETE an archived color → 409, row survives.
  const delColor = await req("DELETE", `/api/admin/manufacturers/${pressId}/catalog/colors/${lpRed}`);
  assert.equal(delColor.status, 409, "archived color can't be hard-deleted");
  // DELETE an ACTIVE tier that carries archived colors → 409 (no cascade
  // through retained history). The replacement "House Mix" LP tier now has
  // an archived "Red" (archived in the previous test) plus nothing active.
  const tiers = await catalogTiers();
  const replacement = tiers.find((t) => t.format === "12_lp" && t.name === "House Mix")!;
  const delActive = await req("DELETE", `/api/admin/manufacturers/${pressId}/catalog/tiers/${replacement.id}`);
  assert.equal(delActive.status, 409, "active tier with archived colors can't cascade-delete them");
  // History still resolves after all delete attempts.
  const identity = await resolveCatalogIdentity({ tierId: lpTierId, colorId: lpRed, format: "12_lp" as any });
  assert.ok(identity, "archived tier still resolvable after DELETE attempts");
  assert.equal(identity!.tierName, "House Mix");
  assert.equal(identity!.colorName, "Red");
});

test("disabling a format retires archived history instead of deleting it", async () => {
  // 12_lp currently has: archived original "House Mix" tier, active
  // replacement "House Mix" tier (with archived Red), active "Keep Me".
  const res = await req("PUT", `/api/admin/manufacturers/${pressId}/catalog/formats/12_lp`, { enabled: false });
  assert.equal(res.status, 200);
  // Archived original tier row survives, and its colors do too.
  const rows = await exec(sql`SELECT id, archived_at FROM press_color_tiers WHERE press_id = ${pressId} AND format = '12_lp'`);
  const byId = new Map((rows.rows as any[]).map((r) => [r.id, r.archived_at]));
  assert.ok(byId.has(lpTierId), "original archived tier survives format disable");
  const colorRows = await exec(sql`SELECT id FROM press_colors WHERE id IN (${lpRed}, ${lpBlue})`);
  assert.equal((colorRows.rows as any[]).length, 2, "archived colors survive format disable");
  // Clean active tier ("Keep Me", no archived colors) was hard-deleted.
  assert.ok(!byId.has(keepTierId), "clean tier hard-deleted on disable");
  // Any surviving tier is archived (nothing active remains under a disabled format).
  for (const [, archivedAt] of byId) assert.ok(archivedAt, "surviving tiers are archived");
  // Historical identity still resolves.
  const identity = await resolveCatalogIdentity({ tierId: lpTierId, colorId: lpRed, format: "12_lp" as any });
  assert.ok(identity && identity.tierName === "House Mix" && identity.colorName === "Red");
});

test("MRP importer rejects an archived tier as a commit target", async () => {
  // Make the test press eligible for the MRP-only importer. The domain
  // carries a partial UNIQUE index, so park the real holder's domain
  // (if any) for the duration and restore both rows afterwards.
  const MRP = "memphisrecordpressing.com";
  const holder = await exec(sql`SELECT id FROM manufacturers WHERE domain = ${MRP} AND deleted_at IS NULL`);
  const holderId = (holder.rows as any[])[0]?.id as string | undefined;
  try {
    if (holderId) await exec(sql`UPDATE manufacturers SET domain = NULL WHERE id = ${holderId}`);
    await exec(sql`UPDATE manufacturers SET domain = ${MRP} WHERE id = ${pressId}`);
    const res = await req("POST", `/api/admin/manufacturers/${pressId}/catalog/mrp-import/commit`, {
      items: [
        {
          code: "C01",
          name: "Red",
          sourceUrl: "https://memphisrecordpressing.com/colors/red.png",
          tierId: lpTierId, // archived — must be rejected before any writes
        },
      ],
    });
    assert.equal(res.status, 400, "archived tier is not a valid import target");
    assert.match(String(res.json?.message ?? ""), /doesn't belong/i);
  } finally {
    await exec(sql`UPDATE manufacturers SET domain = NULL WHERE id = ${pressId}`);
    if (holderId) await exec(sql`UPDATE manufacturers SET domain = ${MRP} WHERE id = ${holderId}`);
  }
});

after(async () => {
  try {
    // press_color_tiers/press_colors cascade off the manufacturer delete path;
    // remove explicitly to be safe against FK behavior differences.
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
