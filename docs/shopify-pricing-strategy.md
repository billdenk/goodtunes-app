# Shopify Bundle — Pricing & Positioning Strategy

> Working doc for the GoodTunes-via-Shopify go-to-market. Captures the
> sales positioning we landed on, the four pricing models we considered,
> the recommended hybrid, and the unit-economics constraints that
> shape pricing decisions going forward.

## The opportunity in one paragraph

Indie labels like Compass Records already sell their digital line on
Shopify — MP3, FLAC, WAV, WAV-HD — alongside CDs and vinyl. The digital
side is broken in three ways: it's gated to street date to prevent
leaks, most fans don't know what to do with a FLAC file, and the
relationship ends at the download link. GoodTunes replaces that line
with **instant, leak-proof streaming inside our player, plus an
identified, engagement-tracked fan the label keeps forever.** The
Shopify install is the cheapest fan-acquisition channel on the planet:
zero CAC, paid sales work done by the label, fans arriving pre-qualified
as buyers.

## What we're charging *for*

Two distinct value layers. Pricing each separately keeps the model honest.

1. **Delivery + experience.** The redemption itself: secure streaming
   infrastructure, the player, GoodSync™ lyrics, the GoodDeed number,
   refund handling, the redeem landing page.
2. **Acquisition + LTV.** Every fan that comes through a label's
   Shopify store becomes a GoodTunes account we can monetize downstream
   — SuperCredits™ gear affiliate, additional album purchases on
   `my.goodtunes.music`, gifting, future premium tier.

## Pricing models we considered

| Model | Mechanic | Pros | Cons |
|---|---|---|---|
| **A. Per redemption (flat)** | Label pays $X per fan who redeems | Dead simple; cash-positive day 1 | Caps our upside on a hit release |
| **B. Rev share on the digital line** | We take 15–25% of whatever the label charges for the bundled digital | Upside-aligned; label keeps price autonomy | Auditing overhead; harder to explain |
| **C. SaaS quota** | $99–$299/mo per label for N redemptions, overage per fan | Predictable MRR for investors | Friction for first install; cost for slow months |
| **D. Free at the door, take it on the back end** | $0 per redemption. We rev-share future GoodTunes-side purchases from acquired fans | Crushes every competitor on the sales call; "$0 CAC marketplace" investor narrative | No upfront revenue; harder to forecast; abuse-prone if literally $0 |

## Recommended model: A + D hybrid

**$1.00 per redemption (volume-tiered above 1,000)** + **10% lifetime
revenue share on any GoodTunes-side purchase by a fan we acquired
through that label**, with the **signed-cert add-on** priced at our
cost plus a fixed ~$3 GoodTunes margin (label sets retail floor at the
album level in our admin, not in Shopify).

Why this combination:

- $1 per redemption keeps the relationship commercial (and prevents
  abuse — see "Unit economics" below). Easy for the label to model
  against their existing digital margin.
- 10% downstream rev-share is where the real upside lives. A fan who
  buys a $35 guitar pedal through SuperCredits™ is worth more to us
  than the $1 entry fee paid for them.
- Signed-cert margin is a separate stream entirely. The label sets the
  retail, our cost-plus-$3 floor is enforced in the mapping UI so we
  never lose money on print/ship/signing logistics.

## Premium vs. budget positioning

We are *not* trying to be the cheapest digital option. The pitch is
"GoodTunes turns your unplayable FLAC line into a real listening
experience" — that's a quality story, not a price story. We want labels
to make the bundle a **mandatory** add-on to the CD/vinyl pre-order
rather than a $2 optional checkbox, because:

- A mandatory bundle lets the label raise the *physical* album price by
  what GoodTunes is worth to the fan (instant access + GoodDeed + lyrics).
  Most of that markup accrues to the label.
- An optional bundle suffers from the "do I want this?" friction that
  kills attach rates on optional digital. If we *must* be optional, we
  charge **$3 per redemption** instead of $1 because we lose the
  bundled-everyone-redeems volume guarantee.

Default sales motion: pitch the mandatory bundle. Fall back to optional
only when a label has a specific concern about it.

## Unit economics — what we have to clear

Server / streaming costs are the constraint to watch. Realistic worst
case: a fan listens heavily for 2–4 weeks while the album is
pre-streaming exclusive, then drops to occasional listens once it hits
Spotify/Apple Music. That's still ~$0.50–$1.50/year in Mux + DB +
storage per active fan in steady state, plus the heavy front-loaded
window.

| | Heavy redeemer (front-loaded) | Long-tail redeemer |
|---|---|---|
| First 30 days streaming cost | ~$2.50 | ~$0.80 |
| Years 1–3 ongoing | ~$1.50/yr | ~$0.30/yr |
| **3-yr cost ceiling** | **~$7** | **~$1.70** |

This is why **$1 per redemption is the floor, not the target**. The
floor pays for delivery on the average fan; the margin comes from the
downstream rev-share on the percentage who actually engage with
SuperCredits™, gifting, or buy a second album direct from us.

What we will *not* do:

- Charge $2/redemption flat. Some redeemers cost us $5+/year and we'd
  be subsidizing them indefinitely.
- Promise unlimited streaming forever at $1. If we hit a fan who's
  streaming the album thousands of times a year, we reserve the right
  to throttle or convert them into a paid GoodTunes subscriber at a
  later tier.

## Inventory sync — label sets the cap with *us*

Open question Bill raised: how do labels limit the number of redemptions
on a release (e.g., to match a 500-copy vinyl pressing)?

Decided: **the cap lives at the album level in the GoodTunes admin**,
not in Shopify. When the cap is hit, we PATCH Shopify to mark the
product as out-of-stock. Reasoning:

- One source of truth means we never oversell a numbered GoodDeed run.
- Labels often run the same release across multiple stores (own
  Shopify, Bandcamp, retail); the cap belongs to the GoodTunes album,
  not to any one storefront.
- We get to enforce the GoodDeed numbering invariant (#1 through #N
  with no gaps) from the unique mint side.

Implementation: a `maxRedemptions` field on the album, surfaced in the
Shopify mapping panel, with a "sync inventory to Shopify" toggle that
keeps Shopify in lockstep via the Inventory API.

## The data the label actually gets

Bill's clarification, important and right: **Compass already knows who
their buyers are** — they came through Compass's Shopify store and are
in Compass's Shopify customer list with name, email, shipping address.

What GoodTunes adds is the **engagement layer underneath that
identity**:

- Which tracks each fan plays, and how often.
- Where they drop off in the album.
- Which fans complete the whole record vs. cherry-pick singles.
- Who's clicking SuperCredits™ vendor links (gear interest data).
- Top fans by play count — the obvious targets for the next release's
  early-listen list.

That's the data the label can't get from Spotify, can't get from a
download link, and would have to build a custom platform to capture
themselves. That is the actual product we sell.

## Where this leaves us going into the Compass pitch

- Lead with the experience story (instant streaming, leak-proof, real
  player), not the price.
- Offer the bundle as mandatory at $1/redemption + 10% downstream
  share. Show them the math: $9.60 → $8.60 net, plus 1,000 identified
  + engaged fans they didn't have before.
- Mention signed-cert add-on as a separate revenue line they control.
- If Compass pushes back on mandatory, fall back to optional at
  $3/redemption with the same downstream share.
- Don't negotiate the rev-share. It funds our future and they
  understand marketplace economics.

## Signed-cert wholesale ladder

The wholesale price GoodTunes charges an artist or label per signed,
hologrammed, printed GoodDeed certificate shipped inside the vinyl.
Until now this number lived in our heads and a chat thread — codifying
it here so the admin UI, the auto-charge logic, and the sales
conversations all pull from the same source of truth.

### Cost stack assumptions

Per batch, the cost of a signed-cert run breaks down into:

- **Hoover (print + signing logistics).** $50 setup + $0.55/unit.
  *Confirmed* against Hoover invoices **#102771** and **#102896**.
- **Shipping — three legs.** Hoover → Nick (for signing) → Spinney
  (for insertion into the jacket) → Spinney's outbound to the fan
  fulfillment partner. Budget **~$25/leg, ~$75/batch fixed.**
  *Estimate* — refresh once Bill has a UPS account-rate quote.
- **Hologram (Sticker Mule).** Tamper-evident hologram sticker that
  ties each cert to its GoodDeed serial. **~$0.30/unit** at our
  current run sizes. *Confirmed* against the Sticker Mule receipt on
  file; will tier down at >500/run when Bill renegotiates.
- **Materials.** Cardstock, sleeve, signing pen consumables.
  **~$0.50/unit.** *Estimate.*
- **Labor.** Nick's signing time, batched. **~$1.00/unit** loaded.
  *Estimate* — this is the lever that pushes us toward larger batches.
- **Spinney insertion.** Per-unit fee to slip the signed cert into the
  jacket on the pressing-plant line. **~$0.50/unit.** *Estimate
  pending a real Spinney quote.*

Of these, only Hoover and Sticker Mule are pinned to invoices today.
The other three (shipping, materials/labor, Spinney) are working
estimates and will be refreshed once Bill closes the outstanding
quotes — when they land, update this section and the admin reference
panel together.

### Per-batch unit cost

Sum of the stack above against batch size, rounded:

| Batch | Hoover/unit | Shipping/unit | Variable* | **All-in cost/unit** |
|---|---|---|---|---|
| 25 | $2.55 | $3.00 | $2.30 | **~$7.85** |
| 50 | $1.55 | $1.50 | $2.30 | **~$5.35** |
| 100 | $1.05 | $0.75 | $2.30 | **~$4.10** |
| 200 | $0.80 | $0.38 | $2.30 | **~$3.48** |
| 300 | $0.72 | $0.25 | $2.30 | **~$3.27** |
| 400+ | $0.68 | $0.19 | $2.30 | **~$3.17** |

*Variable = hologram + materials + labor + Spinney insertion, summed.

### Wholesale ladder to the artist

What GoodTunes charges the artist or label per unit, by the actual
run size at window close:

| Batch | Wholesale / unit |
|---|---|
| 25–49 | **$13** |
| 50–99 | **$12** |
| 100–199 | **$9** |
| 200–299 | **$7** |
| 300+ | **$6** |

Headroom against the cost stack: roughly $5 at 25 units, ~$6.50 at 50,
~$4.80 at 100, ~$3.50 at 200, ~$2.70 at 300+. The margin is fattest
in the middle — small runs are subsidized by setup amortization,
large runs convert margin into volume so artists keep pricing
competitive against the vinyl SKU itself.

### Rules of engagement

- **25-unit minimum.** Below 25 units sold at window close, the
  cert add-on **auto-refunds** to every fan who bought it on that
  release, and **no print run happens.** A run under 25 doesn't
  amortize Hoover's $50 setup or the three shipping legs, so we
  refund rather than ship a loss-making batch.
- **Batch size is the actual orders at window close — not the
  artist's hoped-for number.** The artist is wholesale-billed on the
  count that actually sold, snapped to the ladder above. They cannot
  pre-buy a batch to lock a lower tier — capacity is real fan
  demand, not optimism.
- **Pass-throughs (billed at cost on top of the ladder):**
  - **Expedited shipping** when a fan picks an upgraded ship class.
  - **International shipping** beyond a domestic ground baseline.
  - **Mid-cycle vendor fee bumps** — if Hoover, Sticker Mule, or
    Spinney raise their published rate between window open and
    window close, the delta is passed through to the artist on the
    affected batch (we don't eat a quote we couldn't have priced).

### Out of scope here (covered by sibling tasks)

This section is the source-of-truth ladder. The downstream pieces
that *use* it ship separately:

- The wholesale calculator that bills the label for every Shopify
  order via the chosen settlement mechanism (see
  [Settlement mechanism](#settlement-mechanism--how-goodtunes-gets-paid-per-shopify-order)
  below).
- The artist-facing earnings preview that pre-shows the ladder
  picked against their forecast run size.
- The vendor-managed pricing portal that lets Hoover, Sticker Mule,
  and Spinney quote their own input prices through our admin
  (collapsing the "estimate" lines above into live quotes).

## Settlement mechanism — how GoodTunes gets paid per Shopify order

### The problem

On the fan-side flow (`my.goodtunes.music`) the fan absorbs Stripe's
fee because GoodTunes is the merchant of record. On the Shopify-side
flow the **label** is the merchant of record, which makes GoodTunes
the *payee* — any per-charge processor fee comes straight out of our
margin. At Stripe's published card rate (2.9% + $0.30) a $10 GoodTunes
line bleeds $0.59 to Stripe. That's 5.9% on the order. At scale that
fee drag erases more margin than the entire signed-cert ladder
generates. We cannot ship a per-order card charge as the settlement
mechanism — we have to pick something that amortizes or eliminates
the fixed component.

### Does Stripe allow wires?

Short version: **not as a direct charge**. You can't "charge" a
customer by wire the way you charge a card or a bank account. But
Stripe does support wires (and ACH credit transfers) as a **customer
balance top-up** via its "bank transfer" payment method. The label
wires money to a virtual account Stripe assigns them, the money lands
as a credit on their Stripe customer balance, and invoices we issue
draw down that balance with effectively no per-invoice fee.

Stripe's current published fees for that path (re-confirm before
quoting to a label):

- US ACH credit transfer into customer balance: ~$1 flat per transfer
- US domestic wire into customer balance: ~$8 flat per transfer
- International wire: higher, region-dependent

So wires *are* usable, but only as a top-up — not per order. They only
pencil out paired with batching (one wire covers many orders).

### Candidates compared

Fee shown is what GoodTunes loses per $10 GoodTunes line. Batched
options assume a representative $500/week rollup per label.

| # | Mechanism | Fee per $10 line | Settlement latency | Label friction | Our ops lift |
|---|---|---|---|---|---|
| A | Card-on-file, per order (original plan) | $0.59 (5.9%) | T+2 | low | low |
| B | ACH Direct Debit, per order | $0.08 (0.8%, $5 cap) | T+4 | medium (bank connect) | low |
| C | Weekly net-invoice rollup, card | ~$14.80 on $500 (3.0%) | T+7 to T+9 | low | medium |
| D | **Weekly net-invoice rollup, ACH Direct Debit** | **$5 max regardless of size** (1.0% on $500, 0.25% on $2,000) | T+7 to T+11 | medium | medium |
| E | Monthly prepaid wallet, funded by ACH credit / wire into Stripe customer balance | $1 (ACH) or $8 (wire) per top-up, amortized to ~$0.01/order | prepaid | high upfront | medium |
| F | Merchant-of-record on our slice via Shopify Collective / split-at-checkout | $0 to us (fan absorbs) | T+2 | very high (Collective is US-only and invitation-gated) | high |
| G | Hybrid: D for ≥$X/mo labels, A for everyone else | mix | mix | tiered | medium |

C and D look bad cell-by-cell because the fixed $0.30 / $5 cap is
amortized across a batch — the percent shown is calculated against a
$500/week roll-up. Bigger labels see the percent shrink toward zero.

### Recommendation

**Primary: weekly net-invoice rollup paid by ACH Direct Debit
(option D).** A single ACH pull at the end of each week settles every
Shopify order that hit during the window. Stripe caps US ACH at $5
per transaction, so any rollup above ~$625 the fee is effectively a
flat $5 (0.8% otherwise). At Compass-scale ($2,000/wk) that's 0.25%
drag instead of 5.9%. The 1.0%–0.25% range is the kind of fee we can
absorb without raising per-redemption pricing.

**Fallback for labels that won't connect a bank: card-on-file weekly
rollup (option C).** Still meaningfully better than per-order
because the $0.30 fixed component only hits once per week. Default to
ACH in the wizard and present card as a one-click downgrade.

**Optional power-user lane for the biggest labels: prepaid Stripe
customer-balance wallet, funded by monthly ACH credit or wire
(option E).** Every order draws from the balance at zero per-order
fee; the label gets a monthly statement reconciling the wallet. This
is the cleanest economics but requires the most label-side trust, so
it's opt-in, not default.

**Not recommended for v1: merchant-of-record-at-checkout
(option F).** Shopify Collective is US-only, invitation-gated, and
gives Shopify a fingerhold on how our slice is priced and presented
that's hard to back out of. Re-evaluate once we have 50+ labels and
the integration cost is justified by the fee savings on F.

### What the label experience looks like (recommended path)

1. **Shopify onboarding — Billing step.** Label connects a bank via
   Plaid / Stripe Financial Connections (ACH Direct Debit mandate).
   Card-on-file is offered as a secondary "I don't want to connect a
   bank" option that lands them on option C instead. Either choice
   unblocks publishing GoodTunes-mapped variants.
2. **During the week**, every Shopify order webhook computes the
   GoodTunes line and writes a **pending ledger row** — not a Stripe
   charge. The fan unlock goes through immediately regardless of
   billing state; we never punish the fan for label-side billing
   issues.
3. **End of week** (Mondays 06:00 UTC, say) a rollup job assembles
   each label's unbilled items into a single Stripe Invoice and
   auto-debits the connected bank account. Invoice line items mirror
   the per-order breakdown so the label can audit line by line.
4. **Failure mode.** ACH bounces (NSF, closed account) → the existing
   "fix your billing" banner lights up; new Shopify mappings can't
   be published until the issue is cured; the unpaid items roll into
   next week's invoice with a retry counter. Three strikes pauses the
   integration: orders still unlock for fans, but their items queue
   and the label is locked out of new Shopify publishes.
5. **Refunds.** A Shopify void/refund inside the open window simply
   removes the item from the in-flight invoice (no Stripe call).
   After the window closes, refunds issue a Stripe credit note that
   nets against the next week's invoice. Same auto-reversal pattern
   as the existing fan-unlock refund path, just bookkept against an
   invoice instead of a single charge.

### Open numbers Nick has to confirm before this goes live

- **Stripe ACH cap at our volume.** Published cap is $5/transaction;
  Stripe negotiates lower at scale. Ask the rep what the floor is
  once we're running real volume.
- **Plaid vs. Stripe Financial Connections.** Per-link / per-month
  pricing on bank-connect. Confirm which is cheaper for our usage
  pattern (one connect per label, infrequent re-link).
- **Stripe customer-balance bank-transfer fees, current.** Published
  as $1 (US ACH credit) / $8 (US wire) but verify before promising
  labels free-after-top-up.
- **Shopify Collective eligibility.** Even though it's deferred,
  get a yes/no on whether GoodTunes qualifies, so we know whether F
  is a future lane or off the table.

### Replacing the original implementation task

The original "card-on-file auto-charge per order" task is retired.
Implementation follow-ups, once the recommendation above is locked:

1. Stripe ACH onboarding (Plaid Link or Stripe Financial
   Connections) wired into the Shopify-onboarding wizard's Billing
   step, with card-on-file as a one-click downgrade.
2. Per-order ledger writer inside the existing Shopify order
   webhook — pure DB write, no Stripe call, no fee.
3. Weekly rollup job: assemble each label's Stripe Invoice,
   attempt ACH debit, persist invoice rows tying back to the line
   items. Retry + cure flow on bounce.
4. Admin + label-facing billing surfaces: open-window preview,
   invoice history, retry actions.
5. Refund handling: pre-close removes items from the in-flight
   invoice; post-close issues credit notes that net against the
   next invoice.

The sibling sale-window batch task (signed-cert wholesale true-up) is
unchanged — its credit/debit lines just drop into the next week's
invoice naturally under this model.

## Open questions to revisit before signing the first label

- Volume tiers: at what redemption count does $1 drop to $0.50? Is
  there a per-label MFN we need to honor?
- Streaming-cost circuit breaker: at what monthly play count per fan
  do we cap or convert? (Today: no cap. Revisit at 100 paying labels.)
- Refund policy on the downstream rev-share — if a fan refunds the
  album, do we claw back the rev-share on any SuperCredits™ purchase
  that came from listening to that album? (Lean: yes, but only if
  refund happens within 30 days.)
- App Store listing timeline — see [docs/roadmap.md](./roadmap.md) and
  the Shopify App Store follow-up task.
