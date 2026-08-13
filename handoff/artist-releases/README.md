# Artist Releases layer + draft flow — blessed mocks (Ruby, Aug 13 2026)

    Build task: #3105 (re-create per Andrew). Design brief: docs/releases-draft-flow-design-brief.md.
    Build these VERBATIM — both themes ship via the THEMES map in each file; the floating
    "View light / View dark" pill is mock-only chrome, never ship it. Artist portal default = LIGHT.

    Files (each self-contained except noted):
    - ArtistReleasesIndex.tsx — Releases list. Rollup badge is ALWAYS DERIVED from lanes
    (deriveRollup in this file is the reference grammar): multi-lane middot clauses
    ("Digital live · Vinyl draft"), single words Sunset / Draft / Empty. Sunset rows render
    dimmed; sunset lanes show NO pricing chip; active physical lanes without confirmed press
    pricing read "Pricing pending" — never $0.00, never real MRP numbers.
    - ArtistReleaseNew.tsx — same list with the name-only New Release modal open
    (imports from ./ArtistReleasesIndex — ship the pair together).
    - ArtistReleaseDetail.tsx — CALIFORNIALAND lanes view + Create Draft format picker
    (Vinyl / CD / Cassette cards) in a portal modal, gray-circle × close.
    - ArtistReleaseDraftBuilder.tsx — top of the Build-a-Quote builder inside a draft:
    crumb Releases → CALIFORNIALAND → Vinyl draft, ambient "Saved just now" (NO Save button),
    auto-save naming "<Release> — <Format>" ("… — Vinyl 2" for a second), 12" default,
    "Est. — pending pricing" strip and per-line "Pricing pending" chips.

    Statuses are always word + dot/shape — never color alone (founder is colorblind).
    Assets in ./assets/. Out of scope: sharing/estimates, real pricing, submit-to-press.
    