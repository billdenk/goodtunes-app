# Press Templates — live-test flow (handoff, Aug 14 2026)

**Rule of this handoff (binding):** these files are the source, not a reference. Copy the
presentational code **character-for-character**; only swap `MOCK_` data / module-store
stand-ins for real wiring. Any visual difference other than data values is a failure.
Acceptance: full-page top-to-bottom diff at 1440px, both themes, plus 1024 and 768.

**Rails:** the left rail and top bar in these files are Playground mock chrome
(PressShell). In Otis, keep YOUR existing press-portal rails exactly as they are — only
the page content inside is verbatim. Everything from the breadcrumb down is the handoff.

**If anything here seems off or contradicts what's live in Otis: don't veer, don't
silently adapt — flag the question back to Bill. He wants to hear it.**

## Flow (screen order)

1. **PressTemplatesIndex** — the start page (Catalog → Templates).
   - Header "Upload a template" button → upload sheet in *no-slot* mode: optional Name
     ("Single jacket — Special" placeholder) + optional Component pills (Jacket, Sleeve,
     Labels, Booklet, Other). Both optional — never block an upload on paperwork; rename
     later on the test page, associate component later.
   - Dashed empty-slot tiles → same sheet in *slot* mode: shows "For: {slot}" and asks
     only for the PDF (the slot already knows name + component).
   - Certified tile → detail sheet (preview, code/rev, history) with blue **Replace
     template** → upload sheet (slot mode). Replace = new revision; old moves to
     history, never deleted.
   - Choosing a PDF stashes it (with optional name) and routes to the live test.
   - Saved-this-session tiles ("Saved" + time + "N art files tested") reopen the live
     test with the same file. Just-saved tile pulses its hairline blue once (~0.9s) then
     fades back — completion cue, Apple-quiet.
2. **PressTemplateLiveTest** — reads the PDF's GT layers live and overlays them.
   - Arriving with no file (refresh/deep link) redirects back to Templates. The test
     page is a room, not an entrance.
   - Views (Full/Cut/Bleed/…), zoom stepper − % + (click the % readout to reset to
     100%), drag-pan when zoomed.
   - Art test: "Accept & Test" opens the art picker; once art is loaded it is replaced
     by **"Save result & test another"** (stamps art name + Pass/Flagged verdict + time
     into a visible trail) and **"Accept & Save"**.
   - Template chip (art loaded): body toggles the underlay; turning it on resets art
     opacity to 100% and, first time only, auto-opens the chevron dropdown holding the
     Apple-style Art-opacity slider (thin hairline track, white round thumb).
   - Save dialog is context-aware: untested → "Save this template?" nudge to test
     first; tested → "Test saved — congrats…" with blue "Back to Templates".
   - Save pushes the template (name, dims, layer count, test trail) to the Templates
     shelf. In the mock that shelf is the in-memory `savedLiveTemplates` module store —
     in Otis it becomes DB rows (template + test-run children). Same for
     `pendingTemplateFile` (file + optional display name passed between pages).

## Wired vs decorative

Wired: everything above. Decorative/mock-only: PressShell chrome, "View light/dark"
floating pill, MOCK_ tiles for other components, Comment pill.

## pdf.js recipe (hard-won — do not rediscover these)

- `pdfjs-dist` 5.x needs a `Map.getOrInsertComputed` polyfill (top of
  PressTemplateLiveTest.tsx) or it throws at runtime. Worker via
  `pdf.worker.min.mjs?url`.
- GT layers are read by **optional-content group name** (`GT CUT LINE`,
  `GT BLEED AREA`, …), rendered per-layer to offscreen canvases to get exact mm boxes.
- Operator-list gotchas: `constructPath` point data lives at `args[1][0]`
  (a Float32Array **inside an Array**); `closePath` arrives as command **4** (accept 3
  and 4); zero-length lineTos (register ticks) must not count as straight edges — track
  the previous point and skip if Δ ≤ 0.01.
- Circle detection: a subpath with curves and no real straight edges → `round: true`.
- Frame/band washes: collect per-subpath bboxes (split at each moveTo, CTM applied);
  the largest subpath strictly inside the outer box by >0.5pt is the inner hole; render
  the wash as an even-odd SVG path (rect or two-arc ellipse) so only the band fills.
- Bleed check: art covers GT Bleed in both dims (either orientation, ±1mm grace) →
  pass; oversized passes with "the extra trims away"; art matching Cut exactly fails
  ("bleed missing").

## Themes

Light + dark ALWAYS (Bill's binding rule). Both files carry THEMES token sets; dark
charcoal is the press-portal default. Statuses are word + icon, never color alone
(Bill is colorblind). One filled blue (#319ED8) action per screen.


## Addendum 5 — Aug 16 2026 (certification visibility + pending UX; supersedes Addendum 4 where they touch)

Both .tsx files updated — replace verbatim as always. New assets in assets/:
gt-preview-template-flat.jpg, gt-preview-jacket-flat.jpg, plus the two source
PDFs the mocks fetch at runtime (label-template-r091125.pdf,
jacket-template-r072226.pdf).

What changed:
1. **Tile redesign (GoodStudio proportions):** preview edge-to-edge on top
   (height 200, object-top, white bg, hairline bottom border); name 16px with
   the component icon docked flush-right (icon fades on hover, ••• takes its
   spot); status word + icon + date always visible under the name. Hover-only
   fine print: press nickname, code · rev, supersede history.
2. **Pending on tiles:** an ⓘ beside the Pending chip opens a CLICK popover
   (fixed-position so the card's rounded corners can't clip it): "Attached,
   not yet certified — it certifies itself when a finished file passes. Open
   to test." Why + action, never color alone.
3. **Nickname home (your plumbing):** quiet first hover line on the tile;
   canonical slot title stays fixed at rest. Renaming should reuse the live
   test page's existing rename — one way to rename, not two; skip the
   tile-level pencil/dialog from your stub.
4. **Live test page:** status carries over from the tile (Certified · date
   beside the name; uncertified reads "Not tested"); reopened templates show
   "Last test: … — full trail under •••"; breadcrumb = the template's own
   name; Save is a quiet outline when clean and filled blue only when dirty
   (rename / replace / new test result) — never a grayed-out blue; on an
   uncertified template the heading becomes "Template. Test. Certify." and
   the Test button reads "Test & certify" with a gentle blue glow
   (gt-certify-glow keyframes, 2.4s).
5. **Resume-draft dialog:** the dead ⓘ tooltip is gone; the explanation is a
   plain second line ("You opened this without pressing Save…").
6. **New, separate handoff:** handoff/press-settings-templates-policy/ — a
   per-press Settings toggle "Require a passing test before a template goes
   live" (default Off). See its README for wiring + enforcement.

States checklist (acceptance, both themes, 1440px):
- Shelf: certified tile at rest + hover; pending tile at rest + hover +
  popover open; archived; empty dashed slots; saved-from-live-test tile.
- Live test: certified open (badge + last-test line, quiet Save, plain Test);
  uncertified open (Not tested, "Certify." heading, glowing "Test & certify",
  quiet Save); dirty Save after rename/replace/test; resume-draft dialog.


## Correction round — Aug 16 2026 (verbatim, replaces prior copies)

Both .tsx files above are superseded character-for-character by this commit. Changes:

**PressTemplateLiveTest**
- Verdict wording leads with the word: "Pass! All measured checks passed" /
  "Fail! Measured checks flag issues" / "Visual only — nothing to measure".
- Results banner moved up: sits directly under the heading, above the preview card.
  Step rail ("Template › Art file › Results") removed.
- Results arrival animation: banner settles in (0.45s translate+fade), then ONE ring
  pulse in the verdict color (green pass / red fail / gray visual-only), keyed per art
  file. Then quiet.
- NEW Pending banner: same module/slot as Pass/Fail, shown when template has no test
  and isn't certified. "Pending — not certified yet" + instruction line; expanding
  shows "No art files tested yet" + "Choose an art file". The top slot is the page's
  one status voice: Pending → Pass!/Fail!.
- Pending attention cues: soft amber ring around the Pending banner with a white point
  of light orbiting the border (3.6s/lap, transform-rotation — no @property), and
  Test & Certify pulses a gradated amber fill on the same 3.6s rhythm. Blue stays
  reserved for the one filled action.
- Layers popover text bumped for legibility (title 15px, rows 14px semibold, mm 13.5px).
- Header buttons: Cancel only renders when dirty; Save shows quiet "Close" when clean /
  filled-blue "Save" when dirty. Layers + Test & Certify + ••• moved to the right end
  of the view-chips row.
- Template fine-print line (mm · layers · uploaded) capped at 520px + ellipsis, full
  text on hover.
- Breadcrumb "Templates" wired back to the Templates index.
- GOTCHA (root cause of "no animations"): all keyframes must live in an
  always-mounted <style> at page root — NOT inside a conditionally rendered child.

**PressTemplatesIndex**
- Pending/caution accent now matches the live-test Pending amber hue family:
  dark #f59e0b, light #b45309 (was #e8b34b / #c98a00).

States to screenshot (both themes, 1440/1024/768): pending-no-test (amber orbit ring +
pulsing button), results-pass, results-fail, visual-only, certified-reopened (no
Pending banner, no pulse), dirty vs clean header buttons.

## Addendum — Aug 16 2026, canon press rail applied (supersedes both .tsx again)

Both screens now carry the canonical press rail (from Playground's PressRailCanon):
- Group renamed "Catalog" → **"Product Specs"** (GoodTunes Packages, GoodDeed
  Certificates, Specs, Templates). Breadcrumb follows: "Product Specs · Templates".
- NEW collapsible **Components** group (Vinyl, Jackets, Inner Sleeves, Center Labels,
  Inserts, Stickers, Pricing).
- **White Label promoted to top-level**, above Settings, with the press-facing
  "Request" pill (super-admin surfaces say "Soon" instead).
- Groups are collapsible with a rotating chevron; the group holding the active page
  starts open, others start closed.
- Templates keeps OUR LayoutTemplate icon (Bill prefers it; Otis should adopt it).

Reminder of the standing rails rule: in Otis, the rail is YOUR component — this
addendum describes the canon structure your rail should match, while everything from
the breadcrumb down remains verbatim handoff.
- Controls-row fix (same round): the hairline divider before the 7″/10″/12″ size pills
  now renders only with them (Vinyl format) — on CD/Cassette/Stickers the two dividers
  no longer sit adjacent between "Archived" and "+ Create New".