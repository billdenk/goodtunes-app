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
