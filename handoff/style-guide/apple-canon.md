# Apple Canon — operator & partner surfaces

Blessed 2026-08-07. This is the official visual language for GoodTunes
**operator (admin), artist, press, and NPO** surfaces. Fan-facing surfaces keep
the navy fan shell (see `theme-template.css` brand tokens) — this canon never
applies there.

Source mockups (reference implementations, in `artifacts/mockup-sandbox/.../mockups/`):
`AdminDashboardApple.tsx`, `AdminDashboardAppleDark.tsx`, `ArtistDashboard.tsx`,
`ArtistProjectHome.tsx`, `ArtistFirstRun.tsx`, `NpoFirstRun*.tsx`, press first-run set.

CSS variables for every color below ship in `styles.css` as `--apple-*`
(light on `:root`, dark on `.dark` / `.gt-admin-dark`).

## Palette

Light: canvas `#f5f5f7` (or `#fbfbfd` for airier pages), white cards, hairline
`#e6e6ea`, ink `#1d1d1f`, subink `#6e6e73`, faint `#a1a1a6`, segmented track
`#f0f0f2`, gray chip `#e8e8ed`.

Dark (**admin only — charcoal, NEVER navy or blue-tinted**): canvas `#161617`,
cards `#1e1e20`, rail `#1c1c1e`, hairline `rgba(255,255,255,0.10)`, ink
`#f5f5f7`, subink `#98989d`, faint `#6e6e73`, track `#26262a`, chip `#3a3a3e`.

One accent: GoodTunes blue `#319ED8`, used sparingly — primary CTAs, links,
active chart line, rank bars. Severity: critical `#e0245e`/wash `#fdeef2`,
warning `#c98a00`/`#fdf6e8`, ready `#1c8a5b`/`#eaf7f0` (dark: brightened
accents on ~14%-alpha translucent washes — see tokens).

## Typography

- Typography leads; generous air; nothing shouts. Inter/system sans.
- **Two-tone headings**: "Bold clause. Quiet clause." — semibold ink lead
  followed by a medium-weight subink continuation. Page h1 ~30px,
  letter-spacing -0.02/-0.03em; section headings 20–22px.
- Big numbers (KPIs) are large (≈38px), semibold, `tabular-nums`, tight
  letter-spacing — elegant, not loud.

## Buttons — the weight rule

- Buttons are **rounded-full pills**. Tiles choose; buttons act.
- **Only the ONE truly primary CTA per screen gets a filled blue pill.**
- All other actions — list/row actions, secondary links, header extras — are
  **quiet borderless text buttons** (blue for the main verb, subink for the
  rest) with a soft hover tint (`#f0f7fc` for blue, light gray otherwise).
  Rows of equal-weight labeled pills are NOT Apple.
- **Header utility actions (e.g. the Feedback button) are ghost pills** —
  rounded-full, subink text + icon, transparent with a light-gray hover tint,
  never filled blue. A filled Feedback pill would steal the screen's one
  primary slot. (Ratified 2026-08-07; all mockups updated.)
- Overflow actions on artwork/tiles: a single small frosted `···` circle
  (`rgba(255,255,255,0.88)` + backdrop-blur) revealed on hover, opening a
  small white rounded-xl menu. Never multiple labeled pills over artwork.

## Controls & chrome

- Segmented control: gray pill track (`--apple-track`) with a raised white
  active pill (`0 1px 3px rgba(0,0,0,0.08)` shadow).
- Modal close: small gray circle (`--apple-chip`) with a dark ×. Notification
  bells use the same gray-circle treatment.
- Header: sticky, translucent, blurred (`rgba(255,255,255,0.72)` +
  backdrop-blur; dark: `rgba(22,22,23,0.72)`), hairline bottom border.
- Nav rail: quiet gray surface (`#f5f5f7`; dark `#1c1c1e`), active item is a
  raised white pill (dark: lighter charcoal pill).
- Cards: white `rounded-2xl`, hairline border, no drop shadows at rest;
  hover may add a whisper of shadow.
- Bottom scroll-fade gradient on scrolling panes; hides at the bottom.

## Page layout (ratified Aug 11 2026)

- **Content container**: every operator/partner page uses one container —
  centered, `max-width: 1240px`, padding `32px 40px 96px`. Left and right
  gutters are equal (40px); content never hugs the rail while leaving a
  larger dead margin on the right.
- No per-page narrow caps (`max-w-3xl`, 720/920px wrappers, etc.). If a page
  looks sparse at full width, split it into columns inside the container
  (e.g. two-column form cards) instead of shrinking the container.
- **GoodTunes Packages (PressPackagePricingCatalog) is ratified as-is (Bill,
  Aug 11 2026).** It already uses this exact container — theme work (dark/light)
  is welcome, but do NOT change its width, padding, or internal column layout
  in any sweep.
- Individual text blocks may still cap their measure for readability
  (~640px for paragraphs), but cards, tables, and forms span the container.
    - **Containers fill the container (ratified Aug 11 2026).** Every card,
    form section, table, and content block spans the FULL width of the page
    container — never a narrower cap that leaves a dead gap on the right.
    If a card's content doesn't need the width, lay the content out in
    columns inside the full-width card; do not shrink the card. A page whose
    cards stop short of the right gutter while the container keeps going is
    a bug.

## Content patterns

- **Album/artwork collections**: Apple-Music-style cover-first tiles (~200px),
  whole tile is the click target, text (title/spec/status) always visible
  below, hover lifts the tile slightly and reveals the `···` circle.
  Archive is a header-level filter toggle, not a bottom section; archived
  tiles render dimmed inline. Archive-only — no Delete.
- **Ranked lists**: rank number in faint gray, thumb (projects = rounded-rect,
  presses = white circle logo), revenue right-aligned, thin blue progress bar
  aligned to the title column.
- **Activity feeds**: people get photo circles; partner logos always sit on
  WHITE circles, `object-contain`, small padding, never recolored or inverted
  (light or dark). Impersonal events get gray rounded-square icon chips.
- Status dots (green/gray) + short phrase for item state ("Priced — ready to
  press", "Draft — no artwork yet").

## Logos

- Only dark GoodTunes logo assets exist; in dark mode render white via CSS
  `filter: invert(1) brightness(2)`.
- Partner/press logos: never recolored, never inverted, always on white.

## Dark controls & surfaces

The dark admin canon (charcoal, never navy) extends to every control. Never
leave light-mode leftovers — a white input pill on a near-black card is a bug.

- **Surfaces**: page canvas `#161617`, rail `#1c1c1e`, raised card `#1e1e20`,
  inset chip / segmented track / input `#26262a`. Hairlines are white-alpha
  `rgba(255,255,255,0.10)` — never gray hexes.
- **Text**: INK `#f5f5f7`, SUBINK `#98989d`, faint `#6e6e73` (replaces light
  mode's `#a1a1a6`). BLUE stays `#319ED8` in both modes.
- **Inputs & pills**: rounded rects sit on the inset surface (`#26262a`) with a
  white-alpha hairline border and INK text; placeholders at white/30. Same
  geometry as light mode — only the surfaces swap.
- **Hovers**: `white/5` washes, never slate. Selection wash: a quiet dark blue
  tint (not light mode's `#f0f7fc`). Destructive hover: a dark critical wash.
- **Dashed "add" cells**: white-alpha dashed borders (light mode's `#c7c7cc`
  family never appears on dark).
- **Popovers**: dark frosted glass — same blur and structure as light mode's
  frosted panels, dark surface, deeper shadows (`0 20px 48px rgba(0,0,0,0.55)`).

Reference implementation: `PressPackagePricingTableRunsDark.tsx` (Playground
sandbox), derived from `AdminDashboardAppleDark.tsx`.

## Vinyl artwork on dark surfaces

Whenever real vinyl art renders on a dark (charcoal) surface — jacket previews,
disc art in tiles, small disc chips in captions or search lists:

- **Never lighten the artwork itself.** A black album cover or black vinyl stays
  truly black — the artist's colors must preview accurately.
- **Separate with light, not color.** Discs get a subtle light rim — a hairline
  of reflected light around the edge, brighter at the top (an inset white-alpha
  ring, NOT a glow) — plus a slightly stronger gloss overlay than in light mode
  (opacity ~0.72 vs ~0.6). Geometry, sizes, and art layering order are identical
  to light mode.
- **Jackets** get a whisper-quiet hairline traced around the sleeve
  (`0 0 0 1px rgba(255,255,255,0.12)`) and a deeper lift shadow
  (`0 22px 48px rgba(0,0,0,0.55)`) so the cover pops off the page instead of
  dissolving into it.
- Small disc chips (caption lines, list rows) carry the same rim treatment so
  they stay visible at any size.

Reference implementation: the dark Catalog mockup
(`PressPackagePricingTableRunsDark.tsx` in the Playground sandbox).

## Non-negotiables

- No emojis anywhere. Use the real `®` character (GoodTunes®, GoodDeed®,
  GoGoods®).
- Admin dark is charcoal, never navy — navy belongs to the fan shell only.
- Nothing shouts: severity is communicated with restraint (dot + label, quiet
  washes), not banners.


## Theming & breakpoints (ratified Aug 11 2026)

- **Theme tokens only.** No component hardcodes surface/ink/hairline hex
  values. Colors come from the active theme's tokens (a THEMES map with
  light + dark sets, or CSS variables). Handoff mocks ship BOTH token sets;
  a floating "View light / View dark" toggle is mock-only chrome — never
  ship it.
- **No mixed surfaces.** Every surface on a page inherits the page's active
  theme. A dark card on a light page (or vice versa) is a bug, even if it
  matches a mock drawn for the other theme.
- **Which theme where:** artist-facing contexts = light; the charcoal
  admin/operator shell = dark. Screens serving both are theme-aware from
  day one, never forked.
- **Breakpoints:** no fixed pixel widths that overflow the viewport. Grids
  collapse gracefully at 1024 and 768 (prefer auto-fit/minmax grids and
  flex-wrap over breakpoint classes).
- **Acceptance gate:** before a screen is done, screenshot it in both
  themes (where both apply) at 1440 / 1024 / 768. Off-theme surfaces or
  horizontal overflow = failure.
