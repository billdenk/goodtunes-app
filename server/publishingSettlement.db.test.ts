// Integration coverage for the publishing mechanical-settlement engine
// (server/publishingSettlement.ts) against a real Postgres. Generic — seeds
// its own throwaway album/songs/publishers, so it needs no Nick data.
//
// Verifies the three things Bill cares about ("never sloppy again"):
//   - owed = statutoryRate × unitsPressed × (percentBp / 10000), aggregated
//     per pay-to payee (administered-by routing collapses a publisher into
//     its administrator's payout target);
//   - onboarding status is reported per payee (account present + enabled);
//   - songs whose publisher shares don't sum to 100% are FLAGGED, and songs
//     with no splits at all are listed.
//
// Real DB (DATABASE_URL), Node's built-in runner:
//   npx tsx --test server/publishingSettlement.db.test.ts
//
// Every row seeded here is torn down in the `after` hook.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { computeAlbumPublishingSettlement } from "./publishingSettlement";

const exec = (q: any) => db.execute(q);

const id = (p: string) => `pubsettle-test-${p}-${randomUUID().slice(0, 8)}`;
const albumId = id("album");
const songA = id("songA");
const songB = id("songB");
const songC = id("songC");
const kaoticOrg = id("kaotic");
const hipgnosisOrg = id("hipgnosis");
const directOrg = id("direct");

before(async () => {
  await exec(sql`
    INSERT INTO albums (id, title, artist, artwork)
    VALUES (${albumId}, 'Settlement Test LP', 'Test Artist', 'x')
  `);
  await exec(sql`
    INSERT INTO songs (id, album_id, title, track_number)
    VALUES (${songA}, ${albumId}, 'Song A', 1),
           (${songB}, ${albumId}, 'Song B', 2),
           (${songC}, ${albumId}, 'Song C', 3)
  `);
  // Publisher administered by another org (Kaotic → Hipgnosis).
  await exec(sql`
    INSERT INTO organizations (id, name, kind, pay_to_org_id)
    VALUES (${kaoticOrg}, 'Test Songs of Kaotic', 'publisher', ${hipgnosisOrg})
  `);
  await exec(sql`
    INSERT INTO organizations (id, name, kind)
    VALUES (${hipgnosisOrg}, 'Test Hipgnosis Songs Group', 'publisher'),
           (${directOrg}, 'Test Direct Publisher', 'publisher')
  `);
  // Only the direct publisher has an enabled payout account.
  await exec(sql`
    INSERT INTO payout_accounts (owner_kind, owner_id, stripe_account_id, payouts_enabled)
    VALUES ('organization', ${directOrg}, 'acct_test_direct', true)
  `);
  // Song A: fully allocated (3334 + 6666 = 10000).
  await exec(sql`
    INSERT INTO track_publishing_splits (song_id, name, role, organization_id, percent_bp, position)
    VALUES (${songA}, 'Test Songs of Kaotic', 'Publisher', ${kaoticOrg}, 3334, 0),
           (${songA}, 'Test Direct Publisher', 'Publisher', ${directOrg}, 6666, 1)
  `);
  // Song B: UNDER-allocated (5000 only) → must surface as an issue.
  await exec(sql`
    INSERT INTO track_publishing_splits (song_id, name, role, organization_id, percent_bp, position)
    VALUES (${songB}, 'Test Songs of Kaotic', 'Publisher', ${kaoticOrg}, 5000, 0)
  `);
  // Song C: no splits at all → must surface as missing.
});

after(async () => {
  await exec(sql`DELETE FROM track_publishing_splits WHERE song_id IN (${songA}, ${songB}, ${songC})`);
  await exec(sql`DELETE FROM payout_accounts WHERE owner_id IN (${kaoticOrg}, ${hipgnosisOrg}, ${directOrg})`);
  await exec(sql`DELETE FROM organizations WHERE id IN (${kaoticOrg}, ${hipgnosisOrg}, ${directOrg})`);
  await exec(sql`DELETE FROM songs WHERE id IN (${songA}, ${songB}, ${songC})`);
  await exec(sql`DELETE FROM albums WHERE id = ${albumId}`);
  await pool.end();
});

test("aggregates per pay-to payee at statutory rate × units × share", async () => {
  const s = await computeAlbumPublishingSettlement(albumId, {
    unitsPressed: 500,
    rateMicros: 127_000,
  });

  assert.equal(s.rateMicros, 127_000);
  assert.equal(s.unitsPressed, 500);
  assert.equal(s.payees.length, 2, "Kaotic (→Hipgnosis) and Direct");

  // Kaotic routes to Hipgnosis: owner is the administrator org, but the
  // credit name stays Kaotic. A(3334) + B(5000) of 127000µ × 500 units.
  const kaotic = s.payees.find((p) => p.displayName.includes("Kaotic"));
  assert.ok(kaotic, "kaotic payee present");
  assert.equal(kaotic!.ownerId, hipgnosisOrg, "money routes to administrator");
  assert.match(kaotic!.payToName ?? "", /Hipgnosis/);
  assert.equal(kaotic!.lineCount, 2);
  assert.equal(kaotic!.hasPayoutAccount, false, "Hipgnosis not onboarded");
  // round(127000*500*0.3334/10000)=2117 ; round(127000*500*0.5/10000)=3175
  assert.equal(kaotic!.amountCents, 2117 + 3175);

  const direct = s.payees.find((p) => p.displayName.includes("Direct"));
  assert.ok(direct, "direct payee present");
  assert.equal(direct!.payToName, null);
  assert.equal(direct!.hasPayoutAccount, true);
  assert.equal(direct!.payoutsEnabled, true);
  // round(127000*500*0.6666/10000)=4233
  assert.equal(direct!.amountCents, 4233);

  assert.equal(s.totalCents, 2117 + 3175 + 4233);
});

test("flags under-allocated songs and songs missing splits", async () => {
  const s = await computeAlbumPublishingSettlement(albumId, {
    unitsPressed: 500,
    rateMicros: 127_000,
  });

  assert.equal(s.allocationIssues.length, 1);
  assert.equal(s.allocationIssues[0].songId, songB);
  assert.equal(s.allocationIssues[0].totalBp, 5000);

  assert.equal(s.songsMissingSplits.length, 1);
  assert.equal(s.songsMissingSplits[0].songId, songC);
});

test("zero units pressed yields a zero settlement but still flags data", async () => {
  const s = await computeAlbumPublishingSettlement(albumId, { unitsPressed: 0, rateMicros: 127_000 });
  assert.equal(s.totalCents, 0);
  assert.equal(s.payees.every((p) => p.amountCents === 0), true);
  // data-quality flags are independent of units
  assert.equal(s.allocationIssues.length, 1);
  assert.equal(s.songsMissingSplits.length, 1);
});

// Rounding must happen ONCE per payee, on the summed micros — not per split
// line. Here directOrg carries three half-cent-ish lines whose pre-rounded
// sum (3¢) differs from the correctly-rounded aggregate (2¢). This is the
// penny-drift bug the settlement system exists to prevent.
test("rounds per payee, not per split line (penny-drift guard)", async () => {
  const songD = id("songD");
  try {
    await exec(sql`
      INSERT INTO songs (id, album_id, title, track_number)
      VALUES (${songD}, ${albumId}, 'Song D', 4)
    `);
    // directOrg already has a 6666bp line on songA; add two 5000bp lines on
    // songD. At rate 10000µ × 1 unit: lines are 0.6666¢, 0.5¢, 0.5¢.
    //   per-line round: 1 + 1 + 1 = 3¢ (WRONG)
    //   per-payee round: round(16666µ / 10000) = round(1.6666) = 2¢ (RIGHT)
    await exec(sql`
      INSERT INTO track_publishing_splits (song_id, name, role, organization_id, percent_bp, position)
      VALUES (${songD}, 'Test Direct Publisher', 'Publisher', ${directOrg}, 5000, 0),
             (${songD}, 'Test Direct Publisher', 'Publisher', ${directOrg}, 5000, 1)
    `);
    const s = await computeAlbumPublishingSettlement(albumId, { unitsPressed: 1, rateMicros: 10_000 });
    const direct = s.payees.find((p) => p.displayName.includes("Direct"));
    assert.ok(direct, "direct payee present");
    assert.equal(direct!.lineCount, 3, "songA + two songD lines");
    assert.equal(direct!.amountCents, 2, "rounded once on summed micros, not per line");
  } finally {
    await exec(sql`DELETE FROM track_publishing_splits WHERE song_id = ${songD}`);
    await exec(sql`DELETE FROM songs WHERE id = ${songD}`);
  }
});
