# Press Catalog — Package Pricing (approved design handoff)

    Approved Apple-style replacement for the press admin **Catalog** page, designed in the GoodTunes Playground.

    ## What this screen covers (parity with the current Catalog page)
    - **Pick a size** — 7" Single / 12" LP / 12" Double LP as selectable cards.
    - **Pick a type / color** — vinyl type cards (Black, Opaque, Translucent, Splatter) with per-type color swatches; "Add color".
    - **Name your price** — vertical per-run price list (100 → 10,000 units); each run is Priced / Quote / Off (hover reveals the mode picker; Off rows are tinted). One price covers all colors in the type. Replaces the eye-toggle qty ladder.
    - **Turnaround** — "Order to ship", min–max weeks.
    - **Print templates** — Jacket / Inner sleeve / Center labels tiles; filled tiles show the filename (middle-truncated) with hover "Replace"; empty tiles are the dashed "Upload or paste a link" invitation. (Booklet can be added as a fourth tile.)
    - **Audio spec** — "What the lathe can cut": min bit depth, min sample rate, longest side per size at 33⅓/45 RPM. Blank = inherit press default (gray placeholder). Drives the album audio preflight.
    - **Save model** — single "Save catalog" button + quiet "Edited / All changes saved" text. No per-section save buttons.

    ## Integration notes
    - File is a self-contained React + Tailwind mockup (local state, seed data). Wire state to the real catalog API; keep the interaction patterns.
    - Tokens: BLUE #319ED8, INK #1d1d1f, SUBINK #6e6e73, HAIRLINE #e6e6ea, CANVAS #f5f5f7. Use the GoodTunes design-system tokens where the app has them.
    - **Dark mode required** in the app implementation — admin dark is charcoal (per the design system's operator canon), not fan navy.
    