---
name: Per-press default jacket image
description: where the press catalog default image lives and which album-create paths seed from it
---

The per-press default catalog image is `manufacturers.vinyl_placeholder_url` (read-back as `vinylPlaceholderUrl`). It does two jobs:

1. **Catalog preview** — drives the square jacket art behind the vinyl disc in the press Catalog tab (fallback chain `placeholderUrl || pressPlaceholderArt(pressDomain)`), edited via the hover-pencil overlay on the `VinylPreview` jacket (`jacketOverlay` prop) which opens the shared `PressLogoEditorDialog` (fieldName `vinylPlaceholderUrl`).

2. **Seeds new albums created UNDER that press.** Two create paths seed it; keep them in lockstep if you touch seeding:
   - server `POST /api/admin/albums` — when a `pressId` is present and the caller passed the generic `/album-placeholder.svg`, the album artwork is updated to the press default after `homeAlbumToPress`.
   - `server/pressPortal.ts` start-album draft — the draft's `artwork` is `seedPress?.vinylPlaceholderUrl || "/album-placeholder.svg"`.

**Why:** "new press-created albums should start branded" is a cross-path requirement, but the GLOBAL (non-press) create flows (AdminAlbums, AdminPerson, Admin "+ Add") are intentionally left on `/album-placeholder.svg` — only press-homed creates seed.

**How to apply:** any new "create album under a press" path must seed from `vinylPlaceholderUrl`; any new global create path must NOT. The per-album art editor always overrides the seeded value afterward.
