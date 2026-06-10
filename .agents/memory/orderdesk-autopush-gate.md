---
name: Order Desk auto-push is OFF by default
description: Why paid physical orders do NOT auto-hand-off to Order Desk / Spinney, and how the gate works
---

# Order Desk auto-push is operator-triggered, not per-paid-order

Paid physical orders do **not** automatically hand off to Order Desk. The handoff
is operator-triggered from the admin order row ("Push to OD" button). A small
gate `orderDeskAutoPushEnabled()` (env `ORDERDESK_AUTO_PUSH`, default OFF) wraps
both auto-push call sites (direct checkout in commerce.ts + Shopify bundle path
in shopify.ts). The integration stays fully wired + credentialed; only the
automatic firing is gated.

**Why:** The real GoodTunes fulfillment flow is *aggregate-then-press*: fan
orders accumulate → the artist confirms the press-run quantity (a 344-order
release might press 500 for a better per-unit price) → ONE order is placed with
the chosen press → and only then does fulfillment routing matter. Some presses
self-fulfill (e.g. MRP); others hand off to Spinney. Auto-pushing every
individual fan order the moment payment clears would tell the fulfillment
partner (Spinney) to fulfill each order *before anything is even printed* —
exactly what Bill (the operator) does NOT want. He asked to "just prep the
integration" now; the richer release-level "on its way / here's where it is"
status view + extras-to-artist-vs-Spinney workflow is future work.

**How to apply:** Leave `ORDERDESK_AUTO_PUSH` unset until the release-level
fulfillment workflow exists. The manual retry button and the inbound status
webhook are always live regardless of the flag. If you ever re-enable auto-push,
update both docs that describe the posture: `docs/capabilities.md` (Order Desk
bullet) and `docs/sales/partners/fulfillment.md` (which currently says the
handoff is deliberate/operator-triggered). Don't reintroduce "pushed the moment
payment clears" language while the flag is off.
