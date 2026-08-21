# UPC purchase path — GS1 research memo (Task #3249)

Written 2026-08-21. Research memo only — no purchase flow, payment collection, or
GS1 integration code exists yet. Companion design handoff for Ruby:
`docs/upc-flow-handoff-ruby.md`.

## 0. Problem statement

Artists pressing vinyl/CD/cassette through GoodTunes often do not own a UPC.
Retail and distribution increasingly require one, and the barcode-generator
work (separate task) will surface a preflight warning when an album's SKU has
no UPC. We want a legitimate, artist-consented way to get them one:

1. **Press-provided** — the plant supplies a UPC as a paid add-on (MRP charges
   **$35/UPC**; Viryl and other presses TBD).
2. **GS1 US direct** — the artist licenses their own GS1 US GTIN, with
   GoodTunes assisting/submitting.

In every path the artist must explicitly agree to the charge, and the press
(or GoodTunes as operator) presses the actual submission button.

Where the UPC lands today: `albums.upc` (nullable text, metadata-only, never
blocks — Task #3178). Nothing validates it against external registries.

## 1. GS1 landscape (verified against gs1us.org, Aug 2026)

### 1.1 Individual GS1 US GTIN license — the small-artist path

- **$30 one-time, no annual renewal**, per GTIN (12-digit UPC-A).
- Purchased at `store.gs1us.org/gs1-us-gtin/p`; includes a free lifetime
  GS1 US Data Hub subscription for creating the barcode image and managing
  product data.
- **License holder: the artist (or their company/label).** The license is
  issued in the purchaser's name and appears under that name in
  **Verified by GS1** — the registry retailers (notably Amazon) check.
- Each product *variation* needs its own GTIN: the vinyl LP, the CD, and the
  cassette of the same album are three GTINs. A per-format ($30/format)
  framing matches our SKU model exactly.

### 1.2 GS1 Company Prefix — for labels / higher volume

Tiered: 10 GTINs $250 + $50/yr, 100 GTINs $750 + $150/yr, 1,000 GTINs
$2,500 + $500/yr, etc. Annual renewal required or Data Hub access (and the
data linkage) lapses. Right answer for a *label* releasing many titles under
its own name — the label is the license holder. Not something GoodTunes
should buy on artists' behalf (see 1.5).

### 1.3 GS1 US partner programs

- **Solution Partner Program** — a membership network for service/software
  companies serving GS1 members. Solution Partners can subscribe to the
  **Unlimited API** and "assign or search GTINs and GLNs *on behalf of their
  customers* and return the results inside their systems." Application is a
  sales-consult process (form → GS1 US team reaches out) — **manual
  partnership onboarding, not self-serve**.
- **Channel Partner Program** — partners who "give customers direct access to
  authentic GS1-issued identifiers" from inside their own product; there is a
  dedicated **Order API for Channel Partners**. Existing channel partners
  include inFlow, Jungle Scout, Lightspeed/Ecwid, eComEngine, Aaron Graphics —
  i.e., exactly the "buy a real GS1 GTIN without leaving our app" experience
  we'd want. Also application-based (form + follow-up call).
- **GS1 US APIs** — an API Add-On subscription is a **flat $6,500** unlocking
  one or more of nine APIs (Product, Company, Location, licenses GetAll, plus
  the partner-gated Unlimited and Order APIs). The purchasable-by-anyone APIs
  are read/validate/manage oriented; **issuing GTINs to third parties
  programmatically requires the Channel Partner Order API**, which requires
  the partnership.

### 1.4 What can be automated vs. what needs manual onboarding

| Capability | Automatable today? |
| --- | --- |
| Artist self-purchases a $30 GTIN at store.gs1us.org (we deep-link + walk them through) | Yes — but it's a referral, artist leaves our app |
| GoodTunes validates a pasted UPC against Verified by GS1 | Yes, with a paid API Add-On ($6,500) or per-lookup via the free Verified-by-GS1 search (manual) |
| GoodTunes purchases GTINs **in the artist's name** from inside our app | Only as a **Channel Partner** (Order API) — requires application + agreement |
| GoodTunes assigns GTINs on customers' behalf inside our system | Only as a **Solution Partner** (Unlimited API) — requires application |
| Press supplies the UPC as a service line | Yes today — pure ops + billing, no GS1 integration |

### 1.5 Why sub-licensing under a GoodTunes prefix is a trap

If GoodTunes bought a company prefix and handed numbers out:

- **Verified by GS1 would show "GoodTunes" as the brand owner** of every
  artist's release. Amazon has checked UPCs against the GS1 registry since
  2016 and suppresses/blocks listings where the UPC's registered licensee
  doesn't match the brand ("UPCs that do not match the information provided
  by GS1 will be considered invalid"). Brand Registry sellers hit this
  constantly with reseller UPCs.
- GS1 licenses are **non-transferable**; "selling" numbers off our prefix is
  exactly the reseller model GS1 spent a decade shutting down. The artist
  could never take the number with them.
- If GoodTunes ever lapsed the prefix renewal, every artist's UPC linkage
  dies at once.

**Ruling: GoodTunes never issues UPCs from its own prefix.** The license
holder must be the artist (GS1 direct path) or the press must warrant its own
arrangement (press path).

### 1.6 Data GS1 collects (what our form must capture)

Company/licensee data: legal name (the name shown in Verified by GS1 — for a
solo artist this is their personal or business name, **the artist should be
told this is public**), address, contact email/phone. Product data per GTIN:
brand name, product description/title, product image (optional but
recommended), category (Music/recorded media), net content / format (e.g.
"12-inch vinyl LP"), target market (US). Payment is by card at purchase.

### 1.7 Legal / disclaimer requirements

Copy Ruby needs to plan for (final wording with counsel/Bill):

- **Charge consent** — explicit, per-UPC: "You authorize a one-time charge of
  $X for one UPC for ‹Album — Format›." No bundling into another charge
  without its own line.
- **License holder disclosure** — GS1 path: "The GS1 license is issued to
  *you*; your name/business name will appear publicly in the GS1 registry.
  GoodTunes is assisting with the application and is not the licensee." Press
  path: "This UPC is supplied by ‹Press›; ask the press about registry
  ownership if you plan to sell on marketplaces that verify UPC ownership"
  (see §2.2 — this is the honesty line the press path needs).
- **Non-affiliation** — "GoodTunes is not GS1 US" (until/unless we're an
  official partner, at which point the badge changes the story).
- **No refunds once submitted** — GS1 issues the GTIN immediately; the fee is
  not recoverable after submission.
- **Marketplace disclaimer** — "A UPC does not guarantee acceptance by any
  retailer or marketplace."

## 2. Press-provided path

### 2.1 Fee model mapping

The per-UPC fee is a textbook **press service item**
(`press_service_items`, Task #3220): concrete-priced, per-press,
operator-editable, archived-not-deleted for cost history. Mapping:

- **category**: `setup_fees` fits the existing enum ("one-time / per-order
  line items"). A dedicated `upc` category would read better on the press
  catalog page but requires touching the `PRESS_SERVICE_CATEGORIES` enum +
  label map (small, additive). Recommendation: add the category when the flow
  is built; until then seed as `setup_fees` with label "UPC barcode".
- **unitBasis**: `per_order` is closest today, but the true basis is
  *per format/SKU needing a code* — one album ordering vinyl + CD needs two.
  If we add a `per_upc` (or reuse `per_unit` with a clarifying note) basis,
  the ladder math stays out of it — UPC fees are flat adders, never
  quantity-laddered, so they deliberately do **not** touch
  `press_price_lists` / pricing-ladder rungs. Price lists remain a
  provenance layer; the service item's `source` field (e.g. `mrp-2026`)
  carries the same provenance.
- **amountCents**: MRP = 3500 (confirmed in `docs/vendors/mrp.md` — "$35
  add-on"; MRP retail = our charge, zero GoodTunes margin per the standing
  MRP ruling). Viryl, PMP, Hellbender: **TBD — ask each press** (open
  business question).

### 2.2 License holder on the press path

When MRP "supplies a UPC," the number comes from an arrangement MRP owns —
we should **not** represent to the artist that they are the GS1 licensee.
What we must get from each press before offering the path in-app:

- Whose GS1 license the numbers come from (the press's prefix? a GS1
  arrangement? a reseller block? — the last is a red flag per §1.5).
- Whether the number shows in Verified by GS1 and under what name.
- Whether the number is exclusive to this release forever (no reuse).

Until answered per-press, the press path is fine for **physical retail /
distribution paperwork** but should carry the marketplace caveat (§1.7).

### 2.3 Records the artist should receive

- A line item on the order/estimate: "UPC barcode — $35 (supplied by ‹Press›)".
- A confirmation record once assigned: the UPC value, the SKU/format it
  applies to, who supplied it, and the date — visible on the release Details
  tab (where Catalog Number/UPC rows already render) and ideally in a
  confirmation email.
- The barcode artwork file itself (generator task) once the UPC lands on
  `albums.upc` / the SKU.

## 3. Recommendation

**Ship the press path first, GS1-referral second, partner application in
parallel.**

1. **Press path (now-able)**: seed the $35 MRP service item, collect the
   artist's explicit consent in-app, press/operator submits to the plant,
   operator records the returned UPC on the album. Zero external integration.
2. **GS1 US direct referral (near-term)**: for artists not pressing with a
   UPC-supplying plant, an in-app guided checklist that collects the product
   data (§1.6), tells the artist the $30 goes to GS1 on their own card, and
   deep-links to the GS1 US single-GTIN store page. Artist is the licensee —
   the cleanest ownership story. Honest limitation: we can't press the buy
   button for them without partnership status.
3. **Apply to the GS1 US Channel Partner program (parallel track)**: this is
   the only sanctioned way to sell authentic GS1 GTINs *inside* our app
   (Order API). It's a sales-consult application — start the conversation
   now; the in-app flow design (Ruby's handoff) is written so the referral
   step can later be swapped for an embedded purchase without redesign.
4. **Never** issue numbers from a GoodTunes-owned prefix (§1.5).

### Open business questions (for Bill)

1. Confirm Viryl / PMP / Hellbender per-UPC pricing and their answers to the
   §2.2 license-holder questions; confirm MRP's too (whose license backs the
   $35 code?).
2. Decide: apply to GS1 US **Channel Partner** (embedded selling, Order API)
   vs. **Solution Partner** (assign on behalf via Unlimited API) vs. stay a
   plain referrer. Channel Partner matches our UX goal best.
3. Is the $6,500 API Add-On worth it *before* partnership just for
   Verified-by-GS1 validation of artist-pasted UPCs? (Suggest: no — defer.)
4. Do we mark up the GS1 $30 / press $35, or pass through at cost (MRP
   precedent: pass-through, zero margin)?
5. Legal review of the disclaimer copy set (§1.7).
