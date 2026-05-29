---
name: Invite pre-flight deep-link to album
description: What it takes for an invite link to land the recipient on a specific album with prepared quotes
---

To make `POST /api/admin/invites` land the recipient on a specific album editor
(e.g. "share built quotes with the artist"), the body must carry **all three** of:
`inviteRole` ∈ identity|manager (NOT team), `targetPersonId` (the Person they
represent), and `preFlightedAlbumId`. Sending `preFlightedAlbumId` without an
identity/manager `inviteRole` falls back to `/artist`, not `/admin/albums/:id`.

**Why:** the accept handler only deep-links preflighted albums for identity/manager
invites tied to a Person; quotes themselves persist as `album_skus` rows, so the
link is just an entry vector — no quote payload travels on the invite.

**How to apply:** for the share-quote flow the album's `primaryArtistId` doubles as
both `roleScopeId` and `targetPersonId`. Identity invites for *claimed* People
(login / Spotify artist / group / shipped GoodTunes release) come back with
`acceptUrl: null` + `reviewStatus: 'pending_review'` — surface a "held for review"
state instead of a copyable link. Fresh/placeholder artists return the URL inline.
