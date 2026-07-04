---
name: Partner/operator portals are light-only (admin slate)
description: Invited-partner & operator portals follow the light admin theme, not the dark fan navy; canonical order-status pill colors and the alpha-on-var trap.
---

# Invited-partner / operator portals are LIGHT-ONLY (admin slate)

Every invited-partner / operator portal — Press, Vendor (Maker/Reseller), Artist, Label, Non-Profit, Manager, Publisher — plus their invite panels render in the **light admin (Stripe slate) theme**, NOT the dark fan navy `#00062B`. They are operator surfaces, light-only (not dual-theme). Mechanism: `OperatorShell` adds `body.gt-admin` for these paths, `client/src/main.tsx` first-paints `gt-admin` for the exact portal/`/invite` paths, and `scripts/design-lint.ts` `isInvitedPortal` exempts them from the fan-only text-tone rule. Full token vocabulary is in `docs/design-system.md` → "Invited-partner & operator portals are LIGHT-ONLY".

**Why:** Bill wants every partner portal to "look just like our admin." The portals were originally dark navy (copied from the fan player).

**How to apply:** New/edited partner-portal code uses slate tokens (page `bg-slate-50`, cards `bg-white ring-slate-200`, slate text scale), never `bg-[color:var(--brand-bg)]`/`text-white/NN`/`bg-white/NN` dark chrome.

## Canonical order-status pill = AdminCustomerDetail map (duplicated, keep in sync)

The order-status pill is **duplicated verbatim** as a local `StatusPill` in ArtistDashboard, ManagerDashboard, AND LabelDashboard. They must stay identical and match the admin canonical map in `client/src/pages/AdminCustomerDetail.tsx`:

- paid → emerald, shipped → **blue** (distinct from paid — in-transit, an operational signal; do NOT collapse both to emerald), refunded → rose, pending → amber, cancelled/fallback → slate.

**Why:** parallel subagents independently diverged here (one made shipped=emerald losing the paid/shipped distinction, another made pending=slate). The admin itself distinguishes paid(emerald) from shipped(blue), so that's the tiebreaker.

## OperatorShell leftnav must stay class-parity with AdminFrame's SidebarLink

The standalone portals (label/manager/non_profit/publisher) ride `OperatorShell layout="leftnav"`, but a partner reaches shared admin tools (Reports, album detail) through `AdminFrame`'s trimmed rail (`SidebarLink`). Both are 220px white columns, so the nav-item styling of OperatorShell's leftnav buttons/navExtras links must match SidebarLink's, or the partner sees a styling jump when they cross over. Treat the two as one visual system that must move together.

**Why:** the structural unification (shared leftnav) shipped first but left the two rails styled differently — OperatorShell's active item read gray + taller + heavier, SidebarLink's read brand-blue — a visible jump on Reports. This is the classic foot-gun for the planned shared nav-item primitive.

**How to apply:** Mirror SidebarLink's treatment, with two gotchas: (1) use the `text-sm` scale token rather than SidebarLink's grandfathered hardcoded ~13.5px size — the sub-pixel diff is imperceptible and a literal `text-[13.5px]` (even in a comment) trips design-lint's hardcoded-size rule. (2) Don't "fix" only OperatorShell's active background to a visible tint — SidebarLink's active bg is an alpha-on-var no-op (renders nothing, see trap below), so matching that no-op keeps both rails identical; changing one alone re-introduces the inconsistency.

## Press portal hides the OperatorShell content page-header identity

The press portal whitelabels its rail header with the press wordmark (navLogoUrl/logo + name, top-left, replacing the GoodTunes mark), so `OperatorShell`'s content page-header eyebrow + name would just repeat the press name. PressPortal passes `hideHeaderIdentity={!isSuperAdminView}` to suppress that band when the PRESS logs in; the super-admin operator-preview view KEEPS it so the "(super-admin view)" indicator stays visible. `hideHeaderIdentity` is leftnav-only and hides just the page-header identity (eyebrow/name/subtitle) — the band still renders if `headerExtras`/`headerActions` are present, and collapses entirely otherwise. Other portals don't pass it (default false), so they're unchanged.

**Why:** Bill — a press should see its name once (rail), not twice. The operator's own admin (AdminFrame) is untouched and keeps the GoodTunes logo top-left.

## The partner SalesMap is a light-only surface too (looks dark by its tokens)

`client/src/components/partner/SalesMap.tsx` ("Where your fans are buying" geo/choropleth) is rendered ONLY on the three light partner dashboards (Artist/Label/Manager), each inside a `bg-white ring-1 ring-slate-200` card. It was originally authored in dark fan tokens (`text-white`, `text-fan-*`, `bg-white/NN`, `ring-white/10`, `bg-[#0B1457]` table header, and a `shadeFor(0)` = near-white country fill) so it rendered **invisibly on the white card** — the symptom Bill reported as a mysterious "empty rectangle" (the map SVG's faint ring was the only thing showing). It is now light slate. Keep it light; don't reintroduce fan-navy tokens. The one intentional dark element is the floating hover tooltip (dark gradient bg + `text-white`).

**How to apply:** choropleth "no data" fill is dark-on-light (`rgba(15,23,42,0.06)`), path stroke `rgba(15,23,42,0.12)`, metric toggle = slate-100 track with a white selected pill. Empty-state message shows whenever `!loading && ranked.length === 0` (don't re-gate it behind a truthy `data`, or a zero-sales artist sees a blank right column).

## Alpha-on-CSS-var renders nothing

`bg-[color:var(--brand-blue)]/NN` (or any `var(--brand-*)/NN` alpha) produces **no color** — Tailwind can't alpha a CSS var. On the old dark surfaces this was silently broken too. Use a `bg-blue-100`/`bg-blue-50` tint or a solid `var(--brand-blue)` fill instead. (See also `tailwind-var-opacity.md`.)
