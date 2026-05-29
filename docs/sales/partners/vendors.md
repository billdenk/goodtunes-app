# GoodTunes for Gear Makers & Vendors

**Get your gear surfaced on the exact records that used it, quote your own GoodDeed production legs, and get paid — per leg and per affiliate sale.**

*Dated May 29, 2026*

---

## What it is in one paragraph

GoodTunes credits the gear behind every track — the guitar, the amp, the mic, the pedal — and links it straight to the maker who built it and the resellers who carry it. When a fan sees that a 1973 Martin D-28 is on a record they love, your brand is right there with a tappable affiliate link. And if you're a vendor in the GoodDeed certificate supply chain (printing, hologram, insertion), you quote your own per-leg costs in a dedicated portal and get paid automatically.

## The problem with how gear shows up today

1. **"What's that guitar?" never reaches you.** Fans love the gear on the records they buy, but there's no path from the song to your storefront.
2. **You're invisible in streaming.** The instrument and the maker are nowhere on a streaming track page.
3. **Sub-brands and reseller relationships get flattened.** A Gibson-owned Epiphone, or a Maker that also sells direct, has no clean way to be represented as what it actually is.
4. **If you're in the GoodDeed supply chain, you quote over email** and chase the invoice.

## What works today

Everything below is live in production, not a slide:

- **Your gear, on the records that use it.** Every piece of gear points at the single Maker that built it, and the Maker name + logo headline the gear on both the fan-side gear page ("By Gibson" under the Les Paul title) and the admin. Resellers that carry it appear under "Available at."
- **Maker / Reseller roles, both at once.** Every vendor carries two flags — **Maker** (built it) and **Reseller** (sells it) — and a row can be both (Gibson builds Les Pauls *and* sells them direct), with dedicated index pages and one-tap toggles.
- **Sub-brands, represented as sub-brands.** A Gibson-owned brand like Epiphone or Kramer gets its own vendor row, domain, logo, bio, and catalog, with an "Owned by Gibson" line on the fan-side vendor sheet so listeners see the lineage without losing the sub-brand's identity.
- **Affiliate-attributed gear links (SuperCredits™).** Fans tap from a track's credits straight to your gear, with affiliate attribution, so a record people love becomes a sales channel for the equipment on it.
- **A fan-facing vendor profile.** Your logo, name, and brand surface as a sheet fans reach from any piece of your gear; a fan can open your profile, follow the link to buy, or visit your domain.
- **Quote your own GoodDeed legs.** Pressing plants, printers, and holographers get their own sign-in on a dedicated `/vendor` portal and quote per-leg GoodDeed costs themselves — Printing on a quantity-keyed price ladder, Hologram + shrinkwrap as a flat per-unit, Insertion as a flat per-unit — each leg toggling Active/Draft independently. Print-only partners carry a separate **Quickprinter** capability with a per-paper-size rung set.
- **Pricing snapshots protect history.** When a sale window closes, the per-release pricing is snapshotted onto the order, so later edits to your quote never rewrite what was already sold.
- **Shared contacts + notifications.** Record the buyer, A&R, or account rep on your org (paste a LinkedIn URL to add a contact), and name who gets emailed when GoodTunes events fire on your account.
- **Vendor chat — working demo.** A Chat tab lets a fan open a thread with the vendor behind any piece of gear, with the instrument auto-attached as a preview card. Today this is a working demo of the UX (threads live on-device, replies are canned); real vendor accounts and live routing are scoped for the next phase.

## How it works

```
Your gear is credited on a track (SuperCredits™)
          ↓
Fan buys/plays the record, sees "By {Your Brand}" on the gear page
          ↓
Fan taps the affiliate link → your storefront (or a reseller's)
          ↓
If you're a GoodDeed-leg vendor: you quote Printing / Hologram /
Insertion in your /vendor portal → routing resolves your live cost
          ↓
Sale window closes → pricing snapshotted → you're paid via Stripe
```

## How the money flows to you

| Flow | How it works |
|---|---|
| Affiliate (SuperCredits™) | Tappable, affiliate-attributed gear links surface your gear on every record that uses it. |
| GoodDeed production legs | You quote Printing / Hologram / Insertion (or Quickprinter per paper size); routing resolves your live cost per release. |
| Payouts | Vendor-leg payouts run on Stripe Connect through the controlled, idempotency-keyed release queue. |
| History protection | Per-release pricing is snapshotted at window close, so later edits never re-charge a closed run. |

## Coming next

In flight, not yet shipped:

- **Live vendor chat** — real vendor accounts and live routing (today's chat is a working demo).
- **12×18 large-format** Quickprinter pricing (US Letter is live).
- Deeper god-view rollups for Makers (gear GMV) and Resellers (attribution).

## CTA

If you make or sell gear that's on records, or you're in the GoodDeed certificate supply chain, let's get your brand credited on the right releases and your pricing into your own portal.

GoodTunes is built and run by Bill, available directly through onboarding.

---

*See [`../../capabilities.md`](../../capabilities.md) for the full shipped-capability catalog and [`README.md`](./README.md) for the other partner briefs.*
