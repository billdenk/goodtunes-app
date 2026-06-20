---
name: Gift boxes vs album-claim gifts
description: server/gifts.ts now hosts TWO unrelated gifting subsystems — don't conflate them
---

`server/gifts.ts` contains two distinct, unrelated gifting flows. Confusing them
breaks things.

1. **Album-claim gifts** (`gifts` table) — buyer marks a paid order/copy as a
   gift, gets a `/gift/:token` claim link; the album + GoodDeed entitlement
   transfers to whoever claims it. Recipient contact is for the claim link only.

2. **Custom-addon gift boxes** (`custom_addon_gift_boxes` table) — per-recipient
   personalization of "fan-chooses-amount" donation add-ons (e.g. Gift of Hope).
   One row per purchased box (quantity), materialized EMPTY at paid-time in
   `materializeOrderFromSession` (idempotent, onConflictDoNothing), snapshotting
   org/orgName/fulfiller. Buyer personalizes AFTER checkout via
   `GET/PATCH /api/orders/:id/gift-boxes[/:boxId]`. Nothing is emailed to the
   recipient — the foundation ships the box.

**PII boundary (custom-addon gift boxes):** recipient name/phone/address/message
is visible only to super_admin/admin OR the `non_profit` partner whose role scope
=== `box.organizationId`. The buyer can read their own boxes (gated on
`box.buyerUserId`). Mirror this gate on any new read path or recipient PII leaks
across orgs.

**Why:** A real purchase test (Andrew) gifted the album fine but was never
prompted to say who each Gift of Hope box was for — the foundation got no
recipient/address, so boxes couldn't ship. The two flows look similar ("gift")
but solve different problems.

**How to apply:** Keep it generic — all labels come from the snapshot `orgName`,
never hard-code Nightbirde. The "known recipient" form collects addr1/addr2/zip/
state (no city/country field — per Figma; zip+state is what the foundation gets).
