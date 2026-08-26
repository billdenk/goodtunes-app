# PMP build brief — Physical Music Products white-label
**From:** Bill & Andrew (composed in the Playground design studio) · Aug 26, 2026
**Relationship to the MRP brief:** docs/handoff-briefs/mrp-build-brief.md defines the phased build and the white-label skin SYSTEM (Phase 0). PMP is the second tenant of that same system — build it as brand tokens + assets on the shared skin, never as a fork. Everything in the MRP brief's ground rules, phases, money walls, and copy canon applies verbatim; this brief only lists what is PMP-specific.

## Brand tokens
- Accent: green #6CA460, fills carry WHITE text. One filled green action visible per page at a time.
- Corner style token: SQUARE across the whole skin (buttons, inputs, cards, pills); only true circles (avatars, status icons) stay round.
- Canvas: pure white #ffffff, ink #1d1d1f, subink #6e6e73.
- Type: Poppins on site-chrome screens (sign-in header/footer); portal screens follow the shared portal type scale.
- Tagline (GoodStudio lens): "Nashville green, handcrafted."

## Logo assets (exact rules — these bit us twice)
- pmp-icon.svg is DARK artwork. On black bars it must be whitened with CSS filter brightness(0) invert(1) — brightness(0) FIRST; a plain invert leaves a color tint.
- pmp-logo.svg is WHITE artwork — needs invert on light surfaces, none on dark.

## Chrome
- SIGN-IN screen wears PMP's real site chrome: solid #000 header (white icon + "Physical Music Products" wordmark, "About us", Instagram/Facebook white glyphs, cart + 0, OUTLINED green "Get in touch" — outlined so the page's one green fill stays the Sign in button), and the GREEN minimal footer: logo + "Physical Music Products · pmp.makesvinyl.com" + "Powered by GoodTunes", dark ink, unfiltered dark assets.
- ALL signed-in portal screens: BLACK top bar (#000000; frosted bars = rgba(8,8,8,0.92) + blur), white ink, hairlines rgba(255,255,255,0.14), whitened PMP icon + white "Physical Music Products" on the left, Feedback + account avatar on the right. Compact black in-app footer bar.
- Rail: white interior, Team follows the nav list after a hairline (never pinned to viewport bottom).

## Press persona (all dummy data uses this — never MRP's people)
Jonathan Hibma · customerprojects@physicalmusicproducts.com · 615-600-7299 · Nashville, TN (no street address in mocks).

## Catalog & pricing facts (from docs/vendors/pmp.md)
- Vinyl line: Black (4 colors) / Color (18) / Splatter (12). NO translucent, NO EcoMix — never show MRP's line on PMP surfaces.
- Premium handcrafted specialist; record-line-only pricing; 10% broker discount applied at lookup; real anchors only at 500/1000 for 7"/12" Black + Color; Splatter = Color × 1.41; turnaround "not stated — request from CSR".
- White-label = colors + logo + tokens only. Geometry, flow, and step order are the shared GoodTunes system.

## Screens
All 19 PMP screens exist as locked twins in the design studio (GoodStudio launcher → Physical Music Products lens) and arrive as verbatim handoff files per phase, same as MRP. Build order: same phases as the MRP brief.

## Known issue (flagged, pending Andrew)
The five PMP estimate screens currently spec "Ruby translucent" inherited from the MRP originals — translucent is not in PMP's line. The design studio will re-spec them (likely to a Color or Splatter pressing) before those files are exported; do not treat the translucent spec as canon.

Questions beat inventions — anything ambiguous comes back to Bill & Andrew.
