---
name: Gift boxes vs album-claim gifts
description: Two unrelated gifting subsystems live side by side — don't conflate them
---

There are TWO distinct gifting flows that sound alike. Treat them as separate.

1. **Album-claim gifts** — buyer marks a paid order/copy as a gift and shares a
   claim link; the album + GoodDeed entitlement transfers to whoever claims it.
   Recipient contact exists only to deliver the claim link.
   - **Album-claim gifting is intentionally NOT phone-gated** (whole-order,
     per-copy, and change-recipient all create/manage gifts with no phone-verify
     403). Bill's product call: removing friction beats the anti-abuse gate here —
     do NOT reintroduce a phone gate on gifting. The phone-verify helper still
     gates **payouts** and **account recovery**, so keep the helper and only the
     gifting callers stay dropped. **Why:** an unverified buyer hit a raw 403 toast
     trying to gift. On the post-purchase screen the "Open my player" finish CTA is
     held back while the buyer is mid-gift (chose "Gift this" but hasn't minted the
     claim link) so finishing/sharing the gift is the primary step.

2. **Custom-addon gift boxes** — per-recipient personalization of
   fan-chooses-amount donation add-ons (e.g. Gift of Hope). One box per
   purchased unit; the foundation physically ships each box. Nothing is emailed
   to the recipient — the buyer fills in who each box is for after checkout.

**Guardrails (apply to the gift-box flow):**
- Stay GENERIC. Every label comes from the box's snapshot org name — never
  hard-code Nightbirde / "Gift of Hope".
- Boxes are created EMPTY at paid-time and personalized later; creation must stay
  idempotent (uniqueness is per order-item + position), so replays/webhook
  retries never duplicate.
- **PII boundary:** recipient name/phone/address/message is visible only to
  super_admin/admin, the buyer for their own boxes, and the non_profit whose role
  scope matches the box's org. Mirror this on any NEW read path or recipient PII
  leaks across orgs.
- **Positions are 1-based.** Boxes store `position` 1..N; render the stored value
  directly. Adding `+1` anywhere produces an off-by-one (this already bit the
  admin order view once).

**Why:** A real purchase test gifted the album fine but the buyer was never asked
who each donation box was for, so the foundation got no recipient/address and
couldn't ship. The two flows look similar but solve different problems.
