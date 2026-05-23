# Design System

**One design system covers the entire product** — mobile player, admin/CMS, and every mockup. Identical concepts must look identical everywhere. No one-off colors, button sizes, hover treatments, or icon sizes outside the primitives.

## Brand

- Colors: `#00062B` (bg), `#319ED8` (blue), `#7F10A7` (purple), `#4AFFCA` (mint), `#FF5470` (heart pink)
- Mobile-first single column, max width ~440px
- Apple-Music-style large headers, 44×44 minimum touch targets
- Songs use **heart** icon (`#FF5470`); artists use **star** icon

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

## Destructive actions always confirm

Any trash / delete / "remove forever" button must pop a confirmation sheet naming the thing being destroyed (e.g. "Delete *Storms*? This removes the master, snippet, lyrics, and credits.") with a rose-tinted primary action. Hide / Park / Archive are reversible and do **not** need a confirm — they just toast "Hidden — undo." Destructive buttons must also keep visual breathing room (gap + hairline divider) from any adjacent non-destructive control so a thumb can't slide between them.

## Player dock primitive

`client/src/components/ui/PlayerDock.tsx` — Apple-Music-style floating pill (transport · cover/title · lyrics/volume) graduated from the admin Tracks-tab Seamless mockup. The mockup sandbox keeps a parallel inline `BottomDock` copy (the sandbox alias can't reach `client/src`); mirror polish into both files until the sandbox gains a real alias.

**Reuse for the consumer player**: this same primitive should drive the fan-facing player surface (Now Playing / mini-player) once we wire lyrics, queue, and shuffle/repeat state for fans. Plan to extend rather than fork: keep the dock as-is for admin (lyrics-disabled placeholder), and pass `onLyrics`, real shuffle/repeat handlers, and a queue when consumer mounts it. Any polish landing here should automatically benefit the consumer dock.

## Admin tokens — reach brand colors through CSS vars, not hex

The admin (`body.gt-admin`) is a Stripe-leaning light surface and lives off a tokenized palette, not one-off hex codes.

- The four brand hexes (`#319ED8`, `#7F10A7`, `#4AFFCA`, `#FF5470`) are exposed as `--brand-blue`, `--brand-purple`, `--brand-mint`, `--brand-pink` in `client/src/index.css`. Reach them from Tailwind as `bg-[color:var(--brand-blue)]`, `text-[color:var(--brand-pink)]`, `border-[color:var(--brand-blue)]`, etc. — **never inline `bg-[#319ED8]` again**.
- `body.gt-admin` retunes `--brand-blue` to a slightly darker, less candy-bright shade (`#1f7fb8`) so a single Save button reads "Stripe action" rather than "alert pill". The fan-facing player keeps the original `#319ED8`.
- `body.gt-admin` also overrides the shadcn semantic tokens (`--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--border`, `--input`, `--ring`, `--destructive`, `--radius` → ~6px). That means every `<Button>`, `<Input>`, `<Select>`, `<Checkbox>`, `<Card>`, dialog, popover, and toast auto-picks up the light admin palette without per-page styling. Pages should prefer the shadcn primitives over hand-rolled `bg-white border-slate-200` cards.
- **Accent restraint**: at most one filled primary action per row/section. Repeated row-level Save affordances (Formats list, Printed & Signed GoodDeed, per-row edit panels) use a quiet ghost-link Save that activates (brand blue text + faint soft pill) only when the row is dirty. The canonical reference is `client/src/components/admin/SellPanel.tsx`'s `SaveLink`.
- Admin buttons keep crisp ~6px corners (not pills) and `h-8`/`h-9` density. No scale-bounce on press — that's a fan-IconButton-only motion.

## Design Review Checklist — before you ship a page

Every new page (or material edit to an existing one) gets vetted against this checklist **and** the mechanical linter (`npm run design:lint`). The linter catches the boring drift; this checklist catches the judgment calls it can't.

**Mechanical (the linter enforces these — fix or baseline)**:
- No raw brand hex literals (`#319ED8 / #7F10A7 / #4AFFCA / #FF5470 / #00062B`) outside `index.css` and the IconButton/shadcn primitives. Reach them through `var(--brand-*)`.
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

## Spelling

Use **US English** for all user-facing strings (e.g. "color", not "colour"; "favorite", not "favourite"). Code identifiers can stay as they are; only the visible UI copy needs to read American.
