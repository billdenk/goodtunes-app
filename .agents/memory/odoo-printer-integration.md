---
name: Odoo printer integration
description: Second fulfillment connector parallel to Order Desk — pulls status instead of webhooks, single-instance printer flag, env-gated dormant.
---

# Odoo printer integration

A second fulfillment path that mirrors the Order Desk connector
(`server/orderDesk.ts`), living in `server/odoo.ts`. Built and documented
(`docs/integrations/odoo.md`) but dormant until an operator provisions creds.

## Key non-obvious decisions

- **Pull, not push.** Order Desk receives status via inbound webhooks; Odoo's
  outgoing-webhook story varies by edition/version, so the Odoo connector
  **polls** status on an in-process timer instead (the analogue of OD's webhook
  handler). `armOdooPollScheduler` reads each pushed-not-terminal order's
  `sale.order` + `stock.picking`, maps to `fulfillment_status`, stamps
  `odoo_last_synced_at`, and fires the SHARED `dispatchShippingEmail` on the
  FIRST transition to shipped (guard on `!order.shippedAt` read before update).
  **Why:** can't rely on Odoo to call us back.

- **Transport is JSON-RPC** at `POST {ODOO_URL}/jsonrpc` (plain fetch, no extra
  dep): `common.login` → uid, then `object.execute_kw` with POSITIONAL args
  `[db, uid, pw, model, method, args[], kwargs{}]`.

- **Env-gated no-op.** Unset any of `ODOO_URL/ODOO_DB/ODOO_LOGIN/ODOO_API_KEY`
  → pushes record a visible per-order error, every poll tick is a clean no-op.
  Scheduler arms UNCONDITIONALLY (logs "idle — credentials unset") so the
  operator only sets env vars to light it up. Live creds were out of scope.

- **Single-instance `fulfillment_partners.is_odoo_printer`** (like `is_default`):
  the PUT endpoint clears the flag from every other live row on toggle. It's
  operational routing, so the toggle card stays editable after first sale (the
  post-sale lock only covers fan-facing metadata).

- **Push is operator-triggered, never auto** (parallel to "Push to OD"):
  `POST /api/admin/orders/:id/odoo-push` → `pushOrderToOdoo`, idempotent on
  `orders.odoo_order_id` (unique), physical-only. Resolves the partner through
  the shared `pickFulfillmentPartner` precedence, falling back to the Odoo
  printer. Order lines are written as Odoo NOTE lines (`display_type:line_note`)
  — no catalog/product/inventory sync, out of scope.

## Gotcha: test workflow stays "running" after tests pass

The `test` workflow arms index.ts schedulers inside the test process; none of
them (gift/trash/digest/odoo) call `.unref()`, so the node process never exits
on its own and the workflow shows "running" long after all tests pass (you also
see "Cannot use a pool after calling end" noise from orphaned scheduler ticks
firing on a torn-down pool). This is PRE-EXISTING, not a regression — verify
real pass/fail by the per-file `# pass`/`# fail` counts or by running suspect
files in isolation with a `timeout`, not by waiting for the workflow to finish.
