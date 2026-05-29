# Physical Music Products (PMP)

> **Summary:** Premium handcrafted / custom-effect specialist.
> **Turnaround:** Not stated — request from CSR.
> **Markup model:** Record-line pricing only. Ladders are stored **undiscounted**; a **10% GoodTunes broker discount** (`broker_discount_pct = 10`) applies at lookup, never on disk — same pattern as Hellbender.

PMP publishes far less than MRP. The color library is being updated, numeric specs are not posted, and templates are CSR-assigned per project. Capture what is published; flag the rest as **"not stated — request from CSR."**

## 2026 record-line ladders (loaded into the catalog)

PMP's quotes price the **records separately** from jackets / inserts / booklets, so every per-unit figure below is the **bare record line only** — the jacket/insert/booklet add-ons live in their own code paths and are not bundled into these numbers. All values are **undiscounted** (the 10% broker discount is applied at lookup).

The catalog now carries the full 6-column comparison matrix (100 / 200 / 300 / 500 / 1000 / 2000) for **7" single, 12" LP, and 12" Double LP** across **Black / Color / Splatter** on the Standard Full-Color Jacket. `7_inch` was created for PMP as part of this load.

### Real anchors (confirmed PMP record-line quotes)

Only these four ladders' **500 + 1000** rungs are real PMP numbers (`source: pmp-quote-2026`, `estimated: false`):

| Format    | Tier  | 500     | 1,000   |
| --------- | ----- | ------- | ------- |
| 7" single | Black | $2.50   | $2.00   |
| 7" single | Color | $3.50   | $3.00   |
| 12" LP    | Black | $2.75   | $2.50   |
| 12" LP    | Color | $4.25   | $3.50   |

### Estimated cells (Bill-approved interpolation — every cell logged)

Every non-anchor cell is an **estimate** (`source: pmp-record-interp-2026`, `estimated: true`). They render like any other price so demos show a complete PMP range, but they are not confirmed PMP quotes. Method:

- **100 / 200 / 300 / 2000 on the anchored ladders (7" + 12" single, Black + Color):** borrow a blended single-LP per-unit *curve shape* (MRP + Hellbender single-LP ladders), scaled so the **500 & 1000 rungs land exactly on PMP's real anchors**. Sub-500 rungs use the curve's ratio-to-500 (100 ≈ 2.65×, 200 ≈ 1.78×, 300 ≈ 1.40× the 500 cell); the 2000 rung uses the curve's 2000-vs-1000 ratio (≈ 0.84× the 1000 cell).
- **Splatter (all three formats):** same-format **Color × 1.41**, PMP's own Color→Splatter premium read off the original 2LP quote (≈ 3265/2315 at 500).
- **12" Double (all tiers, every rung):** **≈ 2× the same-qty 12" single record price.** This **re-bases** the prior whole-quote÷qty 2LP rungs (which mixed jacket + add-ons into the per-unit) down to the record line only.

Per-unit cents, `*` = estimated:

| Format     | Tier     | 100   | 200   | 300   | 500   | 1000  | 2000  |
| ---------- | -------- | ----- | ----- | ----- | ----- | ----- | ----- |
| 7" single  | Black    | 663*  | 445*  | 350*  | 250   | 200   | 168*  |
| 7" single  | Color    | 928*  | 623*  | 490*  | 350   | 300   | 252*  |
| 7" single  | Splatter | 1308* | 878*  | 691*  | 494*  | 423*  | 355*  |
| 12" LP     | Black    | 729*  | 490*  | 385*  | 275   | 250   | 210*  |
| 12" LP     | Color    | 1126* | 757*  | 595*  | 425   | 350   | 294*  |
| 12" LP     | Splatter | 1588* | 1067* | 839*  | 599*  | 494*  | 415*  |
| 12" Double | Black    | 1458* | 980*  | 770*  | 550*  | 500*  | 420*  |
| 12" Double | Color    | 2252* | 1514* | 1190* | 850*  | 700*  | 588*  |
| 12" Double | Splatter | 3176* | 2134* | 1678* | 1198* | 988*  | 830*  |

**Standard quantities are 100 / 200 / 300 / 500 / 1000 / 2000 — no 50 and no 750 rung.**

### Prior whole-quote 2LP rungs (re-based away from)

For the record, the earlier (Task #631/#638) 2LP rungs were the whole-quote÷qty values — jacket + add-ons folded into the per-unit — and ran ~40-65% above MRP/Hellbender. They are superseded by the record-only re-base above:

| Tier     | 500     | 1,000   | 2,000   |
| -------- | ------- | ------- | ------- |
| Color    | $11,575 ($23.15/ea) | $16,542 ($16.54/ea) | $27,477 ($13.74/ea) |
| Splatter | $16,325 ($32.65/ea) | $25,142 ($25.14/ea) | $45,477 ($22.74/ea) |

The color-library tiers (Translucent / Opaque) keep their all-placeholder ladders — per-color pricing is out of scope. 7" formats were previously listed as "coming soon" on PMP's site; the record-line load seeds them now so the comparison matrix is complete.

## Contact

- General: info@physicalmusicproducts.com
- Artwork: julie@physicalmusicproducts.com, art@physicalmusicproducts.com
- Phone: +1 (629) 236-2181
- Hours: every day 8am–10pm

## Source pages

- Color: https://www.physicalmusicproducts.com/color
- Detailed FAQ: https://www.physicalmusicproducts.com/detailed-faq
- Audio file drop: https://www.physicalmusicproducts.com/file-drop-audio
- Artwork file drop: https://www.physicalmusicproducts.com/file-drop-artwork

## Formats offered

- **Today:** 12" LP / EP / Single.
- **Coming soon:** 7" big-hole and small-hole, then picture discs.
- **Speeds:** 33 RPM (full-length) and 45 RPM (singles / short cuts). Fidelity scales with shorter program time per side.

## Short-run packages

Not stated — request from CSR.

## Art file requirements

- Must use **only PMP-provided templates** (no outside templates).
- **Mandatory filename convention:** `Catalog#_ArtistName_TemplateType_yyyymmdd`
  - Example: `ABC123_DAVIDBOWIE_CENTERLABEL_20240101`
- Delivery via the **PMP file-drop tool** (artwork drop page).
- Numeric specs (resolution, color space, bleed): **not stated — request from CSR.**

## Audio file requirements

- **24-bit WAV** files, mastered for vinyl.
- **PQ sheet** with side breaks, catalog / matrix number (CSR will assign if you don't have one), engineer contact info, file types, and how many files to expect.
- Sample rate, per-side time limits, file-naming: **not stated — request from CSR.**

## Packaging options

- Default assembly: record into sleeve, top-loaded with jacket opening on the right.
- Printed inner sleeves: assembled A-side toward operator, top-loaded.
- Booklets in **multiples of 4 pages** (4, 8, 12, 16…).
- **16-page booklet** — the only booklet currently offered on GoodTunes as an add-on. Trim **7.125"×7.125"**, **4/4 process** (full colour both sides), **100# gloss text**, saddle-stitched. Selectable on releases that include a 7" vinyl SKU or a cassette SKU (the trim suits a 7" jacket and slips into a cassette J-card sleeve). The artist drag-and-drops a separate print-ready cover on the BookletPill in admin — it is **not** wired off the album jacket.
- Other packaging options (gatefold, tip-on, widespine, inserts, posters, obi, etching): **not stated — request from CSR.**

## Color / vinyl options

- Specialty mixes, splatters, marble, half-and-half, and custom requests welcomed.
- **Full catalog not currently published online.** Color page indicates the library is being updated. The page ships only ~5 combined category JPGs, **not** per-color names/images. Catalog names / codes: **not stated — request from CSR.**
- **Seeded color picker (Task #672).** Because PMP publishes no per-color names or photos, the catalog seeds a best-guess standard palette so the Sell-panel COLOR picker + VinylPreview disc render distinct, name-appropriate swatches instead of grey. Two color-library tiers (12_lp / 12_double): **Translucent** (Clear, Ruby Red, Orange, Gold, Yellow, Green, Blue, Violet, Smoke — light/semi-transparent hexes) and **Opaque** (White, Cream, Red, Orange, Yellow, Green, Blue, Purple, Pink, Brown, Grey, Silver, Gold — solid hexes). Each carries a placeholder ladder only (pricing out of scope). Hexes are best-guess and blank-only backfilled (`backfillColorHexes` matches on tier+name), so an operator who later edits a swatch or imports a real CSR photo is never clobbered. Replace with real catalog names/images when the CSR supplies them.

## Templates

PMP issues templates per project via CSR. **No public template gallery.** When a customer needs a template, the CSR sends the correct one with the assigned catalog number; that template's name flows into the mandatory filename convention above.

## Submission / file drop

- Art: artwork file-drop tool (link above).
- Audio: audio file-drop tool (link above).

## Booklet pricing (16pp, 7.125"×7.125", 4/4, 100# gloss text)

Wholesale ladder seeded in `server/pressCatalog.ts` (`PMP_BOOKLET_LADDER`). The admin **BookletPill** snaps the planned quantity *up* to the nearest rung, so any planned run between rungs prints at the higher rung's per-unit rate.

| Qty   | Run total | Per unit |
|------:|----------:|---------:|
|   500 | $2,036.27 |   $4.07  |
| 1,000 | $2,711.90 |   $2.71  |
| 2,000 | $4,036.06 |   $2.02  |
| 5,000 | $7,965.47 |   $1.59  |

## Turn time

5–7 weeks once audio and artwork are approved and in the pipeline.

## Press throughput

~35–40 seconds per record (just under 2 records / minute).
