// Task #2483 — guard the self-serve "Withdraw" of a change request against
// regressions in its server-side scoping. Task #2482 let an artist retract a
// change request THEY filed by mistake, but only while it's still pending.
// Because withdraw is a soft terminal status (kept for the audit trail, not a
// hard delete) that must also drop the row out of the operator review queue,
// a scoping regression would silently either:
//   • let an artist retract a TEAMMATE's request,
//   • retract one belonging to a DIFFERENT album than the endpoint's URL,
//   • or withdraw an ALREADY-REVIEWED (approved/rejected) request, corrupting
//     the audit trail and yanking a decided edit back out of history.
//
// This drives the shared authority helpers directly against a real Postgres.
// pending_changes has no FK constraints, so synthetic user/album ids keep the
// fixtures self-contained; every seeded row is torn down in `after`.
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test \
//     server/pendingChangeWithdraw.db.test.ts

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import {
  listMyChangeRequestsForAlbum,
  withdrawPendingChange,
  getPendingChange,
} from "./auth/partnerPermissions";

const id = (p: string) => `t2483-${p}-${randomUUID().slice(0, 8)}`;

// Two partners in (nominally) the same scope, two albums.
const userA = id("userA"); // the caller who filed the requests
const userB = id("userB"); // a teammate who filed one of their own
const albumX = id("albumX"); // the album whose endpoint we withdraw through
const albumY = id("albumY"); // a different album the caller also touches

// Row fixtures. A holds one of each status on albumX plus one pending on
// albumY; B holds one pending on albumX (to prove cross-user isolation).
const rPendingA = id("rPendingA"); // userA / albumX / pending  → withdrawable
const rApprovedA = id("rApprovedA"); // userA / albumX / approved → terminal
const rRejectedA = id("rRejectedA"); // userA / albumX / rejected → terminal
const rPendingAonY = id("rPendingAonY"); // userA / albumY / pending  → wrong album
const rPendingB = id("rPendingB"); // userB / albumX / pending  → not the caller's

const allRows = [rPendingA, rApprovedA, rRejectedA, rPendingAonY, rPendingB];

async function seedRow(
  rowId: string,
  userId: string,
  albumId: string,
  status: string,
) {
  await db.execute(sql`
    INSERT INTO pending_changes
      (id, target_table, target_id, album_id, scope_kind, scope_id, patch,
       submitted_by_user_id, status)
    VALUES
      (${rowId}, ${"albums"}, ${albumId}, ${albumId}, ${"artist"}, ${albumId},
       ${sql`'{"title":"x"}'::jsonb`}, ${userId}, ${status})
  `);
}

before(async () => {
  await seedRow(rPendingA, userA, albumX, "pending");
  await seedRow(rApprovedA, userA, albumX, "approved");
  await seedRow(rRejectedA, userA, albumX, "rejected");
  await seedRow(rPendingAonY, userA, albumY, "pending");
  await seedRow(rPendingB, userB, albumX, "pending");
});

after(async () => {
  try {
    await db.execute(
      sql`DELETE FROM pending_changes WHERE id IN (${sql.join(
        allRows.map((r) => sql`${r}`),
        sql`, `,
      )})`,
    );
  } finally {
    await pool.end();
  }
});

test("caller's list for the album shows their own rows across statuses, isolated from teammates and other albums", async () => {
  const rows = await listMyChangeRequestsForAlbum(userA, albumX);
  const ids = rows.map((r) => r.id);
  assert.ok(ids.includes(rPendingA), "own pending request is listed");
  assert.ok(ids.includes(rApprovedA), "own approved request is listed");
  assert.ok(ids.includes(rRejectedA), "own rejected request is listed");
  assert.ok(!ids.includes(rPendingB), "a teammate's request never leaks in");
  assert.ok(!ids.includes(rPendingAonY), "another album's request is not listed here");
});

test("an already-APPROVED request cannot be withdrawn (audit trail preserved)", async () => {
  const result = await withdrawPendingChange(rApprovedA, userA, albumX);
  assert.equal(result, null, "withdraw of an approved request returns null (rejected)");
  const row = await getPendingChange(rApprovedA);
  assert.equal(row?.status, "approved", "the approved status is left untouched");
});

test("an already-REJECTED request cannot be withdrawn", async () => {
  const result = await withdrawPendingChange(rRejectedA, userA, albumX);
  assert.equal(result, null, "withdraw of a rejected request returns null (rejected)");
  const row = await getPendingChange(rRejectedA);
  assert.equal(row?.status, "rejected", "the rejected status is left untouched");
});

test("a partner cannot withdraw a TEAMMATE's pending request", async () => {
  // userA tries to retract userB's still-pending request.
  const result = await withdrawPendingChange(rPendingB, userA, albumX);
  assert.equal(result, null, "cross-user withdraw returns null (rejected)");
  const row = await getPendingChange(rPendingB);
  assert.equal(row?.status, "pending", "the teammate's request stays pending");
});

test("a pending request cannot be withdrawn through the WRONG album's endpoint", async () => {
  // rPendingA belongs to albumX; attempting via albumX's endpoint on a request
  // that lives on albumY, and vice-versa, must both no-op.
  const wrongAlbum = await withdrawPendingChange(rPendingAonY, userA, albumX);
  assert.equal(wrongAlbum, null, "album-Y request can't be withdrawn via album-X url");
  const row = await getPendingChange(rPendingAonY);
  assert.equal(row?.status, "pending", "the album-Y request stays pending");
});

test("a caller CAN withdraw their own still-pending request, and it drops out of their list", async () => {
  const result = await withdrawPendingChange(rPendingA, userA, albumX);
  assert.ok(result, "withdraw of an own pending request returns the updated row");
  assert.equal(result?.status, "withdrawn", "the row is soft-marked withdrawn, not deleted");

  const row = await getPendingChange(rPendingA);
  assert.ok(row, "the row is KEPT in the DB (audit trail), not hard-deleted");
  assert.equal(row?.status, "withdrawn", "its persisted status is withdrawn");

  const rows = await listMyChangeRequestsForAlbum(userA, albumX);
  const ids = rows.map((r) => r.id);
  assert.ok(!ids.includes(rPendingA), "the withdrawn request drops out of the artist's list");
  assert.ok(ids.includes(rApprovedA), "reviewed rows still remain in the list");
});

test("a request that is already WITHDRAWN cannot be withdrawn again", async () => {
  // rPendingA was withdrawn by the previous test; re-withdrawing must no-op
  // (it's no longer status='pending').
  const result = await withdrawPendingChange(rPendingA, userA, albumX);
  assert.equal(result, null, "double-withdraw returns null");
});
