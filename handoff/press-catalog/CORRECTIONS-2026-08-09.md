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

## Acceptance for this pass
    FULL-PAGE diff, not above-the-fold. Render the reference component (handoff/press-catalog/PressPackagePricingTableRuns.tsx) and the live page at 1440px, scroll both to the bottom, and compare EVERY section top to bottom: top bar, sidebar, header block, size cards, type tiles, color rail, jacket/vinyl preview + caption, package card, price rows, print-template tiles (filled + empty states, die-line icons), floating save bar, GoodDeeds section, and the page footer (which must be empty of parked buttons). Diff the rendered page against the reference side by side at 1440px. Any card width, copy string, or preview geometry that differs from the reference is a failure. Do not report complete until a screenshot of the live page is visually indistinguishable from the reference (data values aside).
