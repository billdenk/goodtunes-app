---
name: Observability — health probe + ops alerting
description: How prod outages surface (DB-aware health check + 5xx email alerts) and the deliberate v1 tradeoffs baked in.
---

# Health probe + ops alerting

A prod fan-login outage once went unnoticed until users reported it (a dev→prod
schema-drift 500 on `POST /api/auth/*`). The prior alarm only watched **admin GET
5xx → PostHog**, so auth/customer 5xx fell through. Two pieces close that gap.

## `GET /api/health`
DB-aware liveness for external uptime monitors. Verifies process up **and** DB
reachable, so "server up but DB dead" reads DOWN not OK. Mounted before host
redirect/auth so any monitor on any host gets straight JSON. 200 `{status:ok,db:ok}`
/ 503 `{status:error,db:unreachable}`.

**Rule:** keep it cheap and bounded. The DB probe must be double-bounded — an
overall response deadline **and** a driver-level `statement_timeout` on a dedicated
client that is always released. A bare `Promise.race([pool.query(...), timeout])`
leaks the losing query and ties up pool connections, so repeated monitor pings
*amplify* a DB outage instead of just reporting it.
**Rule:** never return raw error text on this unauthenticated endpoint — sanitized
code in the body, verbose reason to server log + alert only.

## Ops alerting (`alertOps`)
Fire-and-forget email on **any** `/api` 5xx, wired in the `res.on("finish")` logger
(post-response, so it can never affect the request). Recipient `OPS_ALERT_EMAIL`
→ `MAIL_REPLY_TO` fallback; reuses the existing Resend transport. Prod-only send;
dev/no-recipient just logs what *would* have paged.

**Why per-instance in-memory throttle (cooldown per signature + hourly cap):** v1
chose zero new schema over cluster-global dedup. Under autoscale, multiple instances
can each send one per window — accepted as "slightly noisy beats silent." If incident
noise ever justifies it, move dedup/cap to shared state (DB/Redis); don't add a table
just for this otherwise.
**Apply:** anything that should page on-call should raise its status to 5xx (or call
`alertOps` directly) — the net is status-code-driven, not route-list-driven, so it
won't silently miss a new route the way the old admin-only alarm did.

## Sentry error tracking (`server/instrument.ts`)
Replit has **no Sentry integration** — it runs on a manual `SENTRY_DSN` secret.
`instrument.ts` is imported as the **first** line of `server/index.ts` (before express)
and inits only when `SENTRY_DSN` is set **and** `NODE_ENV=production`; otherwise every
`Sentry.*` call is a safe no-op, so the app runs identically with or without the secret.

**Rule — attach request context by hand, don't trust auto-instrumentation.** The prod
server is **bundled** (`script/build.ts`, `bundle:true`), and Sentry's OpenTelemetry
auto-instrumentation patches modules at load time, which is unreliable once express is
bundled into `dist/index.cjs`. So the global error handler wraps capture in
`Sentry.withScope` and sets method/url/host explicitly before `captureException` — that
way every event carries which route threw regardless of bundling. Only 5xx are captured
(skip 4xx noise); `alertOps` email remains the catch-all page, Sentry is the stack-trace
detail layer.
**Verify:** `@sentry/node` bundles fine (`npm run build` → `dist/index.cjs`); no esbuild
externals needed. Full prod validation (event has request context) needs a real DSN +
forced 500 against the built server.

## Per-instance pg pool cap (`server/db.ts`)
On Replit autoscale each instance owns its **own** pool, so total DB connections =
instances × pool max. Pool is capped `max=PG_POOL_MAX||5` (conservative default) with
`connectionTimeoutMillis 10s`, `idleTimeoutMillis 30s`, `keepAlive`.
**Rule:** keep a `pool.on("error")` listener — an unhandled error on an *idle* pooled
client (e.g. Postgres drops the connection) otherwise crashes the whole instance.
**Apply:** when raising `PG_POOL_MAX`, budget it against peak instance count × max vs the
Postgres connection ceiling, or a traffic spike that fans out instances exhausts the DB.
