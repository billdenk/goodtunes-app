# GoodTunes® — Technology & Robustness Brief

*Updated June 8, 2026.*

> **Who this is for.** This is the document Bill reads from — or hands over — when someone asks *"what's it built on, and is it actually robust?"* The audiences, and the section each one cares about most:
> - **A Press CEO or CTO sizing up whether GoodTunes is real, production-grade software** → start with [Why it's robust](#why-its-robust).
> - **An investor or non-technical asker who just wants the gist** → the [one-paragraph answer](#the-one-paragraph-answer) is enough.
> - **An engineer who wants the stack** → [The stack, layer by layer](#the-stack-layer-by-layer).
> - **Someone skeptical that AI-assisted code can be trusted** → [Built with AI — does that matter?](#built-with-ai--does-that-matter)
> - **An acquirer's technical due-diligence team** → [For acquirers / due diligence](#for-acquirers--due-diligence).
>
> **See also:** [`investor-one-pager.md`](./investor-one-pager.md) for the features-and-integrations one-pager, and [`../capabilities.md`](../capabilities.md) for the full catalog of what's shipped. This brief is the *how it's built and why you can trust it* companion to those — it deliberately does **not** re-list features.

---

## The one-paragraph answer

GoodTunes is a conventional, modern web application: a **React** front end, a **Node.js / Express** back end, and a **PostgreSQL** database, written end-to-end in **TypeScript** and hosted on **Replit**. The hard parts that move money or protect masters aren't built in-house — they run on the same industry-standard services larger companies use: **Stripe** for payments and artist payouts, **Mux** for encrypted, signed audio and video streaming (so masters never leave as a downloadable file), and durable cloud **object storage** that survives every redeploy. Every change is version-controlled and runs through a suite of automated checks before it ships. In short: it's an ordinary, well-understood stack assembled the way a professional team would assemble it — nothing exotic, nothing locked-in, nothing held together with mocks.

---

## The stack, layer by layer

Each line names the technology, what it does here, and why it's a mainstream, defensible choice an engineer would recognize.

### Front end (what fans and operators see)
- **React + TypeScript** — the most widely-used UI framework on the web, with static typing so whole classes of bugs are caught before code runs. The same codebase renders the fan player and the admin/CMS.
- **Vite** — the modern standard build tool for React apps; fast builds, standard output.
- **Tailwind CSS + shadcn/ui** — a conventional utility-first styling system on top of accessible, unstyled component primitives (Radix UI). Standard, not bespoke.
- **TanStack Query** — the de-facto data-fetching/caching library for React, so the UI stays in sync with the server without hand-rolled state plumbing.
- **Wouter** — a small, standard client-side router.
- **Capacitor** — wraps the *same* web app as native iOS and Android apps, so there's one codebase, not three. The apps are real store builds (iOS bundle id `Io.GoGoods.music`, Android `fm.goodtunes.player`).

### Back end (the server)
- **Node.js + Express (TypeScript)** — the most common server stack on the web. Express is a thin, battle-tested HTTP layer; the business logic sits on top of it in ordinary, readable TypeScript.
- **Drizzle ORM** — a typed query builder that keeps the database schema and the application code in lockstep, with raw SQL available where a query needs hand-tuning.

### Data
- **PostgreSQL** — the industry-standard open-source relational database, trusted by companies of every size. Nothing proprietary; the data is in standard tables you can query with standard tools.

### Infrastructure & hosting
- **Replit** — hosts the app and the database, manages secrets, and runs the autoscaling deployment. Production runs as a single bundled server process behind Replit's deploy/health system.
- **Cloud object storage (Replit Object Storage, on Google Cloud Storage)** — durable storage for every uploaded asset: master audio, album art, person and vendor photos, bonus video, and generated PDFs. Files live on stable URLs and **survive every redeploy**.
- **GitHub** — the source of truth for every line of code, and the build mirror the native iOS/Android pipeline (Codemagic) builds from.

### Third-party services — *live in production today*
These are wired, configured, and running. They are real dependencies, not stubs.

| Service | What it does here |
| --- | --- |
| **Stripe + Stripe Connect** | In-player checkout for digital + vinyl + merch + signed-copy bundles; automated artist/label payouts via Connect; webhook-verified order materialization. |
| **Mux** | Encrypted, adaptive-bitrate streaming for both audio masters and bonus video, with short-lived signed playback tokens — masters never leave as a file. |
| **Replit Object Storage** | Durable cloud storage (above) for all uploaded media and generated documents. |
| **OpenAI** | Operator-facing AI assists (e.g. the chorus finder that places preview windows; metadata/credit drafting). |
| **ElevenLabs** | Forced-alignment + speech-to-text that powers GoodSync™ word-by-word synced lyrics, so timing ships without weeks of manual work. |
| **Spotify** | Catalog metadata enrichment (release dates, artwork, identifiers, canonical streaming links) — not used for playback. |
| **Shopify** | Labels already on Shopify bundle GoodTunes digital access into their own checkout; paid orders unlock the album and mint a redemption code. |
| **OrderDesk** | Physical-fulfillment hand-off: every paid physical order routes to OrderDesk, which feeds fulfillment partners; shipping-status webhooks drive the fan's tracking pill. |
| **Google Sign-In** | One-tap OAuth/OpenID sign-in for fans and admins. |
| **PostHog** | Server-side product analytics from a typed event registry; also catches admin errors in near-real-time. |
| **Sentry** | Production error monitoring with request context attached. |

### Third-party services — *implemented, not yet fully activated* (stated honestly)
- **Apple Sign-In** — the full OAuth flow, private-relay email capture, and iOS wiring are built; final go-live is gated on provisioning a real Apple PKCS#8 signing key. Until that key is in place the button is present but inert. This is a credentials/config step, not missing code.
- **EasyPost** — present only as one-time data-migration/backfill scripts, **not** wired into the live app. OrderDesk is the live fulfillment path. Mentioned here only so the list stays honest.

> Anything genuinely future-tense — a DRM upgrade ladder, an artist self-serve upload portal, a listener-insights dashboard, micro-sponsorship economics — lives in [`../roadmap.md`](../roadmap.md), not here. This brief only describes what exists in the repository today.

---

## Why it's robust

The signals that separate production-grade software from a demo. Every item below is real and lives in the codebase.

- **Real third-party infrastructure, not mocks.** Payments, streaming, storage, auth, fulfillment, and analytics all run against the services named above. There is no "fake checkout" or "pretend streaming" standing in for the real thing in production.
- **Masters never leave as a file.** Audio (and bonus video) is delivered as encrypted, adaptive-bitrate segments through Mux, each play authorized by a short-lived, user-bound signed token. The fan can listen; the fan cannot download the master. On native, on-device downloads are additionally encrypted at rest with a per-device key held in the phone's hardware secret store.
- **Payments handled by Stripe, verified by signature.** Money flows through Stripe and Stripe Connect. Order webhooks are verified byte-for-byte against Stripe's signature before a single record is written, so a forged callback can't unlock an album or trigger a payout.
- **Durable storage that survives redeploys.** Uploaded assets live in cloud object storage on stable URLs, completely separate from the app process — deploying new code never touches the media.
- **Automated checks on every change.** Beyond TypeScript's compile-time type checking, the repo runs a suite of named validation steps that act like CI gates:
  - **`design-lint`** — enforces the design-system rules (brand-color usage, 44px touch targets, destructive-action confirmations, admin form conventions), failing only on *new* violations.
  - **`schema-drift-smoke`** — reflects the code's declared database tables/columns and compares them against the **live** database (both dev *and* production), catching a missing column before it can 500 a page.
  - **`db-query-smoke`** — runs `EXPLAIN` on the hand-written raw SQL queries the type-checker can't see, so a renamed column is caught in validation, not in production.
  - **`test`** — the automated test suite (server logic, components, regression cases).
  - **`app-icon-guards-smoke` / `ios-ipa-icon-smoke`** — verify the shipped mobile binaries actually carry correct, non-placeholder app icons.
- **Database-safety guards.** Schema changes are applied to production through **idempotent** migration blocks (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) run after merge — deliberately *not* an automatic "push the schema and let it figure out the diff," because that can drop columns on a false-positive rename. The schema-drift guard above exists specifically to make sure no schema change ships without its matching migration.
- **Health monitoring built for autoscaling.** A `GET /api/health` endpoint runs a real, double-bounded database probe (a 4-second overall deadline *and* a 3-second driver-level statement timeout) so a sick database can't make the health check itself part of the outage. The server also opens its listening socket *before* warm-up work, so the deployment promotes only once it can actually serve traffic.
- **Resilience under real conditions.** The Postgres connection pool is deliberately small per instance (so many autoscaled instances can't collectively exhaust the database), and it **self-heals** the classic post-deploy "cached plan must not change result type" error by recycling the poisoned connection and retrying once — automatically, invisibly to the fan.
- **Observability when something does break.** Every server 5xx is captured by Sentry with request context, throttled email ops-alerts fire on API errors, and admin-side errors forward to PostHog with SQL detail — so problems are seen by the team, not first by a customer.

---

## Built with AI — does that matter?

The honest answer: **AI changed the speed of construction, not the standard of the result.** Here's why that's a defensible claim and not a dodge.

- **The architecture is conventional.** React front end, Express/Node back end, Postgres database, standard hosting, standard third-party services. There is no exotic, AI-invented pattern here — it's the same shape a competent human team would have chosen. An engineer reading it finds exactly what they'd expect to find.
- **Every line is version-controlled.** The full history lives in Git/GitHub. Nothing is generated on the fly at runtime; the code that runs is the code in the repository, reviewable commit by commit.
- **Every change runs the same gauntlet.** The automated checks in [Why it's robust](#why-its-robust) don't care whether a human or an AI wrote the line — a schema mistake, a broken raw query, a design-system violation, or a type error fails the same way regardless of authorship. The quality bar is enforced by the checks, not by who typed the code.
- **It's readable, not a black box.** This is ordinary TypeScript with ordinary structure (`shared/` types, `server/` routes and logic, `client/` UI). An acquirer's engineers can open it and read it the same way they'd read any codebase. There is no compiled-away "AI layer" to reverse-engineer.
- **The same patterns repeat consistently.** Because the build follows conventions deliberately — typed schema as the single source of truth, thin routes over a storage layer, one shared component for each repeated surface — the code is easier to onboard onto, not harder, than a codebase assembled ad hoc by many hands over years.

The short version for a skeptic: *the proof isn't "trust the AI" — it's "read the code and run the checks." Both are right there.*

---

## For acquirers / due diligence

What a buyer's technical team usually wants to confirm — and the answer for GoodTunes:

- **No vendor lock-in to anything exotic.** The stack is React, Node, Postgres, and TypeScript. The database is standard PostgreSQL; the data can be exported and migrated with off-the-shelf tools. Hosting is on Replit, but the app is an ordinary Node server and a static front-end bundle — portable to any standard host with modest effort.
- **The third-party services are replaceable, mainstream commodities.** Stripe, Mux, object storage, OpenAI, and the rest are accessed through small, well-isolated modules, each behind a clear boundary — so a buyer who standardizes on different vendors faces a contained swap, not a rewrite.
- **The codebase is fully inspectable.** Complete Git history, conventional layout, typed throughout, and documented (see the documentation map in [`replit.md`](../../replit.md) and the `docs/` tree). There is no hidden runtime code-generation and no proprietary framework to learn.
- **Operational maturity is already in place.** Health checks, error monitoring (Sentry), product analytics (PostHog), schema-drift and raw-SQL validation guards, idempotent production migrations, and a small-pool/self-healing database layer mean the buyer inherits running operational hygiene, not a science project.
- **Honest about what's pending.** The two items that aren't fully live (Apple Sign-In's signing key; EasyPost being script-only) are stated plainly above rather than buried — the same honesty rule the rest of the sales docs follow, so there are no surprises in diligence.

---

*How to keep this current: when the stack or an integration's live/pending status actually changes — a new third-party service goes live, Apple Sign-In activates, a validation guard is added — update the matching line here in the same change-set. This brief is the technical-credibility companion to [`investor-one-pager.md`](./investor-one-pager.md); keep both honest. Feature additions belong in [`../capabilities.md`](../capabilities.md), not here.*
