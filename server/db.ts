import { Pool, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgTransactionConfig } from "drizzle-orm/pg-core";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — provision the Replit database first.");
}

// Per-instance connection pool. On Replit autoscale every running instance
// builds its OWN pool, so the real ceiling is (instances × max) against
// Postgres's connection limit. A spike that scales us out can therefore
// exhaust the database and make EVERY instance start failing — an outage we
// inflict on ourselves on our best traffic day. So we keep `max` deliberately
// small per instance (override with PG_POOL_MAX only if the DB tier grows)
// and fail fast on acquisition rather than hanging a request forever when the
// pool is saturated — which also keeps /api/health honest under load.
const poolMax = parseInt(process.env.PG_POOL_MAX || "5", 10);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 5,
  connectionTimeoutMillis: 10_000, // give up acquiring a connection after 10s
  idleTimeoutMillis: 30_000, // release idle connections so scaled-down instances free them
  keepAlive: true, // survive idle NAT/proxy timeouts on long-lived sockets
});

// A pool-level error (e.g. the DB dropped an idle connection) is emitted on
// the pool, not on any one query. Without this listener Node treats it as an
// unhandled 'error' event and crashes the whole instance. Log and let the
// pool recover the connection on the next checkout.
pool.on("error", (err) => {
  console.error(`[db] idle client error: ${err?.message ?? err}`);
});

// safeConnect wraps pool.connect() and attaches a no-op 'error' listener to
// the checked-out client before returning it. When a client is actively held
// (checked out from the pool) and the database server drops the underlying
// TCP connection, pg emits the 'error' event on the CLIENT object, not the
// pool. Without a listener on the client, Node escalates it to
// process.uncaughtException → fatal crash. The pool.on("error") handler above
// only covers IDLE clients sitting in the pool, not checked-out ones.
// Using safeConnect() everywhere pool.connect() is called centrally prevents
// that crash path: the error is logged, the client is released, and the
// in-flight query rejects normally so the caller can handle it.
export async function safeConnect(): Promise<PoolClient> {
  const client = await pool.connect();
  client.on("error", (err) => {
    console.error(`[db] active client error: ${err?.message ?? err}`);
  });
  return client;
}

// ─── DB error introspection ──────────────────────────────────────────
//
// Drizzle wraps every failure in a `DrizzleQueryError` whose `.message` is
// just `Failed query: <sql> params: …` — the real Postgres error (SQLSTATE
// `code`, the human `message`, `detail`/`constraint`) lives on `.cause`.
// Both `describeDbError` and `isCachedPlanError` walk that cause chain so
// callers never have to know how deep the real error is buried.

export type DbErrorInfo = {
  code?: string;
  message: string;
  detail?: string;
  constraint?: string;
  table?: string;
  column?: string;
};

function causeChain(err: unknown): any[] {
  const chain: any[] = [];
  let cur: any = err;
  const seen = new Set<any>();
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    cur = cur.cause;
  }
  return chain;
}

// Unwrap an error to the underlying Postgres error and surface SQLSTATE +
// message + detail/constraint. Returns null when there is no DB cause in
// the chain so callers can fall back to their existing message.
export function describeDbError(err: unknown): DbErrorInfo | null {
  for (const cur of causeChain(err)) {
    // A `pg` error carries a 5-char SQLSTATE in `code` (e.g. "0A000",
    // "23505"). That's the reliable signal that we've reached the real
    // Postgres error rather than drizzle's wrapper.
    if (typeof cur.code === "string" && /^[0-9A-Z]{5}$/.test(cur.code)) {
      return {
        code: cur.code,
        message: String(cur.message ?? ""),
        detail: cur.detail ? String(cur.detail) : undefined,
        constraint: cur.constraint ? String(cur.constraint) : undefined,
        table: cur.table ? String(cur.table) : undefined,
        column: cur.column ? String(cur.column) : undefined,
      };
    }
  }
  return null;
}

// True only for the specific "cached plan must not change result type"
// failure (SQLSTATE 0A000 with that message). We match on the message text
// rather than the bare 0A000 code — 0A000 is the generic
// `feature_not_supported` class, so retrying every 0A000 would mask real
// errors. This one is transient and self-heals on a fresh connection.
export function isCachedPlanError(err: unknown): boolean {
  for (const cur of causeChain(err)) {
    const msg = typeof cur.message === "string" ? cur.message : "";
    if (msg.includes("cached plan must not change result type")) return true;
  }
  return false;
}

// ─── Self-heal from post-deploy "cached plan" 500s ───────────────────
//
// After a production publish runs `ALTER TABLE … ADD COLUMN`, any long-
// lived pooled connection still holding a server-side cached plan for a
// full-column SELECT starts failing with 0A000 ("cached plan must not
// change result type") until that connection is recycled. The textbook
// victims are long-running list/analytics queries and background interval
// sweeps that hit the same warm connection for hours after a deploy.
//
// We wrap the pool's `query` so that when a query hits that error we:
//   1. discard the offending connection (release(true) destroys it rather
//      than returning the poisoned plan cache to the pool), and
//   2. retry the SAME query once on a fresh connection.
// Bounded to a single retry so a genuinely broken query still surfaces.
//
// Why not just disable prepared-statement plan caching? node-postgres only
// caches plans for *named* prepared statements, and drizzle issues unnamed
// statements by default, so there is no client-side cache to turn off — the
// stale plan lives server-side on the connection. Recycling the connection
// is therefore the durable fix, and it also covers the pgbouncer/managed-
// pooler case where the same 0A000 originates outside our process.
//
// Drizzle's normal queries and `db.execute()` route through `pool.query`,
// so wrapping it here covers every non-transactional caller centrally.
// Queries inside an explicit transaction run on a dedicated checked-out
// client (not pool.query), so they are NOT retried here. We must never
// retry a single statement mid-transaction — that would re-run against a
// rolled-back tx. Instead, transactions get their OWN top-level retry that
// re-runs the ENTIRE callback once on a fresh connection (see
// `transactionWithRetry` + the `db.transaction` patch below).
const originalPoolQuery = pool.query.bind(pool);
(pool as any).query = function patchedQuery(this: unknown, ...args: any[]) {
  // Callback-style callers manage their own flow; never rewrite those.
  const last = args[args.length - 1];
  if (typeof last === "function") {
    return (originalPoolQuery as any)(...args);
  }
  return (async () => {
    const client = await safeConnect();
    let discarded = false;
    try {
      return await (client.query as any)(...args);
    } catch (err) {
      if (isCachedPlanError(err)) {
        // Destroy the connection carrying the stale plan, then retry once
        // on a fresh one. Anything still failing is a real error.
        discarded = true;
        client.release(true);
        console.warn(
          "[db] cached-plan mismatch (0A000) — recycled connection and retrying query once",
        );
        const fresh = await safeConnect();
        try {
          return await (fresh.query as any)(...args);
        } finally {
          fresh.release();
        }
      }
      throw err;
    } finally {
      if (!discarded) client.release();
    }
  })();
} as typeof pool.query;

export const db = drizzle(pool, { schema });

// ─── Transaction-level cached-plan self-heal ─────────────────────────
//
// The `pool.query` patch above can't cover an explicit transaction: a
// transaction runs every statement on ONE checked-out client, and retrying
// a single statement mid-transaction would silently re-run it against a
// rolled-back tx. So after a publish runs `ALTER TABLE … ADD COLUMN`, the
// first transactional write on a warm pooled connection holding a stale
// plan throws 0A000 ("cached plan must not change result type") with no
// retry — exactly the NPO donation-split Save 500 (Task #1354).
//
// We retry at the TRANSACTION level instead: when the FIRST attempt fails
// with the cached-plan error, the whole transaction has already ROLLED BACK
// (nothing committed), so re-running the entire callback once cannot
// double-apply writes. We destroy the connection carrying the stale plan
// (so the pool can't hand it back) and replay the callback once on a fresh
// connection. Bounded to a single retry — any second failure surfaces as a
// real error.
//
// Each attempt runs on a client we check out ourselves and bind a drizzle
// instance to (`drizzle(client)` uses that client directly and leaves the
// release to us — verified against drizzle-orm/node-postgres), which is the
// only way to DESTROY the poisoned connection rather than return it to the
// pool the way `db.transaction` does on rollback.

// The `tx` object drizzle hands the transaction callback (independent of
// the callback's return type), derived from the real `db.transaction` so it
// stays in lock-step with the schema/driver.
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type TransactionDeps = {
  connect: () => Promise<PoolClient>;
  runOnClient: <T>(
    client: PoolClient,
    fn: (tx: DbTransaction) => Promise<T>,
    config?: PgTransactionConfig,
  ) => Promise<T>;
};

const defaultTransactionDeps: TransactionDeps = {
  connect: () => safeConnect(),
  runOnClient: (client, fn, config) =>
    drizzle(client, { schema }).transaction(fn, config),
};

export async function transactionWithRetry<T>(
  fn: (tx: DbTransaction) => Promise<T>,
  config?: PgTransactionConfig,
  // Test seam — defaults to a real checked-out client per attempt.
  deps: TransactionDeps = defaultTransactionDeps,
): Promise<T> {
  const client = await deps.connect();
  let poisoned = false;
  try {
    return await deps.runOnClient(client, fn, config);
  } catch (err) {
    if (!isCachedPlanError(err)) throw err;
    // Destroy the connection carrying the stale plan, then replay the whole
    // (already rolled-back) transaction once on a fresh connection.
    poisoned = true;
    client.release(true);
    console.warn(
      "[db] cached-plan mismatch (0A000) inside transaction — recycled connection and retrying transaction once",
    );
    const fresh = await deps.connect();
    let freshPoisoned = false;
    try {
      return await deps.runOnClient(fresh, fn, config);
    } catch (err2) {
      // A second cached-plan failure still poisons its connection — destroy
      // it too, but don't retry again: this surfaces as a real error.
      if (isCachedPlanError(err2)) freshPoisoned = true;
      throw err2;
    } finally {
      fresh.release(freshPoisoned);
    }
  } finally {
    if (!poisoned) client.release();
  }
}

// Route every `db.transaction(...)` caller through the retry path centrally,
// mirroring the `pool.query` patch above so all transactional writers get
// the same post-deploy resilience with no call-site changes. The retry runs
// the callback on its own `drizzle(client)` instance, so this never recurses
// into the patched method.
(db as any).transaction = function patchedTransaction(
  this: unknown,
  fn: (tx: DbTransaction) => Promise<unknown>,
  config?: PgTransactionConfig,
) {
  return transactionWithRetry(fn, config);
};
