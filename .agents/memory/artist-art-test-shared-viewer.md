---
name: Artist art-test shared viewer
description: Artist "Test. Certify." page shares the press live-test overlay engine; mirror-first pasted-URL art; layerless template PDFs legitimately show zero zone chips.
---

# Artist art-test parity with press live-test

**Rule:** any surface that renders art seated in a press template must reuse the shared overlay engine + viewer under `client/src/pages/press-templates/` (engine module + `TemplateArtViewer`) — never re-inline pdf.js loading, GT-layer extraction, or zone math. The press live-test page keeps its own JSX but imports the same engine.

**Why:** two divergent copies of the mm-geometry math drift; artists and presses must see identical seating/overlays for a check to be trustworthy.

**How to apply:**
- Template exposure for artists goes through the artist-scoped completed-template file endpoint (bearer + operator-or-album-press gate); scoping is inherent because a componentId only resolves within that album's own resolved specs.
- Pasted-URL art submissions are mirrored into our object storage FIRST (standing external-links mirror rule) so a preview can be generated; the bare fetch-and-scan (checked, honestly previewless) is only the fallback when mirroring fails.
- A template PDF with no OCG layers legitimately produces zero zone chips — that is the honest state, not a bug. All dev-seeded template PDFs are layerless; overlays can only be visually proven against a layered (prod) template.
- Admin uploads needing a determinate progress bar use the XHR progress variant in the admin upload lib rather than the plain fetch path.
