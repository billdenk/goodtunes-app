// Task #774 — Catch broken database queries before they reach customers.
//
// The early-cut and press-portal flows are built on hand-written SQL
// (`db.execute(sql`...`)`). tsc can't see inside those template literals, so a
// renamed or mistyped column ships silently — exactly how Task #772's early-cut
// 500 happened (`column o.paid_at does not exist`, only caught in production
// Sentry).
//
// This script EXPLAINs the *exact* query builders production runs. EXPLAIN
// (without ANALYZE) parses and plans the statement — Postgres resolves every
// column reference at plan time — but never executes it, so it:
//   - validates column references against the real schema,
//   - works on an empty DB (no seeded rows / no paid orders required),
//   - is safe for write statements too (INSERT/UPDATE are planned, not run).
//
// Add a new entry to SMOKE_QUERIES whenever you add a raw-SQL query to these
// flows. Run with: `tsx scripts/db-query-smoke.ts`.

import { sql, type SQL } from "drizzle-orm";
import { db, pool } from "../server/db";
import { pgArray } from "../server/lib/pgArray";
import {
  sqlResolveAlbumPressTier,
  sqlUnitsSoldForAlbum,
  sqlEarlyCutAlbumGates,
  sqlPressAutoTriggerConsent,
  sqlAccruedCentsForOrder,
} from "../server/earlyCut";
import {
  sqlEarmarkedCentsForAlbum,
  sqlMastersThresholdForAlbum,
  sqlMastersThresholdFallback,
  sqlLockedQuoteForAlbum,
  sqlPressCustomers,
  sqlPressCustomerAlbums,
  sqlPressSummaryCounts,
  sqlPressSummaryStages,
  sqlPressPipeline,
  sqlPaidPaymentIntentsForAlbum,
  sqlEarlyCutPoolsForPress,
  sqlPressAcceptedCustomers,
  sqlBackfillPersonContactEmail,
  sqlInsertPressInvitedPerson,
  sqlInsertStartAlbumPerson,
  sqlMastersReadyNotifyRow,
} from "../server/pressPortal";
import { sqlNpoInsertReferredPerson } from "../server/npoPortal";
import {
  sqlConnectedAlbums,
  sqlNpoArtistAlbums,
  sqlNpoAlbumLedger,
} from "../server/adminAlbumQueries";
import {
  sqlPartnerInviteList,
  sqlPartnerOutstandingInviteToEmail,
  sqlStampReferredByPerson,
  sqlStampReferredByOrg,
  sqlOpenArtistReferral,
  sqlAmbassadorOrg,
  sqlPlaceholderScopeInUseCount,
  sqlPersonIdByContactEmail,
} from "../server/partnerInvites";

// Stable dummy bind values — content is irrelevant because EXPLAIN never
// executes the query; only the column/table references are validated.
const ALBUM = "00000000-0000-0000-0000-000000000000";
const PRESS = "00000000-0000-0000-0000-000000000001";
const ORDER = "00000000-0000-0000-0000-000000000002";
const ORG = "00000000-0000-0000-0000-000000000003";

const SMOKE_QUERIES: { name: string; sql: SQL }[] = [
  // server/earlyCut.ts
  { name: "earlyCut.resolveAlbumPressTier", sql: sqlResolveAlbumPressTier(ALBUM) },
  { name: "earlyCut.unitsSoldForAlbum", sql: sqlUnitsSoldForAlbum(ALBUM) },
  { name: "earlyCut.albumGates", sql: sqlEarlyCutAlbumGates(ALBUM) },
  { name: "earlyCut.pressAutoTriggerConsent", sql: sqlPressAutoTriggerConsent(PRESS) },
  { name: "earlyCut.accruedCentsForOrder", sql: sqlAccruedCentsForOrder(ALBUM, ORDER) },
  // server/pressPortal.ts
  { name: "pressPortal.earmarkedCentsForAlbum", sql: sqlEarmarkedCentsForAlbum(ALBUM) },
  { name: "pressPortal.mastersThresholdForAlbum", sql: sqlMastersThresholdForAlbum(ALBUM, PRESS) },
  { name: "pressPortal.mastersThresholdFallback", sql: sqlMastersThresholdFallback(PRESS) },
  { name: "pressPortal.lockedQuoteForAlbum", sql: sqlLockedQuoteForAlbum(ALBUM, PRESS) },
  { name: "pressPortal.customers", sql: sqlPressCustomers(PRESS) },
  { name: "pressPortal.customerAlbums", sql: sqlPressCustomerAlbums(PRESS, "artist", ALBUM) },
  { name: "pressPortal.summaryCounts", sql: sqlPressSummaryCounts(PRESS) },
  { name: "pressPortal.summaryStages", sql: sqlPressSummaryStages(PRESS) },
  { name: "pressPortal.pipeline", sql: sqlPressPipeline(PRESS) },
  { name: "pressPortal.paidPaymentIntentsForAlbum", sql: sqlPaidPaymentIntentsForAlbum(ALBUM) },
  { name: "pressPortal.earlyCutPoolsForPress", sql: sqlEarlyCutPoolsForPress(PRESS) },
  // Press + NPO invite flows — these previously referenced phantom
  // people.email / people.created_at columns and 500'd invites in prod
  // (people only has contact_email, and no created_at).
  { name: "pressPortal.acceptedCustomers", sql: sqlPressAcceptedCustomers(PRESS) },
  { name: "pressPortal.backfillPersonContactEmail", sql: sqlBackfillPersonContactEmail(PRESS, "nobody@example.com") },
  { name: "pressPortal.insertInvitedPerson", sql: sqlInsertPressInvitedPerson("Smoke Test", "nobody@example.com", PRESS) },
  {
    name: "pressPortal.insertStartAlbumPerson",
    sql: sqlInsertStartAlbumPerson({
      name: "Smoke Test",
      emailLower: "nobody@example.com",
      pressId: PRESS,
      photoUrl: null,
      bio: null,
      spotifyUrl: null,
      appleMusicUrl: null,
      itunesArtistId: null,
    }),
  },
  { name: "pressPortal.mastersReadyNotifyRow", sql: sqlMastersReadyNotifyRow(PRESS, ALBUM, PRESS) },
  { name: "partnerInvites.personIdByContactEmail", sql: sqlPersonIdByContactEmail("nobody@example.com") },
  { name: "npoPortal.insertReferredPerson", sql: sqlNpoInsertReferredPerson("Smoke Test", "nobody@example.com", ORG) },
  // server/adminAlbumQueries.ts
  { name: "adminAlbumQueries.connectedAlbums", sql: sqlConnectedAlbums([ALBUM]) },
  { name: "adminAlbumQueries.npoArtistAlbums", sql: sqlNpoArtistAlbums([ALBUM]) },
  { name: "adminAlbumQueries.npoAlbumLedger", sql: sqlNpoAlbumLedger(ORG) },
  // server/partnerInvites.ts — Task #952/#964 self-serve invite reads.
  { name: "partnerInvites.inviteList(artist)", sql: sqlPartnerInviteList("artist", ORG) },
  { name: "partnerInvites.inviteList(label)", sql: sqlPartnerInviteList("label", ORG) },
  { name: "partnerInvites.outstandingToEmail(artist)", sql: sqlPartnerOutstandingInviteToEmail("artist", "nobody@example.com", ORG) },
  { name: "partnerInvites.outstandingToEmail(label)", sql: sqlPartnerOutstandingInviteToEmail("label", "nobody@example.com", ORG) },
  // server/partnerInvites.ts — Task #966 accept/revoke side-effect SQL.
  { name: "partnerInvites.stampReferredByPerson", sql: sqlStampReferredByPerson(ALBUM, PRESS) },
  { name: "partnerInvites.stampReferredByOrg", sql: sqlStampReferredByOrg(ALBUM, ORG) },
  { name: "partnerInvites.openArtistReferral", sql: sqlOpenArtistReferral(PRESS, ALBUM) },
  { name: "partnerInvites.ambassadorOrg", sql: sqlAmbassadorOrg(PRESS) },
  { name: "partnerInvites.placeholderScopeInUseCount(artist)", sql: sqlPlaceholderScopeInUseCount("artist", ORG, ORDER) },
  { name: "partnerInvites.placeholderScopeInUseCount(label)", sql: sqlPlaceholderScopeInUseCount("label", ORG, ORDER) },
  // server/routes.ts — Task #1787 artist-scoped Gear list. Instruments are only
  // credited per-track via track_performers; album_credits has no instrument_id.
  {
    name: "routes.artistScopedInstrumentIds",
    sql: sql`
      SELECT DISTINCT tp.instrument_id FROM track_performers tp
      JOIN songs s ON s.id = tp.song_id
      WHERE s.album_id = ANY(${pgArray([ALBUM])}) AND tp.instrument_id IS NOT NULL
    `,
  },
];

async function main() {
  const failures: { name: string; error: string }[] = [];

  for (const q of SMOKE_QUERIES) {
    try {
      await db.execute(sql`EXPLAIN ${q.sql}`);
      console.log(`  ✓ ${q.name}`);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      failures.push({ name: q.name, error: msg });
      console.error(`  ✗ ${q.name}\n      ${msg.replace(/\n/g, "\n      ")}`);
    }
  }

  console.log(
    `\ndb-query-smoke: ${SMOKE_QUERIES.length - failures.length}/${SMOKE_QUERIES.length} queries valid`,
  );

  await pool.end();

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} raw SQL ${failures.length === 1 ? "query references" : "queries reference"} a column/table that does not exist. ` +
        `Fix the query (or the column name) before merging — these would 500 in production.`,
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("db-query-smoke crashed:", e);
  process.exit(1);
});
