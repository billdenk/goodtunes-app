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

**Corrections pass (2026-08-09, first pass REJECTED) — the binding rules now:**
- CD/Cassette are DISABLED "Coming" placeholders BY DESIGN-OWNER DECREE (CORRECTIONS-2026-08-09.md): no format-management UI, no GoodDeeds format tab (GoodDeeds is its own bottom section), no live CD/cassette catalogs. Verified: the only non-vinyl press_color_tiers row is one empty MRP Cassette shell — no merchant data hidden. Don't "fix" this back per generic zero-data-loss instincts; the corrections doc wins over the architect on this point.
- Header = H1 + switcher + eyebrow + two-tone heading + exact subcopy ONLY. "Add your vinyl" + CSV buttons live in a quiet utility row at the page bottom (testids kept).
- Rule zero lesson: a "replace wholesale" job that quietly blends old components back in (pencil-icon color tiles, format chips, header buttons) gets REJECTED even when functional. Match the reference's affordances too (color-tile edit = hover dots trigger, not pencil).
- Responsive: preview column stacks ABOVE the working column below xl (flex-col → xl:flex-row, preview first in DOM) — never display:none.
- Parity-screenshot deep-links: `?catalogFormat=<7_inch|12_lp|12_double>` + `?catalogTier=<name>` + `?catalogSection=...` (format param only honors offered formats). AlbumFormat ids are 7_inch/12_lp/12_double, NOT vinyl_12.
- Data-wiring regression root cause: read path only used tiers[].priceLadder — MRP's priced runs live in laddersByJacket, so counts showed 0; count "priced runs" across BOTH.
- Press logos are seeded via the NORMAL mechanism (PNG upload → /api/admin/upload → PUT manufacturers logoUrl), never hardcoded paths; prod parity by marker-guarded UPDATE in post-merge.sh (shared object-storage bucket = same /objects URLs in both DBs); SVG/webp are rejected by the upload MIME allowlist — convert to PNG first.

**Why:** Bill required zero data loss + exact interaction parity verified on live data (Riverside empty catalog, Memphis real ladders) before the legacy page was removed.

## Third pass (2026-08-09 evening) — verbatim mandate
- Bill's standing rule for this page: the presentational layer is copied VERBATIM from handoff/press-catalog/PressPackagePricingTableRuns.tsx; only real-data wiring may differ. Any future change to this page must start from that reference, never re-derive/adapt. Copy strings are not editable.
- 19a/19b landed shell-wide in OperatorShell: partner identity lives in the TOP BAR (logo+name left, Feedback/bell/avatar right), not the sidebar; search is "Search…" with a ⌘K chip. All partner portals share this.
- Disc preview: real per-color art (swatchImageUrl/thumbnailUrl) as base + the reference's gloss overlay layer on top; synthetic swatch only when no art.
- Verification trick: render the reference file in the mockup sandbox (copy to artifacts/mockup-sandbox/src/components/mockups/<dir>/, swap @workspace design-system imports to ../../ui/*, stub asset imports as data-URIs) and screenshot via externalUrl on $REPLIT_DEV_DOMAIN/__mockup/preview/... — appPreview path hits the main app, not the sandbox.
- Screenshot tool has no viewport param (1280×720); shoot reference + live with the same tool for a fair diff.

## Handoff-fidelity rule (durable)
- "Character-identical" applies at EVERY level: section layout, grid specs, AND tile/popover/caption internals. Re-derived markup (responsive grids, different borders/shadows/text sizes) is a rejection even if a screenshot looks close.
- Acceptance check = grep-diff of className + inline style sets between handoff and live files, component by component. Screenshot diffing at 1280px is NOT sufficient — responsive grids collapse to the reference's fixed column count at that width and hide the drift.
- design-lint will flag the handoff's raw sizes/hexes; re-snapshot the baseline rather than converting them to vars.

**Catalog stage jacket (Bill, Aug 2026):** the press-catalog stage always renders the handoff's BLACK square jacket (radius 3, #141416, spine hint, inverted label logo at 0.42) — `jacketUrl` is hard-nulled on the catalog page; the white `vinyl_placeholder_url` art is only for real albums in the package builder. Default size tab is 12" LP when offered, never 7".
