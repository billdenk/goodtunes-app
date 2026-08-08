---
name: Press catalog redesigned page
description: The press Catalog surface is PressPackagePricingCatalog.tsx (handoff design); legacy PressCatalogPanel/CatalogEditor deleted; ladder-draft semantics and reuse rules.
---

The press Catalog (portal Vinyl catalog tab + god-view `?tab=catalog`) is `client/src/pages/PressPackagePricingCatalog.tsx`, built from the `handoff/press-catalog/` design. The legacy `PressCatalogPanel`/`CatalogEditor` in AdminManufacturer.tsx were deleted; their shared subcomponents (FormatDropdown, GoodDeedPrintingEditor, PressTemplateSpecsCard, PressAudioSpecCard, CatalogCsvButtons, Hellbender buttons, ManageColorsPanel, SwatchEditorPopover/VinylDisc from PressVinylColors) stay exported and are reused — don't re-inline or duplicate them.

**Rules that must survive future edits:**
- Ladder-draft semantics are the legacy contract: drafts keyed `${format}:${tierId}`; no rung = Not offered, `confirmed:false` = Quote ("On request"), confirmed = Priced; save flushes all dirty combos and auto-creates a "Standard" jacket when no defaultJacketId.
- Save clears only draft entries unchanged since a per-save snapshot (mid-flight edits stay dirty). Don't regress to `setDrafts({})` on success.
- Color drag-reorder lives in ManageColorsPanel, mounted via the "Manage colors" link under the color grid — the popovers alone don't cover reorder (`/colors/reorder` write).
- Role gate identical to legacy: out-of-scope manufacturers get `null`, not read-only. `pressAudioSpecCard.test.ts` mounts this page and asserts that.
- Deep-link `?catalogSection=<section id>` scrolls to a section (section-pick-size/-pick-type/-pick-color/-price/-turnaround/-templates/-audio) — used by parity screenshots and reusable elsewhere.
- Design-scale font sizes (`text-[13px]` etc.) are intentional per the handoff and baselined in design-lint; use `var(--brand-blue)` not the raw hex.

**Why:** Bill required zero data loss + exact interaction parity verified on live data (Riverside empty catalog, Memphis real ladders) before the legacy page was removed.
