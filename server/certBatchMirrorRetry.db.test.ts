// Task #3091 review follow-up — the commit-then-mirror retry boundary.
//
// A label purchase commits its snapshot BEFORE the fulfillment
// tracking/email mirror runs. If the process dies (or the email dispatch
// fails) between those two steps, every later purchase request returns
// alreadyPurchased — so the mirror MUST run on every successful response,
// be idempotent on the tracking write, and keep the heads-up email
// at-most-once via the one-shot notify claim (released on dispatch
// failure so a retry can re-send).
//
// This drives the real mirrorReturnTrackingAndNotify against the real DB,
// with the email dispatcher injected (test seam, like
// materializeOrderFromSession's {stripe}).
//
//   npx tsx --test server/certBatchMirrorRetry.db.test.ts
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { mirrorReturnTrackingAndNotify } from "./certBatch";
import type { CertBatchShippingLabels } from "@shared/schema";

const albumId = randomUUID();
const fpId = `fp-mirror-test-${randomUUID().slice(0, 8)}`;

const labels: CertBatchShippingLabels = {
  status: "purchased",
  outbound: null as any,
  return: {
    shipmentId: "shp_test",
    trackingCode: "1ZTESTTRACK123",
    carrier: "UPS",
    service: "Ground",
    labelUrl: "https://example.test/label.pdf",
    rateCents: 1234,
    toName: "Test FP",
    purchasedAt: new Date().toISOString(),
  } as any,
  returnDestination: { kind: "fulfillment_partner", id: fpId, name: "Test FP" },
};

async function readMirror() {
  const out = await db.execute(sql`
    SELECT cert_batch_return_carrier AS carrier,
           cert_batch_return_tracking AS tracking,
           cert_batch_return_fulfillment_id AS fid,
           cert_batch_return_notified_at AS notified
    FROM albums WHERE id = ${albumId}
  `);
  return (out as any).rows[0];
}

before(async () => {
  await db.execute(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${albumId}, ${"mirror-retry test album"}, ${"test artist"}, ${""})
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM albums WHERE id = ${albumId}`);
  await pool.end();
});

test("dispatch failure mirrors tracking but releases the claim (retryable)", async () => {
  const r = await mirrorReturnTrackingAndNotify(albumId, labels, {
    dispatch: async () => {
      throw new Error("smtp down");
    },
  });
  assert.ok(r.notifyProblem, "failure must surface, never silent");
  const row = await readMirror();
  assert.equal(row.carrier, "UPS");
  assert.equal(row.tracking, "1ZTESTTRACK123");
  assert.equal(row.fid, fpId);
  assert.equal(row.notified, null, "claim released so a retry can re-send");
});

test("retry after failure dispatches exactly once and stamps the claim", async () => {
  let sent = 0;
  const r = await mirrorReturnTrackingAndNotify(albumId, labels, {
    dispatch: async () => {
      sent += 1;
    },
  });
  assert.equal(r.notifyProblem, null);
  assert.equal(sent, 1);
  const row = await readMirror();
  assert.ok(row.notified, "notify claim stamped after successful dispatch");
});

test("subsequent stored-purchase retries are no-ops (at-most-once email)", async () => {
  let sent = 0;
  const first = await readMirror();
  const r = await mirrorReturnTrackingAndNotify(albumId, labels, {
    dispatch: async () => {
      sent += 1;
    },
  });
  assert.equal(r.notifyProblem, null);
  assert.equal(sent, 0, "claim already consumed — no duplicate email");
  const row = await readMirror();
  assert.equal(String(row.notified), String(first.notified));
  assert.equal(row.tracking, "1ZTESTTRACK123");
});

test("non-fulfillment return destination is a clean no-op", async () => {
  const r = await mirrorReturnTrackingAndNotify(albumId, {
    ...labels,
    returnDestination: { kind: "printer", id: "v-x", name: "Printer" } as any,
  });
  assert.equal(r.notifyProblem, null);
});
