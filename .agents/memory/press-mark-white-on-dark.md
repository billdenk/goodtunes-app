---
name: Press marks white on dark component faces
description: Press-components mocks paint uploaded press logos as white CSS masks on dark faces; raw <img> only on light faces.
---

Rule: on any press-components mock with a DARK face (jacket fronts, inner sleeves, inserts, black vinyl center label, dark label styles), render the press's uploaded mark via the shared `WhiteMarkGlyph` (`client/src/pages/press-components/PressMarkGlyph.tsx`) — a white CSS mask of the upload — never a raw `<img>`. Light faces (white sticker, white "Black & White" label stock, Discobag white center label) keep the raw upload.

**Why:** Uploads are often dark artwork on transparent alpha (Hellbender's black rune, 1024px GrayscaleAlpha PNG) and vanish on dark mocks; masking makes ANY monochrome upload read white. Bill's rule: "logos on all components are supposed to be white unless on a light background."

**How to apply:** New dark-face surfaces use `WhiteMarkGlyph` (accepts a `style` prop for absolute positioning); resolve the URL through `resolvePressMarkLogo` (labelLogoUrl → squareLogoUrl → logoUrl → lightLogoUrl → identityIconUrl) — ALL component pages including Labels and Vinyl now use this chain, not labelLogoUrl-only.
