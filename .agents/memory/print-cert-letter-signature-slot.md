---
name: Letter print-cert band flows as one flex column
description: How the GoodDeed Letter print-cert headline/signature/footnote share the navy band without colliding on long names/titles
---

The GoodDeed print-cert mockup engine (`_CertPrint.tsx`) renders the **Letter** band as ONE absolute flex column (top = `headlineYRel`, height = `safeBottomRel - headlineYRel`, `flexDirection: column`). Children in order: headline div, signature div (`marginTop: px(sigGap)`), footnote div (`marginTop: "auto"`). The signature therefore *flows* directly under a 1- or 2-line headline, and the footnote bottom-anchors when there's room but flows up (never overlaps) when the headline wraps.

**Why this replaced the old fixed slot:** the previous Letter layout absolutely positioned the signature at a slot computed off a *single-line* headline (`sigYRel = headlineYRel + headLineH`). Long recipient names or album titles wrap the headline to 2 lines, the fixed slot never measured that, and the 2nd headline line + signature crashed into the bottom-anchored footnote. The flex column fixes it structurally — no height measurement needed.

**Footnote breaks AFTER the second "GoodDeed®" (Letter only).** The provenance copy says "this GoodDeed®" twice and the QR caption is also "GoodDeed®". A4 renders the copy as one naturally-wrapping string (`provenance`) — its provenance never sits beside the QR caption, so no manual break. The Letter footnote uses a separate `provenanceFootnote` (array of two `<div>`s) whose break point is placed AFTER the *second* "GoodDeed®" (i.e. mid second-sentence, not at the sentence boundary). That keeps both "GoodDeed®" mentions on the upper line (beside the QR *image*) and leaves the bottom line — the one beside the QR *caption* — ending on "…possessed ownership of this good." Bill's rule: break after the second GoodDeed, never the first.

**How to apply:** any time you adjust Letter band placement, stress-test with a long recipient AND long title (see `LetterBorderThinLong.tsx`) AND the normal baseline (`LetterBorderThin.tsx`). On the normal tile the footnote wraps *beside* the QR (caption adjacency matters); on the long tile the footnote sits full-width *below* the QR. Smallest type in the band is 6pt (Letter footnote provenance); avoid shrinking below that — trim words instead. A4 is a flowing centered stack, unaffected by the column logic.

**Per-tile sample override:** `CertPrint`/`CertStage` accept an optional `sample?: Partial<CertSample>` merged over the default `SAMPLE` as `S`; pass it from a tile to render alternate artist/title/recipient/num without touching the shared default.
