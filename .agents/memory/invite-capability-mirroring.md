---
name: Invite capability mirroring
description: How the admin Invites UI stays in lockstep with the server invite gate
---

The admin Invites surface (`client/src/pages/AdminInvites.tsx`) and the
Invites sidebar entry (`AdminFrame.tsx`) must render only what the caller
can actually send. Do NOT re-implement the carveouts in the client.

**Source of truth:** `computeInviteCapability(role, roleScopeId, canInviteSubusers)`
in `server/auth/partnerPermissions.ts` returns `{canInvite, allowedRoles, allowAdvanced}`,
mirroring the carveouts in the `POST /api/admin/invites` gate:
- super_admin → all roles + advanced power form
- artist+verb → [artist, non_profit]; label/manufacturer+verb → [artist, label]
- fulfillment/vendor/manager+verb → [own role] (grow own team)
- everyone else → canInvite:false

**Surfaced via** `GET /api/me/role` (the same endpoint the whole admin shell
reads), which adds `canInvite`, `allowedInviteRoles`, `allowAdvancedInvite`.

**Why:** the client previously queried a DEAD `/api/admin/me` route (404 →
its artist gate never fired). Standardize on `/api/me/role`.

**Critical detail:** the POST gate authorizes on the SCOPE-level
`getPartnerPermissions(role,scopeId).inviteSubusers` — it does NOT consult
per-user permission overrides. /api/me/role resolves the SAME scope-level
value, so press-staff per-user override quirks don't over-expose the form.

**Why non_profit can never invite:** `non_profit` is absent from
`PARTNER_SCOPE_KINDS`, so the gate (and computeInviteCapability) always
return canInvite:false for NPO callers (e.g. Andrew on Nightbirde NPO).
