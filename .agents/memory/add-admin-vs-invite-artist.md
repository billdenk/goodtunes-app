---
name: Add Admin vs Invite Artist are different endpoints
description: Why gating one partner-people action doesn't gate the other, and how press Staff stay artist-inviters without becoming admin-minters.
---
The partner People panel ("+ Add") fans two actions into TWO endpoints:
- **Add Admin** → `POST /api/admin/partner-contacts` (grants the partner-scoped admin role).
- **Invite Artist** → `POST /api/admin/invites` (mints an artist invite).

Both originally authorized on the same `invite_subusers` verb, so a single
verb cannot distinguish them.

**Rule:** Press (manufacturer) Staff must keep `invite_subusers` (they invite
artists), but must NOT be able to add admins (privilege escalation back to a
full press admin). Discriminate with `pressUserCanEdit(userId, pressId)` —
true for owner/admin, false for Staff (edit_metadata=false deny override).

**How to apply:**
- Server: partner-contacts gates its `manufacturer` branch on
  `pressUserCanEdit()` → 403 for Staff. Artist invites stay open.
- Probe `/api/admin/partner-contacts/can-invite` returns BOTH `ok`
  (invite_subusers → menu visibility / artist invites) and `canAddAdmins`
  (owner/admin → Add Admin item). For non-manufacturer kinds canAddAdmins==ok.
- Client: AddPeopleMenu/OrganizationPeople take a `canAddAdmins` prop that
  hides only the "Add Admin" item; the menu itself still shows for Staff.

**Why:** Code review flagged this exact escalation — Staff with invite_subusers
could POST partner-contacts and mint press admins. The fix had to preserve the
artist-invite path while closing the admin-add path.
