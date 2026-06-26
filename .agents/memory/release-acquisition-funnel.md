---
name: Release acquisition funnel + campaign attribution
description: How first-touch UTM/click attribution rides the analytics envelope and how the native (PostHog-free) release funnel report is computed.
---

# Campaign attribution + native acquisition funnel

## Attribution lives in the envelope, mirrored into payload (not columns)
Campaign tags (utm_source/medium/campaign/content/term, gclid, fbclid, referrerHost)
are part of `AnalyticsEnvelope` (shared/analytics.ts). The client captures them
**first-touch per session**: `captureAttribution()` in client/src/lib/analytics.ts
reads them from the landing URL once, persists to sessionStorage `gt:attribution`,
and never overwrites — in-session navigation strips the query string so the landing
event's tags must win. Same-host referrers are dropped (not an acquisition source).

Server `/api/events` mirrors them into the event `payload` jsonb as `_utm_*`,
`_gclid`, `_fbclid`, `_referrer_host` — **only when present**. They are NOT
top-level columns. Any source/campaign rollup must read them from `payload`, same
as the pre-existing `_device_id/_platform/_referrer/_country/_region` mirror.

**Why:** keeps `analytics_events` self-contained (one row = full context, no joins)
and avoids schema churn for what are campaign tags, not user identifiers (no extra
PII gate). PostHog forward gets them free via the existing `...e.payload` spread.

## Native funnel = strict distinct-session, aggregated in JS
`acquisitionFunnel()` / `funnelReleases()` in server/reports/admin.ts power
Reports → Funnels (AdminReports.tsx FunnelsTab, above the PostHog embeds).
Routes: `GET /api/admin/reports/funnel?albumId=&groupBy=source` and
`/funnel/releases`, both `requireRole("super_admin","admin")`, date-ranged.

Funnel steps map to existing events that all carry `albumId` in payload:
album_viewed → bundle_viewed → checkout_started → checkout_completed.
**Strict funnel**: a session counts at step N only if it hit every prior step
(walk the session's hit-set in order, stop at first gap). Session identity =
`COALESCE(session_id, user_id, event_id)`. Per-session source = `_utm_source`
(+`_utm_campaign` label) → `_referrer_host` → "Direct / unknown".

**How to apply:** follow the `topContent` pattern (load rows → reduce in JS, not
SQL GROUP BY) for any new release-scoped report. `funnelReleases()` joins back to
the `albums` table and drops ids that no longer exist there — synthetic/test
albumIds won't appear in the picker even if they have events.

`funnelReleases()` returns `{ releases: [...] }` (NOT a bare array); each release
carries `albumId` (NOT `id`), title, artist, landed, shareSlug.

## Partner-facing funnel = thin scoped wrappers over the same engine
Partners (artist/label/non_profit) get the SAME funnel in their own dashboard
(client/src/components/operator/AcquisitionTab.tsx, shared across all three) via
`partnerFunnelReleases(ctx)` / `partnerAcquisitionFunnel(ctx,{albumId})` in
server/reports/index.ts — do NOT re-implement funnel math. Routes:
`GET /api/partner/reports/funnel/releases` + `/funnel`, both `requireReportScope`.

Scoping contract (the security backbone): `resolveFunnelAlbumIds(ctx)` returns
`null` = god-view (super_admin, no impersonation, every album fine) | `[]` = a
real partner that owns no albums (or an org/non_profit scope — orgs own no albums)
→ funnel shows empty | a populated list = the partner's own album ids.
`partnerAcquisitionFunnel` refuses a foreign albumId by returning the **empty
shape** (`{album:null,steps:[],...}`), NOT a 403 — by design, so the client just
renders empty rather than erroring.

**Why:** super_admin impersonation (`?asPartner=<id>&asPartnerKind=label|artist|non_profit`)
is honored ONLY for super_admin inside `requireReportScope`/`effectiveScopeFilter`;
a real partner's asPartner is ignored (they resolve their own scope), so passing
scopeId from the client is harmless. The link-builder sets utm_source(channel)+
utm_campaign so generated links self-attribute back into the same "by source" table
(deriveSource key = `utm:<source.lower>|<campaign.lower>`).
