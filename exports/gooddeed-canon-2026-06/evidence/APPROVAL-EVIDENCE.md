# Approval evidence

## Direct Canvas approval

The project Canvas is the authoritative approval surface for GoodDeed visual design. The following Canvas markers identify approved orange-frame variants:

- `gd-approved-gd-square-bordered-sq`
- `gd-approved-gd-portrait-bordered-sq`
- `gd-approved-gd-bord-letter-thin`
- `gd-approved-gd-bord-a4-thin`
- `gd-approved-gd-bord-letter-thin-signed`
- `gd-approved-gd-bord-a4-thin-signed`
- “APPROVED — Orange-frame Story (Instagram 9:16)” beside `StoriesBorderedSafe`

The safe-zone overlay is an approval aid. The clean `StoriesBordered` component is the artwork export.

## Repository approval records

- `.local/tasks/gooddeed-cert-viewer-border-name-edit.md` records approval of the orange-bordered Letter and A4 designs and rejection of the old navy-bleed direction.
- `server/certOgImage.ts` identifies “Texting · California gradient, logo right” as locked on Canvas on 2026-05-31.
- `client/src/components/GoodDeedCertificate.tsx` identifies the sharp full-bleed darker-navy “D” social treatment as approved. The graduated-blur “E” experiment is not part of this canon package.
- `server/goodDeedPrintTemplate.ts` identifies `#FF7C06` as the approved certificate frame and implements the free-logo versus signed/hologram-guide distinction.

## Explicitly not treated as canon

- Any component or export named `Current`, `Deep`, `Long`, `gblur`, or an unmarked comparison/experiment.
- `LetterBorderThinLongSigned.tsx`, which is a long-name experiment rather than a distinct approved format.
- Browser screenshots in `attached_assets/screenshots/`; those are 1920×1080 review captures, not original-dimension deliverables.
- `evidence/historical-not-canon/gooddeed-og-early-1200x630.png`.
- `evidence/historical-not-canon/sample-gooddeed-certificate-*.pdf`.

## Render provenance

- Social PNGs were captured deterministically from the exact archived Canvas components at their intended export scales. The Square and Portrait transfer renders use the approved sharp full-bleed/darker-navy treatment and square outer corners. The Story render uses the locked rounded Story component.
- The Story component is authored at 340×604.4375 CSS pixels. Chromium rasterized it one pixel short at the target scale; the transfer PNG was normalized from 1080×1919 to the intended 1080×1920 output size.
- The Texting PNG was generated directly by the production OG renderer at its native 1200×840 dimensions.
- Print PDFs were generated directly by the production PDF renderer using sample certificate data. PNGs were rasterized from those PDFs at standard 300-DPI page dimensions.
