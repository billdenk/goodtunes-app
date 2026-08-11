# Press Specs handoff — Aug 11 2026

    Three screens. Copy the presentational code VERBATIM — replace presentational code character-for-character; wire data only. Dummy data lives in the MOCK_ consts at the top of each file; those values (and the two image imports) are the ONLY things you swap.

    ## Screens & placement
    1. PressSpecsAudioDark.tsx — press portal, Catalog › Specs, Audio view (default). Vinyl / CD / Cassette switcher swaps the body; all three states are reachable in the mock.
    2. PressSpecsArtDark.tsx — press portal, Catalog › Specs, Art view. NO format switcher and NO per-component tabs — one set of art rules for everything; templates upload with each component and carry their own dimensions.
    3. SuperAdminPressSpecsDark.tsx — super-admin, Presses › [press] › Catalog tab. A quiet section pull-down next to the "Catalog" heading picks GoodTunes Packages / White Label / GoodDeed Certificates / Specs; with Specs chosen it renders the SAME specs page the press sees (Audio · Vinyl shown). The pull-down is wired in the mock (click to open/close).

    ## Shared header contract (both portals, both views)
    - Row 1: Audio | Art segmented control left · Save right.
    - Save starts as a QUIET GRAY OUTLINE (disabled) and only becomes the screen's one filled blue pill once a change is made. Never render filled blue in the idle state.
    - H2: Specs. <quiet>The numbers artists press against.</quiet> — 30px, -0.02em, two-tone. Same heading on Audio and Art.
    - Vinyl / CD / Cassette (Audio only) sits BELOW the shared header, smaller (h-7 track, p-0.5), left-aligned.

    ## Wired vs decorative
    - Wired: Audio format switcher (all 3 bodies), super-admin section pull-down.
    - Decorative: Audio|Art toggle (each view is its own file), Save (disabled by design), rail/nav, search, notifications.

    ## Assets
    - mrp-logo.svg → each press's own label mark (as already done for Catalog).
    - goodtunes-logo.png rail footer: tiny 9px caps "Powered by" + logo image with filter: invert(1) brightness(1.8) — identical to the existing press-portal footer, no drift.

    Acceptance: full-page top-to-bottom diff at 1440px; any visual difference other than data values is a failure.
    