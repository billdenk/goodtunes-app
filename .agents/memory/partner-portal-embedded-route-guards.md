---
name: Partner-portal embedded sub-route guards
description: New embedded detail routes under a partner portal (e.g. /artist/albums/:id) must be exempted in BOTH the App.tsx admin-host redirect guard AND main.tsx's first-paint light-theme detector, or the prod admin host bounces them to a blank /admin.
---

Two guards allowlist the invited-partner portals (`/artist`, `/label`,
`/manager`, `/vendor`, `/non-profit`, `/publisher`) by their **EXACT bare
landing path** only:

1. `client/src/App.tsx` — the `kind === "admin"` (prod admin host) customer-
   surface redirect guard. It bounces dark fan surfaces to `/admin`. The
   `/artist` branch reads `startsWith("/artist") && location !== "/artist"`
   (was: only bare `/artist` exempt), i.e. it treats ANY `/artist/...` as the
   dark fan page `/artist/<slug>`.
2. `client/src/main.tsx` — the pre-React first-paint `gt-admin` light-theme
   body-class detector (`lightPortal = p === "/artist" || ...`). Miss it and
   the surface paints the dark fan gradient before React mounts.

**The trap:** when you add an *embedded* sub-route under a portal (the portal
shell with one album/detail opened inside it, e.g. `/artist/albums/:id`), it is
two-segment `/artist/...` and BOTH guards mistake it for the dark fan page.
Symptom: on the prod admin host, clicking a Catalog album navigates to
`/artist/albums/:id` → App.tsx redirects to `/admin` → chains to
`/admin/dashboard`, which renders empty under partner scope → **blank navy
screen** (the `html` navy backstop showing through an empty `#root`), plus a
dark first-paint flash.

**Why it hides:** the guard lives inside the prod-admin-host branch, so dev
always works. It also hits REAL artists/partners on the prod app, not just a
super_admin in "View as this Artist" mode.

**How to apply:** when adding any embedded detail route under a partner portal,
exempt it in BOTH files:
- App.tsx: add `&& !location.startsWith("/<portal>/<sub>/")` to that portal's
  redirect branch.
- main.tsx: add `p.indexOf("/<portal>/<sub>/") === 0` to `lightPortal`.
Keep the **trailing slash** so a sibling fan slug (e.g. `/artist/albumsforever`)
still bounces. Fan slug collision is independently impossible — `albums` and
`artist` are in `RESERVED_SLUGS` (shared/shareSlug.ts) and the single-segment
`/artist/:slug` route can't match the two-segment `/artist/albums/:id`.

**Third guard — AdminAlbum tab-sync effect:** AdminAlbum has a useEffect
(Task #674) that mirrors `?tab=` into the URL via `navigate(\`/admin/albums/${albumId}?tab=...\`)`.
This fires on EVERY MOUNT, including when `embedded=true`. Without `if (embedded) return;`
at the top of that effect, it silently rewrites the wouter location from
`/artist/albums/:id` to `/admin/albums/:id` the moment AdminAlbum mounts,
causing the Switch to re-render the full admin shell. Symptom: artist-portal
album click opens the correct content but inside the full AdminFrame chrome
(Partners / Queues / System sidebar) instead of the OperatorShell. Fix: the
`if (embedded) return;` guard is now at the top of that effect.
