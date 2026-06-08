// Task #534 — Partner notifications (multi-recipient + heads-up email).
//
// Shared registry so the admin UI, the recipient CRUD, and the server
// dispatcher all agree on the closed sets of partner kinds, channels,
// roles, and event types. v1 only wires the `email` channel; the other
// channels are reserved so a recipient row can be created now and lit
// up later without a schema change.

export const PARTNER_NOTIFICATION_KINDS = [
  "vendor",
  "manufacturer",
  "fulfillment",
  // Task #1783 — artists (people) and their team (labels) reuse the same
  // recipient table to receive the end-of-day sales digest. `person` is
  // an artist; `label` is the team/roster. No new contact system.
  "person",
  "label",
] as const;
export type PartnerNotificationKind = (typeof PARTNER_NOTIFICATION_KINDS)[number];

export const PARTNER_NOTIFICATION_CHANNELS = [
  "email",
  "slack_webhook",
  "orderdesk_api",
  "webhook",
] as const;
export type PartnerNotificationChannel =
  (typeof PARTNER_NOTIFICATION_CHANNELS)[number];

// Only email is delivered in v1. The rest render as disabled options so
// the operator can see what's coming without being able to pick a dead
// channel.
export const DELIVERABLE_CHANNELS: readonly PartnerNotificationChannel[] = [
  "email",
];

export const PARTNER_NOTIFICATION_ROLES = [
  "ops",
  "accounting",
  "owner",
  "other",
] as const;
export type PartnerNotificationRole =
  (typeof PARTNER_NOTIFICATION_ROLES)[number];

export const PARTNER_NOTIFICATION_ROLE_LABELS: Record<
  PartnerNotificationRole,
  string
> = {
  ops: "Operations",
  accounting: "Accounting",
  owner: "Owner",
  other: "Other",
};

export const PARTNER_NOTIFICATION_EVENTS = [
  "fulfillment_heads_up",
  "invoice_paid",
  "pipeline_state_change",
  "daily_sales_digest",
] as const;
export type PartnerNotificationEvent =
  (typeof PARTNER_NOTIFICATION_EVENTS)[number];

export const PARTNER_NOTIFICATION_EVENT_META: Record<
  PartnerNotificationEvent,
  { label: string; description: string }
> = {
  fulfillment_heads_up: {
    label: "Incoming run heads-up",
    description:
      "An album locked a pressing run that's routed to this partner for fulfillment.",
  },
  invoice_paid: {
    label: "Invoice paid",
    description:
      "GoodTunes transferred payment for one of this press's captured invoices.",
  },
  pipeline_state_change: {
    label: "Pipeline status change",
    description:
      "An album this partner is working on moved to a new production stage.",
  },
  daily_sales_digest: {
    label: "Daily sales report",
    description:
      "Once a day, a summary of the last 24 hours of sales, copies, revenue, gifts, and donations for these releases. Quiet on days with no activity.",
  },
};

// Which events actually fire for each partner kind in v1. Vendors get
// the card (so recipients can be staged) but no automated event routes
// to gear vendors yet — recipients added there subscribe to whatever
// ships next via the empty-events = all-events rule below.
export const EVENTS_BY_PARTNER_KIND: Record<
  PartnerNotificationKind,
  readonly PartnerNotificationEvent[]
> = {
  manufacturer: ["invoice_paid", "pipeline_state_change"],
  fulfillment: ["fulfillment_heads_up", "pipeline_state_change"],
  vendor: [],
  // Artists + their team only get the end-of-day sales digest for now.
  person: ["daily_sales_digest"],
  label: ["daily_sales_digest"],
};

export const PARTNER_NOTIFICATION_LOG_STATUSES = [
  "sent",
  "failed",
  "skipped",
] as const;
export type PartnerNotificationLogStatus =
  (typeof PARTNER_NOTIFICATION_LOG_STATUSES)[number];

// A recipient with an empty `events` array is subscribed to EVERY event
// for its partner (including events that ship later). A non-empty array
// is an explicit allow-list.
export function recipientWantsEvent(
  recipientEvents: string[] | null | undefined,
  eventType: PartnerNotificationEvent,
): boolean {
  if (!recipientEvents || recipientEvents.length === 0) return true;
  return recipientEvents.includes(eventType);
}
