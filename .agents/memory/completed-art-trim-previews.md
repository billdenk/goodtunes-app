---
name: Completed-art trim-area previews
description: Why TrimBox can't be trusted in vendor finished-art PDFs and how finished-area crops are derived.
---

Rule: never trust a PDF TrimBox blindly — poppler's `pdfinfo -box` always prints one, defaulting it to the CropBox, so a TrimBox equal (±1pt) to Media/CropBox means "absent". A real TrimBox is already the finished area (no bleed inset); any approximation built from a detected content bounding box spans art + bleed and must inset the bleed to describe the same finished area.

**Why:** real MRP finished-art PDFs (CALIFORNIALAND set) carry no true TrimBox, while their dieline layers are hidden — so the placed art block against white flap margins is the only recoverable geometry. Treating the defaulted TrimBox as real would "crop" to the whole artboard.

**How to apply:** front-panel choice must be shape-driven, never vendor-hardwired (wide sheet → right square upright; tall stacked jacket → top square rotated 180°; tall sleeve → top square upright; near-square → use whole). Anything uncertain falls back to the full-page render — a preview must never fail the check.
