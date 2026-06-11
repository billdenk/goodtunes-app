# Odoo printer integration

A second, deliberate fulfillment path that mirrors the **Order Desk** connector
([`server/orderDesk.ts`](../../server/orderDesk.ts)). A paid physical order can
be handed off to an [Odoo](https://www.odoo.com/) ERP instance as a
`sale.order`, and an in-process poll scheduler reads production/shipping status
back out of Odoo, maps it onto our `fulfillment_status`, and fires the same fan
shipping-confirmation email Order Desk does on the first transition to
*shipped*.

Code: [`server/odoo.ts`](../../server/odoo.ts).

## Why pull, not push

Order Desk pushes inbound webhooks to us on every status change. Odoo's webhook
story is uneven across versions/editions (automated actions + outgoing webhooks
vary by deployment), so we **pull** status on a timer instead. The poll
scheduler is the Odoo analogue of OD's webhook handler.

## Transport

Odoo **JSON-RPC** at `POST {ODOO_URL}/jsonrpc` (no extra dependency vs. the
XML-RPC client — plain `fetch` + JSON). Two service calls:

- service `common`, method `login` → numeric `uid` (authenticate)
- service `object`, method `execute_kw` → ORM read/write/create

`execute_kw` args are positional: `[db, uid, password, model, method, args[], kwargs{}]`.

## Configuration (env vars)

No Replit connector exists for Odoo, so credentials live in environment
variables. **When any one is unset the connector no-ops cleanly** — pushes
record a visible error on the order, and every poll tick is a no-op. Live
credentials are **out of scope** for the initial wiring; the integration is
fully built + documented and waits for the operator to provision them.

| Variable       | Meaning                                            |
| -------------- | -------------------------------------------------- |
| `ODOO_URL`     | Base URL of the Odoo instance (e.g. `https://acme.odoo.com`) |
| `ODOO_DB`      | Database name                                       |
| `ODOO_LOGIN`   | User login (email)                                  |
| `ODOO_API_KEY` | API key (or password) for that login               |

Generate an API key in Odoo under **Preferences → Account Security → New API
Key**. The login user needs Sales (and Inventory, if you want delivery/tracking
status) access.

## Designating "the Odoo printer"

A fulfillment partner is flagged as the Odoo printer via
`fulfillment_partners.is_odoo_printer`. It's a **single-instance** flag (like
`is_default`): when an operator toggles one partner on, the
`PUT /api/admin/fulfillment-partners/:id` endpoint clears it from every other
live row, so at most one partner is ever the Odoo printer.

Operator UI: the fulfillment-partner **Overview** tab has an "Odoo printer"
auto-save toggle card. This is operational routing (not fan-facing metadata),
so it stays editable after the first sale (same posture as per-order routing).

## Pushing an order (operator-triggered, no auto-push)

There is **no auto-push** — an order only reaches Odoo when an operator clicks
**Push to Odoo**, mirroring the "Push to OD" button. The button appears on:

- the admin **Orders** list row (next to "Push to OD"), and
- the shared **Order detail** sheet (Fulfillment section).

Endpoint: `POST /api/admin/orders/:id/odoo-push` → `pushOrderToOdoo(orderId)`.

`pushOrderToOdoo` is **idempotent** on `orders.odoo_order_id`: a second call
no-ops and returns the stored Odoo id. It only acts on physical orders
(`isPhysicalSkuKind`). On success it stamps `odoo_order_id`,
`fulfillment_status = "submitted"`, `submitted_to_fulfillment_at`, and clears
any prior `fulfillment_error`. On failure it leaves the order `pending` and
records the error so the operator can see why without opening logs.

**Routing precedence.** The push resolves the fulfillment partner through the
shared `pickFulfillmentPartner` chain (per-order override → per-album default →
platform `is_default` → first row), then falls back to the designated Odoo
printer when nothing else resolves. Because routing is operational, a push can
re-route even after the first sale (the post-sale lock only covers fan-facing
metadata).

**What's sent.** Catalog/inventory sync is out of scope, so each order line is
written as an Odoo **note** line (`display_type: "line_note"`) carrying the
human label — no `product_id` lookup, no stock movement. The carton's identity
rides in `client_order_ref` (our order id) plus a header note line with the
artist/title and GoodDeed number, so the operator can reconcile in Odoo.

## Polling status back

`armOdooPollScheduler()` (armed from [`server/index.ts`](../../server/index.ts))
runs an in-process timer mirroring the gift scheduler: a delayed first tick
~2 minutes after boot, then every 10 minutes, with an in-process guard against
overlap. It arms **unconditionally** so the operator only has to set the env
vars to light it up; each tick is a clean no-op while credentials are unset.

Each tick (`runOdooStatusPoll`) reads every pushed-but-not-terminal order
(`odoo_order_id` set, status not in `delivered/cancelled/returned`), reads each
order's `sale.order` (`state`, `delivery_status`) plus its outgoing
`stock.picking` rows (`state`, `carrier_tracking_ref`), and maps:

| Odoo signal                                   | our `fulfillment_status` | timestamp           |
| --------------------------------------------- | ------------------------ | ------------------- |
| `sale.order.state = cancel`                   | `cancelled`              | `cancelledAt`       |
| picking `done` **or** `delivery_status = full`| `shipped`                | `shippedAt`         |
| `sale.order.state = sale`/`done`              | `in_fulfillment`         | `inFulfillmentAt`   |

Every successful read stamps `orders.odoo_last_synced_at` and a small
`fulfillment_raw` debug snapshot. On the **first** transition to *shipped*
(guarded by `!order.shippedAt`, read before the update) it flips the legacy
`status` to `shipped`, attempts the Connect payout (`attemptTransferForOrder`,
same as the OD webhook), and fires the existing fan shipping-confirmation email
(`dispatchShippingEmail` — physical-only, best-effort, never re-sends).

There's also a debug flush endpoint, `POST /api/admin/odoo/poll`, that runs one
poll pass immediately without waiting for the timer.

## Schema

- `orders.odoo_order_id` (text, unique) — the Odoo `sale.order` id; unique so a
  replayed push can't double-create.
- `orders.odoo_last_synced_at` (timestamp) — last successful poll read.
- `fulfillment_partners.is_odoo_printer` (boolean, default false) — the
  single-instance Odoo-printer designation.

Declared in [`shared/schema.ts`](../../shared/schema.ts); the additive DDL is
applied on dev + prod via [`scripts/post-merge.sh`](../../scripts/post-merge.sh)
(`migrate_odoo_printer`) so the schema-drift guard stays green and the
publish dev→prod diff stays empty.

## Out of scope

- Multiple Odoo instances (single-instance only).
- Replacing Order Desk (the two run in parallel).
- Catalog / product / inventory sync (lines are notes; no `product_id`).
- Live credentials (operator provisions `ODOO_*` to activate).
