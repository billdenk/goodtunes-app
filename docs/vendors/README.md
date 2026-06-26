# Pressing-vendor reference docs

Source-of-truth specs for each known vinyl pressing plant. Later tasks (upload validation, print-PDF generation, vendor comparison UI) read from these docs, so keep them faithful to what the vendor actually publishes. Anything the vendor doesn't publish is called out as **"not stated"** — do not invent numbers.

When a vendor updates their public specs (color catalog, templates, turn times, pricing tiers, art/audio requirements), re-verify against the linked source pages and update the doc.

## Plants

- [Memphis Record Pressing (MRP)](./mrp.md)
- [Physical Music Products (PMP)](./pmp.md)
- [Hellbender Vinyl](./hellbender.md)
- [Viryl Technologies](./viryl.md)

## Platform upload requirements (highest spec across all plants)

When an artist, label, or GoodTunes admin uploads art and audio, we **require the strictest spec across every plant we work with**, not the spec of the plant they happen to have selected today. This way the same upload can be re-pressed at a different plant later without re-collecting files.

In the upload UI, show the strict requirement as the rule, with an info ("i") tooltip that explains why and lists each plant's actual minimum. Example tooltip copy:

> Hellbender requires 72 dpi rejected and accepts 150 dpi; MRP requires 300 PPI. We ask for 300 PPI so you can re-press at any plant later without re-uploading.

### Audio — required for upload

- **Format:** 24-bit WAV. (PMP requires 24-bit WAV; MRP says "high-res WAV"; Hellbender not stated.)
- **One file per side**, named by side. (MRP rule; preserves gapless flow and is required for live recordings. PMP / Hellbender not stated — meeting it satisfies both.)
- **Per-side max length** by format / speed (MRP's published table; PMP / Hellbender not stated):

  | Format | 33⅓ RPM   | 45 RPM    |
  | ------ | --------- | --------- |
  | 12"    | 15–22 min | 12–16 min |
  | 10"    | 12–15 min | 9–12 min  |
  | 7"     | 6–8 min   | 4–6 min   |

- **PQ sheet** alongside the audio: side breaks, catalog / matrix number, engineer contact, file types, expected file count. (PMP rule.)
- **Tracklist** must match master, labels, and artwork exactly: per-track times, side breaks, total runtime per side. (MRP rule.)
- **Sequence loud / dynamic tracks first on each side** (inner-groove distortion). (MRP guidance — surface as a warning, not a hard block.)

### Art — required for upload

- **Resolution:** 300 PPI minimum. (MRP rule; Hellbender rejects 72 dpi but does not publish a numeric minimum; PMP not stated.)
- **Color space:** CMYK or PMS only — **no RGB.** (MRP rule.)
- **Bleed:** 1/8" on all sides (a 12×12 jacket exports as 12.25×12.25). (MRP rule.)
- **Fonts:** outlined or packaged. (MRP rule; Hellbender requires embedded / outlined fonts in PDFs and EPSs.)
- **Template:** must match the destination plant's own template (PMP and Hellbender both refuse outside templates; MRP publishes its own). Hide all template / dieline layers on export — never flatten or embed dielines (Hellbender rule). At upload time, accept the per-plant template the artist chose and surface that choice in the file metadata.
- **Filename convention** (PMP-strict, safe everywhere): `Catalog#_ArtistName_TemplateType_yyyymmdd`. Example: `ABC123_DAVIDBOWIE_CENTERLABEL_20240101`.
- **Accepted file formats:** high-res PDF (preferred), PSD, EPS, TIFF, or packaged InDesign — fonts embedded / outlined, images embedded. Reject Word, PowerPoint, PhotoDeluxe, and any web-sourced 72-dpi image. (Hellbender rule; PDF preference is MRP's.)
- **Delivery channel** is not a file-content rule, but never email art. (MRP rule.)
