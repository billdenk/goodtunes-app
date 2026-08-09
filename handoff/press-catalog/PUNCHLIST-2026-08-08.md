# Press Catalog cleanup — punch list (2026-08-08)

    **Scope: the live press "Catalog" page (Vinyl catalog · Package pricing) as seen in the MRP portal.**
    Reference source of truth: `PressPackagePricingCatalog.tsx` in this folder (refreshed today from the Playground's blessed `PressPackagePricing.tsx`). Rule zero from the v2 README still applies: replace the page wholesale from the reference — do not mix old and new markup.

    Two live screenshots drove this list (MRP portal, Aug 8 2026): the Catalog page at 7" Single and at 12" Double LP.

    ## Punch list — live vs reference

    1. **Left preview is broken.** Live shows a flat white jacket placeholder over a plain black disc. Reference: photographic vinyl render with the press's center label, caption "Classic Black · Black · 12\" LP", and the "One package. Everything included." card beneath. Restore the reference's JacketStage/preview composition, including the 7" note "Printed jacket included."
    2. **Size picker regressed to big tiles.** Live renders "Pick a size." as three large cards. Reference uses the quiet segmented PRODUCT TYPE control (7" Single / 12" LP / 12" Double LP) with the "12\" · 33 1/3 RPM" annotation beside it. Remove the card version and the extra FORMAT "Vinyl" dropdown above it.
    3. **Type grid is unbounded.** Live shows every type as a top-level tile (12+ tiles: EcoMix, Neon/Glow, Smoke Blends, Cream Blends, Metallic Blends, Standard Blends, Deluxe Blends, Double Double, ...). Reference shows FOUR tiles (Black / Opaque / Translucent / Splatter) with the rest behind "+ More types". Also: tiles must read "N colors · M of 6 runs priced" — live drops the runs-priced line.
    4. **"Black · 0 colors" bug.** Black must carry its own colors (e.g. Classic Black / Midnight / Jet) and count them. A type with 0 colors should not render as selectable-empty; "Pick a color." must never present only an empty dashed Add-color box for a stocked type.
    5. **Pricing section lost the ladder.** Live "Name your price. Black · 12\" Double LP." shows a lone qty/price row (100 / $45.00). Reference prices per run size with the full quantity ladder per type. Restore the ladder layout and copy.
    6. **Header duplication.** Live stacks a "Catalog" page title + long subhead above the "One price. The whole record." headline, with "Add your vinyl" top right. Reference has only: eyebrow VINYL CATALOG · PACKAGE PRICING, the two-tone headline, one-line subcopy, and the save cluster (All changes saved · Save catalog) with CSV Options. Remove the duplicate title block and the "Add your vinyl" button.

    ## Reminder
    - Tokens and canon per the v2 README (BLUE #319ED8, INK #1d1d1f, hairlines, two-tone headings, rounded-2xl cards).
    - This applies to every press portal (MRP and Pressing Business alike) — the page is shared; only branding/data differ.
    - Numbers in the reference are placeholders; keep live data wiring, replace presentation.
    