# GoodTunes for Labels

**Keep selling on your store. GoodTunes turns the digital line nobody plays into a real listening experience — and gives you a roster-wide dashboard of who actually listened.**

*Dated May 29, 2026*

---

## What it is in one paragraph

The label keeps selling exactly the way it sells today — its own store, checkout, and customer list. GoodTunes plugs in on the digital side: when a fan pays, the album unlocks instantly in an Apple-Music-quality player, the order-status page and confirmation email both surface a "Get your music now" button, and the fan lands on a label-branded redeem page with their name already filled in. Your artists auto-sign to you, your whole roster rolls up into one Stripe-grade dashboard, and you control exactly what each artist on your label can edit.

## The problem with how digital ships today

1. **Delivery is delayed to street date to prevent leaks** — the fan paid, but waits, and the moment of excitement is gone.
2. **Most fans don't know what to do with a FLAC or WAV file.** They click the link, the file lands in a Downloads folder no one opens, and the relationship ends there.
3. **You sold them once and the relationship ends at the download link** — no play data, no list of who actually listened, no path to the next release.
4. **Managing a roster across spreadsheets** — no single view of which artist on your label is selling, who's listening, and what's still missing before a release can ship.

## What works today

Everything below is live in production, not a slide:

- **End-to-end Shopify Bundle flow.** Fan checks out on your store → Shopify email + order-status page get a "Get your music now" button → fan lands on a branded redeem page, email pre-filled → one tap to set a password or sign in with Google/Apple → album plays, GoodDeed number assigned. Refunds in Shopify reverse the unlock automatically.
- **Two-click store connect, no plugin.** A label is onboarded by pasting an install link from our admin — no plugin to download, no developer time, no App Store review queue. For a release you don't yet have on Shopify, one click pushes a draft product (never auto-published) with a "GoodTunes Edition" variant priced at the bundle price and inventory-capped to the redemption cap.
- **A plain-English upload flow.** Every album's Shopify tab opens with a "how the Shopify path works" explainer and a content-readiness checklist — cover art, masters, 30-second previews, bonus content — so you see exactly what's still missing without touring every tab.
- **Your artists auto-sign to you.** Setting an album's label auto-signs the primary artist to that label, so the roster wires itself up and the fan sees a "Signed to {Label}" link on the artist page.
- **A roster-wide reporting dashboard.** A Stripe-grade `/label` view scoped to your account: roster KPIs (gross, units, buyers, plays, listeners, new fans, completion rate, avg revenue per artist) with prior-period deltas, a stacked revenue-by-artist chart, daily revenue and plays, a buyers-and-listeners-by-country panel, top-albums/top-tracks tables, and a sortable roster table where every artist row drills into that artist's own dashboard with the date range carried through. Every table exports to CSV; scope is enforced server-side so you only ever see your own roster.
- **A scoped Dashboard tab + partner reporting.** Your shell opens on a Dashboard tab (gross / orders / plays / new fans vs the prior period) and a Reports section — sales over time, units, plays, payouts received, Shopify redemption rate, top fans by spend (name + city only), and a world fan map.
- **You control what each artist can edit.** Five per-scope permission toggles per artist (edit metadata, upload masters, map Shopify, manage payouts, invite sub-users), an optional "edits require approval" review queue, and a post-sale lock that freezes fan-facing metadata once a release records its first paid sale — so you protect what fans already bought.
- **Grow your own team.** With the invite-sub-users permission, you add label-side teammates from inside the admin shell — force-pinned to your role and scope, so you can never escalate or cross-scope.
- **A signed, numbered GoodDeed certificate** with every redemption (#1 through #N, no gaps, no oversells), plus an optional printed-and-signed add-on you price.
- **SuperCredits™** — tappable, affiliate-attributed per-track gear credits that pay the artist (and the label, if structured that way) every time a fan buys the gear on the record.

## How it works

```
Fan checks out on your store (Shopify)
          ↓
Confirmation email + order-status page show "Get your music now"
          ↓
Fan lands on a label-branded redeem page — email + name pre-filled
          ↓
Sets a password (or one tap with Google / Apple)
          ↓
Album plays. GoodDeed number assigned. Roster dashboard updates.
```

## How the money flows

| Flow | How it works |
|---|---|
| Per redemption | A small per-redemption fee (volume-tiered above 1,000/release); everything else — player, SuperCredits™, dashboards, refund handling, streaming — is included. |
| Signed GoodDeed add-on | Optional printed-and-signed certificate priced at cost + a margin you set as a separate revenue line. |
| Royalty payouts | Stripe Connect powers artist and label payouts when an order is marked fulfilled. |
| SuperCredits™ affiliate | Gear credits pay out on fan purchases with nothing for the label to staff. |
| Release control | Every transfer lands in a held queue and is released explicitly (idempotency-keyed), so payouts are controlled and auditable. |

## Coming next

In flight, not yet shipped:

- **Customer Orders + Library cards on the fan Account profile** (the Orders page already exists).
- **LCID** — deeper listener-count insights (top fans, completion rates, geographic heat maps, SuperCredits™ conversion) layered on the dashboards you already have.
- **OrderDesk routing rules** for physical fulfillment.

## CTA

If you run a label and want the digital line to become a listening experience — with a roster dashboard and per-artist controls you don't have today — we can connect your store in two clicks and load your roster.

GoodTunes is built and run by Bill, available directly through the rollout.

---

*The fans who buy from you are your fans. We give them somewhere to actually listen, and give you the data on what they listened to. See [`../../capabilities.md`](../../capabilities.md) and [`README.md`](./README.md).*
