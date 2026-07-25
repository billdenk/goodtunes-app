---
name: Album-create scope gate fan-out
description: Every album-creation route under requireAdmin must gate artist scope itself — requireAdmin admits partner accounts.
---

Rule: `requireAdmin` admits ALL partner accounts, and album creation is not a partner-permission verb (no album exists yet to scope on). So EVERY route that mints a new album row must enforce caller scope itself. Known create paths in `server/routes.ts`:

- `POST /api/admin/albums` — artist branch forces `primaryArtistId = roleScopeId`; foreign id or null scope → 403.
- `POST /api/admin/albums/from-apple-url` — operator-only (seeder derives primaryArtistId from Apple metadata).
- `POST /api/admin/albums/:id/duplicate` — operator-only.

**Why:** an artist-scoped account could otherwise POST an arbitrary `primaryArtistId` (or seed via URL) and mint albums outside its scope — real gap found in a security audit; the direct route was fixed first and code review caught the seeder bypass.

**How to apply:** any NEW album-creation endpoint (importers, bulk seeders, Shopify sync, etc.) needs either an operator-only role check or the artist scope-forcing branch. Regression harness: `server/artistAlbumCreateScope.db.test.ts` (loopback route tree + Bearer tokens) — add a case per new create path.
