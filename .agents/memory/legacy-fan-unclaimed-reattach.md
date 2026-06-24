---
name: Legacy fan unclaimed-account reattach
description: How credential-less imported fans rejoin their collection across Google/Apple, and the takeover guard that protects credentialed accounts
---

The single safety predicate for "this row can be rejoined, not hijacked" is
`isUnclaimedCustomer(customerId)` in `server/auth/identityLink.ts`: true ONLY
when the row is not merged, has no real password (`password` null or starts
`!oauth-only:` — the placeholder is NOT a hash), and has zero
`customer_identities`. Three surfaces all gate on this same predicate, and any
new reattach/merge path MUST reuse it rather than re-deriving the check:

1. Social sign-in auto-link (Google + Apple-share) — `handleProviderCallback`
   email-collision branch links + signs in when matched row is unclaimed AND
   the provider email is verified; credentialed rows still get `?prompt=link`.
2. Apple Hide-My-Email claim — relay sign-ins can't collide (masked email), so
   the callback stashes the verified identity on `req.session.pendingOauthClaim`
   and redirects `/login?prompt=claim`. `POST /api/auth/claim/{start,confirm,skip}`
   reuse the `emailVerifications` code plumbing. `confirm` returns 409
   `hasCredential` when the matched account is NOT unclaimed (the guard), 404
   `noAccount` when no row uses that email; `skip` mints fresh via shared
   `createCustomerFromOAuthIdentity`.
3. One-time reconciliation of already-stranded dupes — marker-guarded block in
   `scripts/post-merge.sh` (`task_2076_reconcile_legacy_oauth`).

**Why the reconciliation keeps the LEGACY row as survivor (opposite of the admin
"Combine accounts" tool):** the legacy library row already owns the collection +
`legacy_gogoods_id` + QR provenance, and `performAccountMerge` never moves
identities. So here we hand-MOVE the single OAuth identity onto the legacy row
(N→L), reparent `user_albums`/`orders`/`playlists`, soft-delete the OAuth row via
`merged_into_id`, audit into `customer_merges` (`triggered_by='task_2076_reconcile'`).
The admin tool instead keeps the OAuth holder as survivor precisely because it
can't move identities.

**How to apply:** pairing key is `lower(legacy.email)=lower(oauth.contact_email)`,
and ONLY when that email maps to exactly one legacy row and exactly one OAuth row
(no fan-out merges). The real ~2,000 legacy fans are PROD-ONLY — dev clones have
none, so a dev ROLLBACK validation always reports "0 pairs"; the actual move only
happens when post-merge runs against prod on publish.
