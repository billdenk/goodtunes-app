// Item 28 — regression coverage for the shared-run-size 140 g / 180 g price
// books on PUT /api/admin/manufacturers/:id/catalog/tiers/:tierId/jackets/
// :jacketId/ladder, plus the persisted template display filename on
// PUT /api/admin/manufacturers/:id/template-specs.
//
// Pins in:
//   (1) saving one weight book leaves the OTHER book with exactly the same
//       qty set — new qtys land as unconfirmed "on request" placeholders,
//       removed qtys disappear from BOTH books, and shared qtys keep the
//       other book's own price/quote state ("each weight keeps its own
//       numbers");
//   (2) "Not offered" rungs persist with offered:false (still occupying the
//       shared run size) and are invisible to artist-facing price snapping;
//   (3) template-specs PUT persists templateFileName and the GET returns it.
//
// Same harness as pressCatalogColorsReorder.routes.db.test.ts: full route
// tree on a loopback socket; bearer token authenticates requireAdmin.
//
//   npx tsx --test server/pressCatalogLadderWeights.routes.db.test.ts
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
import { snapToCatalogQuantityTier } from "./pressCatalog";

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
let tierId = "";
let jacketId = "";

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
  await exec(sql`INSERT INTO manufacturers (id, name) VALUES (${pressId}, ${"t2969 Press"})`);
  created.manufacturers.add(pressId);

  const adminId = randomUUID();
  const tag = adminId.slice(0, 8);
  await exec(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role)
    VALUES (${adminId}, ${"t2969_" + tag}, ${"x"}, ${"t2969"}, ${"t2969_" + tag + "@example.test"},
            true, ${"super_admin"})
  `);
  created.users.add(adminId);
  adminToken = "t2969tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(adminToken, adminId, "admin");
  created.tokens.add(adminToken);

  tierId = randomUUID();
  await exec(sql`
    INSERT INTO press_color_tiers (id, press_id, format, name, position, price_ladder)
    VALUES (${tierId}, ${pressId}, ${"12_lp"}, ${"Standard Colors"}, 0, '[]'::jsonb)
  `);
  jacketId = randomUUID();
  await exec(sql`
    INSERT INTO press_jackets (id, press_id, name, position)
    VALUES (${jacketId}, ${pressId}, ${"Standard"}, 0)
  `);
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

const ladderPath = () =>
  `/api/admin/manufacturers/${pressId}/catalog/tiers/${tierId}/jackets/${jacketId}/ladder`;

type Rung = { qty: number; unitCents: number; confirmed?: boolean; offered?: boolean };
async function books(): Promise<{ l140: Rung[]; l180: Rung[] }> {
  const r: any = await exec(sql`
    SELECT price_ladder, price_ladder_180 FROM press_tier_jacket_ladders
    WHERE tier_id = ${tierId} AND jacket_id = ${jacketId}
  `);
  const row = r.rows[0] ?? {};
  const parse = (v: any): Rung[] => (Array.isArray(v) ? v : typeof v === "string" ? JSON.parse(v) : []);
  return { l140: parse(row.price_ladder), l180: parse(row.price_ladder_180) };
}
const qtys = (l: Rung[]) => l.map((r) => r.qty).sort((a, b) => a - b);

test("saving the 140 g book seeds the 180 g book with the same run sizes as placeholders", async () => {
  const res = await req("PUT", ladderPath(), adminToken, {
    weight: "140",
    priceLadder: [
      { qty: 50, unitCents: 3049, confirmed: true },
      { qty: 100, unitCents: 1769, confirmed: true },
    ],
  });
  assert.equal(res.status, 200);
  const { l140, l180 } = await books();
  assert.deepEqual(qtys(l140), [50, 100]);
  assert.deepEqual(qtys(l180), [50, 100], "180 book shares the run sizes");
  for (const r of l180) {
    assert.equal(r.confirmed, false, "seeded 180 rungs are on-request placeholders");
    assert.equal(r.unitCents, 0);
  }
});

test("pricing the 180 g book keeps the 140 g book's own numbers for shared qtys", async () => {
  const res = await req("PUT", ladderPath(), adminToken, {
    weight: "180",
    priceLadder: [
      { qty: 50, unitCents: 3599, confirmed: true },
      { qty: 100, unitCents: 0, confirmed: false },
    ],
  });
  assert.equal(res.status, 200);
  const { l140, l180 } = await books();
  assert.equal(l180.find((r) => r.qty === 50)?.unitCents, 3599);
  assert.equal(l140.find((r) => r.qty === 50)?.unitCents, 3049, "140 price untouched");
  assert.equal(l140.find((r) => r.qty === 100)?.unitCents, 1769, "140 price untouched");
});

test("removing a run size from one book removes it from BOTH books", async () => {
  const res = await req("PUT", ladderPath(), adminToken, {
    weight: "140",
    priceLadder: [{ qty: 50, unitCents: 3049, confirmed: true }],
  });
  assert.equal(res.status, 200);
  const { l140, l180 } = await books();
  assert.deepEqual(qtys(l140), [50]);
  assert.deepEqual(qtys(l180), [50], "removal propagates to the 180 book");
  assert.equal(l180[0]?.unitCents, 3599, "the surviving 180 rung keeps its own price");
});

test("adding a run size to the 180 g book adds it to the 140 g book too", async () => {
  const res = await req("PUT", ladderPath(), adminToken, {
    weight: "180",
    priceLadder: [
      { qty: 50, unitCents: 3599, confirmed: true },
      { qty: 300, unitCents: 0, confirmed: false },
    ],
  });
  assert.equal(res.status, 200);
  const { l140, l180 } = await books();
  assert.deepEqual(qtys(l180), [50, 300]);
  assert.deepEqual(qtys(l140), [50, 300], "new qty appears in the 140 book");
  const added = l140.find((r) => r.qty === 300);
  assert.equal(added?.confirmed, false, "added as an on-request placeholder");
  assert.equal(l140.find((r) => r.qty === 50)?.unitCents, 3049, "existing 140 rung untouched");
});

test("'Not offered' rungs persist with offered:false and are skipped by price snapping", async () => {
  const res = await req("PUT", ladderPath(), adminToken, {
    weight: "140",
    priceLadder: [
      { qty: 50, unitCents: 3049, confirmed: true },
      { qty: 300, unitCents: 0, confirmed: false, offered: false },
    ],
  });
  assert.equal(res.status, 200);
  const { l140 } = await books();
  const off = l140.find((r) => r.qty === 300);
  assert.equal(off?.offered, false, "off rung persisted, still occupying the shared run size");
  // Artist-facing snap must ignore the off rung entirely: quantities above 50
  // fall back to the top OFFERED rung with requiresQuote, never price at 300.
  const snap = snapToCatalogQuantityTier(l140, 300);
  assert.equal(snap?.qty, 50);
  assert.equal(snap?.requiresQuote, true);
});

test("template-specs PUT persists the display filename and GET returns it", async () => {
  const put = await req("PUT", `/api/admin/manufacturers/${pressId}/template-specs`, adminToken, {
    format: "12_lp",
    componentKey: "jacket",
    variantKey: "",
    discCount: 0,
    templateFileUrl: "/objects/uploads/0f6f3f52-opaque-storage-id",
    templateFileName: "mrp-12in-jacket-template.pdf",
  });
  assert.equal(put.status, 200);
  assert.equal(put.json.spec.templateFileName, "mrp-12in-jacket-template.pdf");

  const get = await req("GET", `/api/admin/manufacturers/${pressId}/template-specs?format=12_lp`, adminToken);
  assert.equal(get.status, 200);
  const spec = (get.json.specs as any[]).find((s) => s.componentKey === "jacket");
  assert.equal(spec?.templateFileName, "mrp-12in-jacket-template.pdf");
  assert.equal(spec?.templateFileUrl, "/objects/uploads/0f6f3f52-opaque-storage-id");
});

after(async () => {
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    for (const id of created.manufacturers) {
      await exec(sql`DELETE FROM press_tier_jacket_ladders WHERE tier_id IN (SELECT id FROM press_color_tiers WHERE press_id = ${id})`);
      await exec(sql`DELETE FROM press_template_specs WHERE press_id = ${id}`);
      await exec(sql`DELETE FROM press_jackets WHERE press_id = ${id}`);
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
