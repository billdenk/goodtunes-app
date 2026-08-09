# CORRECTIONS — 2026-08-09 (first implementation pass REJECTED)

    The applied page violates rule zero: old-page machinery was blended into the new skin.
    Fix every item below. The reference `PressPackagePricingTableRuns.tsx` is exact — match its
    structure, order, and copy character-for-character. When in doubt, the reference wins.

    ## 1. Format switcher — wrong model
    - The switcher is **Vinyl / CD / Cassette. Nothing else.** GoodDeeds is NOT a format — remove that tab. Keep the GoodDeed printing-pricing feature, but move it out of the format row (its own section or page; do not lose the feature).
    - CD and Cassette must be **disabled placeholders**: gray text, no white pill, cursor default, `title="Coming"` on hover. They must NOT open empty catalogs ("Cassette · Cassette", "No pressing types yet"). There is no CD/cassette product yet.
    - Remove the "Cassette | Hide from artists | Remove format" chip row entirely. No format management UI on this page.

    ## 2. Header — extra controls leaked back in
    - The header is ONLY: H1 "Catalog", the segmented switcher, eyebrow VINYL · PACKAGE PRICING, the two-tone heading "Build your vinyl catalog. From scratch.", and the subcopy.
    - Subcopy is exactly: "Quote the way you already do — a single cost per finished package, per run size. Record, jacket, inner sleeve, and labels are all in it. No per-piece math." (Not "Every price covers the finished package…".)
    - **Remove "Add your vinyl" and "CSV Options" from the header.** No buttons float top-right.
    - Save model: nothing visible when saved; when dirty, the floating bottom-center frosted bar "Edited · Save catalog" (see reference `data-testid="save-bar"`).

    ## 3. Layout — sections moved
    - Follow the reference two-column body: sticky disc preview LEFT; right column in this order: "Pick a size. Prices follow the record." (three cards) → "Pick a type." → "Pick a color." → "Name your price." → Turnaround → Print templates → Audio spec.
    - The size control is NOT a tiny "PRODUCT TYPE" segment floating top-right.
    - "One package. Everything included." card items: Pressed vinyl record / Printed jacket / Center labels (+ Inner sleeve on 12"). The current version repeats "Printed jacket included." as a fourth line item — remove it.

    ## 4. Data wiring — dropped, must be restored
    - MRP's real catalog (20+ colors, priced runs) existed before this change. "Black · 0 colors · 0 of 6 runs priced", every run "Not offered", and an empty "Pick a color" are regressions. Re-wire the live types/colors/prices into the new page. Do not reset merchant data.
    - Type tiles read "N colors · M of 6 runs priced" from real data.
    - **This applies to EVERY press, not just MRP**: Memphis Record Pressing, Physical Music Products, Viryl, and Hellbender all keep their existing colors, types, and pricing wired into the new page. Verify each portal.
    - Print template filenames: show the stored filename, middle-truncated ("MRP-12in-jack…template.pdf") — not raw storage keys with query strings ("7-JKTSGNS-101…maif1vr&dl=0").

    ## 5. Copy drift — revert to reference copy exactly
    - Print templates: "Print templates. Artwork specs for artists." + "Attach a file or paste a link. Optional and quiet." (not "What artists design against.")
    - Audio spec: "Audio spec. What the lathe can cut." (not "What your lathe needs.")
    - Turnaround: no "Using press default: 12–14 weeks" caption; the reference has "Weeks from confirmed order to finished records on the truck." only.

    ## 6. Color tiles — old components leaked in
    - Color tiles still use the OLD card: pencil-icon edit button, oversized box, different border/padding. Rebuild them from the reference: swatch ball + name, blue selected outline, reference sizing/spacing, and the reference's edit/reorder affordances. No pencil icon — no old tile markup at all (this is the same rule-zero violation).

    ## 7. Responsive — the record disappears
    - At narrower widths the layout collapses to one column and the disc/jacket preview is REMOVED entirely. Wrong. When the two-column grid can't fit, **stack**: the preview (disc + caption + "One package. Everything included." card) moves ABOVE the working column, scaled down — it never disappears. The record is the product; it stays on screen at every breakpoint.

    ## Acceptance
    Screenshot the rebuilt page at 7" and 12" for MRP with real data and compare against the reference component pixel-flow-for-pixel-flow. Also verify a narrow (~1024px) viewport: preview stacked above, never missing. If any section's structure or copy differs from the reference, it is not done.


    ---

    # SECOND PASS — 2026-08-09 (still not done)

    Structure and copy largely landed. These remain broken:

    ## 8. Jacket/record preview geometry is wrong
    The album cover is slopped over the vinyl. Reproduce the reference `JacketStage` math EXACTLY — do not re-derive it:
    - Square jacket sits IN FRONT on the left; the record is a full circle peeking out FROM BEHIND on the right, vertically centered on the jacket.
    - The disc never rises above or drops below the jacket's edges; no oversized detached drop shadow.
    - The preview keeps reference scale — it is the hero of the left column, not a thumbnail. Caption sits centered under the jacket.
    Copy the reference component's stage/geometry code verbatim, including the size math per product (7"/12").

    ## 9. Price rows leak the editing control
    Rows 500/1,000/2,000 render "Priced · Quote on request · Not offered" as static text side by side. A row shows ONE state at a time:
    - Priced → the $ input.
    - On request → the dashed "On request" chip.
    - Off → the em-dash.
    The three modes are a single dropdown/menu (see reference row markup), never three labels printed in the row.

    ## 10. Black still has 0 colors
    "Black · 0 colors" and an empty "Pick a color" persist while other types show colors. MRP's Black colors exist in the old data — find and re-wire them. If genuinely absent upstream, seed Classic Black at minimum and flag it, but do not ship a default type with an empty color rail.

    ## 11. Template filenames still raw storage keys
    "12-JKTSG-100....7w0umpu&dl=0" is a storage key with query params. Store/display the original filename, middle-truncated.

    ## 12. "Add your vinyl" + "CSV Options" moved to the footer — remove them
    They were removed from the header and re-parked at the bottom right. Remove them from this page entirely. (If CSV import/export must survive, it moves to a separate surface — not this page.)

    ## 13. GoodDeeds section styling
    Its placement at the page bottom is acceptable for now, but it still uses old markup: eye-off toggle icons, its own inline Save button, old table styling. Restyle to canon: hairline rows, canon toggles, and it participates in the page's single floating save bar — no per-section Save buttons.


---

# THIRD PASS — 2026-08-09 (evening) — REJECTED AGAIN. New approach required.

Two implementation passes have now re-derived the layout instead of copying it, and each pass re-introduces drift. Stop re-deriving.

## 14. MANDATE: copy the reference presentational code VERBATIM
Replace the Catalog page's presentational layer wholesale with the JSX/CSS from `handoff/press-catalog/PressPackagePricingTableRuns.tsx`. Your only job is wiring real data (presses, types, colors, run prices, templates) into that markup via props/state. Do not restyle, do not "adapt", do not merge with the old page's markup. If a piece of the old page has no counterpart in the reference, it does not ship on this page.

## 15. Size cards are the wrong width and carry copy that isn't in the reference
Live cards read "7\" Single / Two songs. One single." etc. and stretch wide. The reference cards are compact fixed-width tiles with exactly two lines: big size ("7\"", "12\"", "12\"") over a small gray subline ("Single", "LP", "Double LP"). No taglines, no sentences. Copy the reference card markup exactly (this is a direct consequence of #14).

## 16. Type tiles carry metadata lines that aren't in the reference
Live tiles read "Black / 0 colors · 3 of 6 runs priced" etc. The reference tile is: swatch disc, type name, "N colors" — nothing else. Remove the "· X of 6 runs priced" line. Also the "+ More types · 14" ghost tile + a second "More types" link is duplicated; the reference has ONE "+ More types" link under the grid.

## 17. Vinyl preview: still wrong, and new art direction
Item 8 stands: copy the reference JacketStage geometry verbatim — jacket front-left, disc peeking out to the RIGHT from behind, never past the jacket's top/bottom edges, hero scale. New direction on the disc art itself: use each press's REAL disc/label art (MRP, PMP, Viryl, Hellbender) as the base image, with the SAME gloss/highlight overlay layer from the reference rendered on top of all of them. The highlight is a separate absolutely-positioned layer above the artwork — identical for every press — so real art + canonical sheen.

## 18. Format switcher placement + header typography wrong
Live renders the Vinyl / CD / Cassette pill BESIDE the "Catalog" H1, inline on the same row. The reference places it on its own row UNDER the H1: "Catalog" first, then the segmented pill below it, then the VINYL · PACKAGE PRICING eyebrow and the two-tone heading. Font sizes and colors in this header block have also drifted (H1 weight/size, pill text size, eyebrow letter-spacing, gray tones). Do not eyeball it — copy the reference header block markup and styles verbatim per #14.

## 19. Full-audit deltas (caught in side-by-side review — fix ALL of these)
a) Top bar: reference has a full-width white top bar with the press logo + name on the left and Feedback / bell / avatar on the right. Live moved the press name into the sidebar and lost the top bar structure. Restore the reference top bar.
b) Sidebar search: reference is "Search…" with a ⌘K hint chip. Live reads "Search portal…" with no shortcut chip. Copy the reference.
c) "Pick a type" subtitle: reference is "Each keeps its own package prices." Live invented "How the vinyl is made." Revert — copy strings are not editable.
d) Selected type tile: live renders a "···" overflow menu on the tile. The reference tile has no overflow menu. Remove it.
e) Preview caption: reference caption under the jacket is: globe glyph · size ("12\"") · type ("Black") · color name ("Classic Black"), then "Printed jacket and inner sleeve included." on the second line. Live shows only "12\" LP" + the included line. Copy the reference caption block, and the "One package. Everything included." card belongs where the reference puts it — not stacked in the left column under the preview.

Reminder: per #14 none of these should require individual fixes — replacing the presentational layer verbatim with the reference file resolves a–e automatically. If any of a–e is still visible, the verbatim copy was not actually done.

## 20. Type editor upgraded in the reference — pull the new file
The reference's type "···" popover was rename/delete only; that has been upgraded (reference file updated on this branch, same commit as this note). The type editor is now the canon one from the color-setup page:
- Title "Edit type. {Name}." with subcopy "Sizes here gate the whole type — every color in it."
- TYPE NAME field.
- PRESSED IN THESE SIZES — 7" / 10" / 12" toggle chips; saving requires a name and at least one size. These sizes gate the entire type (all its colors) for artists.
- Footer: Cancel / blue Save pill.
- Bottom hairline-separated full-width row: "Archive type" in red — ARCHIVE, not delete: pressed records keep their history, the type just retires.
Re-copy handoff/press-catalog/PressPackagePricingTableRuns.tsx verbatim to pick this up, and wire the sizes to real type data. Note the split of responsibilities: hex, artwork/thumbnail, and per-color details are edited on the COLOR (color editor / color setup page), never on the type — the type carries only its name and its size gating.

## 21. Reorder is now an explicit mode + catalog color search added — pull the new reference
Reference file updated again on this branch. Two behavior additions:
a) REORDER MODE (types AND colors). Tiles are never draggable at rest — a stray cursor can't shuffle the catalog. A quiet "Reorder" pill sits at the right of the "Pick a type." and "Pick a color." headings. Clicking it enters reorder mode: tiles become draggable (grab cursor), helper copy appears, and the pill becomes Cancel / Done. Done commits the new order (joins the global save bar's dirty state); Cancel restores the exact order from when the mode was entered. Implement for both the type grid and the color rail.
b) CATALOG SEARCH. The "Pick a type." heading row's right side now has: total color count ("N colors"), a round magnifier button, then the Reorder pill. The magnifier opens the frosted "Colors in your catalog" popover (search pill "Find a color…", divided list of mini disc + color name + type name). Picking a result selects that type AND that color. Same popover canon as the color-setup page.
Re-copy handoff/press-catalog/PressPackagePricingTableRuns.tsx verbatim; wire order persistence to real data (artists see this order).

## 22. Search pill: "⌘K" is right-aligned, not part of the placeholder
The sidebar search pill's shortcut hint was sitting next to "Search…" on the left. Correct canon: input placeholder is just "Search…" (input gets pr-10), and a separate absolutely-positioned span pins "⌘K" to the pill's right edge (right-3, centered vertically, color #a1a1a6, 12px, pointer-events none). Reference file updated on this branch — re-copy verbatim.

## 23. Dashboard: "You're all caught up" is a slim row, not a hero card (DASHBOARD, not Catalog)
Live dashboard shows the empty work queue as a large centered card. Wrong hierarchy: good news should take LESS room than problems. Canon: when the queue is empty, render the SAME slim shell as the collapsed "Needs your attention" row — one line: small 24px green-tinted circle (#eaf7f0) with a 14px check (#1c8a5b), "You're all caught up" (13px semibold ink), then subink text "— no offers to accept, approvals due, or orders to ship. New work appears here the moment it needs you." Nothing to expand; no big card. Reference: handoff/press-dashboard/PressDashboard.tsx on this branch (self-contained, MOCK_ data at top) — copy the WorkQueue empty branch verbatim.

## 24. Type tile names never wrap — one line, truncate, hover reveals full name
Long type names ("Splatter — 2 Colors", "Black Splatter — 2 Colors") were wrapping to two lines, making tiles in the same row different heights. Canon: the tile name is always ONE line — truncate with an ellipsis and put the full name in the element's title attribute so hover reveals it. Every tile in a row keeps the same height. Reference file updated on this branch — re-copy verbatim.

## 25. Dark mode: re-copy the dark Catalog reference + adopt the style guide
The dark Catalog implementation has drifted: the Vinyl/CD/Cassette segmented control still uses a LIGHT (white) track on the dark page; the Memphis/press logo on the jacket is not inverted to white and sits on a black circle instead of reading against the artwork; selection highlights are missing; the black jacket dissolves into the page.
Fix: copy handoff/press-catalog/PressPackagePricingTableRunsDark.tsx VERBATIM (character-for-character, only MOCK_ data swapped) — it is the blessed dark reference and already solves all of the above (dark inset segmented track, CSS-inverted white logo, blue selection states, hairline + lift shadow around the black jacket, rim-lit black vinyl).
Also adopt handoff/style-guide/apple-canon.md as the standing style guide for ALL admin pages (light and dark) — see its "Dark controls & surfaces" and "Vinyl artwork on dark surfaces" sections. Known system-wide violations to audit against it: table header rows with wrong gray fills, corner radii that are not fully rounded where the guide says pill/rounded, gray-initial avatar circles for people without photos (use the guide's avatar rules), light-mode leftovers on dark surfaces, inconsistent fonts and spacing.

### Item 25 addendum — specific light-mode leftovers spotted in the current dark build (2026-08-09 screenshots)
These are all symptoms of re-implementing instead of copying the reference verbatim. Every one is already correct in handoff/press-catalog/PressPackagePricingTableRunsDark.tsx:
- Vinyl/CD/Cassette segmented control: WHITE pill track on the dark page (must be the dark inset track).
- Search and Reorder buttons next to "Pick a type.": white pills (must be dark surfaces with white-alpha hairlines).
- The entire "Name your price" run-size table: white card, white rows, white "On request" buttons, light gray disabled input.
- Audio spec rows (bit depth, sample rate, longest side) and the Notes card: white surfaces.
- GoodDeed printing pricing table: white/light-gray table and inputs.
- Print template tiles: white cards with light dashed borders.
- Section spacing collapsed: "Pick a type." is jammed against the size tiles and "Name your price." against the color grid — the reference's vertical rhythm between sections must be preserved exactly.
- Jacket/logo: Memphis logo on the black jacket not inverted to white (jacket art unreadable).
Rule of thumb for acceptance: on the dark Catalog page, NO white or light-gray rectangle may remain anywhere. If a surface is white, it was not copied from the reference.

    ## 26. Jacket placeholder must show the press logo — never the words "PRINTED JACKET"

    Screenshot evidence (Viryl instance, dark Catalog): the jacket preview is a plain black
    square with the literal text "PRINTED JACKET" printed on the cover, and no logo anywhere.

    The blessed reference (`handoff/press-catalog/PressPackagePricingTableRunsDark.tsx`,
    `JacketStage`) never renders text on the artwork. Copy its behavior exactly:

    - Center the **press's own logo** on the black jacket: white (dark logo asset with
    `filter: invert(1)`), `opacity: 0.92`, sized to **42% of the jacket width/height**.
    On a white-label instance this is that press's logo (Viryl here), not GoodTunes'.
    - Remove the "PRINTED JACKET" text from the cover entirely. That phrase belongs only in
    the small caption **below** the stage: "Printed jacket and inner sleeve included."
    (or "Printed jacket included." when there's no inner sleeve).
    - Keep the dark-on-dark separation from the reference: jacket stays truly black
    (`#141416` + the 135° highlight gradient), with the hairline + lift shadow
    `0 0 0 1px rgba(255,255,255,0.12), 0 22px 48px rgba(0,0,0,0.55), inset -1px 0 0 rgba(255,255,255,0.06)`
    and the 7px spine gradient on the left edge.

    Acceptance: on the dark Catalog, the jacket shows the press logo white-on-black, no text
    on the artwork, and the caption below reads exactly as in the reference.

    ## 27. Vinyl disc animation & center label — copy VinylDisc/JacketStage verbatim

    Screenshot evidence (PMP + Viryl instances): the record that peeks out of the jacket has
    none of the reference behavior. Item 26 (jacket logo) applies to ALL press instances —
    PMP shows the same "PRINTED JACKET" text; fix everywhere, not per-instance.

    Copy `VinylDisc` and `JacketStage` from
    `handoff/press-catalog/PressPackagePricingTableRunsDark.tsx` **verbatim**. Specifically:

    1. **Specular highlight**: the disc has a fixed light-source highlight that does NOT
     rotate with the record. In the reference the highlight layer lives OUTSIDE the
     rotating body (only grooves + label sit inside the `bodyRef` wrapper that rotates).
     The current build has no highlight at all.

    2. **Hover motion**: on hover the disc SLIDES right (`translateX`, 0.55s
     `cubic-bezier(0.32, 0.72, 0.28, 1)`) while the disc body ROTATES 32°. It must not
     jump vertically. Double LP: second disc slides further on a 0.1s delay and rotates
     18° over 0.75s. On pointer-leave both transforms return to zero — the label
     straightens itself automatically. No rewind control is needed or wanted.

    3. **Center label**: black label carrying the press's logo in white
     (`filter: invert(1) brightness(1.7)` on the dark logo asset), sized from the
     product's label ratio. The label rotates with the disc body. Each white-label
     instance shows its own press logo (Viryl, PMP, MRP, Hellbender).

    Acceptance: hovering the jacket on any press instance slides the record out with a 32°
    spin, the highlight stays fixed while grooves/label turn, the center label shows that
    press's logo, and everything glides back straight on mouse-out.

    ### 27a. Shine asset + slide distance (addendum)

    - The specular shine is driven by a mask PNG, now provided at
    `handoff/press-catalog/assets/vinyl-highlights.png` (1097×1098 RGBA). Overlay: a white
    fill (`opacity: 0.6`, no blend mode) masked by this PNG, positioned over the whole disc,
    OUTSIDE the rotating body so the light stays fixed while grooves/label rotate.
    - Hover slide distance: keep the reference values — main disc `translateX(jacketPx * 0.24)`,
    Double LP second disc `translateX(jacketPx * 0.3)` on its 0.1s delay. Do NOT slide
    further; the label peeking partially is intentional.

    ## Item 28 — Hover spin is now continuous, with a rewind control (supersedes the spin part of Item 27)

    Item 27 said "slide-out + 32° spin on hover … no rewind control needed". That is superseded. The new behavior, already live in the reference files:

    - On hover, the record still slides out of the jacket at the reference distances (0.24 / 0.3 of the jacket width — unchanged), and the disc body now spins **continuously** at 360° per 8 seconds, driven by requestAnimationFrame. Not a one-shot turn.
    - On mouse-out, the slide glides back but the disc **freezes at its current angle**. If it has accumulated meaningful rotation, a small circular rewind button (RotateCcw icon, frosted dark pill) fades in at the bottom-right of the jacket stage.
    - Clicking rewind eases the disc back to its start angle along the shortest path, then the button fades out.
    - Honors prefers-reduced-motion: no spin, no rewind button.
    - Copy `useVinylSpin`, `RewindButton`, and the updated `JacketStage` verbatim from the re-exported reference files in handoff/press-catalog/ (dark and light). Do not re-derive the physics.
    - Applies to EVERY press instance (MRP, PMP, Viryl, Hellbender).

## Item 28 — Aug 9 pass: spin/rewind final, weight books, template dialog, hide controls, copy set (supersedes Item 27's "no rewind button")

Pull the latest `handoff/press-catalog/PressPackagePricingTableRunsDark.tsx` (and the light file) — they are the canonical reference. Item 27 said "no rewind button"; that is now superseded. Apply to EVERY press instance (MRP, PMP, Viryl, Hellbender):

- **Rewind button (new canon):** after hover-spin leaves the disc rotated, a small frosted rewind control appears centered below the record (aligned with the caption center, `left: calc(50% - jacket*0.25)`, `translateX(-50%)`, bottom −14). Clicking it slides the record out (~1.2 s "peek") while it turns back to 0°, then tucks it back in. Pointer handlers live on an inner wrapper around jacket/discs/shadow only — the rewind button must NOT trigger spin/slide.
- **140 g / 180 g price books:** segmented capsule chip ("140 g | 180 g") sits top-left above the price list, opposite "+ Add run size". Two independent price books share the same run sizes (adding a run size adds it to both weights); the caption reads "Prices are per unit, per finished package · {weight} g vinyl."
- **Print-prep template dialog:** clicking any tile (empty or filled) — or ⋯ → "Add file…"/"Replace…" — opens a centered modal styled like the album "Completed Art" dialog: title "{Template}: {size}" (live with selected size), CURRENT FILE panel left (with Remove file), UPLOAD FILE drag zone + "OR PASTE A URL" field with capsule "Use URL" button right. The old hover "Replace" swap on filled tiles is REMOVED (it was jarring).
- **Hide controls:** every size card and every template tile has a hover ⋯ menu. Sizes: "Don't offer this size" grays the card ("Not offered"), reversible. Templates: "Hide for now" removes the tile; hidden ones list under the grid as "Hidden: … · Show". Booklet starts hidden by default for all presses; any template can be hidden (e.g. Viryl also hides Inner sleeve — plain sleeves only).
- **Copy set (final, Bill-approved):** page headline "Build your GoodTunes® packages. For the record." with the ® rendered small/superscript/light (PageHeading splits on ®). Sections: "Pick a size. Start your build." / "Pick a type. Grow your offering." / "Build colors. The world needs more color." / "Set your price. They'll show you the money." / "Turnaround time. From order, to out the door." (note the comma) / "Print prep. The template for your templates." / "Set your audio specs. Help them turn it up to 11." Audio subtitle is one line: "Blank fields inherit the press default — the gray numbers."
- **Turnaround layout:** the week inputs now stack BELOW the heading (not beside it).
- **"Make it yours" branding dialog:** ⋯ button (28 px frosted circle, fades in on jacket hover) opens a centered modal over a dimmed blurred scrim: brand color (swatch chip IS the picker, always matches the hex field), current-logo preview beside an SVG-only drag-and-drop replace zone ("SVG only — we recolor it for any surface"), "Reset to default". Color + logo flow to the cover and center label live.

Copy the reference components verbatim — do not restyle. Diff the rendered page against the reference at 1440px as with prior items.


## Acceptance for this pass
    FULL-PAGE diff, not above-the-fold. Render the reference component (handoff/press-catalog/PressPackagePricingTableRuns.tsx) and the live page at 1440px, scroll both to the bottom, and compare EVERY section top to bottom: top bar, sidebar, header block, size cards, type tiles, color rail, jacket/vinyl preview + caption, package card, price rows, print-template tiles (filled + empty states, die-line icons), floating save bar, GoodDeeds section, and the page footer (which must be empty of parked buttons). Diff the rendered page against the reference side by side at 1440px. Any card width, copy string, or preview geometry that differs from the reference is a failure. Do not report complete until a screenshot of the live page is visually indistinguishable from the reference (data values aside).
