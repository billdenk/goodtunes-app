# GoodTunes — Project / Structure Brief for Otis
**Date:** August 9, 2026
**Scope: Playground only. Mock flows, no build, no schema changes. This supersedes all prior Project/Structure briefs in full. If another session is active on a different workstream, this one owns Project/Structure.**

## Why we're doing this

The current album screens (Dashboard / Overview / Package / Digital / Physical / Shopify / Payments / Customers / Early access) treat the album as the top-level object and hang everything off it. That worked for one album, one pressing, one storefront. Real artists have broken it: multiple releases, colored-vinyl variants, records pressed by third parties but fulfilled through us, sales running through their own Shopify so pre-orders link to Spotify, and digital-only exclusives. It also blocks component-based pricing, because quotes need to attach to a specific manufacturable thing, not "the album."

We're introducing a **Project** as the top container. Mock these flows in the Playground (natural-scale sections, one region at a time, white admin palette: white surfaces, slate text, brand blue #1f7fb8, 6px radius, 36px controls) so we can walk them before anything is drawn for real.

## The hierarchy

PROJECT (top-level container; an album is one project, but a project can hold multiple releases)

### 1. Assets (shared — uploaded once, used everywhere)

- **Audio:** masters, plus treatments (Mux streaming, Waves mastering, ElevenLabs isolation/alignment feeding GoodSync lyrics), track splits, credits (SuperCredits: performers + gear), permissions if they need separation from credits.
- **Artwork:** artist uploads the largest master artwork once. We verify it. We assemble it into the assigned press's print templates (jacket, center labels, inner sleeve) and return for artist approval. Artist never touches templates directly.

### 2. Formats (a project has one or more)

- **Vinyl:** system determines side breaks with artist adjustment (keep current Physical tab behavior). Artwork templates resolve from the assigned press.
- **Digital:** 30-second previews (auto or artist-selected), track order, streaming links. Digital can be the *only* format — a project with no physical at all is valid.
- **CD:** future; model must hold it.
- **Open question — UPC:** per format or per variant? Mock both, show the tradeoff.

### 3. Variants (within a format)

- Same content, different manufacturing spec: vinyl color today; packaging differences later.
- Each variant carries its own press run, quote, quantity, and payments.
- **DECIDED — GoodDeed numbering is per variant.** Each variant is a unique item with its own certificate sequence. Mock the cert flow on this basis only.
- **DECIDED — status pills attach at the variant level**, not the project. Campaign lifecycle ends at Delivered; Evergreen loops In stock → Low stock → Sold out → At press.

### 4. Inventory: source, fulfillment node, allocation (new concept — this is what the old model couldn't hold)

A variant's stock comes from one of two **sources**:

- **GoodTunes press run** — manufactured through our press partners; quote, payments, and run tolerance attach here.
- **External intake** — pressed elsewhere (artist's prior press, another platform), received into the system. No manufacturing record, but full inventory, fulfillment, and customer-service ownership from receipt forward.

All physical stock lands at a **fulfillment node** — a partner warehouse, not our own facility. Launch nodes: **Spinney (via the existing Order Desk integration)** and **MRP Fulfillment**. GoodTunes-operated fulfillment is a future option; do not model it now beyond the node abstraction making room for it. The node is invisible to the artist: GoodTunes is the system of record, Order Desk supplies ship confirmations and tracking, our system ingests that data and surfaces it in the artist's project view and the fan's order status. Everything appears as GoodTunes end to end; fulfillment branding follows sale origin per the standing rule.

Stock at a node splits into **allocation pools**: GoodTunes-fulfilled online stock, artist-held/tour stock, third-party-fulfilled carve-outs. Orders draw against a pool; pool counts drive the Evergreen status pill. Mock the intake flow: destination node, expected quantity, received quantity, condition check, ready-to-sell — with tracking status flowing back from Order Desk.

### 5. Sales channels (three independent axes, any combination)

Decompose the old "storefront" concept into:

- **Where the sale happens:** GoodTunes checkout / artist's Shopify / external platform.
- **Who manufactured:** GoodTunes press run / external.
- **Who fulfills:** which fulfillment node / artist / external.

Any combination is valid. Real patterns to mock as presets:

- (a) Full GoodTunes Direct.
- (b) GoodTunes presses + fulfills, artist's Shopify sells — the reason artists want this is that Spotify merch linking only works through the artist's own Shopify store, so pre-orders surface on their Spotify pages; document that rationale in the mock.
- (c) Fulfillment-only — externally pressed stock intaken to a node, artist's Shopify sells, GoodTunes ships.
- (d) Digital + Signed GoodDeed only.

**Shared vs. per-channel:** track order, artwork, and previews are shared — edited once, inherited everywhere. Sunrise/sunset windows and buy-button routing are per-channel. Sharing/referral always routes friends to the GoodTunes player and preview; the buy button routes wherever the artist configured (GoodTunes checkout or their Shopify product URL). We never send share traffic to Shopify previews.

**GoodTunes Direct — sunrise triggers:** dedicated page live, private player live, Signed GoodDeed window opens (if chosen).

**Sunset:** private player stays live for buyers forever. Mock both dedicated-page outcomes — "Sold out" state vs. persisting for trailing fulfillment with a cutoff (date or count) on Signed GoodDeeds; Signed GoodDeeds are window-bound and batch-signed, never inventory. Mock the Evergreen conversion path at sunset.

**Pre-save / launch:** pre-save has its own sunrise/sunset with per-service links; launch has sunrise with per-service links. Project-level dates, not channel-level.

### 6. Digital exclusives (new concept)

Player-exclusive content: instrumentals, acoustic/alternate versions, bonus tracks — streamable only in the GoodTunes player, flagged non-exclusive on paper (artist can release elsewhere later). This is the structural answer to "what does the player offer once the album is on Spotify." Mock as an asset flag plus a player section.

### 7. Physical add-ons at the variant level

Signed, numbered physical inserts (lithographs, art prints, Polaroid-style single-art sets) are distinct from Signed GoodDeed certificates and attach to a variant as add-ons. Custom add-ons already exists in nav — connect it here rather than inventing anything new.

## Cross-cutting decisions (all locked — reflect in mocks, do not re-litigate)

- **Where things attach:** manufacturing payments and quotes → press run (format + variant + press). Digital entitlements and comps → project. Orders → sales channel, drawing against an allocation pool at a fulfillment node. Customers roll up to project.
- **Locks:** per-asset and per-format, not album-wide. Audio can be locked while a new variant is still configurable.
- **Migration:** every existing album becomes a project with one format, one variant, one channel. No archaeology for artists.
- **Estimate snapshot rule stands:** open estimates snapshot component prices at creation; price changes show "pricing changed, refresh," never silent mutation.

## How this connects to pricing

This structure is the foundation for the estimate engine frame already agreed: one engine, two lanes (GoodTunes flat packages / component custom quotes), four lenses (artist, press, super admin, label-future), two pricing modes per press (flat package grid with tri-state tiers vs. component pricing), package = preset of components. Quotes attach at the variant level. Don't draw pricing screens in this pass — just make sure the hierarchy gives quotes a clean place to live.

## Deliverable

Playground flow mocks for:

1. Project creation → asset upload → format setup
2. Adding a variant
3. External inventory intake with node selection and allocation pools
4. Sales-channel configuration showing the three axes with the four preset patterns
5. Sunset states including Evergreen conversion
6. A digital-exclusives section in the player context

Natural-scale sections, one region at a time. Nothing merges, nothing ships.
