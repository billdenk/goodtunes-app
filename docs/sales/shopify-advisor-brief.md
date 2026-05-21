# GoodTunes for Shopify-First Labels & Artists

**A one-page brief for the advisor selling GoodTunes into stores already running on Shopify.**

*Dated May 21, 2026*

---

## What it is in one paragraph

The label keeps selling exactly the way they sell today — their Shopify store, their checkout, their customer list. GoodTunes plugs in on the digital side: when a fan pays, the album unlocks instantly in a real Apple-Music-quality player, the order-status page and confirmation email both surface a "Get your music now" button, and the fan lands on a label-branded redeem page with their name already filled in. They set a password (or one-tap with Google or Apple), the album plays, and a numbered GoodDeed certificate is assigned to that copy of the record. No plugin to download, no developer, no change to how the store is run.

## What works today

Everything below is live in production, not a slide:

- **End-to-end Shopify Bundle flow.** Fan checks out on the label's Shopify store → Shopify email + order-status page get a "Get your music now" button → fan lands on a branded redeem page, email pre-filled → one tap to set a password or sign in with Google/Apple → album plays, GoodDeed number assigned. Same delivery technology the label has been quietly tolerating, replaced with a real listening experience.
- **Two-click store connect from the admin.** A label is onboarded by pasting the install link from our admin. No plugin, no developer time, no Shopify App Store review queue. We've already built the side of the pipe a Shopify operator never wants to think about.
- **Per-album product (and variant) mapping.** Each GoodTunes album has a Shopify tab in the admin that maps the physical product — or a *specific* variant on a multi-variant SKU (vinyl color, signed copy, deluxe edition) — to the digital release. Labels that bundle digital only on certain editions can do exactly that.
- **Automatic refund reversal.** If the order gets refunded in Shopify, the unlock reverses on our side automatically. No support ticket, no manual cleanup, no fan still streaming an album they got their money back on.
- **GoodDeed numbering on redeem.** Every redemption mints the next serial in that album's run — #1 through #N, no gaps, no oversells. This is the proof-of-delivery the FLAC line never had: the fan can see they were #47 of 500.
- **Branded redeem landing page.** The page the fan lands on after checkout carries the label's identity, not GoodTunes' marketing. From the fan's point of view it feels like the store delivered the music, because it did.
- **Fulfillment routing infrastructure ready.** Physical fulfillment (vinyl, merch, signed certificates) routes through Stripe webhooks and the admin Orders surface today; OrderDesk handoff is wired in design and lands next.

## Landing soon

In flight right now — the advisor can pre-sell these because we know what they look like and roughly when they ship:

- **Per-album distribution status at a glance.** A single panel on each album showing, at once: Shopify product mapping live (yes/no, which variant), GoodTunes direct checkout live (yes/no), redemptions to date, GoodDeed serials issued, refund/void state. The label's operations person stops having to click into three different surfaces to know where a release stands.
- **Scoped partner sign-in to the admin.** Labels and artists will get read-only access to the admin shell, scoped to their own albums and their own people — so a label's marketing lead can see redemption counts and top-fan lists without us in the loop. The dual-shell + 2FA infrastructure that powers this is already shipped on the operator side.
- **Partner reporting (engagement layer).** Per-release dashboard a label can read directly: redemptions over time, top-played tracks, plays per fan, completion rate, top fans by completion, geographic distribution. This is the data the FLAC line could never produce — and it's what makes the Shopify install worth more to the label every month after the sale.

## Why a label or artist should care

- **No new store software.** They keep Shopify. They keep their checkout, their tax setup, their shipping rules, their customer list. GoodTunes is invisible on the buy side.
- **No plugin to install or maintain.** Two clicks in our admin connects their store. Nothing to update when Shopify ships a breaking change next quarter.
- **The "what do I do with this FLAC?" problem disappears.** The fan is listening 15 seconds after paying, in a real player, on any device they sign in on. The download-link-in-an-email line that 60% of digital buyers never actually open is gone.
- **A real proof-of-delivery asset.** Every redemption gets a numbered GoodDeed certificate — something fans can show, share, and brag about. The optional signed-by-the-artist add-on becomes a separate revenue line the label sets the price on.
- **A second revenue stream the label doesn't have to staff.** SuperCredits™ — tappable, affiliate-attributed gear credits on every track — pays the artist (and the label, if structured that way) every time a fan buys the guitar, the pedal, the mic that's on the record. Nothing for the label to operate; the money shows up.
- **They keep the fan after the sale.** The customer email is already in their Shopify list; GoodTunes adds the engagement layer underneath — who actually listened, which track they played, who completed the album, who clicked into the gear. That's the list to talk to about the next release.

## Questions to bring back from prospects

Short list for the advisor to ask on every call, so we know what to build for and what to price against:

1. **What's your annual digital-line volume on Shopify today, and what's the split across editions/variants?** (Sizes the install and tells us whether multi-variant mapping is day-one or week-two.)
2. **What does your refund rate look like on digital — and have refunds on digital downloads ever been a real headache?** (Validates the auto-reversal value and exposes any policy quirks we'd need to honor.)
3. **Do you currently bundle digital into a mandatory line on physical pre-orders, or is it always an optional add-on?** (Decides which pricing posture to lead with.)
4. **Who currently handles digital fulfillment, and how attached are you to it?** (If they've already bolted on a third-party download service, we're replacing it; if they haven't, we're removing a problem they've lived with.)
5. **How protective is your team about fan data — does it stay with the label, or are you comfortable with a partner holding the engagement layer?** (Reassures them: the customer record is theirs in Shopify; GoodTunes only adds listening data they couldn't otherwise capture.)
6. **Is there an upcoming release in the next 90 days that would be a good first run?** (Soft-launch hook — a real release date converts a pitch into a calendar.)

---

*Send the advisor to [`docs/sales/compass-records-sell-sheet.md`](./compass-records-sell-sheet.md) for the full deal-math walkthrough on a real label, and [`docs/shopify-pricing-strategy.md`](../shopify-pricing-strategy.md) for the per-redemption + downstream-rev-share model.*
