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

3. **Logo CHANGES propagate to riding albums (post-creation).** When `PUT /api/admin/manufacturers/:id` actually changes `vinylPlaceholderUrl` (both the operator detail page and the press-portal catalog editor go through this ONE chokepoint via the shared `PressLogoEditorDialog`), a best-effort helper repoints every album whose `artwork` still equals the *previous* default URL onto the new value — or onto the `/album-placeholder.svg` sentinel if the logo is cleared (strOrNull stores cleared as `""`, treat empty AND null as cleared, never leave a dead URL). The route captures the old value with a `getManufacturerById` BEFORE the update.

   **Why:** a press that re-brands expects its branded jacket to refresh everywhere at once, but albums with REAL custom covers must never be clobbered. Matching on `artwork = oldUrl` already spares custom covers (the hosted-object URL is unique); the helper additionally requires the album to be homed to THIS press (pressing-order snapshot `package_snapshot->>'pressId'`, OR primary artist's / label's `default_press_id`) as a collision guard, and filters `deleted_at IS NULL`.

   **How to apply:** this is propagation of an EXISTING default, distinct from creation-time seeding (job 2) — don't conflate them. Regression coverage: `server/pressMasterLogoPropagate.db.test.ts`.
