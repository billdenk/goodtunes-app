import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
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

export const db = drizzle(pool, { schema });
