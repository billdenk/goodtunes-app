---
name: Lazy view-time backfills must run off the request path with durable failure markers
description: Why the press Templates GET took ~12s in prod and the pattern that prevents a repeat.
---

Rule: any "lazy backfill on first view" (measuring/rasterizing PDFs, importing legacy rows) must (a) run in the background AFTER the GET responds, and (b) persist its FAILURES durably, not just successes.

**Why:** the press Templates GET awaited legacy-template import + preview rasterization inline, and run-preview render failures were only remembered in an in-memory Set. Legacy Memphis test runs pointed at unrenderable external Dropbox files, so every fresh autoscale instance in prod re-downloaded and re-failed them sequentially inside the GET → ~9-12s page loads forever. Dev looked fine (warm process had the failures cached).

**How to apply:** templates GET now serves persisted data and kicks a per-press de-duped background chain (`maintainInFlight`); run preview failure persists as `previewUrl=''` (NULL = never attempted, '' = attempted+failed; clients treat falsy as no-preview). Two review-mandated companions: a background importer must reload the row + revision history JUST before minting (a concurrent PUT attach may have replaced the file), and a `void (async…)` chain needs an outer catch or an uncaught step becomes an unhandled rejection. Check any similar view-time backfill for the same three traps.
