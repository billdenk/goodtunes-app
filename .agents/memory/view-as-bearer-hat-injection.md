---
name: View-as hat must resolve bearer callers
description: X-View-As-Token injection in activeMembershipContext and why session-only checks silently drop the hat
---

The production view-as flow (ViewAsPartnerButton → mint → new tab `/portal#viewas=<token>`, header on every request) injects the partner hat in `activeMembershipContext`. The hat only activates when the **minting caller** can be identified.

**Rule:** resolve the caller via `getAuthFromRequest(req)` (session first, Bearer fallback, host/kind boundary enforced) and require `kind === "admin"`. Never check `req.session.userId` alone, and never accept a raw Bearer lookup without the host boundary.

**Why:** admin logins are frequently bearer-only (`#token-hash` login path stores the token in localStorage; over plain-http dev there is NO session cookie at all — express-session skips Set-Cookie when `cookie.secure` and the connection isn't). A session-only check silently drops the hat → `/api/me/role` returns super_admin → `/vendor`'s RoleRouter takes the super-admin branch and, with no `?scopeId`, bounces to the god-view vendors index. That looked like "old design still deployed" to the operator. A naive Bearer fallback (accept any admin-kind token) was review-flagged: it would activate view-as with an admin token on a customer host, violating the cross-kind boundary.

**How to apply:** any future code that needs "who is the real operator behind this request" (impersonation, audit attribution, minting) must go through `getAuthFromRequest`, not `req.session.userId`.

Also: `/vendor?tab=catalog` without `scopeId`+`scopeKind=manufacturer` is a dead link for super-admins (redirects to /admin/vendors). Correct god-view scope-pinned URL: `/vendor?scopeId=<pressId>&scopeKind=manufacturer&tab=catalog`.
