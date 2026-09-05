# Handoff: Press Vinyl Styles — catalog page + style creator/editor (Aug 20 2026)

**Rule of this folder (handoff law, `handoff/README-template.md`):** copy `PressVinylStyles.tsx` **character-for-character** and swap ONLY the `MOCK_`/seed data for real data. Delete-first: the existing vinyl catalog build UI comes out before this goes in (keep data wiring). This file is the source, not a reference. Any visual difference other than data values at 1440px is a failure.

## What this is
The press Catalog → Vinyl page rebuilt around the **style generator**: styles are created/edited in one sheet (the "GeneratorSheet"), colors live inside styles, finishes and sizes are style-level offers. Replaces the previous vinyl color setup approach (`handoff/press-components/PressVinylColorSetup.tsx` is superseded by this file for the vinyl page).

## Files
- `PressVinylStyles.tsx` — the whole page + sheet, self-contained (inline components, tokens, THEMES light + dark).
- `assets/vinyl-gen/**` — the PSD-derived layer kit (75 PNGs, one folder per style group) + `meta.json`. The file references them via `GEN_BASE = '/__mockup/vinyl-gen/'` — **repath this one const** to wherever you serve the kit.

## Data model notes (define these; nothing exists yet)
- **Style** (category): name, genStyleId (picker style), sizes offered (subset of 12/10/7), `offeredFinishes: string[] | null` (null = all), colors[].
- **Color** (swatch): name, generator params (`gen: { styleId, colors[], option, splatterCount, baseKind }`), `hidden` flag (hidden = not offered, never deleted), optional reference photo (`customImg` → needs a has-photo flag server-side), sizes.
- **Default color** = first swatch in the style; the style's default finish = default color's `gen.option`. The default is always visible (enforced in UI).
- Component pricing untouched — this page is catalog content only. GoodTunes Packages untouchable.

## Must work (wire these; anything not listed is decorative chrome)
- Style cards: click selects; ••• menu → **Edit** (opens sheet on default color), **Duplicate** (full copy: every color, sizes, finishes, name + " copy"), **Archive** (hairline-separated bottom row).
- **Add type** → creator sheet with the style picker gallery (Black leads; Double Double + Metallic Blend use gradient maps over their texture PNGs).
- **Add color** on a style → sheet opens directly in a fresh color editor for that style.
- Sheet **Change style** while editing = starts a NEW style preseeded, never mutates the current one.
- Style-level edit sheet: **Style name** field renames the style everywhere on Update; "Restore “<picker name>”" link resets it; header STYLE card previews the typed name live.
- **Finish bar** (main page, styles with >1 offered finish): segmented lens re-renders all tiles AND the hero disc in the picked finish; hover ••• → dual-action pills — click the NAME = set default (star, auto-unhides), click the EYE = show/hide to artists; default's eye disabled ("The default is always shown") = min-one enforced.
- Same finish grammar inside the sheet (style-level Finish block); other colors inherit the default's finish.
- **12/10/7** under the record: viewing lens; hover ••• (style-level) = offer toggles. Pills sit pinned directly under the record, 12″ first, always.
- Saved-state color chips: clickable — loads that color into the editor for tweaks; **All colors** quiet pill jumps to the lineup without saving; **Update** vs **Save color** labels per context.
- Color picker (Wheel/Spectrum/Sliders/Swatches): fully wired; slider thumbs inset so they never overhang the track; swatch-list click commits and closes.
- Upload a reference photo per color; **Compare their photo** toggle appears only when a photo exists.
- One filled #319ED8 confirm per sheet (Save style / Save color / Update / Replace); all other actions quiet outline pills.
- Mock-only chrome: the floating **View dark/light** pill, MRP center label art, all seed styles/colors (replace with the press's real data).

## States to screenshot (acceptance: both themes, 1440/1024/768)
1. Catalog with 1 style (seeded Black) / with many styles.
2. Style with 1 finish (no Finish bar) vs >1 finish (bar shows) vs finish-edit mode (dual-action pills).
3. Sheet: create (gallery open), create preseeded via Change style, edit color, edit default (style-level: Finish block, Style name + restore link), saved lineup with chips, adding-more.
4. Hidden color tile (dimmed, word + icon, never color-only) and hidden finish (crossed eye + strikethrough, operator-side only).
5. Size offer-toggle mode; duplicate result card.

## Also in this push — two standing sweeps (Bill, Aug 20 2026)
1. **Size pills everywhere in Otis**: order must read 12″ / 10″ / 7″ (largest first) and drop the Single/EP/LP suffixes. The live Components · Pricing page shows 7″/10″/12″ — sweep every size selector in all portals.
2. **Blue-button sweep, ALL portals (admin, press/partner, artist)**: enforce the canon weight rule (`handoff/style-guide/apple-canon.md`, ratified 2026-08-18) — header/toolbar actions are quiet dark-gray-outline pills, never filled (live admin "Run payouts" violates this). Filled #319ED8 = the ONE earned confirm per screen, filling only when valid. Ready-state for header actions = the OUTLINE turns blue (border + text #319ED8, no fill). Blue otherwise only as text verbs/links, selection state, thin progress bars. Outline-pill hover = subtle wash, never a blue fill. Note the sweep in the canon doc's enforcement note so regressions are checkable.

## Questions beat inventions
Anything here that conflicts with live data wiring or the settled package designer: flag it to Bill, never silently adapt.

## Addendum (Aug 20 2026): Components chip row → one segmented control
The Components page's separate chips (Vinyl / Jackets / Inner Sleeves / Center Labels / Inserts / Stickers) become ONE segmented control, exactly like the Templates page's Vinyl / CD / Cassette: single shaded track, the active item as the raised white thumb, inactive items quiet text inside the track. Same labels, same order, same navigation behavior — only the chrome changes. Apply wherever this components chip row appears (press portal and super-admin view-as).

## Addendum (Aug 20 2026): Photo-color migration lifecycle
Presses like MRP arrive with real photos of pressed records. Otis keeps every existing color and its image on day one — photo swatches keep rendering their photo on tiles and thumbnails (this is the has-photo flag).
- Editing a photo color opens the REBUILD sheet ("Rebuild this color. Match their photo, then replace it."), never a legacy editor. The photo slides out as a drawer PAST the sheet's left edge for side-by-side matching — it must not compress the sheet's own layout.
- **Replace is the point of no return**: the rebuilt color takes the photo swatch's spot and the image is detached from that color permanently. There is no separate "dismiss image" control — Replace is the "I'm good."
- Progress is self-evident: photo tile = not migrated; rendered disc = done.
- End-of-migration cleanup is a one-time job that deletes orphaned image files from storage once no swatch references them. Nothing else to reconcile.
Also: a photo style's tile-level Edit routes to this same rebuild sheet (one door); and on any pristine edit sheet, the confirm renders as a quiet outline pill (no check, no fill) until a change earns the filled blue.

## Addendum (Aug 20 2026): Migration progress signals
- **Style-tile photo badge**: any style holding photo colors shows a quiet frosted pill on its tile — Image icon + "N photos" (word + icon, never color alone). It's a live count of colors still to rebuild; replacing the last photo clears it automatically. When no tile carries a badge, migration is done and the orphan-file cleanup can run.
- **Compare drawer 1:1**: the drawer photo is clickable — it expands to exactly the live disc's render size (and back) for a true side-by-side match. Caption reads "Click to match the record size" / "Click to shrink".


---

---

## Andrew Vinyl classification correction — September 4, 2026

**UI + FUNCTIONALITY + DATA-CONTRACT CHANGES**

This section supersedes the earlier **ZERO FUNCTIONALITY CHANGES — SKIN ONLY** label. Apply the approved interactions and persistence semantics below. Preserve unrelated Otis behavior; do not preserve conflicting legacy Vinyl behavior.

### New and changed behavior

- An image-backed color is a legitimate current representation. Its uploaded image occupies the fixed center stage with the press-owned system label overlaid.
- **Replace image** opens the nested Canon upload dialog over the unchanged builder.
- **Build with colors** starts a conversion state: the generated disc occupies the center and the existing image opens in the side comparison tray.
- **Keep image** exits conversion, returns the image to center, closes the tray, and marks the legacy image reviewed through the real config save path.
- Saving a generated conversion replaces the image-backed representation in place while retaining the color identity.
- Saving a replacement image marks the new image reviewed and replaces the legacy image in place.
- Opening, comparing, entering conversion, canceling the uploader, or closing without save must not change persistence or review state.
- New source images accept transparent PNG or WebP up to 2 MB. Square dimensions are not required. Center and scale with contain; never distort. GoodTunes owns the correctly sized center-label overlay.
- Image-count pills are an unresolved migration queue, not a lifetime count of every image. Count only colors with customImg and imageReviewed !== true. Resolving one item decrements the count immediately; resolving the last removes the pill.
- Category image-count pills stay in a reserved bottom footer with consistent alignment and never overlap the record, menu, title, or color count.

### Data and persistence contract

- Add optional imageReviewed?: boolean to the persisted vinyl color/swatches model.
- Existing custom-image records without the field are unresolved by default.
- Otis must use its production image upload/storage and vinyl-config persistence paths. The GoodStudio IndexedDB adapter is prototype infrastructure, not the production storage contract.
- Generated replacement removes the active customImg reference from the current representation. Keep image preserves it and sets imageReviewed: true.

### Existing production behavior to preserve

- Preserve current press/operator routes, permissions, identity, catalog ownership, size/quantity/weight behavior, hidden/offered rules, pricing boundaries, and GoodTunes Packages.
- Preserve every existing live action even when the supplied mock does not exercise it. Mock inactivity never means a production button should become dead.
- Preserve per-press label resolution. Never fall back to another press's mark.

### Must work

- Replace image opens and completes the production upload flow.
- Build with colors opens conversion with the existing image visible for comparison.
- Keep image persists review approval, restores the centered image, and closes conversion.
- Generated Save replaces the image representation and decrements the unresolved count.
- Replacement-image Save resolves the legacy count.
- Cancel and close paths do not mutate saved state.
- Compare resize, stencil selection, color assignment, size lens, style identity, and all previously live Vinyl actions remain functional.

### Mock-only or decorative

- Only controls explicitly identified elsewhere in this handoff as mock chrome may remain inert. The light/dark preview switch is mock chrome; production theme controls continue using Otis's real behavior.

### Acceptance

Verify both themes at 1440, 1024, and 768. Exercise every Must work transition with production handlers and confirm unresolved image counts before and after each successful resolution. Confirm cancel paths preserve data. Return an itemized Otis receipt before Canon promotion.

### Approved source

GoodStudio isolated route: rnd/vinyl-components-rnd/components
Approved PressVinylStyles digest: a0d37bdd6346d6436435eb410de528439a083e2a5d0a980ad2eb199d98489981
