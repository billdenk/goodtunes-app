// Task #2859 — QA-only fan accounts must not inflate the god-view
// dashboard's "New fans" / signup KPIs. A customer whose ONLY orders are
// qa:test test purchases (e.g. the Shopify E2E stub account) is a test
// artifact, not a fan: platformKpis must exclude it from newSignups, the
// daily signup series, AND the prior-period headline signups — while a
// real customer (with a non-qa order) and a zero-order customer both
// still count.
//
//   GT_TEST=1 npx tsx --test server/reports/adminKpisQaExclusion.db.test.ts
//
// Uses a far-past synthetic window (2001-03) so live rows can't interfere.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./../db";
import { platformKpis } from "./admin";

const q = (query: any) => db.execute(query);

const uid = (p: string) => `kpi2859-${p}-${randomUUID().slice(0, 8)}`;

const albumId = uid("album");
const realFanId = uid("real");
const qaOnlyFanId = uid("qaonly");
const zeroOrderFanId = uid("zero");
const priorQaOnlyFanId = uid("priorqa");
const customerIds = [realFanId, qaOnlyFanId, zeroOrderFanId, priorQaOnlyFanId];
const orderIds: string[] = [];

// Window: 2001-03-10..2001-03-12 → prior window immediately precedes it.
const FROM = new Date("2001-03-10T00:00:00Z");
const TO = new Date("2001-03-12T00:00:00Z");
const IN_WINDOW = "2001-03-10T12:00:00Z";
const IN_PRIOR = "2001-03-09T12:00:00Z";

async function seedCustomer(id: string, createdAt: string) {
  await q(sql`
    INSERT INTO customer_users (id, username, email, display_name, created_at)
    VALUES (${id}, ${id}, ${id + "@kpi2859.test"}, ${"KPI Fan"}, ${createdAt})
  `);
}

async function seedOrder(customerId: string, origin: string) {
  const id = randomUUID();
  await q(sql`
    INSERT INTO orders (id, customer_id, album_id, total_cents, status, origin, created_at)
    VALUES (${id}, ${customerId}, ${albumId}, ${2500}, ${"paid"}, ${origin}, ${IN_WINDOW})
  `);
  orderIds.push(id);
}

after(async () => {
  try {
    for (const id of orderIds) await q(sql`DELETE FROM orders WHERE id = ${id}`);
    for (const id of customerIds) await q(sql`DELETE FROM customer_users WHERE id = ${id}`);
    await q(sql`DELETE FROM albums WHERE id = ${albumId}`);
  } finally {
    await pool.end();
  }
});

test("QA-only fans are excluded from signup KPIs; real + zero-order fans count", async () => {
  await q(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${albumId}, ${"KPI QA Album"}, ${"KPI"}, ${"/album-placeholder.svg"})
  `);
  // In-window signups: one real buyer, one QA-only stub, one zero-order fan.
  await seedCustomer(realFanId, IN_WINDOW);
  await seedCustomer(qaOnlyFanId, IN_WINDOW);
  await seedCustomer(zeroOrderFanId, IN_WINDOW);
  await seedOrder(realFanId, "direct");
  await seedOrder(qaOnlyFanId, "qa:test");
  // Prior-window signup: QA-only → prior.signups must not count it either.
  await seedCustomer(priorQaOnlyFanId, IN_PRIOR);
  await seedOrder(priorQaOnlyFanId, "qa:test");

  const kpis = await platformKpis({ from: FROM, to: TO });

  assert.equal(kpis.newSignups, 2, "real + zero-order fans count; QA-only stub does not");
  const seriesTotal = kpis.series.reduce((n: number, d: any) => n + d.signups, 0);
  assert.equal(seriesTotal, 2, "daily signup series excludes the QA-only stub");
  assert.equal((kpis.prior as any).newSignups, 0, "prior-window headline signups exclude QA-only accounts");
});
