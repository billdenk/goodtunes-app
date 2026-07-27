---
name: Team accounts roster
description: Account-centric partner roster (Partners → Team accounts) vs the invite-centric invite directory; where accepted invitees and directly-added admins surface.
---
- `/admin/team-accounts` (super_admin-only, GET /api/admin/team-accounts) lists EVERY signed-up partner account with scope attachments, sub-role, invite-vs-"added directly" provenance, last sign-in (MAX auth_tokens; session-only sign-ins show "—").
- **Why it exists:** accepted invitees otherwise only surface on the target person's Permissions tab; `/admin/invite-directory` is invite-centric and never shows accounts added via partner-contacts "Add Admin". Bill lost a manager-invite acceptee this way (July 2026).
- Data: raw SQL on users (role cols outside pgTable) + memberships w/ legacy synth fallback (no rows → synth from users.role/role_scope_id; 'team'→artist kind); multi-hat operators excluded membership-aware.
- Deliberately NOT in any App.tsx partner allowlist; nav item only in the main operator Partners section. Non-super operators hitting it get the 403 error state (same accepted pattern as invite-directory).

## Global ⌘K search integration (+ /api/admin/search hardening)
- The operator ⌘K search has a "Team accounts" group (email/username/display-name match) whose rows deep-link to `/admin/team-accounts?search=<email>`; the roster page hydrates its search box from that URL param (wouter useSearch, param removal clears the box).
- The group is super_admin-ONLY, mirroring the roster endpoint's gate. `/api/admin/search` responses are LRU-cached by query — the cache key MUST carry the caller's role class (`sa|`/`op|`) or a super_admin payload with team accounts would serve plain-admin callers. Any future role-dependent search group must respect this.
- `/api/admin/search` is now fail-closed to operators (super_admin/admin) inline: requireAdmin admits ALL partner accounts and denyAllReportingPartners only covers label/manager/non_profit, so artist/press/vendor tokens could previously reach the god-view search API directly (client never called it from portals). Only AdminSearchBar's default endpoint uses it; portals use scoped search.
- Scope-thumb chain: people picture col is `photoUrl`, org-ish scopes are `logoUrl` — any attachment/scope thumb mapping must check BOTH (regressed once: roster artist icons were blank gray dots while labels/managers worked; invite-directory's chain was already right). Pinned by a thumbUrl assertion in the roster db test.
