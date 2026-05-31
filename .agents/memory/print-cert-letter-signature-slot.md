---
name: Letter print-cert band — decoupled top-flow + bottom lock-up
description: How the GoodDeed Letter print-cert headline/signature/credit/footnote share the navy band without colliding on long names/titles, plus the artist avatar
---

The GoodDeed print-cert mockup engine (`_CertPrint.tsx`) renders the **Letter** band as TWO decoupled absolute blocks (NOT one flex column):

1. **Top-flow block** (`top: headlineYRel`): headline div, then the signature squiggle `<img SIG>` (`marginTop: px(sigGap)`). Flows from the top so the squiggle always sits directly under a 1- or 2-line headline.
2. **Bottom lock-up block** (`bottom: px(pad + footBottomGap)`): the William credit div + provenance footnote div as ONE unit. Always bottom-anchored, so it ALWAYS keeps its breathing space off the orange border and its last line stays on the QR caption baseline — regardless of how many lines the headline wraps to.

Because the two blocks are independent, when a long recipient/title wraps the headline to 2 lines the squiggle just drops down and **overlaps the top of the William credit (intentional, Bill-approved)** instead of shoving the footnote past the border.

**Why this replaced the earlier single flex column:** the prior version put headline + signature + footnote in ONE absolute flex column (footnote `marginTop:auto`). That bottom-anchored the footnote only *when there was room*; a 2-line headline ate the slack and pushed the footnote (and its QR-caption baseline alignment) downward. Decoupling guarantees the bottom lock-up never moves. A4 is unchanged — it stays a flowing centered stack using `makeSignatureBlock(2)` (squiggle + credit together).

**Artist avatar (all tiles, Letter + A4).** The round avatar in `titleRow` shows the ARTIST, not the album art. `const ARTIST` is the default; `CertPrint`/`CertStage` accept an optional `artistPhoto?: string` prop, and `avatarSrc = artistPhoto ?? ARTIST` feeds the avatar `<img>`. The mockup's default artist face lives at `artifacts/mockup-sandbox/public/images/artist-fernando-perdomo.png` (cropped from the album image; a head-back singing pose — fine for the mockup, Bill can swap a production headshot).

**Footnote breaks AFTER the second "GoodDeed®" (Letter only).** The provenance copy says "this GoodDeed®" twice and the QR caption is also "GoodDeed®". A4 renders the copy as one naturally-wrapping string (`provenance`). The Letter footnote uses a separate `provenanceFootnote` (two `<div>`s) whose break is placed AFTER the *second* "GoodDeed®" so both mentions stay on the upper line and the bottom line ends on "…possessed ownership of this good." Bill's rule: break after the second GoodDeed, never the first.

**How to apply:** any time you adjust Letter band placement, stress-test with a long recipient AND long title (`LetterBorderThinLong.tsx`) AND the normal baseline (`LetterBorderThin.tsx`). Smallest type in the band is 6pt (footnote provenance); trim words rather than shrink below that. This is a MOCKUP only — the shipped PDF in `server/goodDeedPrintTemplate.ts` is intentionally NOT edited by canvas work.

**Per-tile sample override:** `CertPrint`/`CertStage` accept an optional `sample?: Partial<CertSample>` merged over the default `SAMPLE` as `S`; pass it from a tile to render alternate artist/title/recipient/num without touching the shared default.
