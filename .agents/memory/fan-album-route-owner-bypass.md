---
name: Fan album route owner-bypass
description: Why GET /api/albums/:id lets a fan open an album they own even when it's hidden/sunrise/trashed, and the fan-route rail coupling.
---

# Fan album route owner-bypass

`GET /api/albums/:id` gates visibility with `getAlbumById(id, { includeHidden })`
where `includeHidden` is admin-only. That 404'd a fan's own album the moment it
went hidden / sunrise-gated / soft-deleted — so the Orders/Library "View order"
deep link dead-ended.

Fix: if the standard read returns nothing AND `storage.userOwnsAlbum(session.userId, id)`
is true, re-read with `{ includeHidden: true, includeTrashed: true }`.

**Why:** owning an album (real purchase/comp, or an unexpired preview) should
always let you open it; visibility gating is for *browse/discovery*, not for
revoking access to things a fan already bought. capabilities.md promises masters
never leave as a file, but the *page* must still open.

**How to apply:**
- `userOwnsAlbum` deliberately skips the `isHidden`/`deletedAt` filters that
  `getUserAlbums` applies, but still treats an *expired* preview as not-owned.
- Keep the bypass owner-scoped — never widen `includeHidden` for non-owners.
- Any other fan-facing read of owned content (songs, videos, certs) that a fan
  reaches from Orders/Library should follow the same own-it-can-open-it rule.

## Sibling gotcha: fan routes must be in the StorefrontSidebar allowlist
The global desktop rail (`StorefrontSidebar`) only renders on routes whose prefix
is in `STOREFRONT_ROUTE_PREFIXES`. A new fan route (e.g. `/orders`) silently
loses the lg+ left rail until added there. Fan list/detail pages should also use
the FanScreen shell (`h-screen … lg:pl-[284px]` + inner scroll + MiniPlayer +
BottomNav + `text-[34px]` title) — Account/Recents/Playlists/Collection are the
templates; don't hand-roll a `max-w-[440px] min-h-screen` page.
