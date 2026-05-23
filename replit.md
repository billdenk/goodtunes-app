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
- Colors: `#00062B` (bg), `#319ED8` (blue), `#7F10A7` (purple), `#4AFFCA` (mint), `#FF5470` (heart pink)
- Mobile-first single column, max width ~440px
- Apple-Music-style large headers, 44×44 minimum touch targets
- Songs use **heart** icon (`#FF5470`); artists use **star** icon

## Documentation map

Read the doc that matches your task before changing code:

- **[docs/design-system.md](./docs/design-system.md)** — design system rules, brand colors, IconButton primitive, inline links, destructive actions, Player dock primitive, spelling.
- **[docs/auth-and-dual-shell.md](./docs/auth-and-dual-shell.md)** — dual auth (admin + customer), TOTP, OAuth (Google + Apple), host-based routing, login-page provider lookup, Apple private-relay capture.
- **[docs/admin-conventions.md](./docs/admin-conventions.md)** — dev-vs-prod debugging, streaming-row vs GoodTunes-release rule, paste-a-URL pattern, grid/list toggle, cross-section deep links, Person-sheet content guardrails.
- **[docs/credits-and-chat.md](./docs/credits-and-chat.md)** — SuperCredits™, vendor chat demo + in-app browser, GoodSync™ lyrics, playlist covers, favorites, downloads & song row.
- **[docs/investor-update.md](./docs/investor-update.md)** — deck-grade one-pager pulling shipped capabilities, in-flight work, and near-term roadmap into a single document Nick can send investors. Re-date and refresh whenever the in-flight queue meaningfully shifts.
- **[docs/sales/](./docs/sales/)** — outward-facing sell sheets and partner briefs. [`investor-one-pager.md`](./docs/sales/investor-one-pager.md) for the scannable integrations + features one-pager Nick sends to investors; [`compass-records-sell-sheet.md`](./docs/sales/compass-records-sell-sheet.md) for the Compass deal-math walkthrough; [`shopify-advisor-brief.md`](./docs/sales/shopify-advisor-brief.md) for the one-pager the Shopify advisor reads from when pitching labels and artists already on Shopify.
- **[docs/analytics.md](./docs/analytics.md)** — typed event registry, envelope (device/session/user/platform/geo), `/api/events` ingest, PostHog forwarding (`POSTHOG_API_KEY`/`POSTHOG_HOST`), admin debug overlay, `songs.playlist_count` denorm.
- **[docs/roadmap.md](./docs/roadmap.md)** — auth plan, AWS integration, DRM ladder, mobile RN port, play analytics, artist upload portal, Micro-Sponsorships economics, streaming-service handoff, muso.ai evaluation, verified-artist outreach, lyrics data plan. Read this for anything labelled "planned" or "deferred."

## User preferences

Save preferences here that don't fit a topic doc. Topic-scoped preferences belong in the matching doc above (design system rules in `docs/design-system.md`, etc.).

### Investor doc — keep `docs/capabilities.md` current
Whenever a task ships a customer-visible capability (player feature, admin/CMS surface, platform capability, or a newly-wired integration), add or update its one- to two-sentence bullet in [`docs/capabilities.md`](./docs/capabilities.md) as part of the same change-set. That doc is what Nick reads from when pitching investors, so it must stay honest about what fans can actually do today. Anything still in design or behind a feature flag stays in `docs/roadmap.md` instead.
