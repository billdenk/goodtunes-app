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

## Non-negotiables

- No emojis anywhere. Use the real `®` character (GoodTunes®, GoodDeed®,
  GoGoods®).
- Admin dark is charcoal, never navy — navy belongs to the fan shell only.
- Nothing shouts: severity is communicated with restraint (dot + label, quiet
  washes), not banners.
