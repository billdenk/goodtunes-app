---
name: OCR text-size check + fixture toolchain quirks
description: Warn-only OCR contract for completed-art text size, and env quirks for ImageMagick/Tesseract test fixtures.
---

**Rule:** OCR-based findings on completed art are WARN-ONLY, even when a press sets `minTextPointSizeBlocking`. Raster (TIFF/JPG) completed-art intake exists on the check route for DIRECT uploads only — pasted external links stay PDF-only by design.

**Why:** OCR misreads decorative type; false failures train operators to ignore the check (same press-rules heuristics contract as edge-band/PPI estimates). Bill-era contract: no rules ⇒ byte-identical verdicts, failures degrade silently to "not checked".

**How to apply:** anything built on `server/validators/ocrTextSize.ts` (e.g. the queued OCR tracklist comparison) must keep warn/advisory tiers and null-on-failure.

Environment quirks (cost real debugging time):
- ImageMagick `-annotate` in this repl FAILS with "unable to read font" unless an explicit `-font` path is passed. A committed font exists at `server/assets/fonts/DejaVuSans.ttf` — use it for text fixtures.
- `tesseract` (nixpkgs 5.x, all languages bundled) is in `replit.nix`, so it ships in the deploy image. TSV output: level-5 rows are words; word bboxes span INK not the em box — convert with ascender/descender factors (asc+desc≈1.0em, one≈0.75, x-height-only≈0.52).
- sharp reports `density` (DPI) but files with no metadata read as 72 — treat ≤72 as unknown and derive scale from expected physical size instead.
