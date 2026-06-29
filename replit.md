# GoodTunes® Player

Mobile-first, Apple-Music-inspired web player.

> **Investor doc**: a deck-grade summary of everything GoodTunes has actually shipped lives in **[docs/capabilities.md](./docs/capabilities.md)**. Whenever a task that ships a customer-visible capability merges, add or update its line there. Roadmap = future; capabilities = today.

## Stack
- React + TypeScript + Vite (frontend)
- Express + tsx (backend)
- Drizzle ORM + Postgres (`DATABASE_URL`)
- TanStack Query v5 (`staleTime: Infinity`)
- Wouter (routing)
- Tailwind + shadcn/ui
- Replit Object Storage for image uploads (album art, person photos, vendor logos/covers, scraped instrument images). Files live in `${PRIVATE_OBJECT_DIR}/uploads/<uuid>.<ext>` and are served via `GET /objects/uploads/<id>` (public ACL). Survives redeploys.

## Brand at a glance
- Colors: `#00062B` (bg), `#319ED8` (blue), `#7F10A7` (purple), `#4AFFCA` (mint), `#FF5470` (heart pink), `#FF7C06` (GoodTunes logo orange — share-card framing)
- Mobile-first single column, max width ~440px
- Apple-Music-style large headers, 44×44 minimum touch targets
- Songs use **heart** icon (`#FF5470`); artists use **star** icon

## Documentation map

Read the doc that matches your task before changing code:

- **[docs/design-system.md](./docs/design-system.md)** — design system rules, brand colors, IconButton primitive, inline links, destructive actions, Player dock primitive, spelling.
- **[docs/auth-and-dual-shell.md](./docs/auth-and-dual-shell.md)** — dual auth (admin + customer), TOTP, OAuth (Google + Apple), host-based routing, login-page provider lookup, Apple private-relay capture.
- **[docs/admin-conventions.md](./docs/admin-conventions.md)** — dev-vs-prod debugging, streaming-row vs GoodTunes-release rule, paste-a-URL pattern, grid/list toggle, cross-section deep links, Person-sheet content guardrails.
- **[docs/roles-and-permissions.md](./docs/roles-and-permissions.md)** — role × capability matrix (super_admin / admin / label / artist / non_profit / manufacturer / fulfillment / vendor), partner-permission verbs, invite sub-roles, referral payout rules, post-sale lock semantics, gap list.
- **[docs/credits-and-chat.md](./docs/credits-and-chat.md)** — SuperCredits™, vendor chat demo + in-app browser, GoodSync™ lyrics, playlist covers, favorites, downloads & song row.
- **[docs/fan-checkout-walkthrough.md](./docs/fan-checkout-walkthrough.md)** — screen-by-screen walkthrough of the current fan checkout flow (album page → Buy sheet → auth gate → in-sheet Stripe Embedded Checkout → `/welcome`), honest about every conditional (vinyl-only preview, signed-cert add-on, 7" booklet either/or variant, sold-out/stock, Apple Pay/Google Pay).
- **[docs/investor-update.md](./docs/investor-update.md)** — deck-grade one-pager pulling shipped capabilities, in-flight work, and near-term roadmap into a single document Nick can send investors. Re-date and refresh whenever the in-flight queue meaningfully shifts.
- **[docs/sales/](./docs/sales/)** — outward-facing sell sheets and partner briefs. [`investor-one-pager.md`](./docs/sales/investor-one-pager.md) for the scannable integrations + features one-pager Nick sends to investors; [`technology-and-architecture-brief.md`](./docs/sales/technology-and-architecture-brief.md) for the tiered "what's it built on / is it robust / does AI-built matter / due-diligence" brief Bill hands to Press CEOs, investors, engineers, and acquirers (honest live-vs-pending stack); [`compass-records-sell-sheet.md`](./docs/sales/compass-records-sell-sheet.md) for the Compass deal-math walkthrough; [`shopify-advisor-brief.md`](./docs/sales/shopify-advisor-brief.md) for the one-pager the Shopify advisor reads from when pitching labels and artists already on Shopify; [`whitelabel-partner-program.md`](./docs/sales/whitelabel-partner-program.md) for the internal white-label partner program (tier ladder, fairness model, cost+ economics, per-partner deal pages for MRP/PMP/Vyril/Pressing Business/Hellbender); [`sales/partners/`](./docs/sales/partners/) for one "what GoodTunes does for *you*" sell sheet per partner type (presses, labels, artists, vendors, non-profits, fulfillment) — see [`partners/README.md`](./docs/sales/partners/README.md). When a shipped capability changes what a partner type gets, refresh that partner's sheet in the same change-set.
- **[docs/analytics.md](./docs/analytics.md)** — typed event registry, envelope (device/session/user/platform/geo), `/api/events` ingest, PostHog forwarding (`POSTHOG_API_KEY`/`POSTHOG_HOST`), admin debug overlay, `songs.playlist_count` denorm.
- **[docs/vendors/](./docs/vendors/)** — pressing-vendor reference docs (MRP, PMP, Hellbender): art/audio specs, packaging, color catalogs, templates, turn time, submission method. Source of truth for upload validation and print-PDF generation.
- **[docs/integrations/odoo.md](./docs/integrations/odoo.md)** — Odoo printer integration (parallel to Order Desk): env-gated JSON-RPC connector, single-instance "Odoo printer" fulfillment partner, operator "Push to Odoo" (no auto-push), in-process status poller (pull, not webhook) mapping Odoo sale.order/stock.picking → fulfillment_status and firing the fan shipping email on first ship.
- **[docs/roadmap.md](./docs/roadmap.md)** — auth plan, AWS integration, DRM ladder, mobile RN port, play analytics, artist upload portal, Micro-Sponsorships economics, streaming-service handoff, muso.ai evaluation, verified-artist outreach, lyrics data plan. Read this for anything labelled "planned" or "deferred."
- **[docs/store-review-readiness.md](./docs/store-review-readiness.md)** — pre-submission App Store + Play compliance audit: prioritized A (fixed in repo) / B (operator/infra) / C (device-only) findings, in-app account deletion, Android target-API-35 gap, and the App Privacy / Data-safety disclosure for first-party analytics + affiliate links (A4 field-mapping table, B5 operator form-entry). Pair with `app-store-submission.md` + `native-builds.md`.
- **[docs/google-play-setup.md](./docs/google-play-setup.md)** — operator runbook for the Android → Google Play submission (player-only, no Play Billing): the two Codemagic credentials the `android-internal` workflow needs (`goodtunes_keystore` + the `google_play` service-account group), Play Console app + internal-track setup, listing asset specs, Data-safety/content-rating/privacy compliance forms, the demo account + reviewer notes, and how builds reach Play (the `android-internal` workflow auto-triggers on every push to `main`, internal-testing track only).
- **[docs/cert-pinning.md](./docs/cert-pinning.md)** — native offline-download certificate pinning: why we pin the long-lived ISRG (Let's Encrypt) roots (not the 60-day leaf), the two-layer design (native pinned fetch off the WebView + `NSPinnedDomains`/Android network-security-config), the exact pins, the Dropbox-master limitation, the Android expiration anti-brick net, the safe cert-rotation runbook, and the device/CI verification checklist.

## User preferences

Save preferences here that don't fit a topic doc. Topic-scoped preferences belong in the matching doc above (design system rules in `docs/design-system.md`, etc.).

### Don't end in a "waiting for input" state for optional questions
Bill found it confusing when a task finishes by pausing on a non-blocking, optional preference ("let me know if you'd prefer X instead"). Don't do that. Make the sensible default call, ship it, and state plainly what you chose and how to change it later. Only pause for genuine blockers — missing access/secrets, a destructive/irreversible action, or a real fork where you can't infer the intent.

### Who's who
- **Bill** is the operator / decision-maker running GoodTunes — talk to Bill as the customer for everything in this repo (plans, copy approvals, deal math, roadmap calls).
- **Nick** is an artist on the platform (Nick Carter). Do not assign him operator/PM responsibilities in tasks or docs.

### Auto-load the design + admin conventions before touching admin code
Any task that edits an admin/CMS surface (anything under `client/src/pages/Admin*` or `client/src/components/admin/`) must read **[`docs/design-system.md`](./docs/design-system.md)** and **[`docs/admin-conventions.md`](./docs/admin-conventions.md)** before changing code. The design system covers Save semantics, IconButton, inline links, accent restraint, destructive confirms, and the mechanical linter; admin conventions cover paste-a-URL Add dialogs, the partner permissions / post-sale lock, debugging dev vs. prod, grid/list toggles, and the streaming-row vs. GoodTunes-release rule. For player work, default to Apple-Music chrome (44pt IconButton, glass scrim, Apple-Music segmented tabs) — don't borrow admin h-9 squares into the player. Run `npm run design:lint` before merging anything that touched a UI file.

### Investor doc — keep `docs/capabilities.md` current
Whenever a task ships a customer-visible capability (player feature, admin/CMS surface, platform capability, or a newly-wired integration), add or update its one- to two-sentence bullet in [`docs/capabilities.md`](./docs/capabilities.md) as part of the same change-set. That doc is what Nick reads from when pitching investors, so it must stay honest about what fans can actually do today. Anything still in design or behind a feature flag stays in `docs/roadmap.md` instead.
