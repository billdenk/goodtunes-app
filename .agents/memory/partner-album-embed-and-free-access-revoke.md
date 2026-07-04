---
name: Partner album embed + free-access revoke
description: How a partner (artist) opens one of their albums inside the portal shell, and how comped/free access is surfaced/revoked without leaking fan identities.
---

# Partner album embed (portal shell, not /admin chrome)

An artist opening one of their albums must stay INSIDE the OperatorShell portal,
never the operator `/admin/albums/:id` AdminFrame chrome.

- `AdminAlbum` takes optional `{ embedded?, albumId?, backHref? }`. In `embedded`
  mode it renders `mainBody` directly (no AdminFrame wrapper / operator sidebar /
  phone+tablet preview pane); `albumId`/`backHref` come from the portal route
  instead of the `/admin` route params. Breadcrumb reads "Catalog"/"Back to
  catalog" when embedded.
- Route `/artist/albums/:id` → ArtistDashboard (listed BEFORE `/artist/:slug`;
  two segments can't collide with the single-segment slug, but keep it ahead).
  ArtistDashboard `useRoute("/artist/albums/:id")` forces the Catalog tab active,
  drops the shell section header + date controls (the album page has its own),
  and routes tab clicks back out to `/artist?tab=X` so the artist can leave.
- **Gotcha (JSX roots):** AdminAlbum's main return wrapped `<div>` + trailing
  `<Dialog>` siblings inside a single `<AdminFrame>` parent. Extracting that into
  `const mainBody = (...)` needs a fragment `<>...</>` — otherwise the trailing
  dialogs become multiple JSX roots and it's a syntax error. tsc reports it at a
  MISLEADING earlier line + a "Declaration or statement expected" much later.

# Free/comped access surfacing (privacy split)

`AccessWithoutPurchaseSection` (exported from `AlbumCustomersPanel.tsx`) shows two
groups: comped/free OWNERS (a fan roster) and reviewer preview LINKS.

- `previewLinksOnly` prop → renders ONLY the "Preview & reviewer links" section
  and DOES NOT even fetch `/free-access` (`enabled: !previewLinksOnly`). Partners
  see this mode; the comped fan identities are a privacy leak and must stay
  operator-only. Operator Customers tab passes no flag → full section.
- Backend `canManageAlbumPreviews` returns true for the owning artist/label, so
  the `/free-access` GET WOULD leak comp identities to a partner — the client must
  never issue it in partner mode (the disabled query is the guard, not the API).

# Free-access revoke (operational verb)

`POST /api/admin/albums/:id/free-access/:grantId/revoke` — operator-only
(super_admin/admin, explicit getUserRole check; requireAdmin admits partners so
it alone is NOT enough). `grantId === user_albums.id` for BOTH comp (isPreview
false) and account-level preview (isPreview true) rows; scope the delete to
albumId. Guard: 409 if that customer has a paid order for the album (never strip
paid ownership). This bypasses the post-sale edit_metadata lock by design (an
operational verb, like preview-link revoke / vendor pricing).

**Why:** comped/free copies count toward NO revenue or units; revoking one is an
operator housekeeping action, and exposing the fan who got a comp to a partner
would be a privacy leak. Revoke UI (`FreeOwnerRevokeButton`, AlertDialog confirm)
renders only in the full (operator) section, never in `previewLinksOnly`.
