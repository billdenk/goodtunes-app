# MRP SOW vs. GoodTunes — ask-by-ask status (Monday edition)

MRP SOW Rev 1.0 (Aug 16, 2026) · Otis gap audit Aug 20 · **updated Aug 22 for the Monday session**

Copyright © 2026 GoGoods® Inc. All rights reserved. GoodTunes® and GoodDeed® are registered trademarks of GoGoods Inc. Confidential — prepared for the MRP working session.

**Legend** — **Exceeded**: we go well past what they asked · **Met**: works as specced · **Met differently**: same need, our design; defensible in the room · **Config**: loads when we set up MRP's catalog · **Done for Monday**: built/being finished this weekend · **Phase 2**: post-launch scope for the definitive agreement.

| # | MRP's ask | Status | GoodTunes |
|---|---|---|---|
| 1 | Landing page: Short Run vs. Standard Order | **Exceeded** | Short Run is a preset package the customer picks before the builder — a fixed configuration at a fixed price. MRP's Short Run preset loads with their catalog; adding a second preset takes minutes, not a build. |
| 2–3 | Short Run constrained mode + option locks (12"/140g/Black or Eco/CMYK label) | **Exceeded** | The preset package *is* the constrained mode: everything locked except what the press leaves open. Preset quantities (100) with optional add-a-quantity blocks are in design now. |
| 4 | Assembly touch fee per insert / download card (short run) | **Monday discussion** | Generic assembly line exists today; MRP tells us Monday exactly how they want the per-item fee expressed, and it lands as catalog config. |
| 5 | Quantity: free entry 100–5,000, steps of 100, +/− steppers | **Done for Monday** | Free entry validating to multiples of 100, priced at the price break the customer has earned — 700 copies get the 500-break unit price. Same honest math their CS team does by phone today. |
| 6 | Single scrollable form with prerequisite gating | **Met** | One continuous form; later sections unlock as prerequisites are picked. Exactly their Option-B ask. |
| 7 | Project type: Single LP / Double LP | **Exceeded** | We support 1/2/3/4-LP including box sets. |
| 8 | Formats 7"/10"/12" with format-forced weights | **Config** | Sizes and weight gating built; forced 49g/110g per format is set during MRP catalog load. |
| 9 | Metalwork cutting selector (DMM / MRP lacquers / customer lacquers) | **Done for Monday** | Customer-facing three-way selector; the estimate swaps and reprices the cutting/plating setup lines live. Press picks the default. |
| 10 | Test pressing static text ("5 test pressings") | **Met differently** | Ours is a priced setup line in the estimate, not just copy. Better. |
| 11 | Vinyl color/effect as image grid, format-dependent | **Exceeded** | Photo swatch grid, size availability per color, auto-fallback on size change — and MRP edits all of it themselves. Their SOW has a webmaster hardcoding lists. |
| 12 | Splatter add-on conditional on base color | **Met differently** | Splatter is a color family with size/quantity conditions (incl. 2-color). (Their SOW's splatter logic references colors they deleted — their error.) |
| 13 | Center labels: Blank / Black Flood / B&W / CMYK | **Met + Config** | Blank/B&W/Full Color tiles with live disc preview; Black Flood is a catalog row. |
| 14 | Inner sleeves, format-dependent stock lists | **Met + Config** | Six sleeve styles plus polylined variants, press-editable; their stocks load as config. |
| 15 | Jackets by project type AND format (incl. trifold, 7" double LP) | **Met + Config** | Jackets keyed by size with variants; gatefold live. Trifold + 7" double-LP rule verified during catalog load. |
| 16 | Printed inserts + 100# board upgrade checkbox | **Config** | Insert family built (single/double-sided, booklet, poster, size-filtered); board upgrade loads as a variant. |
| 17 | Booklets, 10"/12" only, 8/12 pages | **Met + Config** | Booklet insert with size filtering; page counts are catalog rows. |
| 18 | Download cards (generic / custom B&W / custom CMYK) | **Config** | Same machinery as stickers and inserts; loading with their catalog. |
| 19 | Download card hosting | **Exceeded** | We don't host a card + ZIP — we're the whole digital delivery: player, fan accounts, streaming, offline, GoodDeed. (Card still available per #18.) |
| 20 | Matte AQ / Gloss UV finishes + barcode generation | **Config / on request** | Finish options load as catalog rows; barcode generation stays available on request. |
| 21 | Up to 2 stickers, color→stock→shape chain | **Partial config** | One sticker slot with shape families + size grids today; second slot and stock chain are small follow-ons. |
| 22 | UPC sticker, two sizes | **Met + Config** | UPC family exists; second size is a row in the size grid. |
| 23 | Outerwrap selectable (shrink / polybags / PVC) | **Partial config** | Shrink-wrap auto retail-ready today; selectable outerwrap family is a small follow-on plus catalog rows. |
| 24 | Auto-generated assembly summary bullets | **Met differently** | The itemized estimate — every line conditionally driven by selections — *is* the assembly summary, with prices. |
| 25 | Continuous TOTAL + UNIT price | **Met** | Pinned running total; recomputes live on every change. Their stretch goal, standard for us. |
| 26 | Final breakdown: qty / unit / total | **Met** | Per-unit, run subtotal, setup, total — in builder and customer link view. |
| 27 | Next-price-break display | **Done for Monday** | "At 1,000 copies this drops to $3.61 each" — nudge beside the running total; the break math was already live. |
| 28 | Pricing from CODA ERP via API + spreadsheet fallback | **Phase 2** | Day one: their pricing loads via CSV with full press editing and sync-lock (their "spreadsheet fallback," but live and self-serve). Live CODA connector = named post-signing milestone. |
| 29 | Public customer-initiated RFQ form | **Done for Monday** | Public self-serve entry on MRP's own branded host, feeding the same estimate records. |
| 30–31 | Submit emails CS + submitter, with PDF summary | **Exceeded** | Better than an attachment: the estimate email links the customer into their branded estimate page, where they download a designed, always-current estimate PDF. Attachments go stale the moment a price changes; the page never does. |
| 32 | Backend platform, unique ID per submission | **Exceeded** | They asked for a submissions inbox; we have full estimate records with IDs, status, lifecycle, and the entire platform behind it. |
| 33 | Live mock-up: record + label + jacket | **Met** | Shared vinyl preview — jacket art, layered/photo disc render, center label, press placeholder defaults. |
| 34 | Color photos + variant dropdown updating mock-up | **Met** | Photo swatches per color, families with variants, live preview updates. |
| 35–36 | Center label + jacket artwork upload onto mock-up | **Exceeded** | Real artwork runs through the template builder + instant review: dieline-aware, press-certified, preflighted. Their ask is a circle-cropped PNG. |
| 37 | Mock-up image in quote emails + PDF | **Done for Monday** | The estimate email and downloadable estimate carry a server-rendered mock-up of the customer's actual record — their art on the jacket, disc, and center label; press placeholder when no art yet. |
| 38–39 | Embedded on MRP's WordPress site + test/UAT instance | **Met** | White-label per-press hosting is live: MRP's own branded domain, responsive UI, dev + production, view-as, preview links. Their WordPress site links or embeds it. |

## Bottom line for Monday
Of 39 asks, **nothing MRP specced is beyond the platform**, and after this weekend nothing is open either: the column splits into *already exceeded* (the platform itself, self-service catalogs, template certification, digital delivery, the backend they asked for as a feature), *loads with their catalog*, and *done for Monday* (free quantity entry, metalwork selector, price-break nudge, Short Run presets, mock-up in the estimate email, public entry, white-label hosting). The only items that wait on MRP are #4 (they specify the fee Monday) and the CODA connector, which was always a post-signing milestone.

Beyond every row above, their SOW never imagines: the component system, price-snapshot estimation, press self-service, the customer conversion path from estimate to funded project, template certification with instant review, the digital delivery platform, or the order/fulfillment rails. That's the second half of the demo.
