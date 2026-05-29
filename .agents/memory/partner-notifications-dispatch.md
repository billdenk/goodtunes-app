---
name: Partner notifications dispatch contract
description: How partner notification recipients/dispatch behaves — the non-obvious rules a future change must preserve.
---

# Partner notifications (presses / vendors / fulfillment partners)

Two tables: `partner_notification_recipients` (per partner_kind+partner_id) and
`partner_notification_log` (one row per send attempt). Recipients soft-delete via
`deleted_at` — always filter `deleted_at IS NULL` on reads.

## Dispatch contract (preserve these)
- **Empty `events` array = subscribe-all**, including event types added later.
  Non-empty = exact opt-in. See `recipientWantsEvent` in `shared/partnerNotifications.ts`.
- **Email is the only deliverable channel in v1.** slack_webhook / orderdesk_api /
  webhook recipients are still saved but logged `status="skipped"`, never sent.
- **Dispatch is best-effort and must never throw** into the caller. A notification
  failure must never roll back the business action that triggered it (invoice
  transfer bookkeeping, cert-batch step, heads-up). Every call site wraps in
  try/catch + console.log.
- **"Last notified"** = `max(sent_at)` over log rows with `status='sent'` for that
  recipient (computed in listRecipients, not stored on the recipient).

## Which events fire where
`EVENTS_BY_PARTNER_KIND`: manufacturer = [invoice_paid, pipeline_state_change];
fulfillment = [fulfillment_heads_up, pipeline_state_change]; vendor = [] (none
wired yet — recipients still save). The pipeline transition partners care about is
the cert-batch **`shipped_to_fulfillment`** step (fires once, only on fresh
complete, to press + the album's fulfillment partner), NOT every kanban stage.

**Why:** Bill wanted multi-recipient heads-up without per-event noise or a fragile
coupling that could roll back money movement. Keep the email-only + best-effort
posture until a later task adds real Slack/webhook delivery.
