---
name: Viryl prod manufacturer split (decoy shell)
description: Prod has TWO Viryl manufacturer rows; scripts matching ILIKE '%viryl%' hit the empty decoy first.
---

Prod carries an empty decoy press **"VIRYL" (viryltech.com)** beside the real **"Viryl Technologies" (viryl.ca)**, which holds all tiers/ladders. Any script that selects Viryl with `ILIKE '%viryl%'` and takes the first row targets the decoy in prod.

**Consequence observed (Aug 21 2026):** the 2026 pricing sync (`viryl-2026-price-list`) and Setup & Services seed stamped their markers after operating on the decoy — so prod's package ladders NEVER received the 2026 sync (still 2024-seed + operator values) and the 2026 service items live on the decoy row, not the real press.

**Why:** same class as the empty-decoy-shell duplicate-album trap — never trust a prod row by name alone.

**How to apply:** any Viryl-targeting script must pick the candidate with actual catalog tiers (or key on `domain='viryl.ca'`), and prod data verification must check content, not just the marker. Cross-check report: docs/viryl-component-vs-package-crosscheck-2026-08-21.md; script: scripts/crosscheck-viryl-component-vs-package.ts.
