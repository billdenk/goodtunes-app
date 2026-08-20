# Otis Brief: MRP Pricing Tool SOW — Gap Audit (READ-ONLY, NO BUILD)

**Date:** August 20, 2026
**Workstream:** MRP partnership — pre-Memphis audit
**Session rule:** This is its own workstream session. Any prior session stands down.

---

## The one rule for this session

**Do not change anything. Do not build anything. Do not refactor, rename, or "fix while you're in there." No branches, no commits, no schema touches.**

This is a read-only audit. Your only output is a written gap report (format at the bottom). If you find something broken along the way, note it in the report; do not fix it.

## Why we're doing this

MRP sent us a Scope of Work document (Rev 1.0, August 16, 2026) for a "Website Customer Pricing Tool." It describes what they think they need. We believe what we've already built — the component system, the builder, dynamic estimation, press self-service catalog editing, the template builder, and instant review — goes well beyond what this document imagines.

Before the Memphis meetings (Aug 24–25), Bill wants to know exactly how far their ask is from what exists. For every requirement below, classify it as one of:

- **BUILT** — exists and works as described (or better). Name the screen/module where it lives.
- **BUILT DIFFERENTLY** — we solve the same problem another way. Describe our approach in one or two sentences so Bill can decide whether our way covers their intent.
- **PARTIAL** — some of it exists. Say what's there and what's missing.
- **NOT BUILT** — doesn't exist. Do not start building it. Bill decides build vs. discuss-with-MRP for every gap.

## Standing principle: catalog contents are press-editable, not gaps

Wherever MRP's document specifies exact vinyl colors, effects, sleeve stocks, jacket types, or similar catalog choices: our system lets each press fully edit its own catalog (types, colors, sizes, tiers, pricing). Specific option lists in their SOW are **configuration, not features**. Classify these as BUILT (press-configurable) as long as the mechanism exists, and note any option *category* our mechanism can't represent (that would be a real gap). We will load their catalog as a courtesy where we can, but maintaining it is on them, same as every press.

---

## Requirement inventory from MRP SOW Rev 1.0 (Aug 16, 2026)

Audit each item against the current build.

### A. Entry and order-type routing
1. Landing page choice between **Short Run** and **Standard Order**, two summary panels with a select button each.
2. Short Run mode constrains the form: only flagged options shown (their doc renders these "in blue").

### B. Short Run constraint set (as configuration)
3. Short Run locks: 12" only; 140g only; vinyl color Black or Eco Mix only; center labels CMYK/Full Color only; inner sleeve Paper w/ Poly Lining only; jacket Single Pocket CMYK only; outerwrap Shrink-Wrap only; download card hosting mandatory.
4. Short Run applies an **assembly touch fee per insert** and **per download card**.
5. Quantity: minimum 100, maximum 5000, increments of 100, round up to nearest 100, +/- steppers. (Their own doc contradicts itself: field min is 100 but subheading says "Min: 300." Note which our system supports; the contradiction is theirs to resolve.)

### C. Configuration form
6. Single consolidated scrollable form (not step-wizard), any field order, with prerequisite gating (e.g., format before weight).
7. Project Type: Single LP / Double LP.
8. Vinyl Format 7"/10"/12" with weight dependent on format (7"→49g forced, 10"→110g forced, 12"→140g/180g choice).
9. Metalwork - Cutting: MRP-Supplied DMM / MRP-Supplied Lacquers / Customer-Supplied Lacquers.
10. Test Pressing static display ("5 Test Pressings, Shipped to you").
11. Vinyl Color/Effect as a **selectable image grid**, options dependent on format. Their current lists include Picture Disc and fold Eco Mix into the main grid. (Catalog contents = press-editable; audit the *mechanism*: image grid, format-dependent availability, mutually exclusive families.)
12. Splatter add-on dependent on base color selection, with some colors forcing "None." (Note: their splatter logic still references colors they deleted elsewhere in the doc — Ghostly, Cornetto, Quad, Galaxy Translucent/Opaque, 3-Color A-Side B-Side. Their drafting error; audit our mechanism for conditional add-ons.)
13. Center Labels: Blank / Black Flood / Black & White / CMYK.
14. Inner Sleeves: format-dependent lists including Black Paper, ECO Paper w/ Poly Lining, Rice Paper, Printed Euro Board 1/0 and 4/0.
15. Jackets: dependent on Project Type AND Format; includes Unprinted White/Black, Single Pocket, Wide Spine, Gatefold, Trifold, in B/W and CMYK; 7" Double LP handled (Gatefold/Trifold only).
16. Printed Insert: single and gatefold, one/two-sided, B/W and color; **checkbox upgrade to 100# (12pt) Gloss/Uncoated Board** on single inserts.
17. Booklets: 10"/12" only; 8-page and 12-page full color.
18. Download Cards: None / MRP Generic / Custom B/W / Custom CMYK.
19. Card Hosting: None / MRP Download Card Hosting.
20. Other Print Options (multi-select): Matte AQ / Gloss UV on sleeve or jacket (format-sized), Barcode Generation.
21. Stickers: **up to 2 stickers per order**, each with Generic/Custom choice; if Custom, Color → Stock (stock list depends on color) → Shape. "Other sticker options available upon request" note.
22. UPC Sticker: None / 1.75"×0.75" / 2.25"×1.75".
23. Outerwrap: format-dependent, including Resealable Polybag, Deluxe PVC Sleeve (with Flap), Deluxe PVC Gatefold (No Flap).
24. Assembly summary: auto-generated bulleted list driven by other selections (record into jacket always; insert/download card/sticker/polybag lines conditionally).

### D. Pricing behavior
25. Continuous pricing: TOTAL PRICE and UNIT PRICE ($X.XX/copy) visible from $0.00, updating live with every selection and quantity change.
26. Final breakdown: quantity, unit price, total.
27. **Next price break display**: same configuration priced at the nearest quantity that reaches the next break, shown alongside.
28. Pricing data sourced from MRP's ERP (CODA) via API, with spreadsheet fallback for reference. (Audit: what does our pricing ingestion support today — API import, spreadsheet import, manual entry? Which lanes exist?)

### E. Quote request and transmittal
29. Request for Quote form: Company Name, Your Name, Email, Phone, Artist Name, Title Name, Catalog Number; only bold fields required.
30. On submit: email to their customer service address AND to the submitter; success notification.
31. PDF summary of the configuration sent to the submitter.
32. **All submissions accessible in a backend platform with a unique indexing ID per submission.** (This is them asking for what our platform already is. Confirm what our submission/lead records capture and expose.)

### F. Visual mock-up
33. Live mock-up while configuring: vinyl record + center label + front jacket; defaults to blank yellow jacket, black record, generic center label.
34. Some colors show a fixed example photo; color-family options (translucents, opaques, neons, blends) get an auxiliary variant dropdown whose choice updates the mock-up.
35. Center label artwork upload (PNG/JPG), auto-scaled, circle-cropped, best-fit if non-square, superimposed on record.
36. Front jacket artwork upload (PNG/JPG), auto-scaled, best-fit if non-square, applied to jacket.
37. Mock-up image included in the quote emails and PDF.
(Where our template builder / instant review covers or exceeds this, classify BUILT DIFFERENTLY and describe how.)

### G. Deployment and testing
38. Embedded in their existing Wordpress site; desktop and mobile.
39. Test instance available to MRP staff during development; email tests to alternate addresses; UAT on a test copy of their site before their webmaster deploys live. (Audit: what is our embed/white-label story per press — per-press URL, embed snippet, both?)

---

## Beyond-spec inventory (second half of the report)

After the item-by-item audit, list what we have that their SOW never asks for. At minimum, cover honestly and specifically:

- Component system and component quote builder
- Dynamic estimation (price snapshots, "pricing changed, refresh" behavior)
- Press self-service catalog editing (tiers, colors, types, pricing modes)
- Self-service customer flow beyond request-a-quote (accounts, saved estimates, conversion path)
- Template builder and instant review
- Anything else material

One or two lines each on what it does and where it lives. Bill will use this for the Memphis conversation, so plain language, no marketing.

## Report format

Return a single document:

1. **Summary counts**: how many of the 39 items are BUILT / BUILT DIFFERENTLY / PARTIAL / NOT BUILT.
2. **Item-by-item table**: item number, classification, one-line evidence (screen or module name), one-line note if PARTIAL or NOT BUILT.
3. **True gaps list**: only PARTIAL and NOT BUILT items, each with a rough size estimate (small / medium / large) so Bill can decide build vs. discuss. **Do not start any of them.**
4. **Beyond-spec inventory** as above.
5. **Anything broken you noticed** while auditing (report only).

Reminder one more time: no code changes in this session. Audit and report only.
