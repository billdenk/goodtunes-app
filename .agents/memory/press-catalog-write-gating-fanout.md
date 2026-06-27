---
name: Press catalog write-authorization fan-out
description: Where every press-catalog write gate lives, and why read-only Staff lockout must touch all of them plus one client flag.
---

# Press catalog write gating spans THREE server files + ONE client flag

Locking down "who can change a press's catalog/prices" (e.g. read-only Staff
teammates must stay view-only) is NOT a single chokepoint. The write routes are
split across three registration sites, each scoped only at the SCOPE level by
default (`requirePressScope` / membership), which lets any press member edit:

- `server/commerce.ts` — `requirePressEditor` middleware (calls `pressUserCanEdit`);
  gates `format-costs` PUT/DELETE and is threaded into `registerPressCatalogRoutes`.
- `server/pressCatalog.ts` — all catalog CRUD (formats, tiers, colors, jackets,
  ladder, csv/apply, hellbender pricing commit) take the `requirePressEditor` param.
  The catalog GET returns `{ ...catalog, canEdit }` (the universal client signal).
- `server/routes.ts` — `requirePressManager(req,res,pressId,{requireEdit})` guards
  template-specs PUT/DELETE, audio-spec PUT/DELETE, gooddeed-printing PUT. GET reads
  stay scope-only.

**Why:** the catalog UI is one shared `PressCatalogPanel` (rendered by both
AdminManufacturer god-view and PressPortal), but its write endpoints were authored
in three different modules over time. Gating only one file leaves the others open.

**How to apply:**
- `pressUserCanEdit(userId, pressId)` (server/auth/partnerPermissions.ts) is the
  canonical editor check: true for super_admin/admin + press Owner/Admin, false for
  Staff (edit_metadata=false override) and non-members.
- Reads stay scope-only; only writes get the editor check. The Staff 403 message:
  "Staff accounts can view the press and invite artists, but only an Owner/Admin can
  change the catalog or prices."
- Client: `PressCatalogPanel` derives `canEdit = data?.canEdit !== false` from the
  catalog GET (NOT /api/me/role — that has no per-press canEdit). Keep FormatDropdown
  OUTSIDE the disabled `<fieldset>` (Staff can still switch formats to view), wrap the
  editor block inside it. A native `<fieldset disabled>` also disables nested Radix
  triggers (buttons), so spec cards lock automatically.
