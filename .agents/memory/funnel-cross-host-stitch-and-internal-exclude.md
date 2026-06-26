---
name: Funnel completion is order-derived + cross-host stitch + internal exclude
description: How the acquisition funnel counts purchases (paid orders, not events), attributes their source across the purchase host, and applies the opt-in internal/test exclusion
---

# Acquisition funnel trust rules

`acquisitionFunnel()` in `server/reports/admin.ts` powers Admin → Reports → Funnels.
Three structural rules that are easy to break:

## The completed step is ORDER-DERIVED, not event-derived
The top three steps (landed / viewed-offer / started-checkout) are a strict
per-session funnel keyed on `COALESCE(session_id, user_id, event_id)`. The
**completed** step is different: it counts actual paid `orders` for the release in
the window (`status IN paid/shipped/complete/completed`, by `created_at`), NOT
`checkout_completed` events.

**Why:** purchases finish on a different host (`my.goodtunes.music`) under a
brand-new analytics session that can't be stitched, AND historical orders predate
any funnel instrumentation. An event-only completed step reads ~0 and needs a
backfill that can never cover history. Counting orders is ground truth — historical
purchases (e.g. the Hope orders) show up with zero backfill.

**How to apply:** never re-add `checkout_completed` events to the completed COUNT.
They survive only as an attribution bridge (below).

## Per-order source attribution (priority order)
Each paid order gets a source via:
1. **Stitch bridge** — `materializeOrderFromSession` emits a server-side
   `checkout_completed` carrying the original landing `sessionId` + `orderId` +
   `_stitched:true` + `_utm_*`/`_referrer_host`. The aggregator builds the
   `orderId → landing session` map from ONLY `_stitched===true` events. The Buy
   sheet feeds the landing identity through `POST /api/checkout/session`
   (`funnelSessionId`/`funnelDeviceId`/`funnelAttribution`) → Stripe metadata
   (`gt_funnel_*`) → the stitch event.
2. **Buyer's own landing session** — for orders with no stitch (historical), if the
   buyer browsed signed-in their `userId` is on a landing session; attribute to its
   deepest session's source.
3. **`Direct / unknown`** — honest fallback.

**Gotchas:**
- The client `/welcome` `checkout_completed` ALSO carries an `orderId` but fires on
  the new purchase-host session and is NOT `_stitched` — it must never win the
  bridge. Only trust `_stitched===true`.
- Keep the stitch inside the atomic `receiptEmailSentAt` claim block (webhook and
  `/welcome` poll both call materialize) so it fires exactly once; keep it
  best-effort (never throw — analytics must not break materialization).
- The stitch event must keep writing `_utm_*`/`_referrer_host` — those exact payload
  keys are what `deriveSource` reads.

## Opt-in internal/test exclusion
`excludeInternal=1` (off by default) drops internal traffic from EVERY step before
aggregation so all math (steps + per-source + conversion + `excludedInternal`)
recomputes against real fans.

A session is internal if ANY of its events is internal:
- client stamps `_internal:true` into every event payload on a flagged device. The
  flag is set DURABLY in localStorage (`gt:internal-device`) the moment an admin /
  full-access operator signs in (`useAuth` effect) and is NEVER cleared — later
  logged-out browsing on that device stays excluded.
- OR the event `userId` resolves to a staff account: an admin `users` row, or a
  full-access operator fan matched by email via `@shared/fullAccess`. Resolve the
  internal-userId set from only the userIds present in the funnel rows (bounded).

**Retroactive internal-DEVICE denylist (the non-obvious part).** The `_internal`
stamp is forward-looking only — it marks events AFTER an operator signs in on a
device, so OLD logged-out QA/test sessions on that same device predate the stamp
and would still inflate the top of the funnel. So after building sessions, taint
whole DEVICES: a device is internal if ANY of its events was internal (stamped or
staff-userId), and every session sharing that device (`payload._device_id`, the
mirrored envelope key — NOT a column) becomes internal even if its own events
carry no flag. Also honor an explicit server-maintained denylist env var
`GT_INTERNAL_DEVICE_IDS` (comma-separated) for devices known-internal that never
produced a flagged event. **Why:** marking-at-sign-in alone can't retroactively
classify historical sessions; the task needs past internal traffic gone too.

Because completed is order-derived, exclusion ALSO drops internal **purchases**: an
order whose buyer is staff/full-access, or one attributed to an internal session.
`excludedInternal` counts dropped sessions + dropped purchases.
