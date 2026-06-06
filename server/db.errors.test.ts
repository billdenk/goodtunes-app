// Task #1126 — unit coverage for the DB error introspection helpers that
// power the post-deploy "cached plan" self-heal + the real-error alerting.
//
// These guard the two decisions everything else hangs off:
//   • describeDbError — unwrap drizzle's "Failed query:" wrapper to the real
//     Postgres error (SQLSTATE code + message + detail/constraint), so the
//     ops alert and [admin-list-error] log name the exact failure.
//   • isCachedPlanError — recognise ONLY the transient 0A000 "cached plan
//     must not change result type" failure so the DB layer retries it once
//     on a fresh connection without masking unrelated errors.
//
//   npx tsx --test server/db.errors.test.ts
//
// Importing ./db constructs a pg Pool but never connects (lazy), so these
// stay pure unit tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDbError, isCachedPlanError, transactionWithRetry } from "./db";

// A drizzle DrizzleQueryError look-alike: a wrapper Error whose `.cause` is
// the real pg error. This mirrors exactly what reaches the express error
// handler in production.
function drizzleWrap(cause: unknown): Error {
  const e = new Error("Failed query: SELECT * FROM songs params: ");
  (e as any).cause = cause;
  return e;
}

// A pg error carries a 5-char SQLSTATE in `code` plus message/detail/etc.
function pgError(fields: Record<string, unknown>): Error {
  const e = new Error(String(fields.message ?? "db error"));
  Object.assign(e, fields);
  return e;
}

// ── describeDbError ──────────────────────────────────────────────────

test("describeDbError: unwraps the pg error buried on .cause", () => {
  const err = drizzleWrap(
    pgError({
      code: "0A000",
      message: "cached plan must not change result type",
    }),
  );
  const info = describeDbError(err);
  assert.equal(info?.code, "0A000");
  assert.equal(info?.message, "cached plan must not change result type");
});

test("describeDbError: surfaces detail + constraint on a unique violation", () => {
  const err = drizzleWrap(
    pgError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "orders_pkey"',
      detail: "Key (id)=(abc) already exists.",
      constraint: "orders_pkey",
      table: "orders",
    }),
  );
  const info = describeDbError(err);
  assert.equal(info?.code, "23505");
  assert.equal(info?.detail, "Key (id)=(abc) already exists.");
  assert.equal(info?.constraint, "orders_pkey");
  assert.equal(info?.table, "orders");
});

test("describeDbError: finds the pg error directly (no wrapper)", () => {
  const info = describeDbError(pgError({ code: "42703", message: 'column "x" does not exist' }));
  assert.equal(info?.code, "42703");
});

test("describeDbError: returns null when there is no DB cause", () => {
  assert.equal(describeDbError(new Error("plain app error")), null);
  assert.equal(describeDbError(undefined), null);
  assert.equal(describeDbError("just a string"), null);
});

test("describeDbError: ignores non-SQLSTATE codes (e.g. node errno strings)", () => {
  // A socket error carries code "ECONNRESET" — not a 5-char SQLSTATE, so it
  // must NOT be mistaken for a Postgres error.
  const info = describeDbError(pgError({ code: "ECONNRESET", message: "socket hang up" }));
  assert.equal(info, null);
});

test("describeDbError: survives a self-referential cause chain", () => {
  const a: any = new Error("a");
  const b: any = new Error("b");
  a.cause = b;
  b.cause = a; // cycle
  assert.equal(describeDbError(a), null);
});

// ── isCachedPlanError ────────────────────────────────────────────────

test("isCachedPlanError: true for the 0A000 cached-plan message via .cause", () => {
  const err = drizzleWrap(
    pgError({ code: "0A000", message: "cached plan must not change result type" }),
  );
  assert.equal(isCachedPlanError(err), true);
});

test("isCachedPlanError: false for an unrelated 0A000 (generic feature_not_supported)", () => {
  const err = drizzleWrap(
    pgError({ code: "0A000", message: "cannot insert multiple commands into a prepared statement" }),
  );
  assert.equal(isCachedPlanError(err), false);
});

test("isCachedPlanError: false for other DB errors and plain errors", () => {
  assert.equal(isCachedPlanError(drizzleWrap(pgError({ code: "23505", message: "dup" }))), false);
  assert.equal(isCachedPlanError(new Error("nope")), false);
  assert.equal(isCachedPlanError(null), false);
});

// ── transactionWithRetry ─────────────────────────────────────────────
// Task #1354 — a transaction whose FIRST attempt fails with the post-deploy
// "cached plan" (0A000) error must replay the WHOLE callback once on a fresh
// connection. A failed tx has fully rolled back, so re-running is safe; the
// poisoned connection is destroyed (release(true)) so the pool can't hand it
// back. Any non-cached-plan error is NOT retried.

// A fake PoolClient that records how it was released (true = destroyed).
function fakeClient(releases: Array<{ id: number; destroy: boolean }>, id: number) {
  return {
    id,
    release(destroy?: boolean) {
      releases.push({ id, destroy: !!destroy });
    },
  } as any;
}

test("transactionWithRetry: replays the whole tx once on a fresh connection after a 0A000 error", async () => {
  const releases: Array<{ id: number; destroy: boolean }> = [];
  let nextId = 0;
  const connected: any[] = [];
  let attempts = 0;
  const cachedPlan = drizzleWrap(
    pgError({ code: "0A000", message: "cached plan must not change result type" }),
  );

  const result = await transactionWithRetry<string>(
    async () => "committed",
    undefined,
    {
      connect: async () => {
        const c = fakeClient(releases, nextId++);
        connected.push(c);
        return c;
      },
      runOnClient: async (_client, fn) => {
        attempts++;
        if (attempts === 1) throw cachedPlan; // first warm connection is poisoned
        return fn({} as any); // fresh connection commits
      },
    },
  );

  assert.equal(result, "committed");
  assert.equal(attempts, 2); // retried exactly once
  assert.equal(connected.length, 2); // the retry got a fresh connection
  // Poisoned connection destroyed; the retry connection returned cleanly.
  assert.deepEqual(releases, [
    { id: 0, destroy: true },
    { id: 1, destroy: false },
  ]);
});

test("transactionWithRetry: does NOT retry a non-cached-plan error", async () => {
  const releases: Array<{ id: number; destroy: boolean }> = [];
  let nextId = 0;
  let attempts = 0;
  const dup = drizzleWrap(pgError({ code: "23505", message: "duplicate key" }));

  await assert.rejects(
    transactionWithRetry(async () => "unused", undefined, {
      connect: async () => fakeClient(releases, nextId++),
      runOnClient: async () => {
        attempts++;
        throw dup;
      },
    }),
    /Failed query/,
  );

  assert.equal(attempts, 1); // never retried
  // Single connection, returned to the pool (not destroyed).
  assert.deepEqual(releases, [{ id: 0, destroy: false }]);
});

test("transactionWithRetry: a second 0A000 surfaces (only one retry) and destroys both connections", async () => {
  const releases: Array<{ id: number; destroy: boolean }> = [];
  let nextId = 0;
  let attempts = 0;
  const cachedPlan = drizzleWrap(
    pgError({ code: "0A000", message: "cached plan must not change result type" }),
  );

  await assert.rejects(
    transactionWithRetry(async () => "unused", undefined, {
      connect: async () => fakeClient(releases, nextId++),
      runOnClient: async () => {
        attempts++;
        throw cachedPlan; // both connections poisoned
      },
    }),
    /Failed query/,
  );

  assert.equal(attempts, 2); // one retry, then surfaced
  assert.deepEqual(releases, [
    { id: 0, destroy: true },
    { id: 1, destroy: true },
  ]);
});
