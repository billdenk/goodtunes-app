---
name: Shared album-card component
description: One AlbumCard renders every fan album surface; hover affordances are pointer-only.
---
Every fan album surface — Collection grid + Recently-Played rail, ArtistDetail (GoodTunes releases grid, streaming rails, "See All" bucket sheet), and Search album results — renders through ONE `client/src/components/ui/AlbumCard.tsx` (modes `grid` | `row`). Mirror any polish in this one file or surfaces drift again.

**Apple-Music hover affordances** (circular Play bottom-left, "…" More bottom-right over a scrim) are gated behind `useCanHover()` = `matchMedia("(hover: hover) and (pointer: fine)")`. Touch keeps tap-to-navigate with NO overlay — do not surface the overlay unconditionally.

**Why:** before this each surface re-implemented its own card markup/badges/menu; hover affordances must never appear on touch (they'd hijack the tap).

**How to apply:**
- The "…" menu reuses the mobile album-menu test-ids (`menu-view-certificate`, `menu-view-provenance`, `menu-add-album-to-playlist`) PLUS `menu-download-gooddeed-pdf` (anchors `GET /api/orders/:orderId/cert/pdf`). Keep the test-ids in lockstep with the mobile surface.
- Affordances are conditional: Play only when `playable` (false for streaming-only discography rows that just hand off via `onNavigate`); GoodDeed/Provenance/Download only on owned copies.
- It imports `ProvenanceSheet`/`OwnershipSheet` from `@/pages/AlbumDetail` (a ui→page import; established, no cycle).
- Relocating the card re-flagged its intentional Apple-Music pixel font sizes (text-[15px]/[13px]/[11px]/[10px]) as NEW design-lint violations even though they were baselined in the old local card — re-snapshot the baseline (`design:lint -- --update-baseline`), don't convert to the shadcn scale (would change the design).
