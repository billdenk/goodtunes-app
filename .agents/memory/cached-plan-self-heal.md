---
name: Cached-plan self-heal + DB error unwrapping
description: How post-deploy 0A000 "cached plan" 500s are auto-recovered and how the real pg error reaches alerts/logs.
---

# Post-deploy "cached plan" 500s + real DB error visibility

## Two facts to know
1. **Drizzle hides the real pg error.** Every failure surfaces as a
   `DrizzleQueryError` whose `.message` is just `Failed query: <sql> params: …`.
   The actual Postgres error (SQLSTATE `code`, human `message`,
   `detail`/`constraint`/`table`/`column`) lives on `err.cause`. Anything that
   reports/logs a 5xx must unwrap the cause chain or it logs noise.
2. **node-postgres + drizzle issue UNNAMED prepared statements** (no client-side
   plan cache to disable). The 0A000 "cached plan must not change result type"
   failure therefore originates server-side on a long-lived pooled connection
   after a publish runs `ALTER TABLE … ADD COLUMN`. It is transient and self-heals
   the moment that connection is recycled.

## The fix (server/db.ts)
- `describeDbError(err)` / `isCachedPlanError(err)` walk `err.cause` (cycle-safe,
  array helper — NOT a generator: the tsconfig target rejects generator iteration).
  `describeDbError` only accepts a cause whose `code` is a 5-char SQLSTATE so node
  errno strings like `ECONNRESET` aren't mistaken for pg errors. `isCachedPlanError`
  matches the **message text**, not the bare `0A000` code (0A000 is the generic
  `feature_not_supported` class — matching the code alone would mask real errors).
- `pool.query` is monkey-patched: it checks out a client, runs the query, and on a
  cached-plan error `client.release(true)` (DESTROY, don't return the poisoned plan
  to the pool) then retries ONCE on a fresh connection. Bounded to one retry.

**Why centralize at `pool.query`:** drizzle's `db.select()`/`db.execute()` and all
direct `pool.query()` calls route through it, so every non-transactional caller
benefits for free. **Transactions are intentionally NOT retried** — they run on a
dedicated checked-out client (not `pool.query`), and a mid-tx retry would silently
re-run against a rolled-back transaction. Callback-style `pool.query` calls pass
through untouched (none exist today, but the guard keeps it safe).

## Real error → alerts/logs (server/index.ts)
The express error handler stashes `describeDbError(err)` on `res.locals.dbError`.
The request-logger's `res.on("finish")` handler reads it and appends SQLSTATE +
message + detail/constraint to BOTH the `[admin-list-error]` JSON log and the
ops-alert email `detail`. Falls back to the old `capturedJsonResponse.message`
when there's no DB cause (routes that `res.status(500).json()` directly).

## Background loops
Mux reconcile/backfill, sale-window, trash sweep, payout digest, gift scheduler
all already wrap each tick in try/catch(/finally) + an in-process overlap guard,
so a thrown query error logs and the loop continues. They also benefit from the
`pool.query` retry because they query through drizzle.
