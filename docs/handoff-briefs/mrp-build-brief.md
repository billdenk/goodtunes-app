# MRP build brief — start building Memphis Record Pressing
**From:** Bill & Andrew (composed in the Playground design studio) · Aug 26, 2026
**Status of the design side:** the full MRP screen set is designed, client-reviewed, and locked in the Playground (GoodStudio launcher → Memphis Record Pressing lens). This brief sequences the build. Screen code arrives per phase as verbatim handoff files under handoff/ — per handoff/README-template.md law, never rebuilt from screenshots.

## Ground rules (read first)
- handoff/README-template.md — the handoff law: delete-first, copy handoff files character-for-character (swap MOCK_ data only), states checklist both themes at 1440px, "Must work" wiring lists, questions beat inventions.
- handoff/style-guide/apple-canon.md — the blessed operator/partner style.
- docs/STATUS.md — record each page's handoff commit SHA in the ledger.
- Copy canon: "estimate", never "quote", on every artist-facing surface (press-side send button says "Send estimate" too). Real ® character. No emojis. Commas in dollars. Statuses are always word + icon, never color alone. Sentence-case headings. One filled accent action visible per page at a time.

## Phase 0 — white-label skin system (foundation, everything hangs off this)
Per-press brand tokens, gated by the existing entitlement flag (white label off | requested | on):
- Accent color + ink-on-accent. MRP: gold #D9C153 with DARK ink #1d1d1f on fills (like their own "Get a quote" button — never white text on gold).
- Corner style token in Settings › White Label (Rounded / Square). Memphis = SQUARE, applied across the WHOLE skin — buttons, inputs, cards, pills; only true circles (avatars, status icons) stay round.
- Canvas: MRP surfaces are LIGHT — pure white #ffffff, white cards, ink #1d1d1f, subink #6e6e73, black hairlines. Never GoodTunes charcoal. MRP logo stays black on light (no CSS invert).
- Type: stylesheet-first from memphisrecordpressing.com (Brooklyn theme): body Poppins 400 14px ls 0.07em; top bar 40px row 12px #333; nav Poppins 600 12px ls 0.05em uppercase.
- View-as is a pane of glass: admin "viewing as press" renders the press's exact components.

## Phase 1 — client estimate flow (the wedge)
Screens (handoff files to come, in this order): client estimate page (sticky 56px repricing header — logo left, spec + per-unit/total right; "Start this project" appears in the bar ONLY after the original CTA scrolls off, IntersectionObserver), short-run variant, estimate email (600px static column, ONE filled button, numbers fully expanded; sent via GoodTunes on behalf of the press, reply-to = the press contact), accepted state, PDF download, MRP-branded sign-in → artist portal next-steps.
Model rules: estimate-not-quote lifecycle pill (Estimate → Selling → Window closed → At press → Shipping → Delivered); login-gated estimates, no public URLs, rate-limited (placeholder 10/artist/rolling 7 days); pricing-changed snapshots refresh explicitly, never silently.

## Phase 2 — artist portal, MRP skin
Dashboard, dashboard next-steps strip, project home (+ dark twins — dark AND light always).
- Portal top bar: left side = the PRESS's logo + "Memphis Record Pressing" (never the artist's own identity); right side keeps Feedback + account avatar.
- Left rail canon: search with flush-right ⌘K chip; Dashboard, Releases, Audience, Acquisition, Orders, Buyers, Referrals, Shopify, Reports; Team follows the list after a hairline (NOT pushed to viewport bottom — the big gap was rejected); rail interior plain white, accent-colored hairline rules only.

## Phase 3 — package builders
- Desktop + mobile artist package builder: featured packages up top (press-priced cards, "From $X.XX /unit at {min-run}"), build-from-scratch below.
- Scratch step order: size (12"/10"/7", in that order) → discs → weight → CENTER LABEL (customer options exactly two: Full color +$0.55/unit, Black & white +$0.15/unit; Blank exists internally only — never shown to customers) → vinyl type → inner sleeve → cover → inserts → quantity ladder LAST ("watch the price drop"; heading is just "Price.").
- MRP vinyl line: Black (6), Splatter (24), EcoMix (14), Translucent (30) — color counts shown, artists never see hex.
- Scratch mode is ART-FREE: neutral black vinyl, generic SAMPLE label, grayed placeholder jacket/sleeve. Featured packages keep real art. Never presumptive art anywhere.
- Dead run tiers visibly dead: ~0.35 opacity + tooltip saying why.
- Minimum run is the pricing anchor: every per-unit price reads "From $X.XX /unit at {min}".

## Phase 4 — sticker placement
From MRP's Vinyl BOM: 3×3 grid per jacket side, plant codes F1–F9 / B1–B9 read left-to-right top-to-bottom. Artist taps a zone on the jacket; plant code is a quiet caption ("Position F3 — front, top right"). Sticker sizes 2" / 2.5" / 3" / 4", previewed true-to-scale against the 12.375" jacket. Barcode sticker = quiet placement-only row. One filled gold "Save placement".

## Already-sent run-sheet items that fold into this build
(docs/handoff-briefs/mrp-demo-monday-runsheet.md)
- Create side of the rail needs a Packages entry (Create = builders: Estimates AND Packages; Product Specs › MRP Packages stays the saved catalog).
- Estimate math (Run / FULL RUN TOTAL) must not leak into the package builder bottom — that surface shows specs + per-record roll-up only.

## Money rules (walls)
- 50¢/unit press conversion incentive: quiet press-side sub-line at send/invite only — never in the artist's pricing math.
- GoodDeed® / NPO give-back: GoodTunes' pocket, never in the artist's pricing math.
- GoodTunes Packages are untouchable per press; seed MRP components from their existing GoodTunes Packages work.

## Out of scope for now
CD/cassette (no model yet), per-press From: email domains (DNS/SPF/DKIM parked), Evergreen (separate urgent brief), GoodStudio launcher itself (design-studio tool, not Otis).

Questions beat inventions — anything ambiguous comes back to Bill & Andrew, not silently adapted.
