---
name: Press print rules (per-press artwork check specs)
description: Where per-press print standards live and how they gate the completed-art validator; fallback-safety contract.
---

Per-press print standards live in `printRules` jsonb on BOTH `manufacturers` (press-level defaults) and `press_template_specs` (per-component overrides). `shared/vendorSpecs.ts` owns the type + `mergePrintRules` (component field wins over press field) + `sanitizePrintRules` (never throws). `resolveFinishedComponents` threads `pressPrintRules`/`pressName` onto every slot; `labelAdvisories` fold into `advisories` ONLY on the labels slot.

**Fallback contract:** every new check in `server/validators/completedTemplate.ts` is gated on a rules value being present — a press with no rules must produce byte-identical checks to before (there's a deepEqual test enforcing this). Component catalog `minPpi` column always beats `rules.minPpi`.

**Check tiers:** heuristics never fail — edge-band raster (pdftoppm@24dpi, any error → null → row omitted), bitmap-PPI, Pantone-name are warn-only; un-machine-checkable rules are status "pass" + `tier:"advisory"` (CheckResult.tier) so rollups never flip; client renders advisory rows with an Info glyph.

**Why:** presses publish differing standards (MRP guide seeded via marker-guarded post-merge, `print_rules IS NULL` guard so operator edits never clobbered); existing releases' verdicts must not change unless a press enters stricter values.

Gotcha caught here: scanner exposes `hasSpot`, not `hasSpotColors` — a typo'd field read silently made the Pantone check always pass (tests caught it; prefer test-first on new scan fields).
