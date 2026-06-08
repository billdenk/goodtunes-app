# Design System

**One design system covers the entire product** — mobile player, admin/CMS, and every mockup. Identical concepts must look identical everywhere. No one-off colors, button sizes, hover treatments, or icon sizes outside the primitives.

## Brand

- Colors: `#00062B` (bg), `#319ED8` (blue), `#7F10A7` (purple), `#4AFFCA` (mint), `#FF5470` (heart pink), `#FF7C06` (GoodTunes logo orange)
  - **Orange (`#FF7C06`)** is the official GoodTunes logo orange (from the 2025 logo SVG — `rgb(255,124,6)`, H28° S97% B100%). It is **not** a general-purpose accent — reserve it for GoodDeed® share-card framing (the orange-bordered Story variant). Reach it via `--brand-orange`, never inline the hex.
- Mobile-first single column, max width ~440px
- Apple-Music-style large headers, 44×44 minimum touch targets
- Songs use **heart** icon; artists use **star** icon. **Favorite markers (favorited-song hearts + favorited-artist stars) render in dimmed-white `rgba(255,255,255,0.55)`** — the shared quiet secondary-indicator value, *not* heart-pink `#FF5470` — so they read for color-blind users and match the `white/55` secondary text treatment. Favorited = filled dimmed-white, not-favorited = hollow outline. On a light surface (e.g. the album-detail track action popover) use the contrast-appropriate equivalent `rgba(0,0,0,0.55)` instead. `#FF5470` stays a brand color for non-favorite roles (now-playing rose accent, unread badges, preview tags).

## Text tone — Apple-style label hierarchy (fan surfaces)

The fan player uses **one layered text-tone scale** on the navy bg, modeled on Apple Music's quiet label hierarchy. **Fan titles are NOT pure `text-white` (100%)** — pure white reads harsh next to Apple Music. There are exactly **three tones**; reach them through the Tailwind `text-fan-*` utilities (backed by CSS vars in `client/src/index.css`, mapped in `tailwind.config.ts`) — never re-derive an ad-hoc `text-white/NN` per file.

| Token | Class | Value | Use for |
| --- | --- | --- | --- |
| **Primary** | `text-fan-primary` | `rgba(255,255,255,0.90)` | Titles + emphasized text: album / song / artist names, page `<h1>`, section headers, list item titles, totals. Softened off pure white. |
| **Secondary** | `text-fan-secondary` | `rgba(255,255,255,0.55)` | Metadata: year, "Single" / "LP", subtitles, artist names in lists, runtimes, body copy, labels. The single consolidation target for the old 45/50/60/65/70/72/75 spread. Matches the dominant legacy `white/55`. |
| **Faint** | `text-fan-faint` | `rgba(255,255,255,0.40)` | Tertiary/quaternary: faint counts, separators (`›`), disabled, timestamps, fine print. Absorbs the old 20/25/30/35 + `text-slate-400`. |

Rules:

- **Titles never sit at pure white.** Use `text-fan-primary`. The simplest way to soften a whole page is to set the fan page's root wrapper to `text-fan-primary` (instead of `text-white`) so un-classed descendant text inherits the softened primary; then only metadata/faint need explicit classes.
- **One secondary value everywhere.** Don't reach for `white/45`, `white/70`, `white/72`, `text-slate-400`, etc. for metadata — they all collapse to `text-fan-secondary` (or `text-fan-faint` for the truly faint).
- **Mobile and desktop match.** The same concept (e.g. a list artist subtitle) uses the same tone on both. `PlayerDock`'s old `slate-400` / `slate-100` collapse onto this scale too.
- **Accents are a separate axis — leave them alone.** Brand-blue artist deep-links (`--brand-blue`), the now-playing rose accent (`--brand-pink`), mint (`--brand-mint`), and the favorite-marker dimmed-white `rgba(255,255,255,0.55)` are intentional accents, *not* body text. Never fold them onto the tone scale.
- **On-accent text stays white.** Text sitting on a filled brand button / pill (`bg-[var(--brand-blue)] text-white`) keeps pure `text-white` — it's foreground-on-color, not a fan label.
- **Out of scope:** admin/CMS surfaces (they keep their own slate tokens), and the GoodDeed share-card / certificate baked-in text (its own approved spec above).

The `design:lint` `fan-text-tone` rule flags new raw `text-white/NN` / `text-slate-*` text tones on fan surfaces and steers them to these tokens; legacy surfaces migrate opportunistically (each time you touch the file).

## GoodDeed® share-card (social) — approved spec

The GoodDeed share-card is **one orange-frame family** with three social formats plus a texting/link-preview image. All three social formats share the same signature — a solid GoodTunes-orange edge-to-edge frame (`--brand-orange`), an album-art band fading into navy, the owner avatar pulled UP to straddle the art→navy seam, then `This GoodDeed® certifies` → owner name → `[GoodTunes | #NN]` pill → album caption. All three are **shipped** in `client/src/components/GoodDeedCertificate.tsx` (the `square` / `portrait` / `story` shapes), each rendering at a 1080 base (`u = w/1080`) and exporting an exactly-sized PNG via `html-to-image` + `navigator.share`/download. Specs live in `CERT_SHAPE_SPECS` there; the source mockups are in `artifacts/mockup-sandbox/src/components/mockups/gooddeed-cert/`.

1. **Square** (1:1, 1080×1080) — feed posts (X, Instagram/Facebook feed, LinkedIn). **SQUARE corners** (radius 0 — the approved IG-feed look). Album-art band on top, caption pinned to the bottom (story-style). Mockup: `SquareBordered.tsx`.
2. **Portrait** (4:5, 1080×1350) — the format Instagram/Facebook now DEFAULT to for feed posts (taller, fills more scroll). **SQUARE corners** (radius 0). Taller art band; the whole ownership block (avatar → certifies → name → pill → caption) reads as one cohesive group with equalized gaps. Mockup: `PortraitBordered.tsx`.
3. **Story** (9:16, 1080×1920) — the hero format for posting to Stories/Reels/TikTok. **Subtly rounded** (≈ IG feed-photo curve, `66·u` ≈ `r=22` on the 340-wide mockup), rounded **concentrically** (single `border-radius` on the clipping container) so it floats cleanly on black. Uncropped square album art at the top. Mockup: `StoriesBordered.tsx`.

Texting / link-preview (**OG image**) — what a pasted `/share/cert` link unfurls to in iMessage, WhatsApp, Discord, etc. Approved variant: **"California gradient, logo right"** — the album art wrapped in the orange frame, a navy bottom-gradient scrim, and the white GoodTunes logo floated **bottom-right** (the right corner clears the album's own bottom-left title art). The album/owner/number text is **not baked in** — the messaging app draws it from the OG/Twitter meta tags, so the picture stays clean and the type stays crisp. Rendered 1200×840 (~1.43:1) to render full-bleed in texting surfaces. **Shipped** in `server/certOgImage.ts`; source mockup `OgBordered.tsx` (`?brand=gradient&pos=right`).

Locked decisions (apply across the family):

- **Orange frame.** A solid GoodTunes-orange border runs edge-to-edge (`--brand-orange`, never inline the hex; `45·u`). This is the one sanctioned use of orange — it makes the card instantly recognizable as a GoodDeed.
- **Corners.** Square + Portrait use **square corners** (radius 0 — Bill's approved feed look). Story is **subtly rounded** (`66·u`). Round only when the card is consumed as a **floating / shared image**; if a Story is ever uploaded **full-bleed** as the whole background, the device clips the corners anyway.
- **No Meta HIG to match.** Instagram publishes no corner-radius spec for Story content — Stories are full-bleed, and the rounding you see is the device screen + IG's own UI chrome. The only Meta constraints that bind us are the canvas dimensions per format and the **top/bottom safe zones** (keep key content out of them).
- **Caption lead-in.** "This GoodDeed® certifies" → owner name (no "that"; the cert number rides the pill and the album/artist rides the bottom caption).
- **Fan share picker.** The mobile certificate view (`GoodDeedCertificate.tsx`) is the picker: a **Square / Portrait / Story** segmented toggle reshapes the live preview, and Save/Share export the *selected* format at full resolution (off-screen 1080-scale capture node), honoring the chosen identity (Display / @username / Real Name) and the fan's owner photo.

## Two surfaces, shared vocabulary, distinct chrome

Mobile player and desktop admin share **icon glyphs** (Lucide for UI chrome, `react-icons/si` for company logos), **brand colors**, and **product concepts** (favorite = heart, lyrics = `Mic2`, etc.) — but use different button treatments because they live on different backgrounds and serve different users.

- **Mobile player (fan-facing, dark `#00062B` bg)**: follow **Apple Music**. Circular `IconButton` chips (44/48px) with the `glass` variant (white/14 scrim) for search/filter/share/back/photo-nav. Apple-Music-style segmented tabs (Albums / Songs / Artists). Rounded, generous, photo-forward.
- **Admin desktop (operator-facing, white/slate bg)**: square h-9 buttons, slate-100 segmented controls (`ViewModeToggle`, tab underlines), tighter density. Lives on white cards over a slate page background. Apple-Mac-app-style rather than Apple-Music-style.

When in doubt on the mobile player: Apple Music, Apple Music, Apple Music. Don't borrow admin chrome (h-9 squares, slate borders) into the player.

## Primitives + Apple HIG defaults

- **Primitives home**: `client/src/components/ui/` is the canonical home. Mockups in `artifacts/mockup-sandbox/` prove a pattern first in a local `_shared.tsx`, then graduate into `client/src/components/ui/` when the pattern ships to real code.
- **Default to Apple HIG** whenever a size/weight/spacing/radius/font isn't explicitly specified for a surface:
  - Type: SF / system font stack. Body 17pt, secondary 15pt, footnote 13pt, caption 11pt. Headings use Apple's title scale (Title 1 / 2 / 3).
  - Touch targets: **44×44pt minimum** on mobile surfaces.
  - Corner radii, padding rhythm, hover/pressed states: match Apple Music / Apple-iOS conventions over inventing our own.
- **Icons**: a single icon set per family (Lucide for UI chrome; `react-icons/si` for company logos). One play triangle, one trash can, one chevron, one pencil — used in every surface that needs that concept.
- **Color**: only the five brand colors above + Tailwind slate for neutrals. New colors require a discussion, not a one-off.

## IconButton primitive

Circular icon buttons (search, filter, share, close, photo-viewer nav, send, etc.) **must use the `IconButton` primitive** at `client/src/components/ui/IconButton.tsx`. The Collection page's search + sort buttons are the canonical reference.

- Sizes: `md` (44×44, default — HIG floor) and `lg` (48×48, player primary controls only). No 40px buttons — bump to 44.
- Variants: `glass` (default — white/10 scrim on dark bgs), `dimmed` (black/45 + blur, for bright photos/album art), `solid` (brand blue fill, primary actions), `ghost` (no bg).
- Icon size auto-applied via child-SVG selector — consumers pass `<svg>` or a Lucide icon as a child without sizing it. 19px on `md`, 22px on `lg`.
- Press feedback is `active:scale-[0.94]` everywhere. No more mixing scale/opacity. Always.
- Surfaces still to migrate off ad-hoc inline circular buttons: `AlbumDetail.tsx` (back, more, photo-viewer nav, lyrics close), `Player.tsx`, `Playlists.tsx`, `ArtistDetail.tsx`, `Chat.tsx` composer send, `GoodDeedCertificate.tsx`. Migrate each time you touch the file — don't sweep all at once.
- **Lyrics glyph**: Lucide `Mic2` (singer's mic) — same icon Spotify uses for the same concept. Wrapped at `client/src/components/ui/LyricsIcon.tsx` so any future swap happens in one place. Used on the mobile player's Now Playing controls **and** the admin Tracks-tab BottomDock. Sandbox surfaces import `Mic2` directly from `lucide-react` since they can't reach `@/components` — both surfaces stay on `Mic2`. We tried Apple's `quote.bubble` SF Symbol; inline-SVG approximations didn't read well at 16px so we kept the mic.

## Inline text links

Anywhere a piece of metadata in admin chrome (artist name on an album header, vendor name on an instrument row, label name, etc.) deep-links to its own CMS page, use the shared link treatment: **inherit the surrounding text color at rest, switch to brand blue `#319ED8` + underline on hover/focus.** Don't introduce per-surface accent colors. Pair with `underline-offset-2` and `transition-colors` so the underline doesn't stick to the glyph. Always gate the link on the FK actually being set (e.g. `album.primaryArtistId`) — never render a `<Link>` to `/admin/people/undefined`; fall back to plain `<span>` with the snapshot string. The canonical reference is the artist name in the AdminAlbum header (`client/src/pages/AdminAlbum.tsx` ~line 406).

## Track-row hairline — light, Apple-Music, always visible

Track lists (fan album track list, admin Tracks tab) divide rows with **one light, persistent Apple-Music-style hairline**. It is **always visible** — it does **not** fade out on hover or on the currently-playing/active row (Apple Music keeps its dividers present on every row). Use one tone per surface family:

- **Navy fan surfaces** (`#00062B` bg) — `white/20` (`rgba(255,255,255,0.20)`). Reference: `DesktopAlbumView.tsx` (one top hairline span + one bottom hairline span per row, all as **in-flow flex items** in the `flex flex-col` track-list container — not absolute spans inside rows, which were consistently invisible due to painting-order ambiguity at the flush seam between adjacent flex items) and `AlbumDetailMobileSurface.tsx` (per-row top hairline). Desktop and mobile use the **same** value so the two surfaces match.
- **Admin / white chrome** (`body.gt-admin`) — `border-slate-100` (or `divide-slate-100` for a flush list). Persistent on every row except the last. Reference: the Tracks tab row in `AdminAlbum.tsx` and the `admin-album-tracks` / `admin-tracks-mode` mockups.

Rules:

- **Never fade the divider on hover or current.** A row's soft elevated highlight sits *behind* the hairline; the line stays on top so the list never reads as borderless.
- **Don't drift the tone.** New track/list work reuses `white/20` (navy) or `slate-100` (admin) — don't reach for `white/10`, `white/[0.06]`, `white/[0.07]`, `white/[0.08]`, etc. for a track divider.
- **Scope: track rows only.** This is the divider between rows in a *track* list. Non-track lists (credits sheets, spec sheets, menus, section header rules) keep their own treatment.

## Save semantics — default to auto-save, reserve explicit Save for the few cases that need it

Most admin fields **auto-save** as soon as they go dirty + lose focus (typeahead pick, blur, toggle change). Showing a "Save" button on a field that could just save itself is noise: it makes the page louder, demands a second click for nothing, and trains operators to assume nothing is saved until they click a button — which makes auto-save fields feel unsafe.

**Default: no Save button.** Pick the field, change the value, move on. The mutation fires on blur / change and the new value snaps in. A subtle "Saved" toast or the row visibly updating is enough confirmation.

**Use an explicit Save *only* in these cases:**

1. **Destructive or expensive submits** — anything that can't be casually undone (creating an order, sending an invite, kicking off a print run, publishing a release, locking a quote). These belong in an `AlertDialog` / confirm sheet, *not* a bare Save button. The Save sits inside the confirm.
2. **Multi-field atomic forms** — when a group of fields only makes sense submitted together (a sign-in form, an Add-Album wizard step, an RFQ submission). One primary Save at the bottom of the form, and the fields are not individually auto-saved.
3. **Post-sale-locked edits** — when the partner-permissions `edit_metadata` lock has frozen the row, editing is gated behind an explicit Save so the operator sees the lock state before submitting. See `docs/admin-conventions.md` → "Partner permissions + post-sale lock."
4. **Per-row Save in a long list** — formats list, color tiers, GoodDeed signed cert per-row pricing — use the **`SaveLink` ghost-link primitive** at `client/src/components/admin/SellPanel.tsx`. It activates (brand-blue text + soft pill) only when the row is dirty, stays invisible otherwise. **One filled primary action per section, max.** Don't stack a row-level filled Save next to a section-level filled Save — pick one.

**Auto-load reminder for any admin work:** before editing any admin/CMS surface, the design system rules above plus `docs/admin-conventions.md` are mandatory reading. Don't introduce a new Save button without checking the four cases above first. The mechanical linter (`npm run design:lint`) flags new `>Save</Button>` literals on admin surfaces against `.design-lint-baseline.json` — the baseline absorbs existing offenders, but anything new must be justified (and added to the baseline with a commit that explains why it can't auto-save or use `SaveLink`).

## Destructive actions always confirm

Any trash / delete / "remove forever" button must pop a confirmation sheet naming the thing being destroyed (e.g. "Delete *Storms*? This removes the master, snippet, lyrics, and credits.") with a rose-tinted primary action. Hide / Park / Archive are reversible and do **not** need a confirm — they just toast "Hidden — undo." Destructive buttons must also keep visual breathing room (gap + hairline divider) from any adjacent non-destructive control so a thumb can't slide between them.

## Player dock primitive

`client/src/components/ui/PlayerDock.tsx` — Apple-Music-style floating pill (transport · cover/title · lyrics/volume) graduated from the admin Tracks-tab Seamless mockup. The mockup sandbox keeps a parallel inline `BottomDock` copy (the sandbox alias can't reach `client/src`); mirror polish into both files until the sandbox gains a real alias.

**Reuse for the consumer player**: this same primitive should drive the fan-facing player surface (Now Playing / mini-player) once we wire lyrics, queue, and shuffle/repeat state for fans. Plan to extend rather than fork: keep the dock as-is for admin (lyrics-disabled placeholder), and pass `onLyrics`, real shuffle/repeat handlers, and a queue when consumer mounts it. Any polish landing here should automatically benefit the consumer dock.

**`density="compact"` is the fan variant** (admin uses the default density). Beyond the tighter sizing tokens, compact diverges from admin to read more like Apple Music's mini-player: **symmetric vertical padding (`py-3.5`) so the transport row sits optically centered** within the pill (the inset scrubber overlays the bottom padding zone via `absolute bottom-1.5`, so it never pushes the row up — and in responsive-compact, where the scrubber is absent, the row still reads dead-centered), a lighter `white/55` subtitle, and a frosted (lower-opacity `bg-slate-900/70`) surface so scrolling content blurs through. **The compact dock never collapses** — it behaves like Apple Music's persistent mini-player: always the full rounded bar, dropping to a quiet dormant/idle state (dimmed transport + the faint grayscale "G" mark) when nothing is playing, never a corner pill. The caret / collapse-to-corner and minimize chevron are **admin-only** (default density) — that whole minimized branch is gated off for fans. Keep these compact-only; admin (default) stays near-opaque with its chevron and corner-pill collapse. Don't stack a second `backdrop-filter` layer on the dock — adjust the existing surface opacity (iOS-WebKit blur-stacking hazard).

**Rail-aware docking (`channelLeft` / `channelRight`)**: on the desktop fan surfaces the dock no longer window-centers (`left-1/2`). The host passes the content-channel insets and the pill centers on `[channelLeft, windowWidth − channelRight]` — the gutter *between* the left nav rail and the right lyrics rail — sliding and resizing (CSS `transition-[left,width]`, `motion-reduce` safe) when the lyrics rail opens/closes. The album page (`AlbumDetailDesktop`) passes `channelLeft=244` (12px inset + 220px `AlbumDesktopSidebar` + 12px gap) and `channelRight = LYRICS_PANEL_WIDTH` only while lyrics are open at `lg`; the storefront (`MiniPlayer` → `DesktopMiniPlayer`) passes `channelLeft=STOREFRONT_CONTENT_OFFSET`, `channelRight=0`. Channel mode is **only** active in the wide regime — it auto-disables in the narrow `edge-to-edge` regime (`windowWidth < COMPACT_BREAKPOINT` = 1100), so the intentional iPad rail/dock overlap is preserved. Admin passes neither prop and stays window-centered. The companion bound lives on the lyrics rail (`DesktopAlbumView` aside): its height is `calc(100dvh − LYRICS_DOCK_CLEARANCE − safe-area-inset-bottom)` so its content ends *above* the floating dock instead of bleeding behind it.

## Motion — shared sheet & press animations

`client/src/lib/motion.ts` is the single source of truth for the player's motion language so every overlay opens and closes the same way:

- `sheetOpen(reduce)` / `sheetClose(reduce)` — bottom-sheet slide. Springy overshoot on open, quick eased settle on close. Every fan bottom sheet animates `translateY(100% → 0)` on its panel and pairs a `scrimFade(reduce)` opacity fade on the dim backdrop. The shared `SheetShell` (in `AlbumDetail.tsx`) **self-manages** its close: it holds a `closing` flag and runs the final unmount in `onAnimationComplete`, so its call sites do **not** need a framer-motion `<AnimatePresence>` wrapper. Hand-rolled sheets that don't use `SheetShell` still wrap their **call site** in `<AnimatePresence>` (single conditional child) so the close animation plays on unmount. Reference: `HowToPlaySheet` in `ArtistDetail.tsx`, `PlaylistPickerSheet`, `StreamServicePickerSheet`.
- `popBounce(reduce)` — small anchored popovers/menus (e.g. the Player title "Go to Album / Artist" menu).
- `PRESS_SCALE` (0.96) — the shared tap "give" for fan tappable surfaces; admin stays press-flat (see below).
- All helpers take a `reduce` arg from `useReducedMotion()` and fall back to a short non-overshoot tween — always pass it so call sites honor the OS setting for free.
- **Never animate a new `backdrop-filter` layer.** Animate transform/opacity only; keep one blur surface per overlay (dim-only scrim + one frosted panel) per the iOS-WebKit stacked-blur memo.

## Chrome scrim — gradient at rest, one frosted band on action

`client/src/components/ui/ChromeScrim.tsx` is the shared fan-chrome scrim behind every top/bottom control bar (Apple's header/footer treatment). It exists so no fan region hand-rolls its own frosted band and accidentally stacks two `backdrop-filter` surfaces over a scrolling list.

- **At rest** the bar shows **only a soft navy gradient fade** (`to top`/`to bottom`, reached through `--brand-bg-rgb` — never the raw `#00062B` hex) so content scrolling behind the bar stays legible with no hard edge. There is **zero** `backdrop-filter` surface at rest.
- **When `active`** (a selection / open menu / picker / search is engaged) exactly **one** frosted blur band cross-fades in. It is mounted/unmounted by `AnimatePresence` and fades by **opacity** — we never animate the `backdrop-filter` property itself — then unmounts back to gradient-only when the mode ends. Honors `prefers-reduced-motion`.
- Props: `edge` (`"top"` | `"bottom"`, drives gradient direction), `active`, plus `className`/`style` for positioning. **Positioning is the consumer's job** — pass `fixed`/`absolute` + the inset/height that pins it to the edge. The component is always `pointer-events-none` so it never eats taps meant for the controls above it.
- Adopted by `BottomNav` (bottom, `active={searchOpen}`), `AlbumDetailMobileSurface` (top, `active={showMenu}`), and the instrument-sheet toolbar (top). When adding a new fan chrome bar, reach for `ChromeScrim` rather than a hand-rolled frosted `div`.
- **One blur owner per region.** When you set `active`, the scrim becomes the region's single frosted layer — so any *other* control that overlaps the band must drop its own `backdrop-filter` while active or you re-stack two blur surfaces (the exact iOS-WebKit hazard). Pattern: keep the control's own blur at rest (scrim is gradient-only then) and swap to a blur-free opaque fill while active. See BottomNav's search/close toggle (`glassStyle` ↔ `solidDockStyle`) and the album share/menu capsule (`backdrop-blur-md` gated off when `showMenu`). Note the `IconButton` `glass` variant is *not* a blur surface (translucent fill only), so glass chips never count toward the per-region blur budget.
- **Player dock stays untouched**: `PlayerDock` is a shared admin+fan primitive (centered floating pill) and admin is out of scope for the scrim — leave its visual as-is.

## Sheet chrome — one close button, one back chevron, room at the top

Every fan-facing mobile sheet dismisses the same way (Apple HIG / Apple-Card pattern). The shared primitives live in `client/src/components/ui/SheetChrome.tsx`:

- **`SheetClose`** — the *one* circular "X" chip used to dismiss any fan sheet. It renders through the `IconButton` `glass` variant at `size="lg"`: a **large X glyph on a quiet translucent-white scrim** that matches the `SheetBack` chevron, so close + back read as one chrome pair instead of the X shouting in opaque light-gray. The glyph stays big and unmistakable; only its background is muted. Callers may still pass `variant="fill"` for the rare high-contrast case, but the default is glass so every sheet matches. Prefer this X over a translated "Done" / "Cancel" string — it survives Android + localization unchanged. Place it **top-right**.
- **`SheetBack`** — the matching back chevron for **drill-down** sheets. Drill-downs (instrument → vendor → in-app browser) show `SheetBack` **top-left** (pops one level) *and* `SheetClose` **top-right** (tears the whole stack down).
- **`SHEET_SAFE_TOP`** — the shared top inset (`safe-area-inset-top + 12px`) so the close chip clears the device safe-area and leaves generous "room at the top" before content begins.
- **Self-managed dismiss** — `SheetShell` exposes its animated dismiss through `SheetDismissContext`; `SheetClose` / `SheetBack` (and any in-sheet control via `useSheetDismiss()`) auto-wire to it so the close animation plays instead of yanking the sheet off-screen. Pass an explicit `onClick` only for sheets that aren't inside a `SheetShell` (standalone overlays, page-level pickers).
- **Grabber** — resizable / picker bottom sheets keep the small grabber strip; the X chip is still the primary affordance. Pickers (`PlaylistPickerSheet`, `StreamServicePickerSheet`) keep grabber + tap-scrim and don't need a forced X.
- **HIG exceptions — keep `Cancel` / `Done`** only where the user is *editing or confirming discardable changes*: new-playlist / rename dialogs, phone-verify OTP entry, the Account real-email capture, and destructive confirms (e.g. "Clear all recents?" → Cancel / Clear All). Everything else prefers the X.
- **Light / hero surfaces** (the frosted light `HowToPlaySheet`, the GoodDeed certificate over vibrant art) keep a contrast-appropriate chip (dark glyph on light) but follow the same size / position / top-inset standard.

## Fan top-chrome placement — one safe-area inset, never a hard `top-14`

The floating top-chrome on fan surfaces — the **back caret** (top-left) and the **share / ••• capsule** or favorite chip (top-right) over a hero — sits tucked **just below the status bar / Dynamic Island with a small, deliberate margin** (Apple Music's placement: present, not flush, not floating low). That vertical position is **one shared token**, not a per-surface `top-14`:

- **`FAN_TOP_CHROME_INSET`** (in `client/src/components/ui/SheetChrome.tsx`) = `calc(env(safe-area-inset-top, 0px) + 12px)`, **kept equal to `SHEET_SAFE_TOP`** so page chrome and sheet chrome land on the same line. It's safe-area-based on purpose: the old hard-coded `top-14` (56px) ignored the device safe area and read too low. Consume it as an inline `style={{ top: FAN_TOP_CHROME_INSET }}` on the absolutely-positioned chip; keep the horizontal placement (`left-4` / `right-4`) and the `z-50` on the className.
- Applied across every fan surface that floats this chrome over a hero: album detail (`AlbumDetailMobileSurface` back + share/••• capsule), `ArtistDetail` (back + favorite), `FanLabel` (back). **New fan top-chrome must use this token** — never reintroduce a fixed `top-14`/`top-16`.
- **Desktop / iPad album + library top controls follow the same inset (Task #1621).** On the desktop album page (`DesktopAlbumView`) the Share + ••• capsule row is pushed down by the inset (`style={{ marginTop: FAN_TOP_CHROME_INSET }}`) so it clears the status / info bar instead of sitting flush at the column's top padding. On `FanScreen`-based library pages (Home, Collection, Songs, Artists) **both** the leading (left/back) and trailing (right/sort-filter) slots pin `top` to the inset so they sit on **one horizontal line** at a consistent height — resolving the old `top-3` vs `top-14` split. The header's top padding derives from the same inset plus the 44px control height (`calc(${FAN_TOP_CHROME_INSET} + 44px)`) so the large title always clears the control line on every device.
- Out of scope: the bottom nav / player dock.

## Balanced title wrapping — long titles break into evenly-weighted lines

Long album titles wrap **Apple-style balanced** (e.g. "The Very Best of Daryl Hall and John Oates" splits into evenly-weighted rows), not with plain greedy browser line-breaking. Add Tailwind's **`text-balance`** (`text-wrap: balance`) utility to the title heading:

- Applied to the album `<h1>` on both the mobile (`AlbumDetailMobileSurface`) and desktop (`DesktopAlbumView`) surfaces. Mobile stays centered (the parent is `text-center`); `text-balance` works on the block heading directly (don't wrap the text in a `flex`/`flex-wrap` row — balancing applies to a text block, not flex items).
- Reach for `text-balance` on any future multi-line display title (album / playlist / artist headings) so our headings break like Apple's.

## Admin tokens — reach brand colors through CSS vars, not hex

The admin (`body.gt-admin`) is a Stripe-leaning light surface and lives off a tokenized palette, not one-off hex codes.

- The brand hexes (`#319ED8`, `#7F10A7`, `#4AFFCA`, `#FF5470`, `#FF7C06`) are exposed as `--brand-blue`, `--brand-purple`, `--brand-mint`, `--brand-pink`, `--brand-orange` in `client/src/index.css`. Reach them from Tailwind as `bg-[color:var(--brand-blue)]`, `text-[color:var(--brand-pink)]`, `border-[color:var(--brand-orange)]`, etc. — **never inline `bg-[#319ED8]` again**.
- `body.gt-admin` retunes `--brand-blue` to a slightly darker, less candy-bright shade (`#1f7fb8`) so a single Save button reads "Stripe action" rather than "alert pill". The fan-facing player keeps the original `#319ED8`.
- `body.gt-admin` also overrides the shadcn semantic tokens (`--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--border`, `--input`, `--ring`, `--destructive`, `--radius` → ~6px). That means every `<Button>`, `<Input>`, `<Select>`, `<Checkbox>`, `<Card>`, dialog, popover, and toast auto-picks up the light admin palette without per-page styling. Pages should prefer the shadcn primitives over hand-rolled `bg-white border-slate-200` cards.
- **Accent restraint**: at most one filled primary action per row/section. Repeated row-level Save affordances (Formats list, Printed & Signed GoodDeed, per-row edit panels) use a quiet ghost-link Save that activates (brand blue text + faint soft pill) only when the row is dirty. The canonical reference is `client/src/components/admin/SellPanel.tsx`'s `SaveLink`.
- Admin buttons keep crisp ~6px corners (not pills) and `h-8`/`h-9` density. No scale-bounce on press — that's a fan-IconButton-only motion.

## Design Review Checklist — before you ship a page

Every new page (or material edit to an existing one) gets vetted against this checklist **and** the mechanical linter (`npm run design:lint`). The linter catches the boring drift; this checklist catches the judgment calls it can't.

**Mechanical (the linter enforces these — fix or baseline)**:
- No raw brand hex literals (`#319ED8 / #7F10A7 / #4AFFCA / #FF5470 / #FF7C06 / #00062B`) outside `index.css` and the IconButton/shadcn primitives. Reach them through `var(--brand-*)`.
- No `h-10 / h-11 / h-12` on `<Button>` / `<button>` in admin pages — admin density is `h-8`/`h-9`.
- No `text-[Npx]` literals — use the shadcn type scale or the Apple HIG sizes already in this doc.
- Icons come from `lucide-react` (UI chrome) or `react-icons/si` (company logos) only. Any other icon library import is flagged.
- Native `<select>` and hand-rolled `role="menu"` dropdowns are forbidden on admin surfaces — use the shadcn `Select` and `DropdownMenu` from `@/components/ui/*`.
- Naked `<button>` elements that render a single icon child (a lone `<Search />` / `<Trash />` / etc.) must use the `IconButton` primitive instead.
- Sub-44px circular controls on fan-facing surfaces (`rounded-full` with width below `w-11`) are flagged — bump to `IconButton size="md"`.
- Admin inline `<Link>` to other CMS pages must carry the shared link treatment (inherit color at rest, `hover:underline` + brand-blue on hover, with `underline-offset`).
- Any `Trash` / "Delete" / "Remove forever" affordance in a file must be paired with an `AlertDialog` (or equivalent confirm primitive) in the same file.

**Judgment (a human or the reviewer subagent enforces these)**:
- **Surface judgment** — does this page belong to the Apple-Music mobile player or the Stripe-leaning admin? Use the right chrome (glass IconButton vs h-9 square button, gradient bg vs slate-50 page, segmented pill tabs vs slate-100 segmented control). When in doubt on the player: Apple Music, Apple Music, Apple Music.
- **Touch targets** — 44×44pt floor on every fan-facing interactive. No 40px circular buttons.
- **Accent restraint** — at most one filled primary action per row/section on admin. Per-row Save uses the quiet `SaveLink` (ghost link that activates only when dirty).
- **Inline links** — admin metadata that deep-links to its own CMS page inherits text color at rest, switches to brand blue + underline on hover. Never render a `<Link>` to `/admin/.../undefined` — gate on the FK actually being set.
- **Destructive copy** — confirm sheets name the thing being destroyed ("Delete *Storms*? This removes the master, snippet, lyrics, and credits.") with a rose-tinted primary. Hide / Park / Archive are reversible — toast "Hidden — undo," no confirm.
- **Spelling** — US English on every user-facing string. "color", "favorite", "organize".
- **Dark-mode parity** — fan player surfaces must read on the navy `#00062B` gradient (test against the body bg, not white).
- **Mobile-vs-admin chrome consistency** — don't borrow admin h-9 squares into the player, or fan glass chips into admin.

## Shipping a page — standard flow

1. Build the page.
2. Run `npm run design:lint` and fix every NEW violation (the baseline at `.design-lint-baseline.json` absorbs legacy drift; only NEW violations beyond baseline fail).
3. Spawn a design-review subagent against the changed files — see `.local/skills/design-review/SKILL.md`. The reviewer reads this doc, runs the linter, judges the checklist, and returns a structured report.
4. Fix anything red. Re-run lint + reviewer if you made structural changes. Then merge.

**Refreshing the baseline**: only when a legacy page is intentionally migrated, run `npm run design:lint -- --update-baseline` to snapshot the new known set. Don't refresh to silence drift you introduced — fix the drift instead.

## Entity thumbnails

Brand logos and profile photos on admin entity surfaces (Press / Reseller / Manufacturer / Label / Non-Profit / Fulfillment / Person detail headers, and their matching list cards) must **fill their thumbnail container edge-to-edge** in the filled state — no inner padding, no `object-contain` letterbox, no `bg-white` plate, no `ring-1` framing the silhouette. Use `w-full h-full object-cover` on the `<img>` and let the outer rounded-square (or rounded-full, for people) crop. Reserve the white plate + slate ring for the **placeholder** state only, where it sits behind the centered slate fallback icon. Outer `shadow-sm` and the corner radius stay regardless. Canonical reference: the Vendor detail header thumbnail in `client/src/pages/AdminVendor.tsx` (`button-edit-vendor-logo`).

## Expandable row lists

Long lists of sibling rows where the user is *scanning* — admin album track rows, future Fan orders rows, anything Stripe-shaped — must use **exclusive disclosure**: at most one row open at a time. Opening a new row collapses whichever sibling was previously open. Toggling the open row by its own affordance still closes it and leaves the list with zero expanded rows. Without this rule, operators end up with five or six rows open at once and the page becomes a wall.

Use the shared hook: `useExclusiveDisclosure<Id>()` from `client/src/hooks/useExclusiveDisclosure.ts`. Lift it to the list parent, pass `expanded` + `onSetExpanded(open)` down to each row, and make every entry point that opens a row (chevron, title click, status chips, inline edit triggers, etc.) route through the same controller — no per-row `useState` for open/closed, or two rows can drift open at once. Canonical reference: the album Tracks tab in `client/src/pages/AdminAlbum.tsx` (`TracksPanel` owns the disclosure; `TrackRow` is fully controlled).

Use **independent disclosure** (per-section `useState`) for sidebar groups, nested settings disclosures (Player settings panels, etc.) and any case where the user genuinely wants to compare two open panels side-by-side. The exclusive rule only applies to scannable sibling-row lists.

## Spelling

Use **US English** for all user-facing strings (e.g. "color", not "colour"; "favorite", not "favourite"). Code identifiers can stay as they are; only the visible UI copy needs to read American.
