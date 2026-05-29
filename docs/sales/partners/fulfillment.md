# GoodTunes for Fulfillment Partners

**Receive clean, fully-stamped physical orders — album, artist, label, and SKU baked onto every carton — and report status back with one signed webhook.**

*Dated May 29, 2026*

---

## What it is in one paragraph

When a fan buys a physical record on GoodTunes — vinyl, cassette, CD, or bundled merch, whether direct or through a label's Shopify checkout — the order is handed to fulfillment the moment payment clears, with the album, artist, label, and SKU stamped on the carton so the right warehouse sees the right routing. You report status back, and GoodTunes shows the fan and the operator the full lifecycle without anyone re-keying anything.

## The problem with how fulfillment gets handed off today

1. **Orders arrive messy.** No consistent routing data on the carton means manual lookups and mis-ships.
2. **Status lives in a silo.** The fan emails "where's my record?" and nobody upstream can answer.
3. **Production heads-up is ad hoc.** You find out about an inbound run when it shows up.

## What works today

Everything below is live in production, not a slide:

- **Every paid physical order is handed off at payment.** Direct GoodTunes checkout and label Shopify bundles both route the order the instant Stripe (or Shopify) confirms, with the album, artist, label, and SKU stamped on the carton for correct routing.
- **Signed status webhooks back to GoodTunes.** Report submitted → in fulfillment → shipped → delivered, plus carrier and tracking number/URL; the operator sees the full lifecycle on the admin order row with a one-click retry if a handoff ever fails. Fans see the same lifecycle as a pill on their Orders page with a tap-to-track link once the package moves.
- **You're a first-class entity in the catalog.** Fulfillment warehouses carry contact info, location, specialties, standard turnaround, and a receiving-dock shipping address (with Google Places autocomplete), and can be set as the default fulfillment partner for a given pressing plant.
- **Notification recipients on your side.** Name the people (Ops / Accounting / Owner) who get emailed when GoodTunes fires the production heads-up and the inbound-units notice; every send is logged with a "Last notified" date.
- **Shared contacts.** Record the account rep or production lead on your org (paste a LinkedIn URL to add a contact).

## How it works

```
Fan buys a physical record (direct or Shopify bundle)
          ↓
Payment clears → order handed off, stamped with album / artist / label / SKU
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

## Coming next

This is the partner surface with the most still in flight — here's what's coming:

- **OrderDesk routing rules.** Order-routing rules and warehouse handoff are scoped against OrderDesk; today fulfillment is driven by Stripe webhooks and the admin Orders surface, and the OrderDesk routing layer lands next.
- **Fulfillment SLA dashboards** in the god-view (today's "Coming soon" tiles).

## CTA

If you fulfill physical music orders and want clean, fully-routed handoffs with status that flows back automatically, let's wire your warehouse in.

GoodTunes is built and run by Bill, available directly through onboarding.

---

*See [`../../capabilities.md`](../../capabilities.md) for the full shipped-capability catalog and [`README.md`](./README.md) for the other partner briefs.*
