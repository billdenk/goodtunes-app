---
name: Artist invited as their own teammate
description: Inviting the artist themselves with inviteRole 'manager'/'team' onto their own scope strands them without owner self-serve verbs (can't pay manufacturing ledger).
---

The invite path stores `sub_role = inviteRole` on the membership. If an operator invites the ARTIST THEMSELVES with inviteRole `manager` (or `team`) targeting their own Person, the account lands on its own artist scope as a teammate — `isArtistScopeOwner` requires `sub_role IS NULL`, so the implicit OWNER_SELF_SERVE_VERBS (edit_metadata, upload_masters, edit_credits_and_gear, manage_payouts) never apply. Symptom: the artist 403s on their own manufacturing ledger / payments tab.

**Why:** happened to a Shopify+ prepaid artist who was invited as `manager` of her own Person; the billed artist couldn't open the ledger to pay.

**How to apply:**
- Repair = set `memberships.sub_role = NULL` for that (user, scope) row. A marker-guarded sweep (`task_2928_owner_membership_repair` in post-merge.sh) already ran on both DBs; it promotes only when the account demonstrably IS the scope's person (explicit pair, contact_email match, or email-domain == normalized person name — exact equality, so a foundation-staff manager of a memorial artist scope stays a manager) and the scope has no other owner.
- Note `applyAdminInviteGrant` still writes `sub_role = inviteRole` even when the invite's target Person IS the invitee — the mis-seed can recur; also identity invites accepted onto an EXISTING account get `sub_role='identity'` (addMembership), which is NOT owner-null either.
