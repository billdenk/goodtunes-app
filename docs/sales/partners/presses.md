# GoodTunes for Pressing Plants

**Run your catalog, your quotes, your artist roster, and your invoices inside GoodTunes — and get paid automatically as the records you press sell.**

*Dated May 29, 2026*

---

## What it is in one paragraph

GoodTunes is where artists and labels design, price, and sell vinyl. When you're the press behind a release, you stop being a PDF quote in someone's inbox and become a first-class partner inside the platform: your real catalog (formats, color tiers, quantity price ladders) powers the artist's quote live, your artist roster and pipeline live in a press-specific portal, your invoices earmark a Stripe payout to you automatically, and — when a release funds itself — GoodTunes can pay you to start the masters cut *early*, months before the run would normally close, without anyone fronting capital.

## The problem with how pressing works today

1. **You quote over email and PDF.** The artist re-types your numbers into a spreadsheet, gets them wrong, and you find out at the worst possible moment.
2. **You have no line of sight into the run.** Once you've quoted, the release goes dark until someone emails you a PO. You can't see which of the artists you referred onto a platform are actually selling.
3. **You wait for the full run to close — or front the capital — before you can cut masters.** Cash flow is hostage to a run that may take months to fill.
4. **Invoicing and getting paid is manual.** You send the invoice, then chase it.

## What works today

Everything below is live in production, not a slide:

- **Your own press portal.** Pressing plants flagged as makers sign into a four-tab shell — **Dashboard / Customers / Pipeline / Settings** — instead of a generic vendor view. Customers lists every artist and label homed to you; Pipeline renders the album lifecycle as Kanban columns (Invited → Accepted → Design → Selling → Masters triggered → Masters approved → Locked → In production → Shipped) with the stage-specific action on each card.
- **Your catalog drives the artist's quote.** Each press configures the formats it runs, the color tiers it offers, the colors in each tier, and a quantity-keyed price ladder per tier. When an artist is invited to you, their Sell panel computes manufacturing cost live off *your* catalog as they pick tier → color → quantity. No re-keying, no stale PDF.
- **Real color libraries, with photos.** One-click importers pull a press's published custom-vinyl catalog (Hellbender's Shopify catalog, MRP's color library) — color tiles, master photos run through the disc mask, rehosted — so the artist's picker mirrors your real catalog out of the box. MRP, PMP, and Hellbender catalogs ship pre-loaded.
- **Dedicated or open press mode.** An album can be locked to one plant or opened to every press; the artist's quote re-resolves to the matched press, and the default manufacturing quote falls back to a published rate sheet until a press is invited.
- **Manage your own artist roster.** Invite an artist or label onto GoodTunes from your portal in one tap (name + email + optional note), with inline **Copy link / Resend / Revoke** controls. The accept URL is press-scoped, so you never see another press's invite queue, and the new artist lands with you pre-pinned as their default routing.
- **Owner/Admin vs Staff teammates.** Add teammates as Owner/Admin (run the whole press) or Staff (browse and invite artists, but can't touch profile, catalog, payouts, or masters).
- **Spec preflight + print-ready PDFs.** Uploaded art and audio are validated against the strictest combined pressing-plant ruleset before they reach you, and one tap composes the print PDFs you actually want — one file per template, sized to your finished trim + bleed, named to your filename convention.
- **Invoices earmark a Stripe payout to you.** The moment you upload (or update) an invoice on your Pipeline card, GoodTunes mints a Stripe Connect transfer to your connected account for the captured total — idempotent per album, so retries can't double-pay. Your Payouts subtab rolls up every captured invoice with its variance vs the locked quote (green/amber/pink) and the transfer status.
- **Get paid to cut masters *early*.** Every paid sale sets aside a per-unit earmark into a per-album funding pool. The moment that pool covers your minimum-run floor, GoodTunes can trigger the masters cut early — gated by three consents (a per-press auto-trigger toggle, the artist's per-album opt-in, and an admin's hands-on approval) — and mints the Stripe earmark that pays you at the next cycle. You watch the pool fill in real time.
- **Referral credit + visibility for artists you bring.** A Referrals card lists every artist you've brought onto GoodTunes, with per-album paid-unit counts and a project-scoped Sell-panel view of those artists — no platform-wide directory leak.
- **Notification recipients.** Name the people on your side (Ops / Accounting / Owner) who get emailed when an invoice is paid out or a batch ships to fulfillment.

## How it works

```
You invite an artist (or they're routed to you)
          ↓
Artist designs the package against YOUR catalog —
format, color tier, color, quantity — cost computes live
          ↓
Sale window opens; each paid unit accrues into the album's funding pool
          ↓
Pool covers your minimum-run floor → early masters cut triggers
(3 consents) → Stripe earmark queued to pay you
          ↓
You press the run; upload the invoice on your Pipeline card
          ↓
Invoice earmarks a Stripe transfer to your connected account
```

## How the money flows to you

| Flow | How it works |
|---|---|
| Pressing invoice | Upload on your Pipeline card → idempotent Stripe Connect transfer for the captured total. "Billed outside the system" skips it. |
| Early masters cut | Per-album sales pool covers your min-run floor → Stripe earmark sized to the floor pays you at the next payout cycle. |
| Referral credit | Artists you refer are tracked with paid-unit counts; press referrals run at $0/unit but give you project-scoped visibility into the artists you brought. |
| Release control | Every transfer GoodTunes fires lands in a held queue and is released explicitly (idempotency-keyed), so payouts are controlled, auditable, and can't double-pay. |

## Coming next

In flight, not yet shipped — so you know what's on the way:

- **OrderDesk routing rules** for the physical fulfillment handoff (today fulfillment is driven by Stripe webhooks and the admin Orders surface).
- Deeper god-view rollups for the Presses section (cross-plant pressing GMV and turn-time).

## CTA

If you press vinyl and want your catalog, your roster, and your invoicing to live in one place — with payouts that fire automatically and the option to be paid to cut masters early — let's load your catalog and turn on your portal.

GoodTunes is built and run by Bill, available directly to support your plant through onboarding.

---

*See [`../../capabilities.md`](../../capabilities.md) for the full shipped-capability catalog, and [`README.md`](./README.md) for the other partner briefs.*
