# Printed areas — the template/proof preview device

Six study mocks + the shared viewer (`_PrintedAreasStudy.tsx`). Copied verbatim
from the design studio. Edit the shared file once — all six update.

## The model (Andrew, Aug 12 2026 — read this before building)

- **Left column (`*Template.tsx`)** = the actual TEMPLATE the press uploads
  (the blank press-ready PDF with its guide geometry).
- **Right column (`*Niina.tsx`)** = the finished ARTWORK — uploaded by the
  artist, or by the press on the certification test page. Conceptually it is
  the art with the bleed layer removed from the template.
- **The zone rings the preview draws (Bleed / Cut / Safety / Fold / Die-cut /
  Foil) always come from the RESPECTIVE TEMPLATE, never from the artwork.**
  The artwork is just the image under the rings; the template is the source of
  truth for where every line sits.

## Files

| Product | Template (press upload) | Finished art (artist/test upload) |
| --- | --- | --- |
| Jacket 12" | PressAreasJacketTemplate.tsx | PressAreasJacketNiina.tsx |
| Center labels 12" | PressAreasCenterLabelTemplate.tsx | PressAreasCenterLabelNiina.tsx |
| Inner sleeve 12" | PressAreasInnerSleeveTemplate.tsx | PressAreasInnerSleeveNiina.tsx |

Interaction contract lives in the header comment of `_PrintedAreasStudy.tsx`:
zone chips pulse the matching ring with a word tag (word + ring, never color
alone — colorblind rule), Lines/Areas toggle, view-only Flip 180°, click to
expand. Style per `../../style-guide/apple-canon.md`.

Assets referenced via `../assets/` live in `../assets/` of this handoff area.
