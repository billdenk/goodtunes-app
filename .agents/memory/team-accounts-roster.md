---
name: Team accounts roster
description: Account-centric partner roster (Partners → Team accounts) vs the invite-centric invite directory; where accepted invitees and directly-added admins surface.
---
- `/admin/team-accounts` (super_admin-only, GET /api/admin/team-accounts) lists EVERY signed-up partner account with scope attachments, sub-role, invite-vs-"added directly" provenance, last sign-in (MAX auth_tokens; session-only sign-ins show "—").
- **Why it exists:** accepted invitees otherwise only surface on the target person's Permissions tab; `/admin/invite-directory` is invite-centric and never shows accounts added via partner-contacts "Add Admin". Bill lost a manager-invite acceptee this way (July 2026).
- Data: raw SQL on users (role cols outside pgTable) + memberships w/ legacy synth fallback (no rows → synth from users.role/role_scope_id; 'team'→artist kind); multi-hat operators excluded membership-aware.
- Deliberately NOT in any App.tsx partner allowlist; nav item only in the main operator Partners section. Non-super operators hitting it get the 403 error state (same accepted pattern as invite-directory).
