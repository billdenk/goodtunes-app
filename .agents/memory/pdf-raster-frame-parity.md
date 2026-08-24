---
name: PDF raster ↔ pdf.js frame parity
description: Any server raster meant to seat where a client pdf.js render would must match pdf.js viewport semantics — CropBox + /Rotate — and self-describe its size.
---

Rule: when a server-generated raster of a PDF page is persisted alongside real-world dimensions so a client can seat it in place of a pdf.js render, render with `pdftoppm -cropbox` (pdf.js viewport = CropBox, MediaBox fallback) and derive the mm from the RASTER'S OWN pixel dims ÷ DPI — never from the PDF boxes.

**Why:** pdf.js applies the page's default `/Rotate` and renders the CropBox; a plain pdftoppm pass rasterizes the MediaBox, and box-based mm ignore rotation — either mismatch stretches/misregisters the image when seated (completion review rejected both variants on the completed-art full-artboard fallback, Aug 2026). Pixels ÷ DPI makes image and dimensions the same rectangle by construction; rotation and framing can't disagree. UserUnit is ignored identically by both poppler raster sizing and pdf.js scale-1 viewports.

**How to apply:** see `rasterArtboardMm` in server/completedArtPreview.ts and the `renderFullArtboard` pass in generateCompletedPreview (server/routes.ts); coverage pattern (synthetic divergent-box + /Rotate 90 PDFs with computed xref) in server/fullArtboardRaster.test.ts. Note the TRIM-preview crop math deliberately stays MediaBox-framed — don't add -cropbox there.
