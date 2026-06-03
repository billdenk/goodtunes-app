---
name: Invite email send-site fan-out
description: Every place that sends the admin/partner invite email, so a signature/template change touches them all.
---

# Invite email fans out across 9 send sites

`sendAdminInviteEmail(...)` (server/mail.ts) is positional. Any change to its
signature or to the branded template must be threaded at **all** of these or
some invites silently drop the new behavior:

- **server/routes.ts** (5): create (`/api/admin/invites` POST), approve held
  invite, artist resend, label resend, super-admin resend.
- **server/npoPortal.ts** (2): NPO invite create + resend.
- **server/pressPortal.ts** (2): press invite create + resend.

The artist/label *create* paths forward into `/api/admin/invites`, so their
create branding is resolved inside that one handler — only their **resend**
endpoints live separately in routes.ts.

**Why:** the send sites grew per-portal; grep for `sendAdminInviteEmail(` to
enumerate them, never assume one call site.

## Branded-invite inviter identity
`resolveInviterBranding(userId)` (module-level in routes.ts) maps the
*inviter's own* role/scope → avatar + "on behalf of": artist→`people.photo_url`,
label→`labels.logo_url`, non_profit→`organizations.logo_url`+`name`,
operator→none. NPO/press portals resolve their own logo inline (org logo + org
name for NPO "on behalf of {org}!"; press `manufacturer.logoUrl`, no suffix).
Email builder escapes name/org, renders the avatar only for http(s) URLs, and
strips CRLF from the subject. Email HTML is not subject to design:lint.

**How to apply:** when adding a new invite channel or changing the template,
add the new send site to the list above and route its avatar/org through the
same helper or an inline equivalent.
