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
- **Dialog action order (ratified 2026-08-15, Bill):** in any horizontal
  dialog/popover/footer action row, the confirming action is ALWAYS the
  rightmost element; Cancel sits immediately to its left as a **quiet
  borderless text button** (subink, hover wash) — never a bordered pill,
  never right of the primary. Sheets also carry an X close in the top-right
  gray circle. Vertically stacked alerts put the primary ON TOP — that
  remains correct.
- **Dialog subtext is one short line.** Longer explanation lives behind a
  small quiet `ⓘ` (faint, cursor-help, tooltip) — never a paragraph in the
  sheet. (Ratified 2026-08-15, upload-template sheet.)

## Controls & chrome

- Segmented control: a **fully-rounded pill track** (`rounded-full`,
  `--apple-track`) holding a **raised, fully-rounded active thumb**
  (`rounded-full`; white in light mode with `0 1px 3px rgba(0,0,0,0.08)`,
  lighter charcoal `#3a3a3e` in dark with `0 1px 3px rgba(0,0,0,0.4)`).
  Reference: the Catalog Vinyl/CD/Cassette switcher and the dashboard
  Today/7d/30d range switcher. **Never squared chips** — a segmented control
  with `rounded-md`/`rounded-lg` corners or box-shaped options is a canon
  violation. (Ratified 2026-08-09; closes the squared segmented controls Bill
  found in the live admin.)
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
- Individual text blocks may still cap their measure for readability
  (~640px for paragraphs), but cards, tables, and forms span the container.
- **Containers fill the container (ratified Aug 11 2026).** Every card,
  form section, table, and content block spans the FULL width of the page
  container — never a narrower cap that leaves a dead gap on the right.
  If a card's content doesn't need the width, lay the content out in
  columns inside the full-width card; do not shrink the card. A page whose
  cards stop short of the right gutter while the container keeps going is
  a bug.
- **EXEMPT — build-experience pages (Bill, Aug 11 2026).** The editorial
  "Build your GoodTunes packages" catalog page, the component chooser
  screens (jackets, inner sleeves, center labels, inserts, stickers,
  vinyl colors, pricing), and the quote builder keep their current
  bespoke centered layout and widths EXACTLY as designed. Theme-aware
  (light/dark) conversion applies to them; the full-width container rules
  above do NOT. Do not widen, re-wrap, or re-cap anything on these pages.
  The full-width rules govern operator/admin data pages (dashboards,
  tables, forms, specs, settings).

## Content patterns

- **Album/artwork collections**: Apple-Music-style cover-first tiles (~200px),
  whole tile is the click target, text (title/spec/status) always visible
  below, hover lifts the tile slightly and reveals the `···` circle.
  Archive is a header-level filter toggle, not a bottom section; archived
  tiles render dimmed inline. Archive-only — no Delete.
- **Ranked lists**: rank number in faint gray, thumb (projects = rounded-rect,
  presses = white circle logo), revenue right-aligned, thin blue progress bar
  aligned to the title column.
- **Activity feeds**: people get photo circles; partner logos sit on WHITE
  carrier circles, `object-contain`, small padding, never recolored or
  inverted (see Logos — the white circle is the light surface). Impersonal
  events get gray rounded-square icon chips.
- Status dots (green/gray) + short phrase for item state ("Priced — ready to
  press", "Draft — no artwork yet").
- **Breadcrumbs** (ratified Aug 2026): use the GDS `Breadcrumb` component
  pattern — muted (FAINT) crumb links, `ChevronRight` (w-3.5) separators,
  current page in INK, ~13px text, no uppercase, no `·` middot separators.
  Ancestor crumbs are real links that land back exactly where the user left
  (filters/scope preserved). Drop crumbs that duplicate the sidebar's active
  item when depth allows; the page identity itself belongs in the H1 lead,
  with the crumb trail carrying only the path back.
  **Crumb → H1 spacing (ratified 2026-08-12): ~12px (`mt-3`) between the
  crumb trail and the page H1** — the trail needs its own breathing room and
  must never sit tight on the heading (`mt-1` is too tight; drift).

## Logos

**Ratified 2026-08-09 — logo contrast follows surface luminance.** This
replaces the earlier "partner logos always on white" rule, which produced
invisible dark partner marks on dark chrome in the live admin.

- **The rule:** logos are **white on dark surfaces** (dark album art, vinyl
  center labels, dark admin chrome) and **dark on white/light surfaces**.
  Pick the variant by the luminance of what the logo sits on, never by app
  theme alone.
- **GoodTunes wordmark** (single-color; only dark assets exist): on dark
  surfaces render white via CSS `filter: invert(1) brightness(2)` — this
  CSS-invert approach stays canon for the wordmark only.
- **Multi-color partner/press marks:** on dark surfaces use a **white
  monochrome/knockout variant of the mark — never CSS inversion** (inverting
  a multi-color logo corrupts the partner's brand colors). If no knockout
  variant exists, keep the logo on a white carrier (see below) rather than
  placing the dark original directly on dark chrome.
- **White carrier circles** (activity feeds, press avatars, ranked lists):
  partner logos may sit on white circles (`object-contain`, small padding) in
  both light and dark modes — the white circle IS the light surface, so the
  original (dark/multi-color) mark is correct there. Never recolor or invert
  a logo sitting on a white carrier.

### Logo formats (ratified Aug 10 2026)

- **Presses — product surfaces**: SVG is the ONLY accepted format wherever the
  logo is printed on product — placeholder album covers (Vinyl/CD/Cassette)
  and vinyl center labels. The configurator renders from this SVG.
- **Presses — identity icon**: a press may optionally upload a SECOND asset
  (PNG/JPG allowed) used purely for identification in the app — the avatar
  circle next to their name above the search box, activity feeds, etc. If no
  identity icon is uploaded, the SVG is used there too. The identity icon is
  never applied to covers or center labels.
- **Everyone else** (artists, NPOs, staff, any non-press account): PNG/JPG
  icons are fully supported everywhere. No SVG requirement.

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
- **Disabled/inactive on dark (ratified 2026-08-09):** inactive or disabled
  regions — table cells, tiers not yet unlocked, grayed rows, disabled
  controls — **dim via reduced opacity on the dark surface** (e.g.
  `opacity: 0.4–0.5` on the element, or white-alpha text at reduced alpha).
  **Never light-gray fills** (`#e8e8ed`, `#f0f0f2`, slate-100/200) and never
  any light-mode literal on a dark surface — a light-gray disabled box on
  charcoal is a bug, not a state. (Closes the light-gray disabled boxes Bill
  found in the live admin's GoodDeeds printing table.)

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
