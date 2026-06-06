---
name: Fan account deletion = anonymize-in-place
description: Why DELETE /api/customer/me scrubs the row instead of hard-deleting, and what it must touch
---

In-app account deletion (App Store 5.1.1(v) + Google Play) is implemented as
`DELETE /api/customer/me` (requireCustomer) → `storage.deleteCustomerAccount(id)`.

**Decision:** anonymize the `customer_users` row in place, do NOT hard-delete it.
**Why:** `orders` (and downstream financial/cert records) reference
`customer_users.id` and are retained for legal/accounting reasons; a hard delete
would orphan them or FK-fail. Scrubbing PII + nulling password + dropping all
OAuth identities + revoking every bearer token makes the account permanently
sign-in-impossible, which satisfies the stores without touching financial history.

**How to apply:** the delete transaction must, in one shot: delete authTokens by
customerUserId, customerIdentities by userId, songFavorites/artistFavorites,
playlistSongs (for the user's playlists) then playlists, userAlbums; then UPDATE
the row to a deterministic sentinel (`deleted-<id>@deleted.invalid`, username
`deleted-<id>`) and null every PII column. Deterministic sentinel = idempotent on
double-submit, never collides on the unique email/username indexes. KEEP
stripeCustomerId + orders. There is NO `deletedAt` column on customer_users (would
add schema drift + unfiltered-read leak risk). Bearer tokens validate against
auth_tokens, so deleting those rows is what actually kills a cached token — the
route also destroys the session + clears connect.sid. UI entry point:
Account → Privacy → Delete My Account.
