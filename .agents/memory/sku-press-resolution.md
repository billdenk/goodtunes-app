---
name: SKU save resolves press from the picked tier, not invited press
description: Why album_skus catalog saves derive pressId from the chosen tier row and never revert a deliberate pick to a default color
---

# SKU catalog save — resolve press from the tier, not the album's invited press

When saving a vinyl SKU catalog pick (`PUT /api/admin/albums/:id/skus/:format` in `server/commerce.ts`), resolve which press to price against **from the chosen `pressTierId` itself** — every `press_color_tiers` row carries its own `pressId`. Use `resolveCatalogIdentity()` in `server/pressCatalog.ts`.

**Why:** the old path resolved the press only from the album's invited press (artist→label `invitedByPressId`). That broke two real cases:
- album with NO invited press → no `pressId` → catalog lookup skipped → fell through to the legacy placeholder branch and overwrote the operator's color with the default (EcoMix/ECO1).
- operator picks a color from a press selected via the Printer chip (god-view / "All Presses") that differs from the invited press → `(pressId, tierId, format)` lookup misses → null → same revert.

The client already sends the correct tier id for the selected press (the per-row picker reads the SELECTED press's catalog), so this is a pure server-side fix; no payload change needed.

**Unpriceable picks must NOT revert.** If `lookupCatalogUnitCents` returns null (e.g. dev ladders have `confirmed:false` rungs which `snapToCatalogQuantityTier` filters out → null), still pin `pressId`/`pressTierId`/`pressColorId` + the tier/color display names and keep the platform placeholder cost. The legacy default-color branch is now gated on `!pressTierIdSnap` so a deliberate catalog pick (priced or not) never falls into it. Reload restores the operator's exact pick via the pinned ids (see Task #1025 client restore in `SellPanel.tsx`).

**How to apply:** any future SKU/cost save that takes a catalog tier id should derive the press from the tier, not from a separate invited-press lookup; broker-discount snapshot must stay tied to that same resolved press.
