# GoodTunes for Non-Profits

**Turn the music your community already loves into recurring funding — earn $1 (or $1.50) on every record your referred artists sell, and build an ambassador network that compounds.**

*Dated May 29, 2026*

---

## What it is in one paragraph

GoodTunes lets a non-profit attach its mission to the music economy. Bring artists onto the platform — directly, or through a network of ambassadors and staff you promote — and every paying record those artists sell mints a referral credit to your org, ledgered automatically and paid out on a monthly Stripe Connect cycle. You get your own partner shell with a dashboard, an invite tree, and a clear running total of pending vs paid-out credits.

## The problem with funding a mission today

1. **Donations are one-and-done.** A gift this year says nothing about next year.
2. **There's no recurring channel tied to the art your community cares about.** The music people love generates no support for the causes around it.
3. **Growing a referral base is manual and opaque.** Even when supporters bring people in, there's no clean way to attribute it or pay it out.

## What works today

Everything below is live in production, not a slide:

- **Non-profits are first-class partners.** From the admin, an operator adds your org by pasting your website (name, logo, homepage pulled automatically) and attaches your People as contacts/reps with role labels.
- **$1 per paying unit, automatically.** Every paid order on a referred artist's album mints a **$1.00/unit credit** to your org, ledgered idempotently — and a single flag can lift that to **$1.50/unit** when GoodTunes wants to fund a bigger charity bonus out of platform margin.
- **Your own partner shell.** A dedicated `/non-profit` view with a Dashboard tab (pending vs paid-out referral credits, referred-artist and referred-album counts) and your roster of referred artists with per-artist rollups.
- **Multi-level invite trees.** Promote any of your contact people into an **ambassador** (toggled per-person); the ambassador can attribute artist invites, and the resulting credits flow to that ambassador while still rolling up to you. A super-admin invite-tree visualiser renders your full subtree with per-node paid-unit and pending-payout totals.
- **Monthly payouts on Stripe Connect.** Accrued credits don't sit pending forever — a batched payout job groups every still-pending credit by payee and fires one Stripe Connect transfer per partner against the Stripe Express account you linked through the Payouts panel (now wired on Non-Profit detail pages), stamping each cleared credit with the transfer id and `paid_at` so your dashboard flips from Pending → Paid honestly. The run is idempotent, with a dry-run preview and clear skip reasons.
- **Referral summary on your page.** Attributed paid units and accrued $1/unit credits sit right alongside who actually represents your org.

## How it works

```
GoodTunes adds your org (paste your website)
          ↓
You (and your ambassadors) refer artists onto the platform
          ↓
Each referred artist's album sells → $1/unit credit minted to you
(idempotent ledger; toggle to $1.50/unit when funded by margin)
          ↓
Ambassadors' credits flow to them AND roll up to your org
          ↓
Monthly batched Stripe Connect payout clears your pending credits
```

## How the money flows to you

| Flow | How it works |
|---|---|
| Referral credit | $1.00 per paying unit on every referred artist's sales (toggle to $1.50/unit), ledgered idempotently in real time. |
| Ambassador network | Ambassadors you promote attribute their own invites; their credits flow to them and roll up to your org. |
| Monthly payout | Batched Stripe Connect transfer per payee, idempotent, with a dry-run preview, stamping each credit with its transfer id and paid date. |
| Release control | Payouts land in a held queue and are released explicitly, so every transfer is controlled and auditable. |

## Coming next

In flight, not yet shipped:

- **NPO plays-from-referred** and deeper engagement metrics on your Dashboard (today's "Coming soon" tiles).
- **LCID** listener insights across your referred roster.

## CTA

If your community already loves music, GoodTunes can turn that into recurring support — without a fundraising event to staff. Let's add your org and set up your first ambassadors.

GoodTunes is built and run by Bill, available directly through onboarding.

---

*See [`../../capabilities.md`](../../capabilities.md) for the full shipped-capability catalog and [`README.md`](./README.md) for the other partner briefs.*
