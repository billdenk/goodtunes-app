// Task #3227 — the record leg of the package cost breakdown must NEVER
// silently price an explicitly selected jacket off the legacy tier ladder
// when that jacket has no tier×jacket ladder. Legacy fallback is reserved
// for jacket-less/legacy callers only (requireJacketLadder=false).
//
// Real DB (DATABASE_URL): seeds a throwaway press + tier (legacy ladder
// only) + jacket (NO combo ladder), asserts the honest null, and cleans up.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import express from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { authKindMiddleware } from "./auth/host";
import { registerRoutes } from "./routes";
import { manufacturers, pressColorTiers, pressJackets } from "@shared/schema";
import { lookupCatalogUnitCents } from "./pressCatalog";

let pressId: string;
let tierId: string;
let jacketId: string;
let baseUrl = "";
let httpServer: HttpServer | undefined;
let adminToken = "";
let adminUserId = "";

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
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  adminUserId = randomUUID();
  const tag = adminUserId.slice(0, 8);
  await db.execute(sql`
    INSERT INTO users (id, username, password, display_name, email, is_admin, role, role_scope_id)
    VALUES (${adminUserId}, ${"t3227_" + tag}, ${"x"}, ${"t3227"}, ${"t3227_" + tag + "@example.test"}, true, 'super_admin', NULL)
  `);
  adminToken = "t3227tok_" + randomUUID().replace(/-/g, "");
  await storage.createAuthToken(adminToken, adminUserId, "admin");
  const [press] = await db
    .insert(manufacturers)
    .values({ name: `__test_jacket_ladder_press_${Date.now()}` } as any)
    .returning();
  pressId = press.id;
  const [tier] = await db
    .insert(pressColorTiers)
    .values({
      pressId,
      format: "12_lp",
      name: "Black",
      priceLadder: [{ qty: 300, unitCents: 500, confirmed: true }],
    } as any)
    .returning();
  tierId = tier.id;
  const [jacket] = await db
    .insert(pressJackets)
    .values({ pressId, name: "Gatefold Jacket" } as any)
    .returning();
  jacketId = jacket.id; // deliberately NO press_tier_jacket_ladders row
});

after(async () => {
  await db.delete(pressJackets).where(eq(pressJackets.pressId, pressId));
  await db.delete(pressColorTiers).where(eq(pressColorTiers.pressId, pressId));
  await db.delete(manufacturers).where(eq(manufacturers.id, pressId));
  await db.execute(sql`DELETE FROM auth_tokens WHERE admin_user_id = ${adminUserId}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${adminUserId}`);
  await new Promise<void>((resolve) => (httpServer ? httpServer.close(() => resolve()) : resolve()));
});

async function getBreakdown(selections: string): Promise<any> {
  const res = await fetch(
    `${baseUrl}/api/admin/manufacturers/${pressId}/catalog/package-cost-breakdown?format=12_lp&tierId=${tierId}&quantity=300&selections=${selections}`,
    { headers: { authorization: `Bearer ${adminToken}` } },
  );
  assert.equal(res.status, 200);
  return res.json();
}

// Endpoint-level: an explicit gatefold selection whose matched jacket row has
// no tier×jacket ladder must NOT fall back to the legacy tier ladder.
test("breakdown: explicit gatefold with empty tier×jacket ladder = honest note, no legacy price", async () => {
  const d = await getBreakdown("jacket:gatefold");
  assert.equal(d.record, null);
  assert.match(d.recordNote ?? "", /custom quote/i);
});

// Endpoint-level once-only invariant: when the record line prices with the
// selected jacket's ALL-IN tier×jacket ladder, that jacket must NOT also
// price as a component line — even if a ladder link exists for it.
test("breakdown: all-in tier×jacket record line counts the jacket exactly once", async () => {
  await db.execute(sql`
    INSERT INTO press_tier_jacket_ladders (tier_id, jacket_id, price_ladder)
    VALUES (${tierId}, ${jacketId}, ${JSON.stringify([{ qty: 300, unitCents: 800, confirmed: true }])}::jsonb)
  `);
  await db.execute(sql`
    INSERT INTO press_component_price_links (press_id, component_key, option_id, price_mode, ladder_rungs)
    VALUES (${pressId}, 'jacket', 'gatefold', 'ladder', ${JSON.stringify([{ qty: 300, unitCents: 200 }])}::jsonb)
  `);
  try {
    const d = await getBreakdown("jacket:gatefold");
    assert.equal(d.record?.unitCents, 800);
    assert.equal(d.record?.totalCents, 800 * 300);
    const jacketLine = d.components.find((l: any) => l.componentKey === "jacket");
    assert.equal(jacketLine?.status, "included"); // never double-charged
    assert.equal(jacketLine?.totalCents ?? null, null);
    assert.equal(d.totals.componentsCents, 0);
    assert.equal(d.totals.combinedCents, 800 * 300); // record only, once
  } finally {
    await db.execute(sql`DELETE FROM press_component_price_links WHERE press_id = ${pressId}`);
    await db.execute(sql`DELETE FROM press_tier_jacket_ladders WHERE tier_id = ${tierId}`);
  }
});

// Endpoint-level: explicit single with NO matching/default jacket row at all
// is the same honest gap (never the legacy tier-ladder fallback).
test("breakdown: explicit single with no jacket rows = honest note, no legacy price", async () => {
  await db.delete(pressJackets).where(eq(pressJackets.pressId, pressId));
  try {
    const d = await getBreakdown("jacket:single");
    assert.equal(d.record, null);
    assert.match(d.recordNote ?? "", /custom quote/i);
  } finally {
    const [jacket] = await db
      .insert(pressJackets)
      .values({ id: jacketId, pressId, name: "Gatefold Jacket" } as any)
      .returning();
    jacketId = jacket.id;
  }
});

test("explicit jacket with no tier×jacket ladder is an honest null (no legacy fallback)", async () => {
  const hit = await lookupCatalogUnitCents({
    pressId,
    format: "12_lp" as any,
    tierId,
    colorId: null,
    quantity: 300,
    jacketId,
    requireJacketLadder: true,
  });
  assert.equal(hit, null);
});

test("legacy/jacket-less callers keep the legacy tier-ladder fallback", async () => {
  const hit = await lookupCatalogUnitCents({
    pressId,
    format: "12_lp" as any,
    tierId,
    colorId: null,
    quantity: 300,
    jacketId,
  });
  assert.equal(hit?.unitCents, 500);
  assert.equal(hit?.requiresQuote, false);
});
