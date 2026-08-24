# GoodTunes platform — technical brief for MRP's CTO

Prepared for Memphis Record Pressing (MRP), August 2026.
Every statement below reflects the platform as built today. Where something is
configurable or dependent on setup, we say so rather than overclaim.

## Hosting & uptime

- GoodTunes runs on **Replit Autoscale**, backed by Google Cloud
  infrastructure. Instances scale automatically with traffic; deploys are
  health-checked (Replit's deploy probe must get a healthy response before a
  new build is promoted).
- We do **not** publish an independent formal SLA document. Uptime rides
  Replit Autoscale + Google Cloud availability. What we provide instead is an
  externally monitorable health endpoint (below) so any uptime monitor MRP
  chooses can watch the platform directly.

## Monitoring & alerting

- **Health endpoint:** an unauthenticated `GET /api/health` verifies both the
  process and the database (a live DB probe with bounded timeouts — an overall
  4-second deadline plus a driver-level statement timeout — so a dead database
  reports DOWN rather than hanging). It also reports coarse transactional-mail
  health, uptime, and probe latency.
- **Error tracking:** Sentry is wired into production for server-side error
  capture.
- **Operator alerting:** any server-side 5xx on an API route automatically
  emails the on-call operator with the route, status, timing, and the
  underlying database error where applicable. Alerts are throttled (one email
  per distinct fault per 15-minute window, with a global hourly cap) so a
  fault pages once instead of flooding.

## Data & storage

- **Database:** PostgreSQL, accessed through the Drizzle ORM. Development and
  production run against **separate databases** — production data is never
  touched by development work.
- **File storage:** Replit Object Storage, which is backed by **Google Cloud
  Storage**. Uploads go directly to storage via **signed upload URLs that
  expire after 15 minutes**; stored objects live under private paths and are
  served only through our application routes, which enforce access control
  per request. Storage capacity is effectively elastic GCS — we impose no hard
  cap of our own.

## Streaming security (audio masters)

- **Masters are never served as raw files to fans.** Fan playback is
  exclusively **Mux signed HLS**: the server mints a signed playback URL with
  a **1-hour JWT** against a signed playback policy, and ownership is checked
  before any URL is minted. If signing fails, playback stops — there is no
  fallback to the raw file.
- Mux webhooks (asset-ready notifications, etc.) are **signature-verified**;
  production rejects unsigned webhook payloads.

## Application security

- **Admin authentication** is hardened with **email one-time-code 2FA** and
  trusted-device cookies, on top of password auth.
- **Server-side fetches of pasted URLs are SSRF-guarded** (host checks,
  private-IP blocking, redirect/content-type/size/timeout limits), so a
  user-supplied link can never be used to reach internal infrastructure.
- **Native apps** (iOS/Android) add **certificate pinning** — pinned to the
  long-lived ISRG (Let's Encrypt) roots, scoped to GoodTunes hosts only, with
  a documented anti-brick rotation runbook — and offline downloads are
  **AES-GCM encrypted at rest** on device under a non-extractable key.

## Stripe / payment security posture

- **Card data never touches our servers.** Payment forms are Stripe Embedded
  Checkout, owned end-to-end by Stripe. We store only the card brand, last
  four digits, wallet type, and receipt URL.
- **All prices are computed server-side.** The client cannot manipulate
  amounts — line prices, shipping, and tax are resolved on the server before
  any Stripe session is created.
- **Stripe webhooks are signature-verified** against the raw request bytes
  (`stripe.webhooks.constructEvent`); production rejects unsigned events.
  Order state is webhook-authoritative and every Stripe-keyed write is
  idempotent, so replays cannot double-charge or double-unlock.

## Redundancy & failure posture

- Autoscale runs multiple instances as load requires; deploys promote only
  after a health probe passes.
- Storage durability is Google Cloud Storage's; the database is a managed
  PostgreSQL service separate from the application instances.
- The platform's design bias is **fail closed and fail loud**: signing
  failures stop playback rather than degrade to insecure delivery, unsigned
  webhooks are rejected, and 5xx faults page an operator automatically.

## Honest limits

- No independent formal SLA; availability is that of Replit Autoscale +
  Google Cloud, observable via `/api/health`.
- Operational alerting is email-based (throttled), not a paging service;
  Sentry provides error detail.
- Some throttles/schedulers are per-instance under autoscale (an accepted
  tradeoff documented in the codebase — slightly noisy beats silent).
