---
name: MRP white-label client portal
description: How the Memphis light client skin is scoped and what stays fan/GoodTunes-only on white-label hosts.
---

- The MRP light skin is data-driven: `skin: "mrp-light"` on the branding/estimate-link `brand` block, derived from `manufacturers.email_branding` being set — never a press-name string check. Other presses fall back to the prior dark surfaces.
- White-label client routes (`/next-steps`, `/dashboard`, `/dashboard/next-steps`, `/projects`) are gated on `onWhitelabelHost()`; those single-segment paths are in RESERVED_SLUGS (two-segment share-slug rule).
- **Fan-only chrome must be suppressed on white-label hosts** — the new-fan welcome sheet leaked onto MRP portal pages; any globally-mounted fan overlay in App.tsx needs an `onWhitelabelHost()` exclusion.
- Client auth token key is `goodtunes_auth_token` via setAuthToken/getAuthToken in lib/queryClient — never invent per-surface localStorage keys (`customerToken` silently broke portal queries).
- Dev testing: `?gtwl=<slug>` (DEV-only, sessionStorage) fakes the white-label host; dev DB needs `manufacturers.white_label_slug` set (it drifts from prod — prod had `memphis`, dev didn't).
- Standing rule: white-label hosts set document.title = press name + square-logo favicon (`WhitelabelDocumentHead`, brand-driven, all presses).
- Estimate-link public payload is an EXACT-keys allowlist test (`pressBranding.routes.db.test.ts`) — adding any field to the `/api/estimate-link/:token` response or its brand block requires updating that test.
- MrpSiteHeader is intentionally TRIPLICATED (project-home / next-steps / estimate-accepted pages) — keep the copies mirrored when editing. All marketing chrome (utility bar, nav links, social glyphs) is front-door only: render solely when the viewer is signed OUT (estimate-accepted derives signed-in from useAuth kind!=='admin').
- Dark-mode addendum deliberately deferred to its own round; estimate/email/accepted/public stay light even when it lands.
- Client-uploaded estimate files (masters/artwork) are stored PRIVATE and read only via the authed `/api/press-client/estimates/:id/files/:objectId` route (client-owner or press-scoped) — never surface them through the public `/objects/uploads` route.
- The estimate-email review redirect is env-gated (`PRESS_ESTIMATE_REVIEW_RECIPIENT`, default off); remove the shared env var to restore real-recipient delivery.
- Portal API reads are HOST-PRESS scoped server-side (white-label slug from Host header → manufacturer; dev `?wl=` mirrors the client override via withDevWlParam in useAuthKind — every portal-page query must use it or dev 404s); MRP-skinned screens are gated on `brand.skin === "mrp-light"` (MrpSkinGate + accepted-page bounce) so other presses never render MRP identity.
