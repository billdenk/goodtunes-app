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

## Alpha-on-CSS-var renders nothing

`bg-[color:var(--brand-blue)]/NN` (or any `var(--brand-*)/NN` alpha) produces **no color** — Tailwind can't alpha a CSS var. On the old dark surfaces this was silently broken too. Use a `bg-blue-100`/`bg-blue-50` tint or a solid `var(--brand-blue)` fill instead. (See also `tailwind-var-opacity.md`.)
