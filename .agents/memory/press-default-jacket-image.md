---
name: Per-press default jacket image
description: where the press catalog default image lives and which album-create paths seed from it
---

The per-press default catalog image is `manufacturers.vinyl_placeholder_url` (read-back as `vinylPlaceholderUrl`). It does two jobs:

1. **Catalog preview** — drives the square jacket art behind the vinyl disc in the press Catalog tab (fallback chain `placeholderUrl || pressPlaceholderArt(pressDomain)`), edited via the hover-pencil overlay on the `VinylPreview` jacket (`jacketOverlay` prop) which opens the shared `PressLogoEditorDialog` (fieldName `vinylPlaceholderUrl`).

   **Precedence — the JACKET placeholder beats the PROFILE logo, always.** Catalog jacket render order: `vinylPlaceholderUrl` → bundled `pressPlaceholderArt(domain)` (both full-bleed `artworkUrl`) → press `logoUrl` (the small profile *icon*, centered as `placeholderLogoUrl`, last-resort only when neither exists) → VinylPreview's generic gray jacket. We briefly flipped this to make `logoUrl` WIN over the placeholder/bundled art — that was wrong: a press whose profile icon is a dark square (PMP's spiral-"P") then showed the dark icon as the jacket AND the editor edits to `vinylPlaceholderUrl` appeared to do nothing. **Why:** the profile icon and the jacket art are two different fields with two different jobs; the icon must never silently override the dedicated jacket field. The shared `PressCatalogPanel`/`CatalogEditor` (used by both `AdminManufacturer` detail and `PressPortal`) is the single render site — fix precedence there, not per-surface. SellPanel's album-page `placeholderLogoUrl={press.logoUrl}` is a *separate* quoting-press-branding surface, deliberately logo-driven.

2. **Seeds new albums created UNDER that press.** Two create paths seed it; keep them in lockstep if you touch seeding:
   - server `POST /api/admin/albums` — when a `pressId` is present and the caller passed the generic `/album-placeholder.svg`, the album artwork is updated to the press default after `homeAlbumToPress`.
   - `server/pressPortal.ts` start-album draft — the draft's `artwork` is `seedPress?.vinylPlaceholderUrl || "/album-placeholder.svg"`.

**Why:** "new press-created albums should start branded" is a cross-path requirement, but the GLOBAL (non-press) create flows (AdminAlbums, AdminPerson, Admin "+ Add") are intentionally left on `/album-placeholder.svg` — only press-homed creates seed.

**How to apply:** any new "create album under a press" path must seed from `vinylPlaceholderUrl`; any new global create path must NOT. The per-album art editor always overrides the seeded value afterward.
