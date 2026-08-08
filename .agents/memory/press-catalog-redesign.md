---
name: Press catalog redesigned page
description: The press Catalog surface is PressPackagePricingCatalog.tsx (handoff design); legacy PressCatalogPanel/CatalogEditor deleted; ladder-draft semantics and reuse rules.
---

The press Catalog (portal Vinyl catalog tab + god-view `?tab=catalog`) is `client/src/pages/PressPackagePricingCatalog.tsx`, built from the `handoff/press-catalog/` design. The legacy `PressCatalogPanel`/`CatalogEditor` in AdminManufacturer.tsx were deleted; their shared subcomponents (FormatDropdown, GoodDeedPrintingEditor, PressTemplateSpecsCard, PressAudioSpecCard, CatalogCsvButtons, Hellbender buttons, ManageColorsPanel, SwatchEditorPopover/VinylDisc from PressVinylColors) stay exported and are reused — don't re-inline or duplicate them.

**Rules that must survive future edits:**
- Ladder-draft semantics are the legacy contract: drafts keyed `${format}:${tierId}`; no rung = Not offered, `confirmed:false` = Quote ("On request"), confirmed = Priced; save flushes all dirty combos and auto-creates a "Standard" jacket when no defaultJacketId.
- Save clears only draft entries unchanged since a per-save snapshot (mid-flight edits stay dirty). Don't regress to `setDrafts({})` on success.
- Color reorder (handoff v2.1) is direct drag-on-the-tiles in the "Pick a color" grid (HTML5 drag, tile dims at 0.45, live local order draft, drop persists via POST `/colors/reorder` `{colorIds}`); the ManageColorsPanel modal + "Manage colors" link were REMOVED from this page per the handoff — don't re-add them; rename/remove stay in each tile's SwatchEditorPopover. Hint copy "drag to reorder — artists see this order" shows only when canEdit && >1 color.
- Role gate identical to legacy: out-of-scope manufacturers get `null`, not read-only. `pressAudioSpecCard.test.ts` mounts this page and asserts that.
- Deep-link `?catalogSection=<section id>` scrolls to a section (section-pick-size/-pick-type/-pick-color/-price/-turnaround/-templates/-audio) — used by parity screenshots and reusable elsewhere.
- Design-scale font sizes (`text-[13px]` etc.) are intentional per the handoff and baselined in design-lint; use `var(--brand-blue)` not the raw hex.

**Handoff v2 — artist "Design your package" builder:** `client/src/pages/PressAlbumPackageBuilder.tsx` replaces SellPanel on the album Package (sell) tab ONLY when the viewer role is `artist` (AdminAlbum `isArtist` split); operators/press keep the full SellPanel untouched. Rules that must survive:
- It writes through the SAME endpoints SellPanel uses (PUT `/skus/:format` + PUT `/addons/signed_cert`); the save must preserve every non-surfaced field from the TARGET format's existing SKU row (stock/vinylColor/jacketUpgrade/displayName — omitting displayName erases it) and deactivate the previously active vinyl SKU on a format switch (flag only, config kept).
- Edit access fails CLOSED (`editAccess?.canEdit === true`); the fieldset stays disabled until the probe resolves.
- Economics mirror SellPanel's CATALOG branch exactly: ladder rung via snapCatalogLadder (requiresQuote → "custom quote" note, never $0), MECH_RATE × tracks, 2.9%+30¢, flat 450¢ GoodTunes; the payout-format editable costs only apply to legacy non-catalog rows — don't "fix" this to formatCosts.
- Jacket fill chain: real art (treat `/album-placeholder.svg` as none) → press `vinylPlaceholderUrl` → `/pmp-icon.png` at 45% on `#1d1d1f` via JacketStage's `placeholderIconUrl` prop (exported from PressPackagePricingCatalog).
- The invited press resolves from `people.invited_by_press_id` (or label), NOT `press_invited_albums` — dev verification fixture = stamp that column on the artist person (Memphis has real ladders in dev; appreview sampler artist works).

**Why:** Bill required zero data loss + exact interaction parity verified on live data (Riverside empty catalog, Memphis real ladders) before the legacy page was removed.
