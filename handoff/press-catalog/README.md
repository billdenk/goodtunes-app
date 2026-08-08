# Press Catalog + Artist Package Builder — Design Handoff v2

This folder is the **single source of truth** for the new Apple-canon design of:

1. **`PressPackagePricingCatalog.tsx`** — the press/admin "Vinyl catalog" page (sizes, types, colors, price ladders, turnaround, print templates, audio spec).
2. **`PressAlbumPackageBuilder.tsx`** — the artist-facing "Design your package. See what it earns." page (album, size/vinyl/color, price + earnings receipt, Signed GoodDeed®, print templates, share).

v2 supersedes the v1 handoff (PR #3). Where v1 and v2 disagree, **v2 wins.**

## Rule zero: no mixing old and new

The current app blends old components with new styling. That reads as broken.
**Each of these two pages must be replaced wholesale** — every section on the page comes
from this handoff's markup, spacing, and copy. If a section exists in the old page but not
here (or vice versa), see the parity checklist below; do not carry over old markup,
old cards, collapse bars, or old headers into the new pages.

## Visual canon (both pages)

- Tokens: BLUE `#319ED8`, INK `#1d1d1f`, SUBINK `#6e6e73`, HAIRLINE `#e6e6ea`, CANVAS `#f5f5f7`, light heading gray `#a1a1a6`.
- Headings are two-tone: bold ink lead + gray rest ("One price. **The whole record.**" pattern — see `TwoTone`).
- Cards: white, `border-radius: 16px` (rounded-2xl), 1px hairline borders, no heavy shadows.
- Receipts are vertical hairline lists (label left, tabular-num value right), never dense grids.
- Selected state: 2px BLUE border + blue label; unselected: 1px hairline.
- System font stack (SF on Apple devices). No emojis, no gradients except the subtle Artist Net strip.
- Dark mode (admin surfaces): **charcoal, never navy.**

## The album cover must fit the vinyl

The old app shows a stretched/misfit cover next to the record. The new canon:

- Album art is **center-cropped to a square** (`object-fit: cover; aspect-ratio: 1/1`), never stretched.
- The jacket + disc are one composed unit (`JacketStage`): square jacket in front, disc peeking out to the **right** by ~22% of jacket width, disc diameter ≈ jacket height, soft floor shadow underneath.
- Jacket size follows the selected format (7" renders smaller than 12").
- The disc color/type re-renders live from the current selection (translucent tint, splatter speckles, etc.).
- The **GoodDeed mini certificate** in the Signed GoodDeed card is composed live from the same cover (orange frame, square art, navy plate) — never a static image, so replacing the cover updates it automatically.
- Placeholder covers (press logo art) are fine at project creation, but the moment real art is uploaded, everything — jacket, GoodDeed mini, banner thumbnail — reflects it.

## Zero data loss (unchanged from v1, still binding)

Restyle, don't reset. Before removing any old page, verify field-for-field parity against live data:

- Keep ALL existing color tiers and names (e.g. "T01 Ruby"), swatch thumbnails, per-quantity pricing (the eye toggle maps to Priced / Quote / Off), art/template uploads, turnaround overrides, audio specs.
- Fields that existed in the old app and are now designed in v2 (add them, never drop them):
  - **Booklet** print-template slot (4th tile).
  - **10" longest-side** audio spec row.
  - **Notes** field on the audio spec card.
  - Vinyl types **Mix/Swirl**, **Splatter — 2 Colors**, **Black Splatter — 2 Colors** (each with its own price ladder).
- The catalog's type/color/price data comes from the press's real records — the arrays in these files are stand-in seeds proving the layout at 7 types.

## Artist page specifics (PressAlbumPackageBuilder)

- No collapsible summary bar; the page is one scrolling flow with a quiet album banner (title · artist · tracks · "Invited by <press>" · status).
- No Artist input field — the artist is known from the invitation.
- Earnings receipt: Retail → Profit per unit (with expandable cost breakdown: Manufacturing / Publishing per track / Payment processing / GoodTunes) → Base earnings → GoodDeed line → **Artist Net** hero number.
- GoodDeed section: "GoodDeed®. Make it collectible." / "Every record includes a free certificate. Add a signed premium tier below." Card = "Offer Signed GoodDeed®" with toggle; when on: Certificate price stepper, **How many** (No limit / Limit quantity + cap stepper, never more than one per vinyl sold), profit-per-certificate receipt with expandable cost ($12 manufacturing & shipping + payment fee), and the + total strip.
- All math is live and honest — every number recomputes from retail, run, tracks, certificate price, and cap.

## Definition of done

- Both pages match these files section-for-section at 1440px and hold at narrower widths.
- Old pages removed only after the parity check passes against production data.
- Dark mode audited (charcoal), covers verified square-cropped, GoodDeed mini renders from live art.

    ## Placeholder cover art

    - `assets/pmp-icon.png` is the press's icon (white, transparent, square) — the concentric-groove PMP mark.
    - Use it ONLY as the placeholder album cover when a project has no uploaded art yet: white icon centered at ~45% width on an INK (`#1d1d1f`) square jacket, exactly like the MRP placeholder pattern in the handoff files.
    - The moment real album art exists (e.g. Niina's CALIFORNIALAND cover), the placeholder must never appear — jacket, GoodDeed mini, and banner thumbnail all use the real art.
    