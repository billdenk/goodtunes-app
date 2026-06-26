# Analytics

GoodTunes® runs a typed, batched, geo-enriched event pipeline shared between client and server. This doc covers how to instrument a new event, how the envelope is built, how PostHog forwarding works, and how to use the in-app admin debug overlay.

Out of scope here: dashboards / chart pages. Those are tracked on the roadmap.

## Event registry — `shared/analytics.ts`

Every event GoodTunes fires has a name and a typed payload declared in [`shared/analytics.ts`](../shared/analytics.ts). **That file is the source of truth** — this list is descriptive, not authoritative. The registry is grouped by domain:

- **playback** — `play_start`, `play_30s`, `play_complete`, `play_skip`, `play_seek`, `play_pause`, `play_resume`
- **video** — `video_play_start`, `video_progress` (quartiles 25/50/75), `video_complete`, `video_pause`, `video_seek` (album bonus videos; fired from the Mux-backed `BonusVideoPlayer` on `AlbumDetail`, each carries `albumId` + `videoId`)
- **library** — `favorite_song`, `unfavorite_song`, `favorite_artist`, `unfavorite_artist`, `follow_artist` (mirrors the additive star-toggle so dashboards can pivot on the follow concept)
- **playlists** — `playlist_created`, `playlist_renamed`, `playlist_deleted`, `song_added_to_playlist`, `song_removed_from_playlist`
- **discovery** — `search_performed`, `search_result_clicked`, `album_viewed`, `artist_viewed`, `song_viewed`
- **credits & lyrics** — `lyrics_opened`, `credits_opened`, `credits_person_clicked`
- **gear** — `gear_viewed`, `gear_vendor_clicked`, `gear_vendor_chat_opened`
- **share** — `share_initiated`, `share_completed`
- **commerce** — `bundle_viewed` (fan reached the BuySheet's format/add-on picker), `checkout_started`, `checkout_completed`, `gift_initiated` (buyer attached a real recipient to a paid order)
- **welcome-back** — `welcome_back_shown`, `welcome_back_card_tapped`, `welcome_back_dismissed` (all carry the current `WHATS_NEW_VERSION` from `shared/whatsNew.ts` so funnels can pivot by wave; gated server-side by `GET /api/me/whats-new`)
- **auth** — `sign_in`, `sign_up`, `sign_out`

To add a new event:

1. Add a key to `AnalyticsEventMap` in `shared/analytics.ts` with its payload shape.
2. Call `track("your_event", { ... })` from the relevant component.

`track` is strictly generic over the event name (`<N extends AnalyticsEventName>`), so a misspelled name or a missing/extra payload field is a compile error. `trackTyped` is kept as an alias for older imports.

## Envelope

Every event leaves the browser wrapped in an `AnalyticsEnvelope`:

| Field | Source | Notes |
| --- | --- | --- |
| `deviceId` | localStorage `gt:device-id` (uuid, generated once) | Survives sign-out; the only id that lets us stitch anonymous → identified |
| `sessionId` | per page load uuid (in-memory) | Resets on reload; useful for funnel windows |
| `userId` | set via `identifyAnalyticsUser()` from `useAuth` | `null` for anonymous fans |
| `platform` | `web-mobile` (<1024px) or `web-desktop` | Coarse split; refined when we ship the RN port |
| `referrer` | `document.referrer` at fire time | Useful for "where did this play start" |
| `utmSource` / `utmMedium` / `utmCampaign` / `utmContent` / `utmTerm` | Parsed from the landing URL query (`utm_*`), **first-touch per session** | Campaign attribution. Captured once on the first load that carries any of them, persisted to `sessionStorage` (`gt:attribution`) for the rest of the session so in-session navigation — which strips the query string — can't lose it. Each trimmed to 256 chars. |
| `gclid` / `fbclid` | Google / Facebook click ids from the landing URL | Same first-touch capture + persistence as the UTMs |
| `referrerHost` | Host of `document.referrer` (e.g. `instagram.com`) | Attribution fallback when no `utm_source` is set; same-host referrers are dropped (not an acquisition source) |
| `country` / `region` | Server-stamped from `cf-ipcountry` / `x-vercel-ip-country` headers | Best-effort; null if behind a proxy that strips them |

The campaign fields are **not** new PII — they're campaign tags, not user identifiers — so they ride in the envelope without a separate consent gate.

The envelope is mirrored into the event's `payload` JSONB on insert (as `_device_id`, `_session_id`, `_platform`, `_referrer`, `_country`, `_region`, plus the campaign keys `_utm_source` / `_utm_medium` / `_utm_campaign` / `_utm_content` / `_utm_term` / `_gclid` / `_fbclid` / `_referrer_host` when present) so a single query against `analytics_events` is enough for any rollup — no joins required. The campaign keys are only written when non-empty, so most events stay compact.

## Client SDK — `client/src/lib/analytics.ts`

- Events are queued in localStorage under `gt:analytics-queue` so a reload or flaky network doesn't lose them.
- Background flush every 15s to `POST /api/events`, batches of up to 100.
- On `pagehide` and `visibilitychange → hidden`, the queue is flushed via `navigator.sendBeacon` so closing the tab doesn't drop the trailing batch.
- A 20-event ring buffer (`gt:analytics-recent`) powers the admin debug overlay; every `track()` call dispatches a `gt:analytics-tick` window event so listeners (the overlay) can refresh without polling.
- `identifyAnalyticsUser(userId | null)` is called from `useAuth` when `/api/me` resolves; subsequent events get stamped with the user id.

## Server ingest — `server/analytics.ts` + `/api/events`

`POST /api/events` accepts `{ events: AnalyticsEventEnvelope[] }` and:

1. Stamps `country` / `region` from request headers (`geoFromRequest`).
2. Mirrors the envelope into each event's payload jsonb.
3. Bulk-inserts into the `analytics_events` table.
4. Fire-and-forget forwards the batch to PostHog if configured (see below).

`GET /api/admin/events/recent?limit=50` (admin-only) returns the tail of the table for the debug overlay.

`DELETE /api/events` clears the caller's queued events server-side — used by `clearLocalAnalytics()` when an admin wants to reset their own session.

## PostHog forwarding

Server-side forwarding to PostHog runs through plain `fetch` to `${POSTHOG_HOST}/batch/` — no SDK, no client-side tracker. Two env vars:

| Var | Required | Notes |
| --- | --- | --- |
| `POSTHOG_API_KEY` | yes (for forwarding) | Project API key. Forwarder no-ops cleanly if absent. |
| `POSTHOG_HOST` | optional | Defaults to `https://us.i.posthog.com`. Set to `https://eu.i.posthog.com` for EU. |

Forwarding is fire-and-forget — a PostHog outage never blocks `/api/events`, and the canonical record always lives in our `analytics_events` table.

Because PostHog is called server-side, ad-blockers can't drop events, and we still own the raw data.

## Release acquisition funnel (native, PostHog-independent)

Admin → Reports → **Funnels** leads with a first-party acquisition funnel computed entirely from our own `analytics_events` table — no PostHog dependency. It answers "for this release, how many people landed, viewed the offer, started checkout, and bought — and where did they come from?"

The four steps map to existing events (all carry `albumId` in their payload):

| Step | Event |
| --- | --- |
| Landed on the release | `album_viewed` |
| Viewed the offer | `bundle_viewed` |
| Started checkout | `checkout_started` |
| Completed purchase | paid `orders` (ground truth) |

**Top three steps: strict funnel by distinct session.** Landed / viewed-offer / started-checkout count distinct analytics sessions, and a session counts at step _N_ only if it also reached every prior step (we walk each session's hit-set in order and stop at the first gap). Step-to-step conversion is `sessions[N] / sessions[N-1]`; overall conversion is `completed / landed`. Session identity is `COALESCE(session_id, user_id, event_id)`.

**Completed step is order-derived (ground truth).** The purchase finishes on a different host (`my.goodtunes.music`) under a brand-new analytics session that can't be stitched to the landing session, so counting `checkout_completed` events would miss every **historical** purchase and mislabel new ones. Instead, the completed step counts the actual paid `orders` for the release in the window (`status IN ('paid','shipped','complete','completed')`, by `created_at`). This is the only step that is **not** event-derived, so pre-existing orders (e.g. the historical Hope purchases) show up immediately with no backfill. The `checkout_completed` events are no longer counted at all — they serve only as an attribution bridge (below).

**Per-order source attribution.** Each paid order is attributed to a source in priority order: **(1) the server-stitched completion bridge** — the Buy sheet forwards the landing session's identity + first-touch source to `POST /api/checkout/session` (`funnelSessionId` / `funnelDeviceId` / `funnelAttribution`), the server stashes them in Stripe metadata (`gt_funnel_*`), and at materialization `materializeOrderFromSession` emits a **server-side** `checkout_completed` carrying the original `sessionId` + `orderId` + `_stitched: true` + `_utm_*`/`_referrer_host`. The aggregator reads only `_stitched` events as the `orderId → landing session` bridge (the client `/welcome` event carries an `orderId` too but fires on the new purchase-host session, so it must never win). The stitch piggybacks on the atomic receipt-claim (`receiptEmailSentAt`) so it fires exactly once per order, and is best-effort (analytics never breaks materialization). **(2) the buyer's own landing session** — for historical orders with no stitch, if the buyer browsed signed-in their `userId` appears on a landing session, so we attribute to its (deepest) source. **(3) `Direct / unknown`** — honest fallback when neither is available. Sources themselves derive from `_utm_source` (+ `_utm_campaign` label) → `_referrer_host` → `Direct / unknown`.

**Exclude internal/test traffic (Task #2257, opt-in).** An off-by-default **"Exclude internal/test traffic"** toggle (`&excludeInternal=1`) drops operator/staff sessions from **every** step before aggregation, so the math (each step + per-source + conversion) recomputes against real fans only. A session is internal if ANY of its events is internal: the client stamps `_internal: true` into every event payload on a flagged device (set durably in `localStorage` as `gt:internal-device` the moment an admin or full-access operator signs in — and never cleared, so later logged-out browsing on that device is still excluded), OR the event's `userId` resolves to a known operator/staff account (an admin `users` row, or a full-access operator fan matched by email via `@shared/fullAccess`). The completed step honors the same exclusion: an internal/test **purchase** is dropped too — a paid order whose buyer is a staff/full-access account, or one attributed to an internal (e.g. flagged-device) session. The response adds `excludedInternal` (count of dropped internal sessions + internal purchases) which the UI surfaces under the headline. The toggle is intentionally additive — the default headline number stays the raw total until the operator opts in.

Endpoints (both `requireRole("super_admin","admin")`, date-ranged via `?from`/`?to`):

| Route | Returns |
| --- | --- |
| `GET /api/admin/reports/funnel/releases` | Releases that have any `album_viewed` traffic, with landing counts, sorted busiest-first — powers the release picker. **Not** date-bounded so the picker stays stable as the window changes. Only returns releases that still exist in the `albums` table. |
| `GET /api/admin/reports/funnel?albumId=…&groupBy=source[&excludeInternal=1]` | The four-step funnel for one release in the window (top three steps from analytics sessions, completed from paid `orders`), plus the per-source breakdown when `groupBy=source`. `excludeInternal=1` removes operator/staff + flagged-device sessions and internal/test purchases from every step and returns `excludedInternal` (count dropped). |

Aggregation happens in JS (load rows → reduce), matching the `topContent` pattern in [`server/reports/admin.ts`](../server/reports/admin.ts) — `acquisitionFunnel()` and `funnelReleases()`.

### `admin_list_error` (server-only)

Fired from `server/index.ts` whenever a `GET /api/admin/*` response finishes with a 5xx status. Payload: `{ route, method, status, durationMs, message }`. A structured `[admin-list-error]` log line is always emitted; the PostHog forward is gated on `NODE_ENV=production` so dev/preview noise stays out of the project. This is the early-warning signal for schema drift and admin handler crashes — Nick shouldn't be the one who finds them by opening the page.

## "Song in N playlists" denorm

`songs.playlist_count` is a denormalized integer column kept in sync by `addSongToPlaylist`, `removeSongFromPlaylist`, and `deletePlaylist` (which decrements every row that was in the deleted playlist). The counter never goes negative — decrements use `GREATEST(playlist_count - 1, 0)`.

This lets the admin "song popularity" rollup answer "how many fan playlists is this song in" in O(1) without scanning `playlist_songs`.

The column add + backfill is **not** left to `npm run db:push`. It runs idempotently on every server boot from `ensureRuntimeMigrations()` in [`server/storage.ts`](../server/storage.ts) (called at the top of `seedCatalog`):

1. `ALTER TABLE songs ADD COLUMN IF NOT EXISTS playlist_count INTEGER NOT NULL DEFAULT 0`
2. If no song currently carries a non-zero count, recompute every row from `playlist_songs` with a single `UPDATE … FROM (SELECT song_id, COUNT(*) FROM playlist_songs GROUP BY song_id)`.

This protects preview/ephemeral DBs that don't always have `db:push` run against them — without the boot-time guard the first `addSongToPlaylist` after a deploy throws because drizzle expects the column to exist.

## Admin debug overlay

A floating "Events" button appears in the bottom-right corner of every page **for signed-in admins only AND behind a feature flag** — both gates are required in `App.tsx`:

1. `user?.kind === "admin"` — the signed-in viewer is an admin.
2. `isAnalyticsDebugOverlayEnabled()` — opt-in via either `localStorage.setItem("gt:analytics-debug","1")` (per-device) or building with `VITE_ANALYTICS_DEBUG_OVERLAY=1` (per-env).

The flag keeps the overlay off-by-default for admin sessions (the floating button would otherwise sit over the player on every page admins visit). Flip it from the browser console on a device where you actually want to watch events land.

Once visible, tap the button to open the panel:

- **Client tab** — last 20 events fired from the current browser. Updates live as you click around.
- **Server tab** — most recent 50 rows from `analytics_events`. Tap ↻ to refresh.
- Shows the current `deviceId`, `sessionId`, and pending flush queue depth.

Use it to verify a new event is wired correctly: click the action, watch it appear on the Client tab, then refresh the Server tab to confirm the round-trip persisted.

## Adding instrumentation — quick checklist

1. Declare the event in `shared/analytics.ts`.
2. Import `track` (or `trackTyped`) from `@/lib/analytics`.
3. Call it from the user action — not from a `useEffect` that runs on data load, unless the data load *is* the meaningful event (e.g. `album_viewed` after the album resolves).
4. Open the admin overlay, perform the action, and confirm both tabs see it.
