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
- **Two-tone headings — the semantic rule.** A two-tone heading is not two
  atmospheric sentences. The **bold lead** states *what the section is* (a short
  noun) or *the action* (a concise imperative). It is semibold ink and owns its
  own period. The **quiet continuation** describes the *benefit, insight,
  question, or next action* — a normal sentence or question in medium-weight
  subink. **Time ranges belong in controls and data labels, never as the section
  identity.**
  - Good: “Plays. The tracks fans love.”
  - Good: “Activity. Insights for you.”
  - Good: “Finish. Pick your favorite.”
  - Good: “Storage. How much space do you need?”
  - Bad: “This week. A quiet look at the last seven days.” — a time range is not
    an identity, and both clauses are atmospheric with no noun or imperative.
  - Bad: “Your music. Everything in one calm place.” — the lead is vague mood,
    not a concrete noun/imperative, and the continuation states no benefit,
    insight, question, or next action.
  - Punctuation is fixed: the lead owns its period; the continuation is a normal
    sentence or question. Page h1 ~30px, letter-spacing -0.02/-0.03em; section
    headings 20–22px.
- Big numbers (KPIs) are large (≈38px), semibold, `tabular-nums`, tight
  letter-spacing — elegant, not loud.
- **One content identity per level.** A product/tab shell and its mounted panel
  never render competing headings and subheads for the same thing. Keep the
  shell H1 plus one requirement or metadata line; panel content starts with its
  controls or first real section. Repeating “Vinyl music” and “Physical audio”
  is hierarchy drift, not useful context.

## No-drift implementation protocol (ratified Aug 30 2026)

This protocol is mandatory for changes to an existing GoodTunes surface. It
exists so reviewers do not have to repeatedly re-identify canon that already
lives in the app or style guide.

1. **Find the source of truth before designing.** Read the current project
   status and this canon, then locate the live route, component, shared
   primitive, and approved screenshot for the surface. Record whether each
   requested page is `EXACT`, `RELATED`, or `ABSENT`.
2. **Reuse `EXACT`; never redraw it.** Extract or import the existing component
   and preserve its geometry, copy, states, assets, and responsive behavior.
   A Super-admin version adds permission and scope only; it does not receive a
   parallel visual implementation.
3. **Never substitute `RELATED`.** A release-art page is not an artist Cover
   page; release Billing is not artist Payouts. Similar naming is not evidence
   of shared semantics.
4. **Stop at `ABSENT`.** Request the current implementation, screenshot, or an
   explicit product decision. Do not fill the gap with a plausible dashboard,
   summary card, placeholder content, or remembered design.
5. **Use shared canon primitives.** Containers, headings, cards, segmented
   controls, dialog shells, close controls, buttons, service marks, and rows
   come from the approved implementation or design system. Do not restyle them
   locally to solve one screenshot.
6. **Reconcile the two sources of truth; never blindly rank one.** Current
   Git/Otis code owns behavior, data contracts, routes, permissions, and
   functionality. The newest explicitly approved Playground/GoodStudio
   component owns visual and UX improvements that may not have reached
   production yet. Pulling newer Git must not regress an approved mock to older
   styling, and promoting a newer mock must not drop behavior that exists in
   Git. When recency or approval is unclear, stop and show the difference
   before editing. Exploratory flows remain non-canonical.
7. **Verify visually, not only statically.** Typecheck and diff checks are
   necessary but insufficient. Before presenting work, compare rendered
   screenshots against the approved source at desktop and 768px, in dark and
   light themes, including changed interaction states.
8. **Reject geometry drift.** Verify the shared 1240px container, gutters,
   heading scale, card rhythm, target sizes, and responsive collapse. For
   filters and dialogs, compare bounding boxes across states so controls do not
   move under the pointer.
9. **Demonstrate every changed action.** Open, confirm, cancel, success,
   empty/read-only, and return-focus states must work. No dead buttons, native
   tooltips, developer state chrome, or unexplained duplicate actions.
10. **Do not declare completion from a delegated report alone.** The main
    reviewer must inspect the final rendered route and the exact changed states
    before calling the work complete.

If any step cannot be satisfied, report the missing source explicitly and wait
for it. Accuracy outranks filling every tab.

## Buttons — the weight rule

- Buttons are **rounded-full pills**. Tiles choose; buttons act.
- **Only the ONE truly primary CTA per screen gets a filled blue pill.**
- **Confirm buttons earn their blue.** A dialog/form confirm is NOT solid
  blue until the user has done something actionable (picked a file, typed a
  valid URL, changed a field). Until then it renders as a quiet Apple-like
  pill with a dark-gray hairline outline (subink text, transparent fill);
  it fills blue the moment the action becomes valid. Never a big idle blue
  button. (Ratified 2026-08-18, Bill.)
- **Page-header actions are dark-gray-outline pills, not blue.** The
  top-right page action (e.g. "Create release" on a wall page) renders as an
  Apple-like quiet pill — dark-gray hairline outline, ink text, NO fill.
  Filled blue is reserved for confirms that have earned it inside a flow,
  not for standing page-level entry points. (Ratified 2026-08-18, Bill.)
- All other actions — list/row actions, secondary links, header extras — are
  **quiet borderless text buttons** (blue for the main verb, subink for the
  rest) with a soft hover tint (`#f0f7fc` for blue, light gray otherwise).
  Rows of equal-weight labeled pills are NOT Apple.
- **Segmented controls share one geometry.** On a given surface, every
  segmented control uses the same height, inset, radius, type size, selected
  shadow, and focus treatment. Segment widths may follow label length; hierarchy
  comes from placement and labels, never from arbitrarily larger pills.
- **History controls reflect the cursor.** Undo, Redo, and Reset are disabled
  and visibly dimmed when unavailable. Initially all three are dimmed. A change
  enables Undo and Reset; Undo enables Redo; returning to the original cursor
  disables Undo and Reset; a new change after Undo discards the redo branch.
  Never render unavailable history actions at normal contrast.
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

### Entity deletion — Danger Zone (ratified, operator)

- Entity-level deletion lives at the **bottom of Settings in a subdued Danger
  Zone** — never in page headers, tab strips, or primary navigation.
- Use an explicit **named confirmation** (name the entity being destroyed).
- Artist/account deletion **requires typing the entity name** before the
  destructive confirm — the rightmost confirm stays disabled until the typed
  name matches. (Confirm remains rightmost; Cancel is the quiet borderless text
  button immediately to its left.)

## Controls & chrome

- **Navigation vs. state controls (ratified, operator).** Peer
  destinations/routes use **text tabs with an active underline**. Chips and
  segmented pills are ONLY for local mutually-exclusive state or filter changes
  (date range, metric, format) — never for primary navigation. A segmented pill
  standing in for peer navigation is a canon violation.
- **Global operator chrome shows the GoodTunes logo only — exactly once per
  screen.** Do not append redundant role labels like "Super admin" to the global
  chrome when the nav rail or context already establishes the role. Role is
  scope, not a wordmark suffix.
- **The GoodTunes wordmark must never appear in both the global header and the
  rail simultaneously.** Full operator shells place the single wordmark in the
  sticky global header and pass `showLogo={false}` to `OperatorRail` — the rail
  then omits the logo block entirely (no dead vertical gap) and the search box
  becomes the first rail element. Standalone / rail-only contexts (demos,
  embedded previews, any layout without a branded global header) may leave
  `showLogo` at its default (`true`), keeping the wordmark in the rail. Pick one
  location per screen; never both.
- **The operator left rail is a single owned component — import it, never
  rebuild it.** The one canonical operator/super-admin rail is the design
  system's `OperatorRail` (`@workspace/goodtunes-design-system/components/operator-rail`),
  driven by the typed semantic registry `ADMIN_NAV_CANON`
  (`.../components/operator-nav`). Screens render `<OperatorRail activeId onNavigate />`
  and nothing else. **Local rail markup, local nav arrays, and local label→icon
  maps are prohibited** — the registry owns the tree, the ids, the labels, the
  default counts, and every Lucide icon; consumers never select an icon. This
  replaces the earlier "copy this rail block into admin mocks verbatim" /
  "every admin mock copies this rail" advice from `AdminRailCanon`: there is no
  copying anymore, only import. When the rail changes, it changes in
  `operator-nav.tsx` / `operator-rail.tsx` once, and every surface inherits it.
- Segmented control: a **fully-rounded pill track** (`rounded-full`,
  `--apple-track`) holding a **raised, fully-rounded active thumb**
  (`rounded-full`; white in light mode with `0 1px 3px rgba(0,0,0,0.08)`,
  lighter charcoal `#3a3a3e` in dark with `0 1px 3px rgba(0,0,0,0.4)`).
  Reference: the Catalog Vinyl/CD/Cassette switcher and the dashboard
  Today/7d/30d range switcher. **Never squared chips** — a segmented control
  with `rounded-md`/`rounded-lg` corners or box-shaped options is a canon
  violation. (Ratified 2026-08-09; closes the squared segmented controls Bill
  found in the live admin.)
- Appearance switcher (user menu): an **`APPEARANCE` small-caps eyebrow** above
  a segmented pill with **worded segments — `Light` / `Dark` / `System`** —
  never icon-only sun/moon/monitor glyphs (words over icons; icon-only state
  controls are a canon violation). Reference: the press shell user menu.
  (Ratified 2026-08-19; closes the icon-only variant Bill found in the artist
  portal.)
- Modal close: small gray circle (`--apple-chip`) with a dark ×. Notification
  bells use the same gray-circle treatment.
- Header: sticky, translucent, blurred (`rgba(255,255,255,0.72)` +
  backdrop-blur; dark: `rgba(22,22,23,0.72)`), hairline bottom border.
- Nav rail: quiet gray surface (`#f5f5f7`; dark `#1c1c1e`), active item is a
  raised white pill (dark: lighter charcoal pill).
- Cards: white `rounded-2xl`, hairline border, no drop shadows at rest;
  hover may add a whisper of shadow.
- Bottom scroll-fade gradient on scrolling panes; hides at the bottom.

### Dialogs, sheets & chooser panels (ratified Aug 30 2026)

- **Dialog hierarchy:** dialog titles are 26–30px semibold INK with
  `-0.02em` to `-0.03em` tracking. Their single-line supporting copy is
  15–17px SUBINK. Modal titles must never inherit row-label or small
  section-card sizing.
- Reuse the canon gray-circle × close control, aligned to the title row.
- **Chooser tiles choose; buttons act.** A chooser option is a whole-target,
  large rounded rectangle: 76–92px minimum height on desktop/tablet, a
  40–44px icon carrier, 16–17px choice label, and the real logo whenever it
  exists.
- Filters reuse the compact rounded segmented pill. Segment target geometry is
  stable and equal across selected states.
- **Stable without dead space:** filtering must not resize/recenter a dialog
  or move its filters. Stabilize the header and a bounded internal result
  viewport (about 2.5–3 rows), then scroll results inside it. Never freeze a
  dialog to the tallest category and leave a large empty body; empty states
  occupy the bounded result viewport.
- Dialog width follows the task (a chooser is typically 620–720px on desktop)

### Uploads use one Canon importer

- Every user-facing **Add**, **Upload**, **Replace**, attachment tile, and empty
  asset slot opens the same Canon importer. A launcher must never open the
  operating-system file picker directly.
- The importer always offers **Upload file** and **Paste a URL**. Upload file
  contains the drag-and-drop target plus a **Choose file** action; only that
  action may open the native picker.
- Guidance is contextual: show the accepted formats, size limit, dimensions,
  template requirement, or duration needed for the selected asset.
- Empty tiles are launchers, not miniature drop zones. Keep one empty Add tile
  per collection; open the importer for drag/drop and URL entry.
- Replace uses the same importer as Add. Download remains a direct action.
- Use the shared Canon dialog geometry, segmented source control, charcoal
  semantic tokens, close control, focus return, and enabled-confirm rules on
  every operator, artist, press, and NPO surface. Local importer variants and
  inert upload approximations are prohibited.
  and max-height is viewport-safe. At 768 use safe insets, not edge-to-edge
  unless it is a true sheet.
- One Add entry point transitions within the same dialog to its detail/form;
  never add a nested “More…” page when a scroll region fits all choices.
  Confirm remains rightmost, Cancel immediately left; inherited focus and
  reduced-motion rules still apply.

### Service identity (ratified Aug 30 2026)

The repeated icon + title + secondary-text semantic is always the design-system
`ServiceIdentity` component, never local markup. Its geometry is fixed: 44px
carrier, 32px logo slot, 12px icon/text gap, 15px semibold title, and 13px
regular secondary text. Apple Music, Spotify, Shopify, and future integrations
use the same carrier and logo bounds, preserving aspect ratio within the slot.
Surrounding cards determine outside padding only and cannot restyle these
internals. Once a repeated pattern is approved and added to the canon/library,
all future implementations import it; fixes happen centrally.

**Carrier (ratified — brand marks are never navy tiles).** `ServiceIdentity`
exposes `carrier?: 'muted' | 'brand'` (default `'muted'`). `'muted'` is the
generic monochrome tile — a `bg-muted` carrier with a hairline border for
currentColor glyphs. **External brand marks use `carrier='brand'`:** the same
44px optical slot with a transparent background and no invented border/tile;
the native `img`/`svg` mark keeps its original color and is never inverted or
recolored, and full-square app marks and portrait bag marks both fit the slot
without distortion. **Never place an external brand mark on GoodTunes blue /
fan navy** (the default `muted` tile inherits it on dark operator surfaces)
unless that color is part of the official asset itself. `data-carrier`
mirrors the prop on the root and carrier nodes for testing.

### Operator rail (ratified — import-only ownership)

The operator/super-admin left rail has exactly ONE implementation:
`OperatorRail`, driven by the typed registry `ADMIN_NAV_CANON`. There is no
"copy the rail" step and no per-screen Theme object — theme comes from the DS
`--apple-*` variables via the active class context (`.dark` / `.gt-admin-dark`).

```tsx
import { OperatorRail } from "@workspace/goodtunes-design-system/components/operator-rail"
import { ADMIN_NAV_CANON } from "@workspace/goodtunes-design-system/components/operator-nav"

// Full operator shell — global header owns the wordmark:
<OperatorRail
  activeId="presses"              // stable id from the registry; drives aria-current + active pill
  onNavigate={(id) => go(id)}     // called with the stable id
  showLogo={false}                // header already has the wordmark — rail omits it, no dead gap
  // optional:
  // countOverrides={{ "fan-orders": 12, feedback: 0 }}  // live counts by id (0 renders as 0)
  // defaultOpenGroupIds={["partners"]}                   // defaults to the group holding activeId
  // onSearch={(q) => ...}          // makes the h-9 search box interactive
  // searchPlaceholder="Search admin…"  searchHint="⌘K"  // hint; pass null to hide
  // className="gt-admin-dark"      // or inherit theme from an ancestor
/>

// Standalone / rail-only (demo, embedded preview, no branded header):
<OperatorRail
  activeId="presses"
  onNavigate={(id) => go(id)}
  // showLogo defaults to true — wordmark renders inside the rail
  // logoSrc={goodtunesWordmark}    // DS ships no bundled logo → text wordmark fallback
/>
```

Registry API (`operator-nav.tsx`): `ADMIN_NAV_CANON` (the typed tree),
`OperatorNavItem` / `OperatorNavChild` / `OperatorNavIcon` types,
`getAllOperatorNavIds()`, and `findOperatorNavGroupId(id)`. The registry owns
every icon component (exact Lucide mapping) — **consumers never import or select
a Lucide icon for the rail.** Stable ids: `dashboard`, `people`, `catalog`
(`projects`/`gear`/`custom-add-ons`), `partners` (`labels`/`managers`/`npos`/
`presses`/`makers`/`resellers`/`fulfillment`/`team-accounts`), `queues`
(`press-orders`/`fan-orders`/`cert-names`/`early-cut-review`/`jobs`/`feedback`),
`audience` (`customers`/`welcome-back`), `reports`, `gooddeed`, `publishing`,
`system` (`platform-pricing`/`payouts-to-release`/`vendor-payees`/
`payment-requests`/`invites`/`invite-tree`/`invite-directory`).

Geometry (canon, baked into the component): 256px width; GoodTunes wordmark only;
h-9 fully-rounded search; h-9 rows; 16px icons at Lucide default stroke 2 /
currentColor; 28px child indent; active = raised card pill (ink + subtle shadow),
idle = subink, hover wash; counts ride the right edge as quiet numbers (0 shows,
never hidden); the group holding the active page opens on arrival, chevron
rotates, nothing slides. Admin dark is charcoal, never navy. Accessibility:
`<aside>` + `<nav>` labels, real button/anchor semantics, `aria-current="page"`,
`aria-expanded` on groups, focus rings, and comfortable targets.

**Wordmark placement rule:** the GoodTunes wordmark appears exactly once per
screen. Full shells: header owns it → `showLogo={false}` on the rail. Standalone
contexts (no branded header): `showLogo` defaults to `true` → wordmark in the
rail. Showing it in both places simultaneously is a canon violation.

**Prohibited:** a second rail component, a locally-declared nav array, a
local label→icon map, a per-screen `Theme` prop, or duplicate wordmarks (header
AND rail). Fix the rail once in `operator-nav.tsx` / `operator-rail.tsx`; every
surface inherits it.

### Artist, Press, and NPO chrome (ratified — import-only ownership)

Artist, Press, and NPO navigation is likewise import-only. Use
`ARTIST_NAV_CANON`, `PRESS_NAV_CANON`, or `NPO_NAV_CANON` from
`@workspace/goodtunes-design-system/components/role-nav`, rendered through
`RoleRail` from `components/role-rail`. `RoleHeader` and `RoleShell` from
`components/role-chrome` are route-agnostic chrome primitives. They accept
identity/actions/content; `RoleRail` accepts `activeId` and `onNavigate`.
Routes translate stable ids inside `onNavigate`; registries own labels, Lucide
icons, groups, and Press's pinned Settings group. No local fallback arrays or
label-to-icon maps are permitted.

`CANON_FOUNDATION_AUTHORITY` in `components/canon-authority` is the typed
authority record for role rails/top rails, role workspaces, and workflow owners.
Its owner import path is authoritative for changes. Estimate and package builders
remain owned by their existing exact route implementations (`PressQuoteBuilder`
and `PressPackageBuilder`): chrome does **not** own or replace their calculations,
pricing, state, or delivery behavior until safely decomposed.

R&D may promote a role pattern to Canon only after its registry, semantic-token
primitive, authority entry, docs, and dependent migration plan land together.
Until then, R&D retains its source-route owner; a screenshot or a copied rail is
not a Canon dependency update.

### Canonical primitives

| Semantic need | Design-system component | Prohibited local alternative |
| --- | --- | --- |
| Operator page margins | `ApplePageContainer` | Per-page max widths/gutters |
| Page, section, utility headings | `AppleHeading` | Local text-size/tracking recipes |
| Operator boxes and hairlines | `AppleCard` / `AppleSectionHeader` | Hand-built bordered divs or styled `<hr>` |
| Section + Add | `AppleSectionHeader` + `AppleQuietAction` | One-off header/action alignment |
| Quiet actions | `AppleQuietAction` | Local icon/text button styling |
| Status language | `AppleStatus` | Color-only status labels |
| Service logo/title/secondary | `ServiceIdentity` | Bespoke service media rows |
| Dialog title, close, body, actions | `AppleDialogShell` | Local modal shells |
| Operator/super-admin left rail | `OperatorRail` + `ADMIN_NAV_CANON` | Copied rail blocks, local nav arrays, local label→icon maps |

Acceptance lifecycle: explore once → approve → add component, token, docs, and
demo → migrate existing uses → all future pages import it → changes happen
centrally → sync to Otis/GitHub.

## Page layout (ratified Aug 11 2026)

### Role parity & permission deltas

Artist, press, partner, and Super-admin surfaces use the same shell geometry,
typography, cards, rows, tabs, status language, controls, and responsive
rules. Roles change data scope and available actions only; Super-admin powers
are quiet contextual actions, overflow menus, or dialogs—not louder styling or
denser chrome. Read-only roles hide mutations or state their limitation
explicitly, never show fake enabled actions. Reuse an approved artist component
or pattern before authoring an admin analogue.

Super-admin is the functional superset: it retains the shared page body and may
receive additional scoped data and quiet operator actions. Artist, Label, Press,
NPO, and other roles render that same approved visual system with only the
capabilities their permissions allow.

**Artist greetings belong to Artist (or explicit View-as-Artist) mode only.** A
Super-admin viewing an artist profile uses the **artist identity header** and
suppresses first-person artist greeting copy ("Good afternoon, [artist]"). The
operator is not the artist; personal greetings render only in the artist's own
context or an explicit View-as-Artist mode.

### Git → Playground → Otis promotion loop

1. Fetch the current Git implementation and inventory its routes, data,
   permissions, states, and actions.
2. Compare it with the newest approved GoodStudio component. Preserve newer
   approved look-and-feel even when production still carries an older visual
   treatment.
3. Improve through shared canon tokens and components. Do not create
   role-specific visual forks.
4. Verify that no current Git behavior was lost: navigation, loading, empty,
   error, read-only, mutation, confirmation, success, and return states.
5. Review and approve the improved component in Playground/GoodStudio.
6. Promote source code, assets, canon documentation, and behavior notes to
   Otis/GitHub together. Screenshots support the handoff but never replace
   reusable source.
7. After Otis ships it, treat Git as the functional baseline for the next
   round while retaining the approved GoodStudio component as the record of
   any visual work still awaiting promotion.

Sample Series press profiles follow the dedicated
[`Sample Series → Otis handoff`](./sample-series-otis-handoff.md) contract.
GoodStudio may preview a reserved `get.goodtune.music/press/:pressSlug` address,
but only Otis persists assets, reserves the slug, and publishes that route.

R&D artist association and comments follow the
[`R&D → Otis artist lookup handoff`](./r-and-d-otis-handoff.md) contract. The
approved mockup keeps catalog-first search with the main application's existing
Spotify fallback; production credentials, IDs, permissions, and persistence
remain Otis-owned.

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
- **Clickable experience thumbnails**: the thumbnail itself is the link and
  keeps visible hover and keyboard-focus feedback. Do not cover its artwork
  with an “Open live view” pill or replacement badge; use an accessible link
  name to describe the destination instead.
- **Ranked lists**: rank number in faint gray, thumb (projects = rounded-rect,
  presses = white circle logo), revenue right-aligned, thin blue progress bar
  aligned to the title column.
- **Activity feeds**: people get photo circles; partner logos sit on WHITE
  carrier circles, `object-contain`, small padding, never recolored or
  inverted (see Logos — the white circle is the light surface). Impersonal
  events get gray rounded-square icon chips.
- Status dots (green/gray) + short phrase for item state ("Priced — ready to
  press", "Draft — no artwork yet").
- **Overflow glyph direction (ratified Aug 30 2026):** circular overflow-action
  controls always use a horizontal ellipsis (`…` / `MoreHorizontal`). Do not use
  vertical dots inside circles. Vertical ellipsis belongs only to legacy row
  menus that have not yet migrated to the circular-action canon.
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

### Vinyl selector thumbnails (ratified Aug 29 2026)

- **Type and color choices are records, never dots or spheres.** Every selectable
  vinyl type card and color card renders the same miniature record treatment as
  the primary preview: edge, grooves/material, center label, spindle, and shine.
- **Miniatures keep their press mark.** Small size is not a reason to suppress
  the center-label logo. Scale the mark down with the record.
- **Press center treatments stay literal.** Hellbender uses a neutral black
  center label with its white symbol-only icon. Paramount uses its standalone
  record symbol with no generated copy. Memphis keeps its established MRP
  treatment. Never infer a center-label fill from a press palette.
- **One rule across flows.** The package builder, press estimator, artist
  estimate builder, vinyl catalog/setup, and desktop/mobile artist builders use
  this same selector treatment. A generic color dot is acceptable only as a
  non-interactive status indicator in a summary strip.

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
- **Portal surfaces inherit the operator theme explicitly.** Dialogs, dropdowns,
  popovers, sheets, command menus, and tooltips render outside the page DOM.
  Every operator/artist portal must carry `gt-admin-dark` (or an equivalent
  propagated theme context) so both Apple tokens and semantic `background`,
  `card`, `popover`, `muted`, `border`, and text tokens resolve to charcoal.
  Generic `.dark` alone is fan navy and is forbidden on operator/artist portals.
  Navy or white portal content over a charcoal page is an acceptance failure.
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
- **GoodDeed historical references are evidence, not replacement templates.**
  An older artist-specific PDF may be used to confirm an approved invariant
  such as the orange print perimeter, but its album artwork, recipient,
  certificate number, copy, or geometry must not replace current Otis data or
  the locked Otis renderer. Preserve the Canon orange border while generating
  the current artist/release through Otis; GoodStudio displays that output and
  never rebuilds it.
- **GoodDeed social Canon begins with Otis actuals, not a GoodStudio
  reconstruction.** After an approved push, Otis must return the exact current
  Square (1080×1080), Portrait (1080×1350), and Story (1080×1920) source
  component/assets plus representative rendered PNGs. Archive that package as
  the GoodStudio baseline before proposing visual changes.
- Current Otis social evidence includes square card corners, the orange frame,
  the production GoodTunes mark, and a centered owner avatar. Preserve these as
  observed production facts until a separately approved redesign changes them.
- A Story safe-zone overlay is reference-only and must never be baked into the
  exported certificate. Do not draw it from a convenient inset or infer it from
  a screenshot. It must name the target platform and derive from verified pixel
  bounds on the 1080×1920 output. Until those measurements are supplied and
  checked, the safe-zone control remains unavailable and is not Canon.
- Source switches own their content: **Individual tracks** contains individual
  masters; **Side masters** contains Side A/B files. Generation belongs in an
  empty or incomplete Side masters state. Extraction belongs in an empty or
  incomplete Individual tracks state. Never render both asset sets unchanged
  under both tabs or place source-specific instructions above both tabs.


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
