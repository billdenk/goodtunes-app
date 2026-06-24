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

**Prod outcome (verified after the publish that shipped task-2076):** the reconcile
matched exactly **1** pair, not thousands. That's expected — the one-time block only
fixes *already-stranded* dupes (an unclaimed legacy row AND a separate re-authed OAuth
row sharing the email). Most legacy fans (≈815 unclaimed rows with albums) simply have
NO duplicate yet, so there's nothing to reconcile; they ride the live auto-link/claim
flows on their next sign-in. So a low pair count is correct, not a bug.

**The loser OAuth row is NOT guaranteed empty/credential-less.** Docs once said "empty
OAuth row," but the unclaimed guard (`isUnclaimedCustomer`) protects only the SURVIVOR
(the legacy row, which must have no real password + 0 identities). The loser can carry
its own real password and still be soft-merged — that's fine because the fan's real
sign-in path is OAuth (Apple/Google), whose identity is moved onto the survivor, and a
relay-masked loser email can't be used for email+password login anyway. Don't add a
password check to `oauth_new` thinking it's a safety gap.
