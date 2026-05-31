---
name: Letter print-cert fixed signature slot
description: Why the GoodDeed Letter print-cert signature collides with the footnote on long names/titles
---

The GoodDeed print-cert mockup engine (`_CertPrint.tsx`) renders the **Letter** layout with everything absolutely positioned. The signature sits in a FIXED vertical slot computed off a single-line headline: `sigYRel = headlineYRel + headLineH * 1.0`.

**The trap:** the headline (`This GoodDeed® certifies that <recipient> owns no. <n> of <title>.`) wraps to 2+ lines when the recipient name or album title is long. The signature slot does NOT measure the wrapped headline height, so the 2nd headline line + signature crash down into the bottom-anchored provenance footnote. Short sample data hides this; it only shows up under long content.

**Why:** the slot intentionally mirrors the shipped PDFKit server template's fixed signature Y. The Letter navy band is only ~144pt tall, so there is no slack to absorb an extra headline line.

**How to apply:** any time you adjust Letter signature/footnote placement, stress-test with a long recipient AND long title (see `LetterBorderThinLong.tsx`). A real fix means measuring the wrapped headline height and flowing the signature below it (or constraining the headline to one line) — not just nudging the multiplier. A4 is unaffected: it uses a flowing centered stack, never `sigYRel`.

**Per-tile sample override:** `CertPrint`/`CertStage` accept an optional `sample?: Partial<CertSample>` merged over the default `SAMPLE` as `S`; pass it from a tile to render alternate artist/title/recipient/num without touching the shared default.
