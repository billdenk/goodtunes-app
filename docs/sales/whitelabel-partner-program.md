# GoodTunes White-Label Partner Program

**Internal working document — not for distribution without Bill's review.**

*Drafted June 27, 2026. Re-date whenever terms are materially revised.*

---

## Purpose

Five pressing plants have expressed interest in working with GoodTunes. Four of them (MRP, PMP, Vyril, Pressing Business) want a white-label arrangement — their brand on the fan-facing experience, not just a back-office portal. This document gives Bill a negotiation framework: a tier ladder he can quote from, a fairness model, the actual cost economics, and a recommended deal structure for each plant.

**What this document is not:** an engineering spec, a timeline, or a commitment to specific roadmap dates. The white-label build (custom partner domains, themed player/redeem/portal) is on the roadmap but not yet shipped. Every such item is labeled **[ROADMAP]** throughout.

---

## The Two Facts This Program Rests On

**1. The invite tool, co-branded redeem pages, and the press portal are live today — and run pay-as-you-go.**
A plant can invite artists, manage its pipeline, run its own portal, and have fans land on a GoodTunes-branded redeem page right now. The marginal cost of adding a plant at this tier is close to zero.

**2. True white-label (custom partner domain + fully themed player/redeem/portal) is not built yet.**
It is roadmap. MRP's deal — if structured as "fund the build" — pays for a reusable capability that every lower tier then rides. The doc is honest about this boundary throughout.

---

## Tier Ladder

Five tiers, each building on the previous. The column "What's live today" is what ships the day the agreement signs. "What's roadmap" is what the Founding tier funds, which then unlocks for lower tiers in order.

| Tier | Entry | What's live today | What's roadmap |
|---|---|---|---|
| **Invite Partner** | Free | Press portal (Dashboard / Customers / Pipeline / Settings), catalog-driven quoting, artist roster management, co-branded GoodTunes redeem pages, spec preflight + print PDFs, Stripe invoice earmarks, early-masters-cut funding pool | — |
| **Launch** | Revenue share only (no upfront) | Everything in Invite + prioritized catalog load (GoodTunes imports the plant's color library), launch-partner mention when GoodTunes goes public | Custom domain for the redeem page (`redeem.theirplant.com`) **[ROADMAP]** |
| **Network** | Small annual license ($5k–$15k range — Bill to set) + rev share | Everything in Launch + dedicated onboarding support, inclusion in GoodTunes press-network marketing | Lightly themed player (plant logo/colors on the player chrome) **[ROADMAP]** |
| **Strategic** | Mid annual license ($25k–$50k range) + rev share | Everything in Network + co-marketing budget allocation, named integration in sales materials, a named account contact | Fully themed player, redeem, and portal under the plant's brand **[ROADMAP]** |
| **Founding** | Upfront build contribution ($75k–$150k range) + ongoing annual license + rev share | Everything in Strategic + founding-partner designation, earliest access to every new capability, input into roadmap prioritization | The build itself — funds the white-label infrastructure that all tiers ride; Founding partner is live on it first |

### Tier placement is not a hard ladder

A plant can skip tiers if the commercial logic supports it. The tiers exist to give Bill anchors, not to gate-keep. What matters: does the partner's contribution (see "Fairness Model" below) justify the capability they receive?

---

## Fairness Model: Pay in Your Strongest Currency

Not every partner has $100k cash. The program's internal logic is that each partner contributes in the currency that costs them least and benefits GoodTunes most.

| Currency | What it looks like | Which partner leads with it |
|---|---|---|
| **Cash** | Upfront build contribution + annual license | MRP (large, well-capitalized) |
| **Capital introductions** | Warm intros to investors, labels, or distribution networks that GoodTunes otherwise couldn't reach | MRP (their network is a strategic asset) |
| **Distribution network** | Artists routed to GoodTunes through the plant's existing relationships — volume that makes the per-redemption model real | PMP, Pressing Business, Vyril |
| **Debt conversion** | Outstanding balance or credit owed between parties converted into a stake in the program | Vyril (if there is an existing relationship balance) |
| **Supply** | Pressing capacity allocated to GoodTunes artists at favorable terms | Hellbender (relationship-deepening vs. commercial) |

The Founding tier is designed so MRP's cash contribution is the price of the build, not charity. The build is a reusable asset on GoodTunes' books; MRP gets early access and a named co-founder position in exchange.

---

## Economics

### Cost Buckets

There are two real cost categories. Both should be validated against actual Replit / infrastructure billing before quoting partners.

**Bucket 1: One-time onboarding per release (~$2–5/release, estimate)**

| Line item | What it is | Estimated cost |
|---|---|---|
| Audio encode + Mux ingest | Master → adaptive-bitrate encrypted HLS | ~$1–2/track, ~$15–30/album at 15 tracks |
| Object storage | Album art, bonus assets, cert PDFs | Cents per release at current asset sizes |
| Catalog import | Color library import, disc-photo rehosting | One-time engineering cost, not recurring infra |

At the partner volumes being discussed, onboarding cost is noise. It matters for the long-run model if a Founding partner routes thousands of releases; it does not change the deal math for year one.

**Bucket 2: Ongoing delivery that scales with fan listening**

| Line item | What it scales with | Notes |
|---|---|---|
| Mux streaming delivery | Total play-minutes across all fans | Mux charges per minute delivered; a GoodTunes release with 1,000 redemptions and active listening is the meaningful number |
| Object storage egress | Downloads, cert PDFs, art loads | Low relative to audio |
| Platform serving | API calls, auth, database | Shared infrastructure; marginal cost per partner is very low |

The key insight: **the ongoing cost scales with listening, not with redemptions.** A partner who sends 10,000 redemptions that nobody ever plays costs GoodTunes almost nothing ongoing. A partner who sends 1,000 redemptions of fans who stream the record daily every week is the meaningful case.

### Recommended Blended Model

Three options, in order of operator preference:

**Option A (recommended): $1/redemption + 10% rev-share on future GoodTunes purchases by those fans**
- Predictable for GoodTunes (revenue tracks volume)
- Simple to explain and audit
- The $1/redemption is a ceiling, not a floor — volume tiers discount it for high-volume partners
- The 10% rev-share is on GoodTunes-side future purchases (a fan who buys a second record on GoodTunes later), not on the partner's own pressing revenue

**Option B: Literal cost+ pass-through**
- Reserved for MRP only, given the scale of their ask and their build contribution
- GoodTunes invoices MRP monthly for actual Mux + storage + serving costs for MRP-routed releases, plus a margin TBD (15–25% suggested)
- Requires GoodTunes to segregate per-partner infrastructure costs — not yet wired in the billing stack; would need operator work to implement
- Best for MRP if they want to understand the real economics; best for GoodTunes if MRP's volume is large enough that cost+ exceeds the flat-fee model

**Option C: Annual license only (no per-redemption)**
- Simplest to administer; decouples GoodTunes revenue from partner performance
- Works for Network/Strategic tiers if the license is sized correctly
- Risk: a partner who routes zero releases still pays; GoodTunes still serves them
- Could combine with a volume-minimum commitment to keep incentives aligned

### The MRP Volume Reframe

MRP presses approximately 1.2 million records per month. If even 5% of those releases add a GoodTunes digital bundle:

| Scenario | Redemptions/mo | $1/redemption revenue | Annual |
|---|---|---|---|
| Conservative (2%) | 24,000 | $24,000/mo | $288,000/yr |
| Base (5%) | 60,000 | $60,000/mo | $720,000/yr |
| Optimistic (10%) | 120,000 | $120,000/mo | $1,440,000/yr |

**The $75k–$150k upfront is the entry ticket to a potential $300k–$1.4M/yr recurring business.** The pitch to MRP is not "pay us to build something" — it is "you are buying your way into the recurring revenue model at a point where you also shape what gets built."

The infra numbers in these tables are estimates. Bill should validate actual Mux + storage invoices for the current GoodTunes catalog before quoting cost+ to MRP.

### Volume Tiers for Per-Redemption Pricing

Suggested ladder (Bill to confirm before quoting):

| Annual redemptions | Per-redemption fee |
|---|---|
| < 1,000 | $1.00 |
| 1,000 – 9,999 | $0.85 |
| 10,000 – 49,999 | $0.70 |
| 50,000 – 149,999 | $0.55 |
| 150,000+ | Cost+ or negotiated flat |

---

## Founding / Strategic Tier: Upgraded Services Menu

Founding and Strategic partners can be offered services from this menu beyond the base platform. Bill picks which are included vs. add-ons.

| Service | What it is | Notes |
|---|---|---|
| **Dedicated catalog import** | GoodTunes team loads the plant's full color library, disc photos, price ladder, and templates | Already done for MRP, PMP, Hellbender |
| **Named account manager** | A named GoodTunes contact for the partner — reachable directly | Bill fills this role today; as GoodTunes scales, this becomes a hire |
| **Co-marketing** | Joint press release, inclusion in GoodTunes launch materials, named in investor narrative | Highest value at Founding; diminishes with tier count |
| **Roadmap input** | Quarterly call with Bill to review priorities; Founding partners' feedback weighted in sprint planning | Soft commitment, not a veto |
| **Data reports** | Per-plant redemption reports: which releases, which artists, how many plays, completion rates | Already partially available via the press portal; can be extended |
| **White-label priority queue** | First in line when the white-label build ships | Founding only |
| **Discounted annual license** | Founding partners lock in a discounted license rate for the life of the agreement | Bill to set; 20–30% discount off future public pricing is a reasonable anchor |

---

## Per-Partner Deal Pages

### MRP (Memphis Record Pressing)

**Recommended tier:** Founding (see open decisions — confirm scope before quoting)

**Profile:** ~1.2M records/month, well-capitalized, existing relationships across the indie and major-label landscape. The partner most capable of funding the white-label build and most capable of making the per-redemption model material.

**Recommended terms:**
- Upfront build contribution: **$100k** (the number in Bill's conversation; range is $75k–$150k depending on what's included)
- Annual license: **$25k–$35k/year**, locked for the first three years
- Per-redemption: **cost+ pass-through** (gives MRP transparency; requires GoodTunes to segment per-partner infra costs — flag as a systems requirement)
- Rev-share on future GoodTunes fan purchases: **5%** (lower than standard 10% in exchange for the upfront)
- Capital intro commitment: **warm introductions to 3 named target investors or label groups** within the first 12 months

**What MRP gets:**
- Founding partner designation (named in all GoodTunes public materials from launch)
- White-label build: custom domain, branded player, branded redeem and portal — first in production
- Full press portal (already live)
- Dedicated catalog + color library already loaded
- Named account contact (Bill directly)
- Quarterly roadmap input

**No-brainer hook:** *"Your artists are already funding the records with GoodTunes digital bundles. The question is whether MRP's brand is on that experience or whether GoodTunes' is."*

**Open decisions for Bill:**
- Is cost+ pass-through actually feasible before GoodTunes has per-partner billing segregation? If not, start with the flat $1/redemption tier for year one and convert to cost+ once the instrumentation exists.
- Does MRP's capital-intro commitment have a specific target list, or is it best-efforts?
- What exactly is in the white-label build scope MRP is funding — custom domain only, or also themed player chrome and branded portal?
- **Does the Founding tier get a discounted per-redemption rate (in addition to the annual license)?** The current recommendation is cost+ instead of a flat rate, but if MRP prefers a flat fee, what is the right Founding-tier rate — and does locking it in now (e.g. $0.40–$0.50 fixed) represent better long-term value than cost+ given their volume? This is the single biggest economic open question before the term sheet is drafted.

---

### PMP (Precision Pressing — or confirm the full name)

**Recommended tier:** Network or Strategic

**Profile:** Mid-size plant, existing GoodTunes relationship, catalog already loaded. Less capital than MRP but strong artist roster. The value PMP brings is distribution — artists they route to GoodTunes are the recurring business, not an upfront check.

**Recommended terms:**
- Upfront: none (or a nominal $10k–$15k annual license)
- Per-redemption: **$0.85** (1,000–9,999 tier, as baseline; step down as volume grows)
- Rev-share: 10% standard
- Distribution commitment: **50 artists invited to GoodTunes within the first 12 months** (soft commitment that keeps incentives aligned without being punitive)

**What PMP gets:**
- Full press portal (already live)
- Catalog-driven quoting, artist roster, pipeline, Stripe invoice earmarks
- Custom redeem-page domain once the white-label build ships (Network tier right)
- Launch-partner mention in GoodTunes public launch

**No-brainer hook:** *"Your catalog already live-quotes in GoodTunes. The artists you bring get their own portal experience with your name on it — not ours."*

**Open decisions for Bill:**
- What deliverables does PMP need to commit to in order to earn the Network designation vs. staying at Launch? A roster size threshold? A minimum redemption volume?
- Is there an existing financial relationship with PMP (credit, prior deal) that should factor into the terms?

---

### Vyril (Pressing Business, different name — confirm)

**Recommended tier:** Launch, stepping to Network

**Profile:** Newer or smaller plant, potentially with an existing financial relationship with GoodTunes (debt or credit). The debt-conversion angle is worth exploring: if Vyril owes GoodTunes something (or vice versa), converting that into a program commitment cleans both ledgers and locks in the relationship.

**Recommended terms:**
- Upfront: Debt conversion if applicable (Bill to confirm balance and direction)
- Starting per-redemption: **$1.00** (standard), stepping to $0.85 once volume clears 1,000/year
- Step-down trigger: **1,000 annual redemptions** → $0.85; **10,000** → $0.70
- Rev-share: 10% standard
- Annual license: start at $0 (Launch tier); trigger $5k/year once volume exceeds 5,000 annual redemptions

**What Vyril gets:**
- Full press portal
- Catalog-driven quoting
- Co-branded redeem pages
- Custom redeem domain once white-label ships (if they step to Network)

**No-brainer hook:** *"Start at zero cost, grow into the terms. Every redemption you drive earns you a lower per-unit rate."*

**Open decisions for Bill:**
- What is Vyril's exact starting number — is there an existing balance to convert, and if so in which direction?
- What is the step-down trigger — is 1,000 annual redemptions the right floor, or does Vyril's anticipated volume warrant a different structure?
- Is Vyril the same as "Pressing Business" or a different plant? Confirm before negotiating.

---

### Pressing Business

**Recommended tier:** Launch

**Profile:** (Bill to confirm scale and relationship.) Assumed to be a smaller or regional plant where the primary value is roster reach rather than capital. The goal is to get them in, make the portal useful, and let volume determine whether they step up.

**Recommended terms:**
- Upfront: none
- Per-redemption: **$1.00** standard
- Rev-share: 10% standard
- No annual license at Launch tier

**What Pressing Business gets:**
- Full press portal (already live)
- Catalog-driven quoting + color library import
- Artist roster management
- Co-branded GoodTunes redeem pages
- Spec preflight + print PDFs
- Stripe invoice earmarks + early-masters-cut pool

**No-brainer hook:** *"The portal is live. There's no check to write. Invite your first artist and see what happens to your pipeline visibility."*

**Open decisions for Bill:**
- Is Pressing Business actually a distinct plant from Vyril, or are they the same entity under different names?
- Any existing relationship or credit balance to account for?

---

### Hellbender

**Recommended tier:** Invite Partner (relationship-deepening, not commercial)

**Profile:** Established relationship. Catalog, disc photos, and swatch library fully loaded — more complete than any other plant in the system. The primary value Hellbender brings is supply reliability and catalog richness, not capital or artist routing at scale. The deal here is relational, not commercial: GoodTunes sends them volume; they stay cooperative on catalog updates and artist routing.

**Recommended terms:**
- Upfront: none
- Per-redemption: **$0.85** as a goodwill rate (acknowledging their catalog investment)
- Rev-share: 7–8% (modest discount to reward catalog participation)
- Annual license: none at Invite tier
- Non-binding supply commitment: Hellbender prioritizes GoodTunes-originated orders at standard turn times

**What Hellbender gets:**
- Full press portal (already live)
- Most complete color catalog in the system — their visual identity is already the reference standard for other plants
- GoodTunes referral visibility (all artists routing to them are visible in their portal)
- Named in GoodTunes partner narrative

**No-brainer hook:** *"Your catalog is already the best in GoodTunes. You're the reference standard. Make it official."*

**Open decisions for Bill:**
- Does Hellbender want anything from this formalization, or is the current informal arrangement working?
- Is there appetite to step Hellbender to Launch or Network if their artist routing volume grows?

---

## Honesty Summary: Live vs. Roadmap

This table consolidates the capability claims above against what is actually shipped.

| Capability | Status | Evidence |
|---|---|---|
| Press portal (Dashboard / Customers / Pipeline / Settings) | **Live** | `docs/capabilities.md` — "Press portal — one scoped left-nav home for a pressing plant" |
| Catalog-driven quoting (formats, tiers, colors, price ladders) | **Live** | `docs/capabilities.md` — catalog spreadsheet round-trip + per-press catalog |
| Color library import (MRP, PMP, Hellbender) | **Live** | `docs/capabilities.md` — "Real color libraries, with photos" |
| Artist roster management + invite tool | **Live** | `docs/capabilities.md` — "Manage your own artist roster" |
| Spec preflight + print-ready PDFs | **Live** | `docs/capabilities.md` — "Press print templates — upload once" |
| Stripe invoice earmarks + early-masters-cut pool | **Live** | `docs/capabilities.md` — "Invoices earmark a Stripe payout to you" |
| Co-branded GoodTunes redeem pages | **Live** | The redeem flow is GoodTunes-branded today; partner name appears in context |
| Partner feedback portal | **Live** | `docs/capabilities.md` — "Partner feedback & bug reports" |
| GoodTunes Shopify+ (partner sells on their own Shopify, GoodTunes runs the full production pipeline behind it) | **Live** | `docs/capabilities.md` — "GoodTunes Shopify+ — sell on your own Shopify, we run manufacturing" |
| Prepaid staged manufacturing ledger (upload quote PDFs, hand-key steps, pay the plant by ACH ~$5 cap) | **Live** | `docs/capabilities.md` — "Prepaid manufacturing ledger (ACH, staged)" |
| Fulfillment-only Shopify order feed (route the partner's own Shopify orders to fulfillment with no GoodTunes sale) | **Live** | `docs/capabilities.md` — "Fulfillment-only Shopify order feed" |
| Per-partner infra billing segregation (for cost+ pass-through) | **Not built** | Would require engineering work to segment Mux/storage costs per partner |
| Custom partner domain (e.g. `redeem.theirplant.com`) | **[ROADMAP]** | Not yet built; requires white-label domain infra |
| Themed player chrome (partner logo/colors on the player) | **[ROADMAP]** | Not yet built |
| Fully branded portal under partner domain | **[ROADMAP]** | Not yet built |

---

## Discoverability

- Internal program doc: this file (`docs/sales/whitelabel-partner-program.md`)
- Partner sell sheet for presses (outward-facing): [`docs/sales/partners/presses.md`](./partners/presses.md)
- Full shipped-capability catalog: [`docs/capabilities.md`](../capabilities.md)
- Roadmap (what's deferred): [`docs/roadmap.md`](../roadmap.md)
- Compass deal-math walkthrough (label analog): [`docs/sales/compass-records-sell-sheet.md`](./compass-records-sell-sheet.md)

---

*This document is an internal negotiation framework. Nothing in it constitutes a public commitment, a contract, or a representation to any third party.*
