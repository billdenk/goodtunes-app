// Task #3206 — Failed-checkout recovery detection in the Ops report.
//
// Pins in the matching rules of opsHealth().failedCheckouts:
//   (1) decline followed by a LATER paid order for the SAME buyer + album
//       → recovered (recoveredAt = the order's created_at);
//   (2) a paid order placed BEFORE the failure does NOT recover it;
//   (3) a QA (origin='qa:test') order never counts as a recovery;
//   (4) an email-only match (failure row has no customer_id) still
//       recovers, case-insensitively;
//   (4b) every successful order status counts ('paid','shipped',
//        'complete','completed','external_paid') while a non-paid status
//        ('pending') never does;
//   (5) summary aggregates: recoveredCount / unrecoveredCount /
//       unrecoveredAmountCents over the window.
//
// All fixtures live in an isolated 2001 date window so no real rows can
// bleed into the assertions.
//
//   npx tsx --test server/reports/opsFailedCheckoutRecovery.db.test.ts
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { opsHealth } from "./admin";

const exec = (q: any) => db.execute(q);

const tag = randomUUID().slice(0, 8);
const custA = randomUUID();
const custB = randomUUID();
const albumX = randomUUID();
const albumY = randomUUID();
const emailA = `t3206a_${tag}@example.test`;
const emailC = `t3206c_${tag}@example.test`;

const evRecovered = `evt_t3206_r_${tag}`;
const evOrderBefore = `evt_t3206_b_${tag}`;
const evQaOnly = `evt_t3206_q_${tag}`;
const evEmailOnly = `evt_t3206_e_${tag}`;

// (4b) one fixture per successful status + a non-paid control.
const RECOVERING_STATUSES = ["paid", "shipped", "complete", "completed", "external_paid"] as const;
const NON_RECOVERING_STATUS = "pending";
const statusFixtures = [...RECOVERING_STATUSES, NON_RECOVERING_STATUS].map((status) => ({
  status,
  eventId: `evt_t3206_s_${status}_${tag}`,
  albumId: randomUUID(),
}));

const orderIds: string[] = [];

const ctx = { from: new Date("2001-01-01T00:00:00Z"), to: new Date("2001-12-31T23:59:59Z") };

async function insertFailure(eventId: string, opts: { customerId: string | null; email: string; albumId: string; occurredAt: string; amountCents: number }) {
  await exec(sql`
    INSERT INTO checkout_failure_events
      (stripe_event_id, kind, failure_code, buyer_email, customer_id, album_id, amount_cents, is_qa, occurred_at)
    VALUES (${eventId}, ${"payment_failed"}, ${"card_declined"}, ${opts.email}, ${opts.customerId},
            ${opts.albumId}, ${opts.amountCents}, false, ${opts.occurredAt})
  `);
}

async function insertOrder(opts: { customerId: string; albumId: string; email: string; createdAt: string; origin?: string; status?: string }) {
  const id = randomUUID();
  orderIds.push(id);
  await exec(sql`
    INSERT INTO orders (id, customer_id, album_id, total_cents, status, origin, buyer_email, created_at)
    VALUES (${id}, ${opts.customerId}, ${opts.albumId}, ${4599}, ${opts.status ?? "paid"}, ${opts.origin ?? "web"}, ${opts.email}, ${opts.createdAt})
  `);
  return id;
}

before(async () => {
  await exec(sql`INSERT INTO customer_users (id, username, email, display_name) VALUES (${custA}, ${emailA}, ${emailA}, ${"T3206 A"})`);
  await exec(sql`INSERT INTO customer_users (id, username, email, display_name) VALUES (${custB}, ${"t3206b_" + tag}, ${"t3206b_" + tag + "@example.test"}, ${"T3206 B"})`);
  await exec(sql`INSERT INTO albums (id, title, artist, artwork) VALUES (${albumX}, ${"T3206 Album X"}, ${"T3206"}, ${"/album-placeholder.svg"})`);
  await exec(sql`INSERT INTO albums (id, title, artist, artwork) VALUES (${albumY}, ${"T3206 Album Y"}, ${"T3206"}, ${"/album-placeholder.svg"})`);

  // (1) decline then a later paid order for the same customer + album.
  await insertFailure(evRecovered, { customerId: custA, email: emailA, albumId: albumX, occurredAt: "2001-06-01T00:00:00Z", amountCents: 4599 });
  await insertOrder({ customerId: custA, albumId: albumX, email: emailA, createdAt: "2001-06-05T00:00:00Z" });

  // (2) failure AFTER the paid order (same buyer/album) → not recovered.
  await insertFailure(evOrderBefore, { customerId: custA, email: emailA, albumId: albumX, occurredAt: "2001-07-01T00:00:00Z", amountCents: 1000 });

  // (3) failure whose only later matching order is QA → not recovered.
  await insertFailure(evQaOnly, { customerId: custA, email: emailA, albumId: albumY, occurredAt: "2001-06-01T00:00:00Z", amountCents: 2000 });
  await insertOrder({ customerId: custA, albumId: albumY, email: emailA, createdAt: "2001-06-05T00:00:00Z", origin: "qa:test" });

  // (4) email-only failure (no customer_id, mixed case) + later paid order
  // by a different customer id with the matching email → recovered.
  await insertFailure(evEmailOnly, { customerId: null, email: emailC.toUpperCase(), albumId: albumX, occurredAt: "2001-06-01T00:00:00Z", amountCents: 3000 });
  await insertOrder({ customerId: custB, albumId: albumX, email: emailC, createdAt: "2001-06-10T00:00:00Z" });

  // (4b) per-status fixtures: failure at 06-01, order in the given status
  // at 06-05, each on its own album so they can't cross-match.
  for (const f of statusFixtures) {
    await exec(sql`INSERT INTO albums (id, title, artist, artwork) VALUES (${f.albumId}, ${"T3206 " + f.status}, ${"T3206"}, ${"/album-placeholder.svg"})`);
    await insertFailure(f.eventId, { customerId: custA, email: emailA, albumId: f.albumId, occurredAt: "2001-06-01T00:00:00Z", amountCents: 500 });
    await insertOrder({ customerId: custA, albumId: f.albumId, email: emailA, createdAt: "2001-06-05T00:00:00Z", status: f.status });
  }
});

test("recovery detection: later same-buyer same-album paid order recovers; before/QA don't; email-only matches", async () => {
  const data = await opsHealth(ctx);
  const rows = data.failedCheckouts.rows as any[];
  const byEvent = new Map<string, any>();
  const idRows = await exec(sql`SELECT id, stripe_event_id FROM checkout_failure_events WHERE stripe_event_id LIKE ${"evt_t3206_%_" + tag}`);
  const eventById = new Map(((idRows as any).rows as any[]).map((r) => [r.id, r.stripe_event_id]));
  for (const r of rows) {
    const ev = eventById.get(r.id);
    if (ev) byEvent.set(ev, r);
  }
  assert.equal(byEvent.size, 4 + statusFixtures.length, "all fixture failures visible in the window");

  const recovered = byEvent.get(evRecovered);
  assert.equal(recovered.recovered, true);
  assert.equal(new Date(recovered.recoveredAt).toISOString(), "2001-06-05T00:00:00.000Z");

  assert.equal(byEvent.get(evOrderBefore).recovered, false, "order placed before the failure is not a recovery");
  assert.equal(byEvent.get(evOrderBefore).recoveredAt, null);

  assert.equal(byEvent.get(evQaOnly).recovered, false, "qa:test orders never count as recoveries");

  assert.equal(byEvent.get(evEmailOnly).recovered, true, "email-only match (no customer id) recovers, case-insensitive");

  // (4b) every successful order status recovers; a non-paid one doesn't.
  for (const f of statusFixtures) {
    const expected = f.status !== NON_RECOVERING_STATUS;
    assert.equal(byEvent.get(f.eventId).recovered, expected, `status '${f.status}' recovered=${expected}`);
  }
});

test("summary aggregates recovered/unrecovered counts and unrecovered dollars", async () => {
  const data = await opsHealth(ctx);
  assert.equal(data.failedCheckouts.count, 4 + statusFixtures.length);
  assert.equal(data.failedCheckouts.recoveredCount, 2 + RECOVERING_STATUSES.length);
  assert.equal(data.failedCheckouts.unrecoveredCount, 3);
  // ev2 ($10.00) + ev3 ($20.00) + the pending-status control ($5.00) —
  // the recovered rows' amounts are excluded.
  assert.equal(data.failedCheckouts.unrecoveredAmountCents, 3500);
});

after(async () => {
  await exec(sql`DELETE FROM checkout_failure_events WHERE stripe_event_id LIKE ${"evt_t3206_%_" + tag}`);
  for (const id of orderIds) await exec(sql`DELETE FROM orders WHERE id = ${id}`);
  await exec(sql`DELETE FROM albums WHERE id IN (${albumX}, ${albumY})`);
  for (const f of statusFixtures) await exec(sql`DELETE FROM albums WHERE id = ${f.albumId}`);
  await exec(sql`DELETE FROM customer_users WHERE id IN (${custA}, ${custB})`);
  await pool.end();
});
