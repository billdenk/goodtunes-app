---
name: OperatorShell sidebar is registry-driven
description: Partner-portal left-rail icons, section grouping, labels, and order all come from the registry — don't re-add per-portal nav config.
---

# OperatorShell sidebar = single source of truth (the registry)

The partner-portal left-rail (artist, label, manager, NPO, press, vendor/reseller/fulfillment, printer, publisher) renders from `client/src/components/operator/registry.ts` (`OPERATOR_MODULES` / `modulesForRole`). Each module row carries a required `icon: LucideIcon` and an optional `section?: OperatorSectionId`. `OperatorShell` reads `t.icon` / `t.section` off the tab objects at RUNTIME and draws collapsible sections (mirroring `AdminFrame`'s `Section`/`SidebarLink`), so the portals match the super-admin sidebar.

**Why:** the old design passed a per-portal `navIcons={{...}}` prop into `OperatorShell`, which drifted from the admin sidebar (wrong/missing icons, no section grouping, `text-sm` instead of admin's `text-[13.5px]`). Unifying on the registry means one place to change an icon/label/order/section for every hat.

**How to apply:**
- Add/relabel/reorder a portal nav row by editing `OPERATOR_MODULES` in the registry — NOT the portal page. Section members must sit contiguously right after their anchor row (the shell draws the whole `section` group at the first member it hits and skips the rest).
- Do NOT re-introduce a `navIcons` prop on `OperatorShell`; it was removed.
- Portal pages that cast `modulesForRole(...)` to `{id,label}[]` still keep `icon`/`section` at runtime (cast only drops them at the type level) — so a `.map(t => ({id,label}))` that rebuilds rows will STRIP the icon. Filter/spread the registry rows instead (see NonProfitDashboard gating `tree` on `caps.canViewTree`).
- `navExtras` link-outs still take their own `icon` and fall back to `Circle` in the shell.
- The rail uses `text-[13.5px]` to match `AdminFrame` SidebarLink; design-lint's `hardcoded-font-size` rule is baselined for that exact token (it's the intentional admin type scale), so accept it via `--update-baseline`, don't convert to `text-sm`.
