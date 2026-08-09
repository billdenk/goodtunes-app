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
    