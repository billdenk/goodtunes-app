// Restart-safe dedup coverage for the daily end-of-day sales digest.
// Task #1783 — the digest must send at most once per UTC day per partner
// even if the process restarts mid-window. The dedup key is the UTC date
// stamped into payload_snapshot.digestDate (not a fragile time window), so
// a second pass the same day is a no-op while `force` re-sends.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//   npx tsx --test server/dailySalesReport.db.test.ts
//
// Recipients use an @example.test (synthetic) address so the mail transport
// short-circuits before Resend — the dispatch still logs a row carrying the
// digestDate, which is exactly what the dedup reads. Every seeded row is
// torn down in the `after` hook.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { runDailySalesDigests } from "./dailySalesReport";

const exec = (q: any) => db.execute(q);

const id = (p: string) => `digest-test-${p}-${randomUUID().slice(0, 8)}`;
const personId = id("person");
const customerId = id("customer");
const albumId = id("album");
const orderId = id("order");
const recipientId = id("recipient");

const only = { partnerKind: "person" as const, partnerId: personId };

// Count log rows for our seeded recipient stamped with today's UTC digestDate.
async function logRowsForToday(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const r = await exec(sql`
    SELECT COUNT(*)::int AS n
    FROM partner_notification_log
    WHERE recipient_id = ${recipientId}
      AND event_type = 'daily_sales_digest'
      AND payload_snapshot->>'digestDate' = ${today}
  `);
  return Number((r as any).rows?.[0]?.n ?? 0);
}

before(async () => {
  await exec(sql`
    INSERT INTO customer_users (id, username, email, display_name)
    VALUES (${customerId}, ${customerId}, ${customerId + "@example.test"}, 'Digest Buyer')
  `);
  await exec(sql`
    INSERT INTO people (id, name) VALUES (${personId}, 'Digest Artist')
  `);
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork, primary_artist_id)
    VALUES (${albumId}, 'Digest LP', 'Digest Artist', 'x', ${personId})
  `);
  // A paid order inside the last-24h window so the day is non-empty.
  await exec(sql`
    INSERT INTO orders (id, customer_id, album_id, total_cents, status, created_at)
    VALUES (${orderId}, ${customerId}, ${albumId}, 2500, 'paid', now())
  `);
  // Recipient subscribed to the digest event on the existing settings table.
  await exec(sql`
    INSERT INTO partner_notification_recipients
      (id, partner_kind, partner_id, name, channel, address, events)
    VALUES (${recipientId}, 'person', ${personId}, 'Digest Recipient', 'email',
            ${recipientId + "@example.test"}, ${'["daily_sales_digest"]'}::jsonb)
  `);
});

after(async () => {
  await exec(sql`DELETE FROM partner_notification_log WHERE recipient_id = ${recipientId}`);
  await exec(sql`DELETE FROM partner_notification_recipients WHERE id = ${recipientId}`);
  await exec(sql`DELETE FROM orders WHERE id = ${orderId}`);
  await exec(sql`DELETE FROM albums WHERE id = ${albumId}`);
  await exec(sql`DELETE FROM people WHERE id = ${personId}`);
  await exec(sql`DELETE FROM customer_users WHERE id = ${customerId}`);
  await pool.end();
});

test("first pass dispatches and logs a row for the day", async () => {
  const res = await runDailySalesDigests({ only });
  assert.equal(res.partnersConsidered, 1, "only the seeded partner is considered");
  assert.equal(await logRowsForToday(), 1, "exactly one log row stamped with today's digestDate");
});

test("a second same-day pass is a no-op (restart-safe dedup)", async () => {
  const res = await runDailySalesDigests({ only });
  assert.equal(res.skippedRecent, 1, "the partner is skipped as already-sent-today");
  assert.equal(await logRowsForToday(), 1, "no duplicate log row is written");
});

test("force=true re-sends despite the same-day dedup", async () => {
  const res = await runDailySalesDigests({ only, force: true });
  assert.equal(res.skippedRecent, 0, "force bypasses the dedup");
  assert.equal(await logRowsForToday(), 2, "a second log row is written under force");
});
