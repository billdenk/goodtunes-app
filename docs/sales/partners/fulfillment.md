# GoodTunes for Fulfillment Partners

**Receive clean, fully-stamped physical orders — album, artist, label, SKU, and GoodDeed number baked onto every carton — and report status back with one signed webhook.**

*Dated June 10, 2026*

---

## What it is in one paragraph

When a fan buys a physical record on GoodTunes — vinyl, cassette, CD, or bundled merch, whether direct or through a label's Shopify checkout — the order is handed to fulfillment the moment payment clears, with the album, artist, label, and SKU stamped on the carton so the right warehouse sees the right routing. You report status back, and GoodTunes shows the fan and the operator the full lifecycle without anyone re-keying anything.

## The problem with how fulfillment gets handed off today

1. **Orders arrive messy.** No consistent routing data on the carton means manual lookups and mis-ships.
2. **Status lives in a silo.** The fan emails "where's my record?" and nobody upstream can answer.
3. **Production heads-up is ad hoc.** You find out about an inbound run when it shows up.

## What works today

Everything below is live in production, not a slide:

- **Order Desk handoff is wired and credentialed.** Direct GoodTunes checkout and label Shopify bundles can both push an order to Order Desk with the album, artist, label, SKU, GoodDeed number, and shipping address stamped on the payload — nothing to re-key in the warehouse.
- **The handoff is operator-triggered, not per-order automatic.** This is deliberate. The GoodTunes flow aggregates fan orders, confirms the press-run quantity with the artist (a 344-order release might press 500 for a better price), and places **one** order with the chosen press — so the fulfillment partner is *not* told to fulfill each individual fan order before anything is even printed. The operator pushes to Order Desk from the admin order row when the run is real. (A release-level "this pressing is on its way / here's where it is" view for the fulfillment partner is the next build; auto-push is gated behind `ORDERDESK_AUTO_PUSH` for that day.)
- **Deterministic routing to your warehouse.** When an order is pushed, it routes to the platform-default fulfillment partner (currently Spinney Media), with a per-order override available on any individual order when needed. No more "first row in the table wins" ambiguity. Some presses fulfill their own runs (e.g. MRP); others hand off to Spinney — routing is per-order so both paths coexist.
- **Signed status webhooks back to GoodTunes.** Report submitted → in fulfillment → shipped → delivered, plus carrier and tracking number/URL; the operator sees the full lifecycle on the admin order row with a one-click retry if a handoff ever fails. Fans see the same lifecycle as a pill on their Orders page with a tap-to-track link once the package moves.
- **Visible push failures.** If an Order Desk push fails (credentials not configured, API error, etc.), the error message is shown directly on the admin order row — no logs to dig through — with a one-click "Push to OD" retry button.
- **You're a first-class entity in the catalog.** Fulfillment warehouses carry contact info, location, specialties, standard turnaround, and a receiving-dock shipping address (with Google Places autocomplete), and can be set as the default fulfillment partner for a given pressing plant.
- **Notification recipients on your side.** Name the people (Ops / Accounting / Owner) who get emailed when GoodTunes fires the production heads-up and the inbound-units notice; every send is logged with a "Last notified" date.
- **Shared contacts.** Record the account rep or production lead on your org (paste a LinkedIn URL to add a contact).

## How it works

```
Fans buy a physical record (direct or Shopify bundle) → orders aggregate
          ↓
Artist confirms the press-run quantity (e.g. 344 orders → press 500)
          ↓
Operator places the run with the chosen press, then pushes to Order Desk
(order stamped with album / artist / label / SKU / GoodDeed #)
          ↓
You receive the production heads-up + inbound-units notice (email, logged)
          ↓
You fulfill and report status via signed webhook
(submitted → in fulfillment → shipped → delivered + carrier/tracking)
          ↓
Operator and fan both see the live lifecycle; no re-keying
```

## How the money flows

| Flow | How it works |
|---|---|
| Fulfillment billing | Physical fulfillment is billed per your standard handoff arrangement. |
| GoodDeed production legs | Printing / hologram / insertion of signed GoodDeed certificates route to vendors through the GoodDeed pricing portal (see [`vendors.md`](./vendors.md)). |
| Visibility | Status webhooks keep the operator and the fan in sync, with one-click retry on a failed handoff. |

## Operator runbook — wiring Order Desk end-to-end

### One-time setup (operator, in Order Desk dashboard)

1. **Add Spinney as a user on your Order Desk store.**
   - Log into [app.orderdesk.me](https://app.orderdesk.me) → Settings → Users → Invite User.
   - Invite Spinney's ops contact with "Fulfillment" level access.
   - Once they accept, orders pushed from GoodTunes will be visible to them.

2. **Register GoodTunes' inbound webhook.**
   - In Order Desk → Settings → Integrations → Webhooks, create a new webhook:
     - **URL:** `https://my.goodtunes.music/api/webhooks/orderdesk`
     - **Events:** Order status changes (shipped, delivered, cancelled, returned, in-fulfillment).
     - **Secret:** Generate a strong random string (e.g. `openssl rand -hex 32`) — copy it.
   - In GoodTunes admin → Replit Secrets pane, set:
     - `ORDERDESK_WEBHOOK_SECRET` = the secret you just generated.

3. **Verify the round-trip.**
   - Create a test order in Order Desk (or use an existing pending order).
   - Change its status to "Shipped" in Order Desk and confirm it appears as `shipped` on the matching GoodTunes admin order row within a few seconds.
   - If the webhook doesn't land, check Order Desk → Settings → Webhook Logs for delivery errors.

### When to push an order to Order Desk

Pushing is **deliberate**, not automatic — by design (see "What works today"). A paid fan order does **not** auto-hand-off to Order Desk, because the press run is placed *after* fan orders aggregate and the artist confirms the quantity. Push an order (or the orders for a release) only once the run is real and you want the fulfillment partner to receive it.

To push:

1. Open Admin → Orders.
2. Filter to "paid" status.
3. For each physical order showing a **"pending"** fulfillment pill with a **"Push to OD"** button, click the button.
   - Each successful push updates the pill to "submitted" and shows an OD order ID.
   - If a push fails, the error reason is shown inline — fix the credential issue and retry.

Alternatively, use the order detail sheet (click any order row) — the Fulfillment section shows the "Push to Order Desk" button with the last error reason for any unpushed physical order.

**Auto-push flag (off by default).** Setting the `ORDERDESK_AUTO_PUSH` secret to `true` makes every paid physical order hand off the instant payment clears. Leave it unset until the release-level fulfillment workflow exists — otherwise the fulfillment partner is told to fulfill each individual fan order before anything is pressed.

### Changing the default fulfillment partner

The routing rule is deterministic (in priority order):
1. Per-order operator override (`PATCH /api/admin/orders/:id/fulfillment-partner`).
2. The fulfillment partner with `is_default = true` (currently Spinney Media).
3. The first fulfillment partner row (fallback if no default is set).

To change the platform default: update `fulfillment_partners.is_default` directly in the database, or expose an admin UI toggle (future work).

### Credentials reference

| Secret | Where to find it |
|---|---|
| `ORDERDESK_STORE_ID` | Order Desk → Settings → Store → Store ID |
| `ORDERDESK_API_KEY` | Order Desk → Settings → API → API Key |
| `ORDERDESK_WEBHOOK_SECRET` | Generated by operator; set in Replit Secrets |

## Coming next

- **Full album → partner routing map.** Today orders route to the platform default unless overridden per-order. A per-album → partner map (e.g. "all Nightbirde orders go to Spinney, all PMP orders go to PacPack") is the next routing layer.
- **Fan ship/deliver notification emails.** Tracked in the task queue — webhook status updates already land in our DB; the email send is next.
- **Fulfillment SLA dashboards** in the god-view (today's "Coming soon" tiles).

## CTA

If you fulfill physical music orders and want clean, fully-routed handoffs with status that flows back automatically, let's wire your warehouse in.

GoodTunes is built and run by Bill, available directly through onboarding.

---

*See [`../../capabilities.md`](../../capabilities.md) for the full shipped-capability catalog and [`README.md`](./README.md) for the other partner briefs.*
