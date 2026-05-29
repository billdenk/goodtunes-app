# Memphis Record Pressing (MRP)

> **Summary:** Large-scale established pressing operation based in Memphis, TN.
> **Turnaround:** 8–10 weeks (standard runs; short-run program quotes 4–6 weeks separately).

Mid-South pressing plant with a published short-run program, a full online color catalog, and the most thorough public art/audio prep checklists of the three vendors we currently track.

The press catalog matrix (1LP / 2LP / 7" × Color / Splatter / Black, columns 100 / 200 / 300 / 500 / 1000 / 2000) carries MRP's confirmed 500 / 1000 / 2000 rungs from #625 plus the confirmed **12" LP × Single Jacket × Black 100/200/300 short-run rungs** ($1,350 / $1,750 / $2,085, retail = cost). Every other 100 / 200 / 300 rung — and the full ladder under the new EcoMix / Translucent / Opaque / Neon-Glow / Smoke Blends / Cream Blends tiers — seeds as unconfirmed yellow placeholders until MRP quotes them.

## Contact

- Email: help@memphisvinyl.com
- Phone: (901) 821-9099
- Pressing / customer service: 3015 Brother Blvd, Bartlett, TN 38133
- Packaging / shipping: 7625 Appling Center Dr #103, Memphis, TN 38133

## Source pages

- Short-run program: https://memphisrecordpressing.com/short-run-vinyl-record-pressing
- Color options: https://memphisrecordpressing.com/vinyl-color-options/
- Art file prep: https://memphisrecordpressing.com/art-file-prep/
- Audio file prep: https://memphisrecordpressing.com/audio-file-prep/
- Forms & templates: https://memphisrecordpressing.com/forms-and-templates/
- Advanced art prep PDF: https://cdn.prod.website-files.com/65ce69671190e385bf638294/6758b951d7a9e1c507024c2c_MRP-Advanced_Art_File_Prep_Guide.pdf

## Short-run packages

As quoted to Bill, May 2026. 140g vinyl in Black or EcoMix; full-color center labels; generic white poly-lined inner sleeves; full-color **single** jackets; shrinkwrap. **No test pressings** (DMM cut, MRP QC). Turn time **4–6 weeks** after art and audio are approved.

| Quantity | Total   | Per unit |
| -------- | ------- | -------- |
| 100      | $1,350  | $13.50   |
| 200      | $1,750  | $8.75    |
| 300      | $2,085  | $6.95    |

- Production tolerance: **±10%** on quantity for runs ≤1000 (tolerance decreases above 1000).
- UPC barcode: **$35** add-on.

## 2026 quoted ladders (loaded into the catalog)

MRP's CEO confirmed: **the quoted TOTAL is retail pricing — what we show and charge the artist. GoodTunes does not add markup, and MRP does not give a broker discount. Margin from MRP = 0.** All rungs below carry `retailCents = costCents = MRP's quoted TOTAL`. Quote valid through **6/26/26**.

Tier rules:

- **Black** rungs are TBD — left as yellow placeholders in the catalog until MRP confirms the numbers.
- **Color** = solid colored vinyl (full-color jacket + full-color labels, shrinkwrap; 2LP includes gatefold).
- **Splatter** = translucent base with up to 3 splatter colors.

MRP's PDF estimate quotes five quantities — **300 / 500 / 1,000 / 2,000 / 3,000**. All five are seeded confirmed; the 300 + 3000 rungs persist on the combo even though the default comparison matrix only renders 100–2,000. Totals below are the full vendor invoice; per-unit is total ÷ qty.

### 1LP (`12_lp`)

| Qty   | Color total | Color per-unit | Splatter total | Splatter per-unit |
| ----: | ----------: | -------------: | -------------: | ----------------: |
|   300 |     $3,337  |        $11.12  |        $3,664  |           $12.21  |
|   500 |     $3,875  |         $7.75  |        $4,250  |            $8.50  |
| 1,000 |     $5,430  |         $5.43  |        $6,075  |            $6.08  |
| 2,000 |     $9,150  |         $4.58  |       $10,195  |            $5.10  |
| 3,000 |    $13,010  |         $4.34  |       $14,455  |            $4.82  |

### 2LP (`12_double`, gatefold)

| Qty   | Color total | Color per-unit | Splatter total | Splatter per-unit |
| ----: | ----------: | -------------: | -------------: | ----------------: |
|   300 |     $7,172  |        $23.91  |        $7,826  |           $26.09  |
|   500 |     $8,215  |        $16.43  |        $8,965  |           $17.93  |
| 1,000 |    $11,380  |        $11.38  |       $12,670  |           $12.67  |
| 2,000 |    $18,280  |         $9.14  |       $20,370  |           $10.19  |
| 3,000 |    $25,780  |         $8.59  |       $28,670  |            $9.56  |

### 7" (`7_inch`, solid color vinyl, full-color jacket + labels)

| Qty   | Color total | Color per-unit |
| ----: | ----------: | -------------: |
|   300 |     $2,259  |         $7.53  |
|   500 |     $2,840  |         $5.68  |
| 1,000 |     $4,310  |         $4.31  |
| 2,000 |     $7,700  |         $3.85  |
| 3,000 |    $10,950  |         $3.65  |

7" Black and Splatter tiers are loaded but unconfirmed (yellow placeholders).

### Color swatches & photos

The full published color library (EcoMix / Translucent / Opaque / Neon-Glow / Smoke Blends / Cream Blends, ~76 named colors) seeds with a best-guess solid hex per color so the Sell-panel COLOR picker chip + right-side VinylPreview disc render distinct, name-appropriate swatches out of the box (Translucent / Smoke / Clear / Glow read light/semi-transparent; Opaque reads solid). Hexes are blank-only backfilled — `backfillColorHexes` matches existing rows on tier+name and only fills rows where both `swatchHex` and `swatchImageUrl` are NULL — so real `swatchImageUrl` photos always win and any operator-edited swatch is never clobbered.

Real product photos are backfilled by `scripts/backfill-press-photos.ts`: it scrapes MRP's published [all-vinyl-colors](https://memphisrecordpressing.com/all-vinyl-colors/) page (via the shared parser in `server/vendorColorScrape.ts`), masks each tile to the brand vinyl-disc shape, uploads to Object Storage, and stamps `swatchImageUrl` + `importSourceUrl` on every matching color across all three vinyl formats. **Matching is by MRP color code, not name** — GoodTunes seeds each color as `"<CODE> <short name>"` (e.g. `T01 Ruby`, `O01 Brown`, `ECO2 Greens`) while the page tiles carry family-prefixed names (`Translucent Ruby`, `Opaque Brown`), so only the embedded code (`T01`, `O01`) reliably joins the two. It only touches rows where both `swatchImageUrl` and `importSourceUrl` are NULL, so it's idempotent and never clobbers a one-click import or operator edit. ~168 of 228 rows (56 of 76 named colors) get real photos; the rest — EcoMix recycled blends (random by design), the codeless `CB` cream blends, and a few neon/smoke codes MRP doesn't publish per-color — keep their name-appropriate hex tint. Run with `--dry` to preview matches; pass `DATABASE_URL=$PROD_DATABASE_URL` to backfill prod (the Object Storage bucket is shared dev/prod, but `press_colors` rows are per-env). When a color carries a real photo the VinylPreview disc shows it; otherwise it tints to the seeded hex; grey only ever appears for a genuinely unknown color.

## 7" booklet add-on

Standalone add-on — **not** auto-bundled into 7" vinyl. Spec: 16pp, CMYK 4/4, 150gsm art paper, open-top poly bag + assembly.

| Quantity | Total      | Per unit |
| -------: | ---------: | -------: |
|      500 |  $1,121.43 |    $2.24 |
|     1000 |  $1,441.43 |    $1.44 |
|     2000 |  $2,654.29 |    $1.33 |

Retail = cost on every rung. Per-unit cents = total ÷ qty rounded to the nearest cent. PMP's booklet ladder is unaffected — albums routed to PMP still use PMP's pricing.

## Art file requirements

- **Resolution:** 300 PPI.
- **Color:** CMYK or PMS only — **no RGB**.
- **Bleed:** 1/8" on all sides (a 12×12 jacket exports as 12.25×12.25).
- Hide all template / dieline layers on export.
- Fonts outlined or packaged.
- High-res PDF preferred.
- **Delivery:** Dropbox / WeTransfer / Hightail / FTP. **Not email.**

## Audio file requirements

- **Format:** high-res WAV.
- **One file per side** (preserves gapless flow; required for live recordings).
- **Per-side max length:**

  | Format | 33⅓ RPM   | 45 RPM    |
  | ------ | --------- | --------- |
  | 12"    | 15–22 min | 12–16 min |
  | 10"    | 12–15 min | 9–12 min  |
  | 7"     | 6–8 min   | 4–6 min   |

- Sequence loud / dynamic tracks **first** on each side (inner-groove distortion).
- Detailed tracklist required: per-track times, side breaks, total runtime per side.
- Tracklist must match master, labels, and artwork **exactly**.

## Packaging options

Included in the short-run package: full-color center labels, generic white poly-lined inner sleeves, full-color single jackets, shrinkwrap. Other packaging (widespine, gatefold, tip-on, printed inners, inserts, booklets, posters, obi, picture-disc labels, etching/silkscreen) is available via the templates listed below — pricing not stated for short-run.

## Color / vinyl options

Full catalog on the color page. Palette names below; codes are MRP's. EcoMix is recycled PVC, carbon neutral, priced as standard translucent, exact match not guaranteed.

- **EcoMix:** ECO1 Blues, ECO2 Greens, ECO3 Magentas, ECO4 Yellows, ECO5 Reds, ECO6 Grays, ECO7 Metallic
- **Translucent (T01–T15):** Ruby, Ultra Clear, Cobalt, Emerald, Grape, Light Blue, Lemonade, Orange Crush, Coke Bottle Clear, Highlighter Yellow, Milky Clear, Forest Green, Sea Blue, Tan, Black Ice
- **Opaque (O01–O24):** Brown, White, Apple Red, Orchid, Sky Blue, Baby Blue, Tangerine, Baby Pink, Canary Yellow, Magenta, Silver, Spring Green, Gray, Bone, Hot Pink, Gold, Fruit Punch, Olive Green, Aqua, Custard, Lemon, Bluejay, Evergreen, Violet
- **Neon / Glow:** G01 Glow Green, N01 Neon Violet, N02 Neon Green, N03 Neon Yellow, N04 Neon Orange, N05 Neon Coral, N06 Neon Pink
- **Smoke Blends (SB01–SB15):** Clear, Red, Green, Purple, Silver, Electric, Blue, Yellow, Orange, Coke Bottle Clear, Highlighter, Sea Blue, Tan (also splatter / marble / picture disc available as special effects — not in the short-run package)
- **Cream Blends (CB):** Cocoa, Blueberry, Sea Salt, Fig, Mushroom, Honey Dew Melon, Earl Gray, Watermelon, Caramel, Guava

## Templates

All on the forms-and-templates page. Finished sizes inferred from the template name where MRP states it.

- **12":** Center Label, Single Jacket, Widespine Jacket (2×LP), Gatefold Jacket, Tri-Fold Gatefold, Old-Style Tip-On Single, Old-Style Tip-On Gatefold, Paper Inner Sleeve, Board-Weight Euro Inner Sleeve, Insert 12×12 (2pp), Gatefold Insert 24×12 folds to 12×12 (4pp), Booklet 12×12 8pp saddle-stitched, Poster 11×17 / 18×24 / 24×36, Obi spine-wrap (50mm single, 59mm widespine, 60mm gatefold), Picture Disc Labels, Etching / Silkscreen
- **11":** Insert 11×11 (2pp), Gatefold Insert 22×11 folds to 11×11 (4pp)
- **10":** Center Label, Single Jacket, Widespine Jacket, Gatefold Jacket, Inner Sleeve (paper or board), Insert 10×10 (2pp), Gatefold Insert 20×10 folds to 10×10 (4pp), Picture Disc Labels, Etching / Silkscreen
- **7":** Center Label, Single Jacket (no spine), Single Jacket with 3mm spine, Gatefold Jacket, Inner Sleeve (paper or board), Flexi Disc Label, Picture Disc Labels, Etching / Silkscreen
- **Stickers (promo + UPC):**
  - Squares: 1×1, 1.5×1.5, 2×2, 2.5×2.5, 3×3, 3.5×3.5, 4×4
  - Circles: 1, 1.5, 2, 2.5, 3, 3.5, 4 inch
  - Rectangles: 1.5×1, 2×1, 2×3, 2×4, 2.5×1
  - UPC: 1.75×0.75
- **Advanced submission resources:** MRP InDesign Preflight Profile, MRP Adobe PDF Profile (2024).

## Submission / file drop

- Art: Dropbox / WeTransfer / Hightail / FTP. **Not email.**
- Audio: not stated separately on the audio prep page.

## Turn time

4–6 weeks after art and audio are approved.
