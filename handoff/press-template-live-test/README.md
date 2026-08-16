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
