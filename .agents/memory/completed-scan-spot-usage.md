---
name: Completed-scan spot USAGE vs definition
description: Certification Pantone check keys off spot usage, not definitions; conservative fallback rules
---

The completed-template certification distinguishes spot colorspaces *used* by artwork (content-stream selections or spot-bearing image XObjects) from mere definitions — Illustrator embeds unused swatches, including in its private round-trip data. Definition-only spots pass the Pantone row and don't count as "spot/PMS present" in the color summary.

**Why:** unused Swatches-panel spots were producing false warnings on every Illustrator export.

**How to apply:**
- Usage verdicts must be *proven*: any selected-but-unresolved or ambiguously-mapped colorspace resource name yields "unknown" (warn), never "unused" — indirect resource dicts and reused resource names across scopes stay conservative by design.
- "unknown" warns with a reason code attributed as either a problem with the file (encryption, malformed streams) or a GoodTunes scanner limitation (legacy compression, compressed object streams, scan caps). Never pass blindly.
- Expect the fallback on modern PDFs using compressed object streams; fallback frequency is logged server-side (redact URL query strings — pasted links carry signed tokens).
- Older stored scans lack the usage field; readers default it to "unknown" (legacy conservative behavior).
