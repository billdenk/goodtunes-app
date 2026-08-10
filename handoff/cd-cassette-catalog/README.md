# CD + Cassette Catalog — Design Handoff v1 (Aug 10, 2026)

This folder is the **single source of truth** for the new Apple-canon CD and
Cassette catalog pages:

1. **`CDCatalogBuildDesktop.tsx`** — the press/admin "Catalog → CD" build page.
2. **`CassetteCatalogBuildDesktop.tsx`** — the press/admin "Catalog → Cassette" build page.
3. **`assets/`** — every image these pages use (product photography, logos).

Same rules as `handoff/press-catalog` v2: these files are copied
**character-for-character**; the receiving side only wires real data. Never
treat them as references to match — replace presentational code verbatim, swap
`MOCK_` data for live data, done. Acceptance is a top-to-bottom visual diff at
1440px; any difference other than data values is a failure.

## Rule zero: these two files ONLY

Older portrait/tablet CD & cassette mockups exist in the design playground.
They are **stale and superseded** — do not use anything from any earlier CD or
cassette mock, screenshot, or PR. If a tablet/mobile layout is needed later, it
will come as its own handoff; until then these desktop pages are the only canon.

## Where the pages live

- Catalog tab (press portal AND super-admin — same component serves both):
  heading "Catalog", then Vinyl / CD / Cassette pills.
- The CD and Cassette pills become **enabled and tappable**, routing to these
  pages. Vinyl keeps the already-shipped v2 catalog page.
- Sidebar, top bar, page header, and the Vinyl/CD/Cassette pill row in these
  files match the shipped vinyl page — diff against it, do not re-derive.

## No data model exists yet — define it from these pages

CD and cassette have no schema in the app today. The `MOCK_` consts at the top
of each file are the contract:

- **CD** (`MOCK_CASES`, `MOCK_PRINTS`, `MOCK_SPOT_COLORS`): case (Sleeve |
  Jewel case) → print (Silkscreen | Full-color offset) → booklet (jewel only:
  None / 4 / 8 / 12 panels) → per-quantity run pricing. Silkscreen carries up
  to 3 spot colors per build; presses can add custom spot colors (name + hex).
  Every CD is a 12&nbsp;cm silver disc — no size, no type, no color builds.
- **Cassette** (`MOCK_CASES`, `MOCK_SHELLS`, imprints): case (J-card + case |
  O-card slipcase) → shell (8 stock colors) → imprint (On-shell print |
  Sticker label) → per-quantity run pricing. Tape length is set by the album's
  runtime (C-30 up to C-90), never picked.

## Interaction canon (already built into the files — keep it)

- **Silkscreen is the default print** and the print section rests collapsed as
  a summary row ("Silkscreen · n of 3 colors" + blue Change) — the exact
  collapse pattern the vinyl type pick uses. Picking a print re-collapses it.
- **Spot colors ink the disc live.** First pick fills the whole face; a second
  pushes the first into an outer ring; a third gives three bands — outermost is
  always the first pick, and band boundaries are equal-area so inks read as
  even shares. Deselecting reflows the bands. The tint multiplies over the
  white-disc photo so the sheen shows through.
- **Add color** is the same dashed "+" tile as vinyl's color pick: popover with
  a color input and a name, new ink joins the grid and auto-selects if a band
  is free.
- **Spot swatches are vinyl's swatch cards** — 48px glossy ball, check badge,
  blue border when selected. Not pills.
- **Cassette default shell is Black.** The shell photo carries a faint 1px rim
  light (drop-shadow tracing the cut-out silhouette — never a border box) so
  black separates from the dark page. No other shadows on the shell.
- **Hero geometry:** the left column is sticky and the composition + caption
  lock-up is vertically centered between the hairline rule and the bottom of
  the viewport — equal space above and below, measured on the visible pixels.
  The disc peeks from the sleeve and slides out on hover (0.45s ease).
- Case photography: black MRP sleeve with inverted logo (CD), black MRP J-card
  (cassette). Product photos are real cut-outs in `assets/` — never rebuild
  them in CSS.

## Zero data loss / no regressions

- Do not touch the shipped vinyl catalog page except to enable the CD and
  Cassette pills that route to these new pages.
- Status indicators anywhere on these pages are dot + label, never color-only.
- Copy is final — headings, captions, and helper lines ship exactly as written.
