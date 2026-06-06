---
name: requireAdmin admits partner accounts
description: Why operator-only admin routes need an explicit getUserRole check on top of requireAdmin
---

`requireAdmin` only proves `isAdmin=true`, and partner accounts (artist / label / non_profit / manufacturer / fulfillment / vendor / manager) are ALSO `isAdmin=true` so they can reach the admin shell. So `requireAdmin` alone does NOT mean "GoodTunes operator".

**Why:** any admin route that mints a brand-new top-level row or performs a god-only action (e.g. duplicating an album into a fresh draft) is NOT a scoped partner edit and is NOT covered by the five partner-permission verbs. Without an explicit role check, a fully-permissioned partner (even with `edit_metadata`) can call it.

**How to apply:** after `requireAdmin`, resolve the role and gate operator-only:
```
const role = await getUserRole(req.session.userId!); // server/auth/roles.ts
const isOperator = role?.role === "super_admin" || role?.role === "admin";
if (!isOperator) return res.status(403).json({ message: "Only GoodTunes operators can …" });
```
This mirrors DELETE /api/admin/albums/:id. The matching admin UI must hide the affordance for partner roles too (AdminAlbum reads /api/me/role into `adminRoleInfo`; AdminAlbums does the same) — server stays authoritative, UI just avoids dangling a 403 button. Partner-permission verbs gate scoped EDITS; operator-only gates CREATES/god actions — different layers.
