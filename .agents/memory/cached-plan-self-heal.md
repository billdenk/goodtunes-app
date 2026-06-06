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
benefits for free. Callback-style `pool.query` calls pass through untouched (none
exist today, but the guard keeps it safe).

## Transactions ARE retried too (transaction-level, not statement-level)
`db.transaction(...)` does NOT route through the patched `pool.query` — drizzle
runs every statement of a tx on one dedicated checked-out client. A warm pooled
connection holding a stale plan therefore 500s the FIRST transactional write
after a publish with no recovery (this was the NPO donation-split "Save split"
500: `PUT /api/admin/albums/:id/npo-beneficiaries`, a DELETE + ON CONFLICT upsert
inside `db.transaction`).

Fix lives in `server/db.ts`: `transactionWithRetry(fn, config?, deps?)` plus a
module-level monkey-patch of `(db as any).transaction` that routes ALL callers
through it (no call-site changes, mirrors the `pool.query` patch). Key points:
- **Retry the WHOLE transaction, never a single statement.** A failed tx has
  already ROLLED BACK (nothing committed), so replaying the entire callback once
  cannot double-apply writes. A mid-tx statement retry would silently re-run
  against a dead/rolled-back tx — that's why statement-level retry is unsafe here.
- Each attempt checks out its OWN client and binds `drizzle(client, {schema})` to
  it — `drizzle(client)` uses that client directly and leaves release to us, the
  only way to DESTROY (`client.release(true)`) the poisoned connection instead of
  returning it to the pool the way `db.transaction` does on rollback.
- Bounded to ONE retry. A second cached-plan failure also destroys its connection
  but surfaces as a real error (no infinite loop).
- `deps` is a test seam (`connect` + `runOnClient`) defaulting to the real pool;
  regression tests in `server/db.errors.test.ts` assert: retry-once-then-succeed
  (connect twice, first `release(true)`), non-cached-plan errors NOT retried
  (connect once, `release(false)`), and a second 0A000 surfaces (both destroyed).
- Won't reproduce in dev (fresh connections never hold a stale plan); rely on the
  design + tests, not a local repro.

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
