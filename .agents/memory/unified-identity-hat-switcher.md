---
name: Unified identity P3 — hat-switcher + additive grants
description: How the active-membership hat-switcher scopes the admin shell and why every grant path must add a membership (never setUserRole) onto an existing account.
---

# Active membership (per-request hat)

`server/auth/activeMembership.ts` carries the chosen hat through the request via AsyncLocalStorage; middleware after `session()` reads `req.session.activeMembershipKey`. In `roles.ts`, `getUserMemberships` narrows the SET to the active hat when the key is set AND still valid, else returns the full set → `pickPrimaryMembership` (highest-privileged).

**Why it cascades for free:** the ONLY consumers of `getUserMemberships` are `getUserRole` + `findMembershipForScope`. So sidebar/album-list/reports/edit-perms all re-scope to the active hat with no per-call-site changes. `getAllUserMemberships` is the unfiltered read for the switcher list only.

Switcher hides when an account has <2 memberships → single-hat users see ZERO change. Endpoints: `GET /api/me/memberships`, `POST /api/me/active-membership` (validate key ∈ memberships or null).

# Additive grants — the `applyAdminInviteGrant` seam

`applyAdminInviteGrant(userId, invite, {isNewAccount})` in routes.ts is the single seam every invite/grant path funnels through. `isNewAccount:true` → `setUserRole` (legacy primary + Terms stamp); `false` → `addMembership` (additive upsert). Both run identical side effects: fan-link, referral chain, invited_by_press_id, default-press, per-user override grants (+rebuildMembershipOverrides), press teammate tier.

**Landmine (easy to reintroduce):** `setUserRole` → `syncUserMembership` DELETES every non-matching membership. NEVER call it to ADD a hat to an account that may already have hats — use `addMembership`. Paths reworked to be additive-on-existing: invite-create (existing+no-review → direct grant, no email), password invite-accept (existing email → `{existingAccount:true}`, NEVER accepts a new password — leaked-link takeover guard), OAuth invite-accept, partner-contacts add-admin, grant-admin-role, customer promote. Revoke drops only the god (super_admin/admin) membership via `removeMembership`, leaving partner hats + linked fan account intact.

**Why password-accept refuses a new password for an existing email:** the admin-login fallback accepts the linked fan password as a first factor (P2), so letting a leaked invite link set a password for an existing account = account takeover.
